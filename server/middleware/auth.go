// server/middleware/auth.go
package middleware

import (
	"context"
	"log"
	"net/http"

	"github.com/gorilla/sessions"
	"github.com/ramborogers/cyberai/server/models" // Will need UserService here
)

type contextKey string

const (
	UserIDContextKey contextKey = "userID"
	SessionName      string     = "cyberai-session" // Ensure this matches main.go
)

// SessionAuthMiddleware redirects unauthenticated users to the login page.
// It requires a session store and a UserService to check user validity (optional, can just check session).
func SessionAuthMiddleware(store sessions.Store, userService *models.UserService) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			session, err := store.Get(r, SessionName)
			if err != nil {
				// Ignore store errors for now, treat as unauthenticated
				log.Printf("Session store error in auth middleware: %v", err)
				http.Redirect(w, r, "/login", http.StatusFound)
				return
			}

			userID, ok := session.Values[string(UserIDContextKey)].(int)
			if !ok || userID <= 0 {
				// No valid userID in session
				http.Redirect(w, r, "/login", http.StatusFound)
				return
			}

			// Optional: Verify user still exists and is active in the database
			// user, err := userService.GetUserByID(userID) // Assumes GetUserByID exists
			// if err != nil || user == nil || !user.IsActive {
			//     log.Printf("User %d not found or inactive during auth check", userID)
			//     // Clear potentially invalid session
			//     session.Values[string(UserIDContextKey)] = 0
			//     session.Options.MaxAge = -1 // Expire cookie immediately
			//     if saveErr := session.Save(r, w); saveErr != nil {
			//         log.Printf("Error saving expired session: %v", saveErr)
			//     }
			//     http.Redirect(w, r, "/login", http.StatusFound)
			//     return
			// }

			// User is authenticated, add userID to context
			ctx := context.WithValue(r.Context(), UserIDContextKey, userID)
			log.Printf("SessionAuth: Authenticated User ID: %d for request: %s %s\n", userID, r.Method, r.URL.Path)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// AdminRequiredMiddleware checks if the authenticated user has the 'admin' role.
// It relies on SessionAuthMiddleware having run first (or performs its own session check).
// Requires a UserService to fetch the user's role.
func AdminRequiredMiddleware(store sessions.Store, userService *models.UserService) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		// First, ensure the user is authenticated via session
		// sessionAuthHandler := SessionAuthMiddleware(store, userService)(next) // REMOVED - unused

		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// ---- AdminRequiredMiddleware Logic ----
			// Check session directly
			sessionCheck, err := store.Get(r, SessionName)
			if err != nil {
				log.Printf("Session store error in admin middleware: %v", err)
				http.Redirect(w, r, "/login", http.StatusFound)
				return
			}

			userIDCheck, okCheck := sessionCheck.Values[string(UserIDContextKey)].(int)
			if !okCheck || userIDCheck <= 0 {
				// If the user isn't authenticated via session, redirect to login.
				log.Printf("AdminRequired: No valid user ID found in session for %s %s. Redirecting to login.", r.Method, r.URL.Path)
				http.Redirect(w, r, "/login", http.StatusFound)
				return
			}

			// User is authenticated via session, check role
			roleCheck, errCheck := userService.GetUserRole(int64(userIDCheck))
			if errCheck != nil {
				log.Printf("Error getting role for user %d in admin check: %v", userIDCheck, errCheck)
				http.Error(w, "Internal Server Error", http.StatusInternalServerError)
				return
			}

			if roleCheck != "admin" {
				log.Printf("AdminRequired: Access denied for User ID %d (role: %s) to %s %s\n", userIDCheck, roleCheck, r.Method, r.URL.Path)
				http.Error(w, "Forbidden: Administrator access required", http.StatusForbidden)
				return
			}

			// User is admin, add ID to context and proceed
			ctx := context.WithValue(r.Context(), UserIDContextKey, userIDCheck)
			log.Printf("AdminRequired: Granted access for User ID %d (role: admin) to %s %s\n", userIDCheck, r.Method, r.URL.Path)
			next.ServeHTTP(w, r.WithContext(ctx))
			// ---- End REVISED ----

		})
	}
}

// GetUserIDFromContext retrieves the user ID stored in the request context.
// Returns 0 if the user ID is not found or is not an integer.
func GetUserIDFromContext(ctx context.Context) int {
	userID, ok := ctx.Value(UserIDContextKey).(int)
	if !ok {
		// Don't log an error here, it's normal for public routes
		// log.Println("User ID not found in context or is not an integer.")
		return 0 // Indicates no user ID in context
	}
	return userID
}
