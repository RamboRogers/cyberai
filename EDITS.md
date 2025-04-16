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
