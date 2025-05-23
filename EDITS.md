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

**Task:** Refactor Model Management in Admin Panel (Split JS, Update API)

*   **Files Modified:**
    *   `ui/templates/admin.html`: Removed inline `<script>`, added `<script src="/static/js/admin.js"></script>`
    *   `ui/static/js/admin.js`: Created file, moved JS logic, added API calls, refactored rendering.
    *   `app.py`: Updated `PUT /api/admin/models/{id}` endpoint to handle partial updates, added comments.
    *   `API.md`: Updated `PUT /api/admin/models/{id}` documentation.

**Task:** Fix Regenerate Button Logic & User Message Indicator

*   **Files Modified:**
    *   `ui/static/js/ui.js`: Updated `ui.updateRegenerateButtonState` logic; Fixed user message rendering in `ui.addMessageToUI` to correctly display the `>` indicator.

**Task:** Reposition Thinking Block & Add Boxed Formatting

*   **Files Modified:**
    *   `ui/static/js/ui.js`:
        *   In `ui.ensureThinkingBoxExists`, changed DOM insertion to place the thinking block *before* the main content block.
        *   Added `.replace(/\\boxed\{([^}]+)\}/g, '<span class="boxed-answer">$1</span>')` before `marked.parse` in `ui.renderMessage`.
    *   `ui/static/js/websocket.js`:
        *   Added `.replace(/\\boxed\{([^}]+)\}/g, '<span class="boxed-answer">$1</span>')` before `marked.parse` for both thinking and regular content within `websocket.handleAssistantChunk`.
    *   `ui/static/css/styles.css`:
        *   Added CSS rules for the `.boxed-answer` class.

**Task:** Stop Thinking Spinner on Final Chunk

*   **Files Modified:**
    *   `ui/static/js/ui.js`: Added `thinking-spinner-icon` class to the SVG in the thinking label.
    *   `ui/static/js/websocket.js`: Modified `handleAssistantChunk` to find and remove the `.thinking-spinner-icon` element when `is_final` is true.

**Task:** Add Search Provider Management Structure

*   **Files Modified:**
    *   `server/db/db.go`: Incremented `SchemaVersion` to 2. Added `search_providers` table definition and index.
    *   `ui/templates/admin.html`: Added sidebar link, header title/button, content section, and modal form structure for search providers.

# Code Edits Log

This file tracks significant code changes made during the development process, aligning with `NOTES.md`.

## Theme Toggle Feature (Completed)

*   **`NOTES.md`**: Updated with progress and function list.
*   **`EDITS.md`**: Updated to reflect completed changes.
*   **`ui/static/css/themes.css`**: Created with "hacker" and "business" theme CSS variables. Defines `--color-*` and other theme-specific properties.
*   **`ui/static/css/admin.css`**: Refactored to remove `:root` theme variable definitions; these are now in `themes.css`.
*   **`tailwind.config.js`**: Verified. Relies on CSS variables like `var(--color-surface)`, so it correctly adapts to `themes.css` changes without direct modification.
*   **`ui/templates/index.html`**: Added theme toggle button in the user section of the sidebar. Linked `themes.css`. Added inline script to call `loadTheme` on DOMContentLoaded and `toggleTheme` on button click, using `theme.js` functions.
*   **`ui/static/js/theme.js`**: Created new file with shared JavaScript functions: `applyTheme`, `toggleTheme`, and `loadTheme` to manage theme state in `localStorage` and update CSS/icons.
*   **`ui/templates/admin.html`**: Added theme toggle button in the sidebar near the Home/Admin links. Linked `themes.css`. Added inline script to call `loadTheme` on DOMContentLoaded and `toggleTheme` on button click, using `theme.js` functions with admin-specific icon IDs.
*   **`ui/static/js/ui.js`**: No direct changes; theme logic handled by `theme.js` and inline script in `index.html`.
*   **`ui/static/js/admin.js`**: No direct changes; theme logic handled by `theme.js` and inline script in `admin.html`.

## Thinking Animation Fix for OpenAI Models (Completed)

**Issue:** Thinking animation wasn't appearing for OpenAI-compatible models (Google Flash) but worked fine for Ollama models.

**Changes Made:**
*   **`ui/static/js/websocket.js`**:
    - Fixed status message handling to read from `message.data?.message` instead of `message.status_payload?.message`
    - Modified thinking indicator logic to hide only when actual content chunks arrive with content, not immediately when `handleAssistantChunk` is called
    - Added backward compatibility for both status message structures
*   **`NOTES.md`**: Added documentation of the fix and technical details

## User Message ">" Indicator Fix (Completed)

**Issue:** Historical user messages loaded from chats were missing the ">" indicator that appears when sending messages in real-time.

**Changes Made:**
*   **`ui/static/js/ui.js`**:
    - Fixed `renderMessage` function to add the ">" indicator (`<span class="user-prompt-indicator">&gt;</span>`) to user messages
    - Added proper HTML escaping for user message content to match the behavior of `addMessageToUI`
*   **`NOTES.md`**: Added documentation of the fix

## Business Theme Color Improvement (Completed)

**Issue:** Business theme had poor readability due to light blue text colors that were hard to read on light backgrounds.

**Changes Made:**
*   **`ui/static/css/themes.css`**:
    - Updated text color from `#333333` to `#1a202c` (very dark gray, almost black)
    - Changed accent colors from blue (`#2563eb`, `#1d4ed8`) to dark gray (`#4a5568`, `#2d3748`)
    - Enhanced code block background to `#f8fafc` for better contrast
*   **`ui/static/css/tailwind.css`**:
    - Added `@import './themes.css'` to include theme definitions in Tailwind build
    - Changed body styles from hardcoded `bg-black text-white` to `bg-surface text-on-surface` to use theme variables
    - Required `npm run build:css` to compile changes into final styles.css
*   **`NOTES.md`**: Added documentation of the improvements

## Epic Chat Delete Buttons Feature (Completed)

**Issue:** Need individual delete buttons for chat items that match the epic themes and styling.

**Changes Made:**
*   **`ui/static/js/ui.js`**:
    - Updated `renderChatsList` function to add delete buttons to each chat item
    - Changed `chatListItem.className` from hardcoded classes to use `chat-item` class
    - Added epic trash icon SVG instead of simple X for delete button
    - Used `chat-delete-btn` class for consistent styling
    - Proper event handling with confirmation dialog
*   **`ui/static/css/tailwind.css`**:
    - Added comprehensive `.chat-item` and `.chat-delete-btn` CSS classes
    - Fixed @apply compatibility issues by using regular CSS instead of @apply for group, opacity, and color utilities
    - Theme-specific styling: hacker theme gets glow effects, business theme is more subtle
    - Hover animations including scale effects and color changes
    - Proper focus states for accessibility
    - Required `npm run build:css` to compile new styles
*   **`NOTES.md`**: Added documentation of the epic delete button feature

## Browser Theme Detection & Login Page Integration (Completed)

**Issue:** Need automatic theme detection based on browser preference and full login page integration with theme system.

**Changes Made:**
*   **`ui/static/js/theme.js`**:
    - Added `detectBrowserTheme()` to detect browser dark/light mode preference using `window.matchMedia('(prefers-color-scheme: dark)')`
    - Added `getDefaultTheme()` to map browser preference to themes (dark → hacker, light → business)
    - Updated `loadTheme()` to use browser-detected default when no saved theme exists
    - Added `setupBrowserThemeListener()` for real-time browser theme change detection
    - Enhanced logging and improved icon display logic
*   **`ui/templates/login.html`**:
    - Added complete theme system integration with toggle button (top-right corner)
    - Converted all hardcoded colors to CSS variables (--bg-color, --accent-color, etc.)
    - Added themes.css link and theme initialization script
    - Added sun/moon icons with theme-aware visibility
    - Enhanced branding section styling with theme variables
    - Added smooth transitions for theme changes
*   **`ui/static/css/themes.css`**:
    - Added RGB color values for both themes (--accent-color-rgb, --text-color-rgb, etc.) to enable rgba() usage
    - Enhanced color palette consistency across themes
    - Added RGB values for status colors (info, success, warning, danger)
*   **`ui/templates/index.html` & `ui/templates/admin.html`**:
    - Added `setupBrowserThemeListener()` call to DOMContentLoaded initialization
    - Enhanced theme system integration documentation
*   **`NOTES.md`**: Added comprehensive documentation of browser theme detection and login page integration
