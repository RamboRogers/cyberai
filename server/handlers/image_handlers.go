package handlers

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/ramborogers/cyberai/server/db"
	"github.com/ramborogers/cyberai/server/middleware"
	"github.com/ramborogers/cyberai/server/models"
)

// ImageHandlers provides handlers for image-related endpoints
type ImageHandlers struct {
	DB *db.DB
}

// NewImageHandlers creates a new ImageHandlers instance
func NewImageHandlers(database *db.DB) *ImageHandlers {
	return &ImageHandlers{
		DB: database,
	}
}

// ImageUploadResponse represents the response from image upload
type ImageUploadResponse struct {
	ID       int64  `json:"id"`
	Filename string `json:"filename"`
	URL      string `json:"url"`
	Size     int64  `json:"size"`
	Type     string `json:"type"`
}

// MaxFileSize is 10MB
const MaxFileSize = 10 * 1024 * 1024

// AllowedImageTypes are the supported image MIME types
var AllowedImageTypes = map[string]bool{
	"image/jpeg": true,
	"image/jpg":  true,
	"image/png":  true,
	"image/gif":  true,
	"image/webp": true,
}

// ensureImageDirectory creates the /data/images directory if it doesn't exist
func ensureImageDirectory() error {
	imageDir := "data/images"
	if err := os.MkdirAll(imageDir, 0755); err != nil {
		return fmt.Errorf("failed to create image directory: %w", err)
	}
	return nil
}

// generateSecureFilename generates a secure random filename with the original extension
func generateSecureFilename(originalFilename string) string {
	// Get file extension
	ext := filepath.Ext(originalFilename)

	// Generate random filename
	randomBytes := make([]byte, 16)
	if _, err := rand.Read(randomBytes); err != nil {
		// Fallback to timestamp if random fails
		return fmt.Sprintf("%d%s", time.Now().UnixNano(), ext)
	}

	return fmt.Sprintf("%s%s", hex.EncodeToString(randomBytes), ext)
}

// validateImageFile validates the uploaded file
func validateImageFile(contentType string, size int64) error {
	// Check file size
	if size > MaxFileSize {
		return fmt.Errorf("file too large: %d bytes (max: %d bytes)", size, MaxFileSize)
	}

	// Check content type
	if !AllowedImageTypes[contentType] {
		return fmt.Errorf("unsupported file type: %s", contentType)
	}

	return nil
}

// UploadImage handles image upload requests
func (h *ImageHandlers) UploadImage(w http.ResponseWriter, r *http.Request) {
	// Get user ID from context
	userID := middleware.GetUserIDFromContext(r.Context())
	if userID == 0 {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	log.Printf("[Images] Upload request from user %d", userID)

	// Parse multipart form (32MB max memory)
	err := r.ParseMultipartForm(32 << 20)
	if err != nil {
		log.Printf("[Images] Error parsing multipart form: %v", err)
		http.Error(w, "Failed to parse form", http.StatusBadRequest)
		return
	}

	// Get the file from form
	file, fileHeader, err := r.FormFile("image")
	if err != nil {
		log.Printf("[Images] Error getting file from form: %v", err)
		http.Error(w, "No image file provided", http.StatusBadRequest)
		return
	}
	defer file.Close()

	// Validate file
	if err := validateImageFile(fileHeader.Header.Get("Content-Type"), fileHeader.Size); err != nil {
		log.Printf("[Images] File validation failed: %v", err)
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Ensure image directory exists
	if err := ensureImageDirectory(); err != nil {
		log.Printf("[Images] Error creating image directory: %v", err)
		http.Error(w, "Failed to create image directory", http.StatusInternalServerError)
		return
	}

	// Generate secure filename
	filename := generateSecureFilename(fileHeader.Filename)
	filepath := filepath.Join("data", "images", filename)

	// Create the file
	dst, err := os.Create(filepath)
	if err != nil {
		log.Printf("[Images] Error creating file: %v", err)
		http.Error(w, "Failed to create file", http.StatusInternalServerError)
		return
	}
	defer dst.Close()

	// Copy file content
	_, err = io.Copy(dst, file)
	if err != nil {
		log.Printf("[Images] Error copying file: %v", err)
		os.Remove(filepath) // Clean up on error
		http.Error(w, "Failed to save file", http.StatusInternalServerError)
		return
	}

	// Save image metadata to database
	imageRecord := models.Image{
		UserID:       int64(userID),
		Filename:     filename,
		OriginalName: fileHeader.Filename,
		FilePath:     filepath,
		ContentType:  fileHeader.Header.Get("Content-Type"),
		Size:         fileHeader.Size,
		CreatedAt:    time.Now(),
	}

	// Insert image metadata into database
	query := `INSERT INTO images (user_id, filename, original_name, file_path, content_type, size, created_at, updated_at)
	          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
	result, err := h.DB.Exec(query,
		imageRecord.UserID,
		imageRecord.Filename,
		imageRecord.OriginalName,
		imageRecord.FilePath,
		imageRecord.ContentType,
		imageRecord.Size,
		imageRecord.CreatedAt,
		imageRecord.CreatedAt) // Use same time for updated_at
	if err != nil {
		log.Printf("[Images] Error saving image metadata: %v", err)
		os.Remove(filepath) // Clean up on error
		http.Error(w, "Failed to save image metadata", http.StatusInternalServerError)
		return
	}

	// Get the inserted ID
	imageID, err := result.LastInsertId()
	if err != nil {
		log.Printf("[Images] Error getting last insert ID: %v", err)
		os.Remove(filepath) // Clean up on error
		http.Error(w, "Failed to get image ID", http.StatusInternalServerError)
		return
	}
	imageRecord.ID = imageID

	log.Printf("[Images] Successfully uploaded image %s (ID: %d) for user %d", filename, imageRecord.ID, userID)

	// Return success response
	response := ImageUploadResponse{
		ID:       imageRecord.ID,
		Filename: filename,
		URL:      fmt.Sprintf("/api/images/%d", imageRecord.ID),
		Size:     fileHeader.Size,
		Type:     fileHeader.Header.Get("Content-Type"),
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// ServeImage serves uploaded images
func (h *ImageHandlers) ServeImage(w http.ResponseWriter, r *http.Request) {
	// Extract image ID from URL path
	pathParts := strings.Split(r.URL.Path, "/")
	if len(pathParts) < 4 || pathParts[3] == "" {
		http.Error(w, "Invalid image ID", http.StatusBadRequest)
		return
	}

	imageIDStr := pathParts[3]
	imageID, err := strconv.ParseInt(imageIDStr, 10, 64)
	if err != nil {
		http.Error(w, "Invalid image ID", http.StatusBadRequest)
		return
	}

	// Get image metadata from database
	var imageRecord models.Image
	query := `SELECT id, user_id, filename, original_name, file_path, content_type, size, created_at, updated_at
	          FROM images WHERE id = ?`
	err = h.DB.QueryRow(query, imageID).Scan(
		&imageRecord.ID,
		&imageRecord.UserID,
		&imageRecord.Filename,
		&imageRecord.OriginalName,
		&imageRecord.FilePath,
		&imageRecord.ContentType,
		&imageRecord.Size,
		&imageRecord.CreatedAt,
		&imageRecord.UpdatedAt)
	if err != nil {
		if err == sql.ErrNoRows {
			log.Printf("[Images] Image not found: %d", imageID)
			http.Error(w, "Image not found", http.StatusNotFound)
		} else {
			log.Printf("[Images] Error querying image: %v", err)
			http.Error(w, "Failed to retrieve image", http.StatusInternalServerError)
		}
		return
	}

	// Check if file exists
	if _, err := os.Stat(imageRecord.FilePath); os.IsNotExist(err) {
		log.Printf("[Images] Image file not found on disk: %s", imageRecord.FilePath)
		http.Error(w, "Image file not found", http.StatusNotFound)
		return
	}

	// Set appropriate headers
	w.Header().Set("Content-Type", imageRecord.ContentType)
	w.Header().Set("Content-Length", fmt.Sprintf("%d", imageRecord.Size))
	w.Header().Set("Cache-Control", "public, max-age=31536000") // Cache for 1 year

	// Serve the file
	http.ServeFile(w, r, imageRecord.FilePath)

	log.Printf("[Images] Served image %s (ID: %d)", imageRecord.Filename, imageRecord.ID)
}

// ListUserImages returns a list of images for the current user
func (h *ImageHandlers) ListUserImages(w http.ResponseWriter, r *http.Request) {
	// Get user ID from context
	userID := middleware.GetUserIDFromContext(r.Context())
	if userID == 0 {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Get images from database
	query := `SELECT id, user_id, filename, original_name, file_path, content_type, size, created_at, updated_at
	          FROM images WHERE user_id = ? ORDER BY created_at DESC`
	rows, err := h.DB.Query(query, int64(userID))
	if err != nil {
		log.Printf("[Images] Error fetching images for user %d: %v", userID, err)
		http.Error(w, "Failed to fetch images", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	// Scan results
	var images []models.Image
	for rows.Next() {
		var img models.Image
		err := rows.Scan(
			&img.ID,
			&img.UserID,
			&img.Filename,
			&img.OriginalName,
			&img.FilePath,
			&img.ContentType,
			&img.Size,
			&img.CreatedAt,
			&img.UpdatedAt)
		if err != nil {
			log.Printf("[Images] Error scanning image row: %v", err)
			continue
		}
		images = append(images, img)
	}

	// Convert to response format
	var responseImages []ImageUploadResponse
	for _, img := range images {
		responseImages = append(responseImages, ImageUploadResponse{
			ID:       img.ID,
			Filename: img.Filename,
			URL:      fmt.Sprintf("/api/images/%d", img.ID),
			Size:     img.Size,
			Type:     img.ContentType,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(responseImages)
}

// DeleteImage deletes an image (only by the owner)
func (h *ImageHandlers) DeleteImage(w http.ResponseWriter, r *http.Request) {
	// Get user ID from context
	userID := middleware.GetUserIDFromContext(r.Context())
	if userID == 0 {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Extract image ID from URL path
	pathParts := strings.Split(r.URL.Path, "/")
	if len(pathParts) < 4 || pathParts[3] == "" {
		http.Error(w, "Invalid image ID", http.StatusBadRequest)
		return
	}

	imageIDStr := pathParts[3]
	imageID, err := strconv.ParseInt(imageIDStr, 10, 64)
	if err != nil {
		http.Error(w, "Invalid image ID", http.StatusBadRequest)
		return
	}

	// Get image metadata from database
	var imageRecord models.Image
	query := `SELECT id, user_id, filename, original_name, file_path, content_type, size, created_at, updated_at
	          FROM images WHERE id = ?`
	err = h.DB.QueryRow(query, imageID).Scan(
		&imageRecord.ID,
		&imageRecord.UserID,
		&imageRecord.Filename,
		&imageRecord.OriginalName,
		&imageRecord.FilePath,
		&imageRecord.ContentType,
		&imageRecord.Size,
		&imageRecord.CreatedAt,
		&imageRecord.UpdatedAt)
	if err != nil {
		if err == sql.ErrNoRows {
			http.Error(w, "Image not found", http.StatusNotFound)
		} else {
			log.Printf("[Images] Error querying image: %v", err)
			http.Error(w, "Failed to retrieve image", http.StatusInternalServerError)
		}
		return
	}

	// Check ownership
	if imageRecord.UserID != int64(userID) {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	// Delete file from disk
	if err := os.Remove(imageRecord.FilePath); err != nil && !os.IsNotExist(err) {
		log.Printf("[Images] Error deleting file %s: %v", imageRecord.FilePath, err)
		// Continue with database deletion even if file deletion fails
	}

	// Delete from database
	result, err := h.DB.Exec("DELETE FROM images WHERE id = ?", imageID)
	if err != nil {
		log.Printf("[Images] Error deleting image record %d: %v", imageID, err)
		http.Error(w, "Failed to delete image", http.StatusInternalServerError)
		return
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		log.Printf("[Images] No rows affected when deleting image %d", imageID)
	}

	log.Printf("[Images] Deleted image %s (ID: %d) for user %d", imageRecord.Filename, imageRecord.ID, userID)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "Image deleted successfully"})
}
