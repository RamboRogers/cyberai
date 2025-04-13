# CyberAI Design

## Overview

CyberAI is a self-hosted AI chat application that supports multiple large language models (LLMs), custom system prompts, and multi-user functionality. It aims to provide a flexible and secure environment for interacting with various AI models through a consistent interface.

## Architecture

The application follows a client-server architecture with:

1. **Backend**: Go-based server with SQLite database
2. **Frontend**: HTML/CSS/JavaScript web interface

### Backend Components

- **HTTP Server**: Main entry point handling API requests and serving static files
- **Database**: SQLite for data persistence
- **Model Connectors**: Modules for interacting with different LLM APIs
- **Authentication**: User management and session handling
- **WebSocket**: Real-time communication for chat

### Implementation Status

#### Model Connectors

- **OpenAI Connector**: Successfully integrated the OpenAI Go client library (`github.com/openai/openai-go v0.1.0-beta.9`) with:
  - Support for both streaming and non-streaming completions
  - Proper message role mapping (user, assistant, system)
  - Chat completion with temperature and token controls
  - Error handling and health checks
  - Implementation follows the `ModelConnector` interface defined in `server/llm/connectors.go`

- **Ollama Connector**: Local model integration for open-source models

- **Anthropic Connector**: Integrated Anthropic's Go client library (`github.com/anthropics/anthropic-sdk-go`) with:
  - Support for Claude 3 models via standard API
  - Handles both streaming and non-streaming completions
  - Proper message role mapping including system messages
  - Temperature and token controls
  - Error handling and health checks
  - Implementation follows the `ModelConnector` interface

The connectors handle different messaging formats between the internal application and the external API providers while maintaining a consistent interface for the rest of the application. Each connector implements health checks to verify connectivity and authentication with its respective API.

### Frontend Components

- **Chat Interface**: Main UI for interacting with AI models
- **Settings**: Configuration and customization options
- **Admin Panel**: User and model management for administrators

## Data Model

### Core Entities

#### Users and Authentication

- **users**: Store user accounts and authentication details
  - `id`: Unique identifier
  - `username`: User's username (unique)
  - `password_hash`: Bcrypt hash of user's password
  - `email`: User's email address (unique)
  - `first_name`, `last_name`: Personal details
  - `role_id`: Reference to roles table
  - `is_active`: Whether the account is active
  - `last_login`: Timestamp of last login
  - `created_at`, `updated_at`: Timestamps

- **roles**: User roles for permission management
  - `id`: Unique identifier
  - `name`: Role name (admin, user, etc.)
  - `description`: Role description
  - `permissions`: JSON representation of permissions
  - `created_at`, `updated_at`: Timestamps

#### Models and Agents

- **models**: AI language models configuration
  - `id`: Unique identifier
  - `name`: Display name
  - `provider`: Service provider (openai, ollama, etc.)
  - `base_url`: API endpoint URL
  - `model_id`: Provider's model identifier
  - `api_key`: Authentication key for API
  - `max_tokens`: Maximum response length
  - `temperature`: Randomness parameter
  - `is_active`: Whether the model is available
  - `default_system_prompt`: Default system instructions
  - `configuration`: JSON with additional parameters
  - `created_at`, `updated_at`: Timestamps

- **agents**: Specialized AI agents with custom prompts
  - `id`: Unique identifier
  - `name`: Agent name
  - `description`: Agent description
  - `system_prompt`: System instructions for this agent
  - `model_id`: Reference to models table
  - `user_id`: Creator/owner reference
  - `is_public`: Whether other users can use this agent
  - `is_active`: Whether the agent is available
  - `configuration`: JSON with additional parameters
  - `created_at`, `updated_at`: Timestamps

#### Conversations

- **chats**: User conversations
  - `id`: Unique identifier
  - `title`: Chat title
  - `user_id`: Owner reference
  - `is_active`: Whether the chat is active or archived
  - `created_at`, `updated_at`: Timestamps

- **messages**: Individual messages in chats
  - `id`: Unique identifier
  - `chat_id`: Reference to parent chat
  - `user_id`: Message author
  - `role`: Message role (user, assistant, system)
  - `content`: Message text content
  - `model_id`: Model used for this message (optional)
  - `agent_id`: Agent used for this message (optional)
  - `tokens_used`: Number of tokens consumed
  - `created_at`: Timestamp

#### Usage Tracking

- **usage_statistics**: Model usage metrics
  - `id`: Unique identifier
  - `user_id`: User reference
  - `chat_id`: Chat reference
  - `message_id`: Message reference
  - `model_id`: Model reference
  - `prompt_tokens`: Tokens in prompt
  - `completion_tokens`: Tokens in response
  - `total_tokens`: Total tokens used
  - `created_at`: Timestamp

## API Endpoints

### Authentication

- `POST /api/auth/login`: User login
- `POST /api/auth/logout`: User logout
- `POST /api/auth/register`: New user registration (if enabled)

### Users

- `GET /api/users`: List users (admin only)
- `GET /api/users/:id`: Get user details
- `PUT /api/users/:id`: Update user
- `DELETE /api/users/:id`: Delete user (admin only)

### Models

- `GET /api/models`: List active models available to the current user.
- `GET /api/admin/models`: List available models (admin only)
- `POST /api/admin/models`: Add new model (admin only)
- `GET /api/admin/models/:id`: Get model details (admin only)
- `PUT /api/admin/models/:id`: Update model (admin only)
- `DELETE /api/admin/models/:id`: Delete model (admin only)

### Agents

- `GET /api/agents`: List available agents
- `POST /api/agents`: Create new agent
- `GET /api/agents/:id`: Get agent details
- `PUT /api/agents/:id`: Update agent
- `DELETE /api/agents/:id`: Delete agent

### Chats

- `GET /api/chats`: List user's active chats (titles, metadata).
- `POST /api/chats`: Create new chat (optionally with first message and model_id).
- `GET /api/chats/:id`: Get chat details with full message history.
- `PUT /api/chats/:id`: Update chat properties (e.g., title).
- `DELETE /api/chats/:id`: Delete chat.

### Messages

- `POST /api/chats/:id/messages`: Send new message (requires `content`, `model_id`). Triggers AI response via WebSocket.
- `GET /api/chats/:id/messages`: *Not typically used directly if using `GET /api/chats/:id` which includes messages.* Fetch message history for a chat.
- `POST /api/chats/:id/messages/regenerate`: Trigger regeneration of the last assistant response (optionally with a new `model_id`). Response via WebSocket.
- `GET /api/chats/:id/messages/stream`: *Deprecated/Replaced by WebSocket* - Use WebSocket (`/ws`) for streaming responses after POSTing a message.

## Performance Considerations

- Database indexes on frequently queried columns
- Efficient token counting for rate limiting
- Message chunking for large conversations
- Caching for frequently accessed data

## Security

- Password hashing with bcrypt
- API key encryption
- CSRF protection
- Input validation and sanitization
- Rate limiting
- Role-based access control

## Deployment

The application can be deployed as:
1. A single binary with embedded assets
2. A Docker container
3. A standalone service with separate static file hosting

## Future Considerations

- Support for additional LLM providers
- Vector database integration for context enrichment
- File upload and processing capabilities
- Export/import functionality
- Fine-tuning interface

## Recent Changes / Notes

### Admin UI Fixes
- Addressed issues with the model edit modal not displaying correctly due to duplicate function definitions.
- Fixed JavaScript errors (`TypeError`) occurring when saving models by adding element existence checks before accessing properties.
- Corrected model validation logic to differentiate between adding a new model (requires provider selection) and editing an existing model (provider is already set), resolving incorrect validation errors during edits.