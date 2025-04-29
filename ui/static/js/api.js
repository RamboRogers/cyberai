// ui/static/js/api.js - Functions for Backend API Interaction

// Create a namespace for API functions
const api = {};

// --- State Variables (Assume these are available globally from chat.js) ---
// let currentChatId = null;
// let activeModel = null;

// --- UI Functions (Assume these are available globally from ui.js) ---
// function addSystemMessage(content, type = 'info');
// function renderModelsList(models);
// function renderChatsList(chats);
// function clearChatHistory();
// function renderMessage(message);
// function updateUserUI(user);
// function showDeleteConfirmation(chatId, chatTitle);

// --- Core Functions (Assume these are available globally from chat.js) ---
// function createNewChat(); // May need this if deleting current chat

// --- API Endpoints --- //
const API_BASE = '/api';
const CHATS_ENDPOINT = `${API_BASE}/chats`;
const MODELS_ENDPOINT = `${API_BASE}/models`;
const USER_ME_ENDPOINT = `${API_BASE}/user/me`;

// Fetch available models from the API
api.fetchModels = async function() {
    try {
        const response = await fetch('/api/models');
        if (!response.ok) {
            // Handle potential redirects during fetch (e.g., to login)
            if (response.redirected) {
                console.warn('Redirected during model fetch, likely needs login.');
                window.location.href = response.url; // Redirect to login page
                return []; // Prevent further processing
            }
            throw new Error(`HTTP error ${response.status}`);
        }

        const fetchedModels = await response.json();
        
        // Update global state
        modelsList = fetchedModels;
        console.log(`Fetched ${modelsList.length} models.`);
        
        // Populate the *Provider* select first
        ui.renderProviderSelect(); 

        // --- FIX: Restore selection AFTER providers are rendered --- 
        const savedProviderId = localStorage.getItem('activeProviderId');
        const savedModelId = localStorage.getItem('activeModelId');
        const providerSelect = document.getElementById('provider-select');
        const modelSelect = document.getElementById('model-select');

        console.log(`Attempting to restore provider: ${savedProviderId}, model: ${savedModelId}`);

        if (savedProviderId && providerSelect) {
            // Check if the saved provider exists in the newly populated dropdown
            const providerExists = Array.from(providerSelect.options).some(opt => opt.value === savedProviderId);
            if (providerExists) {
                providerSelect.value = savedProviderId;
                console.log(`Restored provider selection: ${savedProviderId}`);
                // Now populate the model select for the restored provider, passing the saved model ID
                ui.populateModelSelect(savedProviderId, savedModelId); 
            } else {
                console.warn(`Saved provider ID ${savedProviderId} not found in fetched models. Clearing selection.`);
                localStorage.removeItem('activeProviderId');
                localStorage.removeItem('activeModelId');
                providerSelect.value = '';
                ui.populateModelSelect(''); // Clear model dropdown
            }
        } else {
            // No saved provider, ensure model dropdown is cleared
            console.log("No saved provider found, clearing model dropdown.");
             if(providerSelect) providerSelect.value = ''; // Reset provider dropdown too
            ui.populateModelSelect('');
        }
        // --- END FIX ---
        
        // Update the active model indicator based on the potentially restored selection
        ui.updateActiveModelUI(); 

        return modelsList;
    } catch (error) {
        console.error('Error fetching models:', error);
        ui.showNotification(`Error loading models: ${error.message}`, 'error');
        return [];
    }
};

// Fetch existing chats from the API
api.fetchChats = async function() {
    try {
        const response = await fetch('/api/chats');
        if (!response.ok) {
            throw new Error(`HTTP error ${response.status}`);
        }

        const fetchedChats = await response.json();
        // Update global state
        chatsList = fetchedChats;
        ui.renderChatsList(chatsList);

        // If no current chat ID is set OR the current chat ID no longer exists,
        // load the first chat or create a new one.
        const currentChatExists = chatsList.some(chat => chat.id === currentChatId);
        if (!currentChatId || !currentChatExists) {
             if (chatsList.length > 0) {
                 console.log("No active chat or previous chat deleted, loading first chat:", chatsList[0].id);
                api.loadChat(chatsList[0].id);
            } else {
                 console.log("No chats found, preparing new chat UI.");
                api.prepareNewChat();
            }
        }

        return chatsList;
    } catch (error) {
        console.error('Error fetching chats:', error);
        ui.showNotification(`Error loading chats: ${error.message}`, 'error');
        return [];
    }
};

// Load a specific chat by ID
api.loadChat = async function(chatId) {
    if (!chatId || chatId === currentChatId) {
         console.log(`Skipping loadChat: chatId=${chatId}, currentChatId=${currentChatId}`);
         // Ensure UI is active even if we skip full load
         document.querySelectorAll('.chat-item').forEach(item => {
            item.classList.toggle('active', item.dataset.chatId == chatId);
        });
         return; // Don't reload if already active
    }
     console.log(`Loading chat: ${chatId}`);
    try {
        const response = await fetch(`/api/chats/${chatId}`);
        if (!response.ok) {
            if (response.status === 404) {
                console.warn(`Chat ${chatId} not found. Creating new chat.`);
                ui.showNotification(`Chat ${chatId} not found.`, 'info');
                // Reset currentChatId and create a new one
                currentChatId = null;
                await api.createNewChat(); // Calls function in this file
                return;
            }
            throw new Error(`HTTP error ${response.status}`);
        }

        const chat = await response.json();
        currentChatId = chat.id; // Update global state

        // Update chat title in UI
        if (chatTitle) { // chatTitle is global DOM element
            chatTitle.textContent = chat.title || 'Untitled Chat';
        }

        // Update active chat in the list UI
        document.querySelectorAll('.chat-item').forEach(item => {
             item.classList.toggle('active', item.dataset.chatId == chatId);
        });

        // Clear existing messages UI
        ui.clearChatHistory();

        // Render each message UI
        if (chat.messages && chat.messages.length > 0) {
            chat.messages.forEach(message => {
                ui.renderMessage(message);
            });
        } else {
            // No notification needed on successful load
        }

        // --- Update regenerate button state after loading ---
        ui.updateRegenerateButtonState();

    } catch (error) {
        console.error('Error loading chat:', error);
        ui.showNotification(`Error loading chat: ${error.message}`, 'error');
        // Attempt to recover by creating a new chat?
        currentChatId = null;
        await api.createNewChat();
        // Also update button state in case of error leading to new chat
        ui.updateRegenerateButtonState();
    }
};

// Function to handle clicking the 'New Chat' button or initiating a new chat state
api.prepareNewChat = function() {
    console.log("Preparing new chat state...");
    currentChatId = null; // Indicate a new, unsaved chat

    // Update chat title UI
    if (chatTitle) {
        chatTitle.textContent = 'New Chat';
    }

    // Clear existing messages UI
    ui.clearChatHistory();

    // Deactivate all chats in the list UI
    document.querySelectorAll('.chat-item').forEach(item => {
        item.classList.remove('active');
    });
    // Activate the "New Chat" button visually
    const newChatBtn = document.getElementById('new-chat-button');
    if (newChatBtn) {
        newChatBtn.classList.add('active');
    }

    // Focus the input field
    if (messageInput) {
        messageInput.focus();
    }

    console.log("[System] New chat prepared. Type a message to begin.");
    // --- Update regenerate button state for new chat ---
    ui.updateRegenerateButtonState(); 
};

// Old createNewChat function (to be removed or commented out)
/*
async function createNewChat() {
    console.log("Attempting to create new chat via API immediately..."); // Keep log distinct
    try {
        const response = await fetch('/api/chats', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({})
        });
        // ... (rest of the old function)
    } catch (error) {
        // ...
    }
}
*/

// Update a chat's title via API
api.updateChatTitle = async function(chatId, newTitle) {
    if (!chatId) return;
    console.log(`Updating title for chat ${chatId} to "${newTitle}"`);
    try {
        const response = await fetch(`/api/chats/${chatId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                title: newTitle
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error ${response.status}`);
        }

        // Refresh the chats list UI to show the updated title
        await api.fetchChats();

    } catch (error) {
        console.error('Error updating chat title:', error);
        ui.showNotification(`Error updating chat title: ${error.message}`, 'error');
    }
};

// Send a message or create a new chat with the first message
api.sendMessage = async function() {
    if (!messageInput) {
        console.error("Message input element not found.");
        return;
    }
    const content = messageInput.value.trim();
    if (!content) return; // Don't send empty messages

    // Ensure an active model is selected
    if (!activeModel) {
        console.error("[API] No active model selected. Cannot send message.");
        ui.showNotification("Please select a model before sending a message.", 'error');
        return;
    }

    // --- Trigger Send Animation ---
    if (messageInput) {
        messageInput.classList.add('input-sending');
        setTimeout(() => {
            messageInput.classList.remove('input-sending');
        }, 300); // Match animation duration
    }
    // -----------------------------

    // Optimistic UI update for user message (uses ui.js function)
    const tempId = `temp-user-${Date.now()}`; // Generate a temporary ID for the element
    ui.addMessageToUI('user', content, tempId); // Add message to UI optimistically

    const firstMessageContent = content; // Store content before clearing
    messageInput.value = ''; // Clear input field immediately

    // Show thinking indicator (uses ui.js function)
    ui.showThinkingIndicator(true);

    try {
        let response;
        let requestBody;

        if (currentChatId === null) {
            // --- Case 1: Creating a new chat with the first message ---
            console.log(`[API] Creating new chat with first message using model ${activeModel}:`, firstMessageContent);
            requestBody = {
                first_message: {
                    content: firstMessageContent,
                    model_id: parseInt(activeModel, 10)
                }
                // No title field - backend will use first_message content
            };

            // --- Check if parsing failed (activeModel was not a valid number string) ---
            if (isNaN(requestBody.first_message.model_id)) {
                console.error("[API] Invalid activeModel ID for new chat:", activeModel);
                ui.showNotification("Invalid model selected. Please select a valid model.", 'error');
                ui.showThinkingIndicator(false); // Hide indicator
                // Remove optimistic message
                const tempUserMsg = document.getElementById(tempId);
                if (tempUserMsg) tempUserMsg.remove();
                return; // Stop processing
            }
            // --- End Check ---

            response = await fetch('/api/chats', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody)
            });

            // --- UPDATED ERROR HANDLING for non-JSON responses ---
            if (!response.ok) {
                let errorDetail = `HTTP ${response.status}`;
                try {
                    // Try to parse JSON first
                    const errorData = await response.json(); 
                    errorDetail = errorData.detail || errorData.error || errorDetail;
                } catch (jsonError) {
                    // If JSON parsing fails, try to read response as text
                    console.warn("[API] Failed to parse error response as JSON, reading as text.");
                    try {
                        const errorText = await response.text();
                        errorDetail = errorText || errorDetail; // Use text if available
                    } catch (textError) {
                        console.error("[API] Failed to read error response as text.");
                    }
                }
                console.error(`[API] Error creating chat (Status ${response.status}):`, errorDetail);
                ui.displayChatError('new', errorDetail); // Display error in chat UI
                // Remove optimistic message
                const tempUserMsg = document.getElementById(tempId);
                if (tempUserMsg) tempUserMsg.remove();
                ui.showThinkingIndicator(false); // Hide indicator
                return; // Stop processing
            }
            // --- END UPDATED ERROR HANDLING ---
            
            // If response IS ok, THEN parse JSON
            const chatData = await response.json(); // Expect chat object back

            // Successfully created chat
            console.log('[API] New chat created successfully:', chatData);
            currentChatId = chatData.id; // UPDATE global currentChatId

            // Update the temporary user message with the real ID 
            const initialUserMessage = chatData.messages?.find(m => m.role === 'user');
            const tempUserMsgElement = document.getElementById(tempId);
            if (initialUserMessage && tempUserMsgElement) {
                tempUserMsgElement.id = `message-${initialUserMessage.id}`; 
                tempUserMsgElement.dataset.rawContent = initialUserMessage.content; 
                console.log(`[API] Updated initial user message element ID to: ${initialUserMessage.id}`);
            } else {
                 console.warn("[API] Could not find initial user message in response or temp element to update ID.")
            }

            // Refresh the chat list to show the new titled chat and make it active
            await api.fetchChats(); 
            if (chatTitle) {
                 chatTitle.textContent = chatData.title || 'Chat Created';
            }

        } else {
            // --- Case 2: Sending a message to an existing chat ---
            console.log(`[API] Sending message to existing chat ${currentChatId} using model ${activeModel}:`, firstMessageContent);
            requestBody = {
                content: firstMessageContent,
                model_id: parseInt(activeModel, 10)
            };
            
            // --- Check if parsing failed ---
             if (isNaN(requestBody.model_id)) {
                console.error("[API] Invalid activeModel ID for existing chat:", activeModel);
                ui.showNotification("Invalid model selected. Please select a valid model.", 'error');
                ui.showThinkingIndicator(false); // Hide indicator
                // Remove optimistic message
                const tempUserMsg = document.getElementById(tempId);
                if (tempUserMsg) tempUserMsg.remove();
                return; // Stop processing
            }
            // --- End Check ---

            response = await fetch(`/api/chats/${currentChatId}/messages`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody)
            });

            // --- UPDATED ERROR HANDLING for non-JSON responses ---
             if (!response.ok) {
                let errorDetail = `HTTP ${response.status}`;
                try {
                    const errorData = await response.json();
                    errorDetail = errorData.detail || errorData.error || errorDetail;
                } catch (jsonError) {
                    console.warn("[API] Failed to parse error response as JSON, reading as text.");
                    try {
                        const errorText = await response.text();
                        errorDetail = errorText || errorDetail; 
                    } catch (textError) {
                        console.error("[API] Failed to read error response as text.");
                    }
                }
                console.error(`[API] Error sending message (Status ${response.status}):`, errorDetail);
                ui.displayChatError(currentChatId, errorDetail); // Display error in chat UI
                 // Remove optimistic message
                const tempUserMsg = document.getElementById(tempId);
                if (tempUserMsg) tempUserMsg.remove();
                 ui.showThinkingIndicator(false); // Hide indicator
                 return; // Stop processing
            }
            // --- END UPDATED ERROR HANDLING ---

            // If response IS ok, THEN parse JSON
            const messageResponseData = await response.json(); // Expect user message object back

            // Successfully sent message (202 Accepted usually)
            console.log(`[API] Message POST successful (Status ${response.status}), response:`, messageResponseData);
            // Update the temporary user message element with the real ID
            const tempUserMsgElement = document.getElementById(tempId);
            if (tempUserMsgElement) {
                tempUserMsgElement.id = `message-${messageResponseData.id}`; // Update element ID
                tempUserMsgElement.dataset.rawContent = messageResponseData.content; // Update raw content
                console.log(`[API] Updated temporary user message element ID to: ${messageResponseData.id}`);
            } else {
                console.warn("[API] Couldn't find the temporary user message element to update its ID.");
            }
            // WebSocket handles the assistant response
        }

    } catch (error) {
        // Catch any other unexpected errors (e.g., network issues)
        console.error('[API] Unexpected Error in sendMessage:', error);
        ui.showNotification(`Error: ${error.message}`, 'error');
        ui.showThinkingIndicator(false); // Hide indicator on error

        // Remove the optimistic message if the send/create failed
        const tempUserMsg = document.getElementById(tempId);
        if (tempUserMsg) {
            tempUserMsg.remove();
            console.log("[API] Removed optimistic user message due to unexpected error.");
        }
    }
};

// Regenerate the last message via API
api.regenerateLastMessage = async function() {
    if (!currentChatId) return;

    // Ensure an active model is selected
    if (!activeModel) {
        console.error("[API] No active model selected. Cannot regenerate message.");
        ui.showNotification("Please select a model before regenerating.", 'error');
        return;
    }

    // --- Check if model ID is valid number --- 
    const modelIdInt = parseInt(activeModel, 10);
    if (isNaN(modelIdInt)) {
        console.error("[API] Invalid activeModel ID for regeneration:", activeModel);
        ui.showNotification("Invalid model selected. Please select a valid model.", 'error');
        return; // Stop processing
    }
    // --- End Check ---

    console.log(`Regenerating with model_id: ${modelIdInt} for chat: ${currentChatId}`);
    ui.showThinkingIndicator(true); // Show thinking indicator
    const modelName = modelsList.find(m => m.id == activeModel)?.name || 'selected model';
    ui.showNotification(`Regenerating using ${modelName}...`, 'info');

    try {
        const response = await fetch(`/api/chats/${currentChatId}/messages/regenerate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model_id: modelIdInt // Use the parsed integer
            })
        });

        // --- UPDATED ERROR HANDLING --- 
        if (!response.ok) {
            let errorMsg = `HTTP error ${response.status}`;
            try {
                // Try to parse JSON first
                const errorData = await response.json();
                errorMsg = errorData.detail || errorData.error || errorMsg;
            } catch(jsonError) { 
                // If JSON parsing fails, try to read as text
                console.warn("[API] Failed to parse regenerate error response as JSON, reading as text.");
                try {
                    const errorText = await response.text();
                    errorMsg = errorText || errorMsg;
                } catch (textError) {
                     console.error("[API] Failed to read regenerate error response as text.");
                }
            }
            // Display error and throw
            ui.displayChatError(currentChatId, errorMsg);
            throw new Error(errorMsg); // Throw after logging/displaying
        }
        // --- END UPDATED ERROR HANDLING ---
        
        // Success (202 Accepted) is handled by WebSocket stream
        console.log('Regenerate request accepted.');

    } catch (error) {
        // Catch errors from fetch or the throw above
        console.error('Error regenerating message:', error);
        ui.showNotification(`Error regenerating: ${error.message}`, 'error');
        ui.showThinkingIndicator(false); // Hide indicator on error
    }
};

// Delete a chat (Trigger confirmation UI)
api.deleteChat = function(chatId, chatTitle) {
    if (!chatId) return;
    // Show custom delete confirmation UI
    ui.showConfirmationDialog(
        'Delete Chat?',
        `Are you sure you want to permanently delete the chat "${chatTitle || 'Untitled Chat'}"? This cannot be undone.`,
        (confirmationEl) => api.confirmDeleteChat(chatId, chatTitle, confirmationEl)
    );
};

// Confirm chat deletion via API (called from UI confirmation)
api.confirmDeleteChat = async function(chatId, chatTitle, confirmationEl) {
     console.log(`Confirming delete for chat ${chatId}`);
    try {
        const response = await fetch(`/api/chats/${chatId}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            // Attempt to parse error from backend
            let errorMsg = `HTTP error ${response.status}`;
            try {
                const errorData = await response.json();
                errorMsg = errorData.message || errorData.error || errorMsg;
            } catch(e) { /* Ignore parsing error */ }
            throw new Error(errorMsg);
        }

        ui.showNotification(`Chat "${chatTitle || 'Untitled'}" deleted.`, 'success');

        // If we deleted the current chat, update state and load/create new
        if (chatId === currentChatId) {
            currentChatId = null; // Reset global state
            ui.clearChatHistory(); // Clear UI
            await api.fetchChats(); // Fetch remaining chats, will load first or create new
        } else {
             // Otherwise, just refresh the list UI
             await api.fetchChats();
        }

    } catch (error) {
        console.error('Error deleting chat:', error);
        ui.showNotification(`Error deleting chat: ${error.message}`, 'error');
    } finally {
         // Remove confirmation element after operation
         if (confirmationEl) {
            setTimeout(() => confirmationEl.remove(), 0); // Remove immediately after logic
         }
    }
};

// Confirm PURGE ALL chats via API (called from UI confirmation)
api.confirmPurgeChats = async function(confirmationEl) {
     console.log(`Confirming PURGE ALL chats for user`);
     ui.showNotification(`Purging all chats...`, 'info');
    try {
        const response = await fetch(`/api/chats/purge`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            // Attempt to parse error from backend
            let errorMsg = `HTTP error ${response.status}`;
            try {
                const errorData = await response.json();
                errorMsg = errorData.message || errorData.error || errorMsg;
            } catch(e) { /* Ignore parsing error */ }
            throw new Error(errorMsg);
        }

        ui.showNotification(`All chats purged successfully.`, 'success');

        // Reset state and UI
        currentChatId = null; // Reset global state
        ui.clearChatHistory(); // Clear UI
        await api.fetchChats(); // Fetch (should be empty), will trigger createNewChat

    } catch (error) {
        console.error('Error purging chats:', error);
        ui.showNotification(`Error purging chats: ${error.message}`, 'error');
    } finally {
         // Remove confirmation element after operation
         if (confirmationEl) {
            confirmationEl.classList.remove('visible');
            setTimeout(() => confirmationEl.remove(), 300);
         }
    }
};

// Fetch current user information via API
api.fetchCurrentUser = async function() {
    try {
        const response = await fetch('/api/user/me'); // Standard user endpoint
        if (!response.ok) {
            // Special handling for dev mode where /api/user/me might not exist
            // In this case, assume TempAdminAuthMiddleware is used.
            if (response.status === 404 && window.location.hostname === 'localhost') {
                console.warn('/api/user/me not found, assuming dev mode admin.');
                const devAdminUser = {
                    username: 'admin',
                    role: 'Administrator',
                    first_name: 'Admin',
                    last_name: 'User'
                };
                 currentUser = devAdminUser; // Set global state
                 ui.updateUserUI(devAdminUser); // Update UI
                 return;
            }
            throw new Error(`HTTP error ${response.status}`);
        }

        const userData = await response.json();
        currentUser = userData; // Set global state
        ui.updateUserUI(userData); // Update UI
        console.log('Current user:', userData);
    } catch (error) {
        console.error('Error fetching user information:', error);
        // Fallback UI for generic user if fetch fails
         const fallbackUser = {
             username: 'User',
             role: 'User',
             first_name: '',
             last_name: ''
         };
         currentUser = fallbackUser;
         ui.updateUserUI(fallbackUser);
    }
};

// Export the namespace
window.api = api;