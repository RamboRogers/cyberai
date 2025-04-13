package llm

import (
	"context"

	"github.com/ramborogers/cyberai/server/models"
)

// Message represents a single message in a conversation, suitable for API requests.
// We might use models.Message directly or adapt it if provider APIs differ significantly.
type Message struct {
	Role    string `json:"role"` // e.g., "system", "user", "assistant"
	Content string `json:"content"`
	// Add fields for images, tools later if needed
}

// ChatCompletionRequest encapsulates the data needed for a chat completion.
type ChatCompletionRequest struct {
	Model       string    `json:"model"`    // The provider-specific model ID (e.g., "llama3", "gpt-4o")
	Messages    []Message `json:"messages"` // Conversation history
	Temperature float64   `json:"temperature,omitempty"`
	MaxTokens   int       `json:"max_tokens,omitempty"` // Provider might have different ways to limit
	Stream      bool      `json:"stream"`               // Whether to stream the response
	// Add other common parameters like top_p, presence_penalty etc. if needed

	// Provider-specific options can be added here or handled internally by connectors
	// Options map[string]interface{} `json:"options,omitempty"`
}

// ChatCompletionChunk represents a single chunk received during streaming.
type ChatCompletionChunk struct {
	Content string `json:"content"`
	IsFinal bool   `json:"is_final,omitempty"` // Indicates the last chunk of the response
	// Include other stream info if provided by API (e.g., token counts, finish reason)
}

// ChunkCallback is a function type that processes incoming stream chunks.
// It returns an error to signal the stream processing should stop.
type ChunkCallback func(ctx context.Context, chunk ChatCompletionChunk) error

// ModelConnector defines the interface for interacting with different LLM providers.
type ModelConnector interface {
	// GenerateChatCompletion generates a response, optionally streaming chunks.
	// If req.Stream is true, chunks are sent via the callback.
	// If req.Stream is false, the callback is not used, and the full response is returned (if applicable, though streaming is preferred).
	GenerateChatCompletion(ctx context.Context, req ChatCompletionRequest, callback ChunkCallback) error

	// HealthCheck checks if the provider endpoint is reachable and potentially authenticated.
	HealthCheck(ctx context.Context) error

	// GetType returns the type of the connector (e.g., "ollama", "openai").
	GetType() models.ProviderType
}
