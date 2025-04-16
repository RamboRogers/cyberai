package ws

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"

	"github.com/ramborogers/cyberai/server/middleware"
)

// UserFacingModel is a simplified model representation for the frontend
// This avoids import cycles with the models package
type UserFacingModel struct {
	ID                  int64     `json:"id"`
	Name                string    `json:"name"`
	ModelID             string    `json:"model_id"`
	ProviderType        string    `json:"provider_type"`
	MaxTokens           int       `json:"max_tokens"`
	Temperature         float64   `json:"temperature"`
	DefaultSystemPrompt string    `json:"default_system_prompt"`
	CreatedAt           time.Time `json:"created_at,omitempty"`
	UpdatedAt           time.Time `json:"updated_at,omitempty"`
}

// MessagePayload represents a chat message
type MessagePayload struct {
	ID         int64     `json:"id"`
	ChatID     int64     `json:"chat_id"`
	UserID     int64     `json:"user_id"`
	Role       string    `json:"role"` // "user", "assistant", "system"
	Content    string    `json:"content"`
	ModelID    *int64    `json:"model_id,omitempty"`
	AgentID    *int64    `json:"agent_id,omitempty"`
	TokensUsed int       `json:"tokens_used,omitempty"`
	CreatedAt  time.Time `json:"created_at"`
}

// Chat represents a user's chat conversation
type Chat struct {
	ID        int64     `json:"id"`
	Title     string    `json:"title"`
	UserID    int64     `json:"user_id"`
	IsActive  bool      `json:"is_active"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

const (
	// Time allowed to write a message to the peer
	writeWait = 10 * time.Second

	// Time allowed to read the next pong message from the peer
	pongWait = 60 * time.Second

	// Send pings to peer with this period (must be less than pongWait)
	pingPeriod = (pongWait * 9) / 10

	// Maximum message size allowed from peer
	maxMessageSize = 8192
)

var (
	upgrader = websocket.Upgrader{
		ReadBufferSize:  1024,
		WriteBufferSize: 1024,
		// Allow all origins for development
		CheckOrigin: func(r *http.Request) bool { return true },
	}
)

// WebSocket Message Types
const (
	MsgTypeError            = "error"
	MsgTypeStatus           = "status"
	MsgTypeSystem           = "system"
	MsgTypeUserMessage      = "user_message"      // Confirms user message saved, provides ID
	MsgTypeAssistantChunk   = "assistant_chunk"   // Streamed chunk of assistant response
	MsgTypeAssistantMessage = "assistant_message" // Complete assistant message (after streaming/saving)
	MsgTypeRemoveMessage    = "remove_message"    // Request to remove a message (e.g., during regen)
	MsgTypeModelList        = "model_list"        // Send updated model list (if needed dynamically)
	MsgTypeChatList         = "chat_list"         // Send updated chat list (if needed dynamically)
)

// Base Message structure for WebSocket communication
type Message struct {
	Type      string    `json:"type"` // Message type (e.g., "error", "assistant_chunk")
	Timestamp time.Time `json:"timestamp"`

	// Payload fields - only one should be non-nil depending on Type
	ErrorPayload     *ErrorPayload     `json:"error_payload,omitempty"`
	StatusPayload    *StatusPayload    `json:"status_payload,omitempty"`
	ContentPayload   *ContentPayload   `json:"content_payload,omitempty"`    // For simple text content (system, status)
	MessagePayload   *MessagePayload   `json:"message_payload,omitempty"`    // For user/assistant messages
	ChunkPayload     *ChunkPayload     `json:"chunk_payload,omitempty"`      // For streaming chunks
	RemovePayload    *RemovePayload    `json:"remove_payload,omitempty"`     // For removing messages
	ChatListPayload  []Chat            `json:"chat_list_payload,omitempty"`  // Send updated chat list
	ModelListPayload []UserFacingModel `json:"model_list_payload,omitempty"` // Send updated model list

	// Generic data field for less common or custom types
	Data interface{} `json:"data,omitempty"`
}

// --- Payload Struct Definitions ---

// ErrorPayload contains error details
type ErrorPayload struct {
	Message string `json:"message"`
	Code    int    `json:"code,omitempty"`    // Optional error code
	ChatID  *int64 `json:"chat_id,omitempty"` // Added ChatID here
}

// StatusPayload contains status update information
type StatusPayload struct {
	ChatID  *int64 `json:"chat_id,omitempty"` // Optional: Chat context for the status
	Message string `json:"message"`           // e.g., "Generating response...", "Regeneration complete."
}

// ContentPayload for simple text messages (used by system/status initially)
type ContentPayload struct {
	Content string `json:"content"`
}

// ChunkPayload represents a streamed chunk of an assistant message
type ChunkPayload struct {
	ChatID    int64  `json:"chat_id"`
	MessageID *int64 `json:"message_id,omitempty"` // ID of the assistant message being generated (sent once?)
	ModelID   *int64 `json:"model_id,omitempty"`   // ID of the model generating the response
	Content   string `json:"content"`              // The chunk of text
	IsFinal   bool   `json:"is_final,omitempty"`   // Flag if this is the last chunk (optional)
}

// RemovePayload specifies which message to remove
type RemovePayload struct {
	ChatID    int64 `json:"chat_id"`
	MessageID int64 `json:"message_id"`
}

// Client represents a connected WebSocket client
type Client struct {
	hub  *Hub
	conn *websocket.Conn
	send chan Message
	// User ID associated with this client connection
	userID int64
}

// Hub manages client connections and message routing.
type Hub struct {
	// Map of User ID -> Set of clients for that user
	clientsByUserID map[int64]map[*Client]bool

	// DEPRECATED: Global broadcast channel (use SendToUser or implement chat-specific channels)
	// broadcast chan Message

	// Channel for sending messages directly to a specific user ID
	sendToUser chan TargetedMessage

	// Register requests from clients
	register chan *Client

	// Unregister requests from clients
	unregister chan *Client

	// Mutex for concurrent access to clientsByUserID map
	mu sync.RWMutex // Use RWMutex for better read performance
}

// TargetedMessage wraps a Message with the target User ID.
type TargetedMessage struct {
	UserID  int64
	Message Message
}

// NewHub creates a new hub
func NewHub() *Hub {
	return &Hub{
		// broadcast:       make(chan Message),
		sendToUser:      make(chan TargetedMessage, 256), // Buffered channel
		register:        make(chan *Client),
		unregister:      make(chan *Client),
		clientsByUserID: make(map[int64]map[*Client]bool),
	}
}

// SendToUser queues a message to be sent to all clients associated with a specific user ID.
func (h *Hub) SendToUser(userID int64, message interface{}) {
	// Convert interface{} to Message type if needed
	var msg Message
	switch m := message.(type) {
	case Message:
		// It's already a Message
		msg = m
	default:
		// Try to convert to a message with system type
		msg = Message{
			Type:      MsgTypeSystem,
			Timestamp: time.Now(),
			ContentPayload: &ContentPayload{
				Content: fmt.Sprintf("%v", message), // Convert to string
			},
		}
	}

	tm := TargetedMessage{
		UserID:  userID,
		Message: msg,
	}

	// Use non-blocking send in case the channel is full, log if dropped
	select {
	case h.sendToUser <- tm:
	default:
		log.Printf("Warning: sendToUser channel full for user %d. Message dropped: %s", userID, msg.Type)
	}
}

// Run starts the hub's main processing loop.
func (h *Hub) Run() {
	log.Println("WebSocket Hub started.")
	for {
		select {
		case client := <-h.register:
			h.mu.Lock() // Lock for writing
			if _, ok := h.clientsByUserID[client.userID]; !ok {
				// First client for this user ID
				h.clientsByUserID[client.userID] = make(map[*Client]bool)
			}
			h.clientsByUserID[client.userID][client] = true
			h.mu.Unlock()
			log.Printf("Client connected (User ID: %d). Total clients for user: %d", client.userID, len(h.clientsByUserID[client.userID]))

		case client := <-h.unregister:
			h.mu.Lock() // Lock for writing
			if userClients, ok := h.clientsByUserID[client.userID]; ok {
				if _, clientExists := userClients[client]; clientExists {
					delete(userClients, client)
					close(client.send) // Close the client's send channel
					log.Printf("Client send channel closed (User ID: %d)", client.userID)

					// If this was the last client for the user, remove the user entry
					if len(userClients) == 0 {
						delete(h.clientsByUserID, client.userID)
						log.Printf("User ID %d has no more active clients.", client.userID)
					}
				}
			}
			h.mu.Unlock()
			log.Printf("Client disconnected (User ID: %d). Remaining clients for user: %d", client.userID, len(h.clientsByUserID[client.userID]))

		case targetedMsg := <-h.sendToUser:
			h.mu.RLock() // Lock for reading
			if userClients, ok := h.clientsByUserID[targetedMsg.UserID]; ok {
				// Send to all clients registered for this user ID
				// log.Printf("Sending message type '%s' to user %d (%d clients)", targetedMsg.Message.Type, targetedMsg.UserID, len(userClients)) // Commented out to reduce log noise
				for client := range userClients {
					select {
					case client.send <- targetedMsg.Message:
						// Message successfully queued for this client
					default:
						// Should not happen often with buffered channel, but log if it does
						log.Printf("Warning: Client send channel full for user %d. Dropping message type '%s' for one client.", targetedMsg.UserID, targetedMsg.Message.Type)
						// Optionally unregister the client here if their channel is consistently full?
						// close(client.send)
						// delete(userClients, client)
					}
				}
			}
			h.mu.RUnlock()

			/* // Deprecated broadcast logic
			case message := <-h.broadcast:
				h.mu.Lock()
				for client := range h.clients {
					// TODO: Filter messages based on user permissions
					select {
					case client.send <- message:
					default:
						close(client.send)
						delete(h.clients, client)
					}
				}
				h.mu.Unlock()
			*/
		}
	}
}

// ServeWS handles WebSocket requests from clients, performing authentication first.
func ServeWS(hub *Hub, w http.ResponseWriter, r *http.Request) {
	// --- Authentication Check ---
	userID := middleware.GetUserIDFromContext(r.Context())
	if userID == 0 {
		log.Println("WebSocket connection rejected: User not authenticated")
		http.Error(w, "Unauthorized: Authentication required for WebSocket", http.StatusUnauthorized)
		return // Stop before upgrading
	}
	log.Printf("WebSocket connection attempt by User ID: %d", userID)
	// --- End Authentication Check ---

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("Error upgrading connection: %v", err)
		return
	}

	// Create new client
	client := &Client{
		hub:    hub,
		conn:   conn,
		send:   make(chan Message, 256),
		userID: int64(userID),
	}
	client.hub.register <- client

	// Send welcome message
	welcomeMsg := Message{
		Type:      MsgTypeSystem,
		Timestamp: time.Now(),
		ContentPayload: &ContentPayload{
			Content: fmt.Sprintf("Connected to CyberAI chat server (User ID: %d)", userID),
		},
	}
	client.send <- welcomeMsg // Send directly to client's channel, hub not needed for initial message

	// Start goroutines for reading and writing
	go client.readPump()
	go client.writePump()
}

// readPump pumps messages from the WebSocket connection.
// It primarily handles control messages (ping/pong) and connection closure.
// Application-level messages (like sending a chat message) are handled via HTTP POST.
func (c *Client) readPump() {
	defer func() {
		c.hub.unregister <- c
		c.conn.Close()
	}()

	c.conn.SetReadLimit(maxMessageSize)
	c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		// Read message from connection
		messageType, messageBytes, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WebSocket Error (User ID: %d): %v", c.userID, err)
			}
			log.Printf("WebSocket connection closed for User ID: %d", c.userID)
			break // Exit loop on error or closure
		}

		// Handle different message types
		switch messageType {
		case websocket.TextMessage:
			// We generally expect the client to send commands/messages via HTTP POST,
			// not raw WebSocket messages, unless a specific protocol is defined.
			log.Printf("Received unexpected WebSocket text message from User ID %d: %s", c.userID, string(messageBytes))
			// Optionally parse and handle specific control messages if needed in the future
			// var msg Message
			// if err := json.Unmarshal(messageBytes, &msg); err == nil {
			// 	 switch msg.Type {
			// 	 case "ping_custom": // Example
			// 		 // Handle custom ping
			// 	 }
			// }

		case websocket.BinaryMessage:
			log.Printf("Received unexpected WebSocket binary message from User ID %d", c.userID)
			// Ignore binary messages for now

		case websocket.CloseMessage:
			log.Printf("Received WebSocket close message from User ID %d", c.userID)
			break // Exit loop

		case websocket.PingMessage:
			// Gorilla handles sending Pong automatically for Ping messages
			log.Printf("Received WebSocket ping from User ID %d", c.userID)

		case websocket.PongMessage:
			// Already handled by SetPongHandler to update read deadline
			log.Printf("Received WebSocket pong from User ID %d", c.userID)

		default:
			log.Printf("Received WebSocket message of unknown type %d from User ID %d", messageType, c.userID)
		}
	}
}

// writePump pumps messages from the client's send channel to the WebSocket connection.
func (c *Client) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				// The hub closed the channel
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := c.conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}

			// Encode message as JSON
			msgBytes, err := json.Marshal(message)
			if err != nil {
				log.Printf("Error encoding message: %v", err)
				return
			}

			w.Write(msgBytes)

			if err := w.Close(); err != nil {
				return
			}

		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}
