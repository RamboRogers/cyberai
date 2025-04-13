# CyberAI - Secure Multi-Model AI Chat Platform

## Overview
CyberAI is a powerful, secure multi-user chat platform that integrates multiple AI models through a cyberpunk-inspired terminal interface. Built with performance, security, and flexibility in mind, it provides a centralized interface for interacting with various language models.

## Core Features
- **Multi-Model Support**: Connect to Ollama, OpenAI, and other LLM providers
- **Real-time Streaming**: Experience instant responses with message streaming
- **Agent System**: Create custom agents with specialized system prompts
- **Secure Multi-User**: Role-based access with isolated chat sessions
- **Cyberpunk UI**: Beautiful S3270 terminal-inspired interface
- **Advanced Admin**: Full control over models, endpoints, and user access

## Technical Architecture

### Backend (Go)
- Modular server structure to handle multiple LLM API integrations
- User authentication and session management
- Multi-user concurrent chat system
- Admin API for managing API endpoints
- Model enumeration system
- Agent management system with custom system prompts
- Per-user model access control
- Metrics tracking system
- WebSocket handlers for real-time chat updates

### Frontend
- Responsive chat interface
- Text input area with send functionality
- Dynamic chat display with smooth scrolling
- Markdown rendering for LLM responses
- Copy-to-clipboard functionality for messages
- Model selection dropdown
- Admin dashboard
- API endpoint management interface
- Model enumeration viewer
- Agent creation/selection UI
- Metrics display component
- User management interface

### Database
- Store user credentials and permissions
- Maintain chat history
- Track API endpoint configurations
- Store model information
- Save agent definitions and prompts
- Record usage metrics

### API Integration
- Ollama API connector
- OpenAI API connector
- Endpoint registration system
- Model discovery system
- Request/response handlers

### Security
- User authentication
- Role-based access control
- Secure API endpoint storage
- Protect WebSocket connections
- Sanitize user inputs
- Encrypt sensitive data

## Getting Started
*Coming soon: Installation and usage instructions*

## Contributing
*Coming soon: Contribution guidelines*

## License
*Coming soon: License information*