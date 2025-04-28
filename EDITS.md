# CyberAI Project Edits

## 2023-08-12

### README.md
- **Complete Overhaul**: Redesigned README.md with a cyberpunk-inspired layout
- Added centered header with title, description, and badges
- Created table layout for future screenshots
- Organized features into a 2x2 table with categories:
  - Model Support
  - Chat Features
  - User Interface
  - Security
- Added Quick Start section with Docker instructions
- Added Usage section with examples
- Added Configuration section with command line options
- Streamlined Technical Architecture section
- Added License and author connection information
- Included badges for version, Go version, platform support, and license

### NOTES.md
- Updated Project State section to reflect README.md changes
- Added notes about placeholder screenshots

## 2023-08-13

### README.md
- Added "Building from Source" section with detailed instructions for:
  - Prerequisites (Go 1.21+, SQLite 3.35+)
  - Cloning and building the application
  - Running without building
  - Environment variable configuration
- Removed incorrect "Configuration" section with command line flags
- Updated to clarify that the application uses environment variables instead of config files

## Planned Changes
- Create UI mockups for the screenshots
- Set up Docker configuration for the project
- Implement core WebSocket functionality for real-time chat

## 2024-08-01: Fix User Creation Password Bug

*   **`ui/templates/admin.html`**: Added `new-password` and `confirm-password` input fields within the user modal form (`#user-form`), initially hidden. Added `change-password-action-btn` class to the Change Password button.
*   **`ui/static/js/admin.js`**:
    *   Modified `openUserModal` to toggle visibility and `required` attribute of password fields based on action (add/edit), and toggle visibility of the Change Password button.
    *   Modified `handleUserFormSubmit` to add password validation (length, match) and include the password in the correct payload structure (`{ user: {...}, password: "..." }`) when `action === 'add'`.
    *   Removed password validation from `validateUserData`.

## 2024-08-01: Fix Email Validation

*   **`ui/static/js/admin.js`**: Corrected the regular expression in the `validateUserData` function to `/\S+@\S+\.\S+/` (removed extra backslashes).

## Edit Log

**2025-04-27 ~15:15**

*   **File:** `server/handlers/admin_handlers.go`
    *   **Function:** `UpdateModel(w http.ResponseWriter, r *http.Request)`
    *   **Change:** Refactored the function to correctly handle partial updates (PUT requests).
        *   Now fetches the existing model from the database first.
        *   Decodes the request body into a temporary struct with pointers to detect which fields were provided.
        *   Merges only the provided fields onto the existing model data.
        *   Saves the merged model using `ModelService.UpdateModel`.
        *   Fetches the final model state again before responding to ensure consistency.
        *   Corrected type handling for `Configuration` field (unmarshaling `json.RawMessage` into `map[string]interface{}`).
    *   **Reason:** To fix a 500 Internal Server Error caused by the previous implementation attempting to save an incomplete model struct, which overwrote data and likely violated DB constraints.

*   **File:** `ui/static/js/admin.js`
    *   **Function:** `toggleModelStatus(modelId, newStatus)`
    *   **Change:** Modified the function to fetch the complete model data via GET *after* the PUT request succeeds. Replaced the previous partial UI update with a full card re-render using the complete data retrieved from the GET request.
    *   **Reason:** To ensure the UI accurately reflects the model state after an update, resolving issues where the card appeared blank because the PUT response might not contain all necessary data (like provider details).
    *   **Function:** `createModelCardHTML(model)`
    *   **Change:** Extracted card HTML generation logic from `renderModels` into this reusable function.
    *   **Reason:** To simplify `renderModels` and allow `toggleModelStatus` to easily re-render a card.

*   **File:** `API.md`
    *   **Section:** `PUT /api/admin/models/{id}`
    *   **Change:** Updated the description, request body examples, and response body description to accurately reflect the partial update (merge) behavior of the corresponding backend handler.
    *   **Reason:** To keep API documentation aligned with implementation.
