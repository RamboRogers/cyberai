package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/gorilla/mux"
	"github.com/ramborogers/cyberai/server/llm"
	"github.com/ramborogers/cyberai/server/middleware"
	"github.com/ramborogers/cyberai/server/models"
)

// SearchRequest represents a search API request
type SearchRequest struct {
	Query      string `json:"query"`
	ProviderID *int   `json:"provider_id,omitempty"`
}

// SearchResult represents a single search result
type SearchResult struct {
	Title   string `json:"title"`
	URL     string `json:"url"`
	Snippet string `json:"snippet"`
}

// SearchResponse represents the response from a search API
type SearchResponse struct {
	Results []SearchResult `json:"results"`
	Error   string         `json:"error,omitempty"`
}

// SearchAndChatRequest represents a request to search and affect a chat
type SearchAndChatRequest struct {
	Query            string `json:"query"`
	ModelID          *int64 `json:"model_id,omitempty"`           // Model ID for new chat or response
	SearchProviderID *int   `json:"search_provider_id,omitempty"` // Use int, match SearchRequest
}

// SearchAndChatResponse represents the response when a new chat is created
type SearchAndChatResponse struct {
	ChatID        int64  `json:"chat_id"`
	ChatName      string `json:"chat_name"`
	UserMessageID int64  `json:"user_message_id"`
	Error         string `json:"error,omitempty"`
}

// ChatSearchResponse represents the response when adding to an existing chat
type ChatSearchResponse struct {
	ChatID        int64  `json:"chat_id"`
	UserMessageID int64  `json:"user_message_id"`
	Error         string `json:"error,omitempty"`
}

// SearchHandlers handles search-related API endpoints
type SearchHandlers struct {
	searchProviderSvc *models.SearchProviderService
	connectorService  *llm.ConnectorService
	modelService      *models.ModelService
	chatService       *models.ChatService
}

// NewSearchHandlers creates a new SearchHandlers instance
func NewSearchHandlers(searchProviderSvc *models.SearchProviderService, connectorService *llm.ConnectorService,
	modelService *models.ModelService, chatService *models.ChatService) *SearchHandlers {
	return &SearchHandlers{
		searchProviderSvc: searchProviderSvc,
		connectorService:  connectorService,
		modelService:      modelService,
		chatService:       chatService,
	}
}

// Search handles simple web search requests (returns only results)
func (h *SearchHandlers) Search(w http.ResponseWriter, r *http.Request) {
	// ... (Implementation remains the same - get provider, call performSearch, return SearchResponse) ...
	var req SearchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	if req.Query == "" {
		http.Error(w, "Query is required", http.StatusBadRequest)
		return
	}

	provider, err := h.GetSearchProvider(req.ProviderID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if provider == nil {
		http.Error(w, "Search provider not found", http.StatusNotFound)
		return
	}

	results, err := h.PerformSearch(req.Query, provider)
	if err != nil {
		http.Error(w, fmt.Sprintf("Search failed: %v", err), http.StatusInternalServerError)
		return
	}

	response := SearchResponse{Results: results}
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(response); err != nil {
		http.Error(w, "Failed to encode response", http.StatusInternalServerError)
	}
}

// SearchAndChat handles requests to search and create a NEW chat with the results
func (h *SearchHandlers) SearchAndChat(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(middleware.UserIDContextKey)
	if userID == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	uid, ok := userID.(int)
	if !ok || uid <= 0 {
		http.Error(w, "Invalid User ID", http.StatusInternalServerError)
		return
	}

	var req SearchAndChatRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	if req.Query == "" {
		http.Error(w, "Query is required", http.StatusBadRequest)
		return
	}

	provider, err := h.GetSearchProvider(req.SearchProviderID)
	if err != nil {
		// Log internal error but tell user it's unavailable
		log.Printf("SearchAndChat: Error getting search provider: %v", err)
		http.Error(w, "Search service is currently unavailable.", http.StatusServiceUnavailable)
		return
	}

	// --- Start: Handle No Provider Found ---
	if provider == nil {
		log.Printf("SearchAndChat: No search provider configured or found.")
		// We still need to create the chat and add the user message
		modelID, err := h.getModelIDForRequest(req.ModelID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusServiceUnavailable)
			return
		}
		chatTitle := fmt.Sprintf("Search: %s", req.Query)
		if len(chatTitle) > 100 {
			chatTitle = chatTitle[:97] + "..."
		}
		newChat, err := h.chatService.CreateChat(int64(uid), chatTitle)
		if err != nil {
			log.Printf("Error creating new chat for search (no provider case): %v", err)
			http.Error(w, "Failed to create chat", http.StatusInternalServerError)
			return
		}
		userMsg := &models.Message{
			ChatID:  newChat.ID,
			UserID:  int64(uid),
			Role:    "user",
			Content: req.Query,
		}
		if err = h.chatService.AddMessage(userMsg); err != nil {
			log.Printf("Error adding user message to new chat %d (no provider case): %v", newChat.ID, err)
			http.Error(w, "Failed to save user message", http.StatusInternalServerError)
			return
		}
		// Add the notification message instead of search results
		sysMsg := &models.Message{
			ChatID:    newChat.ID,
			UserID:    0,
			Role:      "system",
			Content:   "Search is not configured. Please ask an administrator to add a search provider in the admin settings.",
			ModelID:   &modelID,
			CreatedAt: time.Now().Add(time.Millisecond),
		}
		if err = h.chatService.AddMessage(sysMsg); err != nil {
			log.Printf("Error adding system notification message to new chat %d: %v", newChat.ID, err)
			// Log error, but proceed to return the chat info
		}

		// Return success, but don't trigger LLM
		response := SearchAndChatResponse{
			ChatID:        newChat.ID,
			ChatName:      newChat.Title,
			UserMessageID: userMsg.ID,
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		if err := json.NewEncoder(w).Encode(response); err != nil {
			log.Printf("Error encoding search-and-chat response (no provider case): %v", err)
		}
		return // Stop processing here
	}
	// --- End: Handle No Provider Found ---

	results, err := h.PerformSearch(req.Query, provider)
	if err != nil {
		http.Error(w, fmt.Sprintf("Search failed: %v", err), http.StatusInternalServerError)
		return
	}

	formattedResults := formatSearchResults(req.Query, results)

	modelID, err := h.getModelIDForRequest(req.ModelID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusServiceUnavailable)
		return
	}

	// Create New Chat
	chatTitle := fmt.Sprintf("Search: %s", req.Query)
	if len(chatTitle) > 100 {
		chatTitle = chatTitle[:97] + "..."
	}
	newChat, err := h.chatService.CreateChat(int64(uid), chatTitle)
	if err != nil {
		log.Printf("Error creating new chat for search: %v", err)
		http.Error(w, "Failed to create chat", http.StatusInternalServerError)
		return
	}

	// 5. Add User Message (Query Only) to the NEW chat
	userMsg := &models.Message{
		ChatID:  newChat.ID,
		UserID:  int64(uid),
		Role:    "user",
		Content: req.Query, // Just the query
	}
	if err = h.chatService.AddMessage(userMsg); err != nil {
		log.Printf("Error adding user message to new chat %d: %v", newChat.ID, err)
		http.Error(w, "Failed to save user message", http.StatusInternalServerError)
		return // Stop if user message fails
	}

	// 6. Add System Message (Formatted Results) to the NEW chat
	sysMsg := &models.Message{
		ChatID:    newChat.ID,
		UserID:    0, // System message
		Role:      "system",
		Content:   formattedResults,                 // Just the results
		ModelID:   &modelID,                         // Associate with the model that will respond
		CreatedAt: time.Now().Add(time.Millisecond), // Ensure it sorts after user msg
	}
	if err = h.chatService.AddMessage(sysMsg); err != nil {
		log.Printf("Error adding system results message to new chat %d: %v", newChat.ID, err)
		// Log error but continue, AI will generate without results context
	} else {
		// *** Add the specific search instruction prompt AFTER the results ***
		instructionMsg := models.Message{
			ChatID:    newChat.ID,
			UserID:    0, // System message
			Role:      "system",
			Content:   searchInstructionPrompt,
			ModelID:   &modelID,                             // Associate with the same model
			CreatedAt: time.Now().Add(2 * time.Millisecond), // Ensure it sorts after results msg
		}
		if instructionErr := h.chatService.AddMessage(&instructionMsg); instructionErr != nil {
			log.Printf("Error adding search instruction message to new chat %d: %v", newChat.ID, instructionErr)
			// Log error, but AI generation will still proceed (just without specific instructions)
		}

		// 7. Trigger AI response for the NEW chat using the determined model ID
		log.Printf("[SearchAndChat %d] Triggering AI response using model %d", newChat.ID, modelID)
		go func() {
			if err := h.connectorService.GenerateResponseForChat(context.Background(), uid, newChat.ID, modelID, nil); err != nil {
				log.Printf("[SearchAndChat %d] Error returned from GenerateResponseForChat: %v", newChat.ID, err)
			}
		}()
	}

	// 8. Return the details of the NEWLY created chat
	response := SearchAndChatResponse{
		ChatID:        newChat.ID,
		ChatName:      newChat.Title,
		UserMessageID: userMsg.ID, // Return ID of the user's query message
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK) // Use 200 OK as per API.md
	if err := json.NewEncoder(w).Encode(response); err != nil {
		log.Printf("Error encoding search-and-chat response: %v", err)
	}
}

// ChatSearch handles requests to search and add results to an EXISTING chat
func (h *SearchHandlers) ChatSearch(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(middleware.UserIDContextKey)
	if userID == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	uid, ok := userID.(int)
	if !ok || uid <= 0 {
		http.Error(w, "Invalid User ID", http.StatusInternalServerError)
		return
	}

	vars := mux.Vars(r)
	chatIDStr, ok := vars["chat_id"]
	if !ok {
		http.Error(w, "Missing chat ID", http.StatusBadRequest)
		return
	}
	chatID, err := strconv.ParseInt(chatIDStr, 10, 64)
	if err != nil {
		http.Error(w, "Invalid chat ID", http.StatusBadRequest)
		return
	}

	// Verify chat ownership
	chat, err := h.chatService.GetChat(chatID, false)
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			http.Error(w, "Chat not found", http.StatusNotFound)
		} else {
			http.Error(w, "Error retrieving chat", http.StatusInternalServerError)
		}
		return
	}
	if chat.UserID != int64(uid) {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	var req SearchAndChatRequest // Note: ModelID from req might be ignored for existing chat
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	if req.Query == "" {
		http.Error(w, "Query is required", http.StatusBadRequest)
		return
	}

	// Determine Search Provider
	provider, err := h.GetSearchProvider(req.SearchProviderID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if provider == nil {
		http.Error(w, "Search provider not found", http.StatusNotFound)
		return
	}

	// Perform Search
	results, err := h.PerformSearch(req.Query, provider)
	if err != nil {
		http.Error(w, fmt.Sprintf("Search failed: %v", err), http.StatusInternalServerError)
		return
	}

	// Format Results
	var resultsBuilder strings.Builder
	resultsBuilder.WriteString(fmt.Sprintf("--- Search Results for \"%s\" ---\n", req.Query))
	if len(results) == 0 {
		resultsBuilder.WriteString("(No results found)")
	} else {
		for i, result := range results {
			resultsBuilder.WriteString(fmt.Sprintf("%d. %s\n   URL: %s\n   Snippet: %s\n\n",
				i+1, result.Title, result.URL, result.Snippet))
		}
	}
	formattedResultsStr := resultsBuilder.String()

	// 3. Add User Message (Query Only) to the EXISTING chat
	userMsg := &models.Message{
		ChatID:  chatID,
		UserID:  int64(uid),
		Role:    "user",
		Content: req.Query, // Just the query
	}
	if err = h.chatService.AddMessage(userMsg); err != nil {
		log.Printf("Error adding user message to chat %d: %v", chatID, err)
		http.Error(w, "Failed to add user message", http.StatusInternalServerError)
		return // Stop if user message fails
	}

	// 4. Determine Model ID for the response
	modelID, err := h.getModelIDForRequest(nil)
	if err != nil {
		http.Error(w, err.Error(), http.StatusServiceUnavailable)
		return
	}

	// 5. Add System Message (Formatted Results) to the EXISTING chat
	sysMsg := &models.Message{
		ChatID:    chatID,
		UserID:    0, // System message
		Role:      "system",
		Content:   formattedResultsStr, // Use formattedResultsStr here
		ModelID:   &modelID,
		CreatedAt: time.Now().Add(time.Millisecond), // Ensure it sorts after user msg
	}
	if err = h.chatService.AddMessage(sysMsg); err != nil {
		log.Printf("Error adding system results message to chat %d: %v", chatID, err)
		// Log error but continue
	} else {
		// *** Add the specific search instruction prompt AFTER the results ***
		instructionMsg := models.Message{
			ChatID:    chatID,
			UserID:    0, // System message
			Role:      "system",
			Content:   searchInstructionPrompt,
			ModelID:   &modelID,                             // Associate with the same model
			CreatedAt: time.Now().Add(2 * time.Millisecond), // Ensure it sorts after results msg
		}
		if instructionErr := h.chatService.AddMessage(&instructionMsg); instructionErr != nil {
			log.Printf("Error adding search instruction message to chat %d: %v", chatID, instructionErr)
			// Log error, but AI generation will still proceed (just without specific instructions)
		}

		// 6. Trigger AI Response asynchronously for the EXISTING chat
		log.Printf("[Chat %d Search] Triggering AI response using model %d", chatID, modelID)
		go func() {
			if err := h.connectorService.GenerateResponseForChat(context.Background(), uid, chatID, modelID, nil); err != nil {
				log.Printf("[Chat %d Search] Error returned from GenerateResponseForChat: %v", chatID, err)
			}
		}()
	}

	// Return response with chat and USER message IDs immediately
	response := ChatSearchResponse{
		ChatID:        chatID,
		UserMessageID: userMsg.ID, // Return ID of the user's query message
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	if err := json.NewEncoder(w).Encode(response); err != nil {
		log.Printf("Error encoding chat-search response: %v", err)
	}
}

// --- Helper Functions ---

// GetSearchProvider gets a search provider by ID or the default if ID is nil
func (h *SearchHandlers) GetSearchProvider(providerID *int) (*models.SearchProvider, error) {
	if providerID != nil && *providerID > 0 {
		provider, err := h.searchProviderSvc.GetSearchProviderByID(int64(*providerID))
		if err != nil {
			log.Printf("Error getting specified search provider (ID %d): %v", *providerID, err)
			return nil, fmt.Errorf("failed to get requested search provider")
		}
		return provider, nil
	} else {
		defaultProvider, err := h.searchProviderSvc.GetDefaultProvider()
		if err != nil {
			log.Printf("Error getting default search provider: %v", err)
			return nil, fmt.Errorf("failed to get default search provider")
		}
		return defaultProvider, nil
	}
}

func formatSearchResults(query string, results []SearchResult) string {
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

func (h *SearchHandlers) getModelIDForRequest(requestedModelID *int64) (int64, error) {
	if requestedModelID != nil && *requestedModelID > 0 {
		// TODO: Validate model exists and is active
		log.Printf("Using requested Model ID: %d", *requestedModelID)
		return *requestedModelID, nil
	}

	// Fallback: Find Default/First Active Model
	models, err := h.modelService.GetActiveModels()
	if err != nil || len(models) == 0 {
		log.Printf("Error getting active models or none available: %v", err)
		return 0, fmt.Errorf("no AI models available")
	}

	var modelID int64
	var modelFound bool
	for _, m := range models {
		if m.IsActive {
			if !modelFound || m.DefaultSystemPrompt != "" { // Prefer default prompt model
				modelID = m.ID
				modelFound = true
			}
		}
	}

	if !modelFound {
		log.Printf("No active/default models available")
		return 0, fmt.Errorf("no active AI models available")
	}
	log.Printf("No model requested, using default/first active Model ID: %d", modelID)
	return modelID, nil
}

// PerformSearch executes a search using the appropriate provider and returns results
func (h *SearchHandlers) PerformSearch(query string, provider *models.SearchProvider) ([]SearchResult, error) {
	log.Printf("Performing search with provider %s (ID: %d) for query: %s", provider.Name, provider.ID, query)

	switch provider.Type {
	case models.SearchProviderBrave:
		return h.searchWithBrave(query, provider.APIKey)
	case models.SearchProviderGoogleCSE:
		return h.searchWithGoogleCSE(query, provider.APIKey, provider.SearchEngineID.String)
	default:
		return nil, fmt.Errorf("unsupported search provider type: %s", provider.Type)
	}
}

// searchWithBrave performs a search using the Brave Search API
func (h *SearchHandlers) searchWithBrave(query string, apiKey string) ([]SearchResult, error) {
	// ... (Implementation remains the same)
	endpoint := "https://api.search.brave.com/res/v1/web/search"
	req, err := http.NewRequest("GET", endpoint, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create Brave Search request: %w", err)
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("X-Subscription-Token", apiKey)
	q := req.URL.Query()
	q.Add("q", query)
	q.Add("count", "10")
	req.URL.RawQuery = q.Encode()
	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to execute Brave Search request: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("Brave Search API error (status %d): %s", resp.StatusCode, string(bodyBytes))
	}
	var braveResponse struct {
		Web struct {
			Results []struct {
				Title       string `json:"title"`
				URL         string `json:"url"`
				Description string `json:"description"`
			} `json:"results"`
		} `json:"web"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&braveResponse); err != nil {
		return nil, fmt.Errorf("failed to decode Brave Search response: %w", err)
	}
	results := make([]SearchResult, 0, len(braveResponse.Web.Results))
	for _, r := range braveResponse.Web.Results {
		results = append(results, SearchResult{Title: r.Title, URL: r.URL, Snippet: r.Description})
	}
	log.Printf("[Brave Search] Found %d results for query '%s'", len(results), query)
	return results, nil
}

// searchWithGoogleCSE performs a search using the Google Custom Search Engine API
func (h *SearchHandlers) searchWithGoogleCSE(query string, apiKey string, searchEngineID string) ([]SearchResult, error) {
	// ... (Implementation remains the same)
	endpoint := "https://www.googleapis.com/customsearch/v1"
	baseURL, err := url.Parse(endpoint)
	if err != nil {
		return nil, fmt.Errorf("failed to parse Google CSE URL: %w", err)
	}
	params := url.Values{}
	params.Add("key", apiKey)
	params.Add("cx", searchEngineID)
	params.Add("q", query)
	params.Add("num", "10")
	baseURL.RawQuery = params.Encode()
	resp, err := http.Get(baseURL.String())
	if err != nil {
		return nil, fmt.Errorf("failed to execute Google CSE request: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("Google CSE API error (status %d): %s", resp.StatusCode, string(bodyBytes))
	}
	var googleResponse struct {
		Items []struct {
			Title   string `json:"title"`
			Link    string `json:"link"`
			Snippet string `json:"snippet"`
		} `json:"items"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&googleResponse); err != nil {
		return nil, fmt.Errorf("failed to decode Google CSE response: %w", err)
	}
	results := make([]SearchResult, 0, len(googleResponse.Items))
	for _, item := range googleResponse.Items {
		results = append(results, SearchResult{Title: item.Title, URL: item.Link, Snippet: item.Snippet})
	}
	log.Printf("[Google CSE Search] Found %d results for query '%s'", len(results), query)
	return results, nil
}
