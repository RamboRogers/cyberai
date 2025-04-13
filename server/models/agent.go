package models

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"github.com/ramborogers/cyberai/server/db"
)

// Agent represents a specialized AI agent with specific system prompts and configuration
type Agent struct {
	ID            int64                  `json:"id"`
	Name          string                 `json:"name"`
	Description   string                 `json:"description"`
	SystemPrompt  string                 `json:"system_prompt"`
	ModelID       int64                  `json:"model_id"`
	UserID        int64                  `json:"user_id"`
	IsPublic      bool                   `json:"is_public"`
	IsActive      bool                   `json:"is_active"`
	Configuration map[string]interface{} `json:"configuration,omitempty"`
	CreatedAt     time.Time              `json:"created_at"`
	UpdatedAt     time.Time              `json:"updated_at"`

	// Optional fields for API responses
	Model *LLMModel `json:"model,omitempty"`
}

// AgentService handles operations related to AI agents
type AgentService struct {
	DB *db.DB
}

// NewAgentService creates a new AgentService
func NewAgentService(database *db.DB) *AgentService {
	return &AgentService{DB: database}
}

// GetAgent retrieves an agent by ID
func (s *AgentService) GetAgent(agentID int64) (*Agent, error) {
	var agent Agent
	var configJSON []byte

	err := s.DB.QueryRow(`
		SELECT id, name, description, system_prompt, model_id, user_id,
		       is_public, is_active, configuration, created_at, updated_at
		FROM agents
		WHERE id = ?
	`, agentID).Scan(
		&agent.ID, &agent.Name, &agent.Description, &agent.SystemPrompt,
		&agent.ModelID, &agent.UserID, &agent.IsPublic, &agent.IsActive,
		&configJSON, &agent.CreatedAt, &agent.UpdatedAt,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("agent not found: %d", agentID)
		}
		return nil, fmt.Errorf("database error: %w", err)
	}

	// Parse the configuration JSON
	if len(configJSON) > 0 {
		if err := json.Unmarshal(configJSON, &agent.Configuration); err != nil {
			return nil, fmt.Errorf("failed to parse agent configuration: %w", err)
		}
	} else {
		agent.Configuration = make(map[string]interface{})
	}

	return &agent, nil
}

// ListAgents retrieves all agents, with optional filtering
func (s *AgentService) ListAgents(userID int64, includePublic bool, activeOnly bool) ([]Agent, error) {
	query := `
		SELECT id, name, description, system_prompt, model_id, user_id,
		       is_public, is_active, configuration, created_at, updated_at
		FROM agents
		WHERE user_id = ?
	`

	args := []interface{}{userID}

	if includePublic {
		query = `
			SELECT id, name, description, system_prompt, model_id, user_id,
			       is_public, is_active, configuration, created_at, updated_at
			FROM agents
			WHERE user_id = ? OR is_public = 1
		`
	}

	if activeOnly {
		query += " AND is_active = 1"
	}

	query += " ORDER BY name ASC"

	rows, err := s.DB.Query(query, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to query agents: %w", err)
	}
	defer rows.Close()

	var agents []Agent
	for rows.Next() {
		var agent Agent
		var configJSON []byte

		if err := rows.Scan(
			&agent.ID, &agent.Name, &agent.Description, &agent.SystemPrompt,
			&agent.ModelID, &agent.UserID, &agent.IsPublic, &agent.IsActive,
			&configJSON, &agent.CreatedAt, &agent.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan agent: %w", err)
		}

		// Parse the configuration JSON
		if len(configJSON) > 0 {
			if err := json.Unmarshal(configJSON, &agent.Configuration); err != nil {
				return nil, fmt.Errorf("failed to parse agent configuration: %w", err)
			}
		} else {
			agent.Configuration = make(map[string]interface{})
		}

		agents = append(agents, agent)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating agents: %w", err)
	}

	return agents, nil
}

// CreateAgent creates a new agent
func (s *AgentService) CreateAgent(agent *Agent) error {
	// Serialize configuration to JSON
	configJSON, err := json.Marshal(agent.Configuration)
	if err != nil {
		return fmt.Errorf("failed to marshal configuration: %w", err)
	}

	err = s.DB.Transaction(func(tx *sql.Tx) error {
		// Insert the agent
		result, err := tx.Exec(`
			INSERT INTO agents (
				name, description, system_prompt, model_id, user_id,
				is_public, is_active, configuration, created_at, updated_at
			)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`,
			agent.Name, agent.Description, agent.SystemPrompt, agent.ModelID,
			agent.UserID, agent.IsPublic, agent.IsActive, configJSON,
			time.Now(), time.Now(),
		)

		if err != nil {
			return fmt.Errorf("failed to insert agent: %w", err)
		}

		// Get the agent ID
		agentID, err := result.LastInsertId()
		if err != nil {
			return fmt.Errorf("failed to get agent ID: %w", err)
		}

		agent.ID = agentID
		return nil
	})

	if err != nil {
		return err
	}

	return nil
}

// UpdateAgent updates an existing agent
func (s *AgentService) UpdateAgent(agent *Agent) error {
	// Serialize configuration to JSON
	configJSON, err := json.Marshal(agent.Configuration)
	if err != nil {
		return fmt.Errorf("failed to marshal configuration: %w", err)
	}

	_, err = s.DB.Exec(`
		UPDATE agents
		SET name = ?, description = ?, system_prompt = ?, model_id = ?,
		    is_public = ?, is_active = ?, configuration = ?, updated_at = ?
		WHERE id = ? AND user_id = ?
	`,
		agent.Name, agent.Description, agent.SystemPrompt, agent.ModelID,
		agent.IsPublic, agent.IsActive, configJSON, time.Now(),
		agent.ID, agent.UserID,
	)

	if err != nil {
		return fmt.Errorf("failed to update agent: %w", err)
	}

	return nil
}

// DeleteAgent deletes an agent
func (s *AgentService) DeleteAgent(agentID int64, userID int64) error {
	result, err := s.DB.Exec(
		"DELETE FROM agents WHERE id = ? AND user_id = ?",
		agentID, userID,
	)

	if err != nil {
		return fmt.Errorf("failed to delete agent: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("error checking rows affected: %w", err)
	}

	if rowsAffected == 0 {
		return fmt.Errorf("no agent found with ID %d for user %d", agentID, userID)
	}

	return nil
}

// ToggleAgentStatus activates or deactivates an agent
func (s *AgentService) ToggleAgentStatus(agentID int64, userID int64, isActive bool) error {
	result, err := s.DB.Exec(`
		UPDATE agents
		SET is_active = ?, updated_at = ?
		WHERE id = ? AND user_id = ?
	`, isActive, time.Now(), agentID, userID)

	if err != nil {
		return fmt.Errorf("failed to toggle agent status: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("error checking rows affected: %w", err)
	}

	if rowsAffected == 0 {
		return fmt.Errorf("no agent found with ID %d for user %d", agentID, userID)
	}

	return nil
}

// ToggleAgentPublic changes the public visibility of an agent
func (s *AgentService) ToggleAgentPublic(agentID int64, userID int64, isPublic bool) error {
	result, err := s.DB.Exec(`
		UPDATE agents
		SET is_public = ?, updated_at = ?
		WHERE id = ? AND user_id = ?
	`, isPublic, time.Now(), agentID, userID)

	if err != nil {
		return fmt.Errorf("failed to toggle agent visibility: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("error checking rows affected: %w", err)
	}

	if rowsAffected == 0 {
		return fmt.Errorf("no agent found with ID %d for user %d", agentID, userID)
	}

	return nil
}

// GetUserAgents gets all agents created by a specific user
func (s *AgentService) GetUserAgents(userID int64) ([]Agent, error) {
	return s.ListAgents(userID, false, false)
}

// GetActiveAgents gets all active agents available to a user
func (s *AgentService) GetActiveAgents(userID int64) ([]Agent, error) {
	return s.ListAgents(userID, true, true)
}

// CloneAgent creates a copy of an existing agent for a user
func (s *AgentService) CloneAgent(agentID int64, userID int64) (*Agent, error) {
	// First check if the agent exists and is either public or owned by the user
	var agent Agent
	var configJSON []byte

	err := s.DB.QueryRow(`
		SELECT id, name, description, system_prompt, model_id,
		       is_public, configuration
		FROM agents
		WHERE id = ? AND (is_public = 1 OR user_id = ?)
	`, agentID, userID).Scan(
		&agent.ID, &agent.Name, &agent.Description, &agent.SystemPrompt,
		&agent.ModelID, &agent.IsPublic, &configJSON,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("agent not found or not accessible: %d", agentID)
		}
		return nil, fmt.Errorf("database error: %w", err)
	}

	// Parse the configuration JSON
	if len(configJSON) > 0 {
		if err := json.Unmarshal(configJSON, &agent.Configuration); err != nil {
			return nil, fmt.Errorf("failed to parse agent configuration: %w", err)
		}
	} else {
		agent.Configuration = make(map[string]interface{})
	}

	// Create a new agent based on the existing one
	newAgent := Agent{
		Name:          agent.Name + " (Clone)",
		Description:   agent.Description,
		SystemPrompt:  agent.SystemPrompt,
		ModelID:       agent.ModelID,
		UserID:        userID,
		IsPublic:      false,
		IsActive:      true,
		Configuration: agent.Configuration,
	}

	// Insert the new agent
	if err := s.CreateAgent(&newAgent); err != nil {
		return nil, fmt.Errorf("failed to clone agent: %w", err)
	}

	return &newAgent, nil
}
