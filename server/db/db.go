package db

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

const (
	// Schema version
	SchemaVersion = 1

	// Default database file
	DefaultDBPath = "./data/cyberai.db"
)

// DB is a wrapper around sql.DB
type DB struct {
	*sql.DB
}

// New creates a new database connection
func New(dbPath string) (*DB, error) {
	if dbPath == "" {
		dbPath = DefaultDBPath
	}

	// Ensure directory exists
	if err := os.MkdirAll(filepath.Dir(dbPath), 0755); err != nil {
		return nil, fmt.Errorf("failed to create database directory: %w", err)
	}

	// Open database with foreign key constraints enabled
	db, err := sql.Open("sqlite", fmt.Sprintf("%s?_foreign_keys=on", dbPath))
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	// Check connection
	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	// Use DELETE journal mode instead of WAL
	if _, err := db.Exec("PRAGMA journal_mode=DELETE;"); err != nil {
		log.Printf("Warning: failed to set DELETE journal mode: %v", err)
	}

	// Set busy timeout to handle concurrent access
	if _, err := db.Exec("PRAGMA busy_timeout=5000;"); err != nil {
		log.Printf("Warning: failed to set busy timeout: %v", err)
	}

	return &DB{db}, nil
}

// Initialize creates all necessary tables
func (db *DB) Initialize() error {
	log.Println("Initializing database...")

	// Create schema_versions table
	_, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS schema_versions (
			id INTEGER PRIMARY KEY,
			version INTEGER NOT NULL,
			applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)
	`)
	if err != nil {
		return fmt.Errorf("failed to create schema_versions table: %w", err)
	}

	// Check current schema version
	var version int
	err = db.QueryRow("SELECT version FROM schema_versions ORDER BY id DESC LIMIT 1").Scan(&version)
	if err != nil && err != sql.ErrNoRows {
		return fmt.Errorf("failed to query schema version: %w", err)
	}

	if err == sql.ErrNoRows || version < SchemaVersion {
		// Apply migrations
		if err := db.migrate(); err != nil {
			return err
		}
	}

	return nil
}

// migrate applies database migrations
func (db *DB) migrate() error {
	log.Println("Applying migrations...")

	// Create tables if they don't exist
	_, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS roles (
			id INTEGER PRIMARY KEY,
			name TEXT NOT NULL UNIQUE,
			description TEXT,
			permissions TEXT, -- JSON string of permissions
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		);

		CREATE TABLE IF NOT EXISTS users (
			id INTEGER PRIMARY KEY,
			username TEXT NOT NULL UNIQUE,
			password_hash TEXT NOT NULL,
			email TEXT NOT NULL UNIQUE,
			first_name TEXT,
			last_name TEXT,
			role_id INTEGER NOT NULL,
			is_active BOOLEAN DEFAULT TRUE,
			last_login TIMESTAMP,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (role_id) REFERENCES roles(id)
		);

		CREATE TABLE IF NOT EXISTS providers (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL UNIQUE,
			type TEXT NOT NULL CHECK(type IN ('ollama', 'openai', 'anthropic')),
			base_url TEXT,
			api_key TEXT,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);

		CREATE TABLE IF NOT EXISTS models (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			provider_id INTEGER NOT NULL,
			name TEXT NOT NULL,
			model_id TEXT NOT NULL,
			max_tokens INTEGER NOT NULL DEFAULT 2048,
			temperature REAL NOT NULL DEFAULT 0.7,
			default_system_prompt TEXT,
			is_active BOOLEAN NOT NULL DEFAULT TRUE,
			configuration TEXT,
			last_synced_at DATETIME,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY(provider_id) REFERENCES providers(id) ON DELETE CASCADE
		);

		CREATE TABLE IF NOT EXISTS agents (
			id INTEGER PRIMARY KEY,
			name TEXT NOT NULL,
			description TEXT,
			system_prompt TEXT NOT NULL,
			model_id INTEGER NOT NULL,
			user_id INTEGER NOT NULL,
			is_public BOOLEAN DEFAULT FALSE,
			is_active BOOLEAN DEFAULT TRUE,
			configuration TEXT, -- JSON for flexible configuration
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (model_id) REFERENCES models(id),
			FOREIGN KEY (user_id) REFERENCES users(id)
		);

		CREATE TABLE IF NOT EXISTS chats (
			id INTEGER PRIMARY KEY,
			title TEXT NOT NULL,
			user_id INTEGER NOT NULL,
			is_active BOOLEAN DEFAULT TRUE,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (user_id) REFERENCES users(id)
		);

		CREATE TABLE IF NOT EXISTS messages (
			id INTEGER PRIMARY KEY,
			chat_id INTEGER NOT NULL,
			user_id INTEGER NOT NULL,
			role TEXT NOT NULL, -- "user", "assistant", "system"
			content TEXT NOT NULL,
			model_id INTEGER,
			agent_id INTEGER,
			tokens_used INTEGER DEFAULT 0,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (chat_id) REFERENCES chats(id),
			FOREIGN KEY (user_id) REFERENCES users(id),
			FOREIGN KEY (model_id) REFERENCES models(id),
			FOREIGN KEY (agent_id) REFERENCES agents(id)
		);

		CREATE TABLE IF NOT EXISTS usage_statistics (
			id INTEGER PRIMARY KEY,
			user_id INTEGER NOT NULL,
			chat_id INTEGER NOT NULL,
			message_id INTEGER NOT NULL,
			model_id INTEGER NOT NULL,
			prompt_tokens INTEGER NOT NULL DEFAULT 0,
			completion_tokens INTEGER NOT NULL DEFAULT 0,
			total_tokens INTEGER NOT NULL DEFAULT 0,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (user_id) REFERENCES users(id),
			FOREIGN KEY (chat_id) REFERENCES chats(id),
			FOREIGN KEY (message_id) REFERENCES messages(id),
			FOREIGN KEY (model_id) REFERENCES models(id)
		);

		-- Create indexes for common queries
		CREATE INDEX IF NOT EXISTS idx_users_role ON users(role_id);
		CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active);

		CREATE UNIQUE INDEX IF NOT EXISTS idx_providers_name ON providers(name);

		CREATE INDEX IF NOT EXISTS idx_models_provider_id ON models(provider_id);
		CREATE UNIQUE INDEX IF NOT EXISTS idx_models_provider_model ON models(provider_id, model_id);
		CREATE INDEX IF NOT EXISTS idx_models_active ON models(is_active);

		CREATE INDEX IF NOT EXISTS idx_agents_user ON agents(user_id);
		CREATE INDEX IF NOT EXISTS idx_agents_model ON agents(model_id);
		CREATE INDEX IF NOT EXISTS idx_agents_active ON agents(is_active);
		CREATE INDEX IF NOT EXISTS idx_agents_public ON agents(is_public);

		CREATE INDEX IF NOT EXISTS idx_chats_user ON chats(user_id);
		CREATE INDEX IF NOT EXISTS idx_chats_active ON chats(is_active);
		CREATE INDEX IF NOT EXISTS idx_chats_user_active ON chats(user_id, is_active);

		CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id);
		CREATE INDEX IF NOT EXISTS idx_messages_user ON messages(user_id);
		CREATE INDEX IF NOT EXISTS idx_messages_role ON messages(role);
		CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);

		CREATE INDEX IF NOT EXISTS idx_usage_user ON usage_statistics(user_id);
		CREATE INDEX IF NOT EXISTS idx_usage_chat ON usage_statistics(chat_id);
		CREATE INDEX IF NOT EXISTS idx_usage_model ON usage_statistics(model_id);
		CREATE INDEX IF NOT EXISTS idx_usage_created ON usage_statistics(created_at);
	`)

	if err != nil {
		return fmt.Errorf("failed to create tables: %w", err)
	}

	// Create default admin role if it doesn't exist
	_, err = db.Exec(`
		INSERT OR IGNORE INTO roles (id, name, description, permissions)
		VALUES (1, 'admin', 'Administrator with full access', '{"all": true}');
	`)

	if err != nil {
		return err
	}

	// Create default user role if it doesn't exist
	_, err = db.Exec(`
		INSERT OR IGNORE INTO roles (id, name, description, permissions)
		VALUES (2, 'user', 'Standard user', '{"chat": true, "models": {"use": true}}');
	`)

	if err != nil {
		return err
	}

	// Create default admin user if it doesn't exist (password: admin)
	_, err = db.Exec(`
		INSERT OR IGNORE INTO users (username, password_hash, email, first_name, last_name, role_id)
		VALUES ('admin', '$2a$10$vI4ihjQ3UZACkeMAHZd.CuYM9wBOEDeafHX7UVLSRZjF9Wf9kwB.C', 'admin@example.com', 'Admin', 'User', 1);
	`)

	if err != nil {
		return fmt.Errorf("failed to create default admin user: %w", err)
	}

	// Insert schema version record
	_, err = db.Exec(`
		INSERT INTO schema_versions (version)
		VALUES (?)
	`, SchemaVersion)

	if err != nil {
		// If the error is a constraint violation, the version is likely already there
		log.Printf("Note: Schema version may already exist: %v", err)
	}

	return nil
}

// Common database helper methods

// Transaction runs a function within a transaction
func (db *DB) Transaction(fn func(*sql.Tx) error) error {
	tx, err := db.Begin()
	if err != nil {
		return err
	}

	defer func() {
		if p := recover(); p != nil {
			tx.Rollback()
			panic(p) // re-throw panic after rollback
		}
	}()

	if err := fn(tx); err != nil {
		tx.Rollback()
		return err
	}

	return tx.Commit()
}

// UpdatedAt updates the updated_at field of a table
func (db *DB) UpdatedAt(table string, id int64) error {
	_, err := db.Exec(
		fmt.Sprintf("UPDATE %s SET updated_at = ? WHERE id = ?", table),
		time.Now(), id,
	)
	return err
}

// DeleteChatsAndMessagesByUserID deletes all chats and associated messages for a specific user ID
// within a transaction.
func (db *DB) DeleteChatsAndMessagesByUserID(userID int64) error {
	return db.Transaction(func(tx *sql.Tx) error {
		// First, delete messages associated with the user's chats
		// Need to find the chat IDs first
		chatIDs := []int64{}
		rows, err := tx.Query("SELECT id FROM chats WHERE user_id = ?", userID)
		if err != nil {
			return fmt.Errorf("failed to query chat IDs for user %d: %w", userID, err)
		}
		defer rows.Close()
		for rows.Next() {
			var chatID int64
			if err := rows.Scan(&chatID); err != nil {
				return fmt.Errorf("failed to scan chat ID: %w", err)
			}
			chatIDs = append(chatIDs, chatID)
		}
		if err := rows.Err(); err != nil {
			return fmt.Errorf("error iterating chat IDs: %w", err)
		}

		// If the user has no chats, we are done
		if len(chatIDs) == 0 {
			log.Printf("No chats found for user %d to delete.", userID)
			return nil
		}

		log.Printf("Deleting messages for user %d in chats: %v", userID, chatIDs)

		// Build the placeholders for the IN clause
		placeholders := make([]string, len(chatIDs))
		args := make([]interface{}, len(chatIDs))
		for i, id := range chatIDs {
			placeholders[i] = "?"
			args[i] = id
		}
		query := fmt.Sprintf("DELETE FROM messages WHERE chat_id IN (%s)", strings.Join(placeholders, ","))

		// Delete messages
		result, err := tx.Exec(query, args...)
		if err != nil {
			return fmt.Errorf("failed to delete messages for user %d: %w", userID, err)
		}
		msgsDeleted, _ := result.RowsAffected()
		log.Printf("Deleted %d messages for user %d", msgsDeleted, userID)

		// Second, delete the user's chats
		result, err = tx.Exec("DELETE FROM chats WHERE user_id = ?", userID)
		if err != nil {
			return fmt.Errorf("failed to delete chats for user %d: %w", userID, err)
		}
		chatsDeleted, _ := result.RowsAffected()
		log.Printf("Deleted %d chats for user %d", chatsDeleted, userID)

		return nil // Commit transaction
	})
}
