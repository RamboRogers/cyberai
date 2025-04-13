package llm

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/ramborogers/cyberai/server/models"
)

// ConnectorService manages the creation and retrieval of ModelConnector instances.
type ConnectorService struct {
	modelService       *models.ModelService
	providerService    *models.ProviderService
	chatContextService *ChatContextService
	// TODO: Potentially add caching for connectors if instantiation is expensive
	mu sync.Mutex // To protect concurrent access if caching is added
}

// NewConnectorService creates a new ConnectorService.
func NewConnectorService(ms *models.ModelService, ps *models.ProviderService, chatSvc *models.ChatService, agentSvc *models.AgentService) *ConnectorService {
	if ms == nil || ps == nil {
		// This should not happen if initialization is done correctly in main.go
		log.Fatal("ConnectorService requires non-nil ModelService and ProviderService")
	}

	// Create the embedded ChatContextService
	chatContextSvc := NewChatContextService(chatSvc, ms, agentSvc)

	return &ConnectorService{
		modelService:       ms,
		providerService:    ps,
		chatContextService: chatContextSvc,
	}
}

// GetChatContextService returns the embedded ChatContextService
func (s *ConnectorService) GetChatContextService() *ChatContextService {
	return s.chatContextService
}

// GetConnectorForModel retrieves the appropriate ModelConnector for a given model ID.
// It fetches the model and its provider details, including the API key.
func (s *ConnectorService) GetConnectorForModel(ctx context.Context, modelID int64) (ModelConnector, *models.Model, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	// 1. Get Model details (including Provider info, but not API key)
	model, err := s.modelService.GetModelByID(modelID)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to get model details for ID %d: %w", modelID, err)
	}
	if model == nil || model.Provider == nil {
		return nil, nil, fmt.Errorf("model or provider data missing for model ID %d", modelID)
	}

	// 2. Get Provider details (including API key)
	provider, err := s.providerService.GetProviderByIDWithKey(model.ProviderID)
	if err != nil {
		return nil, model, fmt.Errorf("failed to get provider details with key for provider ID %d: %w", model.ProviderID, err)
	}

	// 3. Instantiate the correct connector based on ProviderType
	var connector ModelConnector

	// TODO: Add reasonable default timeouts? Or make them configurable per provider?
	defaultTimeout := 120 * time.Second

	switch provider.Type {
	case models.ProviderOllama:
		cfg := OllamaConfig{
			BaseURL: provider.BaseURL, // Ollama BaseURL comes from provider table
			Timeout: defaultTimeout,
		}
		connector, err = NewOllamaConnector(cfg)
		if err != nil {
			return nil, model, fmt.Errorf("failed to create Ollama connector for provider %d: %w", provider.ID, err)
		}
		log.Printf("Instantiated Ollama connector for model %d (Provider: %d)", modelID, provider.ID)

	case models.ProviderOpenAI:
		cfg := OpenAIConfig{
			APIKey:  provider.APIKey,
			BaseURL: provider.BaseURL, // Optional, for Azure etc.
			Timeout: defaultTimeout,
		}
		connector, err = NewOpenAIConnector(cfg)
		if err != nil {
			return nil, model, fmt.Errorf("failed to create OpenAI connector for provider %d: %w", provider.ID, err)
		}
		log.Printf("Instantiated OpenAI connector for model %d (Provider: %d)", modelID, provider.ID)

	case models.ProviderAnthropic:
		cfg := AnthropicConfig{
			APIKey:  provider.APIKey,
			BaseURL: provider.BaseURL, // Optional
			Timeout: defaultTimeout,
		}
		connector, err = NewAnthropicConnector(cfg)
		if err != nil {
			return nil, model, fmt.Errorf("failed to create Anthropic connector for provider %d: %w", provider.ID, err)
		}
		log.Printf("Instantiated Anthropic connector for model %d (Provider: %d)", modelID, provider.ID)

	default:
		return nil, model, fmt.Errorf("unsupported provider type '%s' for provider ID %d", provider.Type, provider.ID)
	}

	// Perform a quick health check on the newly created connector
	// Use a short timeout for the health check itself
	healthCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	if err := connector.HealthCheck(healthCtx); err != nil {
		log.Printf("Warning: Health check failed for connector (Provider %d, Type %s): %v", provider.ID, provider.Type, err)
		// Decide if you want to return an error here or just log the warning
		// return nil, model, fmt.Errorf("health check failed for %s connector: %w", provider.Type, err)
	}

	return connector, model, nil
}
