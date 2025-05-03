package models

import (
	"database/sql"
	"fmt"
)

// Role represents a user role with associated permissions.
// Assuming Role struct is defined elsewhere or already exists in this file.
/*
 type Role struct {
 	ID          int64     `json:"id"`
 	Name        string    `json:"name"`
 	Description string    `json:"description"`
 	Permissions string    `json:"permissions"` // Keep as JSON string for now
 	CreatedAt   time.Time `json:"created_at"`
 	UpdatedAt   time.Time `json:"updated_at"`
 }
*/

// RoleService provides methods for managing roles.
type RoleService struct {
	db *sql.DB
}

// NewRoleService creates a new RoleService.
func NewRoleService(db *sql.DB) *RoleService {
	return &RoleService{db: db}
}

// GetAllRoles retrieves all defined roles.
func (s *RoleService) GetAllRoles() ([]Role, error) {
	rows, err := s.db.Query("SELECT id, name, description, permissions, created_at, updated_at FROM roles ORDER BY name ASC")
	if err != nil {
		return nil, fmt.Errorf("failed to query roles: %w", err)
	}
	defer rows.Close()

	roles := []Role{}
	for rows.Next() {
		var r Role
		if err := rows.Scan(&r.ID, &r.Name, &r.Description, &r.Permissions, &r.CreatedAt, &r.UpdatedAt); err != nil {
			return nil, fmt.Errorf("failed to scan role row: %w", err)
		}
		roles = append(roles, r)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating role rows: %w", err)
	}

	return roles, nil
}
