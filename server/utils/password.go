package utils

import (
	"crypto/rand"
	"math/big"

	"golang.org/x/crypto/bcrypt"
)

// HashPassword takes a plaintext password and returns a bcrypt hash
func HashPassword(password string) (string, error) {
	// Use a cost factor of 10 - a good balance between security and performance
	// This can be adjusted based on the needs of the application
	hash, err := bcrypt.GenerateFromPassword([]byte(password), 10)
	if err != nil {
		return "", err
	}
	return string(hash), nil
}

// CheckPassword compares a plaintext password against a hash
func CheckPassword(password, hash string) bool {
	err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
	return err == nil
}

// GenerateRandomPassword creates a secure random password
func GenerateRandomPassword(length int) (string, error) {
	if length < 8 {
		length = 8 // Minimum safe length
	}

	// Characters to use in the password
	// Including uppercase, lowercase, numbers, and special characters
	const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()-_=+[]{}|;:,.<>?"
	charsetLength := big.NewInt(int64(len(charset)))

	// Create a password builder
	password := make([]byte, length)

	// Generate random bytes using crypto/rand
	for i := range password {
		// Generate a random index within the charset length
		randomIndex, err := rand.Int(rand.Reader, charsetLength)
		if err != nil {
			return "", err
		}

		// Use the random index to select a character from the charset
		password[i] = charset[randomIndex.Int64()]
	}

	return string(password), nil
}
