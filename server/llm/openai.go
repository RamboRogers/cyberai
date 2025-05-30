package llm

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	openai "github.com/openai/openai-go"
	"github.com/openai/openai-go/option"

	// Assuming internal/apierr might be needed for error checking, or maybe just check status code
	// "github.com/openai/openai-go/internal/apierr"
	"github.com/ramborogers/cyberai/server/models"
)

// OpenAIConnector interacts with an OpenAI API endpoint.
type OpenAIConnector struct {
	client  openai.Client // Changed to value type based on linter error
	baseURL string
}

// OpenAIConfig holds configuration for the OpenAI connector.
type OpenAIConfig struct {
	APIKey  string
	BaseURL string // Optional: For Azure or other compatible endpoints
	Timeout time.Duration
}

// NewOpenAIConnector creates a new connector for OpenAI.
func NewOpenAIConnector(config OpenAIConfig) (*OpenAIConnector, error) {
	if config.APIKey == "" {
		return nil, fmt.Errorf("OpenAI APIKey cannot be empty")
	}

	options := []option.RequestOption{option.WithAPIKey(config.APIKey)}

	baseURL := "https://api.openai.com/v1" // Default

	if config.BaseURL != "" {
		log.Printf("Using custom OpenAI Base URL: %s", config.BaseURL)
		// Assuming option.WithBaseURL exists based on Azure example structure
		options = append(options, option.WithBaseURL(config.BaseURL))
		baseURL = config.BaseURL
	}

	if config.Timeout > 0 {
		httpClient := &http.Client{Timeout: config.Timeout}
		// Assuming option.WithHTTPClient exists
		options = append(options, option.WithHTTPClient(httpClient))
		log.Printf("Setting OpenAI HTTP client timeout: %v", config.Timeout)
	}

	// NewClient returns openai.Client (value type)
	client := openai.NewClient(options...)

	return &OpenAIConnector{
		client:  client, // Assign the value directly
		baseURL: baseURL,
	}, nil
}

// GetType returns the provider type.
func (c *OpenAIConnector) GetType() models.ProviderType {
	return models.ProviderOpenAI
}

// HealthCheck attempts to list available models as a basic connectivity and auth check.
func (c *OpenAIConnector) HealthCheck(ctx context.Context) error {
	// Special case for Anthropic API - they don't support the /models endpoint via OpenAI compatibility
	if strings.Contains(c.baseURL, "api.anthropic.com") {
		log.Println("Attempting Anthropic OpenAI-compatible API health check (chat completion)...")

		// For Anthropic, we'll do a simple chat completion request as a health check
		// using one of their standard models
		testMsg := openai.UserMessage("Hello")
		req := openai.ChatCompletionNewParams{
			Model:     "claude-3-sonnet-20240229", // Use a standard Claude model
			Messages:  []openai.ChatCompletionMessageParamUnion{testMsg},
			MaxTokens: openai.Int(5), // Just need a minimal response
		}

		_, err := c.client.Chat.Completions.New(ctx, req)
		if err != nil {
			log.Printf("Anthropic OpenAI-compatible API health check failed: %v", err)

			if strings.Contains(err.Error(), "401") {
				return fmt.Errorf("Anthropic authentication failed (check API key): %w", err)
			}

			return fmt.Errorf("Anthropic health check failed: %w", err)
		}

		log.Printf("Anthropic OpenAI-compatible API health check successful for %s", c.baseURL)
		return nil
	}

	// Standard OpenAI model listing for health check
	log.Println("Attempting OpenAI health check (ListModels)...")
	_, err := c.client.Models.List(ctx)
	if err != nil {
		log.Printf("OpenAI health check (ListModels) failed: %v", err)

		// Attempt to check for standard HTTP status code errors if possible
		var httpErr interface {
			StatusCode() int
		}
		if errors.As(err, &httpErr) {
			if httpErr.StatusCode() == http.StatusUnauthorized {
				return fmt.Errorf("OpenAI authentication failed (401): %w", err)
			}
		} else if strings.Contains(err.Error(), "401") { // Fallback string check
			return fmt.Errorf("OpenAI authentication failed (check API key): %w", err)
		}

		return fmt.Errorf("OpenAI health check failed: %w", err)
	}
	log.Printf("OpenAI health check successful for %s", c.baseURL)
	return nil
}

// GenerateChatCompletion sends a request to the OpenAI Chat Completions API.
func (c *OpenAIConnector) GenerateChatCompletion(ctx context.Context, req ChatCompletionRequest, callback ChunkCallback) error {
	// 1. Map llm.Message to openai.ChatCompletionMessageParamUnion
	// Using the correct union type and helper functions
	openaiMessages := make([]openai.ChatCompletionMessageParamUnion, len(req.Messages))
	for i, msg := range req.Messages {
		switch strings.ToLower(msg.Role) {
		case "user":
			if len(msg.Images) > 0 {
				// Create user message with images using correct vision API format
				content := []openai.ChatCompletionContentPartUnionParam{
					openai.TextContentPart(msg.Content),
				}
				// Add image parts using proper vision API format
				for _, imageURL := range msg.Images {
					imagePart := openai.ImageContentPart(openai.ChatCompletionContentPartImageImageURLParam{
						URL:    imageURL,
						Detail: "auto", // auto, low, or high
					})
					content = append(content, imagePart)
				}
				openaiMessages[i] = openai.UserMessage(content)
			} else {
				openaiMessages[i] = openai.UserMessage(msg.Content)
			}
		case "assistant":
			openaiMessages[i] = openai.AssistantMessage(msg.Content)
		case "system":
			openaiMessages[i] = openai.SystemMessage(msg.Content)
		default:
			return fmt.Errorf("invalid message role: %s", msg.Role)
		}
	}

	// 2. Create OpenAI API request payload
	openaiReq := openai.ChatCompletionNewParams{
		Model:     req.Model,
		Messages:  openaiMessages,
		MaxTokens: openai.Int(int64(req.MaxTokens)),
	}

	// Conditionally add Temperature only if non-negative
	if req.Temperature >= 0 { // Use the negative value convention
		openaiReq.Temperature = openai.Float(float64(req.Temperature))
	}

	// 3. Handle Streaming or Full Response
	if req.Stream {
		// Use NewStreaming method for streaming
		stream := c.client.Chat.Completions.NewStreaming(ctx, openaiReq)
		if stream.Err() != nil {
			return fmt.Errorf("failed to create OpenAI chat completion stream: %w", stream.Err())
		}
		defer stream.Close()

		log.Printf("OpenAI stream created for model %s", req.Model)

		// Using Next() and Current() methods from ssestream.Stream
		for stream.Next() {
			response := stream.Current()

			if len(response.Choices) > 0 {
				chunkContent := response.Choices[0].Delta.Content
				if chunkContent != "" {
					chunk := ChatCompletionChunk{
						Content: chunkContent,
						// IsFinal can be determined by response.Choices[0].FinishReason
					}
					if err := callback(ctx, chunk); err != nil {
						return fmt.Errorf("callback error processing stream chunk: %w", err)
					}
				}
			}
		}

		// Check if the stream ended due to an error
		if err := stream.Err(); err != nil {
			if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
				return err // Return context errors directly
			}
			return fmt.Errorf("error in OpenAI stream: %w", err)
		}

		log.Printf("OpenAI stream finished for model %s", req.Model)
		return nil // Stream finished successfully
	} else {
		// Non-streaming request
		// Use New method for non-streaming
		resp, err := c.client.Chat.Completions.New(ctx, openaiReq)
		if err != nil {
			return fmt.Errorf("failed to create OpenAI chat completion: %w", err)
		}

		if len(resp.Choices) > 0 {
			fullContent := resp.Choices[0].Message.Content
			if callback != nil {
				chunk := ChatCompletionChunk{
					Content: fullContent,
					IsFinal: true,
				}
				if err := callback(ctx, chunk); err != nil {
					return fmt.Errorf("callback error processing non-streamed response: %w", err)
				}
			}
			return nil
		} else {
			return fmt.Errorf("OpenAI completion returned no choices")
		}
	}
}
