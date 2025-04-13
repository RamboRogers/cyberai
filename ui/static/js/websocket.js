// ui/static/js/websocket.js - WebSocket Connection and Message Handling

// --- State Variables (Assume these are available globally from chat.js) ---
// let ws; // WebSocket instance
// let isInsideThinkBlock = false;

// --- UI Functions (Assume these are available globally from ui.js) ---
// function addSystemMessage(content, type = 'info');
// function renderModelsList(models);
// function renderChatsList(chats);
// function createMessageElement(type, message_id, model_id = null);
// function addModelInfo(timestampElement, model_id);
// function ensureThinkingBoxExists(messageElement);
// function showThinkingIndicator(show);

// --- API Functions (Assume these are available globally from api.js) ---
// async function fetchModels();
// async function fetchChats();

// Connect to WebSocket server
function connect() {
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
            fetchModels().then(() => {
                fetchChats(); // fetchChats will handle loading or creating a chat
            });
        };

        ws.onmessage = function(event) {
            try {
                const message = JSON.parse(event.data);
                handleWebSocketMessage(message);
            } catch (error) {
                console.error('Error parsing WebSocket message:', error);
                // addSystemMessage("Error parsing server message."); // Replaced with console log
                console.error("[System WS] Error parsing server message.");
            }
        };

        ws.onclose = function(event) {
            console.log('Disconnected from server', event);
            if (event.code !== 1000) { // Don't show reconnect on normal close
                // addSystemMessage("Connection lost. Attempting to reconnect..."); // Replaced with console log
                console.warn("[System WS] Connection lost. Attempting to reconnect...");
                setTimeout(connect, 3000);
            } else {
                // addSystemMessage("Connection closed."); // Replaced with console log
                 console.log("[System WS] Connection closed normally.");
            }
        };

        ws.onerror = function(error) {
            console.error('WebSocket error:', error);
            // addSystemMessage("Connection error. Check console."); // Replaced with console log
            console.error("[System WS] Connection error. Check console.");
            // ws.onclose will handle reconnection attempts
        };
    } catch (error) {
        console.error('Error creating WebSocket:', error);
        // addSystemMessage(`Failed to create WebSocket connection: ${error.message}`); // Replaced with console log
        console.error("[System WS] Failed to create WebSocket connection: " + error.message);
        setTimeout(connect, 5000); // Retry connection after longer delay
    }
}

// Handle different types of WebSocket messages
function handleWebSocketMessage(message) {
    console.log('Received WS message:', message.type, message);

    switch (message.type) {
        case 'system':
            if (message.content_payload) {
                // addSystemMessage(message.content_payload.content); // Replaced with console log
                console.log(`[System WS Message]: ${message.content_payload.content}`);
            }
            break;

        case 'status':
            if (message.status_payload) {
                // addSystemMessage(`Status: ${message.status_payload.message}`, 'status'); // Replaced with console log
                console.log(`[System WS Status]: ${message.status_payload.message}`);
                // If status indicates processing finished, hide indicator
                if (message.status_payload.message.toLowerCase().includes('complete') || message.status_payload.message.toLowerCase().includes('finished')){
                     showThinkingIndicator(false);
                }
            }
            break;

        case 'user_message':
            if (message.message_payload) {
                console.log('User message confirmed by server:', message.message_payload);
                // Can update the temporary user message element with the final ID here if needed
                // const tempUserMsg = document.querySelector('.user-message:last-of-type'); // Risky selector
                // if(tempUserMsg && !tempUserMsg.id.startsWith('message-')) {
                //     tempUserMsg.id = `message-${message.message_payload.id}`;
                // }
            }
            break;

        case 'assistant_chunk':
            // The `data` field was used incorrectly before. The structure is likely:
            // { type: "assistant_chunk", timestamp: "...", chunk_payload: { chat_id: ..., message_id: ..., content: ..., is_final: ... } }
            console.log("[WS] Received assistant_chunk, processing payload:", message.chunk_payload);
            if (message.chunk_payload) {
                handleAssistantChunk(message.chunk_payload);
            } else {
                 console.warn("[WS] Received assistant_chunk message without chunk_payload", message);
            }
            break;

        case 'error':
            if (message.error_payload) {
                // addSystemMessage(`Error: ${message.error_payload.message}`, 'error'); // Replaced with console log
                console.error(`[System WS Error]: ${message.error_payload.message}`);
                showThinkingIndicator(false); // Hide indicator on error
            }
            break;

        case 'assistant_message':
            // Final confirmation message after streaming completes
            if (message.message_payload) {
                console.log('[Final Assistant Msg Received]:', message.message_payload);
                const finalPayload = message.message_payload;
                const messageElement = document.getElementById(`message-${finalPayload.id}`);
                if (messageElement) {
                    // Update raw content attribute for copy markdown
                    messageElement.dataset.rawContent = finalPayload.content;
                    // Update token count display
                    const tokenCountElement = messageElement.querySelector('.token-count');
                    if (tokenCountElement) {
                        tokenCountElement.textContent = `Tokens: ${finalPayload.tokens_used || 'N/A'}`;
                        tokenCountElement.style.display = 'inline'; // Show it
                    }
                    // Optional: Add a visual cue that the message is finalized
                    messageElement.classList.add('message-finalized');
                    setTimeout(() => messageElement.classList.remove('message-finalized'), 1000);
                } else {
                    console.warn("Received final assistant_message but element not found:", finalPayload.id);
                    // Potentially re-render if needed?
                }
                 // Ensure thinking indicator is off
                 showThinkingIndicator(false);
            }
            break;

        case 'model_list': // These might be handled via REST now
            if (message.model_list_payload) {
                modelsList = message.model_list_payload; // Update global state
                renderModelsList(modelsList); // Update UI
            }
            break;

        case 'chat_list': // These might be handled via REST now
            if (message.chat_list_payload) {
                chatsList = message.chat_list_payload; // Update global state
                renderChatsList(chatsList); // Update UI
            }
            break;

        case 'remove_message':
            // Payload structure based on ws/handler.go: RemovePayload
             if (message.remove_payload && message.remove_payload.message_id) {
                const messageIdToRemove = message.remove_payload.message_id;
                const elementToRemove = document.getElementById(`message-${messageIdToRemove}`);
                if (elementToRemove) {
                    console.log(`Removing message element: message-${messageIdToRemove}`);
                    elementToRemove.remove();
                } else {
                    console.warn(`Tried to remove message element message-${messageIdToRemove}, but it was not found.`);
                }
            } else {
                 console.warn("Received remove_message without valid payload", message);
            }
            break;

        default:
            console.log('Unknown WebSocket message type:', message.type);
    }
}

// Handle streaming chunks of assistant responses
function handleAssistantChunk(payload) {
    console.log(`[WS] handleAssistantChunk START - MsgID: ${payload.message_id}, Final: ${payload.is_final}, Content:`, JSON.stringify(payload.content));
    const { chat_id, message_id, content, is_final, model_id } = payload;

    if (currentChatId !== chat_id) {
         console.warn(`Received chunk for inactive chat ${chat_id}, current is ${currentChatId}. Ignoring.`);
         return; // Ignore chunks for non-active chats
    }

    // Hide thinking indicator as soon as the first chunk arrives
    showThinkingIndicator(false);

    let messageElement = document.getElementById(`message-${message_id}`);
    let contentElement;
    let isNewElement = false;
    let thinkingContentEl = null;
    let thinkingElement = null;

    if (!messageElement) {
        isNewElement = true;
        console.log(`[WS] Message element ${message_id} not found. Calling createMessageElement.`);
        // Use the UI function to create the element
        messageElement = createMessageElement('bot', message_id, model_id);
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

    // --- FIX: Ensure Model Info is Added/Updated ---
    // Check if model_id is available in the payload AND if the model info hasn't been added yet
    // or if the element is new.
    const timestampElement = messageElement.querySelector('.message-footer .timestamp');
    const modelInfoExists = timestampElement && timestampElement.querySelector('.model-info');

    if (model_id && timestampElement && (!modelInfoExists || isNewElement)) {
        console.log(`[WS] Adding/Updating model info for MsgID: ${message_id}, ModelID: ${model_id}`);
        // Call addModelInfo (from ui.js) to ensure the model name is displayed
        addModelInfo(timestampElement, model_id);
        // Also ensure the model ID is stored on the element's dataset if missing
        if (!messageElement.dataset.modelId) {
            messageElement.dataset.modelId = model_id;
        }
    }
    // --- END FIX ---

    // Append raw content for copy markdown (whole message)
    if (messageElement.dataset.rawContent !== undefined) {
        messageElement.dataset.rawContent += content;
    }

    // --- Process chunk for display ---
    let currentChunk = content;
    while (currentChunk.length > 0) {
        if (isInsideThinkBlock) {
            const endTagIndex = currentChunk.indexOf('</think>');
            let chunkToProcess;
            if (endTagIndex !== -1) {
                chunkToProcess = currentChunk.substring(0, endTagIndex);
                currentChunk = currentChunk.substring(endTagIndex + '</think>'.length);
                isInsideThinkBlock = false;
            } else {
                chunkToProcess = currentChunk;
                currentChunk = '';
            }
            if (chunkToProcess) {
                 thinkingContentEl = ensureThinkingBoxExists(messageElement); // UI function
                 thinkingElement = messageElement.querySelector('.thinking-content');
                 if (thinkingContentEl && thinkingElement) {
                    let rawThinking = thinkingElement._rawThinkingContent || '';
                    rawThinking += chunkToProcess;
                    thinkingElement._rawThinkingContent = rawThinking;
                    try {
                        thinkingContentEl.innerHTML = marked.parse(rawThinking);
                    } catch (error) {
                        console.error('Error parsing thinking markdown:', error);
                        thinkingContentEl.textContent = rawThinking;
                    }
                 }
            }
        } else { // Not inside think block
            const startTagIndex = currentChunk.indexOf('<think>');
            let chunkToProcess;
            if (startTagIndex !== -1) {
                chunkToProcess = currentChunk.substring(0, startTagIndex);
                currentChunk = currentChunk.substring(startTagIndex + '<think>'.length);
                isInsideThinkBlock = true;
                thinkingContentEl = ensureThinkingBoxExists(messageElement); // UI function
                thinkingElement = messageElement.querySelector('.thinking-content');
                if (thinkingElement) { thinkingElement._rawThinkingContent = ''; }
            } else {
                chunkToProcess = currentChunk;
                currentChunk = '';
            }
            if (chunkToProcess) {
                if (!contentElement) {
                     console.error("[Error] Content element is null!");
                     return;
                }
                let currentRaw = contentElement._rawContent || '';
                currentRaw += chunkToProcess;
                contentElement._rawContent = currentRaw;
                try {
                    contentElement.innerHTML = marked.parse(currentRaw);
                } catch (error) {
                    console.error('Error parsing regular markdown chunk:', error);
                    contentElement.textContent = currentRaw;
                }
            }
        }
    }
    // --- End Process chunk for display ---

    // Update timestamp and handle final state actions (UI function)
    console.log(`[WS] Calling updateTimestampAndFinalState for MsgID: ${message_id}, Final: ${is_final}`);
    updateTimestampAndFinalState(messageElement, contentElement, thinkingElement, is_final);

    // Scroll logic
    const shouldScroll = isNewElement || (chatHistory.scrollHeight - chatHistory.scrollTop <= chatHistory.clientHeight + 150);
    if (shouldScroll && chatHistory) {
        requestAnimationFrame(() => {
             requestAnimationFrame(() => {
                chatHistory.scrollTop = chatHistory.scrollHeight;
            });
        });
    }
}

// Helper function to update timestamp and handle final state actions
// MOVED HERE FROM ui.js
function updateTimestampAndFinalState(messageElement, contentElement, thinkingElement, is_final) {
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
}