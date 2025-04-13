package models

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/ramborogers/cyberai/server/db"
)

// ProviderType represents the type of AI provider
type ProviderType string

const (
	ProviderOllama    ProviderType = "ollama"
	ProviderOpenAI    ProviderType = "openai"
	ProviderAnthropic ProviderType = "anthropic"
)

// Provider represents an AI provider configuration in the database
type Provider struct {
	ID        int64        `json:"id"`
	Name      string       `json:"name"`               // User-defined name
	Type      ProviderType `json:"type"`               // e.g., "ollama", "openai"
	BaseURL   string       `json:"base_url,omitempty"` // Optional
	APIKey    string       `json:"api_key,omitempty"`  // Allow decoding, handle exposure elsewhere
	CreatedAt time.Time    `json:"created_at"`
	UpdatedAt time.Time    `json:"updated_at"`
}

// String provides a debug-friendly representation of Provider
func (p Provider) String() string {
	// Never print the full API key, only whether it exists
	hasAPIKey := p.APIKey != ""
	apiKeyPreview := ""
	if hasAPIKey && len(p.APIKey) > 4 {
		// Just show first 2 and last 2 chars of the key
		apiKeyPreview = p.APIKey[:2] + "..." + p.APIKey[len(p.APIKey)-2:]
	}

	return fmt.Sprintf("Provider{ID:%d, Name:'%s', Type:'%s', BaseURL:'%s', HasAPIKey:%v, APIKeyPreview:'%s'}",
		p.ID, p.Name, p.Type, p.BaseURL, hasAPIKey, apiKeyPreview)
}

// ProviderService handles database operations for providers
type ProviderService struct {
	DB *db.DB
}

// NewProviderService creates a new provider service
func NewProviderService(database *db.DB) *ProviderService {
	return &ProviderService{DB: database}
}

// CreateProvider adds a new provider to the database
func (s *ProviderService) CreateProvider(provider *Provider) error {
	query := `
		INSERT INTO providers (name, type, base_url, api_key, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?)
	`
	now := time.Now()
	result, err := s.DB.Exec(
		query,
		provider.Name,
		provider.Type,
		provider.BaseURL,
		provider.APIKey,
		now,
		now,
	)
	if err != nil {
		return fmt.Errorf("failed to insert provider: %w", err)
	}

	id, err := result.LastInsertId()
	if err != nil {
		return fmt.Errorf("failed to get last insert ID for provider: %w", err)
	}
	provider.ID = id
	provider.CreatedAt = now
	provider.UpdatedAt = now
	return nil
}

// GetAllProviders retrieves all providers from the database
func (s *ProviderService) GetAllProviders() ([]Provider, error) {
	query := `
		SELECT id, name, type, base_url, created_at, updated_at
		FROM providers
		ORDER BY name ASC
	` // Note: APIKey is intentionally omitted

	rows, err := s.DB.Query(query)
	if err != nil {
		return nil, fmt.Errorf("failed to query providers: %w", err)
	}
	defer rows.Close()

	var providers []Provider
	for rows.Next() {
		var p Provider
		var baseURL sql.NullString
		err := rows.Scan(&p.ID, &p.Name, &p.Type, &baseURL, &p.CreatedAt, &p.UpdatedAt)
		if err != nil {
			return nil, fmt.Errorf("failed to scan provider row: %w", err)
		}
		if baseURL.Valid {
			p.BaseURL = baseURL.String
		}
		providers = append(providers, p)
	}

	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating provider rows: %w", err)
	}

	return providers, nil
}

// GetProviderByID retrieves a single provider by its ID
func (s *ProviderService) GetProviderByID(id int64) (*Provider, error) {
	query := `
		SELECT id, name, type, base_url, created_at, updated_at
		FROM providers
		WHERE id = ?
	` // APIKey omitted

	var p Provider
	var baseURL sql.NullString
	err := s.DB.QueryRow(query, id).Scan(
		&p.ID, &p.Name, &p.Type, &baseURL, &p.CreatedAt, &p.UpdatedAt,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("provider with ID %d not found", id)
		}
		return nil, fmt.Errorf("failed to get provider by ID: %w", err)
	}

	if baseURL.Valid {
		p.BaseURL = baseURL.String
	}

	return &p, nil
}

// GetProviderByIDWithKey retrieves a provider including its API key (use with caution)
func (s *ProviderService) GetProviderByIDWithKey(id int64) (*Provider, error) {
	query := `
		SELECT id, name, type, base_url, api_key, created_at, updated_at
		FROM providers
		WHERE id = ?
	`

	var p Provider
	var baseURL, apiKey sql.NullString
	err := s.DB.QueryRow(query, id).Scan(
		&p.ID, &p.Name, &p.Type, &baseURL, &apiKey, &p.CreatedAt, &p.UpdatedAt,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("provider with ID %d not found", id)
		}
		return nil, fmt.Errorf("failed to get provider by ID: %w", err)
	}

	if baseURL.Valid {
		p.BaseURL = baseURL.String
	}
	if apiKey.Valid {
		p.APIKey = apiKey.String
	}

	return &p, nil
}

// UpdateProvider updates an existing provider
// It only updates the API key if a non-empty key is provided in the input provider struct.
func (s *ProviderService) UpdateProvider(provider *Provider) error {
	// Check if a non-empty API key was provided in the request
	shouldUpdateAPIKey := provider.APIKey != ""

	// DEBUG
	fmt.Printf("[DEBUG] UpdateProvider called for provider ID %d\n", provider.ID)
	fmt.Printf("[DEBUG] API Key provided: %s (empty? %v)\n", provider.APIKey, provider.APIKey == "")

	// Start building the query dynamically
	query := "UPDATE providers SET name = ?, type = ?, base_url = ?, updated_at = ?"
	args := []interface{}{provider.Name, provider.Type, provider.BaseURL, time.Now()}

	// Add API key update only if a new key was provided
	if shouldUpdateAPIKey {
		query += ", api_key = ?"
		args = append(args, provider.APIKey)
		// DEBUG
		fmt.Printf("[DEBUG] Adding API key to SQL query: %s\n", provider.APIKey)
	} else {
		// DEBUG
		fmt.Printf("[DEBUG] API key is empty, not adding to SQL query\n")
	}

	// Add the WHERE clause
	query += " WHERE id = ?"
	args = append(args, provider.ID)

	// DEBUG
	fmt.Printf("[DEBUG] Final SQL query: %s\n", query)

	// Execute the query
	result, err := s.DB.Exec(query, args...)
	if err != nil {
		fmt.Printf("[DEBUG] SQL Error: %v\n", err)
		return fmt.Errorf("failed to update provider %d: %w", provider.ID, err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		// Log the error but don't necessarily block if RowsAffected fails
		fmt.Printf("Warning: failed to get rows affected for provider update %d: %v\n", provider.ID, err)
	}
	if rowsAffected == 0 {
		fmt.Printf("[DEBUG] No rows affected for provider ID %d\n", provider.ID)
		return fmt.Errorf("provider with ID %d not found for update", provider.ID)
	}

	// DEBUG
	fmt.Printf("[DEBUG] Update successful for provider ID %d, rows affected: %d\n", provider.ID, rowsAffected)

	// Update the UpdatedAt field in the passed struct (optional, as it's set in DB)
	provider.UpdatedAt = args[3].(time.Time)

	return nil
}

// DeleteProvider removes a provider and its associated models explicitly within a transaction.
func (s *ProviderService) DeleteProvider(id int64) error {
	// Start a transaction
	tx, err := s.DB.Begin()
	if err != nil {
		return fmt.Errorf("failed to begin transaction for provider delete %d: %w", id, err)
	}
	// Ensure rollback on error
	defer func() {
		if r := recover(); r != nil {
			_ = tx.Rollback()
			panic(r) // Re-panic after rollback
		} else if err != nil {
			_ = tx.Rollback()
		}
	}()

	// 1. Delete associated models
	modelsQuery := `DELETE FROM models WHERE provider_id = ?`
	_, err = tx.Exec(modelsQuery, id)
	if err != nil {
		return fmt.Errorf("failed to delete models for provider %d: %w", id, err)
	}

	// 2. Delete the provider itself
	providerQuery := `DELETE FROM providers WHERE id = ?`
	result, err := tx.Exec(providerQuery, id)
	if err != nil {
		return fmt.Errorf("failed to delete provider %d: %w", id, err)
	}

	// 3. Check if the provider was actually deleted
	rowsAffected, err := result.RowsAffected()
	if err != nil {
		// Don't necessarily fail the whole transaction, but log it
		fmt.Printf("Warning: could not get rows affected for provider delete %d: %v", id, err)
	}
	if rowsAffected == 0 {
		// If provider wasn't found, trigger rollback and return error
		err = fmt.Errorf("provider with ID %d not found for deletion", id)
		return err
	}

	// 4. Commit the transaction
	err = tx.Commit()
	if err != nil {
		return fmt.Errorf("failed to commit transaction for provider delete %d: %w", id, err)
	}

	return nil
}
