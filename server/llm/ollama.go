package llm

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
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

// GenerateChatCompletion sends a request to Ollama's /api/chat endpoint.
func (c *OllamaConnector) GenerateChatCompletion(ctx context.Context, req ChatCompletionRequest, callback ChunkCallback) error {
	// 1. Map llm.Message to Ollama's message format
	ollamaMessages := make([]OllamaMessage, 0, len(req.Messages))
	for _, msg := range req.Messages {
		ollamaMessage := OllamaMessage{
			Role:    msg.Role,
			Content: msg.Content,
		}
		ollamaMessages = append(ollamaMessages, ollamaMessage)
	}

	// 2. Create Ollama API request payload
	chatReq := OllamaChatRequest{
		Model:    req.Model,
		Messages: ollamaMessages,
		Stream:   req.Stream,
		Options: map[string]interface{}{
			"temperature": req.Temperature,
		},
	}

	// Add max_tokens if specified
	if req.MaxTokens > 0 {
		chatReq.Options["num_predict"] = req.MaxTokens
	}

	// Convert request to JSON
	reqBody, err := json.Marshal(chatReq)
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
