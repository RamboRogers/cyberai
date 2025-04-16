// server/handlers/chat_handlers.go
package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	// "strconv"
	"github.com/ramborogers/cyberai/server/llm"        // Import llm package
	"github.com/ramborogers/cyberai/server/middleware" // For GetUserIDFromContext
	"github.com/ramborogers/cyberai/server/models"     // Assuming chat service exists
	"github.com/ramborogers/cyberai/server/ws"         // Import ws package
)

type ChatHandlers struct {
	ChatService      *models.ChatService
	Hub              *ws.Hub               // WebSocket hub
	ConnectorService *llm.ConnectorService // LLM connector service
}

func NewChatHandlers(cs *models.ChatService, hub *ws.Hub, connSvc *llm.ConnectorService) *ChatHandlers {
	return &ChatHandlers{
		ChatService:      cs,
		Hub:              hub,
		ConnectorService: connSvc, // Store ConnectorService
	}
}

// ListChats handles GET /api/chats
func (h *ChatHandlers) ListChats(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserIDFromContext(r.Context())
	if userID == 0 {
		// This should ideally not happen if middleware is correctly enforced
		http.Error(w, "Unauthorized: User ID not found in context", http.StatusUnauthorized)
		return
	}
	log.Printf("ListChats called by User ID: %d", userID)

	// Fetch all chats (active and inactive) for the user, ordered by updated_at desc
	chats, err := h.ChatService.GetUserChats(int64(userID), false)
	if err != nil {
		log.Printf("Error fetching chats for user %d: %v", userID, err)
		http.Error(w, "Failed to retrieve chats", http.StatusInternalServerError)
		return
	}

	// If no chats found, return an empty list, not an error
	if chats == nil {
		chats = []models.Chat{}
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	if err := json.NewEncoder(w).Encode(chats); err != nil {
		log.Printf("Error encoding chats response for user %d: %v", userID, err)
	}
}

// CreateChatRequest defines the expected JSON body for POST /api/chats
type CreateChatRequest struct {
	Title        *string              `json:"title,omitempty"`         // Optional title
	FirstMessage *FirstMessagePayload `json:"first_message,omitempty"` // Optional first message
}

// FirstMessagePayload defines the structure for the optional first message
type FirstMessagePayload struct {
	Content string `json:"content"`  // Required if first_message is present
	ModelID int64  `json:"model_id"` // Required if first_message is present
}

// CreateChat handles POST /api/chats
func (h *ChatHandlers) CreateChat(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserIDFromContext(r.Context())
	if userID == 0 {
		http.Error(w, "Unauthorized: User ID not found in context", http.StatusUnauthorized)
		return
	}
	log.Printf("CreateChat called by User ID: %d", userID)

	var req CreateChatRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		// Handle empty body gracefully - it's valid if no title/first message
		if err != io.EOF {
			log.Printf("Error decoding CreateChat request for user %d: %v", userID, err)
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}
	}

	// Validate: If first_message is present, content and model_id are required
	if req.FirstMessage != nil {
		if req.FirstMessage.Content == "" {
			http.Error(w, "Bad Request: first_message requires content", http.StatusBadRequest)
			return
		}
		if req.FirstMessage.ModelID <= 0 {
			http.Error(w, "Bad Request: first_message requires a valid model_id", http.StatusBadRequest)
			return
		}
		// TODO: Future - Validate that the model_id exists and is accessible by the user
	}

	// Determine chat title
	title := "New Chat" // Default
	if req.Title != nil && *req.Title != "" {
		title = *req.Title // Use provided title
	} else if req.FirstMessage != nil && req.FirstMessage.Content != "" {
		// Use first message content as title if no explicit title provided
		title = req.FirstMessage.Content
		// Truncate long titles
		maxTitleLen := 60 // Max length for a title from message content
		if len(title) > maxTitleLen {
			title = title[:maxTitleLen] + "..."
		}
	}

	// Create chat in DB
	newChat, err := h.ChatService.CreateChat(int64(userID), title)
	if err != nil {
		log.Printf("Error creating chat in DB for user %d: %v", userID, err)
		http.Error(w, "Failed to create chat", http.StatusInternalServerError)
		return
	}

	// Handle first message if provided
	if req.FirstMessage != nil {
		userMessage := models.Message{
			ChatID:  newChat.ID,
			UserID:  int64(userID),
			Role:    "user",
			Content: req.FirstMessage.Content,
			// ModelID is null for user messages
		}
		if err := h.ChatService.AddMessage(&userMessage); err != nil {
			log.Printf("Error adding first user message for chat %d: %v", newChat.ID, err)
			// Don't fail the whole request, just log the error for now
			// http.Error(w, "Failed to save initial message", http.StatusInternalServerError)
			// return
		} else {
			log.Printf("Added first user message (ID: %d) for new chat %d", userMessage.ID, newChat.ID)
			// Use a background context for the goroutine
			bgCtx := context.Background()
			go h.processAIResponse(bgCtx, userID, userMessage, req.FirstMessage.ModelID)
		}
	}

	// Return the created chat object (without messages initially)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	if err := json.NewEncoder(w).Encode(newChat); err != nil {
		log.Printf("Error encoding created chat response for user %d: %v", userID, err)
	}
}

// GetChat handles GET /api/chats/{chat_id}
func (h *ChatHandlers) GetChat(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserIDFromContext(r.Context())
	if userID == 0 {
		http.Error(w, "Unauthorized: User ID not found in context", http.StatusUnauthorized)
		return
	}

	chatIDStr := r.PathValue("chat_id")
	chatID, err := strconv.ParseInt(chatIDStr, 10, 64)
	if err != nil {
		log.Printf("Invalid chat ID format '%s': %v", chatIDStr, err)
		http.Error(w, "Bad Request: Invalid chat ID format", http.StatusBadRequest)
		return
	}

	log.Printf("GetChat called by User ID: %d for Chat ID: %d", userID, chatID)

	// Fetch chat details including messages
	chat, err := h.ChatService.GetChat(chatID, true)
	if err != nil {
		// Check if it's a 'not found' error from the service
		if err.Error() == fmt.Sprintf("chat not found: %d", chatID) { // Check specific error message from service
			log.Printf("Chat ID %d not found for user %d", chatID, userID)
			http.Error(w, "Not Found: Chat not found", http.StatusNotFound)
		} else {
			// Handle other potential database errors
			log.Printf("Error fetching chat %d for user %d: %v", chatID, userID, err)
			http.Error(w, "Internal Server Error: Failed to retrieve chat details", http.StatusInternalServerError)
		}
		return
	}

	// Authorization check: Ensure the user owns this chat
	if chat.UserID != int64(userID) {
		log.Printf("Forbidden: User %d attempted to access chat %d owned by user %d", userID, chatID, chat.UserID)
		http.Error(w, "Forbidden: You do not have access to this chat", http.StatusForbidden)
		return
	}

	// Return the chat object with messages
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	if err := json.NewEncoder(w).Encode(chat); err != nil {
		log.Printf("Error encoding chat response for chat %d: %v", chatID, err)
	}
}

// UpdateChatRequest defines the structure for PUT /api/chats/{id}
type UpdateChatRequest struct {
	Title string `json:"title"` // New title is required
}

// UpdateChat handles PUT /api/chats/{chat_id}
func (h *ChatHandlers) UpdateChat(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserIDFromContext(r.Context())
	if userID == 0 {
		http.Error(w, "Unauthorized: User ID not found in context", http.StatusUnauthorized)
		return
	}

	chatIDStr := r.PathValue("chat_id")
	chatID, err := strconv.ParseInt(chatIDStr, 10, 64)
	if err != nil {
		log.Printf("Invalid chat ID format '%s': %v", chatIDStr, err)
		http.Error(w, "Bad Request: Invalid chat ID format", http.StatusBadRequest)
		return
	}

	// Decode request body
	var req UpdateChatRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("Error decoding UpdateChat request for chat %d: %v", chatID, err)
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.Title == "" {
		http.Error(w, "Bad Request: Title cannot be empty", http.StatusBadRequest)
		return
	}

	log.Printf("UpdateChat called by User ID: %d for Chat ID: %d with new title: %s", userID, chatID, req.Title)

	// Authorization Check: Fetch chat first to verify ownership
	existingChat, err := h.ChatService.GetChat(chatID, false) // Don't need messages here
	if err != nil {
		if err.Error() == fmt.Sprintf("chat not found: %d", chatID) {
			log.Printf("Chat ID %d not found for update attempt by user %d", chatID, userID)
			http.Error(w, "Not Found: Chat not found", http.StatusNotFound)
		} else {
			log.Printf("Error fetching chat %d for auth check (update): %v", chatID, err)
			http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		}
		return
	}
	if existingChat.UserID != int64(userID) {
		log.Printf("Forbidden: User %d attempted to update chat %d owned by user %d", userID, chatID, existingChat.UserID)
		http.Error(w, "Forbidden: You do not have access to update this chat", http.StatusForbidden)
		return
	}

	// Update the title
	if err := h.ChatService.UpdateChatTitle(chatID, req.Title); err != nil {
		log.Printf("Error updating title for chat %d: %v", chatID, err)
		http.Error(w, "Internal Server Error: Failed to update chat title", http.StatusInternalServerError)
		return
	}

	// Fetch the updated chat details to return (gets new updated_at)
	updatedChat, err := h.ChatService.GetChat(chatID, false)
	if err != nil {
		log.Printf("Error fetching updated chat %d details after update: %v", chatID, err)
		// Don't error out the whole request if just fetching the final state fails, but log it.
		// Return the original chat object with the new title applied manually as a fallback?
		// For simplicity now, we'll just return what we have which might be slightly stale.
		// Or maybe return the original existingChat with title updated?
		existingChat.Title = req.Title // Manually update title in the fetched object
		updatedChat = existingChat     // Use this as fallback
	}

	// Return the updated chat object
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	if err := json.NewEncoder(w).Encode(updatedChat); err != nil {
		log.Printf("Error encoding updated chat response for chat %d: %v", chatID, err)
	}
}

// DeleteChat handles DELETE /api/chats/{chat_id}
func (h *ChatHandlers) DeleteChat(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserIDFromContext(r.Context())
	if userID == 0 {
		http.Error(w, "Unauthorized: User ID not found in context", http.StatusUnauthorized)
		return
	}

	chatIDStr := r.PathValue("chat_id")
	chatID, err := strconv.ParseInt(chatIDStr, 10, 64)
	if err != nil {
		log.Printf("Invalid chat ID format '%s': %v", chatIDStr, err)
		http.Error(w, "Bad Request: Invalid chat ID format", http.StatusBadRequest)
		return
	}

	log.Printf("DeleteChat called by User ID: %d for Chat ID: %d", userID, chatID)

	// Authorization Check: Fetch chat first to verify ownership
	existingChat, err := h.ChatService.GetChat(chatID, false) // Don't need messages
	if err != nil {
		if err.Error() == fmt.Sprintf("chat not found: %d", chatID) {
			log.Printf("Chat ID %d not found for delete attempt by user %d", chatID, userID)
			// Return 404 even if user didn't own it, less information leakage
			http.Error(w, "Not Found: Chat not found", http.StatusNotFound)
		} else {
			log.Printf("Error fetching chat %d for auth check (delete): %v", chatID, err)
			http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		}
		return
	}
	if existingChat.UserID != int64(userID) {
		log.Printf("Forbidden: User %d attempted to delete chat %d owned by user %d", userID, chatID, existingChat.UserID)
		http.Error(w, "Forbidden: You do not have access to delete this chat", http.StatusForbidden)
		return
	}

	// Delete the chat and associated data
	if err := h.ChatService.DeleteChat(chatID); err != nil {
		// The service layer might return specific errors, but for now, assume 500
		log.Printf("Error deleting chat %d: %v", chatID, err)
		http.Error(w, "Internal Server Error: Failed to delete chat", http.StatusInternalServerError)
		return
	}

	// Success
	w.WriteHeader(http.StatusNoContent)
	log.Printf("Successfully deleted chat %d by user %d", chatID, userID)
}

// PurgeUserChats handles DELETE /api/chats/purge
func (h *ChatHandlers) PurgeUserChats(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserIDFromContext(r.Context())
	if userID == 0 {
		http.Error(w, "Unauthorized: User ID not found in context", http.StatusUnauthorized)
		return
	}

	log.Printf("PurgeUserChats called by User ID: %d", userID)

	// Call the service layer function to delete all chats for the user.
	// This assumes ChatService has a method like DeleteChatsByUserID.
	// IMPORTANT: This DB method needs to be implemented and handle deleting
	// both the chats and their associated messages (ideally in a transaction).
	if err := h.ChatService.DeleteChatsByUserID(int64(userID)); err != nil {
		// The service layer might return specific errors, but for now, assume 500
		log.Printf("Error purging chats for user %d: %v", userID, err)
		http.Error(w, "Internal Server Error: Failed to purge chats", http.StatusInternalServerError)
		return
	}

	// Success
	w.WriteHeader(http.StatusNoContent)
	log.Printf("Successfully purged all chats for user %d", userID)
}

// CreateMessageRequest defines the structure for POST /api/chats/{id}/messages
type CreateMessageRequest struct {
	Content string `json:"content"`            // Required
	ModelID int64  `json:"model_id"`           // Required: ID of model to use for response
	AgentID *int64 `json:"agent_id,omitempty"` // Optional: Agent to use
}

// CreateMessage handles POST /api/chats/{chat_id}/messages
func (h *ChatHandlers) CreateMessage(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserIDFromContext(r.Context())
	if userID == 0 {
		http.Error(w, "Unauthorized: User ID not found in context", http.StatusUnauthorized)
		return
	}

	chatIDStr := r.PathValue("chat_id")
	chatID, err := strconv.ParseInt(chatIDStr, 10, 64)
	if err != nil {
		log.Printf("Invalid chat ID format '%s': %v", chatIDStr, err)
		http.Error(w, "Bad Request: Invalid chat ID format", http.StatusBadRequest)
		return
	}

	// Decode request body
	var req CreateMessageRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("Error decoding CreateMessage request for chat %d: %v", chatID, err)
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Validate input
	if req.Content == "" {
		http.Error(w, "Bad Request: Message content cannot be empty", http.StatusBadRequest)
		return
	}
	if req.ModelID <= 0 {
		http.Error(w, "Bad Request: A valid model_id is required", http.StatusBadRequest)
		return
	}
	// TODO: Validate ModelID exists and is active/accessible by user
	// TODO: Validate AgentID if provided

	log.Printf("CreateMessage called by User ID: %d for Chat ID: %d, Model ID: %d", userID, chatID, req.ModelID)

	// Authorization Check: Verify user owns the chat
	existingChat, err := h.ChatService.GetChat(chatID, false) // Don't need messages
	if err != nil {
		if err.Error() == fmt.Sprintf("chat not found: %d", chatID) {
			http.Error(w, "Not Found: Chat not found", http.StatusNotFound)
		} else {
			log.Printf("Error fetching chat %d for auth check (message): %v", chatID, err)
			http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		}
		return
	}
	if existingChat.UserID != int64(userID) {
		log.Printf("Forbidden: User %d attempted to post message to chat %d owned by user %d", userID, chatID, existingChat.UserID)
		http.Error(w, "Forbidden: You do not have access to this chat", http.StatusForbidden)
		return
	}

	// Create and save the user message
	userMessage := models.Message{
		ChatID:  chatID,
		UserID:  int64(userID),
		Role:    "user",
		Content: req.Content,
		ModelID: nil,         // User messages don't have a model ID directly associated
		AgentID: req.AgentID, // Assign if provided
	}

	if err := h.ChatService.AddMessage(&userMessage); err != nil {
		log.Printf("Error saving user message for chat %d: %v", chatID, err)
		http.Error(w, "Internal Server Error: Failed to save message", http.StatusInternalServerError)
		return
	}

	log.Printf("Saved user message ID %d for chat %d", userMessage.ID, chatID)

	// Return the created user message object with 202 Accepted immediately
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted) // Indicate processing has started
	if err := json.NewEncoder(w).Encode(userMessage); err != nil {
		log.Printf("Error encoding user message response for chat %d: %v", chatID, err)
		// Don't try to write error after header sent
	}

	// --- Trigger AI response asynchronously ---
	// Use a new context for the background task, but could link to request context if needed
	bgCtx := context.Background() // Use background context for the goroutine
	go h.processAIResponse(bgCtx, userID, userMessage, req.ModelID)
}

// processAIResponse handles getting the LLM response and streaming it back
// for a *new* user message. This runs in a separate goroutine.
func (h *ChatHandlers) processAIResponse(ctx context.Context, userID int, triggeringMsg models.Message, requestedModelID int64) {
	chatID := triggeringMsg.ChatID
	log.Printf("[Chat %d] Starting AI response processing for model %d (triggered by msg %d)", chatID, requestedModelID, triggeringMsg.ID)

	// Send initial status update
	h.sendWsMessage(userID, ws.Message{
		Type: "status",
		Data: map[string]interface{}{"message": "Processing...", "chat_id": chatID},
	})

	// 1. Fetch message history (including the triggering message)
	// TODO: Make history limit configurable?
	historyLimit := 20
	history, err := h.ChatService.GetMessageHistory(chatID, historyLimit)
	if err != nil {
		log.Printf("[Chat %d] Error getting message history: %v", chatID, err)
		h.sendWsError(userID, chatID, fmt.Sprintf("Failed to retrieve conversation history: %v", err))
		return
	}

	// 2. Call the shared generation logic
	_, err = h.generateAndStreamResponse(ctx, userID, chatID, requestedModelID, history, triggeringMsg.AgentID)
	if err != nil {
		// Error logging and WS notification are handled within generateAndStreamResponse
		log.Printf("[Chat %d] processAIResponse finished with error: %v", chatID, err)
	} else {
		log.Printf("[Chat %d] processAIResponse finished successfully.", chatID)
	}
}

// generateAndStreamResponse is the core logic for calling the LLM and streaming results.
// It takes the prepared message history (including system prompts) and handles connector fetching,
// API calls, streaming via WebSocket, and saving the final assistant message.
// Returns the final assistant message ID and error.
func (h *ChatHandlers) generateAndStreamResponse(ctx context.Context, userID int, chatID int64, modelIDToUse int64, history []models.Message, agentID *int64) (int64, error) {
	log.Printf("[Chat %d] generateAndStreamResponse called with model %d", chatID, modelIDToUse)

	// 1. Get Connector and Model details
	connector, model, err := h.ConnectorService.GetConnectorForModel(ctx, modelIDToUse)
	if err != nil {
		errMsg := fmt.Sprintf("Failed to get model configuration: %v", err)
		log.Printf("[Chat %d] Error getting connector for model %d: %v", chatID, modelIDToUse, err)
		h.sendWsError(userID, chatID, errMsg)
		return 0, errors.New(errMsg)
	}
	log.Printf("[Chat %d] Using model %s (%s) via %s connector for generation", chatID, model.Name, model.ModelID, model.Provider.Type)

	// 2. Build the context using the ChatContextService
	// The history slice received already includes the latest user message.
	// We no longer need to extract it separately.
	/* COMMENT OUT triggeringMessageContent extraction logic
	var triggeringMessageContent string
	if len(history) > 0 {
		// Get the last message (usually the user's triggering message)
		lastMsg := history[len(history)-1]
		if lastMsg.Role == "user" {
			triggeringMessageContent = lastMsg.Content
			// Remove the last message since we'll add it again in the context builder
			history = history[:len(history)-1]
		}
	}
	*/

	// Use the context service to build the LLM messages array
	chatContextSvc := h.ConnectorService.GetChatContextService()
	llmMessages, err := chatContextSvc.BuildContextForModelRequest(
		ctx,
		chatID,
		modelIDToUse,
		"", // Pass empty string - message is already in history
		agentID,
	)
	if err != nil {
		errMsg := fmt.Sprintf("Failed to build context for model: %v", err)
		log.Printf("[Chat %d] Error building context: %v", chatID, err)
		h.sendWsError(userID, chatID, errMsg)
		return 0, errors.New(errMsg)
	}

	// 3. Prepare LLM Request
	llmReq := llm.ChatCompletionRequest{
		Model:       model.ModelID, // Use the provider-specific model ID
		Messages:    llmMessages,
		Temperature: model.Temperature,
		MaxTokens:   model.MaxTokens,
		Stream:      true, // Always stream
	}

	// 4. Define WebSocket streaming callback
	var responseContent strings.Builder
	var assistantMsgID int64 // Store the ID once the message is created
	firstChunk := true

	callback := func(cbCtx context.Context, chunk llm.ChatCompletionChunk) error {
		// Check if context has been cancelled (e.g., client disconnected)
		if cbCtx.Err() != nil {
			log.Printf("[Chat %d] Context cancelled during streaming callback.", chatID)
			return cbCtx.Err() // Stop the stream
		}

		responseContent.WriteString(chunk.Content)

		// Create the assistant message DB entry on the first non-empty chunk
		if firstChunk && chunk.Content != "" {
			assistantMessage := models.Message{
				ChatID:     chatID,
				UserID:     0, // Indicates assistant
				Role:       "assistant",
				Content:    "", // Will be updated later
				ModelID:    &modelIDToUse,
				AgentID:    agentID, // Use passed agent ID
				TokensUsed: 0,       // Will be updated later
			}
			if err := h.ChatService.AddMessage(&assistantMessage); err != nil {
				log.Printf("[Chat %d] Error creating initial assistant message entry: %v", chatID, err)
				return fmt.Errorf("failed to save initial assistant message: %w", err) // Stop stream processing
			}
			assistantMsgID = assistantMessage.ID
			firstChunk = false
			log.Printf("[Chat %d] Created initial assistant message DB entry (ID: %d)", chatID, assistantMsgID)
		}

		// Only send non-empty chunks (and final empty chunk if needed)
		if chunk.Content != "" || chunk.IsFinal {
			// Correctly populate the ChunkPayload field
			payload := ws.ChunkPayload{
				ChatID:  chatID,
				Content: chunk.Content,
				IsFinal: chunk.IsFinal,
			}

			// Set MessageID if available
			if assistantMsgID != 0 {
				payload.MessageID = &assistantMsgID
			}

			// Add the model ID - finalModelID is the correct variable in this context
			// Create a local copy we can safely take the address of
			modelIDCopy := modelIDToUse
			payload.ModelID = &modelIDCopy

			// Create and send the WebSocket message
			wsMsg := ws.Message{
				Type:         ws.MsgTypeAssistantChunk,
				Timestamp:    time.Now(),
				ChunkPayload: &payload,
			}
			h.sendWsMessage(userID, wsMsg)
		}

		return nil // Indicate success
	}

	// Send status update before calling LLM
	h.sendWsMessage(userID, ws.Message{
		Type: "status",
		Data: map[string]interface{}{"message": "Generating response...", "chat_id": chatID},
	})

	// 5. Call the Connector
	err = connector.GenerateChatCompletion(ctx, llmReq, callback)

	// 6. Handle completion/error
	if err != nil {
		// Include the model ID in the error message for more context
		errMsg := fmt.Sprintf("Error generating response with model ID %d: %v", modelIDToUse, err)
		log.Printf("[Chat %d] Error generating chat completion: %v", chatID, err)
		h.sendWsError(userID, chatID, errMsg)
		if assistantMsgID != 0 {
			log.Printf("[Chat %d] Potentially incomplete assistant message (ID: %d) due to error.", chatID, assistantMsgID)
			// Consider deleting or marking the message as failed here?
			// h.ChatService.DeleteMessage(assistantMsgID)
		}
		return assistantMsgID, errors.New(errMsg) // Return error
	}

	// 7. Update the completed assistant message in DB (if created)
	if assistantMsgID != 0 {
		finalContent := responseContent.String()
		// Clean the response content before saving
		cleanedContent := cleanAssistantResponse(finalContent)
		// TODO: Calculate actual tokens used (need info from LLM response if available)
		tokens := len(cleanedContent) // Use length of cleaned content

		updateErr := h.ChatService.UpdateMessageContentAndTokens(assistantMsgID, cleanedContent, tokens)
		if updateErr != nil {
			log.Printf("[Chat %d] Error updating final assistant message %d content/tokens: %v", chatID, assistantMsgID, updateErr)
			// Don't send WS error here, primary task (streaming) was successful.
		} else {
			log.Printf("[Chat %d] Successfully updated final assistant message %d", chatID, assistantMsgID)
			// Send the final message object via WebSocket upon successful update
			// Construct payload directly from available data
			wsMsgPayload := ws.MessagePayload{
				ID:         assistantMsgID,
				ChatID:     chatID,
				UserID:     0, // Assistant
				Role:       "assistant",
				Content:    cleanedContent, // Send final cleaned content
				ModelID:    &modelIDToUse,  // Use the model ID used for generation
				AgentID:    agentID,        // Use the agent ID used for generation
				TokensUsed: tokens,         // Send the calculated tokens
				CreatedAt:  time.Now(),     // Use current time as approximation for WS message
			}
			h.sendWsMessage(userID, ws.Message{
				Type:           ws.MsgTypeAssistantMessage,
				MessagePayload: &wsMsgPayload,
			})
			log.Printf("[Chat %d] Sent final assistant_message WS update for message %d", chatID, assistantMsgID)
		}
	} else if responseContent.Len() > 0 {
		// Handle case where stream finished but no DB entry was made (e.g., first chunk was empty?)
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
		if err := h.ChatService.AddMessage(&assistantMessage); err != nil {
			log.Printf("[Chat %d] Error saving final assistant message after stream completion: %v", chatID, err)
			h.sendWsError(userID, chatID, "Failed to save final assistant message after streaming.")
			return 0, fmt.Errorf("failed to save final assistant message: %w", err)
		} else {
			assistantMsgID = assistantMessage.ID
			log.Printf("[Chat %d] Successfully saved final assistant message %d after streaming.", chatID, assistantMsgID)
			// Send the final message object via WebSocket here as well
			// Construct payload directly from available data
			wsMsgPayload := ws.MessagePayload{
				ID:         assistantMsgID,
				ChatID:     chatID,
				UserID:     0, // Assistant
				Role:       "assistant",
				Content:    cleanedContent, // Use the saved content
				ModelID:    &modelIDToUse,  // Use the model ID used for generation
				AgentID:    agentID,        // Use the agent ID used for generation
				TokensUsed: tokens,         // Use the calculated tokens
				CreatedAt:  time.Now(),     // Use current time as approximation for WS message
			}
			h.sendWsMessage(userID, ws.Message{
				Type:           ws.MsgTypeAssistantMessage,
				MessagePayload: &wsMsgPayload,
			})
			log.Printf("[Chat %d] Sent final assistant_message WS update for message %d", chatID, assistantMsgID)
		}
	} else {
		log.Printf("[Chat %d] AI response stream finished with no content.", chatID)
		// No error, but nothing to save.
	}

	log.Printf("[Chat %d] generateAndStreamResponse finished successfully for model %d. Final assistant msg ID: %d", chatID, modelIDToUse, assistantMsgID)
	return assistantMsgID, nil // Return the final message ID and nil error
}

// cleanAssistantResponse removes unwanted prefixes from the raw LLM response.
func cleanAssistantResponse(rawResponse string) string {
	prefix := "⚙️ AI Thinking Process"
	if strings.HasPrefix(rawResponse, prefix) {
		// Find the end of the thinking block (assuming double newline separation)
		endOfPrefix := strings.Index(rawResponse, "\n\n")
		if endOfPrefix != -1 {
			// Return the content after the prefix and the separating newlines
			cleaned := rawResponse[endOfPrefix+2:] // +2 to skip the \n\n
			// Trim leading/trailing whitespace just in case
			return strings.TrimSpace(cleaned)
		}
		// If double newline isn't found, maybe just remove the prefix line?
		// This is less robust. Let's try finding the first single newline after the prefix.
		endOfPrefixLine := strings.Index(rawResponse, "\n")
		if endOfPrefixLine != -1 && endOfPrefixLine > len(prefix) {
			cleaned := rawResponse[endOfPrefixLine+1:]
			return strings.TrimSpace(cleaned)
		}
		// Fallback: If no clear separator, just return the original response minus the exact prefix
		// This might leave unwanted partial lines if the format is inconsistent.
		return strings.TrimSpace(strings.TrimPrefix(rawResponse, prefix))
	}
	return rawResponse // Return original if prefix not found
}

// sendWsMessage is a helper to send a structured message to a user via WebSocket
func (h *ChatHandlers) sendWsMessage(userID int, msg ws.Message) {
	if h.Hub == nil {
		log.Println("Error: WebSocket Hub is nil in ChatHandlers")
		return
	}
	// Add timestamp if not already present
	if msg.Timestamp.IsZero() {
		msg.Timestamp = time.Now()
	}
	h.Hub.SendToUser(int64(userID), msg)
}

// sendWsError is a helper to send a structured error message to a user via WebSocket
func (h *ChatHandlers) sendWsError(userID int, chatID int64, errorMsg string) {
	chatIDPtr := chatID // Create a pointer for the payload
	h.sendWsMessage(userID, ws.Message{
		Type: ws.MsgTypeError, // Use constant
		ErrorPayload: &ws.ErrorPayload{
			Message: errorMsg,
			ChatID:  &chatIDPtr,
			// Code: 0, // Optional: Add error code if applicable
		},
		// Data: nil, // Ensure Data field is not used
	})
}

// RegenerateMessageRequest defines the optional body for POST /api/chats/{id}/messages/regenerate
type RegenerateMessageRequest struct {
	ModelID *int64 `json:"model_id,omitempty"` // Optional: New model ID to use
}

// RegenerateMessage handles POST /api/chats/{chat_id}/messages/regenerate
func (h *ChatHandlers) RegenerateMessage(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserIDFromContext(r.Context())
	if userID == 0 {
		http.Error(w, "Unauthorized: User ID not found in context", http.StatusUnauthorized)
		return
	}

	chatIDStr := r.PathValue("chat_id")
	chatID, err := strconv.ParseInt(chatIDStr, 10, 64)
	if err != nil {
		log.Printf("Invalid chat ID format '%s': %v", chatIDStr, err)
		http.Error(w, "Bad Request: Invalid chat ID format", http.StatusBadRequest)
		return
	}

	// Decode optional request body
	var req RegenerateMessageRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		if err != io.EOF { // Ignore empty body, it's valid
			log.Printf("Error decoding RegenerateMessage request for chat %d: %v", chatID, err)
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}
	}

	// Validate ModelID if provided
	if req.ModelID != nil && *req.ModelID <= 0 {
		http.Error(w, "Bad Request: Invalid model_id provided for regeneration", http.StatusBadRequest)
		return
	}
	// TODO: Validate ModelID exists and is active/accessible by user

	log.Printf("RegenerateMessage called by User ID: %d for Chat ID: %d (New Model ID: %v)", userID, chatID, req.ModelID)

	// Authorization Check: Verify user owns the chat
	existingChat, err := h.ChatService.GetChat(chatID, false) // Don't need messages here
	if err != nil {
		if err.Error() == fmt.Sprintf("chat not found: %d", chatID) {
			http.Error(w, "Not Found: Chat not found", http.StatusNotFound)
		} else {
			log.Printf("Error fetching chat %d for auth check (regenerate): %v", chatID, err)
			http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		}
		return
	}
	if existingChat.UserID != int64(userID) {
		log.Printf("Forbidden: User %d attempted to regenerate message in chat %d owned by user %d", userID, chatID, existingChat.UserID)
		http.Error(w, "Forbidden: You do not have access to this chat", http.StatusForbidden)
		return
	}

	// Return 202 Accepted immediately
	w.WriteHeader(http.StatusAccepted)

	// --- Trigger Regeneration Asynchronously ---
	bgCtx := context.Background()
	go func(ctx context.Context, userID int, chatID int64, requestedNewModelID *int64) {
		log.Printf("[Regen Chat %d] Starting regeneration process...", chatID)

		// Send initial status update
		h.sendWsMessage(userID, ws.Message{
			Type: "status",
			Data: map[string]interface{}{"message": "Regenerating response...", "chat_id": chatID},
		})

		// 1. Get last N messages
		history, err := h.ChatService.GetMessageHistory(chatID, 20) // Get reasonable history
		if err != nil {
			log.Printf("[Regen Chat %d] Error getting message history: %v", chatID, err)
			h.sendWsError(userID, chatID, "Failed to retrieve conversation history for regeneration.")
			return
		}

		// 2. Find the last assistant message
		lastAssistantMsgIndex := -1
		for i := len(history) - 1; i >= 0; i-- {
			if history[i].Role == "assistant" {
				lastAssistantMsgIndex = i
				break
			}
		}

		if lastAssistantMsgIndex == -1 {
			log.Printf("[Regen Chat %d] No previous assistant message found to regenerate.", chatID)
			h.sendWsError(userID, chatID, "Cannot regenerate: No previous assistant message found.")
			return
		}

		lastAssistantMsg := history[lastAssistantMsgIndex]

		// IMPROVED: Find the most recent user message that appears before the lastAssistantMsg
		lastUserMsgIndex := -1
		for i := lastAssistantMsgIndex - 1; i >= 0; i-- {
			if history[i].Role == "user" {
				lastUserMsgIndex = i
				break
			}
		}

		var historyToResubmit []models.Message

		// Logic for determining what history to include
		if lastUserMsgIndex >= 0 {
			// We found a user message immediately before the assistant message
			// Include all context up to and including that user message
			historyToResubmit = history[:lastUserMsgIndex+1]
			log.Printf("[Regen Chat %d] Found last user message at position %d out of %d total messages",
				chatID, lastUserMsgIndex, len(history))
		} else {
			// No user message found before the assistant message
			// This shouldn't happen in normal operation but we'll handle it gracefully
			// by including all history before the assistant message
			historyToResubmit = history[:lastAssistantMsgIndex]
			log.Printf("[Regen Chat %d] No user message found before the last assistant message - unusual state", chatID)
		}

		if len(historyToResubmit) == 0 {
			log.Printf("[Regen Chat %d] No message history found to use for regeneration.", chatID)
			h.sendWsError(userID, chatID, "Cannot regenerate: No suitable history found to regenerate from.")
			return
		}

		// Check if the last message in our history is a user message, which is required for regeneration
		lastMsgInHistory := historyToResubmit[len(historyToResubmit)-1]
		if lastMsgInHistory.Role != "user" {
			log.Printf("[Regen Chat %d] Last message in history is not a user message (%s). Cannot regenerate.",
				chatID, lastMsgInHistory.Role)
			h.sendWsError(userID, chatID, "Cannot regenerate: The last message must be from a user.")
			return
		}

		// Extract the triggering user message content to pass explicitly to context builder
		triggeringMessageContent := lastMsgInHistory.Content

		// 3. Determine model ID to use
		modelIDToUse := lastAssistantMsg.ModelID // Default to original model
		if requestedNewModelID != nil {
			modelIDToUse = requestedNewModelID // Override with user request
			log.Printf("[Regen Chat %d] User requested override to model ID %d", chatID, *modelIDToUse)
		}
		if modelIDToUse == nil || *modelIDToUse == 0 {
			errMsg := fmt.Sprintf("Cannot determine model ID for regeneration (Original: %v, Requested: %v)", lastAssistantMsg.ModelID, requestedNewModelID)
			log.Printf("[Regen Chat %d] %s", chatID, errMsg)
			h.sendWsError(userID, chatID, errMsg)
			return
		}
		finalModelID := *modelIDToUse

		// For regeneration, we'll handle context differently than regular messages
		log.Printf("[Regen Chat %d] Regenerating with triggering message: %s", chatID, triggeringMessageContent)

		// Remove the last user message from history as we'll pass it explicitly
		// historyForContext := historyToResubmit[:len(historyToResubmit)-1]

		// Use a background context for the goroutine
		// bgCtx := context.Background()

		// Call the shared generation logic with modified flow for regeneration
		log.Printf("[Regen Chat %d] Using explicit context building for regeneration", chatID)

		// Here we need to get the connector and model details first
		connector, model, err := h.ConnectorService.GetConnectorForModel(ctx, finalModelID)
		if err != nil {
			errMsg := fmt.Sprintf("Failed to get model configuration: %v", err)
			log.Printf("[Regen Chat %d] Error getting connector for model %d: %v", chatID, finalModelID, err)
			h.sendWsError(userID, chatID, errMsg)
			return
		}

		// Use the context service to build the LLM messages array
		chatContextSvc := h.ConnectorService.GetChatContextService()
		llmMessages, err := chatContextSvc.BuildContextForModelRequest(
			ctx,
			chatID,
			finalModelID,
			triggeringMessageContent, // Pass explicit triggering message content
			lastAssistantMsg.AgentID,
		)
		if err != nil {
			errMsg := fmt.Sprintf("Failed to build context for regeneration: %v", err)
			log.Printf("[Regen Chat %d] Error building context: %v", chatID, err)
			h.sendWsError(userID, chatID, errMsg)
			return
		}

		// Log the context being sent for regeneration
		log.Printf("[Regen Chat %d] Built context with %d messages for regeneration", chatID, len(llmMessages))

		// Set up streaming and message handling like in generateAndStreamResponse
		var responseContent strings.Builder
		var assistantMsgID int64
		firstChunk := true

		callback := func(cbCtx context.Context, chunk llm.ChatCompletionChunk) error {
			if cbCtx.Err() != nil {
				log.Printf("[Regen Chat %d] Context cancelled during streaming callback.", chatID)
				return cbCtx.Err()
			}

			responseContent.WriteString(chunk.Content)

			if firstChunk && chunk.Content != "" {
				assistantMessage := models.Message{
					ChatID:     chatID,
					UserID:     0,
					Role:       "assistant",
					Content:    "",
					ModelID:    &finalModelID,
					AgentID:    lastAssistantMsg.AgentID,
					TokensUsed: 0,
				}
				if err := h.ChatService.AddMessage(&assistantMessage); err != nil {
					log.Printf("[Regen Chat %d] Error creating initial assistant message entry: %v", chatID, err)
					return fmt.Errorf("failed to save initial assistant message: %w", err)
				}
				assistantMsgID = assistantMessage.ID
				firstChunk = false
				log.Printf("[Regen Chat %d] Created regenerated assistant message DB entry (ID: %d)", chatID, assistantMsgID)
			}

			if chunk.Content != "" || chunk.IsFinal {
				// Correctly populate the ChunkPayload field
				payload := ws.ChunkPayload{
					ChatID:  chatID,
					Content: chunk.Content,
					IsFinal: chunk.IsFinal,
				}

				// Set MessageID if available
				if assistantMsgID != 0 {
					payload.MessageID = &assistantMsgID
				}

				// Add the model ID - finalModelID is the correct variable in this context
				// Create a local copy we can safely take the address of
				modelIDCopy := finalModelID
				payload.ModelID = &modelIDCopy

				// Create and send the WebSocket message
				wsMsg := ws.Message{
					Type:         ws.MsgTypeAssistantChunk,
					Timestamp:    time.Now(),
					ChunkPayload: &payload,
				}
				h.sendWsMessage(userID, wsMsg)
			}

			return nil
		}

		// Send status update before calling LLM
		h.sendWsMessage(userID, ws.Message{
			Type: "status",
			Data: map[string]interface{}{"message": "Regenerating response...", "chat_id": chatID},
		})

		// Prepare LLM Request
		llmReq := llm.ChatCompletionRequest{
			Model:       model.ModelID,
			Messages:    llmMessages,
			Temperature: model.Temperature,
			MaxTokens:   model.MaxTokens,
			Stream:      true,
		}

		// Call the Connector
		err = connector.GenerateChatCompletion(ctx, llmReq, callback)

		// Handle completion/error
		if err != nil {
			errMsg := fmt.Sprintf("Error generating regenerated response: %v", err)
			log.Printf("[Regen Chat %d] Error generating chat completion: %v", chatID, err)
			h.sendWsError(userID, chatID, errMsg)
			if assistantMsgID != 0 {
				log.Printf("[Regen Chat %d] Potentially incomplete assistant message (ID: %d) due to error.", chatID, assistantMsgID)
			}
			return
		}

		// Update the completed assistant message in DB
		if assistantMsgID != 0 {
			finalContent := responseContent.String()
			cleanedContent := cleanAssistantResponse(finalContent)
			tokens := len(cleanedContent)

			updateErr := h.ChatService.UpdateMessageContentAndTokens(assistantMsgID, cleanedContent, tokens)
			if updateErr != nil {
				log.Printf("[Regen Chat %d] Error updating final assistant message %d content/tokens: %v", chatID, assistantMsgID, updateErr)
			} else {
				log.Printf("[Regen Chat %d] Successfully updated final regenerated assistant message %d", chatID, assistantMsgID)
				// Send final message confirmation via WebSocket for regeneration too
				wsMsgPayload := ws.MessagePayload{
					ID:         assistantMsgID,
					ChatID:     chatID,
					UserID:     0, // Assistant
					Role:       "assistant",
					Content:    cleanedContent,
					ModelID:    &finalModelID,
					AgentID:    lastAssistantMsg.AgentID,
					TokensUsed: tokens,
					CreatedAt:  time.Now(), // Approximation
				}
				h.sendWsMessage(userID, ws.Message{
					Type:           ws.MsgTypeAssistantMessage,
					MessagePayload: &wsMsgPayload,
				})
				log.Printf("[Regen Chat %d] Sent final assistant_message WS update for message %d", chatID, assistantMsgID)
			}
		} else if responseContent.Len() > 0 {
			log.Printf("[Regen Chat %d] Stream finished with content, but no assistant message DB entry was created. Saving now.", chatID)
			finalContent := responseContent.String()
			cleanedContent := cleanAssistantResponse(finalContent)
			tokens := len(cleanedContent)
			assistantMessage := models.Message{
				ChatID:     chatID,
				UserID:     0,
				Role:       "assistant",
				Content:    cleanedContent,
				ModelID:    &finalModelID,
				AgentID:    lastAssistantMsg.AgentID,
				TokensUsed: tokens,
			}
			if err := h.ChatService.AddMessage(&assistantMessage); err != nil {
				log.Printf("[Regen Chat %d] Error saving final regenerated assistant message: %v", chatID, err)
				h.sendWsError(userID, chatID, "Failed to save final regenerated assistant message.")
				return
			} else {
				assistantMsgID = assistantMessage.ID
				log.Printf("[Regen Chat %d] Successfully saved final regenerated assistant message %d.", chatID, assistantMsgID)
			}
		} else {
			log.Printf("[Regen Chat %d] Regenerated AI response stream finished with no content.", chatID)
			h.sendWsError(userID, chatID, "Regeneration produced no content. Please try again.")
		}

		log.Printf("[Regen Chat %d] Regeneration finished successfully using model %d. Final assistant msg ID: %d", chatID, finalModelID, assistantMsgID)
	}(bgCtx, userID, chatID, req.ModelID)
	// --- End Regeneration Trigger ---
}

// RegisterUserRoutes connects the handler functions to the router
func (h *ChatHandlers) RegisterUserRoutes(mux *http.ServeMux, mw func(http.Handler) http.Handler) {
	// Apply middleware (mw) to all chat/message routes
	mux.Handle("GET /api/chats", mw(http.HandlerFunc(h.ListChats)))
	mux.Handle("POST /api/chats", mw(http.HandlerFunc(h.CreateChat)))

	// Note: Using Go 1.22+ path value matching
	mux.Handle("GET /api/chats/{chat_id}", mw(http.HandlerFunc(h.GetChat)))
	mux.Handle("PUT /api/chats/{chat_id}", mw(http.HandlerFunc(h.UpdateChat)))
	mux.Handle("DELETE /api/chats/{chat_id}", mw(http.HandlerFunc(h.DeleteChat)))
	mux.Handle("POST /api/chats/{chat_id}/messages", mw(http.HandlerFunc(h.CreateMessage)))
	mux.Handle("POST /api/chats/{chat_id}/messages/regenerate", mw(http.HandlerFunc(h.RegenerateMessage)))
	log.Println("Registered user chat routes: GET /api/chats, POST /api/chats, GET/PUT/DELETE /api/chats/{id}, POST /api/chats/{id}/messages, POST /api/chats/{id}/messages/regenerate")
	// Register the new purge route
	mux.Handle("DELETE /api/chats/purge", mw(http.HandlerFunc(h.PurgeUserChats)))
	log.Println("Registered user chat route: DELETE /api/chats/purge")
}
