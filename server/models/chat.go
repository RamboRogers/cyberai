package models

import (
	"database/sql"
	"errors"
	"fmt"
	"log"
	"time"

	"github.com/ramborogers/cyberai/server/db"
)

// WSHub defines the interface for the WebSocket hub to avoid import cycles
type WSHub interface {
	// SendToUser sends a message to a specific user
	SendToUser(userID int64, message interface{})
}

// Message struct defined to match ws.Message for use with WSHub
type WSMessage struct {
	Type      string    `json:"type"`
	Timestamp time.Time `json:"timestamp"`
	// Add any necessary fields to match ws.Message
	// We can't import it directly, so we define what we need here
}

// Chat represents a conversation between a user and AI models
type Chat struct {
	ID        int64     `json:"id"`
	Title     string    `json:"title"`
	UserID    int64     `json:"user_id"`
	IsActive  bool      `json:"is_active"`
	Messages  []Message `json:"messages,omitempty"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// Message represents a single message in a chat
type Message struct {
	ID         int64     `json:"id"`
	ChatID     int64     `json:"chat_id"`
	UserID     int64     `json:"user_id"`
	Role       string    `json:"role"` // "user", "assistant", "system"
	Content    string    `json:"content"`
	ModelID    *int64    `json:"model_id,omitempty"`
	AgentID    *int64    `json:"agent_id,omitempty"`
	TokensUsed int       `json:"tokens_used,omitempty"`
	CreatedAt  time.Time `json:"created_at"`

	// Optional relationships for API responses
	Model *LLMModel `json:"model,omitempty"`
	Agent *Agent    `json:"agent,omitempty"`
}

// ChatService handles chat-related operations
type ChatService struct {
	DB  *db.DB
	Hub WSHub // WebSocket hub for real-time communications
}

// NewChatService creates a new ChatService
func NewChatService(database *db.DB, hub WSHub) *ChatService {
	return &ChatService{
		DB:  database,
		Hub: hub,
	}
}

// CreateChat creates a new chat for a user
func (s *ChatService) CreateChat(userID int64, title string) (*Chat, error) {
	var chat Chat

	err := s.DB.Transaction(func(tx *sql.Tx) error {
		// Insert the chat
		result, err := tx.Exec(`
			INSERT INTO chats (user_id, title, is_active)
			VALUES (?, ?, 1)
		`, userID, title)

		if err != nil {
			return fmt.Errorf("failed to create chat: %w", err)
		}

		// Get the chat ID
		chatID, err := result.LastInsertId()
		if err != nil {
			return fmt.Errorf("failed to get chat ID: %w", err)
		}

		// Retrieve the created chat
		err = tx.QueryRow(`
			SELECT c.id, c.title, c.user_id, c.is_active, c.created_at, c.updated_at
			FROM chats c
			WHERE c.id = ?
		`, chatID).Scan(
			&chat.ID, &chat.Title, &chat.UserID,
			&chat.IsActive, &chat.CreatedAt, &chat.UpdatedAt,
		)

		if err != nil {
			return fmt.Errorf("failed to retrieve created chat: %w", err)
		}

		return nil
	})

	if err != nil {
		return nil, err
	}

	return &chat, nil
}

// GetChat retrieves a chat by ID
func (s *ChatService) GetChat(chatID int64, includeMessages bool) (*Chat, error) {
	// Get the chat details
	var chat Chat

	err := s.DB.QueryRow(`
		SELECT c.id, c.title, c.user_id, c.is_active, c.created_at, c.updated_at
		FROM chats c
		WHERE c.id = ?
	`, chatID).Scan(
		&chat.ID, &chat.Title, &chat.UserID,
		&chat.IsActive, &chat.CreatedAt, &chat.UpdatedAt,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("chat not found: %d", chatID)
		}
		return nil, fmt.Errorf("database error: %w", err)
	}

	// Optionally get the messages
	if includeMessages {
		messages, err := s.GetChatMessages(chatID)
		if err != nil {
			return nil, err
		}
		chat.Messages = messages
	}

	return &chat, nil
}

// GetChatMessages retrieves all messages for a chat
func (s *ChatService) GetChatMessages(chatID int64) ([]Message, error) {
	rows, err := s.DB.Query(`
		SELECT m.id, m.chat_id, m.user_id, m.role, m.content,
		       m.model_id, m.agent_id, m.tokens_used, m.created_at
		FROM messages m
		WHERE m.chat_id = ?
		ORDER BY m.created_at ASC
	`, chatID)

	if err != nil {
		return nil, fmt.Errorf("failed to query messages: %w", err)
	}
	defer rows.Close()

	var messages []Message
	for rows.Next() {
		var msg Message
		if err := rows.Scan(
			&msg.ID, &msg.ChatID, &msg.UserID, &msg.Role, &msg.Content,
			&msg.ModelID, &msg.AgentID, &msg.TokensUsed, &msg.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan message: %w", err)
		}
		messages = append(messages, msg)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating messages: %w", err)
	}

	return messages, nil
}

// GetUserChats retrieves all chats for a user
func (s *ChatService) GetUserChats(userID int64, activeOnly bool) ([]Chat, error) {
	var query string
	var args []interface{}

	query = `
		SELECT c.id, c.title, c.user_id, c.is_active, c.created_at, c.updated_at
		FROM chats c
		WHERE c.user_id = ?
	`
	args = append(args, userID)

	if activeOnly {
		query += " AND c.is_active = 1"
	}

	query += " ORDER BY c.updated_at DESC"

	rows, err := s.DB.Query(query, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to query chats: %w", err)
	}
	defer rows.Close()

	var chats []Chat
	for rows.Next() {
		var chat Chat
		if err := rows.Scan(
			&chat.ID, &chat.Title, &chat.UserID,
			&chat.IsActive, &chat.CreatedAt, &chat.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan chat: %w", err)
		}
		chats = append(chats, chat)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating chats: %w", err)
	}

	return chats, nil
}

// UpdateChatTitle updates a chat's title
func (s *ChatService) UpdateChatTitle(chatID int64, title string) error {
	_, err := s.DB.Exec(`
		UPDATE chats
		SET title = ?, updated_at = ?
		WHERE id = ?
	`, title, time.Now(), chatID)

	if err != nil {
		return fmt.Errorf("failed to update chat title: %w", err)
	}

	return nil
}

// ArchiveChat marks a chat as inactive
func (s *ChatService) ArchiveChat(chatID int64) error {
	_, err := s.DB.Exec(`
		UPDATE chats
		SET is_active = 0, updated_at = ?
		WHERE id = ?
	`, time.Now(), chatID)

	if err != nil {
		return fmt.Errorf("failed to archive chat: %w", err)
	}

	return nil
}

// DeleteChat deletes a chat and all its messages
func (s *ChatService) DeleteChat(chatID int64) error {
	err := s.DB.Transaction(func(tx *sql.Tx) error {
		// Delete associated messages
		_, err := tx.Exec("DELETE FROM messages WHERE chat_id = ?", chatID)
		if err != nil {
			return fmt.Errorf("failed to delete chat messages: %w", err)
		}

		// Delete associated usage statistics
		_, err = tx.Exec("DELETE FROM usage_statistics WHERE chat_id = ?", chatID)
		if err != nil {
			return fmt.Errorf("failed to delete chat usage statistics: %w", err)
		}

		// Delete the chat
		_, err = tx.Exec("DELETE FROM chats WHERE id = ?", chatID)
		if err != nil {
			return fmt.Errorf("failed to delete chat: %w", err)
		}

		return nil
	})

	if err != nil {
		return err
	}

	return nil
}

// DeleteChatsByUserID deletes all chats and associated messages for a user.
func (s *ChatService) DeleteChatsByUserID(userID int64) error {
	// Call the database layer function to perform the deletion within a transaction
	err := s.DB.DeleteChatsAndMessagesByUserID(userID)
	if err != nil {
		return fmt.Errorf("failed to delete chats and messages for user %d: %w", userID, err)
	}
	log.Printf("ChatService successfully initiated deletion of chats for user %d", userID)
	return nil
}

// AddMessage adds a new message to a chat and updates the chat's updated_at time
func (s *ChatService) AddMessage(message *Message) error {
	err := s.DB.Transaction(func(tx *sql.Tx) error {
		// Insert the message
		result, err := tx.Exec(`
			INSERT INTO messages (chat_id, user_id, role, content, model_id, agent_id, tokens_used)
			VALUES (?, ?, ?, ?, ?, ?, ?)
		`, message.ChatID, message.UserID, message.Role, message.Content,
			message.ModelID, message.AgentID, message.TokensUsed)

		if err != nil {
			return fmt.Errorf("failed to add message: %w", err)
		}

		// Get the message ID
		messageID, err := result.LastInsertId()
		if err != nil {
			return fmt.Errorf("failed to get message ID: %w", err)
		}

		message.ID = messageID

		// Update the chat's updated_at timestamp
		_, err = tx.Exec(`
			UPDATE chats SET updated_at = ? WHERE id = ?
		`, time.Now(), message.ChatID)

		if err != nil {
			return fmt.Errorf("failed to update chat timestamp: %w", err)
		}

		return nil
	})

	if err != nil {
		return err
	}

	return nil
}

// GetLatestMessage retrieves the latest message for a chat
func (s *ChatService) GetLatestMessage(chatID int64) (*Message, error) {
	var msg Message

	err := s.DB.QueryRow(`
		SELECT m.id, m.chat_id, m.user_id, m.role, m.content,
		       m.model_id, m.agent_id, m.tokens_used, m.created_at
		FROM messages m
		WHERE m.chat_id = ?
		ORDER BY m.created_at DESC
		LIMIT 1
	`, chatID).Scan(
		&msg.ID, &msg.ChatID, &msg.UserID, &msg.Role, &msg.Content,
		&msg.ModelID, &msg.AgentID, &msg.TokensUsed, &msg.CreatedAt,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, errors.New("no messages in chat")
		}
		return nil, fmt.Errorf("database error: %w", err)
	}

	return &msg, nil
}

// GetMessageHistory retrieves a number of messages from a chat
func (s *ChatService) GetMessageHistory(chatID int64, limit int) ([]Message, error) {
	if limit <= 0 {
		limit = 50 // Default limit
	}

	rows, err := s.DB.Query(`
		SELECT m.id, m.chat_id, m.user_id, m.role, m.content,
		       m.model_id, m.agent_id, m.tokens_used, m.created_at
		FROM messages m
		WHERE m.chat_id = ?
		ORDER BY m.created_at DESC
		LIMIT ?
	`, chatID, limit)

	if err != nil {
		return nil, fmt.Errorf("failed to query message history: %w", err)
	}
	defer rows.Close()

	var messages []Message
	for rows.Next() {
		var msg Message
		if err := rows.Scan(
			&msg.ID, &msg.ChatID, &msg.UserID, &msg.Role, &msg.Content,
			&msg.ModelID, &msg.AgentID, &msg.TokensUsed, &msg.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan message: %w", err)
		}
		// Add in reverse order to get chronological order
		messages = append([]Message{msg}, messages...)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating messages: %w", err)
	}

	return messages, nil
}

// GetChatStatistics gets usage statistics for a chat
func (s *ChatService) GetChatStatistics(chatID int64) (map[string]interface{}, error) {
	var stats = make(map[string]interface{})

	// Get total messages
	var totalMessages int
	err := s.DB.QueryRow(`
		SELECT COUNT(*) FROM messages WHERE chat_id = ?
	`, chatID).Scan(&totalMessages)

	if err != nil {
		return nil, fmt.Errorf("failed to get message count: %w", err)
	}

	stats["total_messages"] = totalMessages

	// Get message counts by role
	rows, err := s.DB.Query(`
		SELECT role, COUNT(*)
		FROM messages
		WHERE chat_id = ?
		GROUP BY role
	`, chatID)

	if err != nil {
		return nil, fmt.Errorf("failed to get role counts: %w", err)
	}
	defer rows.Close()

	roleCounts := make(map[string]int)
	for rows.Next() {
		var role string
		var count int
		if err := rows.Scan(&role, &count); err != nil {
			return nil, fmt.Errorf("failed to scan role count: %w", err)
		}
		roleCounts[role] = count
	}

	stats["role_counts"] = roleCounts

	// Get token usage
	var totalTokens, promptTokens, completionTokens int
	err = s.DB.QueryRow(`
		SELECT
			COALESCE(SUM(prompt_tokens), 0) as prompt_tokens,
			COALESCE(SUM(completion_tokens), 0) as completion_tokens,
			COALESCE(SUM(total_tokens), 0) as total_tokens
		FROM usage_statistics
		WHERE chat_id = ?
	`, chatID).Scan(&promptTokens, &completionTokens, &totalTokens)

	if err != nil && err != sql.ErrNoRows {
		return nil, fmt.Errorf("failed to get token usage: %w", err)
	}

	stats["token_usage"] = map[string]int{
		"prompt_tokens":     promptTokens,
		"completion_tokens": completionTokens,
		"total_tokens":      totalTokens,
	}

	return stats, nil
}

// DeleteMessage removes a single message by ID
func (s *ChatService) DeleteMessage(messageID int64) error {
	query := "DELETE FROM messages WHERE id = ?"
	result, err := s.DB.Exec(query, messageID)
	if err != nil {
		return fmt.Errorf("failed to delete message %d: %w", messageID, err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		// Log but don't necessarily fail if we can't get rows affected
		log.Printf("Warning: could not get rows affected for message delete %d: %v", messageID, err)
	}

	if rowsAffected == 0 {
		// This might not be a fatal error in regenerate context if message already gone
		log.Printf("Warning: Message with ID %d not found for deletion", messageID)
		// return fmt.Errorf("message with ID %d not found for deletion", messageID)
	}

	// TODO: Should we also delete associated usage stats? Depends on requirements.

	return nil
}

// UpdateMessageContentAndTokens updates the content and token count of an existing message.
// It also updates the parent chat's updated_at timestamp.
func (s *ChatService) UpdateMessageContentAndTokens(messageID int64, content string, tokensUsed int) error {
	return s.DB.Transaction(func(tx *sql.Tx) error {
		now := time.Now()

		// 1. Update the message
		result, err := tx.Exec(`
			UPDATE messages
			SET content = ?, tokens_used = ?
			WHERE id = ?
		`, content, tokensUsed, messageID)
		if err != nil {
			return fmt.Errorf("failed to update message content/tokens: %w", err)
		}
		rowsAffected, _ := result.RowsAffected()
		if rowsAffected == 0 {
			return fmt.Errorf("message with ID %d not found for update", messageID)
		}

		// 2. Get the ChatID from the message to update the chat timestamp
		var chatID int64
		err = tx.QueryRow(`SELECT chat_id FROM messages WHERE id = ?`, messageID).Scan(&chatID)
		if err != nil {
			if err == sql.ErrNoRows {
				// This shouldn't happen if the message update succeeded, but handle defensively
				return fmt.Errorf("cannot find chat_id for message ID %d after update", messageID)
			}
			return fmt.Errorf("failed to retrieve chat_id for message %d: %w", messageID, err)
		}

		// 3. Update the chat's updated_at timestamp
		_, err = tx.Exec(`
			UPDATE chats
			SET updated_at = ?
			WHERE id = ?
		`, now, chatID)
		if err != nil {
			// Log the error but don't necessarily fail the whole transaction if only timestamp update fails
			log.Printf("Warning: failed to update chat %d updated_at timestamp: %v", chatID, err)
		}

		return nil // Commit transaction
	})
}
