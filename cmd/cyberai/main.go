package main

import (
	"context"
	"encoding/gob"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
	"time"

	"github.com/gorilla/sessions"
	"github.com/ramborogers/cyberai/server/auth"
	"github.com/ramborogers/cyberai/server/db"
	"github.com/ramborogers/cyberai/server/handlers"
	"github.com/ramborogers/cyberai/server/llm"
	"github.com/ramborogers/cyberai/server/middleware"
	"github.com/ramborogers/cyberai/server/models"
	"github.com/ramborogers/cyberai/server/ws"
	"github.com/ramborogers/cyberai/ui"
)

var (
	// Store for session management
	cookieStore *sessions.CookieStore
)

const (
	DefaultPort       = "8080"
	DefaultSessionKey = "default-dev-session-key-replace-me!" // Replace in production!
	SessionName       = "cyberai-session"
	BannerText        = "\033[32m" + `
 █████╗ ██╗   ██╗██████╗ ███████╗██████╗  █████╗ ██╗
██╔══██╗╚██╗ ██╔╝██╔══██╗██╔════╝██╔══██╗██╔══██╗██║
██║  ╚═╝ ╚████╔╝ ██████╔╝█████╗  ██████╔╝███████║██║
██║      ╚██╔╝  ██╔══██╗██╔══╝  ██╔══██╗██╔══██║██║
╚██████╗  ██║   ██████╔╝███████╗██║  ██║██║  ██║██║
 ╚═════╝  ╚═╝   ╚═════╝ ╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝

     [ Secure Multi-Model AI Chat Platform ]
           << Version 0.1.0 >>
` + "\033[0m"
)

// -- Logging Middleware --

// Placeholder for trusted proxy IPs. Configure this based on your environment.
// Example: var trustedProxies = []string{"192.168.1.1", "10.0.0.1"}
var trustedProxies = []string{"127.0.0.1", "::1"} // Trust localhost/loopback by default

// isTrustedProxy checks if a given remote address belongs to the trusted list
func isTrustedProxy(remoteAddr string) bool {
	// Attempt to split host and port, ignore port
	host, _, err := net.SplitHostPort(remoteAddr)
	if err != nil {
		// If splitting fails, assume it might be just an IP
		host = remoteAddr
	}

	for _, trusted := range trustedProxies {
		if host == trusted {
			return true
		}
	}
	return false
}

// getClientIP extracts the client IP, considering X-Forwarded-For from trusted proxies
func getClientIP(r *http.Request) string {
	remoteAddr := r.RemoteAddr

	if isTrustedProxy(remoteAddr) {
		xff := r.Header.Get("X-Forwarded-For")
		if xff != "" {
			// X-Forwarded-For can be a comma-separated list (client, proxy1, proxy2)
			ips := strings.Split(xff, ",")
			if len(ips) > 0 {
				clientIP := strings.TrimSpace(ips[0])
				if clientIP != "" {
					return clientIP // Return the first IP in the list
				}
			}
		}

		// Fallback: Check X-Real-IP if X-Forwarded-For is not useful
		xRealIP := r.Header.Get("X-Real-IP")
		if xRealIP != "" {
			return strings.TrimSpace(xRealIP)
		}
	}

	// Default to RemoteAddr if not proxied or header is missing/invalid
	// Attempt to split host and port, return only host if successful
	host, _, err := net.SplitHostPort(remoteAddr)
	if err == nil {
		return host
	}
	return remoteAddr // Return the raw RemoteAddr if splitting fails
}

// responseWriterWrapper wraps http.ResponseWriter to capture the status code
type responseWriterWrapper struct {
	http.ResponseWriter
	statusCode int
}

func newResponseWriterWrapper(w http.ResponseWriter) *responseWriterWrapper {
	// Default status code is 200 OK
	return &responseWriterWrapper{w, http.StatusOK}
}

// WriteHeader captures the status code before writing the header
func (rww *responseWriterWrapper) WriteHeader(code int) {
	rww.statusCode = code
	rww.ResponseWriter.WriteHeader(code)
}

// loggingMiddleware logs details about each HTTP request, supporting X-Forwarded-For
func loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		wrapper := newResponseWriterWrapper(w)

		// Call the next handler in the chain
		next.ServeHTTP(wrapper, r)

		duration := time.Since(start)
		clientIP := getClientIP(r) // Get client IP considering proxy headers

		// Log the request details including the captured status code and client IP
		log.Printf(
			"%s - %s %s - %d %s (%s)", // Updated format string
			clientIP,
			r.Method,
			r.URL.Path,
			wrapper.statusCode,
			http.StatusText(wrapper.statusCode),
			duration,
		)
	})
}

// -- End Logging Middleware --

// initSessionStore initializes the cookie store for session management
func initSessionStore() {
	// Get session key from environment variable
	sessionKey := os.Getenv("SESSION_KEY")
	if sessionKey == "" {
		log.Printf("WARNING: SESSION_KEY environment variable not set. Using default insecure key. SET THIS IN PRODUCTION!")
		sessionKey = DefaultSessionKey
	} else if len(sessionKey) < 32 {
		log.Printf("WARNING: SESSION_KEY is less than 32 bytes (%d bytes). Consider using a longer key.", len(sessionKey))
	}

	// Ensure the key length is appropriate if a default wasn't used,
	// though CookieStore handles different key lengths.
	// Using a key derived potentially from a random source if needed,
	// but here we just use the provided/default key directly.
	// It's better to generate a strong key externally and set it via env var.

	// Initialize the cookie store
	cookieStore = sessions.NewCookieStore([]byte(sessionKey))

	// Configure session options (optional but recommended)
	cookieStore.Options = &sessions.Options{
		Path:     "/",
		MaxAge:   86400 * 7, // 7 days
		HttpOnly: true,      // Prevent client-side script access
		Secure:   false,     // Set to true if using HTTPS
		SameSite: http.SameSiteLaxMode,
	}

	// Register types that will be stored in the session.
	// We need to register basic types like int for the user ID.
	gob.Register(0) // Register int type (specifically 0, but registers int generally)
}

func main() {
	// Log startup information
	log.Printf("Starting CyberAI Server")
	log.Printf("OS: %s, Architecture: %s", runtime.GOOS, runtime.GOARCH)

	// Initialize session store early
	initSessionStore()

	// Create a new WebSocket hub
	log.Println("Creating WebSocket hub")
	hub := ws.NewHub()
	go hub.Run()

	// Initialize database
	database, err := initDatabase()
	if err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	log.Println("Database initialized successfully")

	// Initialize services
	modelService := models.NewModelService(database)
	agentService := models.NewAgentService(database)
	chatService := models.NewChatService(database, hub)
	providerService := models.NewProviderService(database)
	// Pass chatService and agentService to ConnectorService constructor
	connectorService := llm.NewConnectorService(modelService, providerService, chatService, agentService)

	// Create and start HTTP server
	server := setupServer(hub, database, modelService, chatService, connectorService, cookieStore)

	// Get port, defaulting to 8080 if not specified
	port := os.Getenv("PORT")
	if port == "" {
		port = DefaultPort
	}
	server.Addr = ":" + port

	// Trap SIGINT to trigger a graceful shutdown.
	// This ensures that in-progress requests are completed before shutdown.
	signalChan := make(chan os.Signal, 1)
	signal.Notify(signalChan, os.Interrupt, syscall.SIGTERM)

	go func() {
		log.Printf("Server starting on port %s", port)
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("Error starting server: %v", err)
		}
	}()

	// Wait for termination signal
	<-signalChan
	log.Println("Shutdown signal received, shutting down gracefully...")

	// Create a context with timeout for graceful shutdown
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Attempt graceful shutdown
	if err := server.Shutdown(ctx); err != nil {
		log.Fatalf("Error during server shutdown: %v", err)
	}

	log.Println("Server shutdown complete")
}

// initDatabase initializes the database connection and schema
func initDatabase() (*db.DB, error) {
	// Get database path from environment or use default
	dbPath := os.Getenv("DB_PATH")

	// Create database connection
	database, err := db.New(dbPath)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to database: %w", err)
	}

	// Initialize schema
	if err := database.Initialize(); err != nil {
		return nil, fmt.Errorf("failed to initialize database schema: %w", err)
	}

	return database, nil
}

// serveFileFromFS serves a specific file from an embedded filesystem
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

	// Use http.ServeContent for proper content type and caching headers
	// Need a ReadSeeker, which fs.File provides.
	seeker, ok := file.(io.ReadSeeker)
	if !ok {
		log.Printf("Error: embedded file %s does not implement io.ReadSeeker", fileName)
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}

	// Set Content-Type based on extension (optional, ServeContent often infers)
	if filepath.Ext(fileName) == ".html" {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
	}

	http.ServeContent(w, r, stat.Name(), stat.ModTime(), seeker)
}

func setupServer(hub *ws.Hub, database *db.DB, modelService *models.ModelService, chatService *models.ChatService, connectorService *llm.ConnectorService, store *sessions.CookieStore) *http.Server {
	// Create router
	mux := http.NewServeMux()

	// Create a separate mux just for WebSocket to bypass middlewares
	wsMux := http.NewServeMux()

	// Get embedded filesystems from the ui package
	staticFS := ui.Static()
	templatesFS := ui.Templates()

	log.Println("Serving UI from embedded filesystem")

	// Initialize services needed by handlers
	userService := models.NewUserService(database)
	authHandlers := auth.NewAuthHandlers(store, userService)

	// Create handlers
	adminHandlers := handlers.NewAdminHandlers(database, templatesFS)
	modelHandlers := handlers.NewModelHandlers(modelService)
	chatHandlers := handlers.NewChatHandlers(chatService, hub, connectorService)
	userHandlers := handlers.NewUserHandlers(userService)
	// Create other handlers (e.g., auth) here later

	// Define Middleware
	// For development, we use TempAdminAuthMiddleware for all user routes.
	// In production, you'd have different middleware chains (e.g., requireAdmin, requireUser).
	// authMiddleware := middleware.TempAdminAuthMiddleware
	// NEW Middleware will be defined here using the store
	sessionAuth := middleware.SessionAuthMiddleware(store, userService)
	adminRequired := middleware.AdminRequiredMiddleware(store, userService)

	// Custom 404 handler using embedded file
	notFoundHandler := func(w http.ResponseWriter, r *http.Request) {
		log.Printf("404 Not Found: %s", r.URL.Path)

		// Open 404.html from the templates filesystem
		file, err := templatesFS.Open("404.html")
		if err != nil {
			log.Printf("Error opening embedded 404.html: %v", err)
			// Fallback error if 404.html itself is missing
			http.Error(w, "Not Found", http.StatusNotFound)
			return
		}
		defer file.Close()

		// Set headers *before* writing body
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.WriteHeader(http.StatusNotFound) // Write header *once*

		// Copy content directly
		_, copyErr := io.Copy(w, file)
		if copyErr != nil {
			// Log error, but header is already sent, so can't send http.Error
			log.Printf("Error copying 404.html content: %v", copyErr)
		}
	}

	// Serve static files
	mux.Handle("/static/", http.StripPrefix("/static/", http.FileServer(http.FS(staticFS))))

	// --- Register API Routes ---

	// Admin API routes (Protected by adminRequired middleware)
	// We wrap the registration function with the middleware
	adminMux := http.NewServeMux()
	// Pass the adminRequired middleware to the registration function
	adminHandlers.RegisterAdminRoutes(adminMux, adminRequired)

	// Explicitly handle the GET /admin route for the page, protected by middleware
	mux.Handle("GET /admin", adminRequired(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		serveFileFromFS(templatesFS, "admin.html", w, r) // Serve the admin page directly
	})))

	// Attach the adminMux handlers under the /api/admin/ prefix, as per API.md
	mux.Handle("/api/admin/", adminRequired(http.StripPrefix("/api/admin", adminMux))) // NOTE: Using StripPrefix

	// User API routes (Protected by sessionAuth middleware)
	userApiMux := http.NewServeMux()
	modelHandlers.RegisterUserRoutes(userApiMux, sessionAuth) // Pass middleware to handler registration if needed, or wrap here
	chatHandlers.RegisterUserRoutes(userApiMux, sessionAuth)  // Pass middleware to handler registration if needed, or wrap here
	// userHandlers.RegisterUserSelfRoutes(userApiMux, sessionAuth) // REMOVE - Register /api/user/me directly below
	// Handle API base paths with the user mux protected by sessionAuth
	// mux.Handle("/api/users/", sessionAuth(userApiMux)) // REMOVE - No longer needed if /api/user/me is separate
	mux.Handle("/api/chats", sessionAuth(userApiMux)) // Assuming chat routes start with /api/chats
	mux.Handle("/api/chats/", sessionAuth(userApiMux))
	mux.Handle("/api/models", sessionAuth(userApiMux)) // Assuming model routes start with /api/models
	mux.Handle("/api/models/", sessionAuth(userApiMux))

	// Register the /api/user/me route directly and apply sessionAuth middleware
	mux.Handle("GET /api/user/me", sessionAuth(http.HandlerFunc(userHandlers.GetCurrentUser)))

	// Register API endpoint for basic info (Public - No auth middleware)
	mux.HandleFunc("/api/info", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"name": "CyberAI", "version": "0.1.0", "status": "development"}`))
	})

	// Register WebSocket handler on the separate mux
	// Authentication needs to happen during the upgrade request
	wsMux.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		// Check session before upgrading
		session, err := store.Get(r, middleware.SessionName)
		if err != nil || session.Values[string(middleware.UserIDContextKey)] == nil {
			log.Printf("WebSocket: Unauthorized access attempt - No valid session")
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		userID, ok := session.Values[string(middleware.UserIDContextKey)].(int)
		if !ok || userID <= 0 {
			log.Printf("WebSocket: Unauthorized access attempt - Invalid user ID in session")
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		// Add userID to context for the WS handler (though ServeWS might need direct passing)
		ctx := context.WithValue(r.Context(), middleware.UserIDContextKey, userID)
		log.Printf("WebSocket: Authorized access for User ID: %d", userID)
		ws.ServeWS(hub, w, r.WithContext(ctx)) // Pass context
	})

	// --- End API Routes ---

	// --- Add Login/Logout routes ---
	// GET /login serves the login page
	mux.HandleFunc("GET /login", func(w http.ResponseWriter, r *http.Request) {
		serveFileFromFS(templatesFS, "login.html", w, r)
	})
	// POST /login handles the login submission
	mux.HandleFunc("POST /login", authHandlers.Login)
	// /logout can be GET or POST based on frontend implementation
	mux.HandleFunc("/logout", authHandlers.Logout)

	// Main handler for root and other paths - this is the catch-all handler
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/" {
			// Serve index.html directly from the templates filesystem
			// TODO: This route should be protected by SessionAuthMiddleware - APPLYING NOW
			sessionAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				serveFileFromFS(templatesFS, "index.html", w, r)
			})).ServeHTTP(w, r)
		} else {
			notFoundHandler(w, r)
		}
	})

	// Apply the logging middleware to the main mux
	loggedMux := loggingMiddleware(mux)

	// Create a combined handler that routes WebSocket requests to wsMux and everything else to loggedMux
	combinedHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/ws" {
			// WebSocket requests go directly to the WebSocket mux to avoid middleware issues
			log.Printf("WebSocket request detected: %s", r.URL.Path)
			wsMux.ServeHTTP(w, r)
		} else {
			// All other requests go through the logged main mux
			loggedMux.ServeHTTP(w, r)
		}
	})

	// Create server
	server := &http.Server{
		Addr:    ":" + DefaultPort,
		Handler: combinedHandler, // Use the combined handler
	}

	return server
}
