# Development Notes

## Project Status
- Initial README and DESIGN documents created
- Planning phase in progress

## Architecture Decisions
- **Backend**: Go for performance and concurrent handling
- **Database**: SQLite for simplicity and embedded deployment
- **API**: WebSockets for real-time communication
- **UI Theme**: Cyberpunk terminal style (S3270)

## Key Components
- **Auth System**: JWT-based authentication and session management
- **Chat System**: WebSocket-based message delivery with streaming
- **Model System**: Abstraction layer for different LLM providers
- **Agent System**: Customizable system prompts and behaviors

## Function Definitions

### Backend Functions
```go
// CreateUser creates a new user with the specified permissions
func CreateUser(username string, password string, role string) (User, error)

// AuthenticateUser validates credentials and returns a session token
func AuthenticateUser(username string, password string) (string, error)

// RegisterModel adds a new LLM to the available models
func RegisterModel(name string, provider string, endpoint string, apiKey string) (Model, error)

// CreateAgent defines a new agent with custom system prompt
func CreateAgent(name string, systemPrompt string, allowedModels []string) (Agent, error)

// SendMessage sends a message to the specified model/agent
func SendMessage(sessionID string, message string, modelID string, agentID string) (ChatResponse, error)

// ImportOllamaModels fetches all models from an Ollama server and adds them to the database.
// It returns a list of successfully imported models and a list of errors encountered.
func (s *ModelService) ImportOllamaModels(baseURL string, apiKey string, defaultTokens int, setActive bool) ([]Model, []error)

// ImportOllamaModels handles POST /api/admin/models/import-ollama
// Parses request, calls the service to import models, logs errors, and returns a JSON response.
func (h *AdminHandlers) ImportOllamaModels(w http.ResponseWriter, r *http.Request)

// notFoundHandler serves the 404.html page.
func notFoundHandler(w http.ResponseWriter, r *http.Request)
```

### Frontend Functions
```javascript
// Authentication functions
function login(username, password)
function logout()
function registerUser(username, password, role)

// Chat functions
function sendMessage(message, modelId, agentId)
function receiveMessageStream(callback)
function loadChatHistory(chatId)

// Model/Agent functions
function listAvailableModels()
function createAgent(name, systemPrompt, allowedModels)
function selectModel(modelId)

// handleOllamaImportSubmit handles the Ollama import form submission.
// Sends import parameters to the backend and handles the response.
function handleOllamaImportSubmit(event)
```

## Dependencies
- **Go**: 1.19+
- **SQLite**: 3.35+
- **OpenAI Go Client**: github.com/openai/openai-go
- **Ollama Go Client**: github.com/ollama/ollama/api/client
- **JWT**: github.com/golang-jwt/jwt

## To-Do List
- [ ] Set up basic project structure
- [ ] Implement user authentication system
- [ ] Create database schema
- [ ] Build WebSocket handler
- [ ] Implement Ollama API connector
- [ ] Design basic UI components
- [ ] Set up model discovery system
- [ ] Create agent management UI

## CyberAI Project Notes

## Project Status
- Created initial README.md with cyberpunk-themed layout
- Used reference from CyberDock to structure the document
- Included placeholders for screenshots (media/screen.png and media/dashboard.png)

## README Structure
- Header with project title and badges
- Features section formatted in tables
- Quick start with Docker instructions
- Usage examples
- Configuration options
- Technical architecture overview
- License information
- Author connection links

## To Do
- [ ] Create actual screenshots to replace placeholders
- [ ] Set up Docker container for the project
- [ ] Implement core features as described in README
- [ ] Verify port configuration (currently set to 8080)

## Design Notes
- Following cyberpunk green terminal theme as specified in style guide
- S3270 terminal-inspired interface
- Black/dark gray background with bright green and white text

## Reference Functions
None added yet.

## Database Schema
- Users & Roles
- Models & Endpoints
- Agents
- Chats & Messages
- Usage Statistics

## Model Definitions
#### User Model (server/models/user.go)
- `User` struct with fields: ID, Username, Email, PasswordHash, RoleID, etc.
- `Role` struct for representing user roles
- `UserService` for managing users
  - `Authenticate(username, password)` - User authentication
  - `CreateUser(user)` - User creation
  - `GetUserByID(id)` - Fetch user by ID
  - `UpdateUser(user)` - Update user profile
  - `ChangePassword(id, oldPass, newPass)` - Password management
  - `GetAllRoles()` - Fetch available roles
  - `GetUsersByRole(roleID)` - List users with role

#### Chat Model (server/models/chat.go)
- `Chat` struct with fields: ID, Title, UserID, IsActive, Messages, etc.
- `Message` struct with fields: ID, ChatID, Role, Content, etc.
- `ChatService` for managing chats
  - `CreateChat(userID, title)` - Create new chat
  - `GetChat(chatID, includeMessages)` - Fetch chat by ID
  - `GetChatMessages(chatID)` - Get messages for a chat
  - `GetUserChats(userID, activeOnly)` - List user's chats
  - `UpdateChatTitle(chatID, title)` - Update chat title
  - `ArchiveChat(chatID)` - Mark chat as archived
  - `DeleteChat(chatID)` - Delete chat and messages
  - `AddMessage(message)` - Add message to chat
  - `GetLatestMessage(chatID)` - Get most recent message
  - `GetMessageHistory(chatID, limit)` - Get recent messages
  - `GetChatStatistics(chatID)` - Get usage stats

#### LLM Model (server/models/model.go)
- `LLMModel` struct with fields: ID, Name, Provider, ModelID, Configuration, etc.
- `ModelService` for managing AI models
  - `GetModel(modelID)` - Get model by ID
  - `ListModels(activeOnly)` - List available models
  - `CreateModel(model)` - Add new model
  - `UpdateModel(model)` - Update model settings
  - `DeleteModel(modelID)` - Remove model
  - `ToggleModelStatus(modelID, isActive)` - Enable/disable model
  - `GetModelsByProvider(provider, activeOnly)` - Filter by provider

#### Agent Model (server/models/agent.go)
- `Agent` struct with fields: ID, Name, Description, SystemPrompt, etc.
- `AgentService` for managing agents
  - `GetAgent(agentID)` - Get agent by ID
  - `ListAgents(userID, includePublic, activeOnly)` - List agents
  - `CreateAgent(agent)` - Create new agent
  - `UpdateAgent(agent)` - Update agent config
  - `DeleteAgent(agentID, userID)` - Delete agent
  - `ToggleAgentStatus(agentID, userID, isActive)` - Enable/disable
  - `ToggleAgentPublic(agentID, userID, isPublic)` - Public/private toggle
  - `GetUserAgents(userID)` - List user's agents
  - `GetActiveAgents(userID)` - List available agents
  - `CloneAgent(agentID, userID)` - Copy an agent

### TODO
- Create HTTP handlers for API endpoints
  - Admin Handlers (`/api/admin/...`)
    - List Models
    - Create Model
    - Get Model by ID
    - Update Model
    - Delete Model
  - Auth Handlers (`/api/auth/...`)
  - User Handlers (`/api/users/...`)
  - Chat Handlers (`/api/chats/...`)
- Implement middleware for authentication & authorization
- Set up session management
- Create frontend components for UI
  - Admin Page (Model Management)
- Implement WebSocket for real-time chat

### Dependencies Added
- `golang.org/x/crypto/bcrypt` - Password hashing

## Recent Changes
- Updated the `ImportOllamaModels` service function in `server/models/model.go` to accept and handle multiple parameters:
  - Added `apiKey` parameter to support authenticated Ollama instances
  - Added `defaultTokens` parameter to control token generation limits
  - Added `setActive` parameter to control whether imported models are set active by default
  - Improved error handling and response formatting

- Enhanced the `handleOllamaImportSubmit` function in `ui/static/js/admin.js` to:
  - Properly collect and pass all parameters to the API endpoint
  - Show appropriate success/error messages based on server response
  - Update the UI to reflect newly imported models

- Fixed CSS selector issue in admin.js where the code was trying to use an invalid attribute selector. Changed from `.model-card[style="display: "]` to `.model-card:not([style*="display: none"])` to properly select visible model cards. This approach correctly identifies elements that don't have the display:none style.

- Fixed provider card display issues:
  - Improved HTML formatting in the template literals for consistent spacing
  - Fixed styling for the sync button to make it more visible
  - Added missing CSS variables for success colors and hover effects
  - Properly structured the provider card actions to display all buttons correctly

- Enhanced the model cards with cyberpunk-inspired styling:
  - Better handling of long model IDs using a code container with proper overflow management
  - Improved status indicators with glow effects that match the cyberpunk theme
  - Added animated button effects for enhanced interactivity
  - Standardized layout with consistent spacing and borders for cleaner display
  - Implemented proper date handling for "Last Synced" with fallback for invalid dates
  - Added subtle hover animations and glow effects to reinforce the cyberpunk aesthetic

- Fixed provider filtering in the Models tab:
  - Updated provider filter comparison to properly convert IDs to strings
  - Ensured consistent data types when comparing provider IDs

- Added support for custom OpenAI and Anthropic base URLs:
  - Modified the provider form to display base URL field for all provider types
  - Added explanatory help text to clarify which fields are required
  - Made base URL optional but available for OpenAI/Anthropic to support proxies and custom deployments
  - Maintained backward compatibility by only enforcing base URL requirement for Ollama providers

## Issues Fixed
- **CSS Selector Syntax**: Fixed invalid CSS selector in admin.js that was causing JavaScript errors. The selector was attempting to match elements with a specific style attribute value in an incorrect way. The new selector uses the `:not()` pseudo-class with the attribute contains selector to properly find visible elements.
- **OpenAI Sync with VLLM**: Modified `SyncOpenAIModelsForProvider` in `server/models/model.go` to correctly handle custom `BaseURL` values that already include the `/v1` suffix (e.g., `http://host:port/v1`). The code now checks for the suffix and appends `/models` instead of `/v1/models` if `/v1` is detected, preventing duplicate path segments.
- **Admin Model Toggle Button**: Fixed the enable/disable button functionality in `admin.js` to correctly read the button's current state on click. Adjusted CSS in `admin.css` to improve button alignment within the model card's action row and enhanced button/badge styling for clarity.

# Notes

## Project State

- Initial setup complete.
- Admin API endpoints for Providers and Models defined and documented.
- User-facing API endpoints for Models, Chats, and Messages defined and documented.
- README.md updated with new cyberpunk-themed format based on CyberDock reference.
- Added placeholder sections for screenshots in README.md.

## API Endpoint to Go Handler Mapping

This mapping is based on `API.md` and the provided Go file list. Functionality is summarized from `API.md`.

*   **`GET /api/info`**: `server/handlers/chat_handlers.go` or `server/handlers/admin_handlers.go` or `cmd/cyberai/main.go` (Needs code check) - Gets basic instance info.
*   **`GET /ws`**: `server/ws/handler.go` - Handles WebSocket connection upgrade and server-to-client messages.

**Admin Routes (`/api/admin`)**: Likely in `server/handlers/admin_handlers.go`
*   **Providers (`/api/admin/providers`, `.../{id}`, `.../{id}/sync`)**: CRUD and sync operations for AI providers.
*   **Models (`/api/admin/models`, `.../{id}`)**: CRUD operations for AI models (admin view).
*   **Users (`/api/admin/users`, `.../{id}`)**: CRUD operations for users (admin view, delete is deactivate).
*   **Roles (`/api/admin/roles`, `.../{id}/users`)**: List roles, list users in a role.

**User Routes (`/api`)**:
*   **`GET /api/models`**: `server/handlers/model_handlers.go` - Lists active models for the user.
*   **Chats (`/api/chats`, `.../{chat_id}`)**: `server/handlers/chat_handlers.go` - CRUD operations for user chats (GET list excludes messages, GET by ID includes messages).
*   **Messages (`/api/chats/{chat_id}/messages`)**: `server/handlers/chat_handlers.go` - Posts a new user message, triggers AI response via WS.
*   **Regenerate (`/api/chats/{chat_id}/messages/regenerate`)**: `server/handlers/chat_handlers.go` - Regenerates the last assistant message, triggers AI response via WS.

## Functions

*   (No functions defined yet)

## TODO

*   Verify the exact handler location for `GET /api/info` by inspecting the code.
*   Begin implementing or reviewing specific functionalities based on user requests.

## Chat Interface Implementation

### Recent Changes (UI)

- **Chat Interface Integration with API**:
  - Updated `ui/static/js/chat.js` to use the WebSocket connection and REST API endpoints defined in API.md
  - Implemented model fetching via `/api/models`
  - Implemented chat management via `/api/chats` endpoints
  - Implemented message sending and receiving via `/api/chats/{id}/messages` and WebSocket
  - Added support for message regeneration via `/api/chats/{id}/messages/regenerate`

- **HTML Structure Enhancement**:
  - Added proper chat list sidebar in `ui/templates/index.html`
  - Added chat header with regenerate button
  - Created new chat button in sidebar
  - Created loading states for model list
  - Improved visual layout to match the API structure

- **CSS Styling Updates**:
  - Updated `ui/static/css/style.css` to match cyberpunk terminal theme
  - Added styling for chat list items
  - Improved styling for chat messages
  - Enhanced chat actions and regenerate button
  - Added hover states and visual feedback

### JavaScript Functions

- **WebSocket Handling**:
  - `connect()` - Establishes WebSocket connection
  - `handleWebSocketMessage(message)` - Processes different message types from WebSocket
  - `handleAssistantChunk(payload)` - Handles streaming chunks of assistant responses

- **Model Management**:
  - `fetchModels()` - Gets available models from API
  - `renderModelsList(models)` - Displays models in the sidebar
  - `selectModel(modelId)` - Sets the active model for messaging

- **Chat Management**:
  - `fetchChats()` - Gets user's chat history
  - `renderChatsList(chats)` - Displays chats in the sidebar
  - `loadChat(chatId)` - Loads a specific chat and its messages
  - `createNewChat()` - Creates a new chat session
  - `updateChatTitle(chatId, newTitle)` - Updates the title of a chat

- **Message Handling**:
  - `sendMessage()` - Sends a user message to the API
  - `renderMessage(message)` - Displays a message in the chat
  - `regenerateLastMessage()` - Asks the API to regenerate the last response
  - `clearChatHistory()` - Clears the displayed chat messages
  - `addSystemMessage(text)` - Adds a local system message for status updates

### WebSocket Message Types (API Integration)

The chat interface now properly handles the following WebSocket message types:

1. `system` - General system messages
2. `status` - Processing status updates
3. `user_message` - Confirmation of a saved user message
4. `assistant_message` - Complete assistant message
5. `assistant_chunk` - Streaming chunk of assistant response
6. `error` - Error messages from the server
7. `chat_list` - Updates to the user's chat list

### Event Handling

Added event listeners for:
- Send button click
- Enter key press in message input
- New chat button click
- Regenerate button click
- Model selection
- Double-click on chat title for editing

### Next Steps for UI

- Implement proper authentication flow
- Add error handling for network issues
- Implement agent selection and creation interface
- Add message context menu (copy, delete)
- Improve accessibility features
- Add markdown rendering for messages
- Add syntax highlighting for code blocks

The Anthropic connector implements the ModelConnector interface and supports both streaming and non-streaming completion modes. It properly handles system messages and includes appropriate error handling and health checks.

## Chat UI Enhancements (Copy Buttons, Token Count)

- **Goal:** Add copy buttons (text/markdown) and token count display to assistant messages.
- **Backend (`chat_handlers.go`):** Modified `generateAndStreamResponse` to send a final `ws.MsgTypeAssistantMessage` WebSocket message after stream completion. This message includes the final message content and the calculated `tokens_used` (currently based on cleaned content length).
- **Frontend (`chat.js`):
    - Added handler for `assistant_message` to update the message element with the final token count and raw markdown content (`dataset.rawContent`).
    - Modified `createMessageElement` to include a `.message-footer` containing the timestamp, a (initially hidden) `.token-count` span, and `.copy-text-btn` / `.copy-markdown-btn` buttons with icons and `navigator.clipboard` functionality.
    - Modified `handleAssistantChunk` to append raw chunk content to `messageElement.dataset.rawContent`.
- **CSS (`style.css`):** Added styles for `.message-footer`, `.token-count`, `.action-btn`, and `.message-finalized` (visual cue for completion).

## JavaScript Refactoring (chat.js -> Multiple Files)

- **Goal:** Improve maintainability by splitting the large `chat.js` file.
- **Changes:**
    - Created `ui/static/js/ui.js`: Moved functions related to DOM manipulation, rendering UI elements (messages, lists), and UI helpers (thinking indicator, delete confirmation).
    - Created `ui/static/js/api.js`: Moved functions responsible for making `fetch` calls to the backend HTTP API (`/api/...`).
    - Created `ui/static/js/websocket.js`: Moved WebSocket connection logic (`connect`) and WebSocket message handling functions (`handleWebSocketMessage`, `handleAssistantChunk`).
    - Updated `ui/static/js/chat.js`: Kept global state variables, DOM element references, core orchestration functions (`selectModel`), and the main `initChat` function.
    - Updated `ui/templates/index.html`: Modified the `<script>` tags to load the new files in the correct dependency order (`ui.js`, `api.js`, `websocket.js`, `chat.js`).
- **Dependency Management:** Relies on global scope for function calls between files due to the absence of a module system. Script loading order in HTML is critical.

# CyberAI Implementation Notes

## LLM Connector Interfaces

### ModelConnector Interface

```go
// ModelConnector defines the interface for interacting with different LLM providers.
type ModelConnector interface {
	// GenerateChatCompletion generates a response, optionally streaming chunks.
	// If req.Stream is true, chunks are sent via the callback.
	// If req.Stream is false, the callback is not used, and the full response is returned.
	GenerateChatCompletion(ctx context.Context, req ChatCompletionRequest, callback ChunkCallback) error

	// HealthCheck checks if the provider endpoint is reachable and authenticated.
	HealthCheck(ctx context.Context) error

	// GetType returns the type of the connector (e.g., "ollama", "openai").
	GetType() models.ProviderType
}
```

### ChatCompletionRequest

```
```

## Removed "Model Switched" Chat Message

- **Goal:** Prevent the "Model switched to..." message from appearing in the main chat history when selecting a model.
- **Change:** Commented out the call to `addSystemMessage` within the `selectModel` function in `ui/static/js/chat.js`.
- **Result:** Model selection still functions, updates the sidebar UI, and logs to console, but no longer adds a message to the chat window.

## UI Enhancements (Epic Simplistic, Visually Stunning, Tech Forward)

**Requirements:**

1.  **Model List Grouping:** Group models by provider in the sidebar.
2.  **Resizable Sidebar:** Allow the user to resize the sidebar horizontally, persisting the width.
3.  **In-Chat Error Feedback:** Display clear error messages within the chat history when AI responses fail (API errors, WebSocket errors).
4.  **General Polish:** Improve visual hierarchy, add subtle animations/transitions, refine theme consistency.

**Plan:**

1.  **Resizable Sidebar:**
    *   Add `<div class="resizer" id="sidebar-resizer"></div>` between sidebar and chat container in `index.html`.
    *   Add CSS for `.resizer` handle appearance and positioning.
    *   Modify `.container`, `.sidebar`, `.chat-container` CSS for flexbox resizing.
    *   Add JS in `ui.js` (`initializeSidebarResizing`) to handle `mousedown`/`mousemove`/`mouseup` on the resizer, update `flex-basis` of sidebar, save width to `localStorage`, and load width on init.
2.  **Model Grouping:**
    *   Modify `displayModels` in `ui.js`:
        *   Group models by `provider.name` (or maybe `provider.type` + `provider.name` for uniqueness).
        *   Render HTML with structure like `<div class="provider-group"><h4>Provider Name <span class="toggle-arrow">▼</span></h4><div class="model-sublist">...models...</div></div>`.
        *   Add event listener for toggling visibility of `.model-sublist`.
    *   Add CSS for `.provider-group`, `h4`, `.toggle-arrow`, `.model-sublist` in `style.css`.
3.  **Error Feedback:**
    *   Create `displayChatError(chatId, message)` function in `ui.js`. It should append an error message div (`.message.error-message`) to the chat history.
    *   Add CSS for `.error-message` (e.g., background, border-left color like `--status-offline`).
    *   In `websocket.js`:
        *   Modify `onMessage` handler for `type: 'error'` to call `ui.displayChatError`.
    *   In `api.js`:
        *   Modify `sendMessage` and `regenerateMessage` `catch` blocks to call `ui.displayChatError` for relevant errors (e.g., network errors, 5xx status codes). Pass the `currentChatId`.
4.  **UI Polish:**
    *   Review `style.css` for consistency, add subtle transitions where appropriate (e.g., hover effects, sidebar resize).
    *   Ensure tooltips are effective.

**Functions Added/Modified:**

*   `ui.js`:
    *   `initializeUI()`: Call `initializeSidebarResizing`, load saved sidebar width.
    *   `initializeSidebarResizing()`: New function for resize logic.
    *   `displayModels()`: Modified for grouping.
    *   `displayChatError(chatId, message)`: New function for error cards.
*   `api.js`:
    *   `sendMessage()`: Modified error handling.
    *   `regenerateMessage()`: Modified error handling.
*   `websocket.js`:
    *   `handleWebSocketMessage()`: Modified for `error` type.

**Files Updated:**

*   `NOTES.md`
*   `EDITS.md`
*   `ui/templates/index.html`
*   `ui/static/css/style.css`
*   `ui/static/js/ui.js`
*   `ui/static/js/api.js`
*   `ui/static/js/websocket.js`

## 2024-08-01: User Creation Password Bug Fix

*   **Issue**: User creation modal (`admin.html`) was missing password fields, preventing new user creation as the API (`POST /api/admin/users`) requires an initial password.
*   **Fix**:
    *   Added `new-password` and `confirm-password` fields to the user modal in `admin.html`, hidden by default.
    *   Updated `admin.js` (`openUserModal`) to show password fields and hide the 'Change Password' button only when adding a new user, making password fields required.
    *   Updated `admin.js` (`handleUserFormSubmit`) to validate password fields (length, match) and construct the correct payload (`{ user: {...}, password: "..." }`) for `addNewUser` only during user creation. Updated calls to `validateUserData`.
    *   Removed password validation logic from `validateUserData` function.
*   **Files Modified**: `ui/templates/admin.html`, `ui/static/js/admin.js`

## 2024-08-01: Fix Email Validation Regex

*   **Issue**: The email validation regex in `admin.js` (`validateUserData` function) contained double backslashes (`\\S`, `\\.`) due to improper escaping in a previous edit, causing valid emails to fail validation.
*   **Fix**: Corrected the regex to use single backslashes (`/\S+@\S+\.\S+/`).
*   **Files Modified**: `ui/static/js/admin.js`