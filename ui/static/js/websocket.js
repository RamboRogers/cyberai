// ui/static/js/websocket.js - WebSocket Connection and Message Handling

// Create a namespace for WebSocket functions
const websocket = {};

// --- State Variables (These are available globally from chat.js) ---
// WebSocket instance (initialized later)
let ws = null;
// let isInsideThinkBlock = false; // Defined in chat.js

// --- UI Functions (now namespaced with ui.) ---
// ui.addSystemMessage(content, type = 'info');
// ui.renderProviderSelect();
// ui.populateModelSelect(providerId, initialModelId);
// ui.renderChatsList(chats);
// ui.createMessageElement(type, message_id, model_id = null);
// ui.addModelInfo(timestampElement, model_id);
// ui.ensureThinkingBoxExists(messageElement);
// ui.showThinkingIndicator(show);

// --- API Functions (now namespaced with api.) ---
// api.fetchModels();
// api.fetchChats();

// --- Chat Functions (now namespaced with chat.) ---
// chat.updateChatsList(chats);
// chat.updateModelsList(models);
// chat.getChatsList();
// chat.getModelsList();

// Connect to WebSocket server
websocket.connect = function() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    console.log(`Attempting to connect to WebSocket at ${wsUrl}`);

    if (ws) {
        try { ws.close(); } catch (e) { console.error("Error closing WS:", e); }
    }

    try {
        ws = new WebSocket(wsUrl);

        ws.onopen = function() {
            console.log('Connected to server');
            console.log("[System WS] Connection established. CyberAI terminal ready.");
            // Fetch initial data after connection
            api.fetchModels().then(() => {
                // Fetch chats AFTER models are fetched and processed by the handler
                // The model_list handler should populate the dropdowns now.
                api.fetchChats();
            });
        };

        ws.onmessage = function(event) {
            try {
                const message = JSON.parse(event.data);
                websocket.handleWebSocketMessage(message);
            } catch (error) {
                console.error('Error parsing WebSocket message:', error, 'Raw data:', event.data);
                console.error("[System WS] Error parsing server message.");
            }
        };

        ws.onclose = function(event) {
            console.log('Disconnected from server', event);
            if (event.code !== 1000) { // Don't show reconnect on normal close
                console.warn("[System WS] Connection lost. Attempting to reconnect...");
                setTimeout(websocket.connect, 3000);
            } else {
                console.log("[System WS] Connection closed normally.");
            }
        };

        ws.onerror = function(error) {
            console.error('WebSocket error:', error);
            console.error("[System WS] Connection error. Check console.");
            // ws.onclose will handle reconnection attempts
        };
    } catch (error) {
        console.error('Error creating WebSocket:', error);
        console.error("[System WS] Failed to create WebSocket connection: " + error.message);
        setTimeout(websocket.connect, 5000); // Retry connection after longer delay
    }
};

// Handle different types of WebSocket messages
websocket.handleWebSocketMessage = function(message) {
    console.log('WebSocket message received:', message);

    // Hide thinking indicator when any relevant message comes in
    if (message.type !== 'status') { // Keep thinking indicator for status messages?
        ui.showThinkingIndicator(false);
    }

    switch (message.type) {
        case 'system':
            ui.addSystemMessage(message.content_payload?.content || 'System message received without content');
            break;
        case 'status':
            console.log('Status Update:', message.status_payload?.message);
            // Optionally, update a status area in the UI or use a notification
            ui.showThinkingIndicator(true); // Show/keep indicator during status updates
            break;
        case 'error':
            console.error('WebSocket Error Received Payload:', message.error_payload);
            // Display the error in the chat window
            const errorMsg = message.error_payload?.message || 'An unknown error occurred via WebSocket.';
            const errorChatId = message.error_payload?.chat_id || currentChatId || 'unknown';
            ui.displayChatError(errorChatId, errorMsg);
            ui.showThinkingIndicator(false); // Hide indicator on error
            break;
        case 'user_message':
            // Update the UI for the confirmed user message (e.g., replace temp ID)
            const userMsg = message.message_payload;
            if (userMsg) {
                // Find the temporary message if it exists
                const tempMsgElement = document.getElementById('message-temp-user');
                if (tempMsgElement) {
                    tempMsgElement.id = `message-${userMsg.id}`;
                    // Optionally update other attributes if needed
                } else {
                    // If the message wasn't optimistically rendered, render it now
                    ui.renderMessage(userMsg);
                }
            } else {
                console.warn('Received user_message confirmation without payload.');
            }
            break;
        case 'assistant_message':
            // Render the complete assistant message
            const assistantMsg = message.message_payload;
            if (assistantMsg) {
                ui.renderMessage(assistantMsg);
                const msgElement = document.getElementById(`message-${assistantMsg.id}`);
                if (msgElement) {
                    msgElement.classList.add('message-finalized');
                }
                // No need to call showThinkingIndicator(false) here as it was likely handled by the last chunk
            } else {
                console.warn('Received assistant_message without payload.');
            }
            break;
        case 'assistant_chunk':
            // Handle a chunk of the assistant's response
            const chunkPayload = message.chunk_payload;
            if (chunkPayload) {
                websocket.handleAssistantChunk(chunkPayload);
                // Hide thinking indicator only on the *final* chunk
                if (chunkPayload.is_final) {
                    ui.showThinkingIndicator(false);
                }
            } else {
                console.warn('Received assistant_chunk without payload.');
            }
            break;
        case 'remove_message':
            // Remove a message from the UI (e.g., during regeneration)
            const removePayload = message.remove_payload;
            if (removePayload?.message_id) {
                const msgToRemove = document.getElementById(`message-${removePayload.message_id}`);
                if (msgToRemove) {
                    msgToRemove.remove();
                    console.log(`Removed message ${removePayload.message_id} from UI.`);
                }
            } else {
                console.warn('Received remove_message without message_id.');
            }
            break;
        case 'chat_list':
            // Update the chat list in the sidebar
            const chatListPayload = message.chat_list_payload;
            if (chatListPayload) {
                chat.updateChatsList(chatListPayload); // Call function in chat.js
                ui.renderChatsList(chat.getChatsList()); // Re-render UI
            } else {
                console.warn('Received chat_list without payload.');
            }
            break;
        case 'model_list':
            // Update the model list state
            const modelListPayload = message.model_list_payload;
            if (modelListPayload) {
                console.log("[WS] Received model_list update. Updating global state and rendering provider select.");
                chat.updateModelsList(modelListPayload); // Update global modelsList in chat.js
                // Render the PROVIDER dropdown, which will trigger model dropdown population
                ui.renderProviderSelect();
            } else {
                console.warn('Received model_list without payload.');
            }
            break;
        default:
            console.warn('Unhandled WebSocket message type:', message.type);
    }
};

// Handle streaming chunks of assistant responses
websocket.handleAssistantChunk = function(payload) {
    // console.log(`[WS] handleAssistantChunk START - MsgID: ${payload.message_id}, Final: ${payload.is_final}, Content:`, JSON.stringify(payload.content)); // Silenced verbose log
    const { chat_id, message_id, content, is_final, model_id, tokens_used } = payload;

    if (currentChatId !== chat_id) {
         console.warn(`Received chunk for inactive chat ${chat_id}, current is ${currentChatId}. Ignoring.`);
         return; // Ignore chunks for non-active chats
    }

    // Hide thinking indicator as soon as the first chunk arrives
    ui.showThinkingIndicator(false);

    let messageElement = document.getElementById(`message-${message_id}`);
    let contentElement;
    let isNewElement = false;
    let thinkingContentEl = null;
    let thinkingElement = null;

    if (!messageElement) {
        isNewElement = true;
        console.log(`[WS] Message element ${message_id} not found. Calling createMessageElement.`);
        // Use the UI function to create the element
        messageElement = ui.createMessageElement('bot', message_id, model_id); // Ensure type is 'bot'
        contentElement = messageElement.querySelector('.content');
        if (chatHistory) chatHistory.appendChild(messageElement);
        // Initialize raw content dataset for the whole message
        messageElement.dataset.rawContent = '';
        // Initialize raw content storage for the visible part
        if (contentElement) { contentElement._rawContent = ''; }
    } else {
        contentElement = messageElement.querySelector('.content');
        thinkingElement = messageElement.querySelector('.thinking-content');
        if (thinkingElement) {
            thinkingContentEl = thinkingElement.querySelector('.thinking-content-text');
        }
        // Add visual cue for update
        messageElement.classList.add('message-updated');
        setTimeout(() => { messageElement.classList.remove('message-updated'); }, 600);
    }

    // --- Ensure contentElement exists ---
    if (!contentElement) {
        console.error(`[WS][Error] Content element not found for message ${message_id} after setup.`);
        return;
    }
    // Ensure internal raw content accumulator exists
    if (typeof contentElement._rawContent === 'undefined') {
        contentElement._rawContent = '';
    }
    // ------------------------------------

    // --- Update Model Info (if needed) --- 
    const timestampElement = messageElement.querySelector('.message-footer .timestamp');
    const modelInfoExists = timestampElement && timestampElement.querySelector('.model-badge'); // Use class selector
    if (model_id && timestampElement && (!modelInfoExists || isNewElement)) {
        ui.addModelInfo(timestampElement.parentNode, model_id); // Pass container
    }
    // ------------------------------------

    // Append raw content for copy markdown (whole message)
    if (messageElement.dataset.rawContent !== undefined) {
        messageElement.dataset.rawContent += content;
    }

    // --- Scrolling Check --- PRE-computation
    const shouldScroll = ui.isScrolledToBottom(chatHistory);

    // --- Process chunk for display (SIMPLIFIED) ---
    // This section assumes the main content element handles regular text
    // and a separate thinking element handles <think> blocks.
    let currentChunk = content;
    while (currentChunk.length > 0) {
        if (isInsideThinkBlock) {
            // --- Handle content inside <think> block ---
            const endTagIndex = currentChunk.indexOf('</think>');
            let chunkToProcess;
            if (endTagIndex !== -1) {
                chunkToProcess = currentChunk.substring(0, endTagIndex);
                currentChunk = currentChunk.substring(endTagIndex + '</think>'.length);
                isInsideThinkBlock = false; // Exit think block
            } else {
                chunkToProcess = currentChunk; // Process rest of chunk
                currentChunk = '';
            }
            if (chunkToProcess) {
                thinkingContentEl = ui.ensureThinkingBoxExists(messageElement); // Get or create thinking area
                thinkingElement = messageElement.querySelector('.thinking-content');
                if (thinkingContentEl && thinkingElement) { 
                    let rawThinking = thinkingElement._rawThinkingContent || '';
                    rawThinking += chunkToProcess;
                    thinkingElement._rawThinkingContent = rawThinking;
                    try {
                        // --- ADDED: Preprocess for \\boxed{} ---
                        const processedThinking = rawThinking.replace(/\\\\boxed\\{([^}]+)\\}/g, '<span class="boxed-answer">$1</span>');
                        // --- END ADDED ---
                        thinkingContentEl.innerHTML = marked.parse(processedThinking, { gfm: true, breaks: true });
                    } catch (error) {
                        console.error('Error parsing thinking markdown:', error);
                        thinkingContentEl.textContent = rawThinking; // Fallback to text
                    }
                }
            }
        } else {
            // --- Handle content OUTSIDE <think> block ---
            const startTagIndex = currentChunk.indexOf('<think>');
            let chunkToProcess;
            if (startTagIndex !== -1) {
                chunkToProcess = currentChunk.substring(0, startTagIndex);
                currentChunk = currentChunk.substring(startTagIndex + '<think>'.length);
                isInsideThinkBlock = true; // Enter think block
                // Ensure thinking box exists but don't write to it yet
                ui.ensureThinkingBoxExists(messageElement); 
                thinkingElement = messageElement.querySelector('.thinking-content');
                if (thinkingElement) { thinkingElement._rawThinkingContent = ''; } // Initialize raw content for thinking box
            } else {
                chunkToProcess = currentChunk; // Process entire chunk
                currentChunk = '';
            }
            if (chunkToProcess) {
                // Append to the main content element's raw buffer
                contentElement._rawContent += chunkToProcess;
                try { 
                    // --- ADDED: Preprocess for \\boxed{} ---
                    const processedContent = contentElement._rawContent.replace(/\\\\boxed\\{([^}]+)\\}/g, '<span class="boxed-answer">$1</span>');
                    // --- END ADDED ---
                    // Parse the accumulated raw content and render as HTML
                    contentElement.innerHTML = marked.parse(processedContent, { gfm: true, breaks: true });
                } catch (error) {
                    console.error('Error parsing regular markdown chunk:', error);
                    // Fallback: render accumulated raw content as text
                    contentElement.textContent = contentElement._rawContent;
                }
            }
        }
    }
    // --- End Process chunk for display ---

    // Update timestamp and handle final state actions
    websocket.updateTimestampAndFinalState(messageElement, contentElement, thinkingElement, is_final);

    // --- Scrolling Execution --- POST-computation
    if (shouldScroll && chatHistory) {
        requestAnimationFrame(() => {
             requestAnimationFrame(() => {
                // Use the helper function for smooth scroll
                ui.scrollToBottom(chatHistory);
             });
        });
    }

    // Add copy buttons to any new code blocks (idempotent check inside)
    ui.addCopyCodeButtons(contentElement);
    if (thinkingContentEl) ui.addCopyCodeButtons(thinkingContentEl); // Also check thinking area

    // --- Final Chunk Handling ---
    if (is_final) {
        console.log(`[WS] Final chunk for message ${message_id}.`);
        messageElement.classList.add('message-finalized'); // Add final marker

        // --- ADDED: Remove thinking spinner --- 
        const thinkingSpinner = messageElement.querySelector('.thinking-spinner-icon');
        if (thinkingSpinner) {
            thinkingSpinner.remove();
            console.log(`[WS] Removed thinking spinner for message ${message_id}.`);
        }
        // --- END ADDED ---

        // Ensure Model Info is present/updated in the footer 
        if (model_id && timestampElement?.parentNode) {
            ui.addModelInfo(timestampElement.parentNode, model_id); 
        } else if (!model_id) {
            console.warn(`[WS] Final chunk for ${message_id} missing model_id.`);
        } else if (!timestampElement) {
            console.error(`[WS] Could not find time/model container in footer for ${message_id}.`);
        }

        // Update token count 
        const tokenSpan = messageElement.querySelector('.token-count');
        if (tokenSpan && tokens_used != null) {
            tokenSpan.textContent = `${tokens_used} chars`;
            tokenSpan.classList.remove('hidden');
        } else if (tokenSpan) {
            tokenSpan.classList.add('hidden');
        }

        // Apply syntax highlighting now to all code blocks
        messageElement.querySelectorAll('.content pre code, .thinking-content-text pre code').forEach((block) => { 
            try {
                if (typeof hljs !== 'undefined' && !block.classList.contains('hljs')) { // Check if not already highlighted
                    hljs.highlightElement(block);
                }
            } catch (e) {
                console.error("Highlight.js error:", e);
            }
        });
        
        // Add copy buttons one last time after highlighting
        ui.addCopyCodeButtons(contentElement);
        if (thinkingContentEl) ui.addCopyCodeButtons(thinkingContentEl);

        // Reset internal raw content accumulators (memory cleanup)
        if (contentElement) { delete contentElement._rawContent; } 
        if (thinkingElement) { delete thinkingElement._rawThinkingContent; }
        
        // Reset think block state just in case
        if (isInsideThinkBlock) {
             console.warn('[WS Debug] Final chunk received but state was still inside think block! Resetting.');
             isInsideThinkBlock = false;
         }

         // --- Update regenerate button state after final chunk ---
         ui.updateRegenerateButtonState();
    }
};

// Helper function to update timestamp and handle final state actions
// Was previously in ui.js
websocket.updateTimestampAndFinalState = function(messageElement, contentElement, thinkingElement, is_final) {
    const timestampSpan = messageElement.querySelector('.message-footer .timestamp'); // Target span in footer
    if (timestampSpan) {
        const modelInfoSpan = timestampSpan.querySelector('.model-info');
        const timeString = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        // Update the text node part of the timestamp span carefully
        let textNode = timestampSpan.firstChild;
        while (textNode && textNode.nodeType !== Node.TEXT_NODE) {
            textNode = textNode.nextSibling;
        }
        if (textNode) {
            textNode.nodeValue = timeString + (modelInfoSpan ? ' - ' : '');
        } else {
             // If no text node, prepend it (edge case)
             timestampSpan.insertBefore(document.createTextNode(timeString + (modelInfoSpan ? ' - ' : '')), timestampSpan.firstChild);
        }
        timestampSpan.dataset.timestamp = new Date().toISOString();
    } else {
        console.warn("Could not find timestamp span in footer for message:", messageElement.id);
    }

    if (is_final) {
        console.log('Final chunk received for message:', messageElement.id);
        if (isInsideThinkBlock) {
            console.warn('[Debug] Final chunk received but still inside think block! Resetting state.');
            isInsideThinkBlock = false;
        }
        // Apply syntax highlighting now
        messageElement.querySelectorAll('.content pre code, .thinking-content-text pre code').forEach((block) => { // Highlight both areas
            try {
                // Ensure hljs is available (might need to check if loaded)
                if (typeof hljs !== 'undefined') {
                    hljs.highlightElement(block);
                } else {
                    console.warn("highlight.js (hljs) not available for highlighting.");
                }
            } catch (e) {
                console.error("Highlight.js error:", e);
            }
        });
        // Reset internal raw content accumulators (memory cleanup)
        if (contentElement) { delete contentElement._rawContent; } // Use delete for custom props
        if (thinkingElement) { delete thinkingElement._rawThinkingContent; }
    }
};

// Function to send a message (if needed client-to-server later)
websocket.sendWebSocketMessage = function(message) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        console.error('Cannot send message: WebSocket is not connected');
        return false;
    }

    try {
        ws.send(JSON.stringify(message));
        return true;
    } catch (error) {
        console.error('Error sending WebSocket message:', error);
        return false;
    }
};

// Expose websocket namespace globally
window.websocket = websocket;