// CyberAI Chat Script - Main Orchestration

// --- Global State Variables ---
// let ws; // REMOVED - This is declared and managed in websocket.js
let currentChatId = null;
let modelsList = []; // Populated by api.js, Used by ui.js, api.js, chat.js
let chatsList = [];  // Populated by api.js, Used by api.js
let activeModel = null; // Updated by api.js, chat.js, Used by api.js, ui.js
let currentUser = null; // Populated by api.js, Used by ui.js
let isInsideThinkBlock = false; // WebSocket message handling state (websocket.js)

// --- DOM Element References ---
// These are used by various functions across the different files.
// Declaring them here makes them globally accessible.
const chatHistory = document.getElementById('chat-history');
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');
const modelsListContainer = document.getElementById('models-list');
const chatsListContainer = document.getElementById('chats-list');
const newChatButton = document.getElementById('new-chat-button');
const chatTitle = document.getElementById('chat-title');
const regenerateButton = document.getElementById('regenerate-button');
const userNameElement = document.querySelector('.user-name');
const userRoleElement = document.querySelector('.user-role');
const userAvatarElement = document.querySelector('.user-avatar');

// --- Chat Namespace ---
const chat = {};

/**
 * Selects an active model, updates state, saves preference, and triggers UI update.
 * @param {number} modelId - The ID of the model to select.
 */
chat.selectModel = function(modelId) {
    if (modelId === activeModel) return; // No change needed

    ui.showThinkingIndicator(true); // Show indicator immediately

    activeModel = modelId; // Update global state
    localStorage.setItem('activeModelId', modelId); // Persist selection

    // Update UI
    ui.updateActiveModelUI();

    // Show notification for model switch
    const selectedModel = modelsList.find(m => m.id == modelId);
    if (selectedModel) {
        ui.showNotification(`Switched to model: ${selectedModel.name}`, 'info');
    }

    // Keep console log for debugging
    console.log(`[Chat] Model switched to ID: ${modelId}`);

    // Hide indicator after a short delay
    setTimeout(() => ui.showThinkingIndicator(false), 500); // Hide after 500ms
}

/**
 * Initiates the process for starting a new chat.
 */
chat.startNewChat = function() {
    console.log("New Chat button clicked.");
    api.prepareNewChat(); // Reset UI/state
}

/**
 * Initializes the chat application: sets up event listeners, fetches initial data.
 */
chat.initChat = function() {
    // Event listeners for UI elements
    if (sendButton) {
        sendButton.addEventListener('click', api.sendMessage);
    }
    if (messageInput) {
        messageInput.addEventListener('keyup', function(event) {
            if (event.key === 'Enter') {
                api.sendMessage();
            }
        });
    }
    if (newChatButton) {
        newChatButton.addEventListener('click', api.prepareNewChat);
    }
    if (regenerateButton) {
        regenerateButton.addEventListener('click', api.regenerateLastMessage);
    }
    if (chatTitle) {
        chatTitle.addEventListener('dblclick', function() {
            const currentTitle = this.textContent;
            const newTitle = prompt('Enter new chat title:', currentTitle);
            if (newTitle && newTitle.trim() !== '' && newTitle !== currentTitle) {
                this.textContent = newTitle; // Optimistic UI update
                api.updateChatTitle(currentChatId, newTitle);
            }
        });
    }

    // Set up event listeners defined in ui.js
    ui.setupEventListeners();

    // Fetch initial data (user info, models, chats)
    api.fetchCurrentUser();
    websocket.connect();

    console.log('Chat initialized.');
}

// --- Start application ---
document.addEventListener('DOMContentLoaded', chat.initChat);

// Make chat namespace globally available
window.chat = chat;

// Note: Functions previously in this file have been moved to:
// - ui.js (UI rendering, DOM manipulation, helpers)
// - api.js (Backend communication)
// - websocket.js (WebSocket connection and message handling)