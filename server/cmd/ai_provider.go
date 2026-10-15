package main

import (
	"context"
	"strings"
)

// AIScenario identifies which AI flow is requested.
type AIScenario string

const (
	ScenarioBuyerAssistant  AIScenario = "buyer_assistant"
	ScenarioClientAIManager AIScenario = "client_ai_manager"
	ScenarioBusinessCopilot AIScenario = "business_copilot"
)

// AIProductContext is a compact product description sent to the AI.
type AIProductContext struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Price       int      `json:"price"`
	OldPrice    *int     `json:"oldPrice,omitempty"`
	Category    string   `json:"category"`
	Brand       string   `json:"brand,omitempty"`
	Condition   string   `json:"condition,omitempty"`
	Description string   `json:"description,omitempty"`
	Benefits    []string `json:"benefits,omitempty"`
	ImageCount  int      `json:"imageCount"`
}

// AIShopContext is a compact shop description sent to the AI.
type AIShopContext struct {
	ID             string `json:"id"`
	Name           string `json:"name"`
	Slug           string `json:"slug"`
	Description    string `json:"description,omitempty"`
	About          string `json:"about,omitempty"`
	Category       string `json:"category,omitempty"`
	Phone          string `json:"phone,omitempty"`
	Email          string `json:"email,omitempty"`
	City           string `json:"city,omitempty"`
	ContactMethod  string `json:"contactMethod,omitempty"`
	WorkingHours   string `json:"workingHours,omitempty"`
	Tagline        string `json:"tagline,omitempty"`
	AiTone         string `json:"aiTone,omitempty"`
	AiGreeting     string `json:"aiGreeting,omitempty"`
	AiStylePrompt  string `json:"aiStylePrompt,omitempty"`
	AiForbidden    string `json:"aiForbidden,omitempty"`
	AiPreferredCTA string `json:"aiPreferredCTA,omitempty"`
}

// AIOrderContext holds order/lead/customer data for business copilot.
type AIOrderContext struct {
	OrderID        string `json:"orderId,omitempty"`
	LeadID         string `json:"leadId,omitempty"`
	CustomerName   string `json:"customerName,omitempty"`
	CustomerPhone  string `json:"customerPhone,omitempty"`
	CustomerEmail  string `json:"customerEmail,omitempty"`
	CustomerNeed   string `json:"customerNeed,omitempty"`
	OrderStatus    string `json:"orderStatus,omitempty"`
	PaymentMethod  string `json:"paymentMethod,omitempty"`
	DeliveryMethod string `json:"deliveryMethod,omitempty"`
	TotalAmount    int    `json:"totalAmount,omitempty"`
}

// AIHistoryMessage is a single turn in the conversation.
type AIHistoryMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// AIRequest is the normalized input for any AI provider.
type AIRequest struct {
	Scenario       AIScenario
	UserMessage    string
	History        []AIHistoryMessage
	Shop           *AIShopContext
	Product        *AIProductContext
	Catalog        []AIProductContext
	Order          *AIOrderContext
	SellerSettings *AIManagerSettings
	Language       string
	MaxTokens      int
	Temperature    float64
	UseFastModel   bool
}

// AIResponse is the normalized output from any AI provider.
type AIResponse struct {
	Text              string   `json:"text"`
	Provider          string   `json:"provider"`
	Model             string   `json:"model"`
	UsedFallback      bool     `json:"usedFallback"`
	RefusalReason     string   `json:"refusalReason,omitempty"`
	SuggestedProducts []string `json:"suggestedProducts,omitempty"`
	LeadIntent        string   `json:"leadIntent,omitempty"`
	Confidence        float64  `json:"confidence,omitempty"`
}

// AIProvider is the common interface for AI backends.
type AIProvider interface {
	Generate(ctx context.Context, req AIRequest) (AIResponse, error)
}

// NewAIProvider returns the configured provider or rule-based fallback.
func NewAIProvider(cfg AIConfig) AIProvider {
	if cfg.Provider == "groq" && cfg.APIKey != "" {
		return &GroqProvider{cfg: cfg}
	}
	return &RuleBasedProvider{cfg: cfg}
}

func defaultIfEmpty(s, fallback string) string {
	if strings.TrimSpace(s) == "" {
		return fallback
	}
	return s
}
