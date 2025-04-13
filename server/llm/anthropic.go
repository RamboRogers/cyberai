package llm

import (
	"context"
	"errors"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/anthropics/anthropic-sdk-go"
	"github.com/anthropics/anthropic-sdk-go/option"
	"github.com/ramborogers/cyberai/server/models"
)

// AnthropicConnector interacts with an Anthropic API endpoint.
type AnthropicConnector struct {
	client  anthropic.Client
	baseURL string
}

// AnthropicConfig holds configuration for the Anthropic connector.
type AnthropicConfig struct {
	APIKey  string
	BaseURL string // Optional: For custom endpoints
	Timeout time.Duration
}

// NewAnthropicConnector creates a new connector for Anthropic.
func NewAnthropicConnector(config AnthropicConfig) (*AnthropicConnector, error) {
	if config.APIKey == "" {
		return nil, fmt.Errorf("Anthropic APIKey cannot be empty")
	}

	options := []option.RequestOption{option.WithAPIKey(config.APIKey)}

	if config.BaseURL != "" {
		log.Printf("Using custom Anthropic Base URL: %s", config.BaseURL)
		options = append(options, option.WithBaseURL(config.BaseURL))
	}

	if config.Timeout > 0 {
		options = append(options, option.WithRequestTimeout(config.Timeout))
		log.Printf("Setting Anthropic request timeout: %v", config.Timeout)
	}

	client := anthropic.NewClient(options...)

	return &AnthropicConnector{
		client:  client,
		baseURL: config.BaseURL,
	}, nil
}

// GetType returns the provider type.
func (c *AnthropicConnector) GetType() models.ProviderType {
	return models.ProviderAnthropic
}

// HealthCheck attempts to call models API as a basic connectivity and auth check.
func (c *AnthropicConnector) HealthCheck(ctx context.Context) error {
	log.Println("Attempting Anthropic health check (Messages)...")

	// Create a minimal Messages request to check connectivity
	_, err := c.client.Messages.New(
		ctx,
		anthropic.MessageNewParams{
			Model:     "claude-3-sonnet-20240229",
			MaxTokens: 1,
			Messages: []anthropic.MessageParam{{
				Role: anthropic.MessageParamRoleUser,
				Content: []anthropic.ContentBlockParamUnion{{
					OfRequestTextBlock: &anthropic.TextBlockParam{Text: "Hello"},
				}},
			}},
		},
	)

	if err != nil {
		log.Printf("Anthropic health check failed: %v", err)

		// Check for auth errors based on error message content
		if strings.Contains(err.Error(), "401") || strings.Contains(err.Error(), "403") {
			return fmt.Errorf("Anthropic authentication failed (check API key): %w", err)
		}

		return fmt.Errorf("Anthropic health check failed: %w", err)
	}

	log.Printf("Anthropic health check successful for %s", c.baseURL)
	return nil
}

// GenerateChatCompletion sends a request to the Anthropic API.
func (c *AnthropicConnector) GenerateChatCompletion(ctx context.Context, req ChatCompletionRequest, callback ChunkCallback) error {
	// Map llm.Message to anthropic.MessageParam
	anthropicMessages := make([]anthropic.MessageParam, 0, len(req.Messages))

	// Store system prompt to handle separately (Anthropic puts this in params, not as a message)
	var systemPrompt string

	// Process messages
	for _, msg := range req.Messages {
		switch msg.Role {
		case "system":
			systemPrompt = msg.Content
		case "user", "assistant":
			// Convert message to Anthropic's format
			content := []anthropic.ContentBlockParamUnion{{
				OfRequestTextBlock: &anthropic.TextBlockParam{Text: msg.Content},
			}}

			anthropicRole := anthropic.MessageParamRoleUser
			if msg.Role == "assistant" {
				anthropicRole = anthropic.MessageParamRoleAssistant
			}

			anthropicMessages = append(anthropicMessages, anthropic.MessageParam{
				Role:    anthropicRole,
				Content: content,
			})
		default:
			return fmt.Errorf("invalid message role for Anthropic: %s", msg.Role)
		}
	}

	log.Printf("Anthropic GenerateChatCompletion called for model %s (Streaming: %v)", req.Model, req.Stream)

	// Create Anthropic API request params
	params := anthropic.MessageNewParams{
		Model:     anthropic.Model(req.Model),
		MaxTokens: int64(req.MaxTokens),
		Messages:  anthropicMessages,
	}

	// Add system prompt if present
	if systemPrompt != "" {
		// Create a text block param for the system message
		textBlock := anthropic.TextBlockParam{Text: systemPrompt}
		params.System = []anthropic.TextBlockParam{textBlock}
	}

	// Set temperature if provided
	if req.Temperature > 0 {
		// Use the Float helper function to create an Opt[float64]
		params.Temperature = anthropic.Float(req.Temperature)
	}

	// Handle streaming vs non-streaming
	if req.Stream {
		stream := c.client.Messages.NewStreaming(ctx, params)
		if stream.Err() != nil {
			return fmt.Errorf("failed to create Anthropic streaming request: %w", stream.Err())
		}

		defer stream.Close()

		for stream.Next() {
			delta := stream.Current()

			if len(delta.Delta.Text) > 0 {
				chunk := ChatCompletionChunk{
					Content: delta.Delta.Text,
					IsFinal: false,
				}

				if err := callback(ctx, chunk); err != nil {
					return fmt.Errorf("callback error processing stream chunk: %w", err)
				}
			}
		}

		// Check if the stream ended due to an error
		if err := stream.Err(); err != nil {
			if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
				return err // Return context errors directly
			}
			return fmt.Errorf("error in Anthropic stream: %w", err)
		}

		// Signal end of stream
		if callback != nil {
			finalChunk := ChatCompletionChunk{
				Content: "",
				IsFinal: true,
			}
			if err := callback(ctx, finalChunk); err != nil {
				return fmt.Errorf("callback error processing final chunk: %w", err)
			}
		}

		log.Printf("Anthropic stream finished for model %s", req.Model)
		return nil
	} else {
		// Non-streaming request
		resp, err := c.client.Messages.New(ctx, params)
		if err != nil {
			return fmt.Errorf("failed to create Anthropic chat completion: %w", err)
		}

		// Extract text content from response
		content := ""
		if len(resp.Content) > 0 {
			// Get text from the first text block
			for _, block := range resp.Content {
				if block.Type == "text" {
					content = block.Text
					break
				}
			}
		}

		if callback != nil {
			chunk := ChatCompletionChunk{
				Content: content,
				IsFinal: true,
			}
			if err := callback(ctx, chunk); err != nil {
				return fmt.Errorf("callback error processing non-streamed response: %w", err)
			}
		}

		return nil
	}
}
