// server/handlers/model_handlers.go
package handlers

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/ramborogers/cyberai/server/models"
)

type ModelHandlers struct {
	ModelService *models.ModelService // Dependency injection
}

func NewModelHandlers(ms *models.ModelService) *ModelHandlers {
	return &ModelHandlers{ModelService: ms}
}

// ListModels handles GET /api/models
func (h *ModelHandlers) ListModels(w http.ResponseWriter, r *http.Request) {
	// No need to check auth here, middleware already handled it.
	// UserID could be retrieved from context if needed for filtering later:
	// userID := middleware.GetUserIDFromContext(r.Context())
	// log.Printf("ListModels called by User ID: %d", userID)

	log.Println("API Call: GET /api/models")

	userFacingModels, err := h.ModelService.GetActiveUserFacingModels()
	if err != nil {
		log.Printf("Error fetching active user-facing models: %v", err)
		http.Error(w, "Failed to fetch models", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	if err := json.NewEncoder(w).Encode(userFacingModels); err != nil {
		log.Printf("Error encoding models response: %v", err)
		// Don't try to write another error header if encoding fails after status OK
	}
}

// RegisterUserRoutes connects the handler functions to the router
func (h *ModelHandlers) RegisterUserRoutes(mux *http.ServeMux, mw func(http.Handler) http.Handler) {
	// Apply middleware (mw) to user routes
	mux.Handle("GET /api/models", mw(http.HandlerFunc(h.ListModels)))
	log.Println("Registered user model routes: GET /api/models")
}
