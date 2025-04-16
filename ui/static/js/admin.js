// Admin Panel JavaScript for CyberAI
document.addEventListener('DOMContentLoaded', function() {
    // Tab System
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabName = button.getAttribute('data-tab');

            // Update active tab button
            tabButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');

            // Show active tab content
            tabContents.forEach(content => {
                content.classList.remove('active');
                if (content.id === `${tabName}-tab`) {
                    content.classList.add('active');
                }
            });
        });
    });

    // DOM Elements - Models Tab
    const modelList = document.getElementById('model-list');
    const addModelBtn = document.getElementById('add-model-btn');
    const importOllamaBtn = document.getElementById('import-ollama-btn');
    const modelModal = document.getElementById('model-modal');
    const modelForm = document.getElementById('model-form');
    const modalTitle = document.getElementById('modal-title');
    const cancelBtn = document.getElementById('cancel-btn');
    const modelCloseModalBtns = document.querySelectorAll('#model-modal .close');
    const confirmModal = document.getElementById('confirm-modal');
    const confirmYesBtn = document.getElementById('confirm-yes');
    const confirmCancelBtn = document.getElementById('confirm-cancel');
    const confirmCloseBtn = document.querySelector('#confirm-modal .close');
    const providerSelect = document.getElementById('provider');
    const modelProviderSelect = document.getElementById('model-provider-id');
    const temperatureSlider = document.getElementById('temperature');
    const temperatureOutput = document.getElementById('temperature-output');
    const modelSearch = document.getElementById('model-search');
    const providerFilterSelect = document.getElementById('provider-filter');
    const activeOnlyCheckbox = document.getElementById('active-only');
    const maxTokensInput = document.getElementById('max-tokens');
    const presetTokenButtons = document.querySelectorAll('.preset-btn');

    // Temperature N/A Elements
    const temperatureNACheckbox = document.getElementById('temperature-na');
    const temperatureControlsDiv = document.getElementById('temperature-controls');

    // Ollama import modal elements
    const ollamaImportModal = document.getElementById('ollama-import-modal');
    const ollamaImportForm = document.getElementById('ollama-import-form');
    const ollamaServerUrl = document.getElementById('ollama-server-url');
    const ollamaApiKey = document.getElementById('ollama-api-key');
    const ollamaDefaultTokens = document.getElementById('ollama-default-tokens');
    const importAllActive = document.getElementById('import-all-active');
    const ollamaImportSubmit = document.getElementById('ollama-import-submit');
    const ollamaImportCancel = document.getElementById('ollama-import-cancel');
    const ollamaModalCloseBtns = document.querySelectorAll('#ollama-import-modal .close');

    // DOM Elements - Users Tab
    const userList = document.getElementById('user-list');
    const addUserBtn = document.getElementById('add-user-btn');
    const userModal = document.getElementById('user-modal');
    const userForm = document.getElementById('user-form');
    const userModalTitle = document.getElementById('user-modal-title');
    const userCancelBtn = document.getElementById('user-cancel-btn');
    const userCloseModalBtns = document.querySelectorAll('#user-modal .close');
    const userSearch = document.getElementById('user-search');
    const roleFilter = document.getElementById('role-filter');
    const userActiveOnlyCheckbox = document.getElementById('user-active-only');
    const changePasswordBtn = document.getElementById('change-password-btn'); // Added

    // DOM Elements - Change Password Modal
    const changePasswordModal = document.getElementById('change-password-modal');
    const changePasswordForm = document.getElementById('change-password-form');
    const changePasswordUserIdInput = document.getElementById('change-password-user-id');
    const changePasswordModalTitle = document.getElementById('change-password-modal-title');
    const newPasswordInput = document.getElementById('new-password');
    const confirmPasswordInput = document.getElementById('confirm-password');
    const changePasswordCancelBtn = document.getElementById('change-password-cancel-btn');
    const changePasswordCloseBtns = document.querySelectorAll('.change-password-close');

    // DOM Elements - Roles Tab
    const roleList = document.getElementById('role-list');

    // --- NEW: DOM Elements - Providers Tab ---
    const providersListElement = document.getElementById('provider-list');
    const addProviderBtn = document.getElementById('add-provider-btn');
    const providerModal = document.getElementById('provider-modal');
    const providerForm = document.getElementById('provider-form');
    const providerModalTitle = document.getElementById('provider-modal-title');
    const providerCancelBtn = document.getElementById('provider-cancel-btn');
    const providerCloseModalBtns = document.querySelectorAll('#provider-modal .close');
    const providerTypeSelect = document.getElementById('provider-type'); // For conditional fields

    // Current item being edited/deleted
    let currentModelId = null;
    let currentUserId = null;
    let currentAction = null;
    let currentItemType = null;

    // Event Listeners - Models
    addModelBtn.addEventListener('click', () => openModelModal('add'));
    cancelBtn.addEventListener('click', closeModelModal);
    modelCloseModalBtns.forEach(btn => btn.addEventListener('click', closeModelModal));
    modelForm.addEventListener('submit', handleModelFormSubmit);
    temperatureSlider.addEventListener('input', updateTemperatureOutput);
    modelSearch.addEventListener('input', filterModels);
    providerFilterSelect.addEventListener('change', () => {
        console.log("Provider filter changed to:", providerFilterSelect.value);
        filterModels();
    });
    activeOnlyCheckbox.addEventListener('change', () => {
        console.log("Active only changed to:", activeOnlyCheckbox.checked);
        filterModels();
    });

    // Add event listeners for preset token buttons
    presetTokenButtons.forEach(button => {
        button.addEventListener('click', () => {
            if (maxTokensInput) {
                maxTokensInput.value = button.getAttribute('data-value');
            }
        });
    });

    // Add event listener for Temperature N/A checkbox
    if (temperatureNACheckbox) {
        temperatureNACheckbox.addEventListener('change', () => {
            const isChecked = temperatureNACheckbox.checked;
            if (temperatureControlsDiv) {
                 temperatureControlsDiv.style.opacity = isChecked ? '0.5' : '1';
            }
            if (temperatureSlider) {
                temperatureSlider.disabled = isChecked;
                if (isChecked) {
                    temperatureSlider.value = 0;
                    if (temperatureOutput) {
                        temperatureOutput.value = 0;
                    }
                } else {
                    // Optionally restore a default value or leave as is
                    temperatureSlider.value = 0.8; // Reset to default if unchecked
                    if (temperatureOutput) {
                        temperatureOutput.value = 0.8;
                    }
                }
            }
        });
    } else {
        console.warn("Temperature N/A checkbox not found.");
    }

    // Event Listeners - Users
    addUserBtn.addEventListener('click', () => openUserModal('add'));
    userCancelBtn.addEventListener('click', closeUserModal);
    userCloseModalBtns.forEach(btn => btn.addEventListener('click', closeUserModal));
    userForm.addEventListener('submit', handleUserFormSubmit);
    userSearch.addEventListener('input', filterUsers);
    roleFilter.addEventListener('change', filterUsers);
    userActiveOnlyCheckbox.addEventListener('change', filterUsers);

    // Listener for Change Password button within User Edit modal
    if (changePasswordBtn) {
        changePasswordBtn.addEventListener('click', () => {
            const userId = document.getElementById('user-id').value;
            const username = document.getElementById('username').value;
            if (userId) {
                openChangePasswordModal(userId, username);
            }
        });
    }

    // Event Listeners - Change Password Modal
    if (changePasswordForm) {
        changePasswordForm.addEventListener('submit', handleChangePasswordSubmit);
    }
    if (changePasswordCancelBtn) {
        changePasswordCancelBtn.addEventListener('click', closeChangePasswordModal);
    }
    changePasswordCloseBtns.forEach(btn => btn.addEventListener('click', closeChangePasswordModal));

    // Event Listeners - Confirmation Modal
    confirmCancelBtn.addEventListener('click', closeConfirmModal);
    confirmCloseBtn.addEventListener('click', closeConfirmModal);
    confirmYesBtn.addEventListener('click', handleConfirmAction);

    // Event Listeners - Ollama Import
    if (importOllamaBtn) {
        importOllamaBtn.addEventListener('click', handleOllamaImport);
    }

    // --- NEW: Event Listeners - Providers ---
    if (addProviderBtn) {
        addProviderBtn.addEventListener('click', () => openProviderModal('add'));
    }
    if (providerCancelBtn) {
        providerCancelBtn.addEventListener('click', closeProviderModal);
    }
    if (providerCloseModalBtns) {
        providerCloseModalBtns.forEach(btn => btn.addEventListener('click', closeProviderModal));
    }
    if (providerForm) {
        providerForm.addEventListener('submit', handleProviderFormSubmit);
    }
    if (providerTypeSelect) {
        providerTypeSelect.addEventListener('change', toggleProviderConditionalFields);
    }

    // Initial Load - Use Promise.all to wait for all loads before hiding main indicator
    function initialLoad() {
        showLoading(); // Show main loader
        Promise.all([
            // Modify loading functions to return their fetch promise
            loadProvidersPromise(),
            loadModelsPromise(),
            loadUsersPromise(),
            loadRolesPromise()
        ])
        .then(() => {
            console.log("Initial data load complete.");
            // Any setup that depends on all data being loaded can go here
        })
        .catch(error => {
            console.error("Error during initial data load:", error);
            showError("Failed to load initial admin data. Please refresh.");
            // Optionally hide loading even on error, or leave it showing
        })
        .finally(() => {
            hideLoading(); // Hide main loader once all promises settle
        });
    }

    // --- Modified Load Functions to Return Promises ---

    function loadProvidersPromise() {
        // No showLoading/hideLoading here, handled by initialLoad
        return fetch('/api/admin/providers')
            .then(response => {
                if (!response.ok) throw new Error('Failed to load providers');
                return response.json();
            })
            .then(providers => {
                const providerArray = Array.isArray(providers) ? providers : [];
                renderProviders(providerArray);
                populateModelProviderDropdown(providerArray); // For model modal
                populateModelFilterDropdown(providerArray);   // For model list filter
                // Do not call hideLoading here
            }); // Catch is handled by Promise.all
    }

     function loadModelsPromise() {
        // No showLoading/hideLoading here
        return fetch('/api/admin/models')
            .then(response => {
                if (!response.ok) {
                    throw new Error('Failed to load models');
                }
                return response.json();
            })
            .then(models => {
                renderModels(Array.isArray(models) ? models : []);
                 // Do not call hideLoading here
            }); // Catch is handled by Promise.all
    }

    function loadUsersPromise() {
        // No showLoading/hideLoading here
        return fetch('/api/admin/users')
            .then(response => {
                if (!response.ok) {
                    throw new Error('Failed to load users');
                }
                return response.json();
            })
            .then(users => {
                renderUsers(Array.isArray(users) ? users : []);
                populateRoleFilter(Array.isArray(users) ? users : []);
                 // Do not call hideLoading here
            }); // Catch is handled by Promise.all
    }

     function loadRolesPromise() {
        // No showLoading/hideLoading here
        return fetch('/api/admin/roles')
            .then(response => {
                if (!response.ok) {
                    throw new Error('Failed to load roles');
                }
                return response.json();
            })
            .then(roles => {
                renderRoles(Array.isArray(roles) ? roles : []);
                populateRoleSelectOptions(Array.isArray(roles) ? roles : []);
                 // Do not call hideLoading here
            }); // Catch is handled by Promise.all
    }

    // --- Call Initial Load ---
    initialLoad();

    // Functions
    function loadModels() {
        showLoading();
        console.log("[loadModels] Starting fetch..."); // Log start

        fetch('/api/admin/models') // CORRECTED PATH
            .then(response => {
                console.log(`[loadModels] Received response status: ${response.status}`); // Log status
                if (!response.ok) {
                    console.error(`[loadModels] Fetch failed with status: ${response.status}`);
                    throw new Error('Failed to load models');
                }
                console.log("[loadModels] Response OK, attempting to parse JSON..."); // Log before JSON parsing
                return response.json();
            })
            .then(models => {
                // Ensure models is an array before rendering
                console.log("[loadModels] JSON parsed successfully. Received models data:", JSON.stringify(models, null, 2)); // Log received data
                renderModels(Array.isArray(models) ? models : []);
            })
            .catch(error => {
                console.error("[loadModels] Error caught:", error); // Log caught errors
                showError(error.message);
            })
            .finally(() => {
                console.log("[loadModels] Fetch finished (finally block)."); // Log finish
                hideLoading();
            });
    }

    function renderModels(models) {
        if (!modelList) return;
        if (models.length === 0) {
            modelList.innerHTML = '<div class="no-results">No models found. Add a provider and sync or add a model manually.</div>';
            return;
        }

        modelList.innerHTML = '';

        // For debugging
        console.log('Rendering models:', models.map(m => ({id: m.id, name: m.name, provider_id: m.provider_id})));

        models.forEach(model => {
            const card = document.createElement('div');
            card.className = 'model-card';
            card.dataset.id = model.id;

            // Use provider info from the joined data
            const providerName = model.provider ? model.provider.name : `Provider ID: ${model.provider_id}`;
            const providerType = model.provider ? model.provider.type : 'unknown';

            // Ensure provider_id is stored as a string
            const providerId = String(model.provider_id);

            card.dataset.provider = providerType; // For filtering by type
            card.dataset.providerId = providerId; // For filtering by provider ID
            card.dataset.active = model.is_active;
            card.dataset.name = model.name;

            console.log(`Model ${model.name} assigned provider ID: ${providerId}`);

            // Format the last synced date
            let formattedLastSynced = 'Never';
            if (model.last_synced_at) {
                try {
                    const syncDate = new Date(model.last_synced_at);
                    // Check if the date is valid
                    if (!isNaN(syncDate.getTime())) {
                        formattedLastSynced = syncDate.toLocaleString();
                    } else {
                        console.error(`Invalid date format for last_synced_at: ${model.last_synced_at} for model ${model.name}`);
                        formattedLastSynced = 'Invalid Date'; // Keep it explicit
                    }
                } catch (e) {
                    console.error(`Error parsing date for model ${model.name}:`, model.last_synced_at, e);
                    formattedLastSynced = 'Parsing Error';
                }
            }

            card.innerHTML = `
                <div class="model-provider ${providerType}">${escapeHtml(providerName)}</div>
                <h3>${escapeHtml(model.name)}</h3>
                <div class="model-card-details">
                    <p class="model-id-container">
                        <span class="model-id-label">Model ID:</span>
                        <code class="model-id-value">${escapeHtml(model.model_id)}</code>
                    </p>
                    <p>Provider ID: <span>${providerId}</span></p>
                    <p>Max Tokens: <span>${model.max_tokens.toLocaleString()}</span></p>
                    <p>Temp: <span>${model.temperature}</span></p>
                    <p>Status: <span class="status-badge ${model.is_active ? 'active' : 'inactive'}">${model.is_active ? 'Active' : 'Inactive'}</span></p>
                    <p>Last Synced: <span>${formattedLastSynced}</span></p>
                </div>
                <div class="model-card-actions">
                    <button class="cyber-btn toggle-btn ${model.is_active ? 'warning' : 'success'}"
                            data-action="toggle"
                            data-id="${model.id}"
                            data-active="${model.is_active}">
                        <span class="btn-icon">${model.is_active ? '⏻' : '⭘'}</span>
                        ${model.is_active ? 'Disable' : 'Enable'}
                    </button>
                    <button class="cyber-btn" data-action="edit" data-id="${model.id}">Edit</button>
                    <button class="cyber-btn danger" data-action="delete" data-id="${model.id}">Delete</button>
                </div>
            `;
            modelList.appendChild(card);

            // Add event listeners
            card.querySelector('[data-action="edit"]').addEventListener('click', () => editModel(model.id));
            card.querySelector('[data-action="delete"]').addEventListener('click', () => deleteModel(model.id));
            const toggleBtn = card.querySelector('[data-action="toggle"]');
            if (toggleBtn) {
                toggleBtn.addEventListener('click', (event) => {
                    const button = event.currentTarget;
                    const currentIsActive = button.dataset.active === 'true';
                    // Pass the *new desired state* to the toggle function
                    toggleModelStatus(model.id, !currentIsActive);
                });
            }
        });
        // Re-apply filters if needed
        filterModels();
    }

    function openModelModal(action, modelId = null) {
        const modal = document.getElementById('model-modal');
        const modalTitle = document.getElementById('modal-title');

        modalTitle.textContent = action === 'add' ? 'Add New Model' : 'Edit Model';

        // Clear the form
        document.getElementById('model-form').reset();
        document.getElementById('model-id').value = '';

        if (action === 'edit' && modelId) {
            fetchModelDetails(modelId);
        }

        // Show the modal
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function closeModelModal() {
        const modal = document.getElementById('model-modal');
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }

    function fetchModelDetails(modelId) {
        showLoading();
        fetch(`/api/admin/models/${modelId}`) // CORRECTED PATH
            .then(response => {
                if (!response.ok) {
                    throw new Error('Failed to fetch model details');
                }
                return response.json();
            })
            .then(model => {
                populateModelForm(model);
                hideLoading();
            })
            .catch(error => {
                console.error('Error fetching model details:', error);
                showError('Failed to load model details: ' + error.message);
                hideLoading();
            });
    }

    function populateModelForm(model) {
        // Load provider dropdown first if needed
        loadProvidersAndPopulateDropdown(() => {
            // Now populate the form fields
            document.getElementById('model-id').value = model.id;
            document.getElementById('model-provider-id').value = model.provider_id;
            document.getElementById('name').value = model.name;
            document.getElementById('model_id').value = model.model_id;
            document.getElementById('max-tokens').value = model.max_tokens;

            // Handle temperature and N/A checkbox
            const tempValue = model.temperature; // Store original value
            const tempIsNA = tempValue === 0; // Consider 0 as N/A

            if (temperatureNACheckbox) {
                temperatureNACheckbox.checked = tempIsNA;
                // Trigger change event to update disabled state and values
                temperatureNACheckbox.dispatchEvent(new Event('change'));
            }

            // Set slider and output, even if initially disabled
            if (temperatureSlider) {
                temperatureSlider.value = tempIsNA ? 0 : tempValue;
            }
            if (temperatureOutput) {
                temperatureOutput.value = tempIsNA ? 0 : tempValue;
            }

            document.getElementById('system-prompt').value = model.default_system_prompt || '';
            document.getElementById('is-active').checked = model.is_active;
        });
    }

    function handleModelFormSubmit(event) {
        event.preventDefault();

        const modelData = buildModelData();

        if (!modelData) {
            console.warn("buildModelData returned null, aborting form submission.");
            return;
        }

        // --- Determine action and model ID locally --- START
        const modelId = document.getElementById('model-id').value;
        const action = modelId ? 'update' : 'add';
        // --- Determine action and model ID locally --- END

        if (!validateModelData(modelData, action)) {
            console.log("Model validation failed.");
            return;
        }

        const apiCall = action === 'add'
            ? addNewModel(modelData)
            : updateModel(modelId, modelData);

        apiCall
            .then(() => {
                showSuccess(`Model ${action === 'add' ? 'added' : 'updated'} successfully.`);
                closeModelModal();
                loadModels(); // Refresh list
            })
            .catch(error => {
                console.error(`Error ${action} model:`, error);
                showError(`Failed to ${action} model: ${error.message}`);
            });
    }

    function buildModelData() {
        const providerIdElement = document.getElementById('model-provider-id');
        const nameElement = document.getElementById('name');
        const modelIdElement = document.getElementById('model_id'); // Potential null element
        const maxTokensElement = document.getElementById('max-tokens');
        const temperatureElement = document.getElementById('temperature');
        const systemPromptElement = document.getElementById('system-prompt');
        const isActiveElement = document.getElementById('is-active');

        // Check if critical elements exist before accessing .value
        if (!modelIdElement) {
            console.error("Error: Element with ID 'model_id' not found in the DOM.");
            showError("An error occurred: Cannot find model ID input element.");
            return null; // Indicate failure
        }
        if (!providerIdElement || !nameElement || !maxTokensElement || !temperatureElement || !systemPromptElement || !isActiveElement) {
             console.error("Error: One or more critical form elements not found.");
             showError("An error occurred: Missing form elements.");
             return null; // Indicate failure
        }

        // Read temperature, considering the N/A checkbox
        let temperatureValue;
        if (temperatureNACheckbox && temperatureNACheckbox.checked) {
            temperatureValue = 0;
        } else {
            temperatureValue = parseFloat(temperatureElement.value);
        }

        // Now it should be safe to access .value
        return {
            provider_id: parseInt(providerIdElement.value),
            name: nameElement.value,
            model_id: modelIdElement.value,
            max_tokens: parseInt(maxTokensElement.value),
            temperature: temperatureValue, // Use potentially modified value
            default_system_prompt: systemPromptElement.value,
            is_active: isActiveElement.checked,
            configuration: {} // Default empty config for now
        };
    }

    function validateModelData(modelData, action) {
        if (action === 'add' && !modelData.provider_id) {
            showError('Please select a provider for the new model.');
            return false;
        }
        if (!modelData.name) {
            showError('Please enter a model name');
            return false;
        }
        if (!modelData.model_id) {
            showError('Please enter the provider-specific model ID');
            return false;
        }
        if (isNaN(modelData.max_tokens) || modelData.max_tokens <= 0) {
            showError('Max Tokens must be a positive number.');
            return false;
        }
        return true;
    }

    function addNewModel(modelData) {
        showLoading();
        return fetch('/api/admin/models', { // CORRECTED PATH
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(modelData)
        })
            .then(response => {
                if (!response.ok) {
                    return response.json().then(data => {
                        throw new Error(data.error || 'Failed to add model');
                    });
                }
                return response.json();
            })
            .catch(error => {
                showError(error.message);
            })
            .finally(() => {
                hideLoading();
            });
    }

    function updateModel(modelId, modelData) {
        showLoading();
        return fetch(`/api/admin/models/${modelId}`, { // CORRECTED PATH
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(modelData)
        })
            .then(response => {
                if (!response.ok) {
                    return response.json().then(data => {
                        throw new Error(data.error || 'Failed to update model');
                    });
                }
                return response.json();
            })
            .catch(error => {
                showError(error.message);
            })
            .finally(() => {
                hideLoading();
            });
    }

    function editModel(modelId) {
        openModelModal('edit', modelId);
    }

    function deleteModel(modelId) {
        openConfirmModal('Are you sure you want to delete this model?', 'delete', modelId);
    }

    function performDeleteModel(modelId) {
        showLoading();
        return fetch(`/api/admin/models/${modelId}`, { // CORRECTED PATH
            method: 'DELETE'
        })
            .then(response => {
                if (!response.ok) {
                    throw new Error('Failed to delete model');
                }
                showSuccess('Model deleted successfully');
                loadModels();
            })
            .catch(error => {
                showError(error.message);
            })
            .finally(() => {
                hideLoading();
            });
    }

    function filterModels() {
        const searchTerm = modelSearch.value.toLowerCase();
        const providerIdFilter = providerFilterSelect.value; // Use the updated select
        const activeOnly = activeOnlyCheckbox.checked;

        // Clear debug info
        console.clear();
        console.log('==== Filter Models ====');
        console.log('Provider Filter Value:', providerIdFilter, typeof providerIdFilter);
        console.log('Active Only:', activeOnly);
        console.log('Search Term:', searchTerm);

        const cards = document.querySelectorAll('.model-card');
        console.log(`Total cards: ${cards.length}`);

        let matched = 0;
        let hiddenByProvider = 0;
        let hiddenByActive = 0;
        let hiddenBySearch = 0;

        cards.forEach(card => {
            const name = card.dataset.name.toLowerCase();
            const cardProviderId = card.dataset.providerId; // Use providerId dataset
            const isActive = card.dataset.active === "true";

            // Debug provider IDs in the cards
            console.log(`Card: ${name} | Provider ID: ${cardProviderId} | Active: ${isActive}`);

            const matchesSearch = name.includes(searchTerm);
            if (!matchesSearch) hiddenBySearch++;

            // Improved comparison logic for provider filtering
            const matchesProvider = !providerIdFilter || providerIdFilter === '' ||
                                    cardProviderId === providerIdFilter;
            if (!matchesProvider) hiddenByProvider++;

            const matchesActive = !activeOnly || isActive;
            if (!matchesActive) hiddenByActive++;

            const shouldShow = matchesSearch && matchesProvider && matchesActive;

            if (shouldShow) {
                matched++;
                card.style.display = '';
            } else {
                card.style.display = 'none';
            }
        });

        console.log(`Matched: ${matched} | Hidden by provider: ${hiddenByProvider} | Hidden by active: ${hiddenByActive} | Hidden by search: ${hiddenBySearch}`);

        // Show "no results" message if all cards are hidden
        const visibleCards = document.querySelectorAll('.model-card:not([style*="display: none"])');
        let noResults = modelList.querySelector('.no-results-filter'); // Check if message exists

        if (visibleCards.length === 0 && cards.length > 0) {
            if (!noResults) {
                noResults = document.createElement('div');
                noResults.className = 'no-results-filter';
                noResults.textContent = 'No models match your filter criteria.';
                modelList.appendChild(noResults);
            }
        } else {
            if (noResults) {
                noResults.remove();
            }
        }
    }

    function toggleProviderConditionalFields() {
        const providerType = providerTypeSelect.value;
        const baseUrlGroup = document.getElementById('provider-base-url')?.closest('.form-group');
        const apiKeyGroup = document.getElementById('provider-api-key')?.closest('.form-group');
        const baseUrlInput = document.getElementById('provider-base-url');
        const apiKeyInput = document.getElementById('provider-api-key');

        // Hide all conditional fields by default
        if(baseUrlGroup) baseUrlGroup.style.display = 'none';
        if(apiKeyGroup) apiKeyGroup.style.display = 'none';

        // Reset required attributes
        if (baseUrlInput) baseUrlInput.required = false;
        if (apiKeyInput) apiKeyInput.required = false;

        // Show fields based on provider type
        if (providerType === 'ollama') {
            // Ollama requires base URL and optionally API key
            if (baseUrlGroup) baseUrlGroup.style.display = 'block';
            if (baseUrlInput) baseUrlInput.required = true; // Required for Ollama
            if (apiKeyGroup) apiKeyGroup.style.display = 'block';
        } else if (providerType === 'openai' || providerType === 'anthropic') {
            // OpenAI/Anthropic require API key and optionally base URL
            if (baseUrlGroup) baseUrlGroup.style.display = 'block'; // Show base URL field
            if (apiKeyGroup) apiKeyGroup.style.display = 'block';
            if (apiKeyInput && currentAction === 'add') {
                apiKeyInput.required = true; // Required for new providers
            }
        }
    }

    function updateTemperatureOutput() {
        temperatureOutput.textContent = temperatureSlider.value;
    }

    // --- Users Tab Functions ---
    function loadUsers() {
        showLoading(); // Use general loader
        fetch('/api/admin/users') // CORRECTED PATH
            .then(response => {
                if (!response.ok) {
                    throw new Error('Failed to load users');
                }
                return response.json();
            })
            .then(users => {
                 // Ensure users is an array before rendering
                renderUsers(Array.isArray(users) ? users : []);
                populateRoleFilter(Array.isArray(users) ? users : []); // Also ensure array for filter population
            })
            .catch(error => {
                showError(error.message);
            })
            .finally(() => {
                hideLoading(); // Use general loader
            });
    }

    function renderUsers(users) {
        if (users.length === 0) {
            userList.innerHTML = '<div class="no-results">No users found. Add a new user to get started.</div>';
            return;
        }

        userList.innerHTML = '';

        users.forEach(user => {
            const card = document.createElement('div');
            card.className = 'user-card';
            card.dataset.id = user.id;
            card.dataset.role = user.role ? user.role.name.toLowerCase() : '';
            card.dataset.active = user.is_active;
            card.dataset.name = user.username;

            let roleName = user.role ? user.role.name : 'Unknown';
            let roleClass = roleName.toLowerCase();

            card.innerHTML = `
                <div class="role-badge ${roleClass}">${escapeHtml(roleName)}</div>
                <h3>${escapeHtml(user.username)}</h3>
                <div class="user-card-details">
                    <p>Email: <span>${escapeHtml(user.email)}</span></p>
                    <p>Name: <span>${escapeHtml(user.first_name || '')} ${escapeHtml(user.last_name || '')}</span></p>
                    <p>Status: <span class="status-badge ${user.is_active ? 'active' : 'inactive'}">${user.is_active ? 'Active' : 'Inactive'}</span></p>
                </div>
                <div class="user-card-actions">
                    <button class="cyber-btn" data-action="edit-user" data-id="${user.id}">Edit</button>
                    <button class="cyber-btn danger" data-action="delete-user" data-id="${user.id}">Delete</button>
                </div>
            `;

            userList.appendChild(card);

            // Add event listeners to the action buttons
            card.querySelector('[data-action="edit-user"]').addEventListener('click', () => {
                editUser(user.id);
            });

            card.querySelector('[data-action="delete-user"]').addEventListener('click', () => {
                deleteUser(user.id);
            });
        });
    }

    function populateRoleFilter(users) {
        // Get unique roles from users
        const roleSet = new Set();
        users.forEach(user => {
            if (user.role) {
                roleSet.add(JSON.stringify({
                    id: user.role.id,
                    name: user.role.name
                }));
            }
        });

        // Clear existing options except the first one
        const firstOption = roleFilter.options[0];
        roleFilter.innerHTML = '';
        roleFilter.appendChild(firstOption);

        // Add options for each role
        Array.from(roleSet).forEach(roleJson => {
            const role = JSON.parse(roleJson);
            const option = document.createElement('option');
            option.value = role.id;
            option.textContent = role.name;
            roleFilter.appendChild(option);
        });
    }

    function openUserModal(action, userId = null) {
        const modal = document.getElementById('user-modal');
        const modalTitle = document.getElementById('user-modal-title');
        const userForm = document.getElementById('user-form');
        const userIdInput = document.getElementById('user-id');
        const passwordFieldsDiv = document.querySelectorAll('.new-user-password-fields'); // Get all password field divs
        const newPasswordInput = document.getElementById('new-password');
        const confirmPasswordInput = document.getElementById('confirm-password');
        const changePasswordButton = document.querySelector('.change-password-action-btn'); // Use the specific class/ID

        modalTitle.textContent = action === 'add' ? 'Add New User' : 'Edit User';

        // Clear the form
        userForm.reset();
        userIdInput.value = ''; // Clear hidden ID

        if (action === 'add') {
            // Show password fields for new user, make required, hide change pw btn
            passwordFieldsDiv.forEach(div => div.style.display = 'block');
            if (newPasswordInput) newPasswordInput.required = true;
            if (confirmPasswordInput) confirmPasswordInput.required = true;
            if (changePasswordButton) changePasswordButton.style.display = 'none';
        } else {
            // Hide password fields for edit user, make not required, show change pw btn
            passwordFieldsDiv.forEach(div => div.style.display = 'none');
            if (newPasswordInput) newPasswordInput.required = false;
            if (confirmPasswordInput) confirmPasswordInput.required = false;
            if (changePasswordButton) changePasswordButton.style.display = 'inline-block'; // Or 'block' depending on layout

            if (userId) {
                userIdInput.value = userId; // Set the ID for editing
                fetchUserDetails(userId);
            } else {
                console.error("Edit action called without a userId!");
                showError("Cannot edit user: User ID missing.");
                return; // Don't open modal if ID is missing for edit
            }
        }

        // Remove previous password hint logic if any
        // const passwordHint = document.querySelector('.password-field .field-hint');
        // if (passwordHint) {
        //     passwordHint.style.display = 'none'; // Not needed with separate fields
        // }


        // Show the modal
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function closeUserModal() {
        const modal = document.getElementById('user-modal');
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }

    function fetchUserDetails(userId) {
        showLoading();
        fetch(`/api/admin/users/${userId}`) // CORRECTED PATH
            .then(response => {
                if (!response.ok) {
                    throw new Error('Failed to fetch user details');
                }
                return response.json();
            })
            .then(user => {
                populateUserForm(user);
                hideLoading();
            })
            .catch(error => {
                console.error('Error fetching user details:', error);
                showError('Failed to load user details: ' + error.message);
                hideLoading();
            });
    }

    function populateUserForm(user) {
        console.log("[populateUserForm] Populating form for user:", user);
        // Populate the form with user data directly
        document.getElementById('user-id').value = user.id;
        document.getElementById('username').value = user.username;
        document.getElementById('email').value = user.email;
        document.getElementById('first-name').value = user.first_name || '';
        document.getElementById('last-name').value = user.last_name || '';

        // Set role dropdown
        const roleSelect = document.getElementById('role-id');
        if (roleSelect && user.role_id) {
             console.log(`[populateUserForm] Setting role ID to: ${user.role_id}`);
             roleSelect.value = user.role_id;
             // Verify the value was set
             if (roleSelect.value != user.role_id) {
                 console.warn(`[populateUserForm] Role ID ${user.role_id} not found in dropdown. Available options:`, Array.from(roleSelect.options).map(opt => opt.value));
             }
        } else if (!roleSelect) {
             console.error("[populateUserForm] Role select dropdown not found!");
        } else if (!user.role_id) {
             console.warn("[populateUserForm] User data missing role_id.");
        }

        // Set active checkbox
        const activeCheckbox = document.getElementById('user-is-active');
        if (activeCheckbox) {
            activeCheckbox.checked = user.is_active;
        }

        // Clear password field - we don't receive the password in the response
        const passwordField = document.getElementById('password');
        if (passwordField) {
            passwordField.value = '';
        }
        console.log("[populateUserForm] Form population complete.");
    }

    function handleUserFormSubmit(event) {
        event.preventDefault();

        const userDetails = buildUserData(); // Gets flat user details { username: ..., email: ... }
        if (!userDetails) {
            console.warn("buildUserData returned null, aborting form submission.");
            return; // Stop if data building failed
        }

        const userId = document.getElementById('user-id').value;
        const action = userId ? 'update' : 'add';
        const isNewUser = (action === 'add');

        // Validate common user data (username, email, role)
        if (!validateUserData(userDetails)) { // Removed isNewUser flag here
            console.log("Common user data validation failed");
            return; // Stop if validation fails
        }

        let apiCall;
        if (action === 'add') {
            // --- Password handling for NEW users ---
            const passwordInput = document.getElementById('new-password');
            const confirmPasswordInput = document.getElementById('confirm-password');

            if (!passwordInput || !confirmPasswordInput) {
                 showError("Internal error: Password fields not found.");
                 console.error("Password input elements not found for new user.");
                 return;
            }

            const passwordValue = passwordInput.value;
            const confirmPasswordValue = confirmPasswordInput.value;

            if (!passwordValue || passwordValue.trim() === '') {
                showError("Password is required for new users.");
                passwordInput.focus();
                return;
            }
            if (passwordValue.length < 8) {
                 showError("Password must be at least 8 characters long.");
                 passwordInput.focus();
                 return;
            }
            if (passwordValue !== confirmPasswordValue) {
                showError("Passwords do not match.");
                confirmPasswordInput.focus();
                return;
            }
            // --- End Password Handling ---


            // Construct the nested object required by the API for the add call
            const payloadForAdd = {
                user: userDetails, // The flat user object
                password: passwordValue // The validated password
            };
            console.log("Adding new user with payload:", payloadForAdd); // Log payload for debugging
            apiCall = addNewUser(payloadForAdd);

        } else {
            // For update, just pass the flat userDetails object
            // The backend UpdateUser handler expects the flat structure
            console.log("Updating user", userId, "with details:", userDetails);
            apiCall = updateUser(userId, userDetails);
        }

        if (apiCall) { // Ensure apiCall was assigned
             apiCall.then(() => {
                 showSuccess(`User ${action === 'add' ? 'added' : 'updated'} successfully.`);
                 closeUserModal();
                 loadUsers(); // Reload the user list after success
             }).catch(error => {
                 // Error should be shown by the specific add/update function now
                 console.error(`Error during user ${action}:`, error);
                 // Optionally show a generic error here if needed, but prefer specific ones
                 // showError(`Error ${action === 'add' ? 'adding' : 'updating'} user: ${error.message}`);
             });
        } else {
             console.error("API call promise was not created for user form submission.");
             showError("An unexpected error occurred submitting the user form.");
        }
    }

    function buildUserData() {
        const usernameElement = document.getElementById('username');
        const emailElement = document.getElementById('email');
        // Password element is NOT needed here anymore
        const firstNameElement = document.getElementById('first-name');
        const lastNameElement = document.getElementById('last-name');
        const roleIdElement = document.getElementById('role-id');
        const isActiveElement = document.getElementById('user-is-active');

        // Check if critical elements exist
        if (!usernameElement || !emailElement || !roleIdElement) {
            console.error("Error: Critical user form elements not found.");
            showError("An error occurred: Missing user form elements.");
            return null;
        }

        // Build the FLAT user data object (no outer 'user' key)
        const userDetails = {
            username: usernameElement.value,
            email: emailElement.value,
            role_id: parseInt(roleIdElement.value),
            is_active: isActiveElement ? isActiveElement.checked : true
            // Note: ID is handled separately in submit/update functions
        };

        // Add optional fields if they exist and have values
        if (firstNameElement && firstNameElement.value) {
            userDetails.first_name = firstNameElement.value;
        }

        if (lastNameElement && lastNameElement.value) {
            userDetails.last_name = lastNameElement.value;
        }

        // DO NOT add password here

        return userDetails; // Return the flat user details object
    }

    function validateUserData(userData) { // Removed isNewUser flag
        // Now validates the flat structure - password validation removed
        if (!userData.username || userData.username.trim() === '') {
            showError('Username is required.');
            return false;
        }

        if (!userData.email || userData.email.trim() === '') {
            showError('Email is required.');
            return false;
        }
        // Basic email format check (very simple)
        if (!/\\S+@\\S+\\.\\S+/.test(userData.email)) {
             showError('Please enter a valid email address.');
             return false;
        }


        if (!userData.role_id || isNaN(parseInt(userData.role_id)) || parseInt(userData.role_id) <= 0) {
            showError('Please select a valid role.');
            return false;
        }

        // Password validation is now handled separately in handleUserFormSubmit for 'add'
        // if (isNewUser && (!userData.password || userData.password.trim() === \'\')) {
        //     showError(\'Password is required for new users.\');
        //     return false;
        // }

        return true;
    }

    function addNewUser(userRequestData) { // Expects { user: { ... }, password: "..." }
        showLoading();
        return fetch('/api/admin/users', { // CORRECTED PATH
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(userRequestData)
        })
            .then(response => {
                if (!response.ok) {
                    throw new Error('Failed to create user');
                }
                return response.json();
            })
            .catch(error => {
                showError(error.message);
            })
            .finally(() => {
                hideLoading();
            });
    }

    function updateUser(userId, userDetails) { // Expects flat user details { username: ..., email: ... }
        showLoading();
        // Note: Password should not be in userDetails for update
        return fetch(`/api/admin/users/${userId}`, { // CORRECTED PATH
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(userDetails) // Send the flat structure
        })
            .then(response => {
                if (!response.ok) {
                    // Try to parse error response
                    return response.json().then(data => {
                        throw new Error(data.error || 'Failed to update user');
                    }).catch(() => {
                         // Fallback if error response is not JSON
                        throw new Error(`Failed to update user (${response.status})`);
                    });
                }
                return response.json(); // Success response
            })
            .catch(error => {
                 showError(error.message); // Show error from API or fetch
                 throw error; // Re-throw to be caught by handleUserFormSubmit if needed
            })
            .finally(() => {
                hideLoading();
            });
    }

    function editUser(userId) {
        openUserModal('edit', userId);
    }

    function deleteUser(userId) {
        currentUserId = userId;
        currentItemType = 'user';
        openConfirmModal('Are you sure you want to delete this user?', 'delete', userId);
    }

    function performDeleteUser(userId) {
        showLoading();
        // Note: This actually deactivates the user
        return fetch(`/api/admin/users/${userId}`, { // CORRECTED PATH
            method: 'DELETE'
        })
            .then(response => {
                if (!response.ok) {
                    throw new Error('Failed to delete user');
                }
                showSuccess('User deleted successfully');
                loadUsers(); // Reload the user list
            })
            .catch(error => {
                showError(`Error deleting user: ${error.message}`);
            })
            .finally(() => {
                hideLoading();
            });
    }

    function filterUsers() {
        const searchTerm = userSearch.value.toLowerCase();
        const roleId = roleFilter.value;
        const activeOnly = userActiveOnlyCheckbox.checked;

        const userCards = userList.querySelectorAll('.user-card');

        userCards.forEach(card => {
            const name = card.dataset.name.toLowerCase();
            const role = card.dataset.role;
            const isActive = card.dataset.active === 'true';

            const matchesSearch = name.includes(searchTerm);
            const matchesRole = !roleId || card.dataset.roleId === roleId;
            const matchesActive = !activeOnly || isActive;

            if (matchesSearch && matchesRole && matchesActive) {
                card.style.display = '';
            } else {
                card.style.display = 'none';
            }
        });

        // Show no results message if all cards are hidden
        const visibleCards = Array.from(userCards).filter(card => card.style.display !== 'none');
        if (visibleCards.length === 0) {
            let noResults = userList.querySelector('.no-results');
            if (!noResults) {
                noResults = document.createElement('div');
                noResults.className = 'no-results';
                noResults.textContent = 'No users match your filters';
                userList.appendChild(noResults);
            }
        } else {
            const noResults = userList.querySelector('.no-results');
            if (noResults) {
                noResults.remove();
            }
        }
    }

    // --- Roles Tab Functions ---
    function loadRoles() {
        showLoading(); // Use general loader
        fetch('/api/admin/roles') // CORRECTED PATH
            .then(response => {
                if (!response.ok) {
                    throw new Error('Failed to load roles');
                }
                return response.json();
            })
            .then(roles => {
                // Ensure roles is an array before rendering
                renderRoles(Array.isArray(roles) ? roles : []);
                populateRoleSelectOptions(Array.isArray(roles) ? roles : []); // Also ensure array for select population
            })
            .catch(error => {
                showError(error.message);
            })
            .finally(() => {
                hideLoading(); // Use general loader
            });
    }

    function renderRoles(roles) {
        if (roles.length === 0) {
            roleList.innerHTML = '<div class="no-results">No roles found.</div>';
            return;
        }

        roleList.innerHTML = '';

        roles.forEach(role => {
            const card = document.createElement('div');
            card.className = 'role-card';
            card.dataset.id = role.id;
            card.dataset.name = role.name;

            card.innerHTML = `
                <h3>${escapeHtml(role.name)}</h3>
                <p>${escapeHtml(role.description || 'No description')}</p>
                <div class="role-users">
                    <div class="role-users-title">Users with this role:</div>
                    <div class="role-users-loading">Loading users...</div>
                    <div class="role-users-list" id="role-users-${role.id}"></div>
                </div>
            `;

            roleList.appendChild(card);

            // Load users for this role
            loadUsersForRole(role.id);
        });
    }

    function loadUsersForRole(roleId) {
        // Don't show main loader here, just update inline
        const loadingIndicator = document.querySelector(`#role-users-${roleId}`)?.previousElementSibling;
        if (loadingIndicator && loadingIndicator.classList.contains('role-users-loading')) {
             loadingIndicator.style.display = 'block'; // Show inline loader
        }

        fetch(`/api/admin/roles/${roleId}/users`) // CORRECTED PATH
            .then(response => {
                if (!response.ok) {
                    // If response is not ok, don't try to parse JSON, throw error directly
                    throw new Error(`Failed to load users for role ${roleId}: ${response.status}`);
                }
                // Handle potential empty body for 2xx responses
                if (response.status === 204) { // No Content
                    return []; // Return empty array if no content
                }
                return response.json(); // Otherwise, parse JSON
            })
            .then(users => {
                // Ensure users is an array before rendering
                renderUsersForRole(roleId, Array.isArray(users) ? users : []);
            })
            .catch(error => {
                console.error(`Error loading users for role ${roleId}:`, error);
                const usersList = document.getElementById(`role-users-${roleId}`);
                if (usersList) {
                    usersList.innerHTML = '<div class="error-message">Failed to load users</div>';
                }
            })
            .finally(() => {
                // Remove inline loading indicator
                 if (loadingIndicator && loadingIndicator.classList.contains('role-users-loading')) {
                    loadingIndicator.remove();
                }
            });
    }

    function renderUsersForRole(roleId, users) {
        const usersList = document.getElementById(`role-users-${roleId}`);
        if (!usersList) return;

        if (!users || users.length === 0) {
            usersList.innerHTML = '<div class="no-users">No users with this role</div>';
            return;
        }

        usersList.innerHTML = '';
        users.forEach(user => {
            const chip = document.createElement('div');
            chip.className = 'user-chip';
            chip.textContent = user.username;
            usersList.appendChild(chip);
        });
    }

    function populateRoleSelectOptions(roles) {
        const roleSelect = document.getElementById('role-id');

        // Clear existing options except the first one
        const firstOption = roleSelect.options[0];
        roleSelect.innerHTML = '';
        roleSelect.appendChild(firstOption);

        // Add options for each role
        roles.forEach(role => {
            const option = document.createElement('option');
            option.value = role.id;
            option.textContent = role.name;
            roleSelect.appendChild(option);
        });
    }

    // --- Confirmation and Notification Functions ---
    function openConfirmModal(message, action, itemId) {
        console.log(`[Debug] openConfirmModal called with: message=${message}, action=${action}, itemId=${itemId}, currentItemType=${currentItemType}`); // Log entry
        document.getElementById('confirm-message').textContent = message;
        currentAction = action;
        currentItemType = currentItemType || 'model'; // Default to model if not set

        if (currentItemType === 'model') {
            currentModelId = itemId;
        } else if (currentItemType === 'user') {
            currentUserId = itemId;
        }

        const confirmModalElement = document.getElementById('confirm-modal');
        if (confirmModalElement) {
            confirmModalElement.style.display = 'flex'; // Ensure it's not display: none
            // Use requestAnimationFrame to ensure display change is applied before adding class
            requestAnimationFrame(() => {
                 confirmModalElement.classList.add('active');
                 document.body.style.overflow = 'hidden';
                 console.log("[Debug] Added .active class to #confirm-modal. It should be visible.");
            });
        } else {
             console.error("[Error] Confirmation modal element (#confirm-modal) not found!");
        }
    }

    function closeConfirmModal() {
        if (confirmModal) {
            confirmModal.classList.remove('active');
            document.body.style.overflow = '';
            console.log("[Debug] Removed .active class from #confirm-modal. It should be hidden.");
            // Add a delay to ensure transition completes before setting display: none
            setTimeout(() => {
                if (confirmModal && !confirmModal.classList.contains('active')) {
                    confirmModal.style.display = 'none';
                    console.log("[Debug] Set display: none on #confirm-modal after timeout.");
                }
            }, 350); // Slightly longer than the transition duration
        } else {
            console.error("[Error] Confirmation modal element (#confirm-modal) not found during close!");
        }
    }

    function handleConfirmAction() {
        if (currentAction === 'delete') {
            if (currentItemType === 'model' && currentModelId) {
                performDeleteModel(currentModelId);
            } else if (currentItemType === 'user' && currentUserId) {
                performDeleteUser(currentUserId);
            } else if (currentItemType === 'provider' && currentProviderId) {
                performDeleteProvider(currentProviderId);
            }
        }
        closeConfirmModal();
        // Reset state after action
        currentItemType = null;
        currentModelId = null;
        currentUserId = null;
        currentProviderId = null;
    }

    function handleOllamaImport() {
        // Instead of direct API call, open the import modal
        openOllamaImportModal();
    }

    function openOllamaImportModal() {
        // Pre-fill the server URL if it exists in the input field
        const urlInputValue = document.getElementById('ollama-import-url').value.trim();
        if (urlInputValue) {
            ollamaServerUrl.value = urlInputValue;
        }

        ollamaImportModal.style.display = 'block';
    }

    function closeOllamaImportModal() {
        ollamaImportModal.style.display = 'none';
    }

    function handleOllamaImportSubmit(event) {
        event.preventDefault();

        const serverUrl = ollamaServerUrl.value.trim();
        if (!serverUrl) {
            showError('Please enter Ollama server URL');
            return;
        }

        // Show loading state
        ollamaImportSubmit.textContent = 'Importing...';
        ollamaImportSubmit.disabled = true;

        // Prepare import data with advanced options
        const importData = {
            base_url: serverUrl
        };

        // Add API key if provided
        if (ollamaApiKey.value) {
            importData.api_key = ollamaApiKey.value;
        }

        // Add default token setting - use a higher default if not specified
        if (ollamaDefaultTokens.value) {
            importData.default_tokens = parseInt(ollamaDefaultTokens.value);
        } else {
            // Provide a better default (8192 tokens) if not specified
            importData.default_tokens = 8192;
        }

        // Add active flag
        importData.set_active = importAllActive.checked;

        // Make API request
        fetch('/api/admin/models/import-ollama', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(importData)
        })
        .then(response => {
            if (!response.ok) {
                // Try to parse the error response from the server
                return response.json().then(errData => {
                    throw new Error(errData.error || `Failed to import models: ${response.status}`);
                }).catch(() => {
                    // Fallback if parsing error response fails
                    throw new Error(`Failed to import models: ${response.status}`);
                });
            }
            return response.json();
        })
        .then(data => {
            loadModels(); // Refresh model list
            closeOllamaImportModal();
            let successMessage = `Successfully imported ${data.models_imported} models from Ollama server`;
            if (data.errors_occurred) {
                successMessage += `. Some models failed to import. Please check server logs for details.`;
                // Optionally, show a different type of notification (e.g., warning)
                showNotification(successMessage, 'warning'); // Assuming a warning style exists or can be added
            } else {
                showSuccess(successMessage);
            }
        })
        .catch(error => {
            showError(`Error importing models: ${error.message}`);
        })
        .finally(() => {
            // Reset button state
            ollamaImportSubmit.textContent = 'Import Models';
            ollamaImportSubmit.disabled = false;
        });
    }

    // Add event listeners for Ollama import modal
    if (ollamaImportForm) {
        ollamaImportForm.addEventListener('submit', handleOllamaImportSubmit);
    }

    if (ollamaImportCancel) {
        ollamaImportCancel.addEventListener('click', closeOllamaImportModal);
    }

    if (ollamaModalCloseBtns) {
        ollamaModalCloseBtns.forEach(btn => {
            btn.addEventListener('click', closeOllamaImportModal);
        });
    }

    // Utility functions
    function showLoading() {
        console.log("[Debug] showLoading called"); // Log entry
        // If a loading element doesn't exist, create one
        let loadingOverlay = document.querySelector('.loading-overlay'); // Use let
        if (!loadingOverlay) {
            loadingOverlay = document.createElement('div');
            loadingOverlay.className = 'loading-overlay';
            loadingOverlay.innerHTML = '<div class="loading"><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div></div><p>Loading...</p>';
            document.body.appendChild(loadingOverlay);
            console.log("[Debug] showLoading: Created new overlay.");
        } else {
            console.log("[Debug] showLoading: Reusing existing overlay.");
        }
        loadingOverlay.style.display = 'flex';
    }

    function hideLoading() {
        console.log("[Debug] hideLoading called"); // Log entry
        const loadingOverlay = document.querySelector('.loading-overlay');
        if (loadingOverlay) {
            loadingOverlay.style.display = 'none';
            console.log("[Debug] hideLoading: Set overlay display to none.");
        } else {
             console.log("[Debug] hideLoading: Overlay not found.");
        }
    }

    function showError(message) {
        showNotification(message, 'error');
    }

    function showSuccess(message) {
        showNotification(message, 'success');
    }

    function showNotification(message, type) {
        // Remove any existing notifications
        const existingNotifications = document.querySelectorAll('.notification');
        existingNotifications.forEach(notification => {
            notification.remove();
        });

        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;

        // Add close button
        const closeBtn = document.createElement('span');
        closeBtn.className = 'notification-close';
        closeBtn.innerHTML = '&times;';
        closeBtn.addEventListener('click', () => {
            notification.remove();
        });

        notification.appendChild(closeBtn);
        document.body.appendChild(notification);

        // Auto-remove after 5 seconds
        setTimeout(() => {
            notification.classList.add('fade-out');
            setTimeout(() => {
                notification.remove();
            }, 500); // Match transition time in CSS
        }, 5000);
    }

    function escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // Add dynamic styles for notifications
    const style = document.createElement('style');
    style.textContent = `
        .loading-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.7);
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            z-index: 9999;
            color: var(--primary-color);
        }

        .notification {
            position: fixed;
            bottom: 20px;
            right: 20px;
            padding: 15px 40px 15px 15px;
            border-radius: 5px;
            color: white;
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
            z-index: 1000;
            animation: notification-slide 0.3s ease forwards;
            transition: opacity 0.5s ease;
        }

        .notification.fade-out {
            opacity: 0;
        }

        .notification.success {
            background-color: rgba(0, 255, 65, 0.2);
            border: 1px solid var(--primary-color);
            color: var(--primary-color);
        }

        .notification.error {
            background-color: rgba(255, 7, 58, 0.2);
            border: 1px solid var(--danger-color);
            color: var(--danger-color);
        }

        .notification-close {
            position: absolute;
            top: 5px;
            right: 10px;
            cursor: pointer;
            font-size: 18px;
        }

        @keyframes notification-slide {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }

        .no-results, .no-results-filter {
            grid-column: 1 / -1;
            padding: 2rem;
            text-align: center;
            font-style: italic;
            color: var(--text-color);
        }
    `;
    document.head.appendChild(style);

    // --- NEW: Provider Management Functions ---

    let currentProviderId = null; // Track provider being edited

    function loadProviders() {
        showLoading(); // Use general loader
        fetch('/api/admin/providers') // CORRECTED PATH
            .then(response => {
                if (!response.ok) throw new Error('Failed to load providers');
                return response.json();
            })
            .then(providers => {
                const providerArray = Array.isArray(providers) ? providers : [];
                renderProviders(providerArray);
                populateModelProviderDropdown(providerArray); // For model modal
                populateModelFilterDropdown(providerArray);   // For model list filter
            })
            .catch(error => showError(error.message))
            .finally(() => {
                 hideLoading(); // Use general loader
            });
    }

    function renderProviders(providers) {
        // Use the renamed variable
        const targetList = providersListElement;
        if (!targetList) return;
        if (providers.length === 0) {
            targetList.innerHTML = '<div class="no-results">No providers configured.</div>';
            return;
        }
        targetList.innerHTML = ''; // Clear loading/previous
        providers.forEach(provider => {
            const card = document.createElement('div');
            card.className = 'provider-card';
            card.dataset.id = provider.id;
            card.dataset.type = provider.type;

            // Add provider type as a class for additional styling
            card.classList.add(`provider-${provider.type}`);

            let syncButtonHTML = '';
            if (provider.type === 'ollama' || provider.type === 'openai') {
                syncButtonHTML = `<button class="cyber-btn sync-btn" data-action="sync" data-id="${provider.id}">Sync Models</button>`;
            }

            card.innerHTML = `
                <div class="provider-type-badge ${provider.type}">${escapeHtml(provider.type)}</div>
                <h3>${escapeHtml(provider.name)}</h3>
                <div class="provider-details">
                    ${provider.base_url ? `<p>URL: <span>${escapeHtml(provider.base_url)}</span></p>` : ''}
                    <p>Created: <span>${new Date(provider.created_at).toLocaleString()}</span></p>
                </div>
                <div class="provider-card-actions">
                    <button class="cyber-btn info" data-action="view-models" data-id="${provider.id}">View Models</button>
                    ${syncButtonHTML}
                    <button class="cyber-btn" data-action="edit-provider" data-id="${provider.id}">Edit</button>
                    <button class="cyber-btn danger" data-action="delete-provider" data-id="${provider.id}">Delete</button>
                </div>
            `;
            targetList.appendChild(card);

            // Add event listeners
            const viewBtn = card.querySelector('[data-action="view-models"]');
            if (viewBtn) viewBtn.addEventListener('click', () => viewProviderModels(provider.id));

            const editBtn = card.querySelector('[data-action="edit-provider"]');
            if (editBtn) editBtn.addEventListener('click', () => editProvider(provider.id));

            const deleteBtn = card.querySelector('[data-action="delete-provider"]');
            if (deleteBtn) {
                deleteBtn.addEventListener('click', (event) => { // Added event parameter
                    event.stopPropagation(); // Prevent potential conflicts
                    console.log(`[Debug] Delete provider button clicked for provider element:`, card); // Log the card element
                    deleteProvider(provider.id);
                });
            } else {
                console.error(`Could not find delete button for provider card: ${provider.name}`); // Log error if button not found
            }

            const syncBtn = card.querySelector('[data-action="sync"]');
            if (syncBtn) {
                syncBtn.addEventListener('click', (event) => {
                    event.stopPropagation();
                    console.log(`[Debug] Sync provider button clicked for provider element:`, card); // Log click
                    syncProvider(provider.id, syncBtn);
                });
            }
        });
    }

    function openProviderModal(action, providerId = null) {
        const modal = document.getElementById('provider-modal');
        const modalTitle = document.getElementById('provider-modal-title');

        modalTitle.textContent = action === 'add' ? 'Add New Provider' : 'Edit Provider';

        // Clear the form
        document.getElementById('provider-form').reset();
        document.getElementById('provider-id').value = '';

        // Hide all conditional fields initially
        toggleProviderConditionalFields();

        if (action === 'edit' && providerId) {
            // Fetch and populate provider details
            fetchProviderDetails(providerId);
        }

        // Show the modal
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function closeProviderModal() {
        const modal = document.getElementById('provider-modal');
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }

    function fetchProviderDetails(providerId) {
        showLoading();
        fetch(`/api/admin/providers/${providerId}`) // CORRECTED PATH
            .then(response => {
                if (!response.ok) throw new Error('Failed to fetch provider details.');
                return response.json();
            })
            .then(provider => {
                populateProviderForm(provider);
            })
            .catch(error => {
                showError(error.message);
                closeProviderModal();
            })
            .finally(hideLoading);
    }

    function populateProviderForm(provider) {
        // TODO: Populate the provider modal form
        document.getElementById('provider-id').value = provider.id;
        document.getElementById('provider-name').value = provider.name;
        document.getElementById('provider-type').value = provider.type;
        document.getElementById('provider-base-url').value = provider.base_url || '';
        // API Key is not populated for editing for security
        document.getElementById('provider-api-key').value = '';
        document.getElementById('provider-api-key').placeholder = 'Leave blank to keep existing key';
        toggleProviderConditionalFields(); // Ensure correct fields show
    }

    function handleProviderFormSubmit(event) {
        event.preventDefault();

        const providerData = buildProviderData();
        if (!providerData) {
            console.warn("buildProviderData returned null, aborting form submission.");
            return;
        }

        const providerId = document.getElementById('provider-id').value;
        const action = providerId ? 'update' : 'add';

        if (!validateProviderData(providerData)) {
            console.warn("Provider data validation failed");
            return;
        }

        const apiCall = action === 'add'
            ? addNewProvider(providerData)
            : updateProvider(providerId, providerData);

        apiCall.then(() => {
                showSuccess(`Provider ${action} successfully.`);
                closeProviderModal();
                loadProviders();
                // Also refresh dropdowns that depend on providers
                loadProvidersAndPopulateDropdown();
            })
            .catch(error => {
                showError(`Error ${action} provider: ${error.message}`);
            });
    }

    function buildProviderData() {
        const nameElement = document.getElementById('provider-name');
        const typeElement = document.getElementById('provider-type');
        const baseUrlElement = document.getElementById('provider-base-url');
        const apiKeyElement = document.getElementById('provider-api-key');

        // Check if critical elements exist
        if (!nameElement || !typeElement) {
            console.error("Error: Critical provider form elements not found.");
            showError("An error occurred: Missing provider form elements.");
            return null;
        }

        // Create provider data object
        const providerData = {
            name: nameElement.value,
            type: typeElement.value,
        };

        // Add optional fields if they exist and have values
        if (baseUrlElement && baseUrlElement.value) {
            providerData.base_url = baseUrlElement.value;
        }

        if (apiKeyElement && apiKeyElement.value) {
            providerData.api_key = apiKeyElement.value;
        }

        return providerData;
    }

    function validateProviderData(data) {
        if (!data.name || data.name.trim() === '') {
            showError('Provider name is required.');
            return false;
        }

        if (!data.type || data.type.trim() === '') {
            showError('Please select a provider type.');
            return false;
        }

        // Check for Ollama base_url
        if (data.type === 'ollama' && (!data.base_url || data.base_url.trim() === '')) {
            showError('Base URL is required for Ollama providers.');
            return false;
        }

        // For new OpenAI/Anthropic providers, API key is required
        const providerIdElement = document.getElementById('provider-id');
        const isNewProvider = !providerIdElement || !providerIdElement.value;

        if (isNewProvider && (data.type === 'openai' || data.type === 'anthropic') && (!data.api_key || data.api_key.trim() === '')) {
            showError(`API Key is required for new ${data.type === 'openai' ? 'OpenAI' : 'Anthropic'} providers.`);
            return false;
        }

        return true;
    }

    function addNewProvider(providerData) {
        showLoading(); // Use general loader
        return fetch('/api/admin/providers', { // CORRECTED PATH
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(providerData)
        })
        .then(response => {
            if (!response.ok) {
                return response.json().then(err => { throw new Error(err.error || `Failed to add provider (${response.status})` ); });
            }
            return response.json();
        })
        .then(newProvider => {
            showSuccess(`Provider "${newProvider.name}" added successfully.`);
            closeProviderModal();
            // Return the promise from loadProviders to chain correctly
            return loadProviders();
        })
        .catch(error => {
             showError(error.message);
             hideLoading(); // Hide on error
        });
        // No finally here, loadProviders handles hiding on success
    }

    function updateProvider(providerId, providerData) {
        showLoading(); // Use general loader
        return fetch(`/api/admin/providers/${providerId}`, { // CORRECTED PATH
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(providerData)
        })
        .then(response => {
            console.log('Update response status:', response.status);
            if (!response.ok) {
                 return response.json().then(err => {
                     console.error('Error response:', err);
                     throw new Error(err.error || `Failed to update provider (${response.status})`);
                 });
            }
            return response.json();
        })
        .then(updatedProvider => {
            console.log('Provider updated successfully:', updatedProvider);
            showSuccess(`Provider "${updatedProvider.name}" updated successfully.`);
            closeProviderModal();
            // Return the promise from loadProviders to chain correctly
            return loadProviders();
        })
        .catch(error => {
            console.error('Update error:', error);
            showError(error.message);
            hideLoading(); // Hide on error
        });
        // No finally here, loadProviders handles hiding on success
    }

    function editProvider(providerId) {
        openProviderModal('edit', providerId);
    }

    function deleteProvider(providerId) {
        console.log(`[Debug] deleteProvider called for ID: ${providerId}`); // Log entry
        currentProviderId = providerId;
        currentItemType = 'provider'; // Explicitly set context for confirmation
        openConfirmModal('Are you sure you want to delete this provider and ALL associated models?', 'delete', providerId);
    }

    function performDeleteProvider(providerId) {
        showLoading(); // Use general loader
        return fetch(`/api/admin/providers/${providerId}`, { // CORRECTED PATH
            method: 'DELETE'
        })
            .then(response => {
                if (!response.ok) {
                    throw new Error('Failed to delete provider');
                }
                showSuccess('Provider deleted successfully');
                // Return the promise from loadProviders to chain correctly
                return loadProviders();
            })
            .catch(error => {
                showError(`Error deleting provider: ${error.message}`);
                 hideLoading(); // Hide on error
            });
             // No finally here, loadProviders handles hiding on success
    }

    function syncProvider(providerId, buttonElement) {
        if (!providerId) {
            console.error("syncProvider called without providerId");
            return;
        }

        // Disable button and show temporary loading state
        const originalText = buttonElement.textContent;
        buttonElement.disabled = true;
        buttonElement.textContent = 'Syncing...';
        buttonElement.classList.add('loading');

        fetch(`/api/admin/providers/${providerId}/sync`, { // CORRECTED PATH
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
             // Optionally send sync parameters if needed
             // body: JSON.stringify({ set_active: true, default_tokens: 8192 })
        })
        .then(response => {
            console.log(`[Debug] syncProvider: Fetch response status: ${response.status}`); // Log response status
            if (!response.ok) {
                // Attempt to get text first, then try JSON if it fails
                return response.text().then(text => {
                    try {
                        // Try parsing as JSON
                        const errData = JSON.parse(text);
                        throw new Error(errData.error || `Sync failed (${response.status})`);
                    } catch (e) {
                        // If JSON parsing fails, use the raw text as the error message
                        // This handles cases where the server sends plain text errors
                        throw new Error(text || `Sync failed with status: ${response.status}`);
                    }
                });
            }
            return response.json(); // If response is OK, expect JSON
        })
        .then(data => {
            let message = `Sync complete. ${data.models_created} new models added.`;
            if (data.errors_occurred) {
                message += ` Some errors occurred during sync. Check server logs.`;
                showNotification(message, 'warning');
            } else {
                showSuccess(message);
            }
            loadModels(); // Refresh model list as well
        })
        .catch(error => {
            // Log the raw error for better debugging
            console.error('[Error] syncProvider: Fetch failed:', error);
            showError(`Sync error: ${error.message}`);
        })
        .finally(() => {
            console.log(`[Debug] syncProvider: Fetch finally block executing for ID: ${providerId}`); // Log finally
            buttonElement.textContent = originalText;
            buttonElement.disabled = false;
            buttonElement.classList.remove('loading');
            hideLoading(); // Hide general loader after sync attempt
        });
    }

    // --- Update Model Management Functions ---

    function loadProvidersAndPopulateDropdown(callback) {
        showLoading();
        fetch('/api/admin/providers') // CORRECTED PATH
            .then(response => {
                if (!response.ok) {
                    throw new Error('Failed to load providers for dropdown');
                }
                return response.json();
            })
            .then(providers => {
                populateModelProviderDropdown(providers);
                if (callback && typeof callback === 'function') {
                    callback(providers);
                }
            })
            .catch(error => {
                console.error('Error loading providers:', error);
                showError('Failed to load providers: ' + error.message);
            });
    }

    function populateModelProviderDropdown(providers) {
        if (!modelProviderSelect) return;
        const currentValue = modelProviderSelect.value; // Preserve selection if already set
        modelProviderSelect.innerHTML = '<option value="">Select Configured Provider</option>'; // Reset
        providers.forEach(p => {
            const option = document.createElement('option');
            option.value = p.id;
            option.textContent = `${p.name} (${p.type})`;
            modelProviderSelect.appendChild(option);
        });
        modelProviderSelect.value = currentValue; // Restore selection
    }

    function populateModelFilterDropdown(providers) {
        if (!providerFilterSelect) return;
        const currentValue = providerFilterSelect.value; // Preserve selection if possible

        console.log("Populating filter dropdown with providers:", providers);

        // Clear existing options except the "All" option
        while (providerFilterSelect.options.length > 1) {
            providerFilterSelect.remove(1);
        }
        // Or reset completely if "All" wasn't hardcoded:
        // providerFilterSelect.innerHTML = '<option value="">All Providers</option>';

        providers.forEach(p => {
            const option = document.createElement('option');
            option.value = String(p.id); // Ensure provider ID is a string
            option.textContent = `${p.name} (${p.type})`;
            providerFilterSelect.appendChild(option);
            console.log(`Added provider option: ${p.name} with ID: ${option.value}`);
        });

        // If there was a previously selected value, try to restore it
        if (currentValue && providers.some(p => String(p.id) === currentValue)) {
            providerFilterSelect.value = currentValue;
            console.log(`Restored previous selection: ${currentValue}`);
        } else {
            // Default to empty (All Providers)
            providerFilterSelect.value = "";
            console.log("Set default selection: All Providers");
        }
    }

    function viewProviderModels(providerId) {
        // Convert to string to ensure proper matching
        const providerIdStr = String(providerId);
        console.log(`Viewing models for provider ID: ${providerIdStr}`);

        // 1. Set the filter dropdown value
        if (providerFilterSelect) {
            providerFilterSelect.value = providerIdStr;
            console.log(`Set provider filter to: ${providerIdStr}`);

            // Important: Manually trigger the change event
            const event = new Event('change');
            providerFilterSelect.dispatchEvent(event);
        } else {
            // Fallback if element not found
            console.error("Provider filter select element not found!");
            // Still call filterModels directly just in case
            filterModels();
        }

        // 2. Switch to the 'Models' tab
        const modelsTabButton = document.querySelector('.tab-button[data-tab="models"]');
        if (modelsTabButton) {
            modelsTabButton.click(); // Simulate a click to switch tab
        }

        // 3. Optionally scroll to the models section
        const modelsSection = document.getElementById('models-tab');
        if (modelsSection) {
            modelsSection.scrollIntoView({ behavior: 'smooth' });
        }
    }

    // Direct update function that bypasses form data building
    function handleDirectProviderUpdate() {
        if (!currentProviderId) {
            showError('No provider selected for update');
            return;
        }

        // FORCE a specific key for testing - ALWAYS include this key
        const testApiKey = "FORCED-TEST-KEY-" + new Date().getTime();

        // Get basic provider data but hardcode API key
        const data = {
            name: document.getElementById('provider-name').value,
            type: document.getElementById('provider-type').value,
            base_url: document.getElementById('provider-base-url').value,
            api_key: testApiKey // Always include our test key
        };

        console.log('************ DIRECT UPDATE TEST ************');
        console.log('Direct update - sending data:', JSON.stringify(data));

        showLoading();
        fetch(`/api/admin/providers/${currentProviderId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        })
        .then(response => {
            console.log('Direct update response status:', response.status);

            // Log the complete response for debugging
            return response.text().then(text => {
                try {
                    const responseObj = JSON.parse(text);
                    console.log('Response JSON:', responseObj);
                    return responseObj;
                } catch (e) {
                    console.error('Failed to parse response as JSON:', text);
                    throw new Error('Invalid response format');
                }
            });
        })
        .then(updatedProvider => {
            console.log('Provider directly updated successfully:', updatedProvider);
            showSuccess(`Provider "${updatedProvider.name}" updated with test key: ${testApiKey}`);

            // Check the database immediately
            checkDatabase(currentProviderId, testKey);

            closeProviderModal();
            loadProviders(); // Refresh list
        })
        .catch(error => {
            console.error('Direct update error:', error);
            showError(`Error: ${error.message}`);
        })
        .finally(hideLoading);
    }

    // Helper function to show a notification with database checking instructions
    function checkDatabase(providerId, testKey) {
        const checkCmd = `sqlite3 data/cyberai.db "SELECT id, name, type, base_url, api_key FROM providers WHERE id = ${providerId};"`;
        const notification = document.createElement('div');
        notification.className = 'notification info';
        notification.innerHTML = `
            <p><strong>Test Key Sent:</strong> ${testKey}</p>
            <p>Check the database to verify it updated:</p>
            <code>${checkCmd}</code>
            <span class="notification-close">&times;</span>
        `;
        document.body.appendChild(notification);

        // Add close button handler
        notification.querySelector('.notification-close').addEventListener('click', () => {
            notification.remove();
        });

        // Auto-remove after 20 seconds
        setTimeout(() => {
            if (document.body.contains(notification)) {
                notification.remove();
            }
        }, 20000);
    }

    function setupProviderManagement() {
        // Load providers
        loadProviders();

        // Provider form event listeners
        const providerForm = document.getElementById('provider-form');
        if (providerForm) {
            providerForm.addEventListener('submit', handleProviderFormSubmit);
            console.log('Provider form submit handler attached');
        } else {
            console.error('Provider form element not found');
        }

        // Provider add button
        const addProviderBtn = document.getElementById('add-provider-btn');
        if (addProviderBtn) {
            addProviderBtn.addEventListener('click', function() {
                openProviderModal('add');
            });
            console.log('Add provider button handler attached');
        }

        // Provider modal close buttons
        const providerCloseButtons = document.querySelectorAll('#provider-modal .provider-close, #provider-cancel-btn');
        providerCloseButtons.forEach(button => {
            button.addEventListener('click', closeProviderModal);
        });
        console.log('Provider close button handlers attached');

        // Provider type change - to toggle relevant fields
        const providerTypeSelect = document.getElementById('provider-type');
        if (providerTypeSelect) {
            providerTypeSelect.addEventListener('change', toggleProviderConditionalFields);
            console.log('Provider type change handler attached');
        }
    }

    // --- Password Change Functions ---

    function openChangePasswordModal(userId, username) {
        // Close the main user modal first if open
        closeUserModal();
        // Set hidden user ID and update title
        if (changePasswordUserIdInput) changePasswordUserIdInput.value = userId;
        if (changePasswordModalTitle) changePasswordModalTitle.textContent = `Change Password for ${username}`;
        // Clear previous password inputs
        if (changePasswordForm) changePasswordForm.reset();
        // Show the password modal
        if (changePasswordModal) {
            changePasswordModal.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
    }

    function closeChangePasswordModal() {
        if (changePasswordModal) {
            changePasswordModal.classList.remove('active');
            document.body.style.overflow = '';
        }
    }

    function handleChangePasswordSubmit(event) {
        event.preventDefault();
        const userId = changePasswordUserIdInput.value;
        const newPassword = newPasswordInput.value;
        const confirmPassword = confirmPasswordInput.value;

        if (!userId) {
            showError("Cannot change password: User ID is missing.");
            return;
        }
        if (newPassword.length < 8) {
            showError("Password must be at least 8 characters long.");
            return;
        }
        if (newPassword !== confirmPassword) {
            showError("Passwords do not match.");
            return;
        }

        // Call the API to set the password
        setUserPassword(userId, newPassword);
    }

    function setUserPassword(userId, password) {
        showLoading();
        fetch(`/api/admin/users/${userId}/password`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ password: password })
        })
        .then(response => {
            if (!response.ok) {
                 // Try to parse error
                 return response.text().then(text => {
                     try {
                         const errData = JSON.parse(text);
                         throw new Error(errData.error || `Failed to set password (${response.status})`);
                     } catch (e) {
                         throw new Error(text || `Failed to set password (${response.status})`);
                     }
                 });
            }
            // No body expected on success (204 No Content)
            return null;
        })
        .then(() => {
            showSuccess("Password updated successfully.");
            closeChangePasswordModal();
            // No need to reload user list, password isn't shown
        })
        .catch(error => {
            showError(`Error setting password: ${error.message}`);
        })
        .finally(() => {
            hideLoading();
        });
    }

    // Add this function to handle model activation/deactivation
    function toggleModelStatus(modelId, newStatus) {
        // Show loading indicator
        showLoading();

        // First fetch the current model data
        fetch(`/api/admin/models/${modelId}`)
            .then(response => {
                if (!response.ok) {
                    throw new Error('Failed to fetch model details');
                }
                return response.json();
            })
            .then(model => {
                // Update only the is_active field
                model.is_active = newStatus;

                // Send the update request
                return fetch(`/api/admin/models/${modelId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(model)
                });
            })
            .then(response => {
                if (!response.ok) {
                    throw new Error('Failed to update model status');
                }
                return response.json();
            })
            .then(updatedModel => {
                // Show success message
                showSuccess(`Model ${updatedModel.name} ${newStatus ? 'enabled' : 'disabled'} successfully`);

                // Update the UI
                updateModelStatusInUI(modelId, newStatus);

                // Hide loading indicator
                hideLoading();
            })
            .catch(error => {
                console.error('Error toggling model status:', error);
                showError(`Failed to update model status: ${error.message}`);
                hideLoading();
            });
    }

    // Helper function to update model status in the UI without reloading
    function updateModelStatusInUI(modelId, isActive) {
        const modelCard = document.querySelector(`.model-card[data-id="${modelId}"]`);
        if (!modelCard) return;

        // Update data attribute
        modelCard.dataset.active = isActive;

        // Update status badge
        const statusBadge = modelCard.querySelector('.status-badge');
        if (statusBadge) {
            statusBadge.className = `status-badge ${isActive ? 'active' : 'inactive'}`;
            statusBadge.textContent = isActive ? 'Active' : 'Inactive';
        }

        // Update toggle button
        const toggleBtn = modelCard.querySelector('[data-action="toggle"]');
        if (toggleBtn) {
            toggleBtn.className = `cyber-btn toggle-btn ${isActive ? 'warning' : 'success'}`;
            toggleBtn.dataset.active = isActive;
            toggleBtn.innerHTML = `<span class="btn-icon">${isActive ? '⏻' : '⭘'}</span> ${isActive ? 'Disable' : 'Enable'}`;
        }
    }
});