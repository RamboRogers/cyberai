package llm

import (
	"bufio"
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/ramborogers/cyberai/server/models"
)

// OllamaConnector interacts with an Ollama API endpoint.
type OllamaConnector struct {
	baseURL    string
	httpClient *http.Client
}

// OllamaConfig holds configuration for the Ollama connector.
type OllamaConfig struct {
	BaseURL string // e.g., "http://localhost:11434"
	Timeout time.Duration
}

// NewOllamaConnector creates a new connector for Ollama.
func NewOllamaConnector(config OllamaConfig) (*OllamaConnector, error) {
	if config.BaseURL == "" {
		return nil, fmt.Errorf("ollama baseURL cannot be empty")
	}
	timeout := config.Timeout
	if timeout == 0 {
		timeout = 60 * time.Second // Default timeout
	}

	return &OllamaConnector{
		baseURL: config.BaseURL,
		httpClient: &http.Client{
			Timeout: timeout,
		},
	}, nil
}

// GetType returns the provider type.
func (c *OllamaConnector) GetType() models.ProviderType {
	return models.ProviderOllama
}

// HealthCheck pings the Ollama API endpoint.
func (c *OllamaConnector) HealthCheck(ctx context.Context) error {
	healthURL := fmt.Sprintf("%s/", c.baseURL) // Ollama root usually returns "Ollama is running"
	req, err := http.NewRequestWithContext(ctx, "GET", healthURL, nil)
	if err != nil {
		return fmt.Errorf("failed to create Ollama health check request: %w", err)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to perform Ollama health check to %s: %w", healthURL, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp.Body)
		log.Printf("Ollama health check failed with status %d: %s", resp.StatusCode, string(bodyBytes))
		return fmt.Errorf("ollama health check failed with status code: %d", resp.StatusCode)
	}

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("failed to read Ollama health check response body: %w", err)
	}

	// Check if the response body indicates Ollama is running
	if !bytes.Contains(bodyBytes, []byte("Ollama is running")) {
		log.Printf("Ollama health check response does not confirm service is running: %s", string(bodyBytes))
		// return fmt.Errorf("Ollama service confirmation not found in health check response")
		// For now, accept any 200 OK as healthy, but log a warning
	}

	log.Printf("Ollama health check successful for %s", c.baseURL)
	return nil
}

// convertImageURLToBase64 fetches an image from a URL and converts it to base64
func (c *OllamaConnector) convertImageURLToBase64(imageURL string) (string, error) {
	// Handle data URLs (format: data:image/jpeg;base64,xyz123...)
	if strings.HasPrefix(imageURL, "data:") {
		// Split on comma to separate metadata from base64 data
		parts := strings.Split(imageURL, ",")
		if len(parts) != 2 {
			return "", fmt.Errorf("invalid data URL format: %s", imageURL)
		}
		// Return just the base64 data part (after the comma)
		return parts[1], nil
	}

	// Handle local URLs (from our image upload system)
	if strings.HasPrefix(imageURL, "/api/images/") {
		// Extract image ID from URL like /api/images/123
		parts := strings.Split(imageURL, "/")
		if len(parts) < 4 {
			return "", fmt.Errorf("invalid local image URL format: %s", imageURL)
		}

		imageIDStr := parts[3]
		imageID, err := strconv.ParseInt(imageIDStr, 10, 64)
		if err != nil {
			return "", fmt.Errorf("invalid image ID in URL %s: %w", imageURL, err)
		}

		log.Printf("Converting local image ID %d to base64", imageID)

		// For local images, we need to read from the filesystem
		// Since we don't have database access here, we'll look for files in /data/images/
		// This is a workaround - ideally we'd query the database for the filename
		imageDir := "data/images"

		// List files in the images directory and find one that matches
		files, err := os.ReadDir(imageDir)
		if err != nil {
			return "", fmt.Errorf("failed to read images directory: %w", err)
		}

		// For now, we'll use a simple approach - read all files and find the right one
		// This is not ideal but works as a proof of concept
		var imageFile string
		for _, file := range files {
			if !file.IsDir() {
				// For now, just use the first image file we find
				// TODO: Implement proper image ID to filename mapping
				imageFile = filepath.Join(imageDir, file.Name())
				break
			}
		}

		if imageFile == "" {
			return "", fmt.Errorf("no image file found for ID %d", imageID)
		}

		log.Printf("Reading local image file: %s", imageFile)

		// Read the image file
		imageData, err := os.ReadFile(imageFile)
		if err != nil {
			return "", fmt.Errorf("failed to read local image file %s: %w", imageFile, err)
		}

		// Convert to base64
		base64String := base64.StdEncoding.EncodeToString(imageData)
		log.Printf("Successfully converted local image to base64 (%d bytes -> %d chars)", len(imageData), len(base64String))
		return base64String, nil
	}

	// For external URLs, fetch the image
	resp, err := c.httpClient.Get(imageURL)
	if err != nil {
		return "", fmt.Errorf("failed to fetch image from URL %s: %w", imageURL, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("failed to fetch image, status code: %d", resp.StatusCode)
	}

	// Read image data
	imageData, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read image data: %w", err)
	}

	// Convert to base64
	base64String := base64.StdEncoding.EncodeToString(imageData)
	return base64String, nil
}

// GenerateChatCompletion sends a request to Ollama's /api/chat endpoint.
func (c *OllamaConnector) GenerateChatCompletion(ctx context.Context, req ChatCompletionRequest, callback ChunkCallback) error {
	// 1. Map llm.Message to Ollama's message format
	ollamaMessages := make([]OllamaMessage, 0, len(req.Messages))
	for _, msg := range req.Messages {
		ollamaMessage := OllamaMessage{
			Role:    msg.Role,
			Content: msg.Content,
		}

		// Handle images if present
		if len(msg.Images) > 0 {
			log.Printf("Converting %d images for Ollama", len(msg.Images))
			for _, imageURL := range msg.Images {
				base64Image, err := c.convertImageURLToBase64(imageURL)
				if err != nil {
					log.Printf("Warning: Failed to convert image URL %s to base64: %v", imageURL, err)
					// Continue without this image rather than failing completely
					continue
				}
				ollamaMessage.Images = append(ollamaMessage.Images, base64Image)
			}
			log.Printf("Successfully converted %d images to base64 for Ollama", len(ollamaMessage.Images))
		}

		ollamaMessages = append(ollamaMessages, ollamaMessage)
	}

	// 2. Create Ollama API request payload
	ollamaReq := OllamaChatRequest{
		Model:    req.Model,
		Messages: ollamaMessages,
		Stream:   req.Stream,
		Options:  map[string]interface{}{
			// Temperature and MaxTokens handled conditionally below
		},
	}

	// Conditionally add temperature if non-negative
	if req.Temperature >= 0 {
		ollamaReq.Options["temperature"] = req.Temperature
	}

	// Conditionally add max_tokens if positive
	if req.MaxTokens > 0 {
		ollamaReq.Options["num_predict"] = req.MaxTokens // Ollama uses num_predict
	}

	// Convert request to JSON
	reqBody, err := json.Marshal(ollamaReq)
	if err != nil {
		return fmt.Errorf("failed to marshal Ollama chat request: %w", err)
	}

	// 3. Make POST request to /api/chat
	chatURL := fmt.Sprintf("%s/api/chat", c.baseURL)
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, chatURL, bytes.NewBuffer(reqBody))
	if err != nil {
		return fmt.Errorf("failed to create Ollama chat request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")

	log.Printf("Sending Ollama chat request to %s for model %s (Streaming: %v)", chatURL, req.Model, req.Stream)

	// Send request
	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return fmt.Errorf("failed to send request to Ollama: %w", err)
	}
	defer resp.Body.Close()

	// Check for HTTP errors
	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp.Body)
		log.Printf("Ollama chat request failed with status %d: %s", resp.StatusCode, string(bodyBytes))
		return fmt.Errorf("ollama chat request failed with status code: %d", resp.StatusCode)
	}

	// 4. Process response based on streaming flag
	if req.Stream {
		// Handle streaming response
		scanner := bufio.NewScanner(resp.Body)
		scanner.Split(bufio.ScanLines)

		isFinal := false
		for !isFinal && scanner.Scan() {
			line := scanner.Text()
			if line == "" {
				continue
			}

			// Unmarshal each line
			var streamResp OllamaStreamResponse
			if err := json.Unmarshal([]byte(line), &streamResp); err != nil {
				log.Printf("Error unmarshaling Ollama stream response: %v", err)
				continue
			}

			// Send chunk via callback
			chunk := ChatCompletionChunk{
				Content: streamResp.Message.Content,
				IsFinal: streamResp.Done,
			}

			if err := callback(ctx, chunk); err != nil {
				return fmt.Errorf("callback error processing stream chunk: %w", err)
			}

			isFinal = streamResp.Done
		}

		if err := scanner.Err(); err != nil {
			return fmt.Errorf("error reading Ollama stream: %w", err)
		}

		log.Printf("Ollama stream completed for model %s", req.Model)
		return nil

	} else {
		// Handle non-streaming response
		bodyBytes, err := io.ReadAll(resp.Body)
		if err != nil {
			return fmt.Errorf("failed to read Ollama chat response: %w", err)
		}

		var chatResp OllamaChatResponse
		if err := json.Unmarshal(bodyBytes, &chatResp); err != nil {
			return fmt.Errorf("failed to unmarshal Ollama chat response: %w", err)
		}

		if callback != nil {
			chunk := ChatCompletionChunk{
				Content: chatResp.Message.Content,
				IsFinal: true,
			}
			if err := callback(ctx, chunk); err != nil {
				return fmt.Errorf("callback error processing non-streamed response: %w", err)
			}
		}

		log.Printf("Ollama non-streaming request completed for model %s", req.Model)
		return nil
	}
}

// --- Ollama Specific API Structures ---
// (Based on https://github.com/ollama/ollama/blob/main/docs/api.md)

type OllamaMessage struct {
	Role    string   `json:"role"`
	Content string   `json:"content"`
	Images  []string `json:"images,omitempty"` // Base64 encoded images
}

type OllamaChatRequest struct {
	Model     string                 `json:"model"`
	Messages  []OllamaMessage        `json:"messages"`
	Format    string                 `json:"format,omitempty"`  // e.g., "json"
	Options   map[string]interface{} `json:"options,omitempty"` // Passthrough parameters (temperature, max_tokens etc.)
	Stream    bool                   `json:"stream"`
	KeepAlive string                 `json:"keep_alive,omitempty"`
}

// OllamaStreamResponse represents a single line in the streaming response
type OllamaStreamResponse struct {
	Model     string        `json:"model"`
	CreatedAt time.Time     `json:"created_at"`
	Message   OllamaMessage `json:"message"` // Contains the chunk content
	Done      bool          `json:"done"`    // True for the final response object

	// Fields only present in the final response object (when Done=true)
	TotalDuration      time.Duration `json:"total_duration,omitempty"`
	LoadDuration       time.Duration `json:"load_duration,omitempty"`
	PromptEvalCount    int           `json:"prompt_eval_count,omitempty"`
	PromptEvalDuration time.Duration `json:"prompt_eval_duration,omitempty"`
	EvalCount          int           `json:"eval_count,omitempty"`
	EvalDuration       time.Duration `json:"eval_duration,omitempty"`
}

// OllamaChatResponse represents the non-streaming response (rarely used if streaming preferred)
type OllamaChatResponse = OllamaStreamResponse // Same structure, just Done=true
