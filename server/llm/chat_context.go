package llm

import (
	"context"
	"fmt"
	"log"

	"github.com/ramborogers/cyberai/server/models"
)

// ChatContextService handles the building of context for LLM requests
type ChatContextService struct {
	chatService  *models.ChatService
	modelService *models.ModelService
	agentService *models.AgentService
	defaultLimit int // Maximum number of messages to include in context
}

// NewChatContextService creates a new ChatContextService
func NewChatContextService(
	chatService *models.ChatService,
	modelService *models.ModelService,
	agentService *models.AgentService,
) *ChatContextService {
	return &ChatContextService{
		chatService:  chatService,
		modelService: modelService,
		agentService: agentService,
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

		llmMessages = append(llmMessages, Message{
			Role:    msg.Role,
			Content: msg.Content,
		})
	}

	// 7. Add the new user message
	if newMessageContent != "" {
		llmMessages = append(llmMessages, Message{
			Role:    "user",
			Content: newMessageContent,
		})
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
