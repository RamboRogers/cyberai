// server/handlers/user_handlers.go
package handlers

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/ramborogers/cyberai/server/middleware"
	"github.com/ramborogers/cyberai/server/models"
)

// UserHandlers struct holds dependencies for user-related handlers
type UserHandlers struct {
	UserService *models.UserService
}

// NewUserHandlers creates a new instance of UserHandlers
func NewUserHandlers(us *models.UserService) *UserHandlers {
	return &UserHandlers{UserService: us}
}

// GetCurrentUser handles GET /api/user/me
// It retrieves the details of the currently authenticated user.
func (h *UserHandlers) GetCurrentUser(w http.ResponseWriter, r *http.Request) {
	userID64 := int64(middleware.GetUserIDFromContext(r.Context()))
	if userID64 == 0 {
		// This condition might be hit if middleware is bypassed or fails,
		// though TempAdminAuthMiddleware currently always provides ID 1.
		log.Println("Error in GetCurrentUser: User ID is 0 in context")
		http.Error(w, "Unauthorized: User ID not found in context", http.StatusUnauthorized)
		return
	}

	log.Printf("API Call: GET /api/user/me for User ID: %d", userID64)

	// Fetch user details using the UserService
	user, err := h.UserService.GetUserByID(userID64)
	if err != nil {
		log.Printf("Error fetching user %d: %v", userID64, err)
		// Distinguish between not found and other errors
		// Assuming GetUserByID returns a specific error type or message for "not found"
		// For now, using a simple string check which might need refinement based on actual error.
		if err.Error() == "user not found" { // Adjust this check based on actual UserService error
			http.Error(w, "User not found", http.StatusNotFound)
		} else {
			http.Error(w, "Internal Server Error: Failed to fetch user data", http.StatusInternalServerError)
		}
		return
	}

	// We have the user data. Ensure password hash is not sent.
	// The User struct already excludes PasswordHash via `json:"-"` tag.

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	if err := json.NewEncoder(w).Encode(user); err != nil {
		log.Printf("Error encoding current user response for user %d: %v", userID64, err)
		// Don't try to write another error header if encoding fails after status OK
	}
}

// RegisterUserSelfRoutes connects the handler functions for user self-management to the router
func (h *UserHandlers) RegisterUserSelfRoutes(mux *http.ServeMux, mw func(http.Handler) http.Handler) {
	// Apply middleware (mw) to user self-management routes
	mux.Handle("GET /api/user/me", mw(http.HandlerFunc(h.GetCurrentUser)))
	log.Println("Registered user self route: GET /api/user/me")
	// Add other routes like PUT /api/user/me for profile updates, POST /api/user/me/password for password changes later
}
