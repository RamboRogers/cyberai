package llm

import (
	"context"
	"fmt"
	"log"
	"os"

	"encoding/base64"

	"github.com/ramborogers/cyberai/server/models"
)

// ChatContextService handles the building of context for LLM requests
type ChatContextService struct {
	chatService  *models.ChatService
	modelService *models.ModelService
	agentService *models.AgentService
	imageService *models.ImageService
	defaultLimit int // Maximum number of messages to include in context
}

// NewChatContextService creates a new ChatContextService
func NewChatContextService(
	chatService *models.ChatService,
	modelService *models.ModelService,
	agentService *models.AgentService,
	imageService *models.ImageService,
) *ChatContextService {
	return &ChatContextService{
		chatService:  chatService,
		modelService: modelService,
		agentService: agentService,
		imageService: imageService,
		defaultLimit: 20, // Default context window size
	}
}

// BuildContextForModelRequest retrieves chat history and formats it for LLM API request
// It creates a properly structured message array with:
// 1. System prompts (from model or agent)
// 2. Previous conversation messages in chronological order
// 3. The newest user message
func (s *ChatContextService) BuildContextForModelRequest(
	ctx context.Context,
	chatID int64,
	modelID int64,
	newMessageContent string,
	agentID *int64,
) ([]Message, error) {
	// 1. First get the model details to fetch system prompt and other settings
	model, err := s.modelService.GetModelByID(modelID)
	if err != nil {
		return nil, fmt.Errorf("failed to get model details: %w", err)
	}
	if model == nil {
		return nil, fmt.Errorf("model with ID %d not found", modelID)
	}

	// 2. Get message history with the specified limit
	log.Printf("[BuildContext] Attempting to fetch history for ChatID: %d (Limit: %d)", chatID, s.defaultLimit)
	messages, err := s.chatService.GetMessageHistory(chatID, s.defaultLimit)
	if err != nil {
		return nil, fmt.Errorf("failed to retrieve chat history: %w", err)
	}

	log.Printf("[Chat %d] Retrieved %d messages for context", chatID, len(messages))

	// --- Regeneration Context Handling ---
	originalMessageCount := len(messages)
	if newMessageContent != "" {
		// If newMessageContent is provided (likely from regeneration), find the
		// corresponding user message in history and truncate history after it.
		triggerIndex := -1
		for i := len(messages) - 1; i >= 0; i-- {
			if messages[i].Role == "user" && messages[i].Content == newMessageContent {
				triggerIndex = i
				break
			}
		}

		if triggerIndex != -1 {
			// Truncate messages to include only up to the found user message
			messages = messages[:triggerIndex+1]
			log.Printf("[Chat %d][RegenContext] Truncated history to %d messages ending at index %d.", chatID, len(messages), triggerIndex)
		} else {
			// This case should ideally not happen if RegenerateMessage found the triggering content.
			// Log a warning and proceed with the full fetched history.
			log.Printf("[Chat %d][RegenContext][Warn] Triggering message content not found in fetched history. Using full history (%d messages).", chatID, originalMessageCount)
		}
	}
	// --- End Regeneration Context Handling ---

	// 3. Create the messages array for the LLM
	llmMessages := make([]Message, 0, len(messages)+2) // +2 for system message and new user message

	// 4. Add system prompt if available from model
	if model.DefaultSystemPrompt != "" {
		llmMessages = append(llmMessages, Message{
			Role:    "system",
			Content: model.DefaultSystemPrompt,
		})
		log.Printf("[Chat %d] Added model system prompt to context", chatID)
	}

	// 5. Add agent system prompt if agent ID is provided
	if agentID != nil && *agentID > 0 {
		agent, err := s.agentService.GetAgent(*agentID)
		if err == nil && agent != nil && agent.SystemPrompt != "" {
			// If both model and agent prompts exist, agent takes precedence
			if len(llmMessages) > 0 && llmMessages[0].Role == "system" {
				llmMessages[0].Content = agent.SystemPrompt
				log.Printf("[Chat %d] Replaced with agent system prompt", chatID)
			} else {
				llmMessages = append(llmMessages, Message{
					Role:    "system",
					Content: agent.SystemPrompt,
				})
				log.Printf("[Chat %d] Added agent system prompt to context", chatID)
			}
		}
	}

	// 6. Add previous messages from history
	for _, msg := range messages {
		// Skip system messages in history if we already added a system message
		if msg.Role == "system" && len(llmMessages) > 0 && llmMessages[0].Role == "system" {
			continue
		}

		llmMessage := Message{
			Role:    msg.Role,
			Content: msg.Content,
		}

		// Handle images if present
		if len(msg.ImageIDs) > 0 {
			images, err := s.imageService.GetImagesByIDs(msg.ImageIDs)
			if err != nil {
				log.Printf("[Chat %d] Warning: Failed to fetch images for message %d: %v", chatID, msg.ID, err)
			} else {
				// Convert images to data URL format (compatible with both OpenAI and Ollama)
				for _, image := range images {
					imageDataURL, err := s.convertImageToDataURL(image)
					if err != nil {
						log.Printf("[Chat %d] Warning: Failed to convert image %d: %v", chatID, image.ID, err)
						continue
					}
					llmMessage.Images = append(llmMessage.Images, imageDataURL)
				}
				log.Printf("[Chat %d] Added %d images to message", chatID, len(llmMessage.Images))
			}
		}

		llmMessages = append(llmMessages, llmMessage)
	}

	// 7. Add the new user message (if provided and not already the last message in history)
	if newMessageContent != "" {
		addMesg := true
		if len(messages) > 0 {
			lastHistoryMsg := messages[len(messages)-1]
			if lastHistoryMsg.Role == "user" && lastHistoryMsg.Content == newMessageContent {
				addMesg = false
				log.Printf("[Chat %d] Skipping duplicate user message addition from newMessageContent", chatID)
			}
		}

		if addMesg {
			llmMessages = append(llmMessages, Message{
				Role:    "user",
				Content: newMessageContent,
			})
		}
	}

	log.Printf("[Chat %d] Built context with %d messages for LLM request", chatID, len(llmMessages))

	return llmMessages, nil
}

// SetContextWindowSize changes the maximum number of messages included in context
func (s *ChatContextService) SetContextWindowSize(limit int) {
	if limit > 0 {
		s.defaultLimit = limit
		log.Printf("Chat context window size set to %d messages", limit)
	}
}

// convertImageToDataURL converts an image to data URL format (compatible with both OpenAI and Ollama)
func (s *ChatContextService) convertImageToDataURL(image models.Image) (string, error) {
	// Read the image file and convert to base64
	imageData, err := os.ReadFile(image.FilePath)
	if err != nil {
		return "", fmt.Errorf("failed to read image file %s: %w", image.FilePath, err)
	}

	base64Data := base64.StdEncoding.EncodeToString(imageData)

	// Return data URL format that works with both OpenAI and Ollama
	// OpenAI uses this directly, Ollama converts it via convertImageURLToBase64
	dataURL := fmt.Sprintf("data:%s;base64,%s", image.ContentType, base64Data)

	return dataURL, nil
}
