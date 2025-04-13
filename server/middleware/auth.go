// server/middleware/auth.go
package middleware

import (
	"context"
	"log"
	"net/http"
	// "github.com/ramborogers/cyberai/server/models" // Assuming user service exists
)

type contextKey string

const UserIDContextKey contextKey = "userID"

// DevMode controls whether to use development mode authentication
// In development mode, authentication is bypassed and users are assigned admin privileges
var DevMode bool = false

// TempAdminAuthMiddleware enforces authentication, defaulting to admin user (ID 1) for development.
// !!! WARNING: Replace this with real authentication !!!
func TempAdminAuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		log.Println("WARNING: Using temporary admin authentication middleware!")

		// --- !!! TEMPORARY HARDCODED ADMIN USER !!! ---
		// In a real implementation, you would:
		// 1. Check for a session token (e.g., in a cookie or Authorization header).
		// 2. Validate the token.
		// 3. Extract the user ID from the token.
		// 4. Fetch user details from the database (UserService).
		// 5. Handle errors (invalid token, user not found, etc.) by returning 401 Unauthorized.

		adminUserID := 1 // Hardcoded admin user ID
		// --- END TEMPORARY ---

		// Add user ID to the request context
		ctx := context.WithValue(r.Context(), UserIDContextKey, adminUserID)
		log.Printf("TempAuth: Authenticated as User ID: %d for request: %s %s\n", adminUserID, r.Method, r.URL.Path)

		// Call the next handler with the updated context
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// GetUserIDFromContext retrieves the user ID stored in the request context.
// Returns 0 if the user ID is not found or is not an integer.
// In development mode, it will return 1 (admin) even if the context is missing a user ID.
func GetUserIDFromContext(ctx context.Context) int {
	// In development mode, return admin user ID (1) regardless of context
	if DevMode {
		return 1
	}

	userID, ok := ctx.Value(UserIDContextKey).(int)
	if !ok {
		log.Println("Error: User ID not found in context or is not an integer.")
		return 0 // Or handle error appropriately
	}
	return userID
}

// SetDevMode sets the development mode flag
func SetDevMode(enabled bool) {
	DevMode = enabled
	if enabled {
		log.Println("WARNING: Development mode enabled - authentication checks will be bypassed!")
	} else {
		log.Println("Development mode disabled - full authentication required")
	}
}
