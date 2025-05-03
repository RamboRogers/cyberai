// server/handlers/chat_handlers.go
package handlers

import (
	"bytes"
	"context"
	"encoding/json"
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
	ChatService            *models.ChatService
	Hub                    *ws.Hub                // WebSocket hub
	ConnectorService       *llm.ConnectorService  // LLM connector service
	searchHandlersDelegate SearchHandlersDelegate // Optional delegate for search operations
}

func NewChatHandlers(cs *models.ChatService, hub *ws.Hub, connSvc *llm.ConnectorService) *ChatHandlers {
	return &ChatHandlers{
		ChatService:            cs,
		Hub:                    hub,
		ConnectorService:       connSvc,
		searchHandlersDelegate: nil, // Initialize as nil
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
		if err != io.EOF {
			log.Printf("Error decoding CreateChat request for user %d: %v", userID, err)
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}
	}

	// Validate first message if present
	if req.FirstMessage != nil {
		if req.FirstMessage.Content == "" || req.FirstMessage.ModelID <= 0 {
			http.Error(w, "Bad Request: first_message requires content and model_id", http.StatusBadRequest)
			return
		}
	}

	// Determine title
	title := "New Chat"
	if req.Title != nil && *req.Title != "" {
		title = *req.Title
	} else if req.FirstMessage != nil {
		title = req.FirstMessage.Content
		maxTitleLen := 60
		if len(title) > maxTitleLen {
			title = title[:maxTitleLen] + "..."
		}
	}

	// Create chat
	newChat, err := h.ChatService.CreateChat(int64(userID), title)
	if err != nil {
		log.Printf("Error creating chat in DB for user %d: %v", userID, err)
		http.Error(w, "Failed to create chat", http.StatusInternalServerError)
		return
	}

	// Add first message AND trigger AI if provided
	if req.FirstMessage != nil {
		userMessage := models.Message{
			ChatID: newChat.ID, UserID: int64(userID), Role: "user", Content: req.FirstMessage.Content,
		}
		if err := h.ChatService.AddMessage(&userMessage); err != nil {
			log.Printf("Error adding first user message for chat %d: %v", newChat.ID, err)
			// Log error but continue
		} else {
			log.Printf("Added first user message (ID: %d) for new chat %d", userMessage.ID, newChat.ID)
			// *** Trigger AI using ConnectorService ***
			go func() {
				if err := h.ConnectorService.GenerateResponseForChat(context.Background(), userID, newChat.ID, req.FirstMessage.ModelID, nil); err != nil {
					log.Printf("[Chat %d] Error returned from GenerateResponseForChat after CreateChat with first message: %v", newChat.ID, err)
				}
			}()
		}
	}

	// Return created chat
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
		ModelID: nil,
		AgentID: req.AgentID,
	}

	if err := h.ChatService.AddMessage(&userMessage); err != nil {
		log.Printf("Error saving user message for chat %d: %v", chatID, err)
		http.Error(w, "Internal Server Error: Failed to save message", http.StatusInternalServerError)
		return
	}

	log.Printf("Saved user message ID %d for chat %d", userMessage.ID, chatID)

	// Return the created user message object with 202 Accepted immediately
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	if err := json.NewEncoder(w).Encode(userMessage); err != nil {
		log.Printf("Error encoding user message response for chat %d: %v", chatID, err)
	}

	// --- Trigger AI response asynchronously using ConnectorService ---
	go func() {
		if err := h.ConnectorService.GenerateResponseForChat(context.Background(), userID, chatID, req.ModelID, req.AgentID); err != nil {
			// Error logging/WS notification is handled within GenerateResponseForChat
			log.Printf("[Chat %d] Error returned from GenerateResponseForChat after CreateMessage: %v", chatID, err)
		}
	}()
}

// processAIResponse // REMOVED - Logic moved to ConnectorService

// generateAndStreamResponse // REMOVED - Logic moved to ConnectorService

// cleanAssistantResponse // REMOVED - Logic moved to ConnectorService

// sendWsMessage // REMOVED - Logic moved to ConnectorService

// sendWsError // REMOVED - Logic moved to ConnectorService

// RegenerateMessageRequest defines the optional body for POST /api/chats/{id}/messages/regenerate
type RegenerateMessageRequest struct {
	ModelID *int64 `json:"model_id,omitempty"` // Optional: New model ID to use
}

// SearchChatRequest defines the structure for POST /api/chats/{id}/search
type SearchChatRequest struct {
	Query            string `json:"query"`                        // Required: Search query
	ModelID          int64  `json:"model_id"`                     // Required: ID of model to use for search
	AgentID          *int64 `json:"agent_id,omitempty"`           // Optional: Agent ID to use
	SearchProviderID *int   `json:"search_provider_id,omitempty"` // Optional: Search provider ID
}

// SearchChat handles POST /api/chats/{chat_id}/search
func (h *ChatHandlers) SearchChat(w http.ResponseWriter, r *http.Request) {
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

	// Log the raw request for debugging
	bodyBytes, _ := io.ReadAll(r.Body)
	r.Body = io.NopCloser(bytes.NewBuffer(bodyBytes)) // Replace the body for later use
	log.Printf("SearchChat raw request for chat %d: %s", chatID, string(bodyBytes))

	// Decode request body
	var req SearchChatRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("Error decoding SearchChat request for chat %d: %v (body: %s)", chatID, err, string(bodyBytes))
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Validate input
	if req.Query == "" {
		log.Printf("SearchChat error for chat %d: Empty query provided", chatID)
		http.Error(w, "Bad Request: Search query cannot be empty", http.StatusBadRequest)
		return
	}

	// If model_id is not provided for existing chat, try to get it from the last message
	if req.ModelID <= 0 {
		log.Printf("SearchChat notice for chat %d: No model_id provided, will attempt to find from chat history", chatID)
		// Get last message to find model ID
		history, err := h.ChatService.GetMessageHistory(chatID, 5)
		if err != nil {
			log.Printf("SearchChat error for chat %d: Failed to get message history: %v", chatID, err)
			http.Error(w, "Internal Server Error: Failed to get message history", http.StatusInternalServerError)
			return
		}

		// Find the last assistant message with a model_id
		var lastModelID int64
		for i := len(history) - 1; i >= 0; i-- {
			if history[i].ModelID != nil && *history[i].ModelID > 0 {
				lastModelID = *history[i].ModelID
				break
			}
		}

		if lastModelID > 0 {
			req.ModelID = lastModelID
			log.Printf("SearchChat for chat %d: Using model_id %d from chat history", chatID, lastModelID)
		} else {
			// If still no model_id, return error
			log.Printf("SearchChat error for chat %d: No model_id provided and none found in history", chatID)
			http.Error(w, "Bad Request: A valid model_id is required and none could be determined from chat history", http.StatusBadRequest)
			return
		}
	}

	log.Printf("SearchChat called by User ID: %d for Chat ID: %d, Model ID: %d, Query: %s", userID, chatID, req.ModelID, req.Query)

	// Authorization Check: Verify user owns the chat
	existingChat, err := h.ChatService.GetChat(chatID, false) // Don't need messages
	if err != nil {
		if err.Error() == fmt.Sprintf("chat not found: %d", chatID) {
			http.Error(w, "Not Found: Chat not found", http.StatusNotFound)
		} else {
			log.Printf("Error fetching chat %d for auth check (search): %v", chatID, err)
			http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		}
		return
	}
	if existingChat.UserID != int64(userID) {
		log.Printf("Forbidden: User %d attempted to search in chat %d owned by user %d", userID, chatID, existingChat.UserID)
		http.Error(w, "Forbidden: You do not have access to this chat", http.StatusForbidden)
		return
	}

	// Get the search provider - we need to access search_handlers.go functionality
	// Here we'll delegate to special handlers that should be registered
	var searchResults []ChatSearchResult
	// If the app has SearchHandlers registered, get search results from the configured provider
	searchHandler := h.searchHandlersDelegate
	if searchHandler != nil {
		provider, err := searchHandler.GetSearchProvider(req.SearchProviderID)
		if err != nil {
			log.Printf("SearchChat error for chat %d: %v", chatID, err)
			// Let user know search is unavailable, log internal error
			http.Error(w, "Search service is currently unavailable.", http.StatusServiceUnavailable)
			return
		}

		// --- Start: Handle No Provider Found ---
		if provider == nil {
			log.Printf("SearchChat notice for chat %d: No search provider configured or found.", chatID)
			// Add user message
			userMessage := models.Message{
				ChatID:  chatID,
				UserID:  int64(userID),
				Role:    "user",
				Content: req.Query,
				AgentID: req.AgentID,
			}
			if err := h.ChatService.AddMessage(&userMessage); err != nil {
				log.Printf("Error saving search query message for chat %d (no provider case): %v", chatID, err)
				http.Error(w, "Internal Server Error: Failed to save search query", http.StatusInternalServerError)
				return
			}
			// Add the notification message
			sysMsg := models.Message{
				ChatID:    chatID,
				UserID:    0,
				Role:      "system",
				Content:   "Search is not configured. Please ask an administrator to add a search provider in the admin settings.",
				ModelID:   &req.ModelID, // Still associate with the intended model
				AgentID:   req.AgentID,
				CreatedAt: time.Now().Add(time.Millisecond),
			}
			if err := h.ChatService.AddMessage(&sysMsg); err != nil {
				log.Printf("Error adding system notification message to chat %d: %v", chatID, err)
				// Log error, but continue
			}

			// Return Accepted, but don't trigger LLM
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusAccepted)
			response := map[string]interface{}{
				"chat_id":         chatID,
				"user_message_id": userMessage.ID,
			}
			if err := json.NewEncoder(w).Encode(response); err != nil {
				log.Printf("Error encoding search query message response (no provider): %v", chatID, err)
			}
			return // Stop processing
		}
		// --- End: Handle No Provider Found ---

		// If provider exists, perform the search
		results, err := searchHandler.PerformSearch(req.Query, provider)
		if err != nil {
			log.Printf("SearchChat error for chat %d: Search failed: %v", chatID, err)
			http.Error(w, fmt.Sprintf("Search failed: %v", err), http.StatusInternalServerError)
			return
		}
		searchResults = results // Use the actual results
	} else {
		// Fallback if no search handlers are available - empty results
		log.Printf("SearchChat warning for chat %d: No search handlers registered, using empty results", chatID)
		searchResults = []ChatSearchResult{}
	}

	// Format the search results for context (will be empty if no handler/provider)
	formattedResults := formatChatSearchResults(req.Query, searchResults)

	// Create and save the user message with the search query
	userMessage := models.Message{
		ChatID:  chatID,
		UserID:  int64(userID),
		Role:    "user",
		Content: req.Query, // No longer prefixing with "Search: "
		ModelID: nil,
		AgentID: req.AgentID,
	}

	if err := h.ChatService.AddMessage(&userMessage); err != nil {
		log.Printf("Error saving search query message for chat %d: %v", chatID, err)
		http.Error(w, "Internal Server Error: Failed to save search query", http.StatusInternalServerError)
		return
	}

	log.Printf("Saved search query message ID %d for chat %d", userMessage.ID, chatID)

	// Add system message with search results as context
	sysMsg := models.Message{
		ChatID:    chatID,
		UserID:    0, // System message
		Role:      "system",
		Content:   formattedResults,
		ModelID:   &req.ModelID,
		AgentID:   req.AgentID,
		CreatedAt: time.Now().Add(time.Millisecond), // Ensure it sorts after user msg
	}

	if err := h.ChatService.AddMessage(&sysMsg); err != nil {
		log.Printf("Error adding system results message to chat %d: %v", chatID, err)
		// Log error but continue - AI will generate without search context
	}

	// Return the created user message object with 202 Accepted immediately
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	response := map[string]interface{}{
		"chat_id":         chatID,
		"user_message_id": userMessage.ID,
	}
	if err := json.NewEncoder(w).Encode(response); err != nil {
		log.Printf("Error encoding search query message response for chat %d: %v", chatID, err)
	}

	// Trigger search response asynchronously
	go func() {
		if err := h.ConnectorService.GenerateResponseForChat(context.Background(), userID, chatID, req.ModelID, req.AgentID); err != nil {
			log.Printf("[Chat %d] Error returned from GenerateResponseForChat during search: %v", chatID, err)
		}
	}()
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

	// --- Trigger Regeneration Asynchronously using ConnectorService ---
	go func(ctx context.Context, userID int, chatID int64, requestedNewModelID *int64) {
		log.Printf("[Regen Chat %d] Starting regeneration process...", chatID)

		// 1. Get last N messages to find context
		history, err := h.ChatService.GetMessageHistory(chatID, 20)
		if err != nil {
			log.Printf("[Regen Chat %d] Error getting message history: %v", chatID, err)
			// Need to send error via ConnectorService's helper
			h.ConnectorService.SendWsError(userID, chatID, "Failed to retrieve conversation history for regeneration.")
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
			log.Printf("[Regen Chat %d] No previous assistant message found.", chatID)
			h.ConnectorService.SendWsError(userID, chatID, "Cannot regenerate: No previous assistant message.")
			return
		}
		lastAssistantMsg := history[lastAssistantMsgIndex]

		// 3. Determine model ID to use
		modelIDToUse := lastAssistantMsg.ModelID
		if requestedNewModelID != nil {
			modelIDToUse = requestedNewModelID
		}
		if modelIDToUse == nil || *modelIDToUse == 0 {
			errMsg := "Cannot determine model ID for regeneration."
			log.Printf("[Regen Chat %d] %s", chatID, errMsg)
			h.ConnectorService.SendWsError(userID, chatID, errMsg)
			return
		}
		finalModelID := *modelIDToUse

		// 4. Delete the last assistant message from DB
		if err := h.ChatService.DeleteMessage(lastAssistantMsg.ID); err != nil {
			// Log error but continue, maybe it was already gone?
			log.Printf("[Regen Chat %d] Error deleting previous assistant message %d: %v", chatID, lastAssistantMsg.ID, err)
		}

		// 5. Send WebSocket message to remove it from UI
		removePayload := ws.RemovePayload{ChatID: chatID, MessageID: lastAssistantMsg.ID}
		wsMsg := ws.Message{Type: ws.MsgTypeRemoveMessage, RemovePayload: &removePayload}
		h.ConnectorService.SendWsMessage(userID, wsMsg)

		// 6. Trigger generation using ConnectorService
		if err := h.ConnectorService.GenerateResponseForChat(ctx, userID, chatID, finalModelID, lastAssistantMsg.AgentID); err != nil {
			// Error already logged and sent via WS by GenerateResponseForChat
			log.Printf("[Regen Chat %d] Error returned from GenerateResponseForChat during regeneration: %v", chatID, err)
		}
	}(context.Background(), userID, chatID, req.ModelID)
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
	// Register the new search route
	mux.Handle("POST /api/chats/{chat_id}/search", mw(http.HandlerFunc(h.SearchChat)))
	log.Println("Registered user chat routes: GET /api/chats, POST /api/chats, GET/PUT/DELETE /api/chats/{id}, POST /api/chats/{id}/messages, POST /api/chats/{id}/messages/regenerate, POST /api/chats/{id}/search")
	// Register the new purge route
	mux.Handle("DELETE /api/chats/purge", mw(http.HandlerFunc(h.PurgeUserChats)))
	log.Println("Registered user chat route: DELETE /api/chats/purge")
}

// Method to set the search handlers delegate
func (h *ChatHandlers) SetSearchHandlersDelegate(delegate SearchHandlersDelegate) {
	h.searchHandlersDelegate = delegate
}

// Helper to format search results
func formatChatSearchResults(query string, results []ChatSearchResult) string {
	var builder strings.Builder
	builder.WriteString(fmt.Sprintf("--- Search Results for \"%s\" ---\n", query))
	if len(results) == 0 {
		builder.WriteString("(No results found)")
	} else {
		for i, result := range results {
			builder.WriteString(fmt.Sprintf("%d. %s\n   URL: %s\n   Snippet: %s\n\n",
				i+1, result.Title, result.URL, result.Snippet))
		}
	}
	builder.WriteString("----------------------------")
	return builder.String()
}

// These types/functions need to be added to connect to search_handlers.go functionality
type ChatSearchResult struct {
	Title   string `json:"title"`
	URL     string `json:"url"`
	Snippet string `json:"snippet"`
}

type SearchHandlersDelegate interface {
	GetSearchProvider(providerID *int) (*models.SearchProvider, error)
	PerformSearch(query string, provider *models.SearchProvider) ([]ChatSearchResult, error)
}
