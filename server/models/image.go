package models

import (
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"github.com/ramborogers/cyberai/server/db"
)

// Image represents an uploaded image file
type Image struct {
	ID           int64     `json:"id" gorm:"primaryKey"`
	UserID       int64     `json:"user_id" gorm:"not null;index"`
	Filename     string    `json:"filename" gorm:"not null"`
	OriginalName string    `json:"original_name" gorm:"not null"`
	FilePath     string    `json:"file_path" gorm:"not null"`
	ContentType  string    `json:"content_type" gorm:"not null"`
	Size         int64     `json:"size" gorm:"not null"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`

	// Relationships
	User *User `json:"user,omitempty" gorm:"foreignKey:UserID"`
}

// ImageService handles image-related operations
type ImageService struct {
	DB *db.DB
}

// NewImageService creates a new ImageService
func NewImageService(database *db.DB) *ImageService {
	return &ImageService{
		DB: database,
	}
}

// GetImageByID retrieves an image by its ID
func (s *ImageService) GetImageByID(imageID int64) (*Image, error) {
	var image Image
	err := s.DB.QueryRow(`
		SELECT id, user_id, filename, original_name, file_path, content_type, size, created_at, updated_at
		FROM images
		WHERE id = ?
	`, imageID).Scan(
		&image.ID, &image.UserID, &image.Filename, &image.OriginalName,
		&image.FilePath, &image.ContentType, &image.Size, &image.CreatedAt, &image.UpdatedAt,
	)

	if err != nil {
		return nil, fmt.Errorf("failed to get image: %w", err)
	}

	return &image, nil
}

// GetImagesByIDs retrieves multiple images by their IDs
func (s *ImageService) GetImagesByIDs(imageIDs []int64) ([]Image, error) {
	if len(imageIDs) == 0 {
		return []Image{}, nil
	}

	// Build placeholders for the IN clause (?,?,?)
	placeholders := make([]string, len(imageIDs))
	args := make([]interface{}, len(imageIDs))
	for i, id := range imageIDs {
		placeholders[i] = "?"
		args[i] = id
	}

	query := fmt.Sprintf(`
		SELECT id, user_id, filename, original_name, file_path, content_type, size, created_at, updated_at
		FROM images
		WHERE id IN (%s)
	`, strings.Join(placeholders, ","))

	rows, err := s.DB.Query(query, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to query images: %w", err)
	}
	defer rows.Close()

	var images []Image
	for rows.Next() {
		var image Image
		if err := rows.Scan(
			&image.ID, &image.UserID, &image.Filename, &image.OriginalName,
			&image.FilePath, &image.ContentType, &image.Size, &image.CreatedAt, &image.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan image: %w", err)
		}
		images = append(images, image)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating images: %w", err)
	}

	return images, nil
}

// DeleteImagesByIDs deletes multiple images by their IDs (both DB records and files)
func (s *ImageService) DeleteImagesByIDs(imageIDs []int64) error {
	if len(imageIDs) == 0 {
		return nil
	}

	// First, get the image file paths before deleting from DB
	images, err := s.GetImagesByIDs(imageIDs)
	if err != nil {
		return fmt.Errorf("failed to get images before deletion: %w", err)
	}

	// Delete from database first
	placeholders := make([]string, len(imageIDs))
	args := make([]interface{}, len(imageIDs))
	for i, id := range imageIDs {
		placeholders[i] = "?"
		args[i] = id
	}

	query := fmt.Sprintf("DELETE FROM images WHERE id IN (%s)", strings.Join(placeholders, ","))
	result, err := s.DB.Exec(query, args...)
	if err != nil {
		return fmt.Errorf("failed to delete images from database: %w", err)
	}

	rowsAffected, _ := result.RowsAffected()
	log.Printf("Deleted %d image records from database", rowsAffected)

	// Delete physical files
	deletedFiles := 0
	for _, image := range images {
		if err := os.Remove(image.FilePath); err != nil {
			// Log error but continue - maybe file already deleted
			log.Printf("Warning: failed to delete image file %s: %v", image.FilePath, err)
		} else {
			deletedFiles++
		}
	}

	log.Printf("Deleted %d physical image files", deletedFiles)
	return nil
}

// GetImageIDsReferencedByOtherChats checks if any of the given image IDs are referenced by chats other than the specified one
func (s *ImageService) GetImageIDsReferencedByOtherChats(imageIDs []int64, excludeChatID int64) ([]int64, error) {
	if len(imageIDs) == 0 {
		return []int64{}, nil
	}

	// Build placeholders for the IN clause
	placeholders := make([]string, len(imageIDs))
	args := make([]interface{}, len(imageIDs)+1)
	for i, id := range imageIDs {
		placeholders[i] = "?"
		args[i] = id
	}
	args[len(imageIDs)] = excludeChatID // Add excludeChatID as last argument

	query := fmt.Sprintf(`
		SELECT DISTINCT json_extract(value, '$') as image_id
		FROM messages, json_each(messages.image_ids)
		WHERE messages.chat_id != ?
		AND json_extract(value, '$') IN (%s)
		AND messages.image_ids IS NOT NULL
		AND messages.image_ids != ''
	`, strings.Join(placeholders, ","))

	rows, err := s.DB.Query(query, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to query image references: %w", err)
	}
	defer rows.Close()

	var referencedImageIDs []int64
	for rows.Next() {
		var imageID int64
		if err := rows.Scan(&imageID); err != nil {
			return nil, fmt.Errorf("failed to scan image ID: %w", err)
		}
		referencedImageIDs = append(referencedImageIDs, imageID)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating image references: %w", err)
	}

	return referencedImageIDs, nil
}

// GetImageIDsReferencedByOtherUsers checks if any of the given image IDs are referenced by users other than the specified one
func (s *ImageService) GetImageIDsReferencedByOtherUsers(imageIDs []int64, excludeUserID int64) ([]int64, error) {
	if len(imageIDs) == 0 {
		return []int64{}, nil
	}

	// Build placeholders for the IN clause
	placeholders := make([]string, len(imageIDs))
	args := make([]interface{}, len(imageIDs)+1)
	for i, id := range imageIDs {
		placeholders[i] = "?"
		args[i] = id
	}
	args[len(imageIDs)] = excludeUserID // Add excludeUserID as last argument

	query := fmt.Sprintf(`
		SELECT DISTINCT json_extract(value, '$') as image_id
		FROM messages, json_each(messages.image_ids)
		WHERE messages.user_id != ?
		AND json_extract(value, '$') IN (%s)
		AND messages.image_ids IS NOT NULL
		AND messages.image_ids != ''
	`, strings.Join(placeholders, ","))

	rows, err := s.DB.Query(query, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to query image references by other users: %w", err)
	}
	defer rows.Close()

	var referencedImageIDs []int64
	for rows.Next() {
		var imageID int64
		if err := rows.Scan(&imageID); err != nil {
			return nil, fmt.Errorf("failed to scan image ID: %w", err)
		}
		referencedImageIDs = append(referencedImageIDs, imageID)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating image references by other users: %w", err)
	}

	return referencedImageIDs, nil
}
