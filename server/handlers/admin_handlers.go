package handlers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"log"
	"net/http"
	"strconv"
	"strings"

	"github.com/ramborogers/cyberai/server/db"
	"github.com/ramborogers/cyberai/server/models"
)

// AdminHandlers provides handlers for admin-related endpoints
type AdminHandlers struct {
	ModelService    *models.ModelService
	ProviderService *models.ProviderService
	UserService     *models.UserService
	DB              *db.DB
	TemplatesFS     fs.FS
}

// NewAdminHandlers creates a new instance of AdminHandlers
func NewAdminHandlers(database *db.DB, templatesFS fs.FS) *AdminHandlers {
	return &AdminHandlers{
		ModelService:    models.NewModelService(database),
		ProviderService: models.NewProviderService(database),
		UserService:     models.NewUserService(database),
		DB:              database,
		TemplatesFS:     templatesFS,
	}
}

// RegisterAdminRoutes registers the admin routes with the server mux
func (h *AdminHandlers) RegisterAdminRoutes(mux *http.ServeMux) {
	// Admin page route
	mux.HandleFunc("/admin", func(w http.ResponseWriter, r *http.Request) {
		// Serve admin.html from the embedded filesystem
		serveFileFromFS(h.TemplatesFS, "admin.html", w, r)
	})

	// Model routes
	mux.HandleFunc("GET /api/admin/models", h.ListModels)
	mux.HandleFunc("POST /api/admin/models", h.CreateModel)
	mux.HandleFunc("GET /api/admin/models/{id}", h.GetModel)
	mux.HandleFunc("PUT /api/admin/models/{id}", h.UpdateModel)
	mux.HandleFunc("DELETE /api/admin/models/{id}", h.DeleteModel)

	// User routes
	mux.HandleFunc("GET /api/admin/users", h.ListUsers)
	mux.HandleFunc("POST /api/admin/users", h.CreateUser)
	mux.HandleFunc("GET /api/admin/users/{id}", h.GetUser)
	mux.HandleFunc("PUT /api/admin/users/{id}", h.UpdateUser)
	mux.HandleFunc("DELETE /api/admin/users/{id}", h.DeleteUser)

	// Role routes
	mux.HandleFunc("GET /api/admin/roles", h.ListRoles)
	mux.HandleFunc("GET /api/admin/roles/{id}/users", h.GetUsersByRole)

	// --- Provider Routes ---
	mux.HandleFunc("GET /api/admin/providers", h.ListProviders)
	mux.HandleFunc("POST /api/admin/providers", h.CreateProvider)
	mux.HandleFunc("GET /api/admin/providers/{id}", h.GetProvider)
	mux.HandleFunc("PUT /api/admin/providers/{id}", h.UpdateProvider)
	mux.HandleFunc("DELETE /api/admin/providers/{id}", h.DeleteProvider)
	mux.HandleFunc("POST /api/admin/providers/{id}/sync", h.SyncProviderModels)
}

// serveFileFromFS serves a file from the embedded filesystem
func serveFileFromFS(fsys fs.FS, fileName string, w http.ResponseWriter, r *http.Request) {
	file, err := fsys.Open(fileName)
	if err != nil {
		log.Printf("Error opening embedded file %s: %v", fileName, err)
		http.Error(w, "File not found", http.StatusNotFound)
		return
	}
	defer file.Close()

	stat, err := file.Stat()
	if err != nil {
		log.Printf("Error stating embedded file %s: %v", fileName, err)
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}

	// Set content type for HTML files
	if fileName == "admin.html" {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
	}

	// Convert to ReadSeeker
	readSeeker, ok := file.(io.ReadSeeker)
	if !ok {
		log.Printf("Error: embedded file %s does not implement io.ReadSeeker", fileName)
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}

	http.ServeContent(w, r, stat.Name(), stat.ModTime(), readSeeker)
}

// --- Model Handlers ---

// ListModels handles GET /api/admin/models
func (h *AdminHandlers) ListModels(w http.ResponseWriter, r *http.Request) {
	// TODO: Implement authentication check - admin only

	activeOnly := r.URL.Query().Get("active") == "true"

	var models []models.Model
	var err error
	if activeOnly {
		models, err = h.ModelService.GetActiveModels()
	} else {
		models, err = h.ModelService.GetAllModels()
	}

	if err != nil {
		log.Printf("Error listing models: %v", err)
		http.Error(w, "Failed to list models", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(models)
}

// CreateModel handles POST /api/admin/models
func (h *AdminHandlers) CreateModel(w http.ResponseWriter, r *http.Request) {
	// TODO: Implement authentication check - admin only

	var model models.Model
	if err := json.NewDecoder(r.Body).Decode(&model); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if err := h.ModelService.CreateModel(&model); err != nil {
		log.Printf("Error creating model: %v", err)
		http.Error(w, "Failed to create model", http.StatusInternalServerError)
		return
	}

	// Don't return the API key in the response
	// model.APIKey = "" // No longer exists on model

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(model)
}

// GetModel handles GET /api/admin/models/{id}
func (h *AdminHandlers) GetModel(w http.ResponseWriter, r *http.Request) {
	// TODO: Implement authentication check - admin only

	idStr := r.PathValue("id")
	modelID, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		http.Error(w, "Invalid model ID", http.StatusBadRequest)
		return
	}

	model, err := h.ModelService.GetModelByID(modelID)
	if err != nil {
		log.Printf("Error getting model %d: %v", modelID, err)
		http.Error(w, "Model not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(model)
}

// UpdateModel handles PUT /api/admin/models/{id}
func (h *AdminHandlers) UpdateModel(w http.ResponseWriter, r *http.Request) {
	// TODO: Implement authentication check - admin only

	idStr := r.PathValue("id")
	modelID, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		http.Error(w, "Invalid model ID", http.StatusBadRequest)
		return
	}

	// First check if the model exists
	_, err = h.ModelService.GetModelByID(modelID)
	if err != nil {
		log.Printf("Model %d not found for update: %v", modelID, err)
		http.Error(w, "Model not found", http.StatusNotFound)
		return
	}

	var model models.Model
	if err := json.NewDecoder(r.Body).Decode(&model); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Ensure the ID from the path matches the body
	model.ID = modelID

	if err := h.ModelService.UpdateModel(&model); err != nil {
		log.Printf("Error updating model %d: %v", modelID, err)
		http.Error(w, "Failed to update model", http.StatusInternalServerError)
		return
	}

	// Don't return the API key in the response
	// model.APIKey = "" // No longer exists on model

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(model)
}

// DeleteModel handles DELETE /api/admin/models/{id}
func (h *AdminHandlers) DeleteModel(w http.ResponseWriter, r *http.Request) {
	// TODO: Implement authentication check - admin only

	idStr := r.PathValue("id")
	modelID, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		http.Error(w, "Invalid model ID", http.StatusBadRequest)
		return
	}

	if err := h.ModelService.DeleteModel(modelID); err != nil {
		log.Printf("Error deleting model %d: %v", modelID, err)
		http.Error(w, "Failed to delete model", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// --- User Handlers ---

// ListUsers handles GET /api/admin/users
func (h *AdminHandlers) ListUsers(w http.ResponseWriter, r *http.Request) {
	// TODO: Implement authentication check - admin only

	activeOnly := r.URL.Query().Get("active") == "true"
	users, err := h.UserService.GetAllUsers(activeOnly)
	if err != nil {
		log.Printf("Error listing users: %v", err)
		http.Error(w, "Failed to list users", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(users)
}

// CreateUser handles POST /api/admin/users
func (h *AdminHandlers) CreateUser(w http.ResponseWriter, r *http.Request) {
	// TODO: Implement authentication check - admin only

	var userRequest struct {
		User     models.User `json:"user"`
		Password string      `json:"password"`
	}

	if err := json.NewDecoder(r.Body).Decode(&userRequest); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if err := h.UserService.CreateUser(&userRequest.User, userRequest.Password); err != nil {
		log.Printf("Error creating user: %v", err)
		http.Error(w, "Failed to create user", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(userRequest.User)
}

// GetUser handles GET /api/admin/users/{id}
func (h *AdminHandlers) GetUser(w http.ResponseWriter, r *http.Request) {
	// TODO: Implement authentication check - admin only

	idStr := r.PathValue("id")
	userID, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		http.Error(w, "Invalid user ID", http.StatusBadRequest)
		return
	}

	user, err := h.UserService.GetUserByID(userID)
	if err != nil {
		log.Printf("Error getting user %d: %v", userID, err)
		http.Error(w, "User not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(user)
}

// UpdateUser handles PUT /api/admin/users/{id}
func (h *AdminHandlers) UpdateUser(w http.ResponseWriter, r *http.Request) {
	// TODO: Implement authentication check - admin only

	idStr := r.PathValue("id")
	userID, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		http.Error(w, "Invalid user ID", http.StatusBadRequest)
		return
	}

	// First check if the user exists
	_, err = h.UserService.GetUserByID(userID)
	if err != nil {
		log.Printf("User %d not found for update: %v", userID, err)
		http.Error(w, "User not found", http.StatusNotFound)
		return
	}

	var user models.User
	if err := json.NewDecoder(r.Body).Decode(&user); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Ensure the ID from the path matches the body
	user.ID = userID

	if err := h.UserService.UpdateUser(&user); err != nil {
		log.Printf("Error updating user %d: %v", userID, err)
		http.Error(w, "Failed to update user", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(user)
}

// DeleteUser handles DELETE /api/admin/users/{id}
func (h *AdminHandlers) DeleteUser(w http.ResponseWriter, r *http.Request) {
	// TODO: Implement authentication check - admin only

	idStr := r.PathValue("id")
	userID, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		http.Error(w, "Invalid user ID", http.StatusBadRequest)
		return
	}

	// Currently, there's no direct DeleteUser method in UserService
	// We'll deactivate the user instead
	user, err := h.UserService.GetUserByID(userID)
	if err != nil {
		log.Printf("Error getting user %d: %v", userID, err)
		http.Error(w, "User not found", http.StatusNotFound)
		return
	}

	user.IsActive = false
	if err := h.UserService.UpdateUser(user); err != nil {
		log.Printf("Error deactivating user %d: %v", userID, err)
		http.Error(w, "Failed to deactivate user", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// --- Role Handlers ---

// ListRoles handles GET /api/admin/roles
func (h *AdminHandlers) ListRoles(w http.ResponseWriter, r *http.Request) {
	// TODO: Implement authentication check - admin only

	roles, err := h.UserService.GetAllRoles()
	if err != nil {
		log.Printf("Error listing roles: %v", err)
		http.Error(w, "Failed to list roles", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(roles)
}

// GetUsersByRole handles GET /api/admin/roles/{id}/users
func (h *AdminHandlers) GetUsersByRole(w http.ResponseWriter, r *http.Request) {
	// TODO: Implement authentication check - admin only

	idStr := r.PathValue("id")
	roleID, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		http.Error(w, "Invalid role ID", http.StatusBadRequest)
		return
	}

	users, err := h.UserService.GetUsersByRole(roleID)
	if err != nil {
		log.Printf("Error getting users for role %d: %v", roleID, err)
		http.Error(w, "Failed to get users", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(users)
}

// --- Provider Handlers ---

// ListProviders handles GET /api/admin/providers
func (h *AdminHandlers) ListProviders(w http.ResponseWriter, r *http.Request) {
	providers, err := h.ProviderService.GetAllProviders()
	if err != nil {
		log.Printf("Error listing providers: %v", err)
		http.Error(w, "Failed to list providers", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(providers)
}

// CreateProvider handles POST /api/admin/providers
func (h *AdminHandlers) CreateProvider(w http.ResponseWriter, r *http.Request) {
	var provider models.Provider
	if err := json.NewDecoder(r.Body).Decode(&provider); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Basic validation
	if provider.Name == "" || provider.Type == "" {
		http.Error(w, "Provider name and type are required", http.StatusBadRequest)
		return
	}

	if err := h.ProviderService.CreateProvider(&provider); err != nil {
		log.Printf("Error creating provider: %v", err)
		// Check for unique constraint error
		if strings.Contains(err.Error(), "UNIQUE constraint failed: providers.name") {
			http.Error(w, fmt.Sprintf("Provider name '%s' already exists", provider.Name), http.StatusConflict)
		} else {
			http.Error(w, "Failed to create provider", http.StatusInternalServerError)
		}
		return
	}

	// Don't return API key
	provider.APIKey = ""
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(provider)
}

// GetProvider handles GET /api/admin/providers/{id}
func (h *AdminHandlers) GetProvider(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	providerID, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		http.Error(w, "Invalid provider ID", http.StatusBadRequest)
		return
	}

	provider, err := h.ProviderService.GetProviderByID(providerID)
	if err != nil {
		// Check for not found error from service
		if strings.Contains(err.Error(), "not found") {
			http.Error(w, "Provider not found", http.StatusNotFound)
		} else {
			log.Printf("Error getting provider %d: %v", providerID, err)
			http.Error(w, "Failed to get provider", http.StatusInternalServerError)
		}
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(provider)
}

// UpdateProvider handles PUT /api/admin/providers/{id}
func (h *AdminHandlers) UpdateProvider(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	providerID, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		http.Error(w, "Invalid provider ID", http.StatusBadRequest)
		return
	}

	// Read the request body for debugging
	bodyBytes, err := io.ReadAll(r.Body)
	if err != nil {
		log.Printf("[DEBUG] Error reading request body: %v", err)
		http.Error(w, "Failed to read request body", http.StatusBadRequest)
		return
	}
	r.Body = io.NopCloser(bytes.NewBuffer(bodyBytes)) // Restore the body

	// Log the raw request
	log.Printf("[DEBUG] UpdateProvider raw body: %s", string(bodyBytes))

	var provider models.Provider
	if err := json.NewDecoder(r.Body).Decode(&provider); err != nil {
		log.Printf("[DEBUG] Error decoding provider JSON: %v", err)
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Log the decoded provider data
	log.Printf("[DEBUG] UpdateProvider provider data: ID=%d, Name=%s, Type=%s, API Key provided: %v",
		providerID, provider.Name, provider.Type, provider.APIKey != "")

	provider.ID = providerID

	if err := h.ProviderService.UpdateProvider(&provider); err != nil {
		// Check for not found error from service
		if strings.Contains(err.Error(), "not found") {
			http.Error(w, "Provider not found", http.StatusNotFound)
		} else if strings.Contains(err.Error(), "UNIQUE constraint failed: providers.name") {
			http.Error(w, fmt.Sprintf("Provider name '%s' already exists", provider.Name), http.StatusConflict)
		} else {
			log.Printf("Error updating provider %d: %v", providerID, err)
			http.Error(w, "Failed to update provider", http.StatusInternalServerError)
		}
		return
	}

	// Success - log and return
	log.Printf("[DEBUG] Provider %d successfully updated", providerID)

	// Return updated provider (without API key)
	provider.APIKey = ""
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(provider)
}

// DeleteProvider handles DELETE /api/admin/providers/{id}
func (h *AdminHandlers) DeleteProvider(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	providerID, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		http.Error(w, "Invalid provider ID", http.StatusBadRequest)
		return
	}

	if err := h.ProviderService.DeleteProvider(providerID); err != nil {
		// Check for not found error from service
		if strings.Contains(err.Error(), "not found") {
			http.Error(w, "Provider not found", http.StatusNotFound)
		} else {
			log.Printf("Error deleting provider %d: %v", providerID, err)
			http.Error(w, "Failed to delete provider", http.StatusInternalServerError)
		}
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// SyncProviderModels handles POST /api/admin/providers/{id}/sync
func (h *AdminHandlers) SyncProviderModels(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	providerID, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		http.Error(w, "Invalid provider ID", http.StatusBadRequest)
		return
	}

	// Optional: Parse request body for parameters like defaultTokens, setActive (similar to old import)
	var request struct {
		DefaultTokens int  `json:"default_tokens"`
		SetActive     bool `json:"set_active"`
	}
	// Allow empty body, use defaults if not provided
	_ = json.NewDecoder(r.Body).Decode(&request)
	// Set defaults if not provided in request (e.g., 8192 tokens, set active true)
	if request.DefaultTokens <= 0 {
		request.DefaultTokens = 8192
	}

	// Check provider type before attempting sync
	provider, err := h.ProviderService.GetProviderByID(providerID)
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			http.Error(w, "Provider not found", http.StatusNotFound)
		} else {
			log.Printf("Error getting provider %d for sync: %v", providerID, err)
			http.Error(w, "Failed to get provider details", http.StatusInternalServerError)
		}
		return
	}

	var createdModels []models.Model
	var syncErrors []error

	switch provider.Type {
	case models.ProviderOllama:
		createdModels, syncErrors = h.ModelService.SyncOllamaModelsForProvider(providerID, request.DefaultTokens, request.SetActive)
	case models.ProviderOpenAI:
		log.Printf("Starting OpenAI model sync for provider %d (%s)", providerID, provider.Name)
		createdModels, syncErrors = h.ModelService.SyncOpenAIModelsForProvider(providerID, request.DefaultTokens, request.SetActive)
	case models.ProviderAnthropic:
		http.Error(w, "Sync not yet implemented for Anthropic providers", http.StatusNotImplemented)
		return
	default:
		http.Error(w, fmt.Sprintf("Sync not supported for provider type '%s'", provider.Type), http.StatusBadRequest)
		return
	}

	// Log errors encountered during sync
	if len(syncErrors) > 0 {
		log.Printf("Errors encountered during sync for provider %d (%s):", providerID, provider.Name)
		for _, syncErr := range syncErrors {
			log.Printf("- %v", syncErr)
		}
		// Similar to previous import logic, return error only if nothing was achieved
		if len(createdModels) == 0 {
			http.Error(w, fmt.Sprintf("Failed to sync provider. See server logs. First error: %v", syncErrors[0]), http.StatusInternalServerError)
			return
		}
	}

	// Return response: maybe number created, updated, deactivated?
	// For now, mimic the old response: return newly created models.
	response := struct {
		ModelsCreated  int            `json:"models_created"`
		Models         []models.Model `json:"models"`
		ErrorsOccurred bool           `json:"errors_occurred,omitempty"`
	}{
		ModelsCreated:  len(createdModels),
		Models:         createdModels,
		ErrorsOccurred: len(syncErrors) > 0,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// --- Helper functions (e.g., for parsing requests, sending responses) ---
// Could be added here or in a separate utils package if they grow complex
