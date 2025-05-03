// ui/static/js/ui.js - UI Rendering and DOM Manipulation Functions

// Create a namespace for UI functions
const ui = {};

// --- DOM Element References (Assume these are available globally from chat.js) ---
// Note: Some IDs might change based on the new HTML structure. Verify in chat.js.
// const chatHistory = document.getElementById('chat-history');
// const modelsListContainer = document.getElementById('models-list'); // Now a UL
// const chatsListContainer = document.getElementById('chats-list'); // Now a UL
// const newChatButton = document.getElementById('new-chat-button'); // Now an A tag inside LI
// const chatTitle = document.getElementById('chat-title'); // Now an H1
// const userNameElement = document.querySelector('.user-name');
// const userRoleElement = document.querySelector('.user-role');
// const userAvatarElement = document.querySelector('.user-avatar');
const activeModelIndicator = document.getElementById('active-model-indicator'); // New element

// --- State Variables (Assume these are available globally from chat.js) ---
// let modelsList = [];
// let chatsList = [];
// let activeModel = null;
// let currentChatId = null;

// --- UI Rendering Functions ---

// Render the PROVIDER select dropdown based on the fetched models
ui.renderProviderSelect = function() {
    // Uses the global modelsList from chat.js
    const providerSelect = document.getElementById('provider-select');
    if (!providerSelect) {
        console.error("Provider select dropdown not found.");
        return;
    }

    console.log(`Rendering providers from ${modelsList.length} models.`);

    // Clear existing options (except the default "Select Provider")
    const defaultOption = providerSelect.options[0]; // Assume first is default
    providerSelect.innerHTML = ''; // Clear
    if (defaultOption) providerSelect.appendChild(defaultOption); // Add default back

    // --- UPDATED: Extract provider name from model name --- 
    const providers = modelsList.reduce((acc, model) => {
        // Extract provider name from parentheses in model.name
        const match = model.name?.match(/\(([^)]+)\)/);
        const providerName = match ? match[1] : model.provider_type; // Fallback to provider_type if no match
        const providerKey = providerName || 'Unknown'; // Use a key for grouping

        if (!acc[providerKey]) {
            acc[providerKey] = { 
                id: providerKey, // Use the extracted name/type as the ID for selection
                name: providerKey // Display name
            };
        }
        return acc;
    }, {});
    // --- END UPDATE --- 

    // Sort providers alphabetically by name
    const sortedProviders = Object.values(providers).sort((a, b) => {
        return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    });

    // Populate provider select
    sortedProviders.forEach(provider => {
        const option = document.createElement('option');
        option.value = provider.id;
        option.textContent = provider.name;
        providerSelect.appendChild(option);
    });

    console.log("Provider dropdown populated.");
}

// Populate the MODEL select dropdown based on the selected provider
ui.populateModelSelect = function(providerId, initialModelId = null) {
    const modelSelect = document.getElementById('model-select');
    if (!modelSelect) {
        console.error("Model select dropdown not found.");
        return;
    }

    // Clear existing options (except the default)
    const defaultOption = modelSelect.options[0]; // Assume first is default
    modelSelect.innerHTML = ''; // Clear
    if (defaultOption) {
         modelSelect.appendChild(defaultOption);
         // Update default option text based on whether a provider is selected
         defaultOption.textContent = providerId ? 'Select Model' : 'Select Provider First';
    }

    modelSelect.disabled = true; // Disable initially

    if (!providerId) {
        console.log("No provider selected, model dropdown cleared and disabled.");
        modelSelect.value = ''; // Ensure value is cleared
        // Trigger Alpine refresh for disabled state
        modelSelect.dispatchEvent(new Event('change'));
        return; // Do nothing further if no provider is selected
    }

    // --- UPDATED: Filter models based on provider name extracted from model.name ---
    const filteredModels = modelsList.filter(m => {
        const match = m.name?.match(/\(([^)]+)\)/);
        const modelProviderName = match ? match[1] : m.provider_type; // Extract or fallback
        return modelProviderName === providerId;
    });
    // --- END UPDATE ---

    if (filteredModels.length === 0) {
        console.log(`No models found for provider type: ${providerId}`);
        if(defaultOption) defaultOption.textContent = 'No models for provider';
        modelSelect.value = ''; // Ensure value is cleared
        // Trigger Alpine refresh for disabled state
        modelSelect.dispatchEvent(new Event('change'));
        return; // Keep disabled
    }

    // Sort models alphabetically by name
    filteredModels.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));

    // Populate model select
    filteredModels.forEach(model => {
        const option = document.createElement('option');
        option.value = model.id;
        option.textContent = model.name;
        modelSelect.appendChild(option);
    });

    // Re-enable the select
    modelSelect.disabled = false;

    // Set the initially selected model if provided and found
    const modelExists = filteredModels.some(m => m.id == initialModelId);
    if (initialModelId && modelExists) {
        modelSelect.value = initialModelId;
    } else {
        // If no initialModelId or it wasn't found for this provider, ensure value is cleared
        modelSelect.value = '';
        // Clear activeModel in global state if initial selection is invalid
        if (activeModel == initialModelId) {
            activeModel = null;
            localStorage.removeItem('activeModelId');
        }
    }

    console.log(`Model dropdown populated for provider type: ${providerId}. Initial model ID: ${initialModelId}`);
    // Trigger Alpine refresh after population and potential selection
    modelSelect.dispatchEvent(new Event('change'));
    ui.updateActiveModelUI(); // Update header indicator
}

// Update active model indicator in chat header
ui.updateActiveModelIndicator = function() {
    if (!activeModelIndicator) return;
    console.log(`[UI Update] Updating header indicator. Current activeModel ID: ${activeModel}`);

    const selectedModel = modelsList.find(m => m.id == activeModel);
    if (selectedModel) {
        activeModelIndicator.textContent = `${selectedModel.name}`;
        
        // --- UPDATED: Extract provider name from model name --- 
        const match = selectedModel.name?.match(/\(([^)]+)\)/);
        const providerName = match ? match[1] : (selectedModel.provider_type || 'N/A');
        // --- END UPDATE ---
        
        activeModelIndicator.title = `Using ${selectedModel.name} (Provider: ${providerName})`;
        activeModelIndicator.style.display = 'inline-block'; // Show it
        console.log(`[UI Update] Active model indicator updated: ${selectedModel.name} (ID: ${activeModel})`);
    } else {
        activeModelIndicator.textContent = 'No Model Selected';
        activeModelIndicator.title = 'Select a model from the sidebar';
        activeModelIndicator.style.display = 'inline-block'; // Show placeholder
        console.log(`[UI Update] No active model or model not found.`);
    }
}

// Update UI to reflect active model selection (Now only updates the header indicator)
ui.updateActiveModelUI = function() {
    // Dropdown UI state is managed by Alpine.js x-model and @change handlers in index.html.
    // This function just ensures the header indicator reflects the global `activeModel` state.
    ui.updateActiveModelIndicator();
}

// Render the chats list in the sidebar
ui.renderChatsList = function(chats) {
    if (!chatsListContainer) return;

    const newChatListItem = chatsListContainer.querySelector('#new-chat-button')?.closest('li'); // Find the LI containing the button

    // Clear existing chat items (excluding the "New Chat" button's LI)
    const existingItems = chatsListContainer.querySelectorAll('li:not(:first-child)'); // Assumes New Chat is always first
    existingItems.forEach(item => item.remove());

    // Add each chat to the list
    chats.forEach(chat => {
        const chatListItem = document.createElement('li');

        const chatLink = document.createElement('a');
        chatLink.href = '#'; // Prevent page jump
        chatLink.dataset.chatId = chat.id;
        chatLink.className = 'chat-badge';

        // Active state styling managed by updateActiveChatUI

        // Icon/Indicator (Example: using a generic chat bubble)
        const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="h-5 w-5 shrink-0 text-on-surface/60 group-hover:text-primary"><path fill-rule="evenodd" d="M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16ZM4.75 7.75a.75.75 0 0 0 0 1.5h8.5a.75.75 0 0 0 0-1.5h-8.5ZM6 11.25a.75.75 0 0 1 .75-.75h6.5a.75.75 0 0 1 0 1.5h-6.5a.75.75 0 0 1-.75-.75Z" clip-rule="evenodd" /></svg>`;
        chatLink.innerHTML = icon;

        // Chat Title Span
        const titleSpan = document.createElement('span');
        titleSpan.className = 'truncate chat-title-text'; // Keep class for potential targeting
        titleSpan.textContent = chat.title || 'Untitled Chat';
        chatLink.appendChild(titleSpan);

        // Click handler for selecting chat
        chatLink.addEventListener('click', (e) => {
            e.preventDefault(); // Prevent '#' navigation
            console.log(`[UI] Chat item clicked: ${chat.id}`);
            if (currentChatId !== chat.id) {
                api.loadChat(chat.id);
            } else {
                console.log(`[UI] Clicked on already active chat (${chat.id}), no action needed.`);
            }
             // Optionally close sidebar on mobile after selection
             if (window.innerWidth < 1024) { // lg breakpoint
                 const alpineData = chatLink.closest('[x-data]');
                 if (alpineData && alpineData.__x) {
                      alpineData.__x.$data.showSidebar = false;
                 }
             }
        });

        // Add delete button (absolutely positioned within the link/li)
        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded text-on-surface/50 opacity-0 group-hover:opacity-100 hover:text-danger hover:bg-surface-alt focus:opacity-100 focus:text-danger focus:bg-surface-alt transition-opacity';
        deleteBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>';
        deleteBtn.title = 'Delete chat';
        deleteBtn.addEventListener('click', (e) => {
            e.preventDefault(); // Prevent link navigation
            e.stopPropagation(); // Prevent chat selection handler
            ui.showConfirmationDialog(
                'Delete Chat?',
                `Are you sure you want to permanently delete the chat "${chat.title || 'Untitled Chat'}"? This cannot be undone.`,
                (confirmationEl) => api.confirmDeleteChat(chat.id, chat.title, confirmationEl)
            );
        });
        chatLink.appendChild(deleteBtn); // Append button to the link

        chatListItem.appendChild(chatLink);

        // Add to container (insert after the "New Chat" button's LI)
        if (newChatListItem && newChatListItem.parentNode) {
            newChatListItem.parentNode.insertBefore(chatListItem, newChatListItem.nextSibling);
        } else {
            chatsListContainer.appendChild(chatListItem); // Fallback if "New Chat" isn't found
        }
    });

    // Update active chat styling
    ui.updateActiveChatUI();
}

// Update UI to reflect active chat selection
ui.updateActiveChatUI = function() {
    document.querySelectorAll('#chats-list li a[data-chat-id]').forEach(link => {
        if (link.dataset.chatId == currentChatId) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });
}

// Clear all messages from the chat history
ui.clearChatHistory = function() {
    if (!chatHistory) return;
    // Preserve system message "Welcome to CyberAI Terminal" if desired
    const welcomeMessage = chatHistory.querySelector('.system-message .content')?.textContent.includes("Welcome to CyberAI");
    chatHistory.innerHTML = ''; // Clear all messages
    if (welcomeMessage) {
         // Re-add a simplified welcome message structure
         ui.addSystemMessage("Welcome to CyberAI Terminal. Select a model and start chatting.");
    }
}

// Helper function to create message elements (used by renderMessage and handleAssistantChunk)
ui.createMessageElement = function(type, message_id, model_id = null) {
    const messageWrapper = document.createElement('div');
    // Swap backgrounds: User messages match page bg but have border, Bot messages use alt bg.
    messageWrapper.className = `message p-4 rounded-lg shadow-sm ${type === 'user' ? 'bg-surface border border-outline/30' : 'bg-surface-alt'} ${type}-message`;
    if (message_id) {
         messageWrapper.id = `message-${message_id}`;
    }
    if (model_id) {
        messageWrapper.dataset.modelId = model_id;
    }

    // Content Area - Remove prose classes for more direct control
    const contentElement = document.createElement('div');
    contentElement.className = 'content'; // Remove prose classes
    messageWrapper.appendChild(contentElement);

    // Initialize raw content storage/attribute
    if (type === 'bot') {
        contentElement._rawContent = ''; // Internal storage for streaming
        messageWrapper.dataset.rawContent = ''; // Attribute for copy button
    } else if (type === 'user') {
        messageWrapper.dataset.rawContent = ''; // Initialize attribute
    }

    // Footer Area (Flex layout)
    const footerElement = document.createElement('div');
    footerElement.className = 'message-footer mt-2 flex items-center justify-between text-xs text-on-surface/60';

    // Timestamp & Model/User Info Container
    const timeInfoContainer = document.createElement('div');
    timeInfoContainer.className = 'flex items-center gap-x-1.5'; // Use flex for timestamp + badge/model

    const timestampElement = document.createElement('span');
    timestampElement.className = 'timestamp';
    timestampElement.dataset.timestamp = new Date().toISOString();
    timestampElement.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    timeInfoContainer.appendChild(timestampElement);

    if (type === 'bot' && model_id) {
        // Model info is added later by renderMessage or handleAssistantChunk using addModelInfo
        // Add a placeholder for the separator now for consistent layout
        const separatorSpan = document.createElement('span');
        separatorSpan.className = 'mx-1 model-separator hidden'; // Start hidden
        separatorSpan.textContent = '·';
        timeInfoContainer.appendChild(separatorSpan);
        const modelBadgeSpan = document.createElement('span');
        modelBadgeSpan.className = 'model-badge hidden'; // Start hidden
        timeInfoContainer.appendChild(modelBadgeSpan);
    } else if (type === 'user') {
        // Add User Badge using Penguin UI classes (Soft Color Default)
        const userBadge = document.createElement('span');
        userBadge.className = 'user-badge inline-flex items-center rounded-md bg-surface-alt px-1.5 py-0.5 text-xs font-medium text-on-surface ring-1 ring-inset ring-outline';
        userBadge.textContent = 'You';
        timeInfoContainer.appendChild(userBadge); // Append badge after timestamp
    }
    footerElement.appendChild(timeInfoContainer);

    // Actions Container (Copy buttons, Token count)
    const actionsContainer = document.createElement('div');
    actionsContainer.className = 'flex items-center space-x-2';

    // Add elements specific to bot messages
    if (type === 'bot') {
        const tokenSpan = document.createElement('span');
        tokenSpan.className = 'token-count hidden mr-2'; // Initially hidden
        actionsContainer.appendChild(tokenSpan);

        // Action Buttons (Copy Text, Copy Markdown) - Use Penguin button styling
        const copyTextButton = ui.createActionButton('Copy text', '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>');
        copyTextButton.onclick = () => ui.handleCopy(copyTextButton, messageWrapper.querySelector('.content')?.innerText || '', 'Copied Text!');
        actionsContainer.appendChild(copyTextButton);

        const copyMdButton = ui.createActionButton('Copy raw Markdown', '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>');
        copyMdButton.onclick = () => ui.handleCopy(copyMdButton, messageWrapper.dataset.rawContent || '', 'Copied MD!');
        actionsContainer.appendChild(copyMdButton);

    } else if (type === 'user') { // User message actions
        const copyPromptButton = ui.createActionButton('Copy prompt', '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>');
        copyPromptButton.onclick = () => ui.handleCopy(copyPromptButton, messageWrapper.dataset.rawContent || messageWrapper.querySelector('.content')?.innerText || '', 'Copied Prompt!');
        actionsContainer.appendChild(copyPromptButton);
    }

    footerElement.appendChild(actionsContainer); // Add actions to the footer

    messageWrapper.appendChild(footerElement); // Add footer to wrapper

    return messageWrapper;
}

// Helper to create consistent action buttons
ui.createActionButton = function(title, svgIcon) {
    const button = document.createElement('button');
    button.type = 'button';
    // Use subtle styling from Penguin examples (adjust as needed)
    button.className = 'p-1 rounded text-on-surface/60 hover:text-primary hover:bg-surface-alt focus:outline-none focus:ring-1 focus:ring-primary focus:ring-offset-1 focus:ring-offset-surface';
    button.title = title;
    button.innerHTML = svgIcon;
    // Store original icon for restoring after feedback
    button.dataset.originalIcon = svgIcon;
    return button;
}

// Helper to handle clipboard copy and feedback
ui.handleCopy = function(buttonElement, textToCopy, successMessage) {
     if (!textToCopy) {
         console.warn("Copy clicked, but no text provided for:", buttonElement.title);
                 return;
            }
    navigator.clipboard.writeText(textToCopy).then(() => {
        const originalIcon = buttonElement.dataset.originalIcon;
        // Checkmark icon for success feedback
        buttonElement.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
        buttonElement.title = successMessage; // Update title briefly
        setTimeout(() => {
             buttonElement.innerHTML = originalIcon; // Restore original icon
             buttonElement.title = title; // Restore original title
         }, 1500);
            }).catch(err => {
        console.error(`Failed to copy (${buttonElement.title}):`, err);
        // Error icon (optional)
        // buttonElement.innerHTML = '<svg>...</svg>'; // Error icon
        // ui.showNotification(`Error copying ${buttonElement.title}`, 'error');
    });
}


// Render a single message object into the chat history
ui.renderMessage = function(message) {
    let messageWrapper = document.getElementById(`message-${message.id}`);
    let contentElement;
    let thinkBlockElement = null; // To hold the persistent think block
    let isNew = false;

    // --- Check if message exists, create if not ---
    if (!messageWrapper) {
         const type = message.role === 'user' ? 'user' : 'bot';
         messageWrapper = ui.createMessageElement(type, message.id, message.model_id);
         if (!chatHistory) return;
         chatHistory.appendChild(messageWrapper);
         isNew = true;
    }

    // --- Get main content element ---
    contentElement = messageWrapper.querySelector('.content');
    if (!contentElement) {
        console.warn("Could not find content element for message:", message.id);
        // Attempt to recover or create if absolutely necessary, but this indicates an issue
        // For now, let's bail if it's missing after creation/finding
        if (isNew) { // If it was just created and missing, remove the wrapper
            messageWrapper.remove();
            console.error("Content element missing immediately after creation for message:", message.id);
            return;
        }
        // If updating an existing message without a content element, log error and stop
        console.error("Content element missing while updating message:", message.id);
        return;
    }

    // --- Process message content ---
    let rawContent = message.content || '';
    messageWrapper.dataset.rawContent = rawContent; // Store raw content always

    let thinkContent = '';
    let mainContent = rawContent;
    let isSearchMessage = false; // For user messages containing search results
    let isSystemSearchResults = false; // For system messages containing search results

    // --- Extract <think> block content ---
    const thinkMatch = rawContent.match(/<think>([\s\S]*?)<\/think>/);
    if (thinkMatch && thinkMatch[1]) {
        thinkContent = thinkMatch[1].trim();
        // Remove the think block (and potentially surrounding newlines) from the main content
        mainContent = rawContent.replace(/<think>[\s\S]*?<\/think>\s*/, '').trim();
        console.log("[Render] Found think block content for message:", message.id);
    }

    // --- Determine message type for special rendering ---
    if (message.role === 'user' && mainContent.includes('\\n\\n--- Search Results ---\\n')) { // Check mainContent now
        isSearchMessage = true;
    } else if (message.role === 'system' && mainContent.startsWith('# Search Results for:')) { // Check mainContent now
        isSystemSearchResults = true;
    }

    // --- ADDED: Preprocess mainContent for \\boxed{} --- (Keep this)
    mainContent = mainContent.replace(/\\boxed\{([^}]+)\}/g, '<span class="boxed-answer">$1</span>');

    // --- Render Persistent Think Block (if content exists) ---
    // Remove any previous persistent block first to avoid duplication on updates
    // messageWrapper.querySelector('.persistent-think-block')?.remove(); // REMOVED - Handled by ID check below

    const thinkingBlockId = `thinking-block-${message.id}`;
    let existingThinkingBlock = document.getElementById(thinkingBlockId);

    if (thinkContent && !existingThinkingBlock) {
        // Only create the block if think content exists AND the block wasn't already created/managed by streaming
        console.log(`[Render] Creating persistent think block for ${thinkingBlockId} (not found).`);
        thinkBlockElement = document.createElement('div');
        thinkBlockElement.id = thinkingBlockId;
        // Use similar styling to the temporary thinking box, but set status to final
        thinkBlockElement.className = 'thinking-block mb-2 p-3 border border-dashed border-outline/50 rounded bg-surface-alt/50';
        thinkBlockElement.dataset.status = 'final'; // Set status to final

        const thinkLabel = document.createElement('div');
        thinkLabel.className = 'think-label text-xs font-semibold text-on-surface/70 mb-1 flex items-center gap-1.5';
        // Use a static icon, not animated
        thinkLabel.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="h-3 w-3 text-primary"><path fill-rule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0ZM8.25 7.5a.75.75 0 0 1 .75.75v2.5h3a.75.75 0 0 1 0 1.5h-3a.75.75 0 0 1-.75-.75V8.25a.75.75 0 0 1 .75-.75Z" clip-rule="evenodd" /></svg> <span class='label-text'>Thinking Process</span>`; // Static label, final text
        thinkBlockElement.appendChild(thinkLabel);

        const thinkContentEl = document.createElement('div');
        thinkContentEl.className = 'think-content-text text-xs prose prose-invert prose-sm max-w-none markdown-content'; // Apply prose and markdown
        try {
            // --- Parse thinkContent as markdown ---
            thinkContentEl.innerHTML = marked.parse(thinkContent, { gfm: true, breaks: true });
            ui.setLinksToOpenInNewTab(thinkContentEl); // Make links open in new tab
        } catch (error) {
            console.error('Error parsing markdown for think block:', error);
            thinkContentEl.textContent = thinkContent; // Fallback to raw text
        }
        thinkBlockElement.appendChild(thinkContentEl);

        // Insert the persistent think block *before* the main content element
        contentElement.parentNode?.insertBefore(thinkBlockElement, contentElement);
    } else if (existingThinkingBlock) {
        console.log(`[Render] Found existing thinking block ${thinkingBlockId}. Skipping creation.`);
        // Optionally, ensure its content is up-to-date, although streaming should handle this.
        // Could re-parse `thinkContent` here and set innerHTML as a safety measure if needed.
    } else {
        // No think content, ensure no think block exists (e.g. if message was updated to remove it)
        messageWrapper.querySelector('.thinking-block')?.remove();
    }


    // --- Render Main Content ---
    // Clear previous content before rendering new main content
    contentElement.innerHTML = '';
    let finalHTML = ""; // To hold the parsed HTML for main content

    if (message.role === 'assistant' || isSearchMessage) {
        // Parse main content for assistant messages OR our combined user search message
        try {
            if (isSearchMessage) {
                const parts = mainContent.split('\\n\\n--- Search Results ---\\n');
                const userQueryPart = `<span class="user-prompt-indicator">&gt;</span> ${parts[0].replace(/</g, "&lt;").replace(/>/g, "&gt;")}`;
                const resultsPart = parts.length > 1 ? `\\n\\n--- Search Results ---\\n${parts[1]}` : '';
                const parsedResults = marked.parse(resultsPart, { gfm: true, breaks: true });
                finalHTML = `${userQueryPart}${parsedResults}`;
            } else {
                // Standard assistant message parsing
                finalHTML = marked.parse(mainContent, { gfm: true, breaks: true });
            }
            contentElement.innerHTML = `<div class="markdown-content">${finalHTML}</div>`;
            ui.setLinksToOpenInNewTab(contentElement.querySelector('.markdown-content'));
        } catch (error) {
            console.error('Error parsing markdown content:', error);
            contentElement.innerHTML = `<div class="markdown-content">${mainContent.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>`;
            ui.setLinksToOpenInNewTab(contentElement.querySelector('.markdown-content'));
        }
    } else if (isSystemSearchResults) {
        // Special rendering for system message containing search results
        try {
            // Extract query and results
            const lines = mainContent.split('\\n');
            const titleLine = lines[0] || ''; // e.g., "# Search Results for: ..."
            const queryMatch = titleLine.match(/# Search Results for: (.*)/);
            const query = queryMatch ? queryMatch[1].trim() : 'Search';
            const resultsMarkdown = lines.slice(2).join('\\n'); // Skip title and blank line

            const parsedResultsHTML = marked.parse(resultsMarkdown, { gfm: true, breaks: true });

            // Create collapsible structure with Alpine
            contentElement.innerHTML = `
                <div x-data="{ expanded: false }" class="search-results-container border border-outline/50 rounded bg-surface-alt/50">
                    <button @click="expanded = !expanded" class="flex justify-between items-center w-full p-2 text-sm font-semibold text-on-surface/80 hover:bg-surface-alt">
                        <span>Search Results for: "${window.escapeHtml(query)}"</span>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4 transition-transform duration-200" :class="{ 'rotate-180': expanded }">
                            <path fill-rule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clip-rule="evenodd" />
                        </svg>
                    </button>
                    <div x-show="expanded" x-collapse class="p-3 border-t border-outline/50 markdown-content search-results-content">
                        ${parsedResultsHTML}
                    </div>
                </div>
            `;
            // Add target="_blank" to links within the results
            ui.setLinksToOpenInNewTab(contentElement.querySelector('.search-results-content'));
        } catch (error) {
            console.error('Error parsing system search results:', error);
            contentElement.innerHTML = `<div class="markdown-content text-danger">Error displaying search results.</div>`;
        }
    } else if (message.role === 'user') {
        // Standard user message (already prefixed and escaped if needed)
        // Assuming user messages don't contain markdown that needs parsing
        contentElement.innerHTML = mainContent;
    } else {
         // Handle other roles like standard 'system' (basic rendering)
         contentElement.textContent = mainContent;
    }


    // --- Update Footer (Timestamp, Model Info, Tokens) ---
    const timestampElement = messageWrapper.querySelector('.message-footer .timestamp');
    if (timestampElement) {
        const timeString = new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        timestampElement.dataset.timestamp = message.created_at;
        timestampElement.textContent = timeString;

        const timeInfoContainer = timestampElement.parentNode;
        timeInfoContainer?.querySelector('.model-badge')?.remove();
        timeInfoContainer?.querySelector('span.model-separator')?.remove();

        if (message.role === 'assistant' && message.model_id) {
             if (timeInfoContainer) {
                 ui.addModelInfo(timeInfoContainer, message.model_id);
             } else {
                 console.error('Could not find timeInfoContainer for message:', message.id);
             }
        }
    }

    if (message.role === 'assistant') {
        const tokenSpan = messageWrapper.querySelector('.token-count');
        if (tokenSpan && message.tokens_used != null) {
            // Display character count for now
            tokenSpan.textContent = `${message.tokens_used} chars`;
            tokenSpan.classList.remove('hidden');
        } else if (tokenSpan) {
             tokenSpan.classList.add('hidden');
        }
    }

    // --- Apply Syntax Highlighting & Copy Buttons ---
    // Apply to both main content and think block content
    const codeBlocks = messageWrapper.querySelectorAll('pre code');
    codeBlocks.forEach((block) => {
         try {
             if (typeof hljs !== 'undefined') {
                // Check if already highlighted
                 if (!block.classList.contains('hljs')) {
                 hljs.highlightElement(block);
                 }
             }
         } catch (e) {
             console.error("Highlight.js error:", e);
         }
     });

    // Add copy buttons to code blocks (apply to wrapper to catch both sections)
    ui.addCopyCodeButtons(messageWrapper); // Apply to the whole wrapper


    // --- Scroll Logic ---
    if (isNew) {
        // Use a slight delay to ensure rendering is complete before scrolling
        setTimeout(() => ui.scrollToBottom(chatHistory), 50);
    }

    // --- Update Regenerate Button State ---
    ui.updateRegenerateButtonState();
};

// Add system message to chat
ui.addSystemMessage = function(content, type = 'info') { // type might be used for styling later
    const messageWrapper = document.createElement('div');
    // Simple styling for system messages - USE THE LARGER STYLE
    messageWrapper.className = 'message system-message text-center text-lg text-on-surface/60 py-1 italic'; // Updated classes
    messageWrapper.id = `message-system-${Date.now()}`;

    const contentElement = document.createElement('div');
    contentElement.className = 'content';
    contentElement.textContent = content;
    messageWrapper.appendChild(contentElement);

    // No footer needed for this minimal style, but could add timestamp if desired

    if(chatHistory) {
        chatHistory.appendChild(messageWrapper);
        // Ensure scroll after adding system message
        setTimeout(() => ui.scrollToBottom(chatHistory), 50);
    } else {
        console.error("chatHistory element not found, cannot add system message to UI.");
    }

    console.log(`[System Message - ${type}]: ${content}`);
}


// Update the UI with user information
ui.updateUserUI = function(user) {
    if (!user) return;

    const nameEl = document.querySelector('.user-name');
    const roleEl = document.querySelector('.user-role');
    const avatarEl = document.querySelector('.user-avatar');
    const adminLink = document.getElementById('admin-link');

    if (nameEl) {
        nameEl.textContent = (user.first_name && user.last_name)
            ? `${user.first_name} ${user.last_name}` : user.username;
    }
    if (roleEl) {
        const roleName = (user.role && user.role.name) ? user.role.name : 'User';
        roleEl.textContent = roleName.charAt(0).toUpperCase() + roleName.slice(1);
    }
    if (avatarEl) {
        const firstLetter = (user.first_name?.charAt(0) || user.username?.charAt(0) || '?').toUpperCase();
        avatarEl.textContent = firstLetter;
    }
    if (adminLink) {
        const isAdmin = user.role && user.role.name && user.role.name.toLowerCase() === 'admin';
        adminLink.style.display = isAdmin ? 'inline-block' : 'none';
    }
}

// --- UI Helpers ---

// Helper function to add or update model info in the message footer
ui.addModelInfo = function(containerElement, model_id) {
    // Ensure containerElement is valid
    if (!containerElement) return;

    const model = modelsList.find(m => m.id == model_id);
    // Defensive check in case model is not found
    const modelName = model ? model.name : (model_id ? `Model #${model_id}` : 'Unknown Model');
    
    // --- UPDATED: Extract provider name from model name --- 
    const match = model?.name?.match(/\(([^)]+)\)/);
    const providerName = match ? match[1] : (model?.provider_type || 'Unknown Provider');
    // --- END UPDATE ---

    let modelBadgeSpan = containerElement.querySelector('.model-badge'); // Use a specific class for the badge
    let separatorSpan = containerElement.querySelector('span.model-separator');

    // Create separator if it doesn't exist
    if (!separatorSpan) {
        separatorSpan = document.createElement('span');
        separatorSpan.className = 'mx-1 model-separator';
        separatorSpan.textContent = '·';
        const timestampSpan = containerElement.querySelector('.timestamp');
        timestampSpan?.parentNode?.insertBefore(separatorSpan, timestampSpan.nextSibling);
    }

    // Create model badge span if it doesn't exist
    if (!modelBadgeSpan) {
        modelBadgeSpan = document.createElement('span');
        // Apply Penguin UI primary soft badge classes
        modelBadgeSpan.className = 'model-badge inline-flex items-center rounded-md bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary ring-1 ring-inset ring-primary/30';
        // Append after the separator
        separatorSpan.parentNode?.insertBefore(modelBadgeSpan, separatorSpan.nextSibling);
    }

    // Set the badge text (Model Name) and title (Provider)
    modelBadgeSpan.textContent = modelName;
    modelBadgeSpan.title = `Provider: ${providerName}`; // Use extracted name

    // Ensure visibility
    separatorSpan.style.display = 'inline';
    modelBadgeSpan.classList.remove('hidden'); // Ensure visible
    modelBadgeSpan.style.display = 'inline-flex'; // Use inline-flex for badges
}

// Helper to ensure thinking box exists (simplified) - THIS IS FOR STREAMING ONLY
ui.ensureThinkingBoxExists = function(messageElement) {
    const messageId = messageElement.id.replace('message-', ''); // Extract ID
    const thinkingBlockId = `thinking-block-${messageId}`;
    let thinkingElement = document.getElementById(thinkingBlockId);

    if (!thinkingElement) {
        thinkingElement = document.createElement('div');
        thinkingElement.id = thinkingBlockId;
        // Use a consistent class name + status attribute
        thinkingElement.className = 'thinking-block mb-2 p-3 border border-dashed border-outline/50 rounded bg-surface-alt/50'; // Use 'thinking-block' class
        thinkingElement.dataset.status = 'streaming';

        const thinkingLabel = document.createElement('div');
        thinkingLabel.className = 'thinking-label text-xs font-semibold text-on-surface/70 mb-1 flex items-center gap-1.5';
        // Animated SVG or simpler icon
        thinkingLabel.innerHTML = `<svg class="animate-spin h-3 w-3 text-primary thinking-spinner-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> <span class='label-text'>Thinking...</span>`; // Add span for label text
        thinkingElement.appendChild(thinkingLabel);

        const thinkingContentEl = document.createElement('div');
        thinkingContentEl.className = 'thinking-content-text text-xs prose prose-invert prose-sm max-w-none'; // Apply prose for formatting
        thinkingElement.appendChild(thinkingContentEl);

        // --- Insert thinking box *before* the main content ---
        const mainContentElement = messageElement.querySelector('.content');
        mainContentElement?.parentNode?.insertBefore(thinkingElement, mainContentElement);
        }
    // Return the element where streaming text should go
    return thinkingElement.querySelector('.thinking-content-text');
};


// Show or hide the thinking indicator (now integrated into message streaming)
let thinkingIndicatorTimeout = null;
ui.showThinkingIndicator = function(show) {
     // The thinking indicator is now primarily handled by the streaming message itself.
     // This function might be used for the brief period *before* the first chunk arrives.
     const indicatorId = 'initial-thinking-indicator';
     const existingIndicator = document.getElementById(indicatorId);

     clearTimeout(thinkingIndicatorTimeout); // Clear previous timeout

    if (show) {
         if (!existingIndicator) {
             console.log("[UI] Showing initial thinking indicator.");
        const indicator = document.createElement('div');
             indicator.id = indicatorId;
             // Use Penguin UI XL spinner (Primary color variant)
             indicator.className = 'message system-message flex justify-center items-center py-4'; // Center the spinner
             indicator.innerHTML = `
                 <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" class="animate-spin h-8 w-8 text-primary">
                     <path d="M12,1A11,11,0,1,0,23,12,11,11,0,0,0,12,1Zm0,19a8,8,0,1,1,8-8A8,8,0,0,1,12,20Z" opacity=".25" fill="currentColor"/>
                     <path d="M10.14,1.16a11,11,0,0,0-9,8.92A1.59,1.59,0,0,0,2.46,12,1.52,1.52,0,0,0,4.11,10.7a8,8,0,0,1,6.66-6.61A1.42,1.42,0,0,0,12,2.69h0A1.57,1.57,0,0,0,10.14,1.16Z" fill="currentColor"/>
                 </svg>
             `;

        if (chatHistory) {
            chatHistory.appendChild(indicator);
                 ui.scrollToBottom(chatHistory);
                 // Timeout to remove this initial indicator if no message stream starts
            thinkingIndicatorTimeout = setTimeout(() => {
                     const currentIndicator = document.getElementById(indicatorId);
                     if (currentIndicator) {
                          console.warn("[UI] Initial thinking indicator timed out.");
                          currentIndicator.remove();
                     }
                 }, 10000); // 10 seconds
        } else {
                 console.error("chatHistory element not found, cannot show initial thinking indicator.");
             }
        }
    } else {
         if (existingIndicator) {
             console.log("[UI] Hiding initial thinking indicator.");
             existingIndicator.remove();
         }
         // Clear timeout regardless
        clearTimeout(thinkingIndicatorTimeout);
    }
}

// --- User Interaction Functions ---

/**
 * Displays a confirmation dialog using the Penguin modal structure.
 */
ui.showConfirmationDialog = function(title, message, onConfirm) {
    // Dispatch an event that the Alpine component in admin.html listens for
    // We need to add a similar Alpine modal component to index.html or a shared layout
    // For now, using the old method as a fallback until the modal is added.
    console.warn("showConfirmationDialog: Penguin modal structure not yet implemented in index.html. Using fallback.");
    ui.showFallbackConfirmationDialog(title, message, onConfirm);

    /* // Ideal Implementation (requires Alpine modal in index.html)
    window.dispatchEvent(new CustomEvent('open-confirm-modal', {
        detail: {
            title: title,
            message: message,
            onConfirmCallback: onConfirm // Pass the callback reference
        }
    }));
    */
}

// Fallback confirmation (similar to old style, but slightly improved)
ui.showFallbackConfirmationDialog = function(title, message, onConfirm) {
    const existingDialog = document.querySelector('.fallback-confirmation-dialog');
    if (existingDialog) existingDialog.remove();

    const overlay = document.createElement('div');
    overlay.className = 'fallback-confirmation-dialog fixed inset-0 z-[99] bg-black/60 flex items-center justify-center p-4';
    overlay.style.opacity = '0';
    overlay.style.transition = 'opacity 0.3s ease-out';

    const dialog = document.createElement('div');
    dialog.className = 'bg-surface-alt border border-outline rounded-lg shadow-xl p-6 max-w-sm w-full';
    dialog.style.transform = 'scale(0.95)';
    dialog.style.opacity = '0';
    dialog.style.transition = 'transform 0.3s ease-out, opacity 0.3s ease-out';

    const titleEl = document.createElement('h3');
    titleEl.className = 'text-lg font-semibold text-warning mb-3 border-b border-outline pb-2';
    titleEl.textContent = title;

    const messageEl = document.createElement('p');
    messageEl.className = 'text-sm text-on-surface mb-6';
    messageEl.textContent = message;

    const actionsEl = document.createElement('div');
    actionsEl.className = 'flex justify-end space-x-3';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'py-2 px-4 bg-surface hover:bg-outline text-on-surface font-semibold rounded shadow text-sm';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.onclick = () => closeDialog();

    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = 'py-2 px-4 bg-danger hover:bg-opacity-90 text-on-danger font-semibold rounded shadow text-sm';
    confirmBtn.textContent = 'Confirm';
    confirmBtn.onclick = () => {
        if (typeof onConfirm === 'function') {
            onConfirm(overlay); // Pass overlay so callback can close it
        }
        // Close dialog *after* callback, unless callback handles it
        // closeDialog();
    };

    actionsEl.appendChild(cancelBtn);
    actionsEl.appendChild(confirmBtn);
    dialog.appendChild(titleEl);
    dialog.appendChild(messageEl);
    dialog.appendChild(actionsEl);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    const closeDialog = () => {
        overlay.style.opacity = '0';
        dialog.style.transform = 'scale(0.95)';
        dialog.style.opacity = '0';
        setTimeout(() => overlay.remove(), 300); // Remove after transition
    };

    // Close on clicking overlay background
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            closeDialog();
        }
    });

    // Trigger enter animation
    requestAnimationFrame(() => {
        overlay.style.opacity = '1';
        dialog.style.transform = 'scale(1)';
        dialog.style.opacity = '1';
    });
}


// --- Notification Function (Using Alpine Event) ---
/**
 * Displays a notification using the Penguin UI Toast component via an Alpine event.
 * @param {string} message - The message to display.
 * @param {'info' | 'success' | 'warning' | 'danger' | 'error'} type - Type of notification.
 * @param {string|null} title - Optional title for the notification.
 */
ui.showNotification = function(message, type = 'success', title = null) {
    // Map 'error' to 'danger' if needed for Penguin component variants
    const variant = (type === 'error') ? 'danger' : type;

    // Dispatch event for Alpine x-on:notify.window
    window.dispatchEvent(new CustomEvent('notify', {
        detail: {
            variant: variant,
            title: title,
            message: message,
        }
    }));

    console.log(`[Notification - ${variant}] ${title ? title + ': ' : ''}${message}`);
}


// --- Event Listeners Setup ---

ui.setupEventListeners = function() {
    const logoutButton = document.getElementById('logout-button');
    const purgeChatsButton = document.getElementById('purge-chats-button');
    const newChatButton = document.getElementById('new-chat-button'); // This is now an <a> tag

    if (logoutButton) {
        logoutButton.addEventListener('click', async () => {
            console.log('Logout button clicked');
            try {
                const response = await fetch('/logout', { method: 'POST' }); // Assume POST
                if (response.ok) {
                    console.log('Logout successful, redirecting...');
                    window.location.href = '/login';
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
            ui.showConfirmationDialog( // Using fallback for now
                'Purge All Chats?',
                'Are you sure you want to permanently delete ALL your chats? This cannot be undone.',
                (confirmationEl) => api.confirmPurgeChats(confirmationEl)
            );
        });
    }

    if (newChatButton) {
        // The click listener might be attached in renderChatsList or here
        // Ensure it calls chat.startNewChat and prevents default link behavior
        if (!newChatButton._listenerAttached) { // Prevent multiple listeners
             newChatButton.addEventListener('click', (e) => {
                 e.preventDefault();
                 chat.startNewChat();
                 // Optionally close sidebar on mobile
                 if (window.innerWidth < 1024) {
                     const alpineData = newChatButton.closest('[x-data]');
                     if (alpineData && alpineData.__x) alpineData.__x.$data.showSidebar = false;
                 }
             });
             newChatButton._listenerAttached = true;
        }
    }

    // Add listener for chat title rename
    if (chatTitle) {
        chatTitle.addEventListener('dblclick', function() {
             if (currentChatId) { // Only allow rename if a chat is active
                const currentTitleText = this.textContent;
                 const newTitle = prompt('Enter new chat title:', currentTitleText);
                 if (newTitle && newTitle.trim() !== '' && newTitle !== currentTitleText) {
                    this.textContent = newTitle; // Optimistic update
                    api.updateChatTitle(currentChatId, newTitle);
                 }
             } else {
                 ui.showNotification("Select a chat before renaming.", "info");
             }
        });
    }

    // Initialize Highlight.js dynamically after content might be loaded
    if (typeof hljs !== 'undefined') {
        // Maybe trigger this after messages are rendered?
        // For now, just log availability
        console.log("Highlight.js is available.");
        // Consider using MutationObserver on #chat-history to highlight new code blocks
    }

     // Remove old mobile collapse logic
     // ui.initializeMobileCollapse();
}


// --- Utility Functions ---

/**
 * Adds a message element directly to the UI for optimistic updates (e.g., user message).
 */
ui.addMessageToUI = function(type, content, tempId = null, messageType = 'chat') {
    if (!chatHistory) return;

    const messageWrapper = ui.createMessageElement(type, tempId, null);
    const contentElement = messageWrapper.querySelector('.content');

    if (contentElement) {
        messageWrapper.dataset.rawContent = content; // Store original raw content
        
        // Handle message type-specific rendering
        if (type === 'user') {
            // Add search icon for search messages
            if (messageType === 'search') {
                const searchIcon = '<span class="inline-block mr-2 text-primary"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4"><path fill-rule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clip-rule="evenodd" /></svg></span>';
                const displayContentString = `<span class="user-prompt-indicator">&gt;</span> ${searchIcon}${content.replace(/</g, "&lt;").replace(/>/g, "&gt;")}`;
                contentElement.innerHTML = displayContentString;
            } else {
                // Standard user message
                const displayContentString = `<span class="user-prompt-indicator">&gt;</span> ${content.replace(/</g, "&lt;").replace(/>/g, "&gt;")}`;
                contentElement.innerHTML = displayContentString;
            }
        } else if (type === 'system') {
            // For system messages
            if (messageType === 'error') {
                contentElement.classList.add('text-danger');
                contentElement.innerHTML = `<span class="font-semibold">[ERROR]</span> ${content}`;
            } else {
                contentElement.innerHTML = content;
            }
        } else {
            // For other types, use markdown parsing
            try {
                contentElement.innerHTML = marked.parse(content);
            } catch (error) {
                console.error('Error parsing markdown:', error);
                contentElement.textContent = content;
            }
        }
    } else {
        console.warn("Could not find content element in newly created message wrapper.");
    }

    // For search-related system messages, add a spinner
    if (type === 'system' && tempId && tempId.includes('search-system')) {
        const spinnerHTML = '<div class="inline-block ml-2 animate-spin"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg></div>';
        if (contentElement) {
            contentElement.innerHTML += spinnerHTML;
        }
    }

    chatHistory.appendChild(messageWrapper);
    // Ensure scroll after adding message
    setTimeout(() => ui.scrollToBottom(chatHistory), 50);
    console.log(`[UI] Added ${type} message to UI with ID ${tempId || 'unknown'}.`);

    // Update regenerate button state after adding message
    ui.updateRegenerateButtonState();
    
    return messageWrapper;
}

/**
 * Displays an error message within the chat history area.
 */
ui.displayChatError = function(chatId, errorMessage) {
    console.error(`[Chat Error - Chat ID: ${chatId || 'N/A'}] ${errorMessage}`);
    if (!chatHistory) {
        ui.showNotification(`Error: ${errorMessage}`, 'error'); // Fallback notification
        return;
    }

    // Simple error display using system message style but with error indication
    const errorWrapper = document.createElement('div');
    errorWrapper.className = 'message error-message text-center text-sm text-danger py-2';
    errorWrapper.id = `message-error-${Date.now()}`;

    const contentElement = document.createElement('div');
    contentElement.className = 'content';
    contentElement.innerHTML = `<span class="font-semibold">[ERROR]</span> ${errorMessage}`;
    errorWrapper.appendChild(contentElement);

    // Add timestamp
    const footerElement = document.createElement('div');
    footerElement.className = 'message-footer text-xs text-on-surface/60 mt-1';
    const timestampElement = document.createElement('span');
    timestampElement.className = 'timestamp';
    timestampElement.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    footerElement.appendChild(timestampElement);
    errorWrapper.appendChild(footerElement);

    chatHistory.appendChild(errorWrapper);
    ui.scrollToBottom(chatHistory);

    // Show notification tile as well
    ui.showNotification(`Error: ${errorMessage}`, 'error');
}

// --- Scroll Helpers ---
/**
 * Checks if the chat history is scrolled to the bottom (or very close).
 * @param {HTMLElement} element - The scrollable element.
 * @returns {boolean} - True if scrolled to bottom, false otherwise.
 */
ui.isScrolledToBottom = function(element) {
    if (!element) return false;
    // Allow a small tolerance (e.g., 10 pixels)
    const tolerance = 10;
    return element.scrollHeight - element.scrollTop - element.clientHeight <= tolerance;
};

/**
 * Scrolls an element smoothly to the bottom.
 * @param {HTMLElement} element - The element to scroll.
 */
ui.scrollToBottom = function(element) {
    if (!element) return;
    // Use requestAnimationFrame for smoother scrolling, especially during rapid updates
    requestAnimationFrame(() => {
        element.scrollTo({
            top: element.scrollHeight,
            behavior: 'smooth' // Use smooth scrolling
        });
    });
};

// --- Initialization ---

// Removed initializeSidebarResizing - Handled by standard CSS/Flexbox now.
// Removed initializeUI - Event listeners setup is now the main init part.

// Expose ui namespace globally
window.ui = ui;

// Call event listener setup on DOMContentLoaded (moved to chat.js init)
// document.addEventListener('DOMContentLoaded', ui.setupEventListeners);

// Helper to create and add copy button to code blocks
ui.addCopyCodeButtons = function(contentElement) {
    if (!contentElement) return;

    contentElement.querySelectorAll('pre').forEach(preElement => {
        // Check if button already exists to avoid duplicates
        if (preElement.querySelector('.copy-code-button')) {
            return;
        }

        const codeElement = preElement.querySelector('code');
        if (!codeElement) return; // Skip if no code element found

        const button = document.createElement('button');
        button.className = 'copy-code-button';
        button.textContent = 'Copy';
        button.title = 'Copy code snippet';

        button.addEventListener('click', () => {
            const codeToCopy = codeElement.innerText || '';
            navigator.clipboard.writeText(codeToCopy).then(() => {
                button.textContent = 'Copied!';
                button.classList.add('copied');
                setTimeout(() => {
                    button.textContent = 'Copy';
                    button.classList.remove('copied');
                }, 2000);
            }).catch(err => {
                console.error('Failed to copy code:', err);
                button.textContent = 'Error';
                setTimeout(() => {
                     button.textContent = 'Copy';
                 }, 2000);
            });
        });

        // Append button to the <pre> element
        preElement.appendChild(button);
    });
}

// Update the enabled/disabled state of the Regenerate button
ui.updateRegenerateButtonState = function() {
    const regenerateButton = document.getElementById('regenerate-button');
    if (!regenerateButton) return;

    const messages = chatHistory ? chatHistory.querySelectorAll('.message') : [];
    let canRegenerate = false;

    if (messages.length >= 2) {
        const lastMessage = messages[messages.length - 1];
        // Check if the last message is from the bot (assistant)
        if (lastMessage.classList.contains('bot-message')) {
            canRegenerate = true;
        }
    }

    // Enable/disable button
    if (canRegenerate) {
        regenerateButton.disabled = false;
        regenerateButton.classList.remove('opacity-50', 'cursor-not-allowed');
        regenerateButton.title = 'Regenerate last response';
                    } else {
        regenerateButton.disabled = true;
        regenerateButton.classList.add('opacity-50', 'cursor-not-allowed');
        regenerateButton.title = 'Cannot regenerate (requires a previous assistant response)';
    }
    console.log(`[UI Update] Regenerate button ${canRegenerate ? 'enabled' : 'disabled'}`);
};

// --- Message Rendering Functions ---

// Add a temporary user message while waiting for the response
ui.addTempUserMessage = function(content, type = 'chat') {
    if (!chatHistory) return;
    
    const tempId = 'temp-message-' + Date.now();
    const messageElement = document.createElement('div');
    messageElement.id = tempId;
    messageElement.className = 'message user-message mb-4 animate-fade-in';
    
    let icon = '';
    if (type === 'search') {
        icon = '<span class="icon search-icon inline-block mr-2"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="h-5 w-5"><path fill-rule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clip-rule="evenodd" /></svg></span>';
    }
    
    messageElement.innerHTML = `
        <div class="flex items-start mb-2">
            <div class="user-avatar flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary text-sm font-medium mr-3">U</div>
            <div class="content bg-surface-alt rounded-lg p-3 shadow-sm max-w-3xl">
                ${icon}${window.marked.parse(window.escapeHtml(content))}
            </div>
        </div>
    `;
    
    chatHistory.appendChild(messageElement);
    chatHistory.scrollTop = chatHistory.scrollHeight;
    return tempId;
};

// Remove temporary messages
ui.removeTempMessages = function() {
    if (!chatHistory) return;
    
    const tempMessages = chatHistory.querySelectorAll('[id^="temp-message-"]');
    tempMessages.forEach(msg => msg.remove());
};

// Add assistant message with search results
ui.addAssistantMessageWithSearchResults = function(content, searchResults) {
    if (!chatHistory) return;
    
    // Remove any temporary messages first
    ui.removeTempMessages();
    
    const messageElement = document.createElement('div');
    messageElement.className = 'message assistant-message mb-4 animate-fade-in';
    
    // Format the search results section
    let searchResultsHTML = '';
    if (searchResults && searchResults.length > 0) {
        searchResultsHTML = '<div class="search-results mt-3 pt-3 border-t border-outline">';
        searchResultsHTML += '<h4 class="text-sm font-semibold mb-2">Search Results:</h4>';
        searchResultsHTML += '<ul class="search-results-list space-y-2 text-sm">';
        
        searchResults.forEach(result => {
            searchResultsHTML += `
                <li class="result-item">
                    <a href="${window.escapeHtml(result.url)}" class="block hover:bg-surface-alt p-2 rounded" target="_blank" rel="noopener noreferrer">
                        <div class="font-medium text-primary">${window.escapeHtml(result.title)}</div>
                        <div class="text-xs text-on-surface/70 truncate">${window.escapeHtml(result.url)}</div>
                        <div class="mt-1 text-on-surface/90">${window.escapeHtml(result.snippet)}</div>
                    </a>
                </li>
            `;
        });
        
        searchResultsHTML += '</ul></div>';
    }
    
    // Parse Markdown in the assistant's response
    const parsedContent = window.marked.parse(content);
    
    messageElement.innerHTML = `
        <div class="flex items-start mb-2">
            <div class="assistant-avatar flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-on-secondary text-sm font-medium mr-3">AI</div>
            <div class="content bg-surface-alt rounded-lg p-3 shadow-sm max-w-3xl">
                <div class="markdown-content">${parsedContent}</div>
                ${searchResultsHTML}
            </div>
        </div>
    `;
    
    chatHistory.appendChild(messageElement);
    
    // Apply syntax highlighting to code blocks
    if (window.hljs) {
        messageElement.querySelectorAll('pre code').forEach(block => {
            window.hljs.highlightElement(block);
        });
    }
    
    chatHistory.scrollTop = chatHistory.scrollHeight;
    
    return messageElement;
};

// Helper function to set target="_blank" on links within an element
ui.setLinksToOpenInNewTab = function(element) {
    if (!element) return;
    const links = element.querySelectorAll('a');
    links.forEach(link => {
        // Only add target="_blank" if it's an external link or not an anchor link
        const href = link.getAttribute('href');
        if (href && !href.startsWith('#') && !href.startsWith(window.location.origin)) {
            link.setAttribute('target', '_blank');
            // Add rel="noopener noreferrer" for security
            link.setAttribute('rel', 'noopener noreferrer'); 
        }
    });
};
