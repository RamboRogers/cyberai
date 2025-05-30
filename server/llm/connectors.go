package llm

import (
	"context"
	"errors"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/ramborogers/cyberai/server/models"
	"github.com/ramborogers/cyberai/server/ws"
)

// Message represents a single message in a conversation, suitable for API requests.
// We might use models.Message directly or adapt it if provider APIs differ significantly.
type Message struct {
	Role    string   `json:"role"` // e.g., "system", "user", "assistant"
	Content string   `json:"content"`
	Images  []string `json:"images,omitempty"` // Base64 encoded images or URLs
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

type ConnectorService struct {
	modelService       *models.ModelService
	providerService    *models.ProviderService
	chatService        *models.ChatService
	wsHub              *ws.Hub
	chatContextService *ChatContextService
}

func NewConnectorService(ms *models.ModelService, ps *models.ProviderService, cs *models.ChatService, as *models.AgentService, is *models.ImageService, hub *ws.Hub) *ConnectorService {
	contextSvc := NewChatContextService(cs, ms, as, is)
	return &ConnectorService{
		modelService:       ms,
		providerService:    ps,
		chatService:        cs,
		wsHub:              hub,
		chatContextService: contextSvc,
	}
}

// GetConnectorForModel retrieves the appropriate connector for a given model ID.
func (cs *ConnectorService) GetConnectorForModel(ctx context.Context, modelID int64) (ModelConnector, *models.LLMModel, error) {
	model, err := cs.modelService.GetModelByID(modelID)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to get model details: %w", err)
	}
	if model == nil {
		return nil, nil, fmt.Errorf("model not found: %d", modelID)
	}

	// Use GetProviderByIDWithKey to ensure the API key is retrieved
	provider, err := cs.providerService.GetProviderByIDWithKey(model.ProviderID)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to get provider details (with key) for model %d: %w", modelID, err)
	}
	if provider == nil {
		return nil, nil, fmt.Errorf("provider not found for model %d", modelID)
	}

	// Add logic to instantiate the correct connector based on provider.Type
	switch provider.Type {
	case models.ProviderOllama:
		cfg := OllamaConfig{
			BaseURL: provider.BaseURL, // Direct string assignment
			// Timeout: 0, // Use default in constructor
		}
		conn, err := NewOllamaConnector(cfg)
		if err != nil {
			return nil, nil, fmt.Errorf("failed to create Ollama connector: %w", err)
		}
		return conn, model, nil
	case models.ProviderOpenAI:
		cfg := OpenAIConfig{
			BaseURL: provider.BaseURL, // Direct string assignment
			APIKey:  provider.APIKey,  // Direct string assignment
			// Timeout: 0, // Use default in constructor
		}
		conn, err := NewOpenAIConnector(cfg)
		if err != nil {
			return nil, nil, fmt.Errorf("failed to create OpenAI connector: %w", err)
		}
		return conn, model, nil
	default:
		return nil, nil, fmt.Errorf("unsupported provider type: %s", provider.Type)
	}
}

// GetChatContextService returns the internal ChatContextService.
func (cs *ConnectorService) GetChatContextService() *ChatContextService {
	return cs.chatContextService
}

// --- Moved WebSocket Helper Methods ---

// SendWsMessage is a helper to send a structured message to a user via WebSocket
func (cs *ConnectorService) SendWsMessage(userID int, msg ws.Message) {
	if cs.wsHub == nil {
		log.Println("Error: WebSocket Hub is nil in ConnectorService")
		return
	}
	if msg.Timestamp.IsZero() {
		msg.Timestamp = time.Now()
	}
	cs.wsHub.SendToUser(int64(userID), msg)
}

// SendWsError is a helper to send a structured error message to a user via WebSocket
func (cs *ConnectorService) SendWsError(userID int, chatID int64, errorMsg string) {
	chatIDPtr := chatID
	cs.SendWsMessage(userID, ws.Message{
		Type: ws.MsgTypeError,
		ErrorPayload: &ws.ErrorPayload{
			Message: errorMsg,
			ChatID:  &chatIDPtr,
		},
	})
}

// --- Moved Core Generation Logic ---

// cleanAssistantResponse removes unwanted prefixes from the raw LLM response.
func cleanAssistantResponse(rawResponse string) string {
	// Implement cleaning logic as before (or potentially refine it)
	prefix := "⚙️ AI Thinking Process"
	if strings.HasPrefix(rawResponse, prefix) {
		// Find the end of the thinking block (assuming double newline separation)
		endOfPrefix := strings.Index(rawResponse, "\n\n")
		if endOfPrefix != -1 {
			cleaned := rawResponse[endOfPrefix+2:]
			return strings.TrimSpace(cleaned)
		}
		endOfPrefixLine := strings.Index(rawResponse, "\n")
		if endOfPrefixLine != -1 && endOfPrefixLine > len(prefix) {
			cleaned := rawResponse[endOfPrefixLine+1:]
			return strings.TrimSpace(cleaned)
		}
		return strings.TrimSpace(strings.TrimPrefix(rawResponse, prefix))
	}
	return rawResponse // Return original if prefix not found
}

// generateAndStreamResponse is the core logic for calling the LLM and streaming results.
// It takes the prepared message history (including system prompts) and handles connector fetching,
// API calls, streaming via WebSocket, and saving the final assistant message.
// Returns the final assistant message ID and error.
func (cs *ConnectorService) generateAndStreamResponse(ctx context.Context, userID int, chatID int64, modelIDToUse int64, history []models.Message, agentID *int64) (int64, error) {
	log.Printf("[Chat %d] ConnectorService.generateAndStreamResponse called with model %d", chatID, modelIDToUse)

	connector, model, err := cs.GetConnectorForModel(ctx, modelIDToUse)
	if err != nil {
		errMsg := fmt.Sprintf("Failed to get model configuration: %v", err)
		log.Printf("[Chat %d] Error getting connector for model %d: %v", chatID, modelIDToUse, err)
		cs.SendWsError(userID, chatID, errMsg)
		return 0, errors.New(errMsg)
	}
	log.Printf("[Chat %d] Using model %s (%s) via %s connector for generation", chatID, model.Name, model.ModelID, model.Provider.Type)

	llmMessages, err := cs.chatContextService.BuildContextForModelRequest(
		ctx,
		chatID,
		modelIDToUse,
		"", // Triggering message content is part of history now
		agentID,
	)
	if err != nil {
		errMsg := fmt.Sprintf("Failed to build context for model: %v", err)
		log.Printf("[Chat %d] Error building context: %v", chatID, err)
		cs.SendWsError(userID, chatID, errMsg)
		return 0, errors.New(errMsg)
	}

	llmReq := ChatCompletionRequest{
		Model:       model.ModelID,
		Messages:    llmMessages,
		Temperature: model.Temperature,
		MaxTokens:   model.MaxTokens,
		Stream:      true,
	}

	var responseContent strings.Builder
	var assistantMsgID int64
	firstChunk := true

	callback := func(cbCtx context.Context, chunk ChatCompletionChunk) error {
		if cbCtx.Err() != nil {
			log.Printf("[Chat %d] Context cancelled during streaming callback.", chatID)
			return cbCtx.Err()
		}

		responseContent.WriteString(chunk.Content)

		if firstChunk && chunk.Content != "" {
			assistantMessage := models.Message{
				ChatID:     chatID,
				UserID:     0,
				Role:       "assistant",
				Content:    "",
				ModelID:    &modelIDToUse,
				AgentID:    agentID,
				TokensUsed: 0,
			}
			if err := cs.chatService.AddMessage(&assistantMessage); err != nil {
				log.Printf("[Chat %d] Error creating initial assistant message entry: %v", chatID, err)
				return fmt.Errorf("failed to save initial assistant message: %w", err)
			}
			assistantMsgID = assistantMessage.ID
			firstChunk = false
			log.Printf("[Chat %d] Created initial assistant message DB entry (ID: %d)", chatID, assistantMsgID)
		}

		if chunk.Content != "" || chunk.IsFinal {
			payload := ws.ChunkPayload{
				ChatID:  chatID,
				Content: chunk.Content,
				IsFinal: chunk.IsFinal,
			}
			if assistantMsgID != 0 {
				payload.MessageID = &assistantMsgID
			}
			modelIDCopy := modelIDToUse
			payload.ModelID = &modelIDCopy

			wsMsg := ws.Message{
				Type:         ws.MsgTypeAssistantChunk,
				Timestamp:    time.Now(),
				ChunkPayload: &payload,
			}
			cs.SendWsMessage(userID, wsMsg)
		}

		return nil
	}

	cs.SendWsMessage(userID, ws.Message{
		Type: "status",
		Data: map[string]interface{}{"message": "Generating response...", "chat_id": chatID},
	})

	err = connector.GenerateChatCompletion(ctx, llmReq, callback)

	if err != nil {
		errMsg := fmt.Sprintf("Error generating response with model ID %d: %v", modelIDToUse, err)
		log.Printf("[Chat %d] Error generating chat completion: %v", chatID, err)
		cs.SendWsError(userID, chatID, errMsg)
		if assistantMsgID != 0 {
			log.Printf("[Chat %d] Potentially incomplete assistant message (ID: %d) due to error.", chatID, assistantMsgID)
		}
		return assistantMsgID, errors.New(errMsg)
	}

	if assistantMsgID != 0 {
		finalContent := responseContent.String()
		cleanedContent := cleanAssistantResponse(finalContent)
		tokens := len(cleanedContent)

		updateErr := cs.chatService.UpdateMessageContentAndTokens(assistantMsgID, cleanedContent, tokens)
		if updateErr != nil {
			log.Printf("[Chat %d] Error updating final assistant message %d content/tokens: %v", chatID, assistantMsgID, updateErr)
		} else {
			log.Printf("[Chat %d] Successfully updated final assistant message %d", chatID, assistantMsgID)

			wsMsgPayload := ws.MessagePayload{
				ID:         assistantMsgID,
				ChatID:     chatID,
				UserID:     0,
				Role:       "assistant",
				Content:    cleanedContent,
				ModelID:    &modelIDToUse,
				AgentID:    agentID,
				TokensUsed: tokens,
				ImageIDs:   []int64{}, // Assistant messages don't have images
				CreatedAt:  time.Now(),
			}
			cs.SendWsMessage(userID, ws.Message{
				Type:           ws.MsgTypeAssistantMessage,
				MessagePayload: &wsMsgPayload,
			})
			log.Printf("[Chat %d] Sent final assistant_message WS update for message %d", chatID, assistantMsgID)
		}
	} else if responseContent.Len() > 0 {
		log.Printf("[Chat %d] Stream finished with content, but no assistant message DB entry was created. Saving now.", chatID)
		finalContent := responseContent.String()
		cleanedContent := cleanAssistantResponse(finalContent)
		tokens := len(cleanedContent)
		assistantMessage := models.Message{
			ChatID:     chatID,
			UserID:     0,
			Role:       "assistant",
			Content:    cleanedContent,
			ModelID:    &modelIDToUse,
			AgentID:    agentID,
			TokensUsed: tokens,
		}
		if err := cs.chatService.AddMessage(&assistantMessage); err != nil {
			log.Printf("[Chat %d] Error saving final assistant message after stream completion: %v", chatID, err)
			cs.SendWsError(userID, chatID, "Failed to save final assistant message after streaming.")
			return 0, fmt.Errorf("failed to save final assistant message: %w", err)
		} else {
			assistantMsgID = assistantMessage.ID
			log.Printf("[Chat %d] Successfully saved final assistant message %d after streaming.", chatID, assistantMsgID)
			wsMsgPayload := ws.MessagePayload{
				ID:         assistantMsgID,
				ChatID:     chatID,
				UserID:     0,
				Role:       "assistant",
				Content:    cleanedContent,
				ModelID:    &modelIDToUse,
				AgentID:    agentID,
				TokensUsed: tokens,
				ImageIDs:   assistantMessage.ImageIDs,
				CreatedAt:  time.Now(),
			}
			cs.SendWsMessage(userID, ws.Message{
				Type:           ws.MsgTypeAssistantMessage,
				MessagePayload: &wsMsgPayload,
			})
			log.Printf("[Chat %d] Sent final assistant_message WS update for message %d", chatID, assistantMsgID)
		}
	} else {
		log.Printf("[Chat %d] AI response stream finished with no content.", chatID)
	}

	log.Printf("[Chat %d] ConnectorService.generateAndStreamResponse finished successfully. Final msg ID: %d", chatID, assistantMsgID)
	return assistantMsgID, nil
}

// GenerateResponseForChat is the main entry point for generating a response in a chat context.
func (cs *ConnectorService) GenerateResponseForChat(ctx context.Context, userID int, chatID int64, modelID int64, agentID *int64) error {
	return cs.GenerateResponseForChatWithImages(ctx, userID, chatID, modelID, agentID, nil)
}

// GenerateResponseForChatWithImages generates an AI response for a chat with optional image attachments
func (cs *ConnectorService) GenerateResponseForChatWithImages(ctx context.Context, userID int, chatID int64, modelID int64, agentID *int64, imageURLs []string) error {
	log.Printf("[Chat %d] Starting AI response processing for model %d (User ID: %d)", chatID, modelID, userID)

	cs.SendWsMessage(userID, ws.Message{
		Type: "status",
		Data: map[string]interface{}{"message": "Processing...", "chat_id": chatID},
	})

	historyLimit := 20 // Or get from config/model settings
	history, err := cs.chatService.GetMessageHistory(chatID, historyLimit)
	if err != nil {
		log.Printf("[Chat %d] Error getting message history: %v", chatID, err)
		cs.SendWsError(userID, chatID, fmt.Sprintf("Failed to retrieve conversation history: %v", err))
		return err
	}

	// Add images to the most recent user message if provided
	if len(imageURLs) > 0 && len(history) > 0 {
		// Find the most recent user message and add images to it
		for i := len(history) - 1; i >= 0; i-- {
			if history[i].Role == "user" {
				log.Printf("[Chat %d] Adding %d images to most recent user message", chatID, len(imageURLs))
				// Convert to LLM Message format and add images
				break
			}
		}
	}

	_, err = cs.generateAndStreamResponse(ctx, userID, chatID, modelID, history, agentID)
	if err != nil {
		log.Printf("[Chat %d] GenerateResponseForChatWithImages finished with error: %v", chatID, err)
		return err
	} else {
		log.Printf("[Chat %d] GenerateResponseForChatWithImages finished successfully.", chatID)
		return nil
	}
}
