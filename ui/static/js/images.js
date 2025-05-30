/**
 * Image Upload Module for CyberAI
 * Handles drag & drop, file picker, and clipboard paste for images
 */

const images = {
    // Currently attached images (as data URLs)
    attachedImages: [],
    maxImages: 5,
    maxFileSize: 10 * 1024 * 1024, // 10MB
    allowedTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
};

/**
 * Initialize image upload functionality
 */
images.init = function() {
    console.log('[Images] Initializing image upload functionality');

    // Set up event listeners
    images.setupFileInput();
    images.setupDragAndDrop();
    images.setupClipboardPaste();
    images.setupImagePreview();

    console.log('[Images] Image upload functionality initialized');
};

/**
 * Set up file input handling
 */
images.setupFileInput = function() {
    const fileInput = document.getElementById('image-input');
    const uploadButton = document.getElementById('upload-button');

    if (fileInput && uploadButton) {
        uploadButton.addEventListener('click', () => {
            fileInput.click();
        });

        fileInput.addEventListener('change', (event) => {
            images.handleFiles(event.target.files);
        });
    }
};

/**
 * Set up drag and drop functionality
 */
images.setupDragAndDrop = function() {
    const inputContainer = document.querySelector('.input-container');
    if (!inputContainer) return;

    // Prevent default drag behaviors
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        inputContainer.addEventListener(eventName, images.preventDefaults, false);
        document.body.addEventListener(eventName, images.preventDefaults, false);
    });

    // Highlight drop area
    ['dragenter', 'dragover'].forEach(eventName => {
        inputContainer.addEventListener(eventName, images.highlight, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        inputContainer.addEventListener(eventName, images.unhighlight, false);
    });

    // Handle dropped files
    inputContainer.addEventListener('drop', images.handleDrop, false);
};

/**
 * Set up clipboard paste functionality
 */
images.setupClipboardPaste = function() {
    document.addEventListener('paste', (event) => {
        const items = (event.clipboardData || event.originalEvent.clipboardData).items;

        for (const item of items) {
            if (item.type.indexOf('image') === 0) {
                event.preventDefault();
                const file = item.getAsFile();
                if (file) {
                    images.handleFiles([file]);
                }
                break;
            }
        }
    });
};

/**
 * Set up image preview functionality
 */
images.setupImagePreview = function() {
    // This will be called when images are added to show previews
};

/**
 * Prevent default drag behaviors
 */
images.preventDefaults = function(e) {
    e.preventDefault();
    e.stopPropagation();
};

/**
 * Highlight drop area
 */
images.highlight = function(e) {
    const inputContainer = document.querySelector('.input-container');
    if (inputContainer) {
        inputContainer.classList.add('drag-over');
    }
};

/**
 * Remove highlight from drop area
 */
images.unhighlight = function(e) {
    const inputContainer = document.querySelector('.input-container');
    if (inputContainer) {
        inputContainer.classList.remove('drag-over');
    }
};

/**
 * Handle dropped files
 */
images.handleDrop = function(e) {
    const dt = e.dataTransfer;
    const files = dt.files;
    images.handleFiles(files);
};

/**
 * Handle file selection/drop
 */
images.handleFiles = function(files) {
    [...files].forEach(images.processFile);
};

/**
 * Process a single file
 */
images.processFile = function(file) {
    if (!images.validateFile(file)) {
        return;
    }

    if (images.attachedImages.length >= images.maxImages) {
        ui.showNotification(`Maximum ${images.maxImages} images allowed`, 'warning');
        return;
    }

    // Read file as data URL
    const reader = new FileReader();
    reader.onload = function(e) {
        const imageData = {
            id: Date.now() + Math.random(), // Temporary ID
            name: file.name,
            type: file.type,
            size: file.size,
            dataUrl: e.target.result,
            file: file
        };

        images.attachedImages.push(imageData);
        images.updateImagePreview();

        console.log('[Images] Added image:', imageData.name);
        ui.showNotification(`Image "${file.name}" added`, 'success');
    };

    reader.onerror = function() {
        console.error('[Images] Error reading file:', file.name);
        ui.showNotification(`Error reading file "${file.name}"`, 'error');
    };

    reader.readAsDataURL(file);
};

/**
 * Validate file type and size
 */
images.validateFile = function(file) {
    if (!images.allowedTypes.includes(file.type)) {
        ui.showNotification(`File type not supported: ${file.type}`, 'error');
        return false;
    }

    if (file.size > images.maxFileSize) {
        const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
        const maxSizeMB = (images.maxFileSize / (1024 * 1024)).toFixed(2);
        ui.showNotification(`File too large: ${sizeMB}MB (max: ${maxSizeMB}MB)`, 'error');
        return false;
    }

    return true;
};

/**
 * Update image preview display
 */
images.updateImagePreview = function() {
    const previewContainer = document.getElementById('image-preview-container');
    if (!previewContainer) return;

    // Clear existing previews
    previewContainer.innerHTML = '';

    if (images.attachedImages.length === 0) {
        previewContainer.style.display = 'none';
        return;
    }

    previewContainer.style.display = 'block';

    images.attachedImages.forEach((imageData, index) => {
        const previewItem = document.createElement('div');
        previewItem.className = 'image-preview-item relative inline-block m-1';
        previewItem.innerHTML = `
            <img src="${imageData.dataUrl}"
                 alt="${imageData.name}"
                 class="w-16 h-16 object-cover rounded border border-outline"
                 title="${imageData.name} (${(imageData.size / 1024).toFixed(1)}KB)">
            <button type="button"
                    class="absolute -top-2 -right-2 w-5 h-5 bg-danger text-white rounded-full text-xs flex items-center justify-center hover:bg-danger/80"
                    onclick="images.removeImage(${index})"
                    title="Remove image">
                ×
            </button>
        `;
        previewContainer.appendChild(previewItem);
    });
};

/**
 * Remove an image from the attached list
 */
images.removeImage = function(index) {
    if (index >= 0 && index < images.attachedImages.length) {
        const removed = images.attachedImages.splice(index, 1)[0];
        images.updateImagePreview();
        console.log('[Images] Removed image:', removed.name);
        ui.showNotification(`Image "${removed.name}" removed`, 'info');
    }
};

/**
 * Clear all attached images
 */
images.clearAll = function() {
    images.attachedImages = [];
    images.updateImagePreview();
    console.log('[Images] Cleared all attached images');
};

/**
 * Get images ready for API submission
 */
images.getImagesForAPI = function() {
    return images.attachedImages.map(img => ({
        name: img.name,
        type: img.type,
        dataUrl: img.dataUrl
    }));
};

/**
 * Upload images to server and return uploaded image data
 */
images.uploadToServer = async function() {
    if (images.attachedImages.length === 0) {
        return [];
    }

    console.log('[Images] Uploading images to server...');

    const uploadedImages = [];
    const failedImages = [];

    // Process uploads sequentially to avoid database conflicts
    for (let i = 0; i < images.attachedImages.length; i++) {
        const imageData = images.attachedImages[i];

        try {
            // Add small delay between uploads to prevent database conflicts
            if (i > 0) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            const formData = new FormData();
            formData.append('image', imageData.file);

            const response = await fetch('/api/images/upload', {
                method: 'POST',
                body: formData,
                credentials: 'include'
            });

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`Upload failed: ${error}`);
            }

            const result = await response.json();
            uploadedImages.push({
                id: result.id,
                filename: result.filename,
                url: result.url,
                type: result.type,
                size: result.size
            });

            console.log('[Images] Uploaded image:', result.filename);

        } catch (error) {
            console.error('[Images] Error uploading image:', imageData.name, error);
            ui.showNotification(`Failed to upload "${imageData.name}": ${error.message}`, 'error');
            failedImages.push({
                name: imageData.name,
                error: error.message
            });
            // Don't throw - continue with other images
        }
    }

    if (uploadedImages.length > 0) {
        console.log(`[Images] Successfully uploaded ${uploadedImages.length} images`);
    }

    if (failedImages.length > 0) {
        console.log(`[Images] Failed to upload ${failedImages.length} images:`, failedImages);
        // Only throw if ALL uploads failed
        if (uploadedImages.length === 0) {
            throw new Error(`All image uploads failed`);
        }
    }

    return uploadedImages;
};

// Initialize when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', images.init);
} else {
    images.init();
}