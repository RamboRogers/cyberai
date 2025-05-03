<div align="center">
<table>
  <tr>
    <td>
      <img src="media/screen2.png" alt="chat interface">
    </td>
    <td>
      <img src="media/dashboard2.png" alt="admin dashboard">
    </td>
  </tr>
</table>
<p><em>Note: Screenshots may not reflect the latest UI/UX rework.</em></p>
</div>

<div align="center">
  <h1>CyberAI</h1>
  <p><strong>Secure Multi-Model AI Chat Platform</strong></p>
  <p>🤖 Multiple AI Models | 🌍 Web UI | ⚡ Real-time Streaming | 🔒 Secure | 🎨 Cyberpunk Terminal</p>
  <p>
    <img src="https://img.shields.io/badge/version-0.1.0-blue.svg" alt="Version 0.1.0">
    <img src="https://img.shields.io/badge/go-%3E%3D1.21-00ADD8.svg" alt="Go Version">
    <img src="https://img.shields.io/badge/platform-linux%20%7C%20macos%20%7C%20docker-brightgreen.svg" alt="Platform Support">
    <img src="https://img.shields.io/badge/license-GPLv3-green.svg" alt="License">
  </p>
</div>

[Link to Video](https://x.com/rogerscissp/status/1917092440068047334)

CyberAI is a powerful, secure multi-user chat platform that integrates multiple AI models through a cyberpunk-inspired terminal interface. Built with performance, security, and flexibility in mind, it provides a centralized interface for interacting with various language models, leveraging Retrieval-Augmented Generation (RAG) with web search and chat history to deliver more informed and contextually relevant responses.

> The intention is to provide a sleek, secure, and efficient way to interact with AI language models through a unified interface.

## 🌟 Features

<table>
  <tr>
    <th>Model Support</th>
    <th>Chat Features</th>
  </tr>
  <tr>
    <td>
      <ul>
        <li>Multiple LLM provider integration (Ollama, OpenAI)</li>
        <li>Custom agent system with specialized prompts</li>
        <li>Model enumeration system</li>
        <li>Per-user model access control</li>
        <li>Endpoint registration system</li>
        <li>Model discovery system</li>
      </ul>
    </td>
    <td>
      <ul>
        <li>Real-time message streaming</li>
        <li>Markdown rendering for responses</li>
        <li>Copy-to-clipboard functionality</li>
        <li>Chat history preservation</li>
        <li>Multi-user concurrent chat sessions</li>
        <li>Smooth scrolling interface</li>
        <li>Retrieval-Augmented Generation (RAG) using web search results and conversation history for enhanced context and accuracy.</li>
        <li>Integrated web search (Brave Search, Google CSE) to feed real-time data into RAG.</li>
      </ul>
    </td>
  </tr>
  <tr>
    <th>User Interface</th>
    <th>Security</th>
  </tr>
  <tr>
    <td>
      <ul>
        <li>Modern, responsive UI built with Tailwind CSS</li>
        <li>Cyberpunk S3270 terminal-inspired design (Penguin UI theme)</li>
        <li>Unified style across Chat and Admin interfaces</li>
        <li>Dynamic model selection dropdowns</li>
        <li>Admin dashboard for system management</li>
        <li>Agent creation/selection UI (Planned/Not Implemented)</li>
        <li>Metrics display component (Planned/Not Implemented)</li>
      </ul>
    </td>
    <td>
      <ul>
        <li>User authentication system</li>
        <li>Role-based access control</li>
        <li>Secure API endpoint storage</li>
        <li>Protected WebSocket connections</li>
        <li>Input sanitization</li>
        <li>Encrypted sensitive data</li>
      </ul>
    </td>
  </tr>
</table>

## Todo 📋

- [ ] Gated User Profile (Can only access Persona's)
- [ ] Agents for Users (Persona's with special prompts!)
- [ ] Agents with Tools (can do work)
- [x] Search (Brave API and Google API)

## 🚀 Quick Start

You can run CyberAI using Docker with either `docker run` or `docker-compose`.

**Default credentials:**
- Username: `admin`
- Password: `admin`

### Option 1: Docker Run

This command uses a Docker named volume (`cyberai-data`) to store the application's data (like the SQLite database) persistently.

```bash
docker run -d --name cyberai \
  -p 8080:8080 \
  -v cyberai-data:/cyberai/data \
  mattrogers/cyberai:latest
```

*   `-d`: Run in detached mode.
*   `--name cyberai`: Assign a name to the container.
*   `-p 8080:8080`: Map host port 8080 to container port 8080.
*   `-v cyberai-data:/cyberai/data`: Mount the named volume `cyberai-data` to the `/cyberai/data` directory inside the container.

### Option 2: Docker Compose

1.  Create a `docker-compose.yml` file with the following content:
    ```yaml
    version: '3.8'

    services:
      cyberai:
        image: ramborogers/cyberai:latest
        container_name: cyberai
        ports:
          - "8080:8080"
        volumes:
          - cyberai-data:/cyberai/data
        restart: unless-stopped

    volumes:
      cyberai-data:
    ```
2.  Run the following command in the same directory as the `docker-compose.yml` file:
    ```bash
    docker-compose up -d
    ```
    This will automatically create the named volume `cyberai-data` if it doesn't exist.

### Accessing the Web Interface

Once the container is running (using either method), access the web interface at:
- Web UI: http://localhost:8080

### Upgrading the Docker Container

**Using Docker Run:**

1.  Pull the latest image: `docker pull mattrogers/cyberai:latest`
2.  Stop and remove the existing container: `docker stop cyberai && docker rm cyberai`
3.  Start the new container using the *same* volume mount command as above.

**Using Docker Compose:**

1.  Pull the latest image: `docker-compose pull`
2.  Restart the service, which will automatically use the new image and the existing volume: `docker-compose up -d`

## 🔨 Building from Source

### Prerequisites

- Go 1.21 or later

### Clone and Build

```bash
# Clone the repository
git clone https://github.com/ramborogers/cyberai.git
cd cyberai

# Build the application
go build -o cyberai ./cmd/cyberai

# Run the application (creates data/cyberai.db by default)
./cyberai
```

### Run without Building

```bash
# Run directly with Go
go run ./cmd/cyberai
```

### Environment Variables

CyberAI uses environment variables for configuration (no config file needed):

| Variable | Description | Default |
|----------|-------------|---------|
| PORT | Web server port | 8080 |
| SESSION_KEY | Secret key for session cookies | Default insecure key (only for development) |
| DB_PATH | SQLite database file path | `/cyberai/data/cyberai.db` (Docker) or `data/cyberai.db` (local) |

Example usage when running locally:

```bash
# Set environment variables
export PORT=9090
export SESSION_KEY="your-secure-session-key"
export DB_PATH="/path/to/database.db"

# Run the application
./cyberai
```

## 💻 Usage

CyberAI provides a unified interface for interacting with various AI models:

1. **Login** with your credentials
2. **Select** your preferred AI model
3. **Chat** in real-time with streaming responses
4. **Create** custom agents with specialized system prompts
5. **Search** the web directly from your chat with integrated search providers

### Admin Features

```bash
# Access admin dashboard
http://localhost:8080/admin

# Add new API endpoints
# Manage user permissions
# Create specialized agents
# Configure search providers (Brave Search, Google CSE)
# View system metrics
```

## 🔍 Technical Architecture

### Backend (Go)
- Modular server structure to handle multiple LLM API integrations
- User authentication and session management
- WebSocket handlers for real-time chat updates
- Admin API for managing system resources
- Search provider integration for web search capabilities

### Frontend
- Responsive chat interface with S3270 terminal-inspired design
- Dynamic model selection and agent management
- Admin dashboard for system configuration

### Database
- User credentials and permissions storage
- Chat history preservation
- Configuration management
- Search provider settings

## ⚖️ License

<p>
CyberAI is licensed under the GNU General Public License v3.0 (GPLv3).<br>
<em>Free Software</em>
</p>

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg?style=for-the-badge)](https://www.gnu.org/licenses/gpl-3.0)

### Connect With Me 🤝

[![GitHub](https://img.shields.io/badge/GitHub-RamboRogers-181717?style=for-the-badge&logo=github)](https://github.com/RamboRogers)
[![Twitter](https://img.shields.io/badge/Twitter-@rogerscissp-1DA1F2?style=for-the-badge&logo=twitter)](https://x.com/rogerscissp)
[![Website](https://img.shields.io/badge/Web-matthewrogers.org-00ADD8?style=for-the-badge&logo=google-chrome)](https://matthewrogers.org)

</div>
