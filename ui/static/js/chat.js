// CyberAI Chat Script - Main Orchestration

// --- Global State Variables ---
let ws;
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

// --- Core Application Logic (Functions specific to chat.js orchestration) ---

/**
 * Selects an active model, updates state, saves preference, and triggers UI update.
 * @param {number} modelId - The ID of the model to select.
 */
function selectModel(modelId) {
    if (modelId === activeModel) return; // No change needed

    showThinkingIndicator(true); // Show indicator immediately

    activeModel = modelId; // Update global state
    localStorage.setItem('activeModelId', modelId); // Persist selection

    // Update UI (Calls function in ui.js)
    updateActiveModelUI();

    // Show notification for model switch
    const selectedModel = modelsList.find(m => m.id == modelId);
    if (selectedModel) {
        showNotification(`Switched to model: ${selectedModel.name}`, 'info');
    }

    // Keep console log for debugging
    console.log(`[Chat] Model switched to ID: ${modelId}`);

    // Hide indicator after a short delay
    setTimeout(() => showThinkingIndicator(false), 500); // Hide after 500ms
}

/**
 * Initiates the process for starting a new chat.
 */
function startNewChat() {
    console.log("New Chat button clicked.");
    prepareNewChat(); // Calls the function in api.js to reset UI/state
}

/**
 * Initializes the chat application: sets up event listeners, fetches initial data.
 */
function initChat() {
	// Event listeners for UI elements
	if (sendButton) {
		sendButton.addEventListener('click', sendMessage); // Calls function in api.js
	}
	if (messageInput) {
		messageInput.addEventListener('keyup', function(event) {
			if (event.key === 'Enter') {
				sendMessage(); // Calls function in api.js
			}
		});
	}
	if (newChatButton) {
		newChatButton.addEventListener('click', prepareNewChat); // Calls function in api.js
	}
	if (regenerateButton) {
		regenerateButton.addEventListener('click', regenerateLastMessage); // Calls function in api.js
	}
	if (chatTitle) {
		chatTitle.addEventListener('dblclick', function() {
			const currentTitle = this.textContent;
			const newTitle = prompt('Enter new chat title:', currentTitle);
			if (newTitle && newTitle.trim() !== '' && newTitle !== currentTitle) {
				this.textContent = newTitle; // Optimistic UI update
				updateChatTitle(currentChatId, newTitle); // Calls function in api.js
			}
		});
	}
	// Set up event listeners defined in ui.js
	setupEventListeners(); // Call the function from ui.js

	// Fetch initial data (user info, models, chats)
	fetchCurrentUser(); // Function assumed in api.js
	connect(); // Connect WebSocket (function assumed in websocket.js)

	console.log('Chat initialized.');
}

// --- Start application ---
document.addEventListener('DOMContentLoaded', initChat);

// Note: Functions previously in this file have been moved to:
// - ui.js (UI rendering, DOM manipulation, helpers)
// - api.js (Backend communication)
// - websocket.js (WebSocket connection and message handling)