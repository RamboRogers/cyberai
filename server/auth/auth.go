package auth

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/gorilla/sessions"
	"github.com/ramborogers/cyberai/server/middleware" // For context key and session name
	"github.com/ramborogers/cyberai/server/models"
)

// AuthHandlers provides handlers for authentication.
type AuthHandlers struct {
	Store       sessions.Store
	UserService *models.UserService
}

// NewAuthHandlers creates new authentication handlers.
func NewAuthHandlers(store sessions.Store, userService *models.UserService) *AuthHandlers {
	return &AuthHandlers{
		Store:       store,
		UserService: userService,
	}
}

// Login handles user login attempts via POST request.
func (h *AuthHandlers) Login(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	// Decode request body
	var creds struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	decoder := json.NewDecoder(r.Body)
	if err := decoder.Decode(&creds); err != nil {
		log.Printf("Login decode error: %v", err)
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Authenticate user
	user, err := h.UserService.Authenticate(creds.Username, creds.Password)
	if err != nil {
		// Authentication failed (invalid creds, inactive user, db error)
		log.Printf("Login failed for user '%s': %v", creds.Username, err)
		// Return a generic error message to avoid revealing specific failure reasons
		http.Error(w, "Invalid username or password", http.StatusUnauthorized)
		return
	}

	// Authentication successful, create session
	session, err := h.Store.Get(r, middleware.SessionName)
	if err != nil {
		// Log error, but try to proceed. Get might return a new session even on error.
		log.Printf("Error getting session store in Login: %v", err)
		// If we absolutely cannot get/create a session, return internal server error
		if session == nil { // Check if session is nil, indicating a severe store issue
			http.Error(w, "Session initialization failed", http.StatusInternalServerError)
			return
		}
	}

	// Store user ID in the session
	session.Values[string(middleware.UserIDContextKey)] = int(user.ID) // Ensure type matches middleware expectations (int)
	// Use default session options set during store initialization (MaxAge, HttpOnly etc.)

	if err := session.Save(r, w); err != nil {
		log.Printf("Error saving session for user %d: %v", user.ID, err)
		http.Error(w, "Failed to save session", http.StatusInternalServerError)
		return
	}

	log.Printf("Login successful for User ID: %d (%s)", user.ID, user.Username)
	// Return success status. Frontend will handle redirect.
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"message": "Login successful"}`))
}

// Logout handles user logout.
func (h *AuthHandlers) Logout(w http.ResponseWriter, r *http.Request) {
	session, err := h.Store.Get(r, middleware.SessionName)
	if err != nil {
		// Log the error, but still attempt to clear potentially stale cookie by sending MaxAge=-1
		log.Printf("Logout: Error getting session: %v. Attempting to clear cookie anyway.", err)
		// If session is nil, we can't modify it, but we can try sending the header manually
		if session == nil {
			// Manually set cookie expiration header
			// Note: Path, Domain, Secure, HttpOnly should match your session config
			// Fetching these dynamically can be complex, use defaults from initSessionStore
			// Ideally, gorilla/sessions handles this via session.Save
			// This is a fallback.
			cookie := &http.Cookie{
				Name:     middleware.SessionName,
				Value:    "",
				Path:     "/", // Match store options
				MaxAge:   -1,
				HttpOnly: true, // Match store options
				// Secure:   false, // Match store options (adjust if using HTTPS)
				// SameSite: http.SameSiteLaxMode, // Match store options
			}
			http.SetCookie(w, cookie)
			// Return success even if we couldn't get the session, as we tried to clear cookie
			log.Println("User logged out (session store error, cleared cookie manually)")
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(`{"message": "Logout successful"}`))
			return
		}
	}

	// Clear user ID from session (optional, good practice)
	delete(session.Values, string(middleware.UserIDContextKey))

	// Set MaxAge to -1 to delete the session cookie immediately
	session.Options.MaxAge = -1

	if err := session.Save(r, w); err != nil {
		// If saving fails, the cookie might not be cleared.
		log.Printf("Logout: Error saving session to delete cookie: %v", err)
		// Return an internal server error as logout might not have fully worked client-side
		http.Error(w, "Logout failed: Could not clear session cookie", http.StatusInternalServerError)
		return
	}

	log.Println("User logged out successfully")
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"message": "Logout successful"}`))
}
