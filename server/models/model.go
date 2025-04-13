package models

import (
	"database/sql"
	"database/sql/driver"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/ramborogers/cyberai/server/db"
)

// ModelProvider represents the different AI model providers
type ModelProvider string

// LLMModel is an alias for Model to be used in relationships
type LLMModel = Model

const (
	OpenAI    ModelProvider = "openai"
	Ollama    ModelProvider = "ollama"
	Anthropic ModelProvider = "anthropic"
)

// Configuration is a JSON field to store provider-specific configuration
type Configuration map[string]interface{}

// Scan implements the sql.Scanner interface
func (c *Configuration) Scan(value interface{}) error {
	if value == nil {
		*c = make(Configuration)
		return nil
	}

	bytes, ok := value.([]byte)
	if !ok {
		return errors.New("failed to unmarshal Configuration value")
	}

	if err := json.Unmarshal(bytes, &c); err != nil {
		return err
	}

	return nil
}

// Value implements the driver.Valuer interface
func (c Configuration) Value() (driver.Value, error) {
	if c == nil {
		return nil, nil
	}

	return json.Marshal(c)
}

// Model represents an AI model configuration
type Model struct {
	ID                  int64         `json:"id"`
	ProviderID          int64         `json:"provider_id"` // Foreign key to providers table
	Name                string        `json:"name"`        // User-defined display name
	ModelID             string        `json:"model_id"`    // The actual ID used by the provider
	MaxTokens           int           `json:"max_tokens"`
	Temperature         float64       `json:"temperature"`
	DefaultSystemPrompt string        `json:"default_system_prompt,omitempty"`
	IsActive            bool          `json:"is_active"`
	Configuration       Configuration `json:"configuration,omitempty"` // Stored as JSON text in DB
	// Original field - exclude from JSON directly
	LastSyncedAt sql.NullTime `json:"-"`
	// New field for JSON output, formatted as string
	LastSyncedAtFormatted *string   `json:"last_synced_at,omitempty"`
	CreatedAt             time.Time `json:"created_at"`
	UpdatedAt             time.Time `json:"updated_at"`

	// Optional field for API responses (populated by join)
	Provider *Provider `json:"provider,omitempty"`
}

// UserFacingModel is a simplified view of a Model for user-facing APIs
type UserFacingModel struct {
	ID                  int64   `json:"id"`
	Name                string  `json:"name"`     // Combined name, e.g., "Llama 3 (Ollama)"
	ModelID             string  `json:"model_id"` // ID for API calls
	ProviderType        string  `json:"provider_type"`
	MaxTokens           int     `json:"max_tokens"`
	Temperature         float64 `json:"temperature"`
	DefaultSystemPrompt *string `json:"default_system_prompt,omitempty"` // Use pointer for optional field
}

// ModelService handles database operations for models
type ModelService struct {
	DB *db.DB
}

// NewModelService creates a new model service
func NewModelService(database *db.DB) *ModelService {
	return &ModelService{DB: database}
}

// GetAllModels retrieves all models, including their provider details
func (s *ModelService) GetAllModels() ([]Model, error) {
	return s.getModelsWithFilter("", false) // No provider filter, include inactive
}

// GetActiveModels retrieves only active models, including their provider details
func (s *ModelService) GetActiveModels() ([]Model, error) {
	return s.getModelsWithFilter("", true) // No provider filter, active only
}

// GetModelsByProvider retrieves models for a specific provider type
// Deprecated: Use GetModelsByProviderID or filter results from GetAllModels
func (s *ModelService) GetModelsByProvider(providerType ProviderType) ([]Model, error) {
	// This function needs more significant refactoring or removal.
	// It relied on the old schema. For now, return an error or empty list.
	fmt.Printf("Warning: GetModelsByProvider is deprecated and needs refactoring for the new schema.\n")
	// To maintain original behaviour somewhat (fetching models of a certain TYPE),
	// we can filter after fetching all.
	// This is inefficient but avoids complex query changes for a deprecated function.
	allModels, err := s.GetAllModels()
	if err != nil {
		return nil, err
	}
	var filteredModels []Model
	for _, m := range allModels {
		if m.Provider != nil && m.Provider.Type == providerType {
			filteredModels = append(filteredModels, m)
		}
	}
	return filteredModels, nil
	// return nil, fmt.Errorf("GetModelsByProvider is deprecated due to schema changes")
}

// getModelsWithFilter is a helper to fetch models with optional filtering
func (s *ModelService) getModelsWithFilter(providerIDFilter string, activeOnly bool) ([]Model, error) {
	baseQuery := `
		SELECT
			m.id, m.provider_id, m.name, m.model_id, m.max_tokens,
			m.temperature, m.default_system_prompt, m.is_active, m.configuration,
			m.last_synced_at, m.created_at, m.updated_at,
			p.id, p.name, p.type, p.base_url
		FROM models m
		LEFT JOIN providers p ON m.provider_id = p.id
	`

	var conditions []string
	var args []interface{}

	if providerIDFilter != "" {
		conditions = append(conditions, "m.provider_id = ?")
		args = append(args, providerIDFilter)
	}
	if activeOnly {
		conditions = append(conditions, "m.is_active = true")
	}

	query := baseQuery
	if len(conditions) > 0 {
		query += " WHERE " + strings.Join(conditions, " AND ")
	}
	query += " ORDER BY p.name ASC, m.name ASC"

	rows, err := s.DB.Query(query, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to query models: %w", err)
	}
	defer rows.Close()

	var models []Model
	for rows.Next() {
		var model Model
		var provider Provider
		var configJSON []byte
		var systemPrompt sql.NullString
		var lastSynced sql.NullTime
		var providerBaseURL sql.NullString

		err := rows.Scan(
			&model.ID, &model.ProviderID, &model.Name, &model.ModelID, &model.MaxTokens,
			&model.Temperature, &systemPrompt, &model.IsActive, &configJSON,
			&lastSynced, &model.CreatedAt, &model.UpdatedAt,
			&provider.ID, &provider.Name, &provider.Type, &providerBaseURL,
		)

		if err != nil {
			return nil, fmt.Errorf("failed to scan model row: %w", err)
		}

		// Assign provider details
		if providerBaseURL.Valid {
			provider.BaseURL = providerBaseURL.String
		}
		model.Provider = &provider

		// Handle model nullable fields
		if systemPrompt.Valid {
			model.DefaultSystemPrompt = systemPrompt.String
		}
		// Populate the original field for internal use
		model.LastSyncedAt = lastSynced
		// Populate the formatted field for JSON output
		if lastSynced.Valid {
			formattedTime := lastSynced.Time.UTC().Format(time.RFC3339)
			model.LastSyncedAtFormatted = &formattedTime
		} else {
			model.LastSyncedAtFormatted = nil // Ensure it's null in JSON if not valid
		}

		if len(configJSON) > 0 {
			if err := json.Unmarshal(configJSON, &model.Configuration); err != nil {
				fmt.Printf("Warning: failed to unmarshal configuration for model %d: %v\n", model.ID, err)
				model.Configuration = nil
			}
		} else {
			model.Configuration = make(Configuration)
		}

		models = append(models, model)
	}

	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating model rows: %w", err)
	}

	return models, nil
}

// GetModelByID gets a model by ID, including its associated provider details
func (s *ModelService) GetModelByID(id int64) (*Model, error) {
	query := `
		SELECT
			m.id, m.provider_id, m.name, m.model_id, m.max_tokens,
			m.temperature, m.default_system_prompt, m.is_active, m.configuration,
			m.last_synced_at, m.created_at, m.updated_at,
			p.id, p.name, p.type, p.base_url -- Provider details
		FROM models m
		LEFT JOIN providers p ON m.provider_id = p.id
		WHERE m.id = ?
	`

	var model Model
	var provider Provider // Temporary struct to scan provider details into
	var configJSON []byte
	var systemPrompt sql.NullString
	var lastSynced sql.NullTime
	var providerBaseURL sql.NullString

	err := s.DB.QueryRow(query, id).Scan(
		&model.ID, &model.ProviderID, &model.Name, &model.ModelID, &model.MaxTokens,
		&model.Temperature, &systemPrompt, &model.IsActive, &configJSON,
		&lastSynced, &model.CreatedAt, &model.UpdatedAt,
		&provider.ID, &provider.Name, &provider.Type, &providerBaseURL, // Scan provider fields
	)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("model with ID %d not found", id)
		}
		return nil, fmt.Errorf("failed to query model by ID: %w", err)
	}

	// Assign scanned provider details to the model
	if providerBaseURL.Valid {
		provider.BaseURL = providerBaseURL.String
	}
	model.Provider = &provider // Assign the populated provider struct

	// Handle nullable fields for the model
	if systemPrompt.Valid {
		model.DefaultSystemPrompt = systemPrompt.String
	}
	// Populate the original field for internal use
	model.LastSyncedAt = lastSynced
	// Populate the formatted field for JSON output
	if lastSynced.Valid {
		formattedTime := lastSynced.Time.UTC().Format(time.RFC3339)
		model.LastSyncedAtFormatted = &formattedTime
	} else {
		model.LastSyncedAtFormatted = nil // Ensure it's null in JSON if not valid
	}

	if len(configJSON) > 0 {
		if err := json.Unmarshal(configJSON, &model.Configuration); err != nil {
			// Log the error but don't fail the whole retrieval if config is bad
			fmt.Printf("Warning: failed to unmarshal configuration for model %d: %v\n", model.ID, err)
			model.Configuration = nil // Set to nil or empty map
		}
	} else {
		model.Configuration = make(Configuration)
	}

	return &model, nil
}

// CreateModel creates a new model linked to a specific provider
func (s *ModelService) CreateModel(model *Model) error {
	query := `
		INSERT INTO models (
			provider_id, name, model_id, max_tokens, temperature,
			default_system_prompt, is_active, configuration, last_synced_at,
			created_at, updated_at
		)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`

	configJSON, err := model.Configuration.Value() // Use Value() for driver compatibility
	if err != nil {
		return fmt.Errorf("failed to marshal configuration: %w", err)
	}
	// Handle nil configuration gracefully
	if configJSON == nil {
		configJSON = []byte("{}") // Store as empty JSON object if nil
	}

	var systemPrompt sql.NullString
	if model.DefaultSystemPrompt != "" {
		systemPrompt = sql.NullString{String: model.DefaultSystemPrompt, Valid: true}
	}

	now := time.Now()
	model.CreatedAt = now
	model.UpdatedAt = now

	// Ensure LastSyncedAt is handled correctly (it's sql.NullTime)
	var lastSynced sql.NullTime
	if model.LastSyncedAt.Valid {
		lastSynced = model.LastSyncedAt
	}

	result, err := s.DB.Exec(
		query,
		model.ProviderID,
		model.Name,
		model.ModelID,
		model.MaxTokens,
		model.Temperature,
		systemPrompt,
		model.IsActive,
		configJSON, // Pass marshaled JSON bytes
		lastSynced, // Pass sql.NullTime
		model.CreatedAt,
		model.UpdatedAt,
	)

	if err != nil {
		// Check for foreign key constraint error
		if strings.Contains(err.Error(), "FOREIGN KEY constraint failed") {
			return fmt.Errorf("provider with ID %d does not exist", model.ProviderID)
		}
		// Check for unique constraint error
		if strings.Contains(err.Error(), "UNIQUE constraint failed: models.provider_id, models.model_id") {
			return fmt.Errorf("model '%s' already exists for provider %d", model.ModelID, model.ProviderID)
		}
		return fmt.Errorf("failed to insert model: %w", err)
	}

	id, err := result.LastInsertId()
	if err != nil {
		return fmt.Errorf("failed to get last insert ID for model: %w", err)
	}

	model.ID = id
	return nil
}

// UpdateModel updates an existing model
// Note: ProviderID cannot be changed via this method.
func (s *ModelService) UpdateModel(model *Model) error {
	query := `
		UPDATE models
		SET name = ?, model_id = ?, max_tokens = ?, temperature = ?,
		    default_system_prompt = ?, is_active = ?, configuration = ?,
		    last_synced_at = ?, updated_at = ?
		WHERE id = ?
	`

	configJSON, err := model.Configuration.Value()
	if err != nil {
		return fmt.Errorf("failed to marshal configuration for update: %w", err)
	}
	if configJSON == nil {
		configJSON = []byte("{}")
	}

	var systemPrompt sql.NullString
	if model.DefaultSystemPrompt != "" {
		systemPrompt = sql.NullString{String: model.DefaultSystemPrompt, Valid: true}
	}

	now := time.Now()
	model.UpdatedAt = now

	// Ensure LastSyncedAt is handled correctly
	var lastSynced sql.NullTime
	if model.LastSyncedAt.Valid {
		lastSynced = model.LastSyncedAt
	}

	result, err := s.DB.Exec(
		query,
		model.Name,
		model.ModelID,
		model.MaxTokens,
		model.Temperature,
		systemPrompt,
		model.IsActive,
		configJSON,
		lastSynced,
		model.UpdatedAt,
		model.ID, // WHERE clause
	)

	if err != nil {
		// Check for unique constraint error (if model_id is changed to conflict)
		if strings.Contains(err.Error(), "UNIQUE constraint failed: models.provider_id, models.model_id") {
			// We need the provider ID to give a good error message, but it's not readily available here.
			// A pre-fetch might be needed for a better error, or a more generic message.
			return fmt.Errorf("model ID '%s' already exists for this provider", model.ModelID)
		}
		return fmt.Errorf("failed to update model %d: %w", model.ID, err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected for model update %d: %w", model.ID, err)
	}

	if rowsAffected == 0 {
		return fmt.Errorf("model with ID %d not found for update", model.ID)
	}

	return nil
}

// DeleteModel removes a model by ID
func (s *ModelService) DeleteModel(id int64) error {
	query := "DELETE FROM models WHERE id = ?"

	result, err := s.DB.Exec(query, id)
	if err != nil {
		return err
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return err
	}

	if rowsAffected == 0 {
		return fmt.Errorf("model with ID %d not found", id)
	}

	return nil
}

// GetAPIKeyByID retrieves just the API key for a model
func (s *ModelService) GetAPIKeyByID(id int64) (string, error) {
	query := "SELECT api_key FROM models WHERE id = ?"

	var apiKey string
	err := s.DB.QueryRow(query, id).Scan(&apiKey)
	if err != nil {
		if err == sql.ErrNoRows {
			return "", fmt.Errorf("model with ID %d not found", id)
		}
		return "", err
	}

	return apiKey, nil
}

// OllamaModelResponse is the response format from Ollama API /api/tags
type OllamaModelResponse struct {
	Models []struct {
		Name       string `json:"name"`
		Size       int64  `json:"size"`
		ModifiedAt string `json:"modified_at"`
		Digest     string `json:"digest"`
	} `json:"models"`
}

// OpenAIModelResponse is the response format from OpenAI API /v1/models
type OpenAIModelResponse struct {
	Object string `json:"object"`
	Data   []struct {
		ID         string `json:"id"`
		Object     string `json:"object"`
		Created    int64  `json:"created"`
		OwnedBy    string `json:"owned_by"`
		Permission []struct {
			ID                 string      `json:"id"`
			Object             string      `json:"object"`
			Created            int64       `json:"created"`
			AllowCreateEngine  bool        `json:"allow_create_engine"`
			AllowSampling      bool        `json:"allow_sampling"`
			AllowLogprobs      bool        `json:"allow_logprobs"`
			AllowSearchIndices bool        `json:"allow_search_indices"`
			AllowView          bool        `json:"allow_view"`
			AllowFineTuning    bool        `json:"allow_fine_tuning"`
			Organization       string      `json:"organization"`
			Group              interface{} `json:"group"`
			IsBlocking         bool        `json:"is_blocking"`
		} `json:"permission,omitempty"`
	} `json:"data"`
}

// SyncOllamaModelsForProvider fetches the list of models from an Ollama provider and
// syncs them with the database (creates new, updates sync time, marks missing as inactive).
func (s *ModelService) SyncOllamaModelsForProvider(providerID int64, defaultTokens int, setActive bool) ([]Model, []error) {
	// 1. Fetch Provider details (need BaseURL and APIKey)
	// Note: This requires access to ProviderService or passing DB connection.
	// For now, let's assume we have a way to get the provider details.
	// We need to instantiate ProviderService. This dependency should be injected into ModelService.
	// TODO: Inject ProviderService into ModelService
	providerService := NewProviderService(s.DB) // Temporary instantiation
	provider, err := providerService.GetProviderByIDWithKey(providerID)
	if err != nil {
		return nil, []error{fmt.Errorf("failed to get provider details for ID %d: %w", providerID, err)}
	}
	if provider.Type != ProviderOllama {
		return nil, []error{fmt.Errorf("provider ID %d is not an Ollama provider (type: %s)", providerID, provider.Type)}
	}
	if provider.BaseURL == "" {
		return nil, []error{fmt.Errorf("Ollama provider ID %d has no BaseURL configured", providerID)}
	}

	baseURL := strings.TrimSuffix(provider.BaseURL, "/")
	apiKey := provider.APIKey

	// 2. Make API request to Ollama server
	req, err := http.NewRequest("GET", baseURL+"/api/tags", nil)
	if err != nil {
		return nil, []error{fmt.Errorf("failed to create Ollama API request for %s: %w", baseURL, err)}
	}
	if apiKey != "" {
		req.Header.Add("Authorization", "Bearer "+apiKey)
	}

	client := &http.Client{Timeout: 30 * time.Second} // Add a timeout
	resp, err := client.Do(req)
	if err != nil {
		return nil, []error{fmt.Errorf("failed to connect to Ollama server %s: %w", baseURL, err)}
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		// Try to read body for more info
		bodyBytes, _ := io.ReadAll(resp.Body)
		bodyStr := string(bodyBytes)
		return nil, []error{fmt.Errorf("Ollama server %s returned status %d: %s", baseURL, resp.StatusCode, bodyStr)}
	}

	// 3. Parse response
	var ollamaResp OllamaModelResponse
	if err := json.NewDecoder(resp.Body).Decode(&ollamaResp); err != nil {
		return nil, []error{fmt.Errorf("failed to parse Ollama response from %s: %w", baseURL, err)}
	}

	// 4. Get existing models for this provider from DB
	existingModelsDB, err := s.getModelsWithFilter(fmt.Sprintf("%d", providerID), false) // Get all (active/inactive) for this provider
	if err != nil {
		return nil, []error{fmt.Errorf("failed to get existing models for provider %d: %w", providerID, err)}
	}

	// Create maps for efficient lookup
	existingModelMap := make(map[string]Model)
	for _, m := range existingModelsDB {
		existingModelMap[m.ModelID] = m
	}
	apiModelMap := make(map[string]bool)

	var createdModels []Model
	var updatedModels []Model
	var syncErrors []error
	now := time.Now()

	// 5. Process models found in the API response
	for _, ollamaModel := range ollamaResp.Models {
		apiModelMap[ollamaModel.Name] = true
		maxTokens := calculateMaxTokens(ollamaModel, defaultTokens)

		// Check if model exists in our DB map for this provider
		if existing, exists := existingModelMap[ollamaModel.Name]; exists {
			// Model exists - Update LastSyncedAt and ensure it's active if requested
			existing.LastSyncedAt = sql.NullTime{Time: now, Valid: true}
			if setActive { // If global setActive is true, ensure this model is active
				existing.IsActive = true
			}
			// Optionally update other fields like max_tokens if they differ?
			// existing.MaxTokens = maxTokens // Example: Keep tokens synced
			if err := s.UpdateModel(&existing); err != nil {
				syncErrors = append(syncErrors, fmt.Errorf("failed to update sync time for model %s (ID %d): %w", existing.Name, existing.ID, err))
			} else {
				updatedModels = append(updatedModels, existing)
			}
		} else {
			// Model is new - Create it
			newModel := Model{
				ProviderID:  providerID,
				Name:        ollamaModel.Name, // Use API name as default display name
				ModelID:     ollamaModel.Name,
				MaxTokens:   maxTokens,
				Temperature: 0.8,       // Updated default temperature
				IsActive:    setActive, // Set based on parameter
				Configuration: Configuration{
					"size":        ollamaModel.Size,
					"digest":      ollamaModel.Digest,
					"modified_at": ollamaModel.ModifiedAt,
				},
				LastSyncedAt: sql.NullTime{Time: now, Valid: true},
			}
			if err := s.CreateModel(&newModel); err != nil {
				syncErrors = append(syncErrors, fmt.Errorf("failed to create new model %s: %w", ollamaModel.Name, err))
			} else {
				// Fetch the provider details to include in the response model
				newModel.Provider = provider
				createdModels = append(createdModels, newModel)
			}
		}
	}

	// 6. Process models in DB that were *not* found in the API response
	for modelID, dbModel := range existingModelMap {
		if !apiModelMap[modelID] {
			// This model is in our DB but not in the latest API list for this provider
			if dbModel.IsActive {
				fmt.Printf("Marking model %s (ID %d) as inactive for provider %d as it was not found during sync.\n", dbModel.Name, dbModel.ID, providerID)
				dbModel.IsActive = false
				dbModel.LastSyncedAt = sql.NullTime{} // Clear last sync time
				if err := s.UpdateModel(&dbModel); err != nil {
					syncErrors = append(syncErrors, fmt.Errorf("failed to mark model %s (ID %d) as inactive: %w", dbModel.Name, dbModel.ID, err))
				}
			}
		}
	}

	// Return only newly created models for consistency with old behavior, plus any errors
	return createdModels, syncErrors
}

// SyncOpenAIModelsForProvider fetches the list of models from an OpenAI provider and
// syncs them with the database (creates new models, updates sync time).
func (s *ModelService) SyncOpenAIModelsForProvider(providerID int64, defaultTokens int, setActive bool) ([]Model, []error) {
	// 1. Fetch Provider details (need BaseURL and APIKey)
	providerService := NewProviderService(s.DB)
	provider, err := providerService.GetProviderByIDWithKey(providerID)
	if err != nil {
		return nil, []error{fmt.Errorf("failed to get provider details for ID %d: %w", providerID, err)}
	}
	if provider.Type != ProviderOpenAI {
		return nil, []error{fmt.Errorf("provider ID %d is not an OpenAI provider (type: %s)", providerID, provider.Type)}
	}
	if provider.APIKey == "" {
		return nil, []error{fmt.Errorf("OpenAI provider ID %d has no API key configured", providerID)}
	}

	// Use custom base URL if provided, otherwise use default OpenAI API URL
	apiURL := "https://api.openai.com/v1/models"
	if provider.BaseURL != "" {
		baseURL := strings.TrimSuffix(provider.BaseURL, "/")
		apiURL = baseURL + "/v1/models"
	}

	// 2. Make API request to OpenAI
	req, err := http.NewRequest("GET", apiURL, nil)
	if err != nil {
		return nil, []error{fmt.Errorf("failed to create OpenAI API request: %w", err)}
	}
	req.Header.Add("Authorization", "Bearer "+provider.APIKey)
	req.Header.Add("Content-Type", "application/json")

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, []error{fmt.Errorf("failed to connect to OpenAI API: %w", err)}
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp.Body)
		bodyStr := string(bodyBytes)
		return nil, []error{fmt.Errorf("OpenAI API returned status %d: %s", resp.StatusCode, bodyStr)}
	}

	// 3. Parse response
	var openaiResp OpenAIModelResponse
	if err := json.NewDecoder(resp.Body).Decode(&openaiResp); err != nil {
		return nil, []error{fmt.Errorf("failed to parse OpenAI response: %w", err)}
	}

	// 4. Get existing models for this provider from DB
	existingModelsDB, err := s.getModelsWithFilter(fmt.Sprintf("%d", providerID), false)
	if err != nil {
		return nil, []error{fmt.Errorf("failed to get existing models for provider %d: %w", providerID, err)}
	}

	// Create maps for efficient lookup
	existingModelMap := make(map[string]Model)
	for _, m := range existingModelsDB {
		existingModelMap[m.ModelID] = m
	}
	apiModelMap := make(map[string]bool)

	var createdModels []Model
	var updatedModels []Model
	var deletedModels []Model
	var syncErrors []error
	now := time.Now()

	// 5. Process models found in the API response
	for _, openaiModel := range openaiResp.Data {
		// Skip assistant models or other model types you may want to exclude
		if strings.HasPrefix(openaiModel.ID, "assistant-") ||
			strings.HasPrefix(openaiModel.ID, "ft:") ||
			strings.HasPrefix(openaiModel.ID, "whisper") ||
			openaiModel.ID == "moderation" ||
			openaiModel.ID == "moderation-latest" ||
			strings.HasPrefix(openaiModel.ID, "embedding") ||
			strings.HasPrefix(openaiModel.ID, "tts") ||
			strings.HasPrefix(openaiModel.ID, "dall-e") ||
			strings.Contains(openaiModel.ID, "instruct") {
			continue
		}

		apiModelMap[openaiModel.ID] = true
		maxTokens := determineOpenAIModelMaxTokens(openaiModel.ID, defaultTokens)

		// Check if model exists in our DB for this provider
		if existing, exists := existingModelMap[openaiModel.ID]; exists {
			// Model exists - Update LastSyncedAt and ensure it's active if requested
			existing.LastSyncedAt = sql.NullTime{Time: now, Valid: true}
			if setActive {
				existing.IsActive = true
			}

			// Keep max tokens updated if larger than current setting
			if maxTokens > existing.MaxTokens {
				existing.MaxTokens = maxTokens
			}

			if err := s.UpdateModel(&existing); err != nil {
				syncErrors = append(syncErrors, fmt.Errorf("failed to update sync time for model %s (ID %d): %w", existing.Name, existing.ID, err))
			} else {
				updatedModels = append(updatedModels, existing)
			}
		} else {
			// Model is new - Create it with a display name derived from the model ID
			displayName := formatOpenAIModelName(openaiModel.ID)

			newModel := Model{
				ProviderID:  providerID,
				Name:        displayName,
				ModelID:     openaiModel.ID,
				MaxTokens:   maxTokens,
				Temperature: 0.8, // Updated default temperature
				IsActive:    setActive,
				Configuration: Configuration{
					"model_type": determineOpenAIModelType(openaiModel.ID),
					"created":    openaiModel.Created,
					"owned_by":   openaiModel.OwnedBy,
				},
				LastSyncedAt: sql.NullTime{Time: now, Valid: true},
			}

			if err := s.CreateModel(&newModel); err != nil {
				syncErrors = append(syncErrors, fmt.Errorf("failed to create new model %s: %w", openaiModel.ID, err))
			} else {
				// Fetch the provider details to include in the response model
				newModel.Provider = provider
				createdModels = append(createdModels, newModel)
			}
		}
	}

	// 6. DELETE models that are in the database but no longer in the API response
	for modelID, dbModel := range existingModelMap {
		if !apiModelMap[modelID] {
			// Model exists in database but not in the current API response - delete it
			log.Printf("Deleting OpenAI model %s (ID %d) for provider %d as it was not found during sync.", dbModel.Name, dbModel.ID, providerID)

			if err := s.DeleteModel(dbModel.ID); err != nil {
				syncErrors = append(syncErrors, fmt.Errorf("failed to delete model %s (ID %d): %w", dbModel.Name, dbModel.ID, err))
			} else {
				deletedModels = append(deletedModels, dbModel)
			}
		}
	}

	// Log summary of sync operation
	log.Printf("OpenAI sync complete for provider %d (%s): %d created, %d updated, %d deleted, %d errors",
		providerID, provider.Name, len(createdModels), len(updatedModels), len(deletedModels), len(syncErrors))

	// Return only newly created models for consistency with Ollama implementation
	return createdModels, syncErrors
}

// determineOpenAIModelMaxTokens returns the maximum token limit for a given OpenAI model ID
func determineOpenAIModelMaxTokens(modelID string, defaultTokens int) int {
	if defaultTokens > 0 {
		return defaultTokens
	}

	// Default to conservative estimate if model not recognized
	maxTokens := 4096

	// Model-specific token limits based on OpenAI documentation
	switch {
	case strings.HasPrefix(modelID, "gpt-4-turbo"):
		maxTokens = 128000
	case strings.Contains(modelID, "gpt-4o"):
		maxTokens = 128000
	case strings.HasPrefix(modelID, "gpt-4-vision"):
		maxTokens = 128000
	case strings.Contains(modelID, "gpt-4-32k"):
		maxTokens = 32768
	case strings.HasPrefix(modelID, "gpt-4-1106"):
		maxTokens = 128000
	case strings.HasPrefix(modelID, "gpt-4-0125"):
		maxTokens = 128000
	case strings.HasPrefix(modelID, "gpt-4"):
		maxTokens = 8192
	case strings.Contains(modelID, "gpt-3.5-turbo-16k"):
		maxTokens = 16384
	case strings.Contains(modelID, "gpt-3.5-turbo-1106"):
		maxTokens = 16384
	case strings.Contains(modelID, "gpt-3.5-turbo"):
		maxTokens = 4096
	case strings.Contains(modelID, "davinci"):
		maxTokens = 4096
	case strings.Contains(modelID, "curie"):
		maxTokens = 2048
	case strings.Contains(modelID, "babbage"):
		maxTokens = 2048
	case strings.Contains(modelID, "ada"):
		maxTokens = 2048
	}
	return maxTokens
}

// determineOpenAIModelType returns a general model type category for classification
func determineOpenAIModelType(modelID string) string {
	switch {
	case strings.HasPrefix(modelID, "gpt-4"):
		return "gpt-4"
	case strings.HasPrefix(modelID, "gpt-3.5"):
		return "gpt-3.5"
	case strings.Contains(modelID, "davinci"):
		return "davinci"
	case strings.Contains(modelID, "curie"):
		return "curie"
	case strings.Contains(modelID, "babbage"):
		return "babbage"
	case strings.Contains(modelID, "ada"):
		return "ada"
	default:
		return "unknown"
	}
}

// formatOpenAIModelName creates a user-friendly display name from the model ID
func formatOpenAIModelName(modelID string) string {
	// Replace hyphens with spaces and capitalize words for better readability
	parts := strings.Split(modelID, "-")
	for i, part := range parts {
		if len(part) > 0 {
			parts[i] = strings.ToUpper(part[:1]) + part[1:]
		}
	}
	return strings.Join(parts, " ")
}

// Helper function to calculate max tokens based on Ollama model info
func calculateMaxTokens(ollamaModel struct {
	Name       string `json:"name"`
	Size       int64  `json:"size"`
	ModifiedAt string `json:"modified_at"`
	Digest     string `json:"digest"`
}, defaultTokens int) int {
	if defaultTokens > 0 {
		return defaultTokens
	}

	maxTokens := 8192 // Default fallback
	modelName := strings.ToLower(ollamaModel.Name)

	switch {
	case strings.Contains(modelName, "gemma:2b") || strings.Contains(modelName, "phi-2"):
		maxTokens = 4096
	case strings.Contains(modelName, "gemma3:8b") || strings.Contains(modelName, "mistral-7b"):
		maxTokens = 8192
	case strings.Contains(modelName, "llama2") || strings.Contains(modelName, "llama-2"):
		maxTokens = 4096
	case strings.Contains(modelName, "llama3") || strings.Contains(modelName, "llama-3"):
		maxTokens = 8192
	case strings.Contains(modelName, "mixtral") || strings.Contains(modelName, "gemma3:27b"):
		maxTokens = 32768
	case strings.Contains(modelName, "gemma3:3"):
		maxTokens = 128000
	case strings.Contains(modelName, "claude") || strings.Contains(modelName, "gpt-4"):
		maxTokens = 128000
	case ollamaModel.Size > 20000000000: // > 20GB
		maxTokens = 32768
	case ollamaModel.Size > 5000000000: // > 5GB
		maxTokens = 8192
	}
	return maxTokens
}

// GetActiveUserFacingModels retrieves active models formatted for user display.
func (s *ModelService) GetActiveUserFacingModels() ([]UserFacingModel, error) {
	// Use existing filter logic to get active models with provider info
	activeModels, err := s.getModelsWithFilter("", true)
	if err != nil {
		return nil, fmt.Errorf("failed to get active models: %w", err)
	}

	userFacingModels := make([]UserFacingModel, 0, len(activeModels))
	for _, model := range activeModels {
		// Ensure provider details are available (should be due to LEFT JOIN)
		providerName := "Unknown Provider"
		providerType := "unknown"
		if model.Provider != nil {
			providerName = model.Provider.Name
			providerType = string(model.Provider.Type)
		}

		ufm := UserFacingModel{
			ID:           model.ID,
			Name:         fmt.Sprintf("%s (%s)", model.Name, providerName),
			ModelID:      model.ModelID,
			ProviderType: providerType,
			MaxTokens:    model.MaxTokens,
			Temperature:  model.Temperature,
		}

		// Handle optional system prompt
		if model.DefaultSystemPrompt != "" {
			ufm.DefaultSystemPrompt = &model.DefaultSystemPrompt
		}

		userFacingModels = append(userFacingModels, ufm)
	}

	return userFacingModels, nil
}
