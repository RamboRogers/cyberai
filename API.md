# CyberAI API Documentation

This document outlines the available API endpoints for the CyberAI platform.

## Base Path: `/api`

## General

*   **`GET /api/info`**
    *   **Implementation**: `cmd/cyberai/main.go` (lines 339-343)
    *   Description: Retrieves basic information about the running CyberAI instance.
    *   Response Body (`application/json`):
        ```json
        {
          "name": "CyberAI",
          "version": "0.1.0",
          "status": "development"
        }
        ```

## Authentication

*Note: These endpoints are handled outside the standard `/api` base path.*

*   **`POST /login`**
    *   **Implementation**: `server/auth/auth.go` (Login function)
    *   Description: Authenticates a user based on username and password. Creates a session cookie upon success.
    *   Request Body (`application/json`):
        ```json
        {
          "username": "user's username",
          "password": "user's password"
        }
        ```
    *   Success Response (`200 OK`, `application/json`):
        ```json
        {
          "message": "Login successful"
        }
        ```
    *   Failure Responses:
        *   `400 Bad Request`: Invalid request body.
        *   `401 Unauthorized`: Invalid username or password, or inactive account.
        *   `500 Internal Server Error`: Session initialization or other server error.

*   **`POST /logout`** (or `GET /logout`, depending on client implementation)
    *   **Implementation**: `server/auth/auth.go` (Logout function)
    *   Description: Clears the user's session cookie, effectively logging them out.
    *   Request Body: None expected.
    *   Success Response (`200 OK`, `application/json`):
        ```json
        {
          "message": "Logout successful"
        }
        ```
    *   Failure Responses:
        *   `500 Internal Server Error`: Error saving the session to clear the cookie (logout likely still functionally completes for the user).

## WebSocket

*   **`GET /ws`**
    *   **Implementation**: `server/ws/handler.go`
    *   Description: Upgrades the HTTP connection to a WebSocket connection for real-time chat communication. Requires prior authentication (e.g., session cookie).
    *   Protocol: WebSocket

### Server-to-Client Messages

The server sends JSON messages to the client over the WebSocket connection. All messages have a `type` field and a `timestamp` field.

```json
// Base Message Structure
{
  "type": "message_type_string",
  "timestamp": "2023-10-29T12:00:00Z",
  // Payload field(s) specific to the type (see below)
}
```

**Message Types & Payloads:**

1.  **`system`**
    *   Description: General system messages (e.g., connection established).
    *   Payload: `content_payload: { "content": "System message text" }`

2.  **`error`**
    *   Description: Reports an error to the client (e.g., processing failure).
    *   Payload: `error_payload: { "message": "Error description", "code": optional_error_code }`

3.  **`status`**
    *   Description: Provides status updates during processing.
    *   Payload: `status_payload: { "message": "Status text", "chat_id": optional_chat_id }`
        *   Example: `{"message": "Generating response...", "chat_id": 123}`

4.  **`user_message`**
    *   Description: Confirms a user message was saved and provides its details (sent after successful `POST /api/chats/{id}/messages`). Can be used by the UI to update a temporary message with its final ID.
    *   Payload: `message_payload: { ... models.Message fields ... }`

5.  **`assistant_message`**
    *   Description: Sends a complete assistant message *after* it has been fully generated and saved to the database.
    *   Payload: `message_payload: { ... models.Message fields ... }` (Role will be "assistant", includes generated content, model_id used, etc.)

6.  **`assistant_chunk`**
    *   Description: Sends a chunk of a streaming assistant response.
    *   Payload: `chunk_payload: { "chat_id": 123, "message_id": optional_assistant_msg_id, "content": "chunk text", "is_final": optional_bool }`
        *   `message_id` might be sent once with the first chunk.
        *   `is_final` (optional) can signal the end of the stream.

7.  **`remove_message`**
    *   Description: Instructs the client to remove a specific message from the UI (e.g., during regeneration).
    *   Payload: `remove_payload: { "chat_id": 123, "message_id": 456 }`

8.  **`chat_list`** (Optional/Future)
    *   Description: Sends an updated list of user chats (e.g., if a title changes or a chat is created/deleted elsewhere).
    *   Payload: `chat_list_payload: [ { ... models.Chat fields ... }, ... ]`

9.  **`model_list`** (Optional/Future)
    *   Description: Sends an updated list of available models (e.g., if an admin activates/deactivates a model).
    *   Payload: `model_list_payload: [ { ... UserFacingModel fields ... }, ... ]`

### Client-to-Server Messages

*   Currently, the primary interaction model relies on clients sending messages via HTTP POST requests. The WebSocket is mainly for server-to-client pushes.
*   If client-to-server WebSocket messages are needed later (e.g., for specific real-time interactions beyond standard chat), their format should be defined here.

## Admin Routes (`/api/admin`)

Authentication/Authorization: *TODO: All admin routes should require administrator privileges.*

### Providers

*   **`GET /api/admin/providers`**
    *   **Implementation**: `server/handlers/admin_handlers.go`
    *   Description: Retrieves a list of all configured AI providers. API keys are **not** included.
    *   Response Body (`application/json`): Array of Provider objects (see `models.Provider`, APIKey excluded).
        ```json
        [
          {
            "id": 1,
            "name": "Local Ollama",
            "type": "ollama",
            "base_url": "http://localhost:11434",
            "created_at": "2023-10-27T10:00:00Z",
            "updated_at": "2023-10-27T10:00:00Z"
          },
          // ... more providers
        ]
        ```

*   **`POST /api/admin/providers`**
    *   **Implementation**: `server/handlers/admin_handlers.go`
    *   Description: Creates a new AI provider configuration. Supported types include `ollama`, `openai`, `anthropic`. The `base_url` is required for `ollama` but optional for `openai` and `anthropic` (useful for proxies or alternative endpoints).
    *   Request Body (`application/json`): Provider object (see `models.Provider`).
        ```json
        {
          "name": "My OpenAI",
          "type": "openai", // or "ollama", "anthropic"
          "base_url": "https://api.openai.com/v1", // Required for ollama, optional for others
          "api_key": "sk-..." // Required for openai, anthropic
        }
        ```
    *   Response Body (`application/json`): The created Provider object (APIKey excluded).
    *   Status Codes:
        *   `201 Created`: Success.
        *   `400 Bad Request`: Invalid request body or missing required fields (name, type).
        *   `409 Conflict`: Provider name already exists.
        *   `500 Internal Server Error`: Failed to create provider in DB.

*   **`GET /api/admin/providers/{id}`**
    *   **Implementation**: `server/handlers/admin_handlers.go`
    *   Description: Retrieves details for a specific provider by ID. API key is **not** included.
    *   Path Parameter: `{id}` - The integer ID of the provider.
    *   Response Body (`application/json`): Provider object (APIKey excluded).
    *   Status Codes:
        *   `200 OK`: Success.
        *   `400 Bad Request`: Invalid provider ID format.
        *   `404 Not Found`: Provider with the given ID does not exist.
        *   `500 Internal Server Error`: Failed to retrieve provider.

*   **`PUT /api/admin/providers/{id}`**
    *   **Implementation**: `server/handlers/admin_handlers.go`
    *   Description: Updates an existing provider's configuration. If `api_key` is omitted or empty in the request, the existing key is preserved. The `base_url` is required for `ollama` but optional for `openai` and `anthropic`.
    *   Path Parameter: `{id}` - The integer ID of the provider to update.
    *   Request Body (`application/json`): Provider object with fields to update.
        ```json
        {
          "name": "Updated OpenAI Name",
          "type": "openai",
          "base_url": "", // Optional
          "api_key": "sk-newkey..." // Optional: Include only to change the key
        }
        ```
    *   Response Body (`application/json`): The updated Provider object (APIKey excluded).
    *   Status Codes:
        *   `200 OK`: Success.
        *   `400 Bad Request`: Invalid provider ID format or invalid request body.
        *   `404 Not Found`: Provider with the given ID does not exist.
        *   `409 Conflict`: Updated provider name conflicts with another existing provider.
        *   `500 Internal Server Error`: Failed to update provider.

*   **`DELETE /api/admin/providers/{id}`**
    *   **Implementation**: `server/handlers/admin_handlers.go`
    *   Description: Deletes a provider and all of its associated models.
    *   Path Parameter: `{id}` - The integer ID of the provider to delete.
    *   Response Body: None.
    *   Status Codes:
        *   `204 No Content`: Success.
        *   `400 Bad Request`: Invalid provider ID format.
        *   `404 Not Found`: Provider with the given ID does not exist.
        *   `500 Internal Server Error`: Failed to delete provider or associated models.

*   **`POST /api/admin/providers/{id}/sync`**
    *   **Implementation**: `server/handlers/admin_handlers.go`
    *   Description: Fetches models from the remote provider (currently supported: `ollama`, `openai`) and syncs them with the local database (creates new, updates sync time, deactivates missing).
    *   Path Parameter: `{id}` - The integer ID of the provider to sync.
    *   Request Body (`application/json`, Optional): Allows specifying sync options.
        ```json
        {
          "default_tokens": 8192, // Optional: Default context size if not determinable
          "set_active": true      // Optional: Whether to mark newly synced models as active
        }
        ```
    *   Response Body (`application/json`): Summary of the sync operation.
        ```json
        {
          "models_created": 5,
          "models": [ /* Array of newly created models.Model objects */ ],
          "errors_occurred": false // True if any non-fatal errors happened during sync
        }
        ```
    *   Status Codes:
        *   `200 OK`: Sync completed (potentially with non-fatal errors if `errors_occurred` is true).
        *   `400 Bad Request`: Invalid provider ID format or provider type does not support sync.
        *   `404 Not Found`: Provider with the given ID does not exist.
        *   `500 Internal Server Error`: Failed to get provider details or sync failed critically.
        *   `501 Not Implemented`: Sync not implemented for this provider type (e.g., Anthropic).

*   **`POST /api/admin/models/import-ollama`**
    *   **Implementation**: `server/handlers/admin_handlers.go`
    *   Description: **DEPRECATED** - Use `POST /api/admin/providers/{id}/sync` instead. This endpoint previously handled importing models specifically from an Ollama instance, but functionality is now consolidated under the provider sync mechanism.
    *   Request Body (`application/json`):
        ```json
        {
          "base_url": "http://localhost:11434", // Required
          "api_key": "optional-key", // Optional: API key if Ollama requires authentication
          "default_tokens": 8192, // Optional: Default context size if not determinable
          "set_active": true // Optional: Whether to mark newly imported models as active
        }
        ```
    *   Response Body (`application/json`): Summary of the import operation.
        ```json
        {
          "models_imported": 5,
          "models": [ /* Array of newly created models.Model objects */ ],
          "errors_occurred": false // True if any non-fatal errors happened during import
        }
        ```
    *   Status Codes:
        *   `200 OK`: Import completed (potentially with non-fatal errors).
        *   `400 Bad Request`: Invalid request body or missing base_url.
        *   `500 Internal Server Error`: Failed to connect to Ollama or process import.


### Models

*   **`GET /api/admin/models`**
    *   **Implementation**: `server/handlers/admin_handlers.go`
    *   Description: Retrieves a list of all configured AI models, optionally filtered by active status. Includes provider details.
    *   Query Parameter: `?active=true` - If present, only returns active models.
    *   Response Body (`application/json`): Array of Model objects (see `models.Model`, includes nested `Provider` object without APIKey).
        ```json
        [
          {
            "id": 1,
            "provider_id": 1,
            "name": "Llama 3 8B",
            "model_id": "llama3",
            "max_tokens": 8192,
            "temperature": 0.7,
            "default_system_prompt": "You are a helpful assistant.",
            "is_active": true,
            "configuration": {"digest": "...", "modified_at": "...", "size": ...},
            "last_synced_at": "2023-10-27T11:00:00Z",
            "created_at": "2023-10-27T10:05:00Z",
            "updated_at": "2023-10-27T11:00:00Z",
            "provider": {
              "id": 1,
              "name": "Local Ollama",
              "type": "ollama",
              "base_url": "http://localhost:11434",
              "created_at": "2023-10-27T10:00:00Z",
              "updated_at": "2023-10-27T10:00:00Z"
            }
          },
          // ... more models
        ]
        ```

*   **`POST /api/admin/models`**
    *   **Implementation**: `server/handlers/admin_handlers.go`
    *   Description: Manually creates a new AI model configuration.
    *   Request Body (`application/json`): Model object (see `models.Model`). `provider_id` is required.
    *   Response Body (`application/json`): The created Model object.
    *   Status Codes:
        *   `201 Created`: Success.
        *   `400 Bad Request`: Invalid request body or missing required fields.
        *   `500 Internal Server Error`: Failed to create model (e.g., DB error, constraint violation).

*   **`GET /api/admin/models/{id}`**
    *   **Implementation**: `server/handlers/admin_handlers.go`
    *   Description: Retrieves details for a specific model by ID. Includes provider details.
    *   Path Parameter: `{id}` - The integer ID of the model.
    *   Response Body (`application/json`): Model object.
    *   Status Codes:
        *   `200 OK`: Success.
        *   `400 Bad Request`: Invalid model ID format.
        *   `404 Not Found`: Model with the given ID does not exist.
        *   `500 Internal Server Error`: Failed to retrieve model.

*   **`PUT /api/admin/models/{id}`**
    *   **Implementation**: `server/handlers/admin_handlers.go`
    *   Description: Updates an existing model's configuration. `provider_id` cannot be changed.
    *   Path Parameter: `{id}` - The integer ID of the model to update.
    *   Request Body (`application/json`): Model object with fields to update.
    *   Response Body (`application/json`): The updated Model object.
    *   Status Codes:
        *   `200 OK`: Success.
        *   `400 Bad Request`: Invalid model ID format or invalid request body.
        *   `404 Not Found`: Model with the given ID does not exist.
        *   `500 Internal Server Error`: Failed to update model (e.g., DB error, constraint violation).

*   **`DELETE /api/admin/models/{id}`**
    *   **Implementation**: `server/handlers/admin_handlers.go`
    *   Description: Deletes a specific model configuration.
    *   Path Parameter: `{id}` - The integer ID of the model to delete.
    *   Response Body: None.
    *   Status Codes:
        *   `204 No Content`: Success.
        *   `400 Bad Request`: Invalid model ID format.
        *   `500 Internal Server Error`: Failed to delete model (e.g., model not found, DB error).


### Users

*   **`GET /api/admin/users`**
    *   **Implementation**: `server/handlers/admin_handlers.go`
    *   Description: Retrieves a list of all users, optionally filtered by active status. Includes role details.
    *   Query Parameter: `?active=true` - If present, only returns active users.
    *   Response Body (`application/json`): Array of User objects (see `models.User`, includes nested `Role` object, password excluded).

*   **`POST /api/admin/users`**
    *   **Implementation**: `server/handlers/admin_handlers.go`
    *   Description: Creates a new user.
    *   Request Body (`application/json`):
        ```json
        {
          "user": {
            "username": "newuser",
            "email": "new@example.com",
            "first_name": "New",
            "last_name": "User",
            "role_id": 2, // ID of the desired role
            "is_active": true
          },
          "password": "secretpassword"
        }
        ```
    *   Response Body (`application/json`): The created User object (password excluded).
    *   Status Codes:
        *   `201 Created`: Success.
        *   `400 Bad Request`: Invalid request body.
        *   `500 Internal Server Error`: Failed to create user.

*   **`GET /api/admin/users/{id}`**
    *   **Implementation**: `server/handlers/admin_handlers.go`
    *   Description: Retrieves details for a specific user by ID. Includes role details.
    *   Path Parameter: `{id}` - The integer ID of the user.
    *   Response Body (`application/json`): User object (password excluded).
    *   Status Codes:
        *   `200 OK`: Success.
        *   `400 Bad Request`: Invalid user ID format.
        *   `404 Not Found`: User with the given ID does not exist.
        *   `500 Internal Server Error`: Failed to retrieve user.

*   **`PUT /api/admin/users/{id}`**
    *   **Implementation**: `server/handlers/admin_handlers.go`
    *   Description: Updates an existing user's details. Password update is handled separately if needed (currently not implemented in this structure, potentially requires dedicated endpoint or specific field). *Note: Current implementation doesn't explicitly handle password changes via this PUT request.*
    *   Path Parameter: `{id}` - The integer ID of the user to update.
    *   Request Body (`application/json`): Flat User object (subset of `models.User` fields).
        ```json
        {
          "username": "updateduser",
          "email": "updated@example.com",
          "first_name": "Updated",
          "last_name": "User Name",
          "role_id": 2,
          "is_active": true
        }
        ```
    *   Response Body (`application/json`): The updated User object (password excluded, includes full Role details).
    *   Status Codes:
        *   `200 OK`: Success.
        *   `400 Bad Request`: Invalid user ID format or invalid request body.
        *   `404 Not Found`: User with the given ID does not exist.
        *   `500 Internal Server Error`: Failed to update user.

*   **`DELETE /api/admin/users/{id}`**
    *   **Implementation**: `server/handlers/admin_handlers.go`
    *   Description: Deactivates a user (does not permanently delete).
    *   Path Parameter: `{id}` - The integer ID of the user to deactivate.
    *   Response Body: None.
    *   Status Codes:
        *   `204 No Content`: Success.
        *   `400 Bad Request`: Invalid user ID format.
        *   `404 Not Found`: User with the given ID does not exist.
        *   `500 Internal Server Error`: Failed to deactivate user.

*   **`POST /api/admin/users/{id}/password`**
    *   **Implementation**: `server/handlers/admin_handlers.go` (SetUserPasswordAdmin function)
    *   Description: Forcefully sets a new password for the specified user. Requires admin privileges.
    *   Path Parameter: `{id}` - The integer ID of the user whose password is being set.
    *   Request Body (`application/json`):
        ```json
        {
          "password": "newSecretPassword123"
        }
        ```
    *   Response Body: None.
    *   Status Codes:
        *   `204 No Content`: Success.
        *   `400 Bad Request`: Invalid user ID format, missing password, or password too short.
        *   `404 Not Found`: User with the given ID does not exist.
        *   `500 Internal Server Error`: Failed to hash password or update database.


### Roles

*   **`GET /api/admin/roles`**
    *   **Implementation**: `server/handlers/admin_handlers.go`
    *   Description: Retrieves a list of all available user roles.
    *   Response Body (`application/json`): Array of Role objects (see `models.Role`).

*   **`GET /api/admin/roles/{id}/users`**
    *   **Implementation**: `server/handlers/admin_handlers.go`
    *   Description: Retrieves a list of all users assigned to a specific role.
    *   Path Parameter: `{id}` - The integer ID of the role.
    *   Response Body (`application/json`): Array of User objects (password excluded).
    *   Status Codes:
        *   `200 OK`: Success.
        *   `400 Bad Request`: Invalid role ID format.
        *   `500 Internal Server Error`: Failed to retrieve users for the role.

*   **`DELETE /api/admin/roles/{id}/users`**
    *   **Implementation**: `server/handlers/admin_handlers.go`
    *   Description: *Not Typically Implemented* - Usually, you update a user's role via the user PUT endpoint.

---

## User Routes (`/api`)

Authentication/Authorization: *TODO: All user routes should require standard user privileges.*

### Models (User-Facing)

*   **`GET /api/models`**
    *   **Implementation**: `server/handlers/model_handlers.go`
    *   Description: Retrieves a list of active AI models available to the current user. Filters out inactive models and provider details like API keys.
    *   Response Body (`application/json`): Array of simplified Model objects (subset of `models.Model`, excludes sensitive/admin-only info).
        ```json
        [
          {
            "id": 1,
            "name": "Llama 3 8B (Local Ollama)", // Example: Combine model and provider name for clarity
            "model_id": "llama3", // The ID used in API calls
            "provider_type": "ollama",
            "max_tokens": 8192,
            "temperature": 0.7,
            "default_system_prompt": "You are a helpful assistant."
          },
          // ... more active models accessible to the user
        ]
        ```
    *   Status Codes:
        *   `200 OK`: Success.
        *   `500 Internal Server Error`: Failed to retrieve models.

### Chats

*   **`GET /api/chats`**
    *   **Implementation**: `server/handlers/chat_handlers.go`
    *   Description: Retrieves a list of the current user's chats, ordered by last update time (most recent first). Excludes message content.
    *   Response Body (`application/json`): Array of Chat objects (see `models.Chat`, excluding messages).
        ```json
        [
          {
            "id": 1,
            "title": "My First Chat",
            "user_id": 5,
            "is_active": true,
            "created_at": "2023-10-28T14:00:00Z",
            "updated_at": "2023-10-28T15:30:00Z"
          },
          // ... more chats
        ]
        ```
    *   Status Codes:
        *   `200 OK`: Success.
        *   `500 Internal Server Error`: Failed to retrieve chats.

*   **`POST /api/chats`**
    *   **Implementation**: `server/handlers/chat_handlers.go`
    *   Description: Creates a new chat session for the current user. Optionally includes the first user message.
        If no `title` is provided, it defaults to "New Chat". However, if no `title` is provided *and* a `first_message` with content is included, the backend will automatically set the chat title to the content of the `first_message` (truncated if necessary).
        If a `first_message` is provided, this endpoint will also trigger the AI response generation asynchronously via WebSocket.
    *   Request Body (`application/json`, Optional):
        ```json
        {
          "title": "Optional Chat Title", // Optional. Defaults to "New Chat" or first message content.
          "first_message": { // Optional
             "content": "Hello, who are you?",
             "model_id": 1 // Required if first_message is present
           }
        }
        ```
    *   Response Body (`application/json`): The created Chat object. If `first_message` was provided, the response might also include the initial user message and the assistant's response (or indicate it's processing via WebSocket).
        ```json
        {
          "id": 2,
          "title": "Optional Chat Title", // or "New Chat" or generated
          "user_id": 5,
          "is_active": true,
          "created_at": "2023-10-28T16:00:00Z",
          "updated_at": "2023-10-28T16:00:00Z"
          // Optionally include initial messages if created synchronously
        }
        ```
    *   Status Codes:
        *   `201 Created`: Success.
        *   `400 Bad Request`: Invalid request body (e.g., missing `model_id` if `first_message` is present).
        *   `500 Internal Server Error`: Failed to create chat or process initial message.

*   **`GET /api/chats/{chat_id}`**
    *   **Implementation**: `server/handlers/chat_handlers.go`
    *   Description: Retrieves details for a specific chat, including its message history.
    *   Path Parameter: `{chat_id}` - The integer ID of the chat.
    *   Response Body (`application/json`): Chat object including an array of Message objects.
        ```json
        {
          "id": 1,
          "title": "My First Chat",
          "user_id": 5,
          // ... other chat fields ...
          "messages": [
            {
              "id": 101,
              "chat_id": 1,
              "user_id": 5, // or null/system ID for assistant
              "role": "user", // "user", "assistant"
              "content": "What is Go?",
              "model_id": null, // null for user messages
              "created_at": "2023-10-28T15:00:00Z"
            },
            {
              "id": 102,
              "chat_id": 1,
              "user_id": null, // System/Assistant
              "role": "assistant",
              "content": "Go is a statically typed, compiled programming language...",
              "model_id": 1, // ID of the model that generated this
              "tokens_used": 150,
              "created_at": "2023-10-28T15:00:05Z"
            }
            // ... more messages
          ]
        }
        ```
    *   Status Codes:
        *   `200 OK`: Success.
        *   `400 Bad Request`: Invalid chat ID format.
        *   `403 Forbidden`: User does not have access to this chat.
        *   `404 Not Found`: Chat with the given ID does not exist.
        *   `500 Internal Server Error`: Failed to retrieve chat details.

*   **`PUT /api/chats/{chat_id}`**
    *   **Implementation**: `server/handlers/chat_handlers.go`
    *   Description: Updates properties of a chat, such as the title.
    *   Path Parameter: `{chat_id}` - The integer ID of the chat to update.
    *   Request Body (`application/json`): Fields to update.
        ```json
        {
          "title": "Updated Chat Title"
          // Potentially other fields like is_active for archiving
        }
        ```
    *   Response Body (`application/json`): The updated Chat object.
    *   Status Codes:
        *   `200 OK`: Success.
        *   `400 Bad Request`: Invalid chat ID format or invalid request body.
        *   `403 Forbidden`: User does not have permission to update this chat.
        *   `404 Not Found`: Chat with the given ID does not exist.
        *   `500 Internal Server Error`: Failed to update chat.

*   **`DELETE /api/chats/{chat_id}`**
    *   **Implementation**: `server/handlers/chat_handlers.go`
    *   Description: Deletes a chat and its associated messages. (Alternatively, could mark `is_active = false` for soft delete).
    *   Path Parameter: `{chat_id}` - The integer ID of the chat to delete.
    *   Response Body: None.
    *   Status Codes:
        *   `204 No Content`: Success.
        *   `400 Bad Request`: Invalid chat ID format.
        *   `403 Forbidden`: User does not have permission to delete this chat.
        *   `404 Not Found`: Chat with the given ID does not exist.
        *   `500 Internal Server Error`: Failed to delete chat.

*   **`DELETE /api/chats/purge`**
    *   **Implementation**: `server/handlers/chat_handlers.go` (Needs Implementation)
    *   Description: Deletes ALL chats and associated messages for the currently authenticated user.
    *   Path Parameter: None.
    *   Response Body: None.
    *   Status Codes:
        *   `204 No Content`: Success.
        *   `403 Forbidden`: User not authenticated or authorized.
        *   `500 Internal Server Error`: Failed to delete chats.

### Current User

*   **`GET /api/user/me`**
    *   **Implementation**: `server/handlers/user_handlers.go` (GetCurrentUser function)
    *   Description: Retrieves details for the currently authenticated user based on the active session/token.
    *   Response Body (`application/json`): User object (see `models.User`, password excluded, includes nested `Role` object).
        ```json
        {
          "id": 1,
          "username": "admin",
          "email": "admin@example.com",
          "first_name": "Admin",
          "last_name": "User",
          "role_id": 1,
          "is_active": true,
          "last_login": "2023-10-29T10:15:00Z",
          "created_at": "2023-10-27T09:00:00Z",
          "updated_at": "2023-10-29T10:15:00Z",
          "role": {
            "id": 1,
            "name": "admin",
            "description": "Administrator with full access",
            "permissions": "{\"all\": true}",
            "created_at": "2023-10-27T08:00:00Z",
            "updated_at": "2023-10-27T08:00:00Z"
          }
        }
        ```
    *   Status Codes:
        *   `200 OK`: Success.
        *   `401 Unauthorized`: User is not authenticated (e.g., missing or invalid session/token).
        *   `404 Not Found`: The authenticated user ID does not correspond to a user in the database.
        *   `500 Internal Server Error`: Failed to retrieve user details.

### Messages

*   **`POST /api/chats/{chat_id}/messages`**
    *   **Implementation**: `server/handlers/chat_handlers.go`
    *   Description: Sends a new user message to a chat. The backend retrieves conversation history, sends it to the selected model, and streams the response back via WebSocket.
    *   Path Parameter: `{chat_id}` - The integer ID of the chat.
    *   Request Body (`application/json`):
        ```json
        {
          "content": "Tell me about Go's concurrency model.",
          "model_id": 1 // ID of the model to use for the response
          // Optional: agent_id if using an agent
        }
        ```
    *   Response Body (`application/json`): The created user Message object. The assistant's response is handled via WebSocket.
        ```json
        {
           "id": 103, // ID of the newly created user message
           "chat_id": 1,
           "user_id": 5,
           "role": "user",
           "content": "Tell me about Go's concurrency model.",
           "model_id": null,
           "created_at": "2023-10-28T17:00:00Z"
        }
        ```
    *   Status Codes:
        *   `202 Accepted`: Message received and processing started (response via WebSocket). Includes the created user message object.
        *   `400 Bad Request`: Invalid chat ID format, missing content, or invalid model ID.
        *   `403 Forbidden`: User cannot post to this chat.
        *   `404 Not Found`: Chat or Model with the given ID does not exist.
        *   `500 Internal Server Error`: Failed to save user message or initiate AI request.

*   **`POST /api/chats/{chat_id}/messages/regenerate`**
    *   **Implementation**: `server/handlers/chat_handlers.go` (RegenerateMessage function)
    *   Description: Finds the last assistant message in the chat, removes it, and generates a new response based on the preceding user message. Uses specialized context building to ensure the triggering message is properly included. The new response is streamed via WebSocket.
    *   Path Parameter: `{chat_id}` - The integer ID of the chat.
    *   Request Body (`application/json`, Optional):
        ```json
        {
          "model_id": 2 // Optional: ID of the model to use for regeneration (defaults to original model if omitted)
        }
        ```
    *   Regeneration Process:
        1. Identifies the last assistant message and its preceding user message
        2. Extracts the user message content as the explicit triggering message
        3. Builds proper context including message history and system prompts
        4. Streams the regenerated response via WebSocket like a normal message
        5. Saves the final response to replace the previous one
    *   Response Body: None directly. Triggers WebSocket updates with the following sequence:
        1. `status` message indicating regeneration has started
        2. Series of `assistant_chunk` messages with content fragments
        3. Final `assistant_chunk` with `is_final: true`
    *   Status Codes:
        *   `202 Accepted`: Regeneration request received, processing started (response via WebSocket).
        *   `400 Bad Request`: Invalid chat ID format, invalid model ID, or no previous assistant message to regenerate.
        *   `403 Forbidden`: User cannot regenerate messages in this chat.
        *   `404 Not Found`: Chat or Model (if specified) does not exist.
        *   `500 Internal Server Error`: Failed to process regeneration request.
    *   Error Handling: If regeneration produces no content, an error message is sent via WebSocket.


---

*Note: Details on request/response body structures depend on the exact definitions in the `server/models/` package. This documentation provides a general overview.*