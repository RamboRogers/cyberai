// Admin Panel JavaScript for CyberAI

// --- Utility Functions ---
// HTML escape function to prevent XSS
window.escapeHtml = function(unsafe) {
    if (unsafe === null || unsafe === undefined) return '';
    return String(unsafe)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
};

// Define utility functions first
// Notification functions (REPLACED with Penguin UI Toast via event dispatch)
// window.showNotification = function(message, type = 'info') { ... }; // REMOVED

// New dispatch functions
window.showNotification = function(message, type = 'info', title = null) {
    let variant = type; // Map old type to new variant
    if (type === 'error') variant = 'danger'; // Map 'error' to Penguin's 'danger'
    
    let eventTitle = title;
    if (!eventTitle) {
        switch (variant) {
            case 'success': eventTitle = 'Success!'; break;
            case 'danger': eventTitle = 'Error!'; break;
            case 'warning': eventTitle = 'Warning!'; break;
            case 'info': eventTitle = 'Information'; break;
            default: eventTitle = 'Notification';
        }
    }

    window.dispatchEvent(new CustomEvent('notify', {
        detail: {
            variant: variant,
            title: eventTitle,
            message: message
        }
    }));
};

window.showSuccess = function(message) {
    window.showNotification(message, 'success', 'Success!');
};

window.showError = function(message) {
    // Map our 'error' to Penguin UI's 'danger' variant
    window.showNotification(message, 'danger', 'Error!'); 
};

window.showWarning = function(message) {
    window.showNotification(message, 'warning', 'Warning!');
};

// Loading indicator functions
window.showLoading = function() {
    let loadingContainer = document.getElementById('loading-container');
    if (!loadingContainer) {
        // Create loading container if it doesn't exist
        loadingContainer = document.createElement('div');
        loadingContainer.id = 'loading-container';
        loadingContainer.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
        loadingContainer.innerHTML = `
            <div class="bg-gray-800 p-4 rounded-lg shadow-lg text-center">
                <div class="animate-spin rounded-full h-10 w-10 border-b-2 border-green-400 mx-auto"></div>
                <p class="text-green-400 mt-2">Loading content...</p>
            </div>
        `;
        document.body.appendChild(loadingContainer);
    } else {
        loadingContainer.style.display = 'flex';
    }
};

window.hideLoading = function() {
    const loadingContainer = document.getElementById('loading-container');
    if (loadingContainer) {
        loadingContainer.style.display = 'none';
    }
};

// Handle API responses consistently
window.handleResponse = function(response) {
    if (!response.ok) {
        return response.text().then(text => {
            let errorMsg = `Request failed: ${response.status} ${response.statusText}`;
            try {
                const jsonData = JSON.parse(text);
                errorMsg = jsonData.error || errorMsg;
            } catch (e) { /* Ignore parsing errors */ }
            console.error(`Fetch Error: ${response.status}`, text);
            throw new Error(errorMsg);
        });
    }
    if (response.status === 204) {
        return Promise.resolve(null);
    }
    // Ensure JSON parsing is safe
    return response.json()
       .then(data => data ?? null) // Handle valid JSON `null` or parsed data
       .catch(err => {
         console.warn("JSON Parsing Error:", err, "Response Status:", response.status);
         return null; // Return null on JSON parse error
       });
};

// Fetch model details for editing
window.fetchModelDetails = function(modelId) {
    console.log(`Fetching details for model ID: ${modelId}`);
    window.showLoading();
    fetch(`/api/admin/models/${modelId}`)
        .then(window.handleResponse)
        .then(model => {
            if (model) {
                // We have model data, populate the form
                const form = document.getElementById('model-form');
                if (form) {
                    document.getElementById('name').value = model.name || '';
                    document.getElementById('model_id').value = model.model_id || '';
                    document.getElementById('max-tokens').value = model.max_tokens || 0;
                    
                    // Handle temperature which can be null
                    const temperatureInput = document.getElementById('temperature');
                    const temperatureNACheckbox = document.getElementById('temperature-na');
                    
                    if (model.temperature === null && temperatureNACheckbox) {
                        temperatureNACheckbox.checked = true;
                        if (temperatureInput) temperatureInput.disabled = true;
                    } else {
                        if (temperatureNACheckbox) temperatureNACheckbox.checked = false;
                        if (temperatureInput) {
                            temperatureInput.disabled = false;
                            temperatureInput.value = model.temperature || 0;
                        }
                    }
                    
                    // Set provider dropdown
                    const providerSelect = document.getElementById('model-provider-id');
                    if (providerSelect && model.provider_id) {
                        for (let i = 0; i < providerSelect.options.length; i++) {
                            if (providerSelect.options[i].value == model.provider_id) {
                                providerSelect.selectedIndex = i;
                                break;
                            }
                        }
                    }
                    
                    // Set system prompt
                    const systemPromptTextarea = document.getElementById('system-prompt');
                    if (systemPromptTextarea) {
                        systemPromptTextarea.value = model.default_system_prompt || '';
                    }
                    
                    // Set active status
                    const isActiveCheckbox = document.getElementById('is-active');
                    if (isActiveCheckbox) {
                        isActiveCheckbox.checked = model.is_active;
                    }
                }
            } else {
                window.showError("Failed to load model details.");
            }
        })
        .catch(error => {
            window.showError(`Error fetching model: ${error.message}`);
        })
        .finally(() => {
            window.hideLoading();
        });
};

// Fetch provider details for editing
window.fetchProviderDetails = function(providerId) {
    console.log(`Fetching details for provider ID: ${providerId}`);
    window.showLoading();
    fetch(`/api/admin/providers/${providerId}`)
        .then(window.handleResponse)
        .then(provider => {
            if (provider) {
                // We have provider data, populate the form
                const form = document.getElementById('provider-form');
                if (form) {
                    document.getElementById('provider-name').value = provider.name || '';
                    
                    const typeSelect = document.getElementById('provider-type');
                    if (typeSelect && provider.type) {
                        typeSelect.value = provider.type;
                        
                        // Trigger Alpine.js update on type change
                        const providerScope = typeSelect.closest('[x-data*="selectedType"]');
                        if (providerScope && providerScope.__x) {
                            providerScope.__x.data.selectedType = provider.type;
                        }
                        
                        // Show conditional fields based on type
                        window.toggleProviderConditionalFields();
                    }
                    
                    // Set URL if present
                    const baseUrlInput = document.getElementById('provider-base-url');
                    if (baseUrlInput) {
                        baseUrlInput.value = provider.base_url || '';
                    }
                    
                    // Don't populate API key as it's sensitive and should be blank on edit
                    const apiKeyInput = document.getElementById('provider-api-key');
                    if (apiKeyInput) {
                        apiKeyInput.value = ''; // Keep empty for security
                        apiKeyInput.placeholder = '(unchanged)';
                    }
                }
            } else {
                window.showError("Failed to load provider details.");
            }
        })
        .catch(error => {
            window.showError(`Error fetching provider: ${error.message}`);
        })
        .finally(() => {
            window.hideLoading();
        });
};

// Fetch user details for editing
window.fetchUserDetails = function(userId) {
    console.log(`Fetching details for user ID: ${userId}`);
    window.showLoading();
    fetch(`/api/admin/users/${userId}`)
        .then(window.handleResponse)
        .then(user => {
            if (user) {
                // We have user data, populate the form
                const form = document.getElementById('user-form');
                if (form) {
                    document.getElementById('username').value = user.username || '';
                    document.getElementById('email').value = user.email || '';
                    document.getElementById('first-name').value = user.first_name || '';
                    document.getElementById('last-name').value = user.last_name || '';
                    
                    // Set role dropdown
                    const roleSelect = document.getElementById('role-id');
                    if (roleSelect && user.role_id) {
                        for (let i = 0; i < roleSelect.options.length; i++) {
                            if (roleSelect.options[i].value == user.role_id) {
                                roleSelect.selectedIndex = i;
                                break;
                            }
                        }
                    }
                    
                    // Set active status
                    const isActiveCheckbox = document.getElementById('user-is-active');
                    if (isActiveCheckbox) {
                        isActiveCheckbox.checked = user.is_active;
                    }
                    
                    // Hide password fields on edit
                    const passwordSection = document.getElementById('password-section');
                    if (passwordSection) passwordSection.style.display = 'none';
                }
            } else {
                window.showError("Failed to load user details.");
            }
        })
        .catch(error => {
            window.showError(`Error fetching user: ${error.message}`);
        })
        .finally(() => {
            window.hideLoading();
        });
};

window.toggleProviderConditionalFields = function() {
    console.log("Toggling provider conditional fields");
    const providerType = document.getElementById('provider-type')?.value;
    
    // Get all conditional field containers
    const openaiFields = document.getElementById('openai-fields');
    const ollamaFields = document.getElementById('ollama-fields');
    const anthropicFields = document.getElementById('anthropic-fields');
    
    // Hide all first
    if (openaiFields) openaiFields.style.display = 'none';
    if (ollamaFields) ollamaFields.style.display = 'none';
    if (anthropicFields) anthropicFields.style.display = 'none';
    
    // Show relevant fields based on selected type
    if (providerType === 'openai' && openaiFields) {
        openaiFields.style.display = 'block';
    } else if (providerType === 'ollama' && ollamaFields) {
        ollamaFields.style.display = 'block';
    } else if (providerType === 'anthropic' && anthropicFields) {
        anthropicFields.style.display = 'block';
    }
};

// Load providers for select dropdowns
window.loadProvidersAndPopulateDropdown = function(callback) {
    console.log("Loading providers for dropdown");
    fetch('/api/admin/providers')
        .then(response => {
            if (!response.ok) {
                throw new Error(`Failed to load providers: ${response.status}`);
            }
            return response.json();
        })
        .then(providers => {
            const providerDropdown = document.getElementById('model-provider-id');
            if (providerDropdown) {
                // Clear existing options first, keeping just the first placeholder
                while (providerDropdown.options.length > 1) {
                    providerDropdown.remove(1);
                }
                
                // Add providers as options
                providers.forEach(provider => {
                    const option = document.createElement('option');
                    option.value = provider.id;
                    option.textContent = provider.name;
                    providerDropdown.appendChild(option);
                });
            }
            if (callback && typeof callback === 'function') callback();
        })
        .catch(error => {
            console.error("Error loading providers:", error);
            if (callback && typeof callback === 'function') callback();
        });
};

// Load roles for select dropdowns
window.loadRolesAndPopulateDropdown = function(callback) {
    console.log("Loading roles for dropdown");
    fetch('/api/admin/roles')
        .then(response => {
            if (!response.ok) {
                throw new Error(`Failed to load roles: ${response.status}`);
            }
            return response.json();
        })
        .then(roles => {
            const roleDropdown = document.getElementById('role-id');
            if (roleDropdown) {
                // Clear existing options first, keeping just the first placeholder
                while (roleDropdown.options.length > 1) {
                    roleDropdown.remove(1);
                }
                
                // Add roles as options
                roles.forEach(role => {
                    const option = document.createElement('option');
                    option.value = role.id;
                    option.textContent = role.name;
                    roleDropdown.appendChild(option);
                });
            }
            if (callback && typeof callback === 'function') callback();
        })
        .catch(error => {
            console.error("Error loading roles:", error);
            if (callback && typeof callback === 'function') callback();
        });
};

// Define the modal functions in the global scope so Alpine.js can access them
window.openModelModal = function(action, modelId = null) {
    console.log(`Preparing model modal for action: ${action}`);
    const modal = document.getElementById('model-modal');
    if (!modal) { console.error("Model modal element not found!"); return; }

    // Setup form content (reset, title, potentially load data)
    const form = document.getElementById('model-form');
    if (form) form.reset();
    
    const title = document.getElementById('modal-title');
    const idInput = document.getElementById('model-id');
    if (idInput) idInput.value = ''; // Clear ID for add/edit
    if (title) title.textContent = action === 'add' ? 'Add New Model' : 'Edit Model';

    // Load providers needed for the dropdown
    if (window.loadProvidersAndPopulateDropdown) {
        window.loadProvidersAndPopulateDropdown(() => {
            if (action === 'edit' && modelId) {
                if(idInput) idInput.value = modelId; // Set ID for edit
                if (window.fetchModelDetails) window.fetchModelDetails(modelId); // This will populate the form fields
            }
            console.log(`Model modal ready for ${action}. Waiting for Alpine to show.`);
        });
    } else {
        console.error("loadProvidersAndPopulateDropdown not defined yet");
    }
};

window.openProviderModal = function(action, providerId = null) {
    console.log(`Preparing provider modal for action: ${action}`);
    const modal = document.getElementById('provider-modal');
    if (!modal) { console.error("Provider modal element not found!"); return; }
    
    // Setup form content
    const form = document.getElementById('provider-form');
    if (form) form.reset();
    
    const idInput = document.getElementById('provider-id');
    const title = document.getElementById('provider-modal-title');
    if (idInput) idInput.value = '';
    if (title) title.textContent = action === 'add' ? 'Add New Provider' : 'Edit Provider';

    const providerTypeSelect = document.getElementById('provider-type');
    if (providerTypeSelect) {
        providerTypeSelect.value = ''; // Reset dropdown
        // Manually trigger Alpine update for conditional fields (if needed)
        const providerScope = providerTypeSelect.closest('[x-data*="selectedType"]');
        if(providerScope && providerScope.__x) {
            providerScope.__x.data.selectedType = '';
        }
        if (window.toggleProviderConditionalFields) window.toggleProviderConditionalFields(); // Ensure fields are hidden initially
    }
    
    if (action === 'edit' && providerId) {
        if(idInput) idInput.value = providerId;
        if (window.fetchProviderDetails) window.fetchProviderDetails(providerId); // Populates form
    }
    console.log(`Provider modal ready for ${action}. Waiting for Alpine to show.`);
};

window.openUserModal = function(action, userId = null) {
    console.log(`Preparing user modal for action: ${action}`);
    const modal = document.getElementById('user-modal');
    if (!modal) { console.error("User modal not found!"); return; }

    // Setup form content first
    const form = document.getElementById('user-form');
    if (form) form.reset();
    
    // Set hidden input 
    const idInput = document.getElementById('user-id');
    if (idInput) idInput.value = '';
    
    // Prepare roles dropdown and data
    if (window.loadRolesAndPopulateDropdown) {
        window.loadRolesAndPopulateDropdown(() => {
            if (action === 'edit' && userId) {
                if(idInput) idInput.value = userId;
                if (window.fetchUserDetails) window.fetchUserDetails(userId);
            }
            console.log(`User modal ready for ${action}. Waiting for Alpine to show.`);
        });
    } else {
        console.error("loadRolesAndPopulateDropdown not defined yet");
    }
};

window.openChangePasswordModal = function(userId, username) {
    console.log(`Preparing change password modal for user: ${username}`);
    const modal = document.getElementById('change-password-modal');
    if (!modal) { console.error("Change password modal not found!"); return; }

    // Set up form first
    const form = document.getElementById('change-password-form');
    if (form) form.reset();
    
    // Set user ID
    const userIdInput = document.getElementById('change-password-user-id');
    if (userIdInput) userIdInput.value = userId || '';
    
    console.log(`Change password modal ready. Waiting for Alpine to show.`);
};

window.openConfirmModal = function(message, action, itemId, itemType) {
    console.log(`Preparing confirm modal for action: ${action}, ID: ${itemId}, Type: ${itemType}`);
    const modal = document.getElementById('confirm-modal');
    if (!modal) { console.error("Confirm modal not found!"); return; }
    
    // Store action, item ID, and item TYPE for the confirmation handler
    window.currentAction = action;
    window.currentItemId = itemId;
    window.currentItemType = itemType; // Store the passed type

    console.log(`Confirm modal ready. Waiting for Alpine to show.`);
    // Dispatch event with details (optional, but good practice)
    window.dispatchEvent(new CustomEvent('open-confirm-modal', {
        detail: { message: message }
    }));
};

// Handle confirmation actions
window.handleConfirmAction = function() {
    // Retrieve stored action, ID, and TYPE
    const action = window.currentAction;
    const itemId = window.currentItemId;
    const itemType = window.currentItemType; // Use the stored type

    console.log(`Handling confirm action: ${action}, ID: ${itemId}, Type: ${itemType}`); // Log type

    // --- Dispatch event to close modal --- 
    console.log("Dispatching close-confirm-modal event.");
    window.dispatchEvent(new CustomEvent('close-confirm-modal'));
    // --- Removed direct state manipulation ---
    // const confirmModal = document.getElementById('confirm-modal');
    // if (confirmModal && confirmModal.__x) {
    //    console.log("Attempting to close confirm modal via Alpine state."); 
    //    confirmModal.__x.data.open = false; 
    // } else {
    //    console.error("Could not find Alpine instance on confirm modal to close it."); 
    // }

    if (!action || !itemId || !itemType) { // Check itemType as well
        window.showError(`Missing action information (Action: ${action}, ID: ${itemId}, Type: ${itemType}). Please try again.`);
        return;
    }

    // Determine which action to take based on action AND type
    if (action === 'delete' && itemType === 'model') {
        window.performDeleteModel(itemId);
    } else if (action === 'delete' && itemType === 'user') {
        window.performDeleteUser(itemId);
    } else if (action === 'delete' && itemType === 'provider') {
        window.performDeleteProvider(itemId);
    } else if (action === 'delete' && itemType === 'search_provider') {
        window.performDeleteSearchProvider(itemId);
    } else {
        window.showError(`Unknown combination: Action='${action}', Type='${itemType}'`); // Updated error message
    }
};

window.performDeleteModel = function(modelId) {
    window.showLoading();
    fetch(`/api/admin/models/${modelId}`, {
        method: 'DELETE'
    })
    .then(window.handleResponse)
    .then(() => {
        window.showSuccess("Model deleted successfully.");
        // Refresh the models list
        if (window.loadModelsPromise) {
            window.loadModelsPromise();
        } else {
            location.reload(); // Fallback
        }
    })
    .catch(error => {
        window.showError(`Failed to delete model: ${error.message}`);
    })
    .finally(() => {
        window.hideLoading();
    });
};

window.performDeleteUser = function(userId) {
    window.showLoading();
    fetch(`/api/admin/users/${userId}`, {
        method: 'DELETE'
    })
    .then(window.handleResponse)
    .then(() => {
        window.showSuccess("User deleted successfully.");
        // Refresh the users list
        if (window.loadUsersPromise) {
            window.loadUsersPromise();
        } else {
            location.reload(); // Fallback
        }
    })
    .catch(error => {
        window.showError(`Failed to delete user: ${error.message}`);
    })
    .finally(() => {
        window.hideLoading();
    });
};

window.performDeleteProvider = function(providerId) {
    window.showLoading();
    fetch(`/api/admin/providers/${providerId}`, {
        method: 'DELETE'
    })
    .then(window.handleResponse)
    .then(() => {
        window.showSuccess("Provider and all associated models deleted successfully.");
        // Refresh both lists
        if (window.loadProvidersPromise && window.loadModelsPromise) {
            window.loadProvidersPromise().then(window.loadModelsPromise);
        } else {
            location.reload(); // Fallback
        }
    })
    .catch(error => {
        window.showError(`Failed to delete provider: ${error.message}`);
    })
    .finally(() => {
        window.hideLoading();
    });
};

window.setUserPassword = function(userId, password) {
    window.showLoading();
    
    fetch(`/api/admin/users/${userId}/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: password })
    })
    .then(window.handleResponse)
    .then(() => {
        window.showSuccess("Password changed successfully.");
        // Close the modal
        const changePasswordModal = document.getElementById('change-password-modal');
        if (changePasswordModal && changePasswordModal.__x) {
            changePasswordModal.__x.data.open = false;
        }
    })
    .catch(error => {
        window.showError(`Failed to change password: ${error.message}`);
    })
    .finally(() => {
        window.hideLoading();
    });
};

// Filter Functions
window.filterModels = function() {
    console.log("Filtering models");
    const searchInput = document.getElementById('model-search');
    const providerFilter = document.getElementById('provider-filter');
    const activeOnlyCheckbox = document.getElementById('active-only');
    
    const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
    const selectedProviderId = providerFilter ? providerFilter.value : '';
    const activeOnly = activeOnlyCheckbox ? activeOnlyCheckbox.checked : false;
    
    const modelCards = document.querySelectorAll('.model-card');
    let visibleCount = 0;
    
    modelCards.forEach(card => {
        const modelName = (card.dataset.name || '').toLowerCase();
        const providerId = card.dataset.providerId || '';
        const isActive = card.dataset.active === 'true';
        
        const matchesSearch = !searchTerm || modelName.includes(searchTerm);
        const matchesProvider = !selectedProviderId || providerId === selectedProviderId;
        const matchesActive = !activeOnly || isActive;
        
        const isVisible = matchesSearch && matchesProvider && matchesActive;
        card.style.display = isVisible ? 'flex' : 'none';
        
        if (isVisible) visibleCount++;
    });
    
    // Update "no results" message
    window.updateNoResultsMessage(
        document.getElementById('model-list'),
        visibleCount,
        modelCards.length,
        'models'
    );
};

window.filterUsers = function() {
    console.log("Filtering users");
    const searchInput = document.getElementById('user-search');
    const roleFilter = document.getElementById('role-filter');
    const activeOnlyCheckbox = document.getElementById('user-active-only');
    
    const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
    const selectedRoleId = roleFilter ? roleFilter.value : '';
    const activeOnly = activeOnlyCheckbox ? activeOnlyCheckbox.checked : false;
    
    const userCards = document.querySelectorAll('.user-card');
    let visibleCount = 0;
    
    userCards.forEach(card => {
        const userName = (card.dataset.name || '').toLowerCase();
        const userEmail = (card.dataset.email || '').toLowerCase();
        const roleId = card.dataset.roleId || '';
        const isActive = card.dataset.active === 'true';
        
        const matchesSearch = !searchTerm || 
            userName.includes(searchTerm) || 
            userEmail.includes(searchTerm);
        const matchesRole = !selectedRoleId || roleId === selectedRoleId;
        const matchesActive = !activeOnly || isActive;
        
        const isVisible = matchesSearch && matchesRole && matchesActive;
        card.style.display = isVisible ? 'flex' : 'none';
        
        if (isVisible) visibleCount++;
    });
    
    // Update "no results" message
    window.updateNoResultsMessage(
        document.getElementById('user-list'),
        visibleCount,
        userCards.length,
        'users'
    );
};

window.updateNoResultsMessage = function(listElement, visibleCount, totalCards, itemType) {
    if (!listElement) return;
    
    // Remove existing no-results message if any
    const existingMsg = listElement.querySelector('.no-results-filter');
    if (existingMsg) existingMsg.remove();
    
    // If we have cards but none are visible, show a message
    if (totalCards > 0 && visibleCount === 0) {
        const noResultsMsg = document.createElement('div');
        noResultsMsg.className = 'no-results-filter text-center col-span-full p-6 text-gray-400';
        noResultsMsg.innerHTML = `No ${itemType} match your filters. <button class="text-green-400 hover:underline clear-filters">Clear filters</button>`;
        listElement.appendChild(noResultsMsg);
        
        // Add event listener to clear filters button
        const clearBtn = noResultsMsg.querySelector('.clear-filters');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                // Reset the filters
                if (itemType === 'models') {
                    const searchInput = document.getElementById('model-search');
                    const providerFilter = document.getElementById('provider-filter');
                    const activeOnly = document.getElementById('active-only');
                    
                    if (searchInput) searchInput.value = '';
                    if (providerFilter) providerFilter.value = '';
                    if (activeOnly) activeOnly.checked = false;
                    
                    window.filterModels();
                } else if (itemType === 'users') {
                    const searchInput = document.getElementById('user-search');
                    const roleFilter = document.getElementById('role-filter');
                    const activeOnly = document.getElementById('user-active-only');
                    
                    if (searchInput) searchInput.value = '';
                    if (roleFilter) roleFilter.value = '';
                    if (activeOnly) activeOnly.checked = false;
                    
                    window.filterUsers();
                }
            });
        }
    }
};

// Add data loading functions
window.loadModelsPromise = function() {
    return fetch('/api/admin/models')
        .then(window.handleResponse)
        .then(models => {
            window.renderModels(Array.isArray(models) ? models : []);
            return models;
        })
        .catch(err => { 
            console.error("Load Models Promise Failed:", err); 
            throw err; 
        });
};

window.loadProvidersPromise = function() {
    return fetch('/api/admin/providers')
        .then(window.handleResponse)
        .then(providers => {
            // Ensure providers is an array before proceeding
            const providerArray = Array.isArray(providers) ? providers : [];
            window.renderProviders(providerArray);
            window.populateModelProviderDropdown(providerArray);
            window.populateModelFilterDropdown(providerArray);
            return providerArray;
        })
        .catch(err => { 
            console.error("Load Providers Promise Failed:", err); 
            throw err; 
        });
};

window.loadUsersPromise = function() {
    return fetch('/api/admin/users')
        .then(window.handleResponse)
        .then(users => {
            window.renderUsers(Array.isArray(users) ? users : []);
            return users;
        })
        .catch(err => { 
            console.error("Load Users Promise Failed:", err); 
            throw err; 
        });
};

window.loadRolesPromise = function() {
    return fetch('/api/admin/roles')
        .then(window.handleResponse)
        .then(roles => {
            const roleArray = Array.isArray(roles) ? roles : [];
            window.renderRoles(roleArray);
            window.populateRoleSelectOptions(roleArray);
            window.populateRoleFilter(roleArray);
            return roleArray;
        })
        .catch(err => { 
            console.error("Load Roles Promise Failed:", err); 
            throw err; 
        });
};

window.loadSearchProvidersPromise = function() {
    return fetch('/api/admin/search-providers')
        .then(window.handleResponse)
        .then(providers => {
            window.renderSearchProviders(Array.isArray(providers) ? providers : []);
            return providers;
        })
        .catch(err => { 
            console.error("Load Search Providers Promise Failed:", err);
            window.renderSearchProviders([]); // Render empty state on error
            // Do not re-throw, allow other loads to continue if possible
            return []; 
        });
};

window.loadAllData = function() {
    window.showLoading();
    Promise.all([
        window.loadProvidersPromise(),
        window.loadModelsPromise(),
        window.loadUsersPromise(),
        window.loadRolesPromise(),
        window.loadSearchProvidersPromise()
    ])
    .then(() => {
        console.log("Initial data load complete.");
    })
    .catch(error => {
        console.error("Error during initial data load:", error);
        window.showError("Failed to load initial admin data. Please refresh.");
    })
    .finally(() => {
        window.hideLoading();
    });
};

// Dropdown utilities
window.populateModelProviderDropdown = function(providers) {
    const dropdown = document.getElementById('model-provider-id');
    if (!dropdown) return;
    
    // Clear existing options first (except the first placeholder)
    while (dropdown.options.length > 1) {
        dropdown.remove(1);
    }
    
    // Add providers as options
    providers.forEach(provider => {
        const option = document.createElement('option');
        option.value = provider.id;
        option.textContent = provider.name;
        dropdown.appendChild(option);
    });
};

window.populateModelFilterDropdown = function(providers) {
    const dropdown = document.getElementById('provider-filter');
    if (!dropdown) return;
    
    // Clear existing options first (except the first placeholder)
    while (dropdown.options.length > 1) {
        dropdown.remove(1);
    }
    
    // Add providers as options
    providers.forEach(provider => {
        const option = document.createElement('option');
        option.value = provider.id;
        option.textContent = provider.name;
        dropdown.appendChild(option);
    });
};

window.populateRoleSelectOptions = function(roles) {
    const dropdown = document.getElementById('role-id');
    if (!dropdown) return;
    
    // Clear existing options first (except the first placeholder)
    while (dropdown.options.length > 1) {
        dropdown.remove(1);
    }
    
    // Add roles as options
    roles.forEach(role => {
        const option = document.createElement('option');
        option.value = role.id;
        option.textContent = role.name;
        dropdown.appendChild(option);
    });
};

window.populateRoleFilter = function(roles) {
    const dropdown = document.getElementById('role-filter');
    if (!dropdown) return;
    
    // Clear existing options first (except the first placeholder)
    while (dropdown.options.length > 1) {
        dropdown.remove(1);
    }
    
    // Add roles as options
    roles.forEach(role => {
        const option = document.createElement('option');
        option.value = role.id;
        option.textContent = role.name;
        dropdown.appendChild(option);
    });
};

// Rendering functions
window.renderModels = function(models) {
    const modelList = document.getElementById('model-list');
    if (!modelList) return;
    
    const modelArray = Array.isArray(models) ? models : [];
    modelList.innerHTML = ''; // Clear previous

    if (modelArray.length === 0) {
        modelList.innerHTML = '<div class="no-results text-center col-span-full p-6 text-gray-400">No models found. Add a provider and sync or add manually.</div>';
        return;
    }

    modelArray.forEach(model => {
        const card = document.createElement('div');
        const providerId = String(model.provider_id);
        const isActive = model.is_active;
        const providerType = model.provider ? model.provider.type : 'unknown';

        // Use CSS classes instead of inline styles
        card.className = `model-card card rounded-lg shadow p-4 flex flex-col justify-between space-y-3 ${!isActive ? 'opacity-60' : ''}`;
        
        card.dataset.id = model.id;
        card.dataset.providerId = providerId;
        card.dataset.active = isActive;
        card.dataset.name = model.name;
        card.dataset.providerType = providerType;

        // Use the new function to generate innerHTML
        card.innerHTML = window.createModelCardHTML(model);
        
        modelList.appendChild(card);
        
        // Add listeners directly after appending
        card.querySelector('[data-action="edit"]')?.addEventListener('click', () => {
            window.openModelModal('edit', model.id);
            window.dispatchEvent(new CustomEvent('open-model-modal'));
        });
        card.querySelector('[data-action="delete"]')?.addEventListener('click', () => {
            // Pass 'model' as the itemType
            window.openConfirmModal(`Are you sure you want to delete model '${window.escapeHtml(model.name)}'?`, 'delete', model.id, 'model');
        });
        card.querySelector('[data-action="toggle"]')?.addEventListener('click', (e) => {
            const button = e.currentTarget;
            const currentIsActive = button.dataset.active === 'true';
            window.toggleModelStatus(model.id, !currentIsActive);
        });
    });
    window.filterModels();
};

window.renderProviders = function(providers) {
    const providersListElement = document.getElementById('provider-list');
    if (!providersListElement) return;
    
    const providerArray = Array.isArray(providers) ? providers : [];
    providersListElement.innerHTML = ''; // Clear previous

    if (providerArray.length === 0) {
        providersListElement.innerHTML = '<div class="no-results text-center col-span-full p-6 text-gray-400">No providers configured.</div>';
        return;
    }

    providerArray.forEach(provider => {
        const card = document.createElement('div');
        // Use CSS classes instead of inline styles
        card.className = 'provider-card rounded-lg shadow p-4 flex flex-col justify-between space-y-3';
        
        card.dataset.id = provider.id;
        card.dataset.type = provider.type;

        let syncButtonHTML = '';
        if (provider.type === 'ollama' || provider.type === 'openai') {
            // Tailwind button classes
            syncButtonHTML = `<button class="text-xs py-1 px-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded shadow sync-btn" data-action="sync" data-id="${provider.id}">Sync Models</button>`;
        }

        // Use CSS classes instead of inline styles
        card.innerHTML = `
            <div>
                <div class="flex justify-between items-start mb-2">
                    <h3 class="text-lg font-semibold card-title">${window.escapeHtml(provider.name)}</h3>
                    <span class="text-xs uppercase font-bold px-2 py-1 rounded ${provider.type === 'ollama' ? 'bg-purple-600 text-white' : provider.type === 'openai' ? 'bg-teal-600 text-white' : 'bg-yellow-600 text-black'}">${window.escapeHtml(provider.type)}</span>
                </div>
                <div class="text-sm card-content space-y-1">
                    ${provider.base_url ? `<p><span class="font-medium label">URL:</span> <code class="text-xs">${window.escapeHtml(provider.base_url)}</code></p>` : ''}
                    <p><span class="font-medium label">Created:</span> ${new Date(provider.created_at).toLocaleString()}</p>
                </div>
            </div>
            <div class="flex justify-end space-x-2 pt-3 mt-3 card-footer">
                <button class="text-xs py-1 px-2 bg-gray-600 hover:bg-gray-500 text-white font-semibold rounded shadow" data-action="view-models" data-id="${provider.id}">View Models</button>
                ${syncButtonHTML}
                <button class="text-xs py-1 px-2 bg-yellow-500 hover:bg-yellow-600 text-black font-semibold rounded shadow" data-action="edit-provider" data-id="${provider.id}">Edit</button>
                <button class="text-xs py-1 px-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded shadow" data-action="delete-provider" data-id="${provider.id}">Delete</button>
            </div>
        `;
        providersListElement.appendChild(card);
        
        // Add listeners directly again
        card.querySelector('[data-action="edit-provider"]')?.addEventListener('click', () => {
            window.openProviderModal('edit', provider.id);
            window.dispatchEvent(new CustomEvent('open-provider-modal'));
        });
        card.querySelector('[data-action="delete-provider"]')?.addEventListener('click', () => {
            // Pass 'provider' as the itemType
            window.openConfirmModal(`Are you sure you want to delete provider '${window.escapeHtml(provider.name)}' and ALL its models? This cannot be undone.`, 'delete', provider.id, 'provider');
        });
        card.querySelector('[data-action="sync"]')?.addEventListener('click', (e) => window.syncProvider(provider.id, e.target));
        card.querySelector('[data-action="view-models"]')?.addEventListener('click', () => window.viewProviderModels(provider.id));
    });
};

window.renderUsers = function(users) {
    const userList = document.getElementById('user-list');
    if (!userList) return;
    
    const userArray = Array.isArray(users) ? users : [];
    userList.innerHTML = ''; // Clear previous

    if (userArray.length === 0) {
        userList.innerHTML = '<div class="no-results text-center col-span-full p-6 text-gray-400">No users found.</div>';
        return;
    }

    userArray.forEach(user => {
        const card = document.createElement('div');
        const roleName = user.role ? user.role.name : 'Unknown';
        const roleClass = roleName.toLowerCase();
        const isActive = user.is_active;

        // Use CSS classes instead of hardcoded bg-gray-700
        card.className = `user-card rounded-lg shadow p-4 flex flex-col justify-between space-y-3 ${!isActive ? 'opacity-60' : ''}`;
        card.dataset.id = user.id;
        card.dataset.roleId = user.role_id;
        card.dataset.active = isActive;
        card.dataset.name = user.username;
        card.dataset.email = user.email;

        // Use CSS classes for proper styling
        card.innerHTML = `
            <div>
                <div class="flex justify-between items-start mb-2">
                    <h3 class="text-lg font-semibold card-title">${window.escapeHtml(user.username)}</h3>
                    <span class="text-xs uppercase font-bold px-2 py-1 rounded ${roleClass === 'admin' ? 'bg-red-600 text-white' : 'bg-blue-600 text-white'}">${window.escapeHtml(roleName)}</span>
                </div>
                <div class="text-sm card-content space-y-1">
                    <p><span class="font-medium label">Email:</span> ${window.escapeHtml(user.email)}</p>
                    <p><span class="font-medium label">Name:</span> ${window.escapeHtml(user.first_name || '')} ${window.escapeHtml(user.last_name || '')}</p>
                    <p><span class="font-medium label">Status:</span> <span class="font-bold ${isActive ? 'text-green-400' : 'text-red-400'}">${isActive ? 'Active' : 'Inactive'}</span></p>
                </div>
            </div>
            <div class="flex justify-end space-x-2 pt-3 mt-3 card-footer">
                <button class="text-xs py-1 px-2 bg-yellow-500 hover:bg-yellow-600 text-black font-semibold rounded shadow" data-action="edit-user" data-id="${user.id}">Edit</button>
                <button class="text-xs py-1 px-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded shadow" data-action="delete-user" data-id="${user.id}">Delete</button>
            </div>
        `;
        userList.appendChild(card);
        
        // Add listeners directly again
        card.querySelector('[data-action="edit-user"]')?.addEventListener('click', () => {
            window.openUserModal('edit', user.id);
            window.dispatchEvent(new CustomEvent('open-user-modal', { detail: { isNew: false } }));
        });
        card.querySelector('[data-action="delete-user"]')?.addEventListener('click', () => {
            // Pass 'user' as the itemType
            window.openConfirmModal(`Are you sure you want to deactivate user '${window.escapeHtml(user.username)}'?`, 'delete', user.id, 'user');
        });
    });
    window.filterUsers();
};

window.renderRoles = function(roles) {
    const roleList = document.getElementById('role-list');
    if (!roleList) return;
    
    const roleArray = Array.isArray(roles) ? roles : [];
    roleList.innerHTML = ''; // Clear previous

    if (roleArray.length === 0) {
        roleList.innerHTML = '<div class="no-results text-center p-6 text-gray-400">No roles found.</div>';
        return;
    }

    roleArray.forEach(role => {
        const card = document.createElement('div');
        // Use CSS classes instead of hardcoded bg-gray-700
        card.className = 'role-card rounded-lg shadow p-4 space-y-2';
        card.dataset.id = role.id;
        card.dataset.name = role.name;

        card.innerHTML = `
            <h3 class="text-lg font-semibold card-title">${window.escapeHtml(role.name)}</h3>
            <p class="text-sm card-content">${window.escapeHtml(role.description || 'No description')}</p>
            <div class="role-users pt-2 mt-2 card-footer">
                <div class="text-xs font-medium label mb-1">Users with this role:</div>
                <div class="role-users-list flex flex-wrap gap-1" id="role-users-${role.id}">
                    <div class="role-users-loading text-xs opacity-60 italic">Loading...</div>
                </div>
            </div>
            <!-- Role Actions Placeholder -->
        `;
        roleList.appendChild(card);
        window.loadUsersForRole(role.id); // Fetch users for this role
    });
};

window.renderUsersForRole = function(roleId, users) {
    const usersListContainer = document.getElementById(`role-users-${roleId}`);
    if (!usersListContainer) return;
    
    const loadingIndicator = usersListContainer.querySelector('.role-users-loading');
    if(loadingIndicator) loadingIndicator.remove(); // Remove loading indicator

    const userArray = Array.isArray(users) ? users : [];

    if (userArray.length === 0) {
        usersListContainer.innerHTML = '<span class="text-xs text-gray-500 italic">None</span>';
        return;
    }

    usersListContainer.innerHTML = ''; // Clear container
    userArray.forEach(user => {
        const chip = document.createElement('span');
        // Tailwind chip style
        chip.className = 'user-chip text-xs bg-gray-600 text-gray-200 px-2 py-0.5 rounded-full';
        chip.textContent = window.escapeHtml(user.username);
        usersListContainer.appendChild(chip);
    });
};

window.loadUsersForRole = function(roleId) {
    const usersListContainer = document.getElementById(`role-users-${roleId}`);
    if (!usersListContainer) return;
    
    const loadingIndicator = usersListContainer.querySelector('.role-users-loading');
    if(loadingIndicator) loadingIndicator.style.display = 'inline';

    fetch(`/api/admin/roles/${roleId}/users`)
        .then(window.handleResponse)
        .then(users => {
            // Pass array (or null) to render function
            window.renderUsersForRole(roleId, Array.isArray(users) ? users : []);
        })
        .catch(error => {
            console.error(`Error loading users for role ${roleId}:`, error);
            if (usersListContainer) usersListContainer.innerHTML = '<span class="text-xs text-red-500 italic">Error</span>';
        })
        .finally(() => {
            // Loading indicator is removed by render function if it exists
            if(loadingIndicator && usersListContainer.contains(loadingIndicator)) {
                loadingIndicator.remove();
            }
        });
};

window.toggleModelStatus = function(modelId, newStatus) {
    window.showLoading();
    fetch(`/api/admin/models/${modelId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: newStatus }) // Send only the field to update
    })
    .then(window.handleResponse) // Check if PUT was successful (status 2xx)
    .then(putResponseData => { // Optional: Check putResponseData if API returns something useful beyond status
        // PUT successful, now fetch the complete updated data using GET
        console.log(`PUT successful for model ${modelId}. Fetching complete data...`);
        return fetch(`/api/admin/models/${modelId}`); // *** Make GET request ***
    })
    .then(window.handleResponse) // Handle response of the GET request
    .then(completeModelData => {
        console.log('Complete Model Data Received:', JSON.stringify(completeModelData, null, 2)); // *** ADD LOGGING ***
        if (!completeModelData) {
            throw new Error("API did not return complete model data after update.");
        }
        window.showSuccess(`Model ${completeModelData.is_active ? 'enabled' : 'disabled'} successfully.`);

        // Replace the old card with a new one rendered from completeModelData
        const oldCard = document.querySelector(`.model-card[data-id="${modelId}"]`);
        if (oldCard) {
            const newCard = document.createElement('div');
            const isActive = completeModelData.is_active;
            const providerType = completeModelData.provider ? completeModelData.provider.type : 'unknown';

            // Set necessary classes and data attributes for the new card container
            newCard.className = `model-card card rounded-lg shadow p-4 flex flex-col justify-between space-y-3 ${!isActive ? 'opacity-60' : ''}`;
            newCard.dataset.id = completeModelData.id;
            newCard.dataset.providerId = String(completeModelData.provider_id);
            newCard.dataset.active = isActive;
            newCard.dataset.name = completeModelData.name;
            newCard.dataset.providerType = providerType;

            // Generate the inner HTML using the full complete model data
            newCard.innerHTML = window.createModelCardHTML(completeModelData);

            // Re-attach listeners to the new card's buttons
            newCard.querySelector('[data-action="edit"]')?.addEventListener('click', () => {
                window.openModelModal('edit', completeModelData.id);
                window.dispatchEvent(new CustomEvent('open-model-modal'));
            });
            newCard.querySelector('[data-action="delete"]')?.addEventListener('click', () => {
                // Pass 'model' as the itemType
                window.openConfirmModal(`Are you sure you want to delete model '${window.escapeHtml(completeModelData.name)}'?`, 'delete', completeModelData.id, 'model');
            });
            newCard.querySelector('[data-action="toggle"]')?.addEventListener('click', (e) => {
                const button = e.currentTarget;
                const currentIsActive = button.dataset.active === 'true';
                window.toggleModelStatus(completeModelData.id, !currentIsActive);
            });

            // Replace the old card with the new one in the DOM
            oldCard.parentNode.replaceChild(newCard, oldCard);
            window.filterModels(); // Re-apply filters if necessary
        } else {
            console.warn(`Could not find model card with ID ${modelId} to update in UI after GET.`);
            // Fallback: Reload all models if card replacement fails
            window.loadModelsPromise();
        }
    })
    .catch(error => {
        window.showError(`Failed to update model status: ${error.message}`);
        // Optional: Reload models on failure to potentially reset state
        window.loadModelsPromise();
    })
    .finally(() => {
        window.hideLoading();
    });
};

window.syncProvider = function(providerId, buttonElement) {
    if (buttonElement) {
        buttonElement.disabled = true;
        buttonElement.textContent = 'Syncing...';
    }
    
    window.showLoading();
    fetch(`/api/admin/providers/${providerId}/sync`, {
        method: 'POST'
    })
    .then(window.handleResponse)
    .then(result => {
        const addedCount = result?.models_created || 0;
        const message = addedCount > 0
            ? `Successfully synced provider! Added ${addedCount} new model(s).`
            : 'Provider synced. No new models found.';
        window.showSuccess(message);
        
        // Refresh the models list
        window.loadModelsPromise();
    })
    .catch(error => {
        window.showError(`Failed to sync provider: ${error.message}`);
    })
    .finally(() => {
        if (buttonElement) {
            buttonElement.disabled = false;
            buttonElement.textContent = 'Sync Models';
        }
        window.hideLoading();
    });
};

window.viewProviderModels = function(providerId) {
    console.log(`View models clicked for provider ID: ${providerId}`); // Add log
    // Dispatch an event to be caught by the root Alpine component
    window.dispatchEvent(new CustomEvent('set-active-section', {
        detail: {
            section: 'models',
            filterProviderId: providerId
        }
    }));
    // --- REMOVED ALPINE DIRECT ACCESS, FILTERING, SCROLLING --- 
    // const providerFilter = document.getElementById('provider-filter');
    // if (providerFilter) {
    //     providerFilter.value = providerId;
    //     const rootDataElement = document.body;
    //     if (rootDataElement && rootDataElement.__x) { ... }
    // }
};

// Function to create a single model card HTML (Extracted from renderModels)
window.createModelCardHTML = function(model) {
    const providerName = model.provider ? window.escapeHtml(model.provider.name) : `Provider ID: ${model.provider_id}`;
    const providerType = model.provider ? model.provider.type : 'unknown';
    const isActive = model.is_active;

    let formattedLastSynced = 'Never';
    if (model.last_synced_at) {
        try {
            const syncDate = new Date(model.last_synced_at);
            if (!isNaN(syncDate.getTime())) formattedLastSynced = syncDate.toLocaleString();
            else formattedLastSynced = 'Invalid Date';
        } catch (e) { formattedLastSynced = 'Parsing Error'; }
    }

    return `
        <div>
            <div class="flex justify-between items-start mb-2">
                <h3 class="text-lg font-semibold card-title">${window.escapeHtml(model.name)}</h3>
                <span class="text-xs uppercase font-bold px-2 py-1 rounded ${providerType === 'ollama' ? 'provider-badge ollama' : providerType === 'openai' ? 'provider-badge openai' : 'provider-badge other'}">${providerName}</span>
            </div>
            <div class="text-sm card-content space-y-1 card-details">
                <p><span class="font-medium label">Model ID:</span> <code class="text-xs model-id-display">${window.escapeHtml(model.model_id)}</code></p>
                <p><span class="font-medium label">Max Tokens:</span> <span>${model.max_tokens.toLocaleString()}</span></p>
                <p><span class="font-medium label">Temp:</span> <span>${model.temperature === null ? 'N/A' : (model.temperature?.toFixed(2) ?? 'N/A')}</span></p>
                <p><span class="font-medium label">Status:</span> <span class="font-bold ${isActive ? 'status-badge active' : 'status-badge inactive'}">${isActive ? 'Active' : 'Inactive'}</span></p>
                <p><span class="font-medium label">Synced:</span> <span>${formattedLastSynced}</span></p>
            </div>
        </div>
        <div class="flex justify-end space-x-2 pt-3 mt-3 card-footer">
            <button class="text-xs py-1 px-2 ${isActive ? 'bg-yellow-500 hover:bg-yellow-600 text-black' : 'bg-cyan-500 hover:bg-cyan-600 text-black'} font-semibold rounded shadow toggle-btn"
                data-action="toggle" data-id="${model.id}" data-active="${isActive}">
                ${isActive ? 'Disable' : 'Enable'}
            </button>
            <button class="text-xs py-1 px-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded shadow" data-action="edit" data-id="${model.id}">Edit</button>
            <button class="text-xs py-1 px-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded shadow" data-action="delete" data-id="${model.id}">Delete</button>
        </div>
    `;
}

// --- NEW: Render Search Providers --- 
window.renderSearchProviders = function(providers) {
    const listElement = document.getElementById('search-provider-list');
    if (!listElement) return;

    const providerArray = Array.isArray(providers) ? providers : [];
    listElement.innerHTML = ''; // Clear previous

    if (providerArray.length === 0) {
        listElement.innerHTML = '<div class="no-results text-center col-span-full p-6 text-on-surface opacity-60">No search providers configured.</div>';
        return;
    }

    providerArray.forEach(provider => {
        const card = document.createElement('div');
        card.className = 'search-provider-card card rounded-lg shadow p-4 flex flex-col justify-between space-y-3'; // Use .card base class
        card.dataset.id = provider.id;
        card.dataset.type = provider.type;
        card.dataset.name = provider.name; // For confirmation dialog

        const isDefaultBadge = provider.is_default 
            ? '<span class="text-xs font-bold px-2 py-0.5 rounded bg-primary text-on-primary">Default</span>' 
            : '';

        const providerTypeClass = provider.type === 'google_cse' ? 'bg-cyan-500 text-black' : 'bg-yellow-500 text-black'; // Example colors

        card.innerHTML = `
            <div>
                <div class="flex justify-between items-start mb-2">
                    <h3 class="text-lg font-semibold card-title">${window.escapeHtml(provider.name)}</h3>
                    <span class="text-xs uppercase font-bold px-2 py-1 rounded ${providerTypeClass}">${window.escapeHtml(provider.type)}</span>
                </div>
                <div class="text-sm card-content space-y-1 card-details">
                    ${provider.type === 'google_cse' && provider.search_engine_id ? `<p><span class="font-medium label">Engine ID:</span> <span>${window.escapeHtml(provider.search_engine_id)}</span></p>` : ''}
                    <p><span class="font-medium label">Status:</span> ${isDefaultBadge || '<span class="text-xs text-on-surface opacity-60">Not Default</span>'}</p>
                    <p><span class="font-medium label">Created:</span> <span>${new Date(provider.created_at).toLocaleString()}</span></p>
                 </div>
            </div>
            <div class="flex justify-end space-x-2 pt-3 mt-3 card-footer">
                <button class="text-xs py-1 px-2 bg-yellow-500 hover:bg-yellow-600 text-black font-semibold rounded shadow" data-action="edit-search-provider" data-id="${provider.id}">Edit</button>
                <button class="text-xs py-1 px-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded shadow" data-action="delete-search-provider" data-id="${provider.id}">Delete</button>
            </div>
        `;
        listElement.appendChild(card);

        // Add listeners
        card.querySelector('[data-action="edit-search-provider"]')?.addEventListener('click', () => {
            window.openSearchProviderModal('edit', provider.id);
            window.dispatchEvent(new CustomEvent('open-search-provider-modal', { detail: { provider: provider } })); // Pass provider for type check
        });
        card.querySelector('[data-action="delete-search-provider"]')?.addEventListener('click', () => {
            window.openConfirmModal(`Are you sure you want to delete search provider '${window.escapeHtml(provider.name)}'?`, 'delete', provider.id, 'search_provider');
        });
    });
};

// --- NEW: Fetch Search Provider Details --- 
window.fetchSearchProviderDetails = function(providerId) {
    console.log(`Fetching details for search provider ID: ${providerId}`);
    window.showLoading();
    fetch(`/api/admin/search-providers/${providerId}`)
        .then(window.handleResponse)
        .then(provider => {
            if (provider) {
                const form = document.getElementById('search-provider-form');
                if (form) {
                    document.getElementById('search-provider-name').value = provider.name || '';
                    document.getElementById('search-provider-type').value = provider.type || '';
                    document.getElementById('search-engine-id').value = provider.search_engine_id || '';
                    document.getElementById('is-default').checked = provider.is_default;
                    // API Key is intentionally left blank for editing
                    document.getElementById('search-provider-api-key').placeholder = '(unchanged)';

                    // Manually trigger Alpine state update for conditional field
                    const modalElement = form.closest('[x-data*="isGoogle"]');
                    if (modalElement && modalElement.__x) {
                        modalElement.__x.data.isGoogle = (provider.type === 'google_cse');
                    }
                }
            } else {
                window.showError("Failed to load search provider details.");
            }
        })
        .catch(error => {
            window.showError(`Error fetching search provider: ${error.message}`);
        })
        .finally(() => {
            window.hideLoading();
        });
};

// --- NEW: Open Search Provider Modal --- 
window.openSearchProviderModal = function(action, providerId = null) {
    console.log(`Preparing search provider modal for action: ${action}`);
    const modal = document.getElementById('search-provider-modal');
    if (!modal) { console.error("Search Provider modal element not found!"); return; }

    const form = document.getElementById('search-provider-form');
    if (form) form.reset();
    
    const idInput = document.getElementById('search-provider-id');
    const title = document.getElementById('search-provider-modal-title');
    const apiKeyInput = document.getElementById('search-provider-api-key');
    
    if (idInput) idInput.value = '';
    if (title) title.textContent = action === 'add' ? 'Add New Search Provider' : 'Edit Search Provider';
    if (apiKeyInput) apiKeyInput.placeholder = 'Enter API Key (required)'; // Reset placeholder

    // Reset Alpine state for conditional field
    const modalElement = modal.closest('[x-data*="isGoogle"]');
     if (modalElement && modalElement.__x) {
        modalElement.__x.data.isGoogle = false;
    }

    if (action === 'edit' && providerId) {
        if(idInput) idInput.value = providerId;
        window.fetchSearchProviderDetails(providerId); // Populates form
    }
    console.log(`Search Provider modal ready for ${action}. Waiting for Alpine to show.`);
};

// --- NEW: Delete Search Provider --- 
window.performDeleteSearchProvider = function(providerId) {
    window.showLoading();
    fetch(`/api/admin/search-providers/${providerId}`, {
        method: 'DELETE'
    })
    .then(window.handleResponse)
    .then(() => {
        window.showSuccess("Search provider deleted successfully.");
        window.loadSearchProvidersPromise(); // Refresh the list
    })
    .catch(error => {
        window.showError(`Failed to delete search provider: ${error.message}`);
    })
    .finally(() => {
        window.hideLoading();
    });
};

document.addEventListener('DOMContentLoaded', function() {
    // --- DOMContentLoaded Scope Starts Here ---
    let currentAction = null; // Or use window.currentAction defined above
    let currentItemId = null; // Or use window.currentItemId
    let currentItemType = null; // Or use window.currentItemType

    // --- Utility Functions ---
    // Notification functions (REMOVED)
    // function showNotification(message, type = 'info') { ... } // REMOVED
    // function showSuccess(message) { ... } // REMOVED
    // function showError(message) { ... } // REMOVED
    // function showWarning(message) { ... } // REMOVED

    // Loading indicator functions
    // ... existing code ...

    // --- Event Listener Setup Function (Static elements only) ---
    function setupEventListeners() {
        console.log("Setting up static event listeners...");

        // --- DOM Element References ---
        const addModelBtn = document.getElementById('add-model-btn');
        const modelForm = document.getElementById('model-form');
        const modelSearch = document.getElementById('model-search');
        const providerFilterSelect = document.getElementById('provider-filter');
        const activeOnlyCheckbox = document.getElementById('active-only');
        const temperatureNACheckbox = document.getElementById('temperature-na'); // May need adjustment

        const addUserBtn = document.getElementById('add-user-btn');
        const userForm = document.getElementById('user-form');
        const userSearch = document.getElementById('user-search');
        const roleFilter = document.getElementById('role-filter');
        const userActiveOnlyCheckbox = document.getElementById('user-active-only');
        const changePasswordBtn = document.getElementById('change-password-btn'); // Button within user modal

        const changePasswordForm = document.getElementById('change-password-form');

        const addProviderBtn = document.getElementById('add-provider-btn');
        const providerForm = document.getElementById('provider-form');
        const providerTypeSelect = document.getElementById('provider-type');

        const confirmYesBtn = document.getElementById('confirm-yes');
        
        // --- NEW: Search Provider Form Ref ---
        const searchProviderForm = document.getElementById('search-provider-form');

        // --- Attach Event Listeners ---
        // Add/Edit buttons handled by Alpine + Global JS function
        // if (addModelBtn) addModelBtn.addEventListener('click', () => openModelModal('add')); 
        // if (addUserBtn) addUserBtn.addEventListener('click', () => openUserModal('add'));
        // if (addProviderBtn) addProviderBtn.addEventListener('click', () => openProviderModal('add'));
        
        if (modelForm) modelForm.addEventListener('submit', handleModelFormSubmit);
        if (modelSearch) modelSearch.addEventListener('input', filterModels);
        if (providerFilterSelect) providerFilterSelect.addEventListener('change', filterModels);
        if (activeOnlyCheckbox) activeOnlyCheckbox.addEventListener('change', filterModels);
        if (temperatureNACheckbox) { /* Keep temp N/A checkbox logic if still needed */ }

        if (userForm) userForm.addEventListener('submit', handleUserFormSubmit);
        if (userSearch) userSearch.addEventListener('input', filterUsers);
        if (roleFilter) roleFilter.addEventListener('change', filterUsers);
        if (userActiveOnlyCheckbox) userActiveOnlyCheckbox.addEventListener('change', filterUsers);
        // changePasswordBtn listener now handled by Alpine + Global JS function
        // if (changePasswordBtn) { ... }
        if (changePasswordForm) changePasswordForm.addEventListener('submit', handleChangePasswordSubmit);

        if (providerForm) providerForm.addEventListener('submit', handleProviderFormSubmit);
        if (providerTypeSelect) providerTypeSelect.addEventListener('change', toggleProviderConditionalFields);

        if (confirmYesBtn) confirmYesBtn.addEventListener('click', handleConfirmAction);

        // --- NEW: Listener for Search Provider Form ---
        if (searchProviderForm) searchProviderForm.addEventListener('submit', handleSearchProviderFormSubmit);

        // NO Event Delegation here anymore
    }

    // --- Form Submission Handlers ---
    function handleModelFormSubmit(event) {
        event.preventDefault();
        const modelData = buildModelData();
        if (!modelData) return;

        const modelId = document.getElementById('model-id')?.value;
        const action = modelId ? 'update' : 'add';

        if (!validateModelData(modelData, action)) return;

        showLoading();
        const apiUrl = action === 'add' ? '/api/admin/models' : `/api/admin/models/${modelId}`;
        const method = action === 'add' ? 'POST' : 'PUT';

        fetch(apiUrl, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(modelData)
        })
        .then(handleResponse)
        .then(() => {
            showSuccess(`Model ${action === 'add' ? 'added' : 'updated'} successfully.`);
            console.log('Dispatching close-model-modal event.');
            window.dispatchEvent(new CustomEvent('close-model-modal')); 
            loadModelsPromise(); // Refresh list
        })
        .catch(error => showError(`Failed to ${action} model: ${error.message}`))
        .finally(hideLoading);
    }
    window.handleModelFormSubmit = handleModelFormSubmit;

    function handleProviderFormSubmit(event) {
        event.preventDefault();
        const providerData = buildProviderData();
        if (!providerData) return;

        const providerId = document.getElementById('provider-id')?.value;
        const action = providerId ? 'update' : 'add';

        if (!validateProviderData(providerData, action)) return;

        showLoading();
        const apiUrl = action === 'add' ? '/api/admin/providers' : `/api/admin/providers/${providerId}`;
        const method = action === 'add' ? 'POST' : 'PUT';

        fetch(apiUrl, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(providerData)
        })
        .then(handleResponse)
        .then(() => {
            showSuccess(`Provider ${action === 'add' ? 'added' : 'updated'}.`);
            console.log('Dispatching close-provider-modal event.');
            window.dispatchEvent(new CustomEvent('close-provider-modal')); 
            loadProvidersPromise().then(loadModelsPromise); // Refresh both
        })
        .catch(error => showError(`Failed to ${action} provider: ${error.message}`))
        .finally(hideLoading);
    }
    window.handleProviderFormSubmit = handleProviderFormSubmit;
    
    // --- NEW: Handle Search Provider Form Submit ---
    function handleSearchProviderFormSubmit(event) {
        event.preventDefault();
        const searchProviderData = buildSearchProviderData();
        if (!searchProviderData) return;

        const providerId = document.getElementById('search-provider-id')?.value;
        const action = providerId ? 'update' : 'add';

        if (!validateSearchProviderData(searchProviderData, action)) return;

        showLoading();
        const apiUrl = action === 'add' ? '/api/admin/search-providers' : `/api/admin/search-providers/${providerId}`;
        const method = action === 'add' ? 'POST' : 'PUT';

        fetch(apiUrl, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(searchProviderData)
        })
        .then(handleResponse)
        .then(() => {
            showSuccess(`Search provider ${action === 'add' ? 'added' : 'updated'}.`);
            window.dispatchEvent(new CustomEvent('close-search-provider-modal')); 
            loadSearchProvidersPromise(); // Refresh list
        })
        .catch(error => showError(`Failed to ${action} search provider: ${error.message}`))
        .finally(hideLoading);
    }
    window.handleSearchProviderFormSubmit = handleSearchProviderFormSubmit; // Expose if needed, though listener is added below

    function handleUserFormSubmit(event) {
        event.preventDefault();
        const userDetails = buildUserData();
        if (!userDetails) return;

        const userId = document.getElementById('user-id')?.value;
        const action = userId ? 'update' : 'add';

        if (!validateUserData(userDetails)) return;

        let apiCall;
        showLoading();
        if (action === 'add') {
            const passwordInput = document.getElementById('new-password');
            const confirmPasswordInput = document.getElementById('confirm-password');
            const passwordValue = passwordInput?.value;
            const confirmPasswordValue = confirmPasswordInput?.value;

            if (!passwordValue || passwordValue.length < 8) {
                showError("Password (min 8 chars) required for new user."); hideLoading(); return;
            }
            if (passwordValue !== confirmPasswordValue) {
                showError("Passwords do not match."); hideLoading(); return;
            }
            
            const payloadForAdd = { user: userDetails, password: passwordValue };
            apiCall = fetch('/api/admin/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payloadForAdd)
             });
        } else {
            apiCall = fetch(`/api/admin/users/${userId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(userDetails)
            });
        }

        apiCall
            .then(handleResponse)
            .then(() => {
                showSuccess(`User ${action === 'add' ? 'added' : 'updated'}.`);
                console.log('Dispatching close-user-modal event.');
                window.dispatchEvent(new CustomEvent('close-user-modal')); 
                loadUsersPromise(); // Refresh list
            })
            .catch(error => showError(`Failed to ${action} user: ${error.message}`))
            .finally(hideLoading);
    }
    window.handleUserFormSubmit = handleUserFormSubmit;

    function handleChangePasswordSubmit(event) {
        event.preventDefault();
        const userId = document.getElementById('change-password-user-id')?.value;
        const newPassword = document.getElementById('change-new-password')?.value;
        const confirmPassword = document.getElementById('change-confirm-password')?.value;

        if (!userId) { showError("User ID missing for password change."); return; }
        if (!newPassword || newPassword.length < 8) { showError("Password must be at least 8 characters."); return; }
        if (newPassword !== confirmPassword) { showError("New passwords do not match."); return; }

        setUserPassword(userId, newPassword);
    }
    window.handleChangePasswordSubmit = handleChangePasswordSubmit;
    
    // --- Build/Validate Functions ---
    function buildModelData() {
        try {
            const temperatureNACheckbox = document.getElementById('temperature-na');
            let temperatureValue;
            if (temperatureNACheckbox && temperatureNACheckbox.checked) {
                temperatureValue = null; // Use null for N/A
            } else {
                temperatureValue = parseFloat(document.getElementById('temperature')?.value || '0');
            }

            const data = {
                provider_id: parseInt(document.getElementById('model-provider-id')?.value || '0'),
                name: document.getElementById('name')?.value || '',
                model_id: document.getElementById('model_id')?.value || '',
                max_tokens: parseInt(document.getElementById('max-tokens')?.value || '0'),
                temperature: temperatureValue,
                default_system_prompt: document.getElementById('system-prompt')?.value || '',
                is_active: document.getElementById('is-active')?.checked ?? true,
            };
            return data; // Validation happens separately
        } catch (error) {
             console.error("Error building model data:", error);
             showError("Error reading model form data.");
             return null;
        }
    }
    window.buildModelData = buildModelData;
    
    function validateModelData(modelData, action) {
         if (!modelData) return false;
         if (action === 'add' && (!modelData.provider_id || isNaN(modelData.provider_id) || modelData.provider_id <= 0)) {
            showError('Please select a valid provider.'); return false;
        }
        if (!modelData.name) { showError("Model Display Name is required."); return false; }
        if (!modelData.model_id) { showError("Model ID (Provider Specific) is required."); return false; }
        if (isNaN(modelData.max_tokens) || modelData.max_tokens <= 0) {
            showError('Max Tokens must be a positive number.'); return false;
        }
        if (modelData.temperature !== null && (isNaN(modelData.temperature) || modelData.temperature < 0 || modelData.temperature > 1)) {
             showError('Temperature must be between 0.0 and 1.0 (or N/A).'); return false;
        }
        return true;
    }
    window.validateModelData = validateModelData;

    function buildUserData() {
        try {
            const userDetails = {
                username: document.getElementById('username')?.value || '',
                email: document.getElementById('email')?.value || '',
                role_id: parseInt(document.getElementById('role-id')?.value || '0'),
                is_active: document.getElementById('user-is-active')?.checked ?? true,
                first_name: document.getElementById('first-name')?.value || null,
                last_name: document.getElementById('last-name')?.value || null,
            };
             return userDetails; // Validation happens separately
        } catch (error) {
             console.error("Error building user data:", error);
             showError("Error reading user form data.");
             return null;
        }
    }
    window.buildUserData = buildUserData;

    function validateUserData(userData) {
        if (!userData) return false;
        if (!userData.username) { showError("Username is required."); return false; }
        if (!userData.email) { showError("Email is required."); return false; }
        if (!/\S+@\S+\.\S+/.test(userData.email)) {
             showError('Please enter a valid email address.'); return false;
        }
        if (isNaN(userData.role_id) || userData.role_id <= 0) {
             showError("Please select a valid role."); return false;
        }
        return true;
    }
    window.validateUserData = validateUserData;

    function buildProviderData() {
        try {
            const providerData = {
                name: document.getElementById('provider-name')?.value || '',
                type: document.getElementById('provider-type')?.value || '',
            };
            const baseUrl = document.getElementById('provider-base-url')?.value;
            const apiKey = document.getElementById('provider-api-key')?.value;

            if (baseUrl && baseUrl.trim() !== '') providerData.base_url = baseUrl;
            // Only include api_key if it's not empty (prevents accidentally clearing it on update)
            if (apiKey && apiKey.trim() !== '') providerData.api_key = apiKey;

            return providerData; // Validation happens separately
        } catch (error) {
             console.error("Error building provider data:", error);
             showError("Error reading provider form data.");
             return null;
        }
    }
    window.buildProviderData = buildProviderData;

    function validateProviderData(data, action) {
        if (!data) return false;
        if (!data.name) { showError("Provider Name is required."); return false; }
        if (!data.type) { showError("Provider Type is required."); return false; }
        
        // Base URL required for Ollama (both add and update)
        if (data.type === 'ollama' && (!data.base_url || data.base_url.trim() === '')) {
            showError('Base URL is required for Ollama providers.'); return false;
        }
        
        // API Key required for NEW OpenAI/Anthropic, optional otherwise
        const providerId = document.getElementById('provider-id')?.value;
        const isNewProvider = !providerId;
        if (isNewProvider && (data.type === 'openai' || data.type === 'anthropic') && (!data.api_key || data.api_key.trim() === '')) {
            showError(`API Key is required for new ${data.type} providers.`); return false;
        }
        return true;
    }
    window.validateProviderData = validateProviderData;
    
    // --- NEW: Build/Validate Search Provider Data ---
    function buildSearchProviderData() {
        try {
            const data = {
                name: document.getElementById('search-provider-name')?.value || '',
                type: document.getElementById('search-provider-type')?.value || '',
                api_key: document.getElementById('search-provider-api-key')?.value || '',
                search_engine_id: document.getElementById('search-engine-id')?.value || null, // Default to null if empty
                is_default: document.getElementById('is-default')?.checked ?? false,
            };
            // Only include api_key if it has a value (prevent sending empty string on update)
            if (!data.api_key) delete data.api_key;
            // Null out search_engine_id if not google_cse type
            if (data.type !== 'google_cse') data.search_engine_id = null;
            
            return data;
        } catch (error) {
             console.error("Error building search provider data:", error);
             showError("Error reading search provider form data.");
             return null;
        }
    }
    window.buildSearchProviderData = buildSearchProviderData;

    function validateSearchProviderData(data, action) {
        if (!data) return false;
        if (!data.name) { showError("Provider Name is required."); return false; }
        if (!data.type) { showError("Provider Type is required."); return false; }
        
        // API Key required for ADD, optional for UPDATE
        const providerId = document.getElementById('search-provider-id')?.value;
        if (!providerId && !data.api_key) { // If adding and no API key
             showError('API Key is required for new search providers.'); return false; 
        }

        // Search Engine ID required for Google CSE type
        if (data.type === 'google_cse' && (!data.search_engine_id || data.search_engine_id.trim() === '')) {
            showError('Search Engine ID (CX) is required for Google Custom Search providers.'); return false;
        }
        return true;
    }
    window.validateSearchProviderData = validateSearchProviderData;
    
    // --- Expose additional functions to global scope ---
    // Notification functions - Now handled by event dispatch
    // window.showNotification = showNotification; // REMOVED
    // window.showSuccess = showSuccess; // REMOVED
    // window.showError = showError; // REMOVED
    // window.showWarning = showWarning; // REMOVED
    
    // Loading indicators
    window.showLoading = showLoading;
    window.hideLoading = hideLoading;
    
    // Helper functions
    window.loadProvidersAndPopulateDropdown = loadProvidersAndPopulateDropdown;
    window.loadRolesAndPopulateDropdown = loadRolesAndPopulateDropdown;
    window.fetchModelDetails = fetchModelDetails;
    window.fetchProviderDetails = fetchProviderDetails;
    window.fetchUserDetails = fetchUserDetails;
    window.handleConfirmAction = handleConfirmAction;
    window.setUserPassword = setUserPassword;
    
    // Other helpers can be added here as needed
    
    // --- Initial Load (Waits for Alpine) ---
    function initialLoad() {
        console.log("DOM content loaded. Initializing admin panel.");
        // Directly setup listeners and load data
        setupEventListeners(); 
        loadAllData(); 
    }

    // --- Call Initial Load --- 
    initialLoad();

}); // End DOMContentLoaded