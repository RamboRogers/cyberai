package models

import (
	"database/sql"
	"errors"
	"fmt"
	"log"
	"time"

	"github.com/ramborogers/cyberai/server/db"
	"github.com/ramborogers/cyberai/server/utils"
)

// Role represents a user role for permission management
type Role struct {
	ID          int64     `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description,omitempty"`
	Permissions string    `json:"permissions,omitempty"` // JSON string
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// User represents a user in the system
type User struct {
	ID           int64      `json:"id"`
	Username     string     `json:"username"`
	Email        string     `json:"email"`
	FirstName    string     `json:"first_name,omitempty"`
	LastName     string     `json:"last_name,omitempty"`
	PasswordHash string     `json:"-"` // Don't expose in JSON
	RoleID       int64      `json:"role_id"`
	Role         *Role      `json:"role,omitempty"`
	IsActive     bool       `json:"is_active"`
	LastLogin    *time.Time `json:"last_login,omitempty"` // Use pointer for nullable field
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`
}

// UserService handles user-related operations
type UserService struct {
	DB *db.DB
}

// NewUserService creates a new UserService
func NewUserService(database *db.DB) *UserService {
	return &UserService{DB: database}
}

// Authenticate validates a username and password, returning the user if valid
func (s *UserService) Authenticate(username, password string) (*User, error) {
	var user User
	var passwordHash string
	var firstName, lastName sql.NullString
	var lastLogin sql.NullTime

	// Get the user by username
	err := s.DB.QueryRow(`
		SELECT u.id, u.username, u.email, u.password_hash, u.first_name, u.last_name,
		       u.role_id, u.is_active, u.last_login, u.created_at, u.updated_at
		FROM users u
		WHERE u.username = ?
	`, username).Scan(
		&user.ID, &user.Username, &user.Email, &passwordHash, &firstName,
		&lastName, &user.RoleID, &user.IsActive, &lastLogin,
		&user.CreatedAt, &user.UpdatedAt,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, errors.New("invalid username or password")
		}
		return nil, fmt.Errorf("database error: %w", err)
	}

	// Check if the user is active
	if !user.IsActive {
		return nil, errors.New("account is inactive")
	}

	// Verify password
	if !utils.CheckPassword(password, passwordHash) {
		return nil, errors.New("invalid username or password")
	}

	// Handle nullable fields
	if firstName.Valid {
		user.FirstName = firstName.String
	}

	if lastName.Valid {
		user.LastName = lastName.String
	}

	if lastLogin.Valid {
		user.LastLogin = &lastLogin.Time
	}

	// Update last login time
	_, err = s.DB.Exec(`
		UPDATE users SET last_login = ? WHERE id = ?
	`, time.Now(), user.ID)

	if err != nil {
		// Just log this error, don't fail the authentication
		fmt.Printf("Failed to update last login: %v\n", err)
	}

	// Get the user's role
	role, err := s.GetRole(user.RoleID)
	if err == nil {
		user.Role = role
	}

	return &user, nil
}

// CreateUser creates a new user
func (s *UserService) CreateUser(user *User, password string) error {
	// Hash the password
	passwordHash, err := utils.HashPassword(password)
	if err != nil {
		return fmt.Errorf("failed to hash password: %w", err)
	}

	err = s.DB.Transaction(func(tx *sql.Tx) error {
		// Insert the user
		result, err := tx.Exec(`
			INSERT INTO users (
				username, email, password_hash, first_name, last_name,
				role_id, is_active, created_at, updated_at
			)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
		`,
			user.Username, user.Email, passwordHash, user.FirstName,
			user.LastName, user.RoleID, user.IsActive, time.Now(), time.Now(),
		)

		if err != nil {
			return fmt.Errorf("failed to insert user: %w", err)
		}

		// Get the user ID
		userID, err := result.LastInsertId()
		if err != nil {
			return fmt.Errorf("failed to get user ID: %w", err)
		}

		user.ID = userID
		return nil
	})

	if err != nil {
		return err
	}

	return nil
}

// GetUserByID retrieves a user by ID
func (s *UserService) GetUserByID(userID int64) (*User, error) {
	var user User
	var firstName, lastName sql.NullString
	var lastLogin sql.NullTime

	err := s.DB.QueryRow(`
		SELECT u.id, u.username, u.email, u.first_name, u.last_name,
		       u.role_id, u.is_active, u.last_login, u.created_at, u.updated_at
		FROM users u
		WHERE u.id = ?
	`, userID).Scan(
		&user.ID, &user.Username, &user.Email, &firstName, &lastName,
		&user.RoleID, &user.IsActive, &lastLogin, &user.CreatedAt, &user.UpdatedAt,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("user not found: %d", userID)
		}
		return nil, fmt.Errorf("database error: %w", err)
	}

	if firstName.Valid {
		user.FirstName = firstName.String
	}

	if lastName.Valid {
		user.LastName = lastName.String
	}

	if lastLogin.Valid {
		user.LastLogin = &lastLogin.Time
	}

	// Get the user's role
	role, err := s.GetRole(user.RoleID)
	if err == nil {
		user.Role = role
	}

	return &user, nil
}

// GetUserByUsername retrieves a user by username
func (s *UserService) GetUserByUsername(username string) (*User, error) {
	var user User
	var firstName, lastName sql.NullString
	var lastLogin sql.NullTime

	err := s.DB.QueryRow(`
		SELECT u.id, u.username, u.email, u.first_name, u.last_name,
		       u.role_id, u.is_active, u.last_login, u.created_at, u.updated_at
		FROM users u
		WHERE u.username = ?
	`, username).Scan(
		&user.ID, &user.Username, &user.Email, &firstName, &lastName,
		&user.RoleID, &user.IsActive, &lastLogin, &user.CreatedAt, &user.UpdatedAt,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("user not found: %s", username)
		}
		return nil, fmt.Errorf("database error: %w", err)
	}

	if firstName.Valid {
		user.FirstName = firstName.String
	}

	if lastName.Valid {
		user.LastName = lastName.String
	}

	if lastLogin.Valid {
		user.LastLogin = &lastLogin.Time
	}

	// Get the user's role
	role, err := s.GetRole(user.RoleID)
	if err == nil {
		user.Role = role
	}

	return &user, nil
}

// GetUserByEmail retrieves a user by email
func (s *UserService) GetUserByEmail(email string) (*User, error) {
	var user User
	var firstName, lastName sql.NullString
	var lastLogin sql.NullTime

	err := s.DB.QueryRow(`
		SELECT u.id, u.username, u.email, u.first_name, u.last_name,
		       u.role_id, u.is_active, u.last_login, u.created_at, u.updated_at
		FROM users u
		WHERE u.email = ?
	`, email).Scan(
		&user.ID, &user.Username, &user.Email, &firstName, &lastName,
		&user.RoleID, &user.IsActive, &lastLogin, &user.CreatedAt, &user.UpdatedAt,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("user not found: %s", email)
		}
		return nil, fmt.Errorf("database error: %w", err)
	}

	if firstName.Valid {
		user.FirstName = firstName.String
	}

	if lastName.Valid {
		user.LastName = lastName.String
	}

	if lastLogin.Valid {
		user.LastLogin = &lastLogin.Time
	}

	// Get the user's role
	role, err := s.GetRole(user.RoleID)
	if err == nil {
		user.Role = role
	}

	return &user, nil
}

// UpdateUser updates an existing user
func (s *UserService) UpdateUser(user *User) error {
	_, err := s.DB.Exec(`
		UPDATE users
		SET username = ?, email = ?, first_name = ?, last_name = ?,
		    role_id = ?, is_active = ?, updated_at = ?
		WHERE id = ?
	`,
		user.Username, user.Email, user.FirstName, user.LastName,
		user.RoleID, user.IsActive, time.Now(), user.ID,
	)

	if err != nil {
		return fmt.Errorf("failed to update user: %w", err)
	}

	return nil
}

// ChangePassword changes a user's password
func (s *UserService) ChangePassword(userID int64, oldPassword, newPassword string) error {
	var currentHash string

	// Get current password hash
	err := s.DB.QueryRow("SELECT password_hash FROM users WHERE id = ?", userID).Scan(&currentHash)
	if err != nil {
		if err == sql.ErrNoRows {
			return fmt.Errorf("user not found: %d", userID)
		}
		return fmt.Errorf("database error: %w", err)
	}

	// Verify old password
	if !utils.CheckPassword(oldPassword, currentHash) {
		return errors.New("current password is incorrect")
	}

	// Hash the new password
	newHash, err := utils.HashPassword(newPassword)
	if err != nil {
		return fmt.Errorf("failed to hash new password: %w", err)
	}

	// Update the password
	_, err = s.DB.Exec(`
		UPDATE users
		SET password_hash = ?, updated_at = ?
		WHERE id = ?
	`, newHash, time.Now(), userID)

	if err != nil {
		return fmt.Errorf("failed to update password: %w", err)
	}

	return nil
}

// ResetPassword generates a new random password for a user
func (s *UserService) ResetPassword(userID int64) (string, error) {
	// Generate a new random password
	newPassword, err := utils.GenerateRandomPassword(12)
	if err != nil {
		return "", fmt.Errorf("failed to generate password: %w", err)
	}

	// Hash the new password
	newHash, err := utils.HashPassword(newPassword)
	if err != nil {
		return "", fmt.Errorf("failed to hash new password: %w", err)
	}

	// Update the password
	_, err = s.DB.Exec(`
		UPDATE users
		SET password_hash = ?, updated_at = ?
		WHERE id = ?
	`, newHash, time.Now(), userID)

	if err != nil {
		return "", fmt.Errorf("failed to reset password: %w", err)
	}

	return newPassword, nil
}

// GetAllUsers retrieves all users, optionally filtered by active status
func (s *UserService) GetAllUsers(activeOnly bool) ([]User, error) {
	var query string
	var args []interface{}

	query = `
		SELECT u.id, u.username, u.email, u.first_name, u.last_name,
		       u.role_id, u.is_active, u.last_login, u.created_at, u.updated_at
		FROM users u
	`

	if activeOnly {
		query += " WHERE u.is_active = 1"
	}

	query += " ORDER BY u.username ASC"

	rows, err := s.DB.Query(query, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to query users: %w", err)
	}
	defer rows.Close()

	var users []User
	for rows.Next() {
		var user User
		var firstName, lastName sql.NullString
		var lastLogin sql.NullTime

		err := rows.Scan(
			&user.ID, &user.Username, &user.Email, &firstName, &lastName,
			&user.RoleID, &user.IsActive, &lastLogin, &user.CreatedAt, &user.UpdatedAt,
		)

		if err != nil {
			return nil, fmt.Errorf("failed to scan user: %w", err)
		}

		if firstName.Valid {
			user.FirstName = firstName.String
		}

		if lastName.Valid {
			user.LastName = lastName.String
		}

		if lastLogin.Valid {
			user.LastLogin = &lastLogin.Time
		}

		// Get the user's role
		role, err := s.GetRole(user.RoleID)
		if err == nil {
			user.Role = role
		}

		users = append(users, user)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating users: %w", err)
	}

	return users, nil
}

// GetRole retrieves a role by ID
func (s *UserService) GetRole(roleID int64) (*Role, error) {
	var role Role

	err := s.DB.QueryRow(`
		SELECT id, name, description, permissions, created_at, updated_at
		FROM roles
		WHERE id = ?
	`, roleID).Scan(
		&role.ID, &role.Name, &role.Description, &role.Permissions,
		&role.CreatedAt, &role.UpdatedAt,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("role not found: %d", roleID)
		}
		return nil, fmt.Errorf("database error: %w", err)
	}

	return &role, nil
}

// GetAllRoles retrieves all roles
func (s *UserService) GetAllRoles() ([]Role, error) {
	rows, err := s.DB.Query(`
		SELECT id, name, description, permissions, created_at, updated_at
		FROM roles
		ORDER BY id ASC
	`)

	if err != nil {
		return nil, fmt.Errorf("failed to query roles: %w", err)
	}
	defer rows.Close()

	var roles []Role
	for rows.Next() {
		var role Role
		if err := rows.Scan(
			&role.ID, &role.Name, &role.Description, &role.Permissions,
			&role.CreatedAt, &role.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan role: %w", err)
		}
		roles = append(roles, role)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating roles: %w", err)
	}

	return roles, nil
}

// GetUsersByRole retrieves users with a specific role
func (s *UserService) GetUsersByRole(roleID int64) ([]User, error) {
	query := `
		SELECT u.id, u.username, u.email, u.first_name, u.last_name,
		       u.role_id, u.is_active, u.last_login, u.created_at, u.updated_at
		FROM users u
		WHERE u.role_id = ?
		ORDER BY u.username ASC
	`

	rows, err := s.DB.Query(query, roleID)
	if err != nil {
		return nil, fmt.Errorf("failed to query users by role: %w", err)
	}
	defer rows.Close()

	var users []User
	for rows.Next() {
		var user User
		var firstName, lastName sql.NullString
		var lastLogin sql.NullTime

		err := rows.Scan(
			&user.ID, &user.Username, &user.Email, &firstName, &lastName,
			&user.RoleID, &user.IsActive, &lastLogin, &user.CreatedAt, &user.UpdatedAt,
		)

		if err != nil {
			return nil, fmt.Errorf("failed to scan user: %w", err)
		}

		if firstName.Valid {
			user.FirstName = firstName.String
		}

		if lastName.Valid {
			user.LastName = lastName.String
		}

		if lastLogin.Valid {
			user.LastLogin = &lastLogin.Time
		}

		users = append(users, user)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating users: %w", err)
	}

	return users, nil
}

// GetUserRole retrieves the role name for a given user ID.
func (s *UserService) GetUserRole(userID int64) (string, error) {
	var roleID int64
	// First, get the role_id for the user
	err := s.DB.QueryRow(`SELECT role_id FROM users WHERE id = ?`, userID).Scan(&roleID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", fmt.Errorf("user not found: %d", userID)
		}
		return "", fmt.Errorf("database error fetching user role_id: %w", err)
	}

	// Now, get the role name using the role_id
	role, err := s.GetRole(roleID)
	if err != nil {
		// If GetRole fails (e.g., role deleted but user still exists), return error
		return "", fmt.Errorf("failed to get role details for role_id %d: %w", roleID, err)
	}

	return role.Name, nil
}

// SetUserPassword forcefully sets a new password for a given user ID (admin action).
func (s *UserService) SetUserPassword(userID int64, newPassword string) error {
	// Validate password strength (basic length check)
	if len(newPassword) < 8 {
		return errors.New("new password must be at least 8 characters long")
	}

	// Hash the new password
	newPasswordHash, err := utils.HashPassword(newPassword)
	if err != nil {
		return fmt.Errorf("failed to hash new password: %w", err)
	}

	// Update only the password_hash column
	result, err := s.DB.Exec(`
		UPDATE users
		SET password_hash = ?, updated_at = ?
		WHERE id = ?
	`,
		newPasswordHash, time.Now(), userID,
	)

	if err != nil {
		return fmt.Errorf("database error updating password hash: %w", err)
	}

	// Check if any row was actually updated (i.e., user exists)
	rowsAffected, err := result.RowsAffected()
	if err != nil {
		// Log this error but don't necessarily fail if update seemed successful otherwise
		log.Printf("Warning: could not get rows affected after password update for user %d: %v", userID, err)
	}
	if rowsAffected == 0 {
		return fmt.Errorf("user not found: %d", userID) // User ID didn't exist
	}

	log.Printf("Password hash updated successfully for user ID: %d", userID)
	return nil
}
