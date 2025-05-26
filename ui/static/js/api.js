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
const SEARCH_ENDPOINT = `${API_BASE}/search`;
const SEARCH_CHAT_ENDPOINT = `${API_BASE}/search/chat`;

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

        // *** Load activeChatId from localStorage BEFORE rendering the list ***
        currentChatId = parseInt(localStorage.getItem('activeChatId'), 10) || null;
        console.log(`[API FetchChats] Loaded activeChatId from localStorage: ${currentChatId}`);

        ui.renderChatsList(chatsList); // Render the list (this calls updateActiveChatUI internally)

        // If a valid chat ID was loaded from storage and exists, ensure its messages are loaded.
        const currentChatExists = currentChatId && chatsList.some(chat => chat.id === currentChatId);
        if (currentChatExists) {
             console.log(`[API FetchChats] Active chat ${currentChatId} exists, ensuring messages are loaded.`);
             // Check if chat content is already loaded? For now, call loadChat to ensure consistency.
             api.loadChat(currentChatId);
        } else if (!currentChatId || !currentChatExists) {
             // Check if user is intentionally in a new chat state
             if (isIntentionalNewChat) {
                 console.log("[API FetchChats] User is intentionally in new chat state, preserving it.");
                 // Don't auto-load any chat, keep the new chat state
                 return chatsList;
             }

             // If no valid ID was loaded, or it doesn't exist anymore...
             if (chatsList.length > 0) {
                 console.log("[API FetchChats] No valid active chat found, loading first chat:", chatsList[0].id);
                 currentChatId = chatsList[0].id; // Update global var
                 localStorage.setItem('activeChatId', currentChatId); // ** Save the new active chat ID
                 api.loadChat(currentChatId);
             } else {
                 console.log("[API FetchChats] No chats found, preparing new chat UI.");
                 api.prepareNewChat(); // This will also clear localStorage
             }
         } // else: currentChatId exists, no need to load first/new

        return chatsList;
    } catch (error) {
        console.error('Error fetching chats:', error);
        ui.showNotification(`Error loading chats: ${error.message}`, 'error');
        return [];
    }
};

// Load a specific chat by ID
api.loadChat = async function(chatId) {
    // Remove check against currentChatId to allow re-loading if needed,
    // but prevent infinite loops if loadChat calls itself indirectly
    if (!chatId) {
         console.log(`Skipping loadChat: invalid chatId=${chatId}`);
         return;
    }
    console.log(`Loading chat: ${chatId}`);
    localStorage.setItem('activeChatId', chatId); // ** Save active chat ID on load attempt **

    try {
        const response = await fetch(`/api/chats/${chatId}`);
        if (!response.ok) {
            if (response.status === 404) {
                console.warn(`Chat ${chatId} not found. Creating new chat.`);
                ui.showNotification(`Chat ${chatId} not found.`, 'info');
                localStorage.removeItem('activeChatId'); // Remove invalid ID
                currentChatId = null;
                await api.createNewChat();
                return;
            }
            throw new Error(`HTTP error ${response.status}`);
        }

        const chat = await response.json();
        currentChatId = chat.id; // Update global state AFTER successful load
        isIntentionalNewChat = false; // Clear new chat flag since we're loading an existing chat

        // Update chat title in UI
        if (chatTitle) {
            chatTitle.textContent = chat.title || 'Untitled Chat';
        }

        // Update active chat in the list UI (now handled by ui.updateActiveChatUI)
        // document.querySelectorAll('.chat-item').forEach(item => {
        //      item.classList.toggle('active', item.dataset.chatId == chatId);
        // });
        ui.updateActiveChatUI(); // Ensure highlight is correct

        // Clear existing messages UI
        ui.clearChatHistory();

        // Render each message UI only if it doesn't already exist
        if (chat.messages && chat.messages.length > 0) {
            chat.messages.forEach(message => {
                const existingElement = document.getElementById(`message-${message.id}`);
                if (!existingElement) {
                    console.log(`[loadChat] Rendering message ${message.id} as it doesn't exist.`);
                    ui.renderMessage(message); // Render only if not already present
                } else {
                    console.log(`[loadChat] Skipping render for message ${message.id} as it already exists.`);
                }
            });
        } else {
            // No messages, maybe add a system message?
            // ui.addSystemMessage("Chat loaded, but no messages yet.", 'info');
        }

        // --- Update regenerate button state after loading ---
        ui.updateRegenerateButtonState();

    } catch (error) {
        console.error('Error loading chat:', error);
        ui.showNotification(`Error loading chat: ${error.message}`, 'error');
        localStorage.removeItem('activeChatId'); // Remove invalid ID on error
        currentChatId = null;
        await api.createNewChat(); // Attempt to recover
        ui.updateRegenerateButtonState();
    }
};

// Function to handle clicking the 'New Chat' button or initiating a new chat state
api.prepareNewChat = function() {
    console.log("Preparing new chat state...");
    currentChatId = null; // Indicate a new, unsaved chat
    isIntentionalNewChat = true; // Mark as intentional new chat to prevent auto-switching
    localStorage.removeItem('activeChatId'); // ** Clear active chat ID **

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

// Creates a new chat on the server, optionally with the first message
api.createNewChat = async function(firstMessageContent = null) {
    console.log(`Creating new chat via API ${firstMessageContent ? 'with initial message' : ''}`);

    try {
        let requestBody = {};

        // If first message is provided, include it in the request
        if (firstMessageContent && activeModel) {
            requestBody = {
                first_message: {
                    content: firstMessageContent,
                    model_id: parseInt(activeModel, 10)
                }
                // No title field - backend will use first_message content
            };
        }

        const response = await fetch('/api/chats', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            let errorDetail = `HTTP ${response.status}`;
            try {
                const errorData = await response.json();
                errorDetail = errorData.detail || errorData.error || errorDetail;
            } catch (jsonError) {
                try {
                    const errorText = await response.text();
                    errorDetail = errorText || errorDetail;
                } catch (textError) {
                    console.error("[API] Failed to read error response as text.");
                }
            }
            console.error(`[API] Error creating chat (Status ${response.status}):`, errorDetail);
            ui.showNotification(`Error creating chat: ${errorDetail}`, 'error');
            return null;
        }

        const chatData = await response.json();

        // Successfully created chat
        console.log('[API] New chat created successfully:', chatData);
        currentChatId = chatData.id; // UPDATE global currentChatId
        localStorage.setItem('activeChatId', currentChatId); // ** Save active chat ID **

        // Update UI
        if (chatTitle) {
            chatTitle.textContent = chatData.title || 'New Chat';
        }

        // Refresh the chat list
        await api.fetchChats();

        return chatData;
    } catch (error) {
        console.error('[API] Unexpected Error in createNewChat:', error);
        ui.showNotification(`Error creating chat: ${error.message}`, 'error');
        return null;
    }
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
            isIntentionalNewChat = false; // Clear new chat flag since we've created the chat
            localStorage.setItem('activeChatId', currentChatId); // ** Save active chat ID **

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
            localStorage.removeItem('activeChatId'); // ** Clear active chat ID **
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
        localStorage.removeItem('activeChatId'); // ** Clear active chat ID **
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

// Search the web and return raw results
api.search = async function(query, providerId = null) {
    if (!query || query.trim() === '') {
        ui.showNotification('Please enter a search query', 'warning');
        return null;
    }

    try {
        ui.showThinkingIndicator(true, 'Searching the web...');

        const requestData = {
            query: query
        };

        if (providerId) {
            requestData.provider_id = providerId;
        }

        const response = await fetch(SEARCH_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestData)
        });

        if (!response.ok) {
            throw new Error(`HTTP error ${response.status}`);
        }

        const searchResults = await response.json();
        console.log('Search results:', searchResults);
        return searchResults;
    } catch (error) {
        console.error('Error performing search:', error);
        ui.showNotification(`Error searching: ${error.message}`, 'error');
        return null;
    } finally {
        ui.showThinkingIndicator(false);
    }
};

// Search the web and get AI-generated response
api.searchAndChat = async function(query, modelId = null) {
	if (!query || query.trim() === '') {
		ui.showNotification('Please enter a search query', 'warning');
		return;
	}

	if (!modelId && !activeModel) {
		ui.showNotification('Please select a model first', 'warning');
		return;
	}

	const selectedModelId = modelId || activeModel;
	let tempId = `temp-user-search-${Date.now()}`;

	try {
		// Clear the input field immediately
		if (messageInput) messageInput.value = '';

		// Show searching indicator
		ui.showThinkingIndicator(true, 'Searching and processing results...');

		// Always add the user's search query to the UI immediately
		// This ensures the user query appears at the top
		ui.addMessageToUI('user', query, tempId, 'search');

		// Make sure we scroll to see the user's message
		if (chatHistory) ui.scrollToBottom(chatHistory);

		const requestData = {
			query: query,
            model_id: parseInt(selectedModelId, 10) // Add selected model ID
		};

        // Only add provider_id if one was explicitly chosen (or handle default on backend)
        // const selectedProviderId = document.getElementById('provider-select')?.value;
        // if (selectedProviderId) { requestData.provider_id = parseInt(selectedProviderId, 10); }
        // For now, let backend handle default provider logic if provider_id is omitted

		// Determine if we should append to current chat or create new one
		const useExistingChat = currentChatId !== null;
		const endpoint = useExistingChat
			? `${CHATS_ENDPOINT}/${currentChatId}/search`
			: SEARCH_CHAT_ENDPOINT;

		// If creating a new chat, model_id is needed in the request
		if (!useExistingChat) {
			if (isNaN(requestData.model_id)) {
				ui.showNotification("Invalid model selected for new search chat.", "error");
				throw new Error("Invalid model ID"); // Prevent API call
			}
		} else {
			// Always keep model_id in the request - backend will use this for search
			// If no model_id, backend will try to use last message's model
			if (isNaN(requestData.model_id)) {
				console.log("Warning: No valid model_id for search in existing chat, backend will attempt to use model from history");
			}
		}

		console.log(`Sending search request to ${endpoint} with data:`, requestData);
		const response = await fetch(endpoint, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(requestData)
		});

		if (!response.ok) {
			let errorDetail = `HTTP ${response.status}`;
			try {
				const errorData = await response.json();
				errorDetail = errorData.detail || errorData.error || errorDetail;
			} catch (e) {
				try {
					const errorText = await response.text();
					errorDetail = errorText || errorDetail;
				} catch (et) {}
			}
			throw new Error(errorDetail);
		}

		const result = await response.json();
		console.log("SearchAndChat API call successful:", result);

		// Update chat state only if we created a new chat
		if (!useExistingChat && result.chat_id) {
			// New chat was created
			currentChatId = result.chat_id;
			if (chatTitle) chatTitle.textContent = result.chat_name || 'Search Results';

			// Refresh the chat list to show the new chat
			await api.fetchChats();
		}

		// Update the temp message ID to match the actual ID from the server if available
		const userMsg = document.getElementById(tempId);
		if (userMsg && result.user_message_id) {
			userMsg.id = `message-${result.user_message_id}`;
		}

		// Return focus to input field for next message
		setTimeout(() => {
			if (messageInput) messageInput.focus();
		}, 100);

		// Ensure websocket is connected for receiving actual AI response
		if (websocket && typeof websocket.ensureConnected === 'function') {
			websocket.ensureConnected();
		}

		return result;
	} catch (error) {
		console.error('Error in search and chat:', error);
		ui.showNotification(`Error: ${error.message}`, 'error');

		// Show error message in chat
		ui.addMessageToUI('system', `Search error: ${error.message}`, 'search-error-msg', 'error');
	} finally {
		ui.showThinkingIndicator(false);
	}
};

// Export the namespace
window.api = api;