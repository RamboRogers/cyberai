// ui/static/js/websocket.js - WebSocket Connection and Message Handling

// Create a namespace for WebSocket functions
const websocket = {};

// --- State Variables (These are available globally from chat.js) ---
// WebSocket instance (initialized later)
let ws = null;
let isConnecting = false; // Prevent multiple simultaneous connection attempts
let hasShownWelcome = false; // Track if we've already shown the welcome message
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
    // Prevent multiple simultaneous connection attempts
    if (isConnecting) {
        console.log("WebSocket connection already in progress, skipping...");
        return;
    }

    // If already connected, don't reconnect
    if (ws && ws.readyState === WebSocket.OPEN) {
        console.log("WebSocket already connected, skipping...");
        return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    console.log(`Attempting to connect to WebSocket at ${wsUrl}`);

    isConnecting = true;

    if (ws) {
        try { ws.close(); } catch (e) { console.error("Error closing WS:", e); }
    }

    try {
        ws = new WebSocket(wsUrl);

        ws.onopen = function() {
            console.log('Connected to server');
            console.log("[System WS] Connection established. CyberAI terminal ready.");
            isConnecting = false; // Reset connection flag

            // Only fetch initial data on first connection, not on reconnections
            if (!hasShownWelcome) {
                hasShownWelcome = true;
                // Fetch initial data after connection
                api.fetchModels().then(() => {
                    // Fetch chats AFTER models are fetched and processed by the handler
                    // The model_list handler should populate the dropdowns now.
                    api.fetchChats();
                });
            }
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
            isConnecting = false; // Reset connection flag

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
            isConnecting = false; // Reset connection flag on error
            // ws.onclose will handle reconnection attempts
        };
    } catch (error) {
        console.error('Error creating WebSocket:', error);
        console.error("[System WS] Failed to create WebSocket connection: " + error.message);
        isConnecting = false; // Reset connection flag on error
        setTimeout(websocket.connect, 5000); // Retry connection after longer delay
    }
};

// Add a method to check if WebSocket is connected and reconnect if needed
websocket.ensureConnected = function() {
    // If WebSocket doesn't exist or isn't open, reconnect
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        console.log("WebSocket not connected. Reconnecting...");
        websocket.connect();
        return false;
    }
    return true;
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
            const systemContent = message.content_payload?.content || 'System message received without content';

            // Filter out duplicate welcome messages
            if (systemContent.includes('Connected to CyberAI chat server')) {
                // Check if we already have this message in the chat
                const existingWelcomeMsg = document.querySelector('.message.system-message .content');
                if (existingWelcomeMsg && existingWelcomeMsg.textContent.includes('Connected to CyberAI chat server')) {
                    console.log('Skipping duplicate welcome message');
                    break; // Skip adding duplicate welcome message
                }
            }

            ui.addSystemMessage(systemContent);
            break;
        case 'status':
            // Handle both payload structures for backward compatibility
            const statusMessage = message.status_payload?.message || message.data?.message || 'Status update received';
            console.log('Status Update:', statusMessage);
            // Show thinking indicator during status updates (this is the key fix for OpenAI models)
            ui.showThinkingIndicator(true);
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
            // Remove any temporary search system messages
            document.querySelectorAll('[id^="search-system-"]').forEach(el => el.remove());

            // Render the complete assistant message
            const assistantMsg = message.message_payload;
            if (assistantMsg) {
                // --- ADDED: Finalize the thinking block before rendering ---
                console.log(`[WS assistant_message] Finalizing thinking block for message: ${assistantMsg.id}`);
                websocket.finalizeThinkingBlock(assistantMsg.id);
                // --- END ADDED ---

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
            // Remove any temporary search system messages when first chunk arrives
            if (document.querySelectorAll('[id^="search-system-"]').length > 0) {
                document.querySelectorAll('[id^="search-system-"]').forEach(el => el.remove());
            }

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

    // Hide thinking indicator only when we get actual content (not just when function is called)
    // This is moved down to where we actually process content chunks

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
    let currentChunk = content;

    // Hide thinking indicator when we start processing actual content
    if (content && content.length > 0) {
        ui.showThinkingIndicator(false);
    }

    // Get references INSIDE the loop to ensure they are fresh if elements are created mid-chunk
    thinkingElement = messageElement.querySelector('.thinking-block');
    thinkingContentEl = thinkingElement ? thinkingElement.querySelector('.thinking-content-text') : null;

    while (currentChunk.length > 0) {
        if (isInsideThinkBlock) {
            // Find end tag
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
                // --- DEBUG LOGGING ---
                console.log(`[WS Think Stream] Chunk: \"${chunkToProcess.substring(0, 50)}...\"`);
                console.log(`[WS Think Stream] thinkingElement found: ${!!thinkingElement}`);
                console.log(`[WS Think Stream] thinkingContentEl found: ${!!thinkingContentEl}`);
                // --- END DEBUG LOGGING ---

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
        } else { // We are OUTSIDE a think block
            // Find start tag
            const startTagIndex = currentChunk.indexOf('<think>');
            let chunkToProcess;
            if (startTagIndex !== -1) {
                chunkToProcess = currentChunk.substring(0, startTagIndex);
                currentChunk = currentChunk.substring(startTagIndex + '<think>'.length);
                // --- Transitioning INTO think block ---
                isInsideThinkBlock = true;
                // Ensure the block and inner element exist *now*
                thinkingContentEl = ui.ensureThinkingBoxExists(messageElement); // Create/get inner
                // thinkingElement will be found in the next loop iteration
                if (thinkingContentEl) {
                    // Initialize raw buffer directly on the element found/created by ensureThinkingBoxExists's parent
                    const parentBlock = thinkingContentEl.closest('.thinking-block');
                    if(parentBlock) parentBlock._rawThinkingContent = '';
                } else {
                    console.error("[WS] Stream: Failed to get thinkingContentEl immediately after ensureThinkingBoxExists.");
                }
                // ------------------------------------
            } else {
                chunkToProcess = currentChunk; // Process entire chunk
                currentChunk = '';
            }
            if (chunkToProcess) {
                // Append to the main content element's raw buffer
                contentElement._rawContent += chunkToProcess;
                try {
                    const processedContent = contentElement._rawContent.replace(/\\\\boxed\\{([^}]+)\\}/g, '<span class="boxed-answer">$1</span>');
                    // Parse the accumulated raw content and render as HTML INSIDE the markdown wrapper
                    contentElement.innerHTML = `<div class="markdown-content">${marked.parse(processedContent, { gfm: true, breaks: true })}</div>`;
                    // *** ADDED: Set links to open in new tab AFTER updating innerHTML ***
                    ui.setLinksToOpenInNewTab(contentElement.querySelector('.markdown-content'));
                } catch (error) {
                    console.error('Error parsing regular markdown chunk:', error);
                    // Fallback: render accumulated raw content as text, still wrap
                    contentElement.innerHTML = `<div class="markdown-content">${contentElement._rawContent}</div>`;
                    // *** ADDED: Also apply to fallback content ***
                    ui.setLinksToOpenInNewTab(contentElement.querySelector('.markdown-content'));
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

        // --- UPDATED: Replace thinking spinner with static icon and update label ---
        const thinkingBlock = messageElement.querySelector('.thinking-block'); // Find parent block
        if (thinkingBlock) {
            const thinkingSpinner = thinkingBlock.querySelector('.thinking-spinner-icon');
            const labelTextSpan = thinkingBlock.querySelector('.label-text');

            if (thinkingSpinner) {
                // Create the static SVG icon element
                const staticIconSVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="h-3 w-3 text-primary"><path fill-rule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0ZM8.25 7.5a.75.75 0 0 1 .75.75v2.5h3a.75.75 0 0 1 0 1.5h-3a.75.75 0 0 1-.75-.75V8.25a.75.75 0 0 1 .75-.75Z" clip-rule="evenodd" /></svg>';
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = staticIconSVG;
                const staticIconElement = tempDiv.firstChild;

                if (staticIconElement) {
                    thinkingSpinner.replaceWith(staticIconElement);
                    console.log(`[WS] Replaced thinking spinner with static icon for message ${message_id}.`);
                }
            } else {
                 console.log(`[WS] Final chunk: Thinking spinner not found for message ${message_id}.`);
            }

            if (labelTextSpan) {
                 labelTextSpan.textContent = 'Thinking Process';
                 console.log(`[WS] Updated label to "Thinking Process" for message ${message_id}.`);
            }
        }
        // --- END UPDATED ---

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

        // Update the content area of the thinking box or main content
        if (thinkingContentEl && !is_final) {
            // Append chunk to the temporary thinking box content
            thinkingContentEl.innerHTML = marked.parse(messageElement._rawContent + '█', { gfm: true, breaks: true });
        } else if (is_final) {
            // When final, remove the temporary thinking box and render the full message
            const tempThinkingBox = messageElement.querySelector('.thinking-content');
            if (tempThinkingBox) {
                console.log("[WebSocket] Removing temporary thinking box for final render:", message_id);
                tempThinkingBox.remove();
            }

            // Construct the final message object to pass to renderMessage
            const finalMessageData = {
                id: message_id,
                chat_id: chat_id,
                role: 'assistant',
                content: messageElement.dataset.rawContent, // Use the full accumulated raw content from the dataset
                model_id: model_id || messageElement.dataset.modelId, // Use ID from chunk or element
                created_at: messageElement.querySelector('.timestamp')?.dataset.timestamp || new Date().toISOString(), // Use existing or now
                tokens_used: tokens_used // Add token count if available in the final chunk (Needs API support)
            };

            // Defer the final render slightly to ensure temporary box removal is processed
            setTimeout(() => {
                console.log("[WebSocket] Rendering final message with ui.renderMessage (deferred):", message_id);
                ui.renderMessage(finalMessageData);

                // Clear the internal raw content dataset attribute after final render
                // Note: _rawContent on contentElement was likely already deleted by updateTimestampAndFinalState
                 if (messageElement.dataset.rawContent) {
                     delete messageElement.dataset.rawContent; // Clean up dataset attribute
                 }

            }, 0); // Delay of 0 ms, pushes execution to end of event loop
        }

        // Always scroll down if user hasn't scrolled up
        if (shouldScroll) {
            ui.scrollToBottom(chatHistory);
        }
    }
};

// NEW HELPER FUNCTION: Finalizes the thinking block UI
websocket.finalizeThinkingBlock = function(message_id) {
    const thinkingBlockId = `thinking-block-${message_id}`;
    const thinkingBlock = document.getElementById(thinkingBlockId);

    if (thinkingBlock) {
        console.log(`[WS Finalize Helper] Finalizing thinking block: ${thinkingBlockId}`);

        // Use requestAnimationFrame to ensure DOM is updated before searching/manipulating spinner
        requestAnimationFrame(() => {
            console.log(`[WS Finalize Helper] Running deferred finalization for ${thinkingBlockId}`);
            const spinner = thinkingBlock.querySelector('.thinking-spinner-icon');
            const labelText = thinkingBlock.querySelector('.label-text');

            console.log(`[WS Finalize Helper - Deferred] Found spinner: ${!!spinner}`);
            console.log(`[WS Finalize Helper - Deferred] Found label text: ${!!labelText}`);

            if (spinner) {
                console.log(`[WS Finalize Helper - Deferred] Replacing spinner element with checkmark emoji for ${thinkingBlockId}`);
                // Directly replace the spinner SVG element with the checkmark text node
                spinner.replaceWith(document.createTextNode('✅ '));
                console.log(`[WS Finalize Helper - Deferred] Spinner replaced with checkmark (check UI).`);
            } else {
                console.log(`[WS Finalize Helper - Deferred] Spinner element not found, cannot replace with checkmark.`);
            }
            if (labelText) {
                // Keep label as "Thinking..." based on previous feedback
                 console.log(`[WS Finalize Helper - Deferred] Skipping label text update to "Thinking Process".`);
            }
            thinkingBlock.dataset.status = 'final';

            // Clean up temporary buffer if it exists (safe to do here)
            if (thinkingBlock._rawThinkingContent) {
                delete thinkingBlock._rawThinkingContent;
            }
        }); // End of requestAnimationFrame

    } else {
        console.log(`[WS Finalize Helper] No thinking block found with ID ${thinkingBlockId} to finalize.`);
    }
};

// Helper function to update timestamp and handle final state actions
// Was previously in ui.js - NOW MOSTLY HANDLED WITHIN handleAssistantChunk
websocket.updateTimestampAndFinalState = function(messageElement, contentElement, thinkingElement, is_final) {

    // Update timestamp (happens on every chunk, including final)
    const timestampSpan = messageElement.querySelector('.message-footer .timestamp');
    if (timestampSpan) {
        const timeString = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        timestampSpan.childNodes.forEach(node => {
            if (node.nodeType === Node.TEXT_NODE) {
                node.nodeValue = timeString + ' '; // Add space before potential badge
            }
        });
        timestampSpan.dataset.timestamp = new Date().toISOString();
    } else {
        console.warn("Could not find timestamp span in footer for message:", messageElement.id);
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