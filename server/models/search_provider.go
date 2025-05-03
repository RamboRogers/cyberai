package models

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"time"
)

// SearchProviderType represents the type of search provider.
type SearchProviderType string

const (
	SearchProviderBrave     SearchProviderType = "brave"
	SearchProviderGoogleCSE SearchProviderType = "google_cse"
)

// SearchProvider represents a configured search provider instance.
type SearchProvider struct {
	ID             int64              `json:"id"`
	Name           string             `json:"name"`
	Type           SearchProviderType `json:"type"`
	APIKey         string             `json:"-"`                          // Excluded from default JSON responses
	SearchEngineID sql.NullString     `json:"search_engine_id,omitempty"` // Specific to Google CSE
	IsDefault      bool               `json:"is_default"`
	CreatedAt      time.Time          `json:"created_at"`
	UpdatedAt      time.Time          `json:"updated_at"`
}

// MarshalJSON customizes JSON marshaling to exclude APIKey.
func (sp SearchProvider) MarshalJSON() ([]byte, error) {
	type Alias SearchProvider // Avoid recursion
	// Use a different struct for marshaling that omits APIKey by default
	aux := &struct {
		*Alias
		APIKey *string `json:"api_key,omitempty"` // Explicitly omit if empty or don't include at all
	}{
		Alias: (*Alias)(&sp),
		// APIKey: explicitly nil so it's omitted
	}
	return json.Marshal(aux)
}

// SearchProviderService provides methods for managing search providers.
type SearchProviderService struct {
	db *sql.DB // Using *sql.DB directly for simplicity, could use DB wrapper
}

// NewSearchProviderService creates a new SearchProviderService.
func NewSearchProviderService(db *sql.DB) *SearchProviderService {
	return &SearchProviderService{db: db}
}

// GetAllSearchProviders retrieves all search providers.
func (s *SearchProviderService) GetAllSearchProviders() ([]SearchProvider, error) {
	rows, err := s.db.Query("SELECT id, name, type, search_engine_id, is_default, created_at, updated_at FROM search_providers ORDER BY name ASC")
	if err != nil {
		return nil, fmt.Errorf("failed to query search providers: %w", err)
	}
	defer rows.Close()

	providers := []SearchProvider{}
	for rows.Next() {
		var sp SearchProvider
		if err := rows.Scan(&sp.ID, &sp.Name, &sp.Type, &sp.SearchEngineID, &sp.IsDefault, &sp.CreatedAt, &sp.UpdatedAt); err != nil {
			return nil, fmt.Errorf("failed to scan search provider row: %w", err)
		}
		providers = append(providers, sp)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating search provider rows: %w", err)
	}

	return providers, nil
}

// GetSearchProviderByID retrieves a specific search provider by its ID.
func (s *SearchProviderService) GetSearchProviderByID(id int64) (*SearchProvider, error) {
	var sp SearchProvider
	query := "SELECT id, name, type, api_key, search_engine_id, is_default, created_at, updated_at FROM search_providers WHERE id = ?"
	err := s.db.QueryRow(query, id).Scan(
		&sp.ID, &sp.Name, &sp.Type, &sp.APIKey, &sp.SearchEngineID, &sp.IsDefault, &sp.CreatedAt, &sp.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, fmt.Errorf("search provider with ID %d not found", id)
		}
		return nil, fmt.Errorf("failed to query search provider by ID %d: %w", id, err)
	}
	return &sp, nil
}

// CreateSearchProvider adds a new search provider to the database.
// Handles setting the default flag correctly.
func (s *SearchProviderService) CreateSearchProvider(sp *SearchProvider) (int64, error) {
	tx, err := s.db.Begin()
	if err != nil {
		return 0, fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback() // Rollback on error

	// If this provider is set as default, unset others first
	if sp.IsDefault {
		_, err := tx.Exec("UPDATE search_providers SET is_default = FALSE WHERE is_default = TRUE")
		if err != nil {
			return 0, fmt.Errorf("failed to unset other default search providers: %w", err)
		}
		log.Printf("Unset other default search providers before creating new default: %s", sp.Name)
	}

	// Null out search_engine_id if not google_cse
	if sp.Type != SearchProviderGoogleCSE {
		sp.SearchEngineID = sql.NullString{Valid: false}
	}

	query := `
        INSERT INTO search_providers (name, type, api_key, search_engine_id, is_default, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `
	now := time.Now()
	result, err := tx.Exec(query, sp.Name, sp.Type, sp.APIKey, sp.SearchEngineID, sp.IsDefault, now, now)
	if err != nil {
		return 0, fmt.Errorf("failed to insert search provider: %w", err)
	}

	newID, err := result.LastInsertId()
	if err != nil {
		return 0, fmt.Errorf("failed to get last insert ID: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return 0, fmt.Errorf("failed to commit transaction: %w", err)
	}

	log.Printf("Created Search Provider ID: %d, Name: %s, Default: %t", newID, sp.Name, sp.IsDefault)
	return newID, nil
}

// UpdateSearchProvider updates an existing search provider.
// Handles setting the default flag correctly.
func (s *SearchProviderService) UpdateSearchProvider(sp *SearchProvider) error {
	tx, err := s.db.Begin()
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	// If this provider is being set as default, unset others first
	if sp.IsDefault {
		// Exclude the current provider being updated from the unset operation
		_, err := tx.Exec("UPDATE search_providers SET is_default = FALSE WHERE is_default = TRUE AND id != ?", sp.ID)
		if err != nil {
			return fmt.Errorf("failed to unset other default search providers: %w", err)
		}
		log.Printf("Unset other default search providers before updating provider ID %d to default", sp.ID)
	}

	// Null out search_engine_id if not google_cse
	if sp.Type != SearchProviderGoogleCSE {
		sp.SearchEngineID = sql.NullString{Valid: false}
	}

	query := `
        UPDATE search_providers
        SET name = ?, type = ?, api_key = ?, search_engine_id = ?, is_default = ?, updated_at = ?
        WHERE id = ?
    `
	_, err = tx.Exec(query, sp.Name, sp.Type, sp.APIKey, sp.SearchEngineID, sp.IsDefault, time.Now(), sp.ID)
	if err != nil {
		return fmt.Errorf("failed to update search provider ID %d: %w", sp.ID, err)
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("failed to commit transaction: %w", err)
	}

	log.Printf("Updated Search Provider ID: %d, Name: %s, Default: %t", sp.ID, sp.Name, sp.IsDefault)
	return nil
}

// DeleteSearchProvider deletes a search provider by its ID.
func (s *SearchProviderService) DeleteSearchProvider(id int64) error {
	query := "DELETE FROM search_providers WHERE id = ?"
	result, err := s.db.Exec(query, id)
	if err != nil {
		return fmt.Errorf("failed to delete search provider ID %d: %w", id, err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to check rows affected after delete: %w", err)
	}
	if rowsAffected == 0 {
		return fmt.Errorf("search provider with ID %d not found for deletion", id)
	}
	log.Printf("Deleted Search Provider ID: %d", id)
	return nil
}

// GetDefaultProvider returns the current default search provider, or nil if none is set.
func (s *SearchProviderService) GetDefaultProvider() (*SearchProvider, error) {
	var sp SearchProvider
	query := "SELECT id, name, type, api_key, search_engine_id, is_default, created_at, updated_at FROM search_providers WHERE is_default = TRUE LIMIT 1"
	err := s.db.QueryRow(query).Scan(
		&sp.ID, &sp.Name, &sp.Type, &sp.APIKey, &sp.SearchEngineID, &sp.IsDefault, &sp.CreatedAt, &sp.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			// No default provider set
			return nil, nil
		}
		return nil, fmt.Errorf("failed to query default search provider: %w", err)
	}
	return &sp, nil
}
