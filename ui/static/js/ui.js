// ui/static/js/ui.js - UI Rendering and DOM Manipulation Functions

// Create a namespace for UI functions
const ui = {};

// --- DOM Element References (Assume these are available globally from chat.js) ---
// const chatHistory = document.getElementById('chat-history');
// const modelsListContainer = document.getElementById('models-list');
// const chatsListContainer = document.getElementById('chats-list');
// const newChatButton = document.getElementById('new-chat-button');
// const chatTitle = document.getElementById('chat-title');
// const userNameElement = document.querySelector('.user-name');
// const userRoleElement = document.querySelector('.user-role');
// const userAvatarElement = document.querySelector('.user-avatar');

// --- State Variables (Assume these are available globally from chat.js) ---
// let modelsList = [];
// let chatsList = [];
// let activeModel = null;
// let currentChatId = null;

// --- UI Rendering Functions ---

// Render the models list in the sidebar, grouped by provider
ui.renderModelsList = function(models) {
    // Clear the current models list
    if (!modelsListContainer) return;

    console.log(`Rendering ${models.length} models:`, models.map(m => `${m.id}: ${m.name}`).join(', '));

    // Remove existing model items
    while (modelsListContainer.firstChild) {
        modelsListContainer.removeChild(modelsListContainer.firstChild);
    }

    // Add each model to the list
    models.forEach(model => {
        const modelItem = document.createElement('div');
        modelItem.classList.add('model-item');
        modelItem.dataset.modelId = model.id;

        // Add status indicator
        const statusIndicator = document.createElement('span');
        statusIndicator.classList.add('status-indicator', 'status-available');
        modelItem.appendChild(statusIndicator);

        // Add model name
        modelItem.appendChild(document.createTextNode(model.name));

        // Set active state if this is the current model
        if (activeModel === model.id) {
            modelItem.classList.add('active');
        }

        // Add click handler (calls function assumed to be in chat.js)
        modelItem.addEventListener('click', () => chat.selectModel(model.id));

        // Add to container
        modelsListContainer.appendChild(modelItem);
    });

    // If no models were found, show message
    if (models.length === 0) {
        const noModelsItem = document.createElement('div');
        noModelsItem.classList.add('model-item');

        const statusIndicator = document.createElement('span');
        statusIndicator.classList.add('status-indicator', 'status-offline');
        noModelsItem.appendChild(statusIndicator);

        noModelsItem.appendChild(document.createTextNode('No models available'));
        modelsListContainer.appendChild(noModelsItem);
    }

    // Update active model indicator in chat header
    ui.updateActiveModelIndicator();
}

// Update active model indicator in chat header
ui.updateActiveModelIndicator = function() {
    // Now just log which model is active for debugging if needed
    const selectedModel = modelsList.find(m => m.id == activeModel);
    if (selectedModel) {
        console.log(`[UI Update] Active model indicator updated: ${selectedModel.name} (ID: ${activeModel})`);
    } else {
        console.log(`[UI Update] No active model or model not found.`);
    }
    // Actual UI update for indicator might go here if needed
}

// Update UI to reflect active model selection in the list
ui.updateActiveModelUI = function() {
    document.querySelectorAll('.model-item').forEach(item => {
        if (item.dataset.modelId == activeModel) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
    ui.updateActiveModelIndicator(); // Update any header indicator too
}

// Render the chats list in the sidebar
ui.renderChatsList = function(chats) {
    if (!chatsListContainer) return;

    // Keep the "New Chat" button
    const newChatBtn = document.getElementById('new-chat-button');

    // Clear the current chats list
    while (chatsListContainer.firstChild) {
        chatsListContainer.removeChild(chatsListContainer.firstChild);
    }

    // Add the new chat button back
    chatsListContainer.appendChild(newChatBtn);

    // Add each chat to the list
    chats.forEach(chat => {
        const chatItem = document.createElement('div');
        chatItem.classList.add('chat-item');
        chatItem.dataset.chatId = chat.id;

        // Add status indicator
        const statusIndicator = document.createElement('span');
        statusIndicator.classList.add('status-indicator', 'status-available');
        chatItem.appendChild(statusIndicator);

        // Create wrapper for title (to handle click separately from delete)
        const titleWrapper = document.createElement('span');
        titleWrapper.classList.add('chat-title-text');
        titleWrapper.textContent = chat.title || 'Untitled Chat';
        // Click handler calls function assumed to be in api.js or chat.js
        titleWrapper.addEventListener('click', () => loadChat(chat.id));
        chatItem.appendChild(titleWrapper);

        // Add delete button
        const deleteBtn = document.createElement('span');
        deleteBtn.classList.add('chat-delete-btn');
        deleteBtn.innerHTML = '&times;'; // × symbol
        deleteBtn.title = 'Delete chat';
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent triggering chat selection
            // Calls function assumed to be in api.js or chat.js
            ui.showConfirmationDialog(
                'Delete Chat?',
                `Are you sure you want to permanently delete the chat "${chat.title || 'Untitled Chat'}"? This cannot be undone.`,
                (confirmationEl) => api.confirmDeleteChat(chat.id, chat.title, confirmationEl) // Correct namespace: API call in api.js
            );
        });
        chatItem.appendChild(deleteBtn);

        // Set active state if this is the current chat
        if (currentChatId === chat.id) {
            chatItem.classList.add('active');
        }

        // Add to container right after the "New Chat" button
        chatsListContainer.insertBefore(chatItem, newChatBtn.nextSibling);
    });
}

// Clear all messages from the chat history
ui.clearChatHistory = function() {
    if (!chatHistory) return;
    // Preserve system message "Welcome to CyberAI Terminal"
    const systemMessages = Array.from(chatHistory.querySelectorAll('.system-message'))
        .filter(el => el.textContent.includes("Welcome to CyberAI Terminal"));

    // Clear all messages
    chatHistory.innerHTML = '';

    // Re-add the welcome message if it existed
    if (systemMessages.length > 0) {
        chatHistory.appendChild(systemMessages[0]);
    }
}

// Helper function to create message elements (used by renderMessage and handleAssistantChunk)
ui.createMessageElement = function(type, message_id, model_id = null) {
    const messageWrapper = document.createElement('div');
    messageWrapper.classList.add('message', type === 'user' ? 'user-message' : 'bot-message');
    if (message_id) { // Allow null ID for initial user message rendering
         messageWrapper.id = `message-${message_id}`;
    }
    if (model_id) {
        messageWrapper.dataset.modelId = model_id;
    }

    // Content Area
    const contentElement = document.createElement('div');
    contentElement.classList.add('content');
    messageWrapper.appendChild(contentElement);
    // Initialize raw content storage only if it's a bot message initially
    // User messages don't accumulate raw content this way
    if (type === 'bot') {
        contentElement._rawContent = '';
    }
    // Initialize raw content dataset attribute for user messages here
    // This will be populated by renderMessage or addMessageToUI
    else if (type === 'user') {
         messageWrapper.dataset.rawContent = ''; // Initialize
    }


    // Footer Area (Timestamp, Actions, Token Count)
    const footerElement = document.createElement('div');
    footerElement.classList.add('message-footer');

    // Timestamp
    const timestampElement = document.createElement('span');
    timestampElement.classList.add('timestamp');
    timestampElement.dataset.timestamp = new Date().toISOString(); // Store full timestamp
    let timeString = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    timestampElement.appendChild(document.createTextNode(timeString)); // Start with time text node

    // Add model info *during creation* if available (for bot messages)
    if (type === 'bot' && model_id) {
        timestampElement.appendChild(document.createTextNode(' - ')); // Add separator as text node
        ui.addModelInfo(timestampElement, model_id); // addModelInfo appends the model span
    }
    footerElement.appendChild(timestampElement);

    // Add elements specific to bot messages
    if (type === 'bot') {
        // Bot messages already store raw content for markdown copy
        // messageWrapper.dataset.rawContent = ''; // Already initialized for bot messages earlier if needed

        // Token Count Span (initially hidden)
        const tokenSpan = document.createElement('span');
        tokenSpan.classList.add('token-count');
        tokenSpan.style.display = 'none'; // Hide until final message arrives
        footerElement.appendChild(tokenSpan);

        // Action Buttons (Copy Text, Copy Markdown)
        const copyTextButton = document.createElement('button');
        copyTextButton.classList.add('copy-text-btn', 'action-btn');
        copyTextButton.title = 'Copy visible text';
        copyTextButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>'; // Simple copy icon
        copyTextButton.onclick = () => {
            // Get text from the main content element associated with this message
            const visibleContentElement = messageWrapper.querySelector('.content');
            const contentToCopy = visibleContentElement ? visibleContentElement.innerText || '' : ''; // Use innerText for better formatting
            navigator.clipboard.writeText(contentToCopy).then(() => {
                copyTextButton.innerHTML = 'Copied!';
                setTimeout(() => { copyTextButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>'; }, 1500);
            }).catch(err => {
                console.error('Failed to copy text:', err);
                copyTextButton.innerHTML = 'Error';
                 setTimeout(() => { copyTextButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>'; }, 1500);
            });
        };
        footerElement.appendChild(copyTextButton);

        const copyMdButton = document.createElement('button');
        copyMdButton.classList.add('copy-markdown-btn', 'action-btn');
        copyMdButton.title = 'Copy raw Markdown';
        copyMdButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71\"></path></svg>'; // Markdown icon (link)
        copyMdButton.onclick = () => {
            const rawContent = messageWrapper.dataset.rawContent || '';
            navigator.clipboard.writeText(rawContent).then(() => {
                copyMdButton.innerHTML = 'Copied!';
                setTimeout(() => { copyMdButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d=\"M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71\"></path><path d=\"M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71\"></path></svg>'; }, 1500);
            }).catch(err => {
                console.error('Failed to copy raw markdown:', err);
                copyMdButton.innerHTML = 'Error';
                setTimeout(() => { copyMdButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width=\"12\" height=\"12\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71\"></path><path d=\"M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71\"></path></svg>'; }, 1500);
            });
        };
        footerElement.appendChild(copyMdButton);
    }
    // Add elements specific to user messages
    else if (type === 'user') {
        const copyPromptButton = document.createElement('button');
        copyPromptButton.classList.add('copy-prompt-btn', 'action-btn');
        copyPromptButton.title = 'Copy prompt';
        // Re-use the same copy icon as bot messages
        copyPromptButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
        copyPromptButton.onclick = () => {
            const rawContent = messageWrapper.dataset.rawContent || '';
            if (!rawContent) {
                 console.warn("Copy prompt clicked, but data-raw-content is empty for message:", messageWrapper.id);
                 // Attempt fallback to innerText just in case
                 const fallbackContent = messageWrapper.querySelector('.content')?.innerText || '';
                 if (!fallbackContent) return; // Nothing to copy
                 navigator.clipboard.writeText(fallbackContent).then(() => { /* ... feedback ... */ }).catch(err => { /* ... error ... */ });
                 return;
            }
            navigator.clipboard.writeText(rawContent).then(() => {
                copyPromptButton.innerHTML = 'Copied!';
                setTimeout(() => { copyPromptButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>'; }, 1500);
            }).catch(err => {
                console.error('Failed to copy prompt:', err);
                copyPromptButton.innerHTML = 'Error';
                 setTimeout(() => { copyPromptButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>'; }, 1500);
            });
        };
        footerElement.appendChild(copyPromptButton);
    }

    // Add footer to message wrapper
    messageWrapper.appendChild(footerElement);

    return messageWrapper;
}

// Render a single message object into the chat history
ui.renderMessage = function(message) {
    // Find or create the message element
    let messageWrapper = document.getElementById(`message-${message.id}`);
    let contentElement;

    if (!messageWrapper) {
         // Assume message.role is 'user' or 'assistant' (map 'assistant' to 'bot' for UI)
         const type = message.role === 'user' ? 'user' : 'bot';
         messageWrapper = ui.createMessageElement(type, message.id, message.model_id);
         if (!chatHistory) return; // Exit if chatHistory isn't available
         chatHistory.appendChild(messageWrapper);
         contentElement = messageWrapper.querySelector('.content');
    } else {
        contentElement = messageWrapper.querySelector('.content');
    }

    // Set the raw content attribute, which the copy button will use
    messageWrapper.dataset.rawContent = message.content || '';

    // Update content using marked
    if (contentElement) {
        try {
            contentElement.innerHTML = marked.parse(message.content || '');
        } catch (error) {
            console.error('Error parsing markdown content:', error);
            contentElement.textContent = message.content || ''; // Fallback to text content
        }
    } else {
         console.warn("Could not find content element for message:", message.id);
    }


    // Update timestamp and potentially model info in the footer
    const timestampElement = messageWrapper.querySelector('.message-footer .timestamp');
    if (timestampElement) {
        const timeString = new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        timestampElement.dataset.timestamp = message.created_at; // Update full timestamp

        // Clear existing content except the time text node
        let textNode = timestampElement.firstChild;
        while (textNode && textNode.nodeType !== Node.TEXT_NODE) {
            textNode.remove(); // Remove elements like old model info
            textNode = timestampElement.firstChild;
        }
         if (textNode) {
             textNode.nodeValue = timeString; // Update time
         } else {
              timestampElement.appendChild(document.createTextNode(timeString)); // Add time if missing
         }


        // If it's a bot message and has a model_id, add/update the model info
        if (message.role === 'assistant' && message.model_id) {
             timestampElement.appendChild(document.createTextNode(' - ')); // Add separator
             ui.addModelInfo(timestampElement, message.model_id);
        }
    }

    // Update token count if it's an assistant message and tokens are provided
    if (message.role === 'assistant') {
        const tokenSpan = messageWrapper.querySelector('.token-count');
        if (tokenSpan && message.tokens_used != null) {
            tokenSpan.textContent = `Tokens: ${message.tokens_used}`;
            tokenSpan.style.display = 'inline';
        } else if (tokenSpan) {
             tokenSpan.style.display = 'none'; // Hide if no token info
        }
    }

    // Apply syntax highlighting to code blocks within the newly rendered content
    contentElement.querySelectorAll('pre code').forEach((block) => {
         try {
             if (typeof hljs !== 'undefined') {
                 hljs.highlightElement(block);
             }
         } catch (e) {
             console.error("Highlight.js error:", e);
         }
     });

    // Scroll to the bottom only if the message is the last one (or nearly last)
    // Avoid scrolling if rendering historical messages further up
    // Consider adding logic here if needed, maybe based on whether it's the last message in the fetch batch
}

// Add system message to chat (uses createMessageElement structure)
ui.addSystemMessage = function(content, type = 'info') { // Added type parameter back
    // Create a system message element similar to renderMessage
    const messageWrapper = document.createElement('div');
    messageWrapper.classList.add('message', 'system-message');
    messageWrapper.id = `message-system-${Date.now()}`;

    const contentElement = document.createElement('div');
    contentElement.classList.add('content');
    contentElement.textContent = content;
    messageWrapper.appendChild(contentElement);

     // Add simple timestamp footer for system messages
     const footerElement = document.createElement('div');
     footerElement.classList.add('message-footer');
     const timestampElement = document.createElement('span');
     timestampElement.classList.add('timestamp');
     timestampElement.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
     footerElement.appendChild(timestampElement);
     messageWrapper.appendChild(footerElement);

    if(chatHistory) {
        chatHistory.appendChild(messageWrapper);
        // Scroll to bottom
         requestAnimationFrame(() => {
             requestAnimationFrame(() => {
                chatHistory.scrollTop = chatHistory.scrollHeight;
            });
        });
    } else {
        console.error("chatHistory element not found, cannot add system message to UI.");
    }


    // Also log to console as before
    console.log(`[System Message - ${type}]: ${content}`);
}

// Update the UI with user information
ui.updateUserUI = function(user) {
    if (!user) return;

    // Update user name display
    if (userNameElement) {
        const displayName = (user.first_name && user.last_name) ?
            `${user.first_name} ${user.last_name}` : user.username;
        userNameElement.textContent = displayName;
    }

    // Update role display
    if (userRoleElement) {
        // Check if user.role exists and has a name property
        const roleName = (user.role && user.role.name) ? user.role.name : 'User';
        userRoleElement.textContent = roleName.charAt(0).toUpperCase() + roleName.slice(1); // Capitalize role name
    }

    // Update avatar
    if (userAvatarElement) {
        const firstLetter = (user.first_name && user.first_name.length > 0) ?
            user.first_name.charAt(0).toUpperCase() :
            (user.username ? user.username.charAt(0).toUpperCase() : 'U');
        userAvatarElement.textContent = firstLetter;
    }

    // Show admin link if the user is an admin
    const adminLink = document.getElementById('admin-link');
    if (adminLink) {
        // Check role name (case-insensitive comparison for robustness)
        if (user.role && user.role.name && user.role.name.toLowerCase() === 'admin') {
            adminLink.style.display = 'inline-block'; // Or 'block' depending on styling
        } else {
            adminLink.style.display = 'none';
        }
    }
}

// --- UI Helpers ---

// Helper function to add or update model info in the timestamp span
ui.addModelInfo = function(timestampElement, model_id) {
    // Find existing model info span within the timestamp span
    let modelInfo = timestampElement.querySelector('.model-info');

    // If it doesn't exist, create it
    if (!modelInfo) {
        modelInfo = document.createElement('span');
        modelInfo.classList.add('model-info');
        // Append the span to the timestamp element
        timestampElement.appendChild(modelInfo);
    }

    // Set or update content
    const model = modelsList.find(m => m.id == model_id);
    const modelName = model ? model.name : `Model #${model_id}`;
    // Ensure we set the text content of the span itself
    modelInfo.textContent = `Generated by ${modelName}`;
    return modelInfo; // Return the span in case it's needed
}


// Helper to ensure thinking box exists and return its text element
ui.ensureThinkingBoxExists = function(messageElement) {
    let thinkingElement = messageElement.querySelector('.thinking-content'); // Use local var
    if (!thinkingElement) {
        // console.log('[Debug] Creating thinking box structure.');
        thinkingElement = document.createElement('div');
        thinkingElement.classList.add('thinking-content');
        const thinkingLabel = document.createElement('div');
        thinkingLabel.classList.add('thinking-label');
        thinkingLabel.innerHTML = '<span class="thinking-icon">⚙️</span> AI Thinking Process';
        thinkingElement.appendChild(thinkingLabel);
        const thinkingContentEl = document.createElement('div');
        thinkingContentEl.classList.add('thinking-content-text');
        thinkingElement.appendChild(thinkingContentEl);
        const mainContentElement = messageElement.querySelector('.content');
        if (mainContentElement) {
            // Insert thinking box *before* the main content element
            messageElement.insertBefore(thinkingElement, mainContentElement);
        } else {
            console.error('[Debug] Could not find .content to insert thinking box before.');
            // Fallback: append to the message wrapper if .content is missing
            messageElement.appendChild(thinkingElement);
        }
    }
    // Return the specific text element inside the thinking box
    return thinkingElement.querySelector('.thinking-content-text');
}

let thinkingIndicatorTimeout = null;

// Show or hide the thinking indicator
ui.showThinkingIndicator = function(show) {
    // Always try to remove any existing indicator first
    const existingIndicator = document.getElementById('thinking-indicator');
    if (existingIndicator) {
        console.log("[UI showThinkingIndicator] Removing existing indicator.");
        existingIndicator.remove();
    }

    // If we are showing the indicator, create and append a new one
    if (show) {
        console.log(`[UI showThinkingIndicator] Called with show = true. Creating and appending new indicator.`);
        const indicator = document.createElement('div');
        indicator.id = 'thinking-indicator';
        indicator.classList.add('thinking-indicator');
        indicator.innerHTML = `<span>.</span><span>.</span><span>.</span>`; // Simpler dots

        // Insert the indicator at the end of the chat history
        if (chatHistory) {
            chatHistory.appendChild(indicator);
            console.log("[UI showThinkingIndicator] Appended new indicator.");
            // Make it visible immediately
            indicator.style.display = 'flex';

            // Scroll down to show it - deferred
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    if(chatHistory) chatHistory.scrollTop = chatHistory.scrollHeight;
                });
            });

            // Optional: Timeout to hide if no response received
            clearTimeout(thinkingIndicatorTimeout);
            thinkingIndicatorTimeout = setTimeout(() => {
                console.log("[UI showThinkingIndicator] Hiding indicator due to timeout.");
                const currentIndicator = document.getElementById('thinking-indicator');
                if (currentIndicator) currentIndicator.remove(); // Remove on timeout
                console.warn('Thinking indicator timed out.');
            }, 30000); // 30-second timeout

        } else {
            console.error("chatHistory element not found, cannot show thinking indicator.");
            return; // Exit if we can't add it
        }
    } else {
        // If hiding, we already removed any existing one at the start.
        console.log(`[UI showThinkingIndicator] Called with show = false. Indicator already removed.`);
        // Clear any pending timeout
        clearTimeout(thinkingIndicatorTimeout);
    }
}


// --- User Interaction Functions ---

/**
 * Displays a generic confirmation dialog.
 * @param {string} title - The title for the dialog.
 * @param {string} message - The confirmation message text.
 * @param {function(HTMLElement): void} onConfirm - Callback function executed when confirm is clicked. It receives the dialog element as an argument.
 */
ui.showConfirmationDialog = function(title, message, onConfirm) {
    // Remove any existing confirmation dialogs first
    const existingDialog = document.querySelector('.delete-confirmation');
    if (existingDialog) {
        existingDialog.remove();
    }

    // Create confirmation dialog elements
    const confirmationEl = document.createElement('div');
    confirmationEl.classList.add('delete-confirmation'); // Reuse existing class for styling

    const contentEl = document.createElement('div');
    contentEl.classList.add('delete-confirmation-content');

    const titleEl = document.createElement('div');
    titleEl.classList.add('delete-title'); // Reuse class
    titleEl.textContent = title; // Use passed title

    const messageEl = document.createElement('div');
    messageEl.classList.add('delete-message'); // Reuse class
    messageEl.textContent = message; // Use passed message

    const actionsEl = document.createElement('div');
    actionsEl.classList.add('delete-actions'); // Reuse class

    const cancelBtn = document.createElement('button');
    cancelBtn.classList.add('cancel-btn'); // Reuse class
    cancelBtn.textContent = 'Cancel';
    cancelBtn.onclick = () => {
        confirmationEl.classList.remove('visible');
        // Allow transition to finish before removing
        setTimeout(() => confirmationEl.remove(), 300);
    };

    const confirmBtn = document.createElement('button');
    confirmBtn.classList.add('delete-btn'); // Reuse class - maybe rename class later?
    confirmBtn.textContent = 'Confirm';
    confirmBtn.onclick = () => {
        // Call the provided confirmation callback
        if (typeof onConfirm === 'function') {
            onConfirm(confirmationEl); // Pass the element for potential removal in callback
        }
         // Optionally hide immediately, or let the callback handle removal
         // confirmationEl.classList.remove('visible');
         // setTimeout(() => confirmationEl.remove(), 300);
    };

    actionsEl.appendChild(cancelBtn);
    actionsEl.appendChild(confirmBtn);

    contentEl.appendChild(titleEl);
    contentEl.appendChild(messageEl);
    contentEl.appendChild(actionsEl);

    confirmationEl.appendChild(contentEl);
    document.body.appendChild(confirmationEl);

    // Trigger visibility with a slight delay for transition
    requestAnimationFrame(() => {
         requestAnimationFrame(() => {
            confirmationEl.classList.add('visible');
        });
    });
}

// Remove the old function (or keep as a wrapper if preferred)
/*
function showDeleteConfirmation(chatId, chatTitle) {
    showConfirmationDialog(
        'Delete Chat?',
        `Are you sure you want to permanently delete the chat "${chatTitle || 'Untitled Chat'}"? This cannot be undone.`,
        (confirmationEl) => confirmDeleteChat(chatId, chatTitle, confirmationEl)
    );
}
*/

// --- Notification Function --- */
/**
 * Displays a temporary notification tile in the top-right corner.
 * @param {string} message - The message to display.
 * @param {string} type - 'info', 'error', or 'success' (default: 'success').
 */
ui.showNotification = function(message, type = 'success') {
    const container = document.getElementById('notification-container');
    if (!container) {
        console.error("Notification container not found!");
        return;
    }

    const tile = document.createElement('div');
    tile.classList.add('notification-tile');
    const textSpan = document.createElement('span');
    textSpan.textContent = message;
    tile.appendChild(textSpan);

    // Apply type styling
    if (type === 'error') {
        tile.classList.add('error');
    } else if (type === 'info') {
        tile.classList.add('info');
    } else { // 'success' or default
        // Uses default green style
    }

    // Add to container
    container.appendChild(tile);

    // Make it visible (triggers transition)
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            tile.classList.add('visible');
        });
    });

    // Auto-dismiss after a delay
    const dismissDelay = 5000; // 5 seconds
    const fadeOutDelay = dismissDelay - 500; // Start fade out before removing

    const timeoutId = setTimeout(() => {
        tile.classList.remove('visible');
        // Remove from DOM after transition
        setTimeout(() => tile.remove(), 500);
    }, dismissDelay);

    // Allow clicking to dismiss early
    tile.onclick = () => {
        clearTimeout(timeoutId); // Cancel auto-dismiss
        tile.classList.remove('visible');
        setTimeout(() => tile.remove(), 500);
    };
}

// --- Utility Functions ---
// ... existing code ...

/**
 * Adds a message element directly to the UI, typically for optimistic updates.
 * @param {string} type - 'user' or 'bot'.
 * @param {string} content - The raw message content.
 * @param {string|null} tempId - A temporary ID for the element before confirmation (optional).
 */
ui.addMessageToUI = function(type, content, tempId = null) {
    if (!chatHistory) {
        console.error("chatHistory element not found, cannot add message to UI.");
        return;
    }

    // Use existing function to create the basic structure
    // Pass null for model_id for user messages
    const messageWrapper = ui.createMessageElement(type, tempId, null);

    // Find the content element within the created wrapper
    const contentElement = messageWrapper.querySelector('.content');

    if (contentElement) {
        // Set the raw content attribute, crucial for user message copy
         messageWrapper.dataset.rawContent = content;

        // Render the content (assuming simple text for optimistic user message)
        // If markdown rendering is needed here, use marked.parse(content)
        contentElement.textContent = content;
    } else {
        console.warn("Could not find content element in newly created message wrapper.");
    }

    // Append the new message to the chat history
    chatHistory.appendChild(messageWrapper);

    // Scroll to the bottom to show the new message
    requestAnimationFrame(() => {
         requestAnimationFrame(() => {
            chatHistory.scrollTop = chatHistory.scrollHeight;
        });
    });

    console.log(`[UI] Added optimistic ${type} message to UI.`);
}

/**
 * Displays an error message within the chat history area.
 * @param {number|string} chatId - The ID of the chat this error belongs to (used for potential context, though not directly used for rendering here).
 * @param {string} errorMessage - The text of the error message to display.
 */
ui.displayChatError = function(chatId, errorMessage) {
    console.error(`[Chat Error - Chat ID: ${chatId}] ${errorMessage}`);

    if (!chatHistory) {
        console.error("chatHistory element not found, cannot display error message in UI.");
        // Fallback: Use a general notification if chat history isn't available
        ui.showNotification(`Error: ${errorMessage}`, 'error');
        return;
    }

    // Check if this specific error message is already displayed to avoid duplicates rapidly
    const existingErrors = chatHistory.querySelectorAll('.error-message .content');
    const alreadyShown = Array.from(existingErrors).some(el => el.textContent.includes(errorMessage));
    if (alreadyShown) {
        console.warn("Duplicate error message detected, skipping display:", errorMessage);
        return;
    }

    // Create the error message element
    const errorWrapper = document.createElement('div');
    errorWrapper.classList.add('message', 'error-message');
    errorWrapper.id = `message-error-${Date.now()}`;

    // Content Area
    const contentElement = document.createElement('div');
    contentElement.classList.add('content');
    // The ::before pseudo-element in CSS adds the "[ERROR] " prefix
    contentElement.textContent = errorMessage;
    errorWrapper.appendChild(contentElement);

    // Footer Area (Timestamp only for errors)
    const footerElement = document.createElement('div');
    footerElement.classList.add('message-footer');
    const timestampElement = document.createElement('span');
    timestampElement.classList.add('timestamp');
    timestampElement.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    footerElement.appendChild(timestampElement);
    errorWrapper.appendChild(footerElement);

    // Add to chat history
    chatHistory.appendChild(errorWrapper);

    // Scroll to the bottom
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            chatHistory.scrollTop = chatHistory.scrollHeight;
        });
    });

    // Also show a notification tile for higher visibility
    ui.showNotification(`Error: ${errorMessage}`, 'error');
}

// Mobile Responsive Helper function - Added for better mobile usability
ui.initMobileToggles = function() {
    // Only execute on mobile/small screens
    const isMobile = window.innerWidth <= 768;

    if (isMobile) {
        // Get all section titles
        const sectionTitles = document.querySelectorAll('.sidebar .title');

        sectionTitles.forEach(title => {
            // Add click event listener
            title.addEventListener('click', function() {
                // Toggle collapsed class on the parent element
                const section = this.nextElementSibling;
                if (section && (section.classList.contains('chats-list') || section.classList.contains('models-list'))) {
                    section.classList.toggle('collapsed');

                    // Toggle visibility
                    if (section.classList.contains('collapsed')) {
                        section.style.maxHeight = '0px';
                        section.style.overflow = 'hidden';
                        this.classList.add('collapsed');
                    } else {
                        section.style.maxHeight = '35vh';
                        section.style.overflow = 'auto';
                        this.classList.remove('collapsed');
                    }
                }
            });
        });
    }
}

// Call the function when the document is loaded
document.addEventListener('DOMContentLoaded', ui.initMobileToggles);
// Also call it on resize events to handle orientation changes
window.addEventListener('resize', ui.initMobileToggles);

// --- Event Listeners Setup ---

ui.setupEventListeners = function() {
    const logoutButton = document.getElementById('logout-button');
    const purgeChatsButton = document.getElementById('purge-chats-button');
    const newChatButton = document.getElementById('new-chat-button');

    if (logoutButton) {
        logoutButton.addEventListener('click', async () => {
            console.log('Logout button clicked');
            try {
                const response = await fetch('/logout', {
                    method: 'POST', // Or GET, depending on backend handler
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });
                if (response.ok) {
                    console.log('Logout successful, redirecting to login...');
                    window.location.href = '/login'; // Redirect to login page
                } else {
                    console.error('Logout failed:', response.status, await response.text());
                    ui.showNotification('Logout failed. Please try again.', 'error');
                }
            } catch (error) {
                console.error('Error during logout:', error);
                ui.showNotification('An error occurred during logout.', 'error');
            }
        });
    }

    if (purgeChatsButton) {
        purgeChatsButton.addEventListener('click', () => {
             ui.showConfirmationDialog(
                'Purge All Chats?',
                'Are you sure you want to permanently delete ALL your chats? This cannot be undone.',
                (confirmationEl) => api.confirmPurgeChats(confirmationEl) // Correct namespace: API call in api.js
            );
        });
    }

    if (newChatButton) {
        newChatButton.addEventListener('click', chat.startNewChat); // Use the namespaced function
    }
}

// --- Sidebar Resizing Logic ---
ui.initializeSidebarResizing = function() {
    const sidebar = document.querySelector('.sidebar');
    const resizer = document.getElementById('sidebar-resizer');
    const chatContainer = document.querySelector('.chat-container');
    const minWidth = parseInt(getComputedStyle(sidebar).minWidth, 10);
    const maxWidth = parseInt(getComputedStyle(sidebar).maxWidth, 10);
    const localStorageKey = 'sidebarWidth';

    let isResizing = false;
    let startX = 0;
    let startWidth = 0;

    // Load saved width on initialization
    const savedWidth = localStorage.getItem(localStorageKey);
    if (savedWidth) {
        const newWidth = Math.max(minWidth, Math.min(maxWidth, parseInt(savedWidth, 10)));
        sidebar.style.flexBasis = `${newWidth}px`;
    }

    resizer.addEventListener('mousedown', (e) => {
        isResizing = true;
        startX = e.clientX;
        startWidth = sidebar.offsetWidth;
        // Prevent text selection during resize
        document.body.style.userSelect = 'none';
        document.body.style.pointerEvents = 'none'; // Disable pointer events on underlying elements
        resizer.style.backgroundColor = 'var(--accent-color)'; // Highlight during drag

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    });

    function handleMouseMove(e) {
        if (!isResizing) return;

        const currentX = e.clientX;
        const diffX = currentX - startX;
        let newWidth = startWidth + diffX;

        // Clamp width between min and max
        newWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));

        sidebar.style.flexBasis = `${newWidth}px`;
        // Optionally, add real-time adjustments to chat container if needed,
        // but flexbox should handle it automatically.
    }

    function handleMouseUp() {
        if (isResizing) {
            isResizing = false;
            document.body.style.userSelect = ''; // Re-enable text selection
            document.body.style.pointerEvents = '';
            resizer.style.backgroundColor = ''; // Reset handle color

            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);

            // Save the final width
            localStorage.setItem(localStorageKey, sidebar.offsetWidth.toString());
        }
    }
}
// --- End Sidebar Resizing Logic ---

// Initialize the UI
ui.initializeUI = function() {
    ui.initializeSidebarResizing(); // Add this call
    // ... existing code ...
}

// Expose ui namespace globally
window.ui = ui;

// Call initialization
document.addEventListener('DOMContentLoaded', ui.initializeUI);