package main

import (
	"os"
	"strconv"
	"strings"
	"time"
)

// AIConfig holds server-side AI provider configuration.
// API-ключ берётся из переменной для активного провайдера:
//   - "groq"       → GROQ_API_KEY
//   - "openrouter" → OPENROUTER_API_KEY
//
// Ключ НИКОГДА не логируется и не отдаётся клиенту.
type AIConfig struct {
	Provider        string
	Model           string
	FastModel       string
	APIKey          string
	Timeout         time.Duration
	FallbackEnabled bool
	MaxTokens       int
	Temperature     float64
}

func loadAIConfig() AIConfig {
	provider := strings.ToLower(strings.TrimSpace(os.Getenv("AI_PROVIDER")))

	// API key берём из переменной для активного провайдера
	var apiKey string
	switch provider {
	case "openrouter":
		apiKey = strings.TrimSpace(os.Getenv("OPENROUTER_API_KEY"))
	default:
		// legacy: groq или что угодно → берём GROQ_API_KEY (если задан)
		apiKey = strings.TrimSpace(os.Getenv("GROQ_API_KEY"))
	}

	cfg := AIConfig{
		Provider:        provider,
		Model:           os.Getenv("AI_MODEL"),
		FastModel:       os.Getenv("AI_MODEL_FAST"),
		APIKey:          apiKey,
		FallbackEnabled: true,
		MaxTokens:       900,
		Temperature:     0.3,
		Timeout:         25 * time.Second,
	}
	if cfg.Provider == "" {
		cfg.Provider = "rule_based"
	}
	if cfg.Model == "" {
		cfg.Model = defaultModelFor(cfg.Provider)
	}
	if cfg.FastModel == "" {
		cfg.FastModel = defaultFastModelFor(cfg.Provider)
	}
	if v := os.Getenv("AI_TIMEOUT_SECONDS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			cfg.Timeout = time.Duration(n) * time.Second
		}
	}
	if v := os.Getenv("AI_FALLBACK_ENABLED"); v != "" {
		cfg.FallbackEnabled = strings.ToLower(v) == "true" || v == "1"
	}
	if v := os.Getenv("AI_MAX_TOKENS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			cfg.MaxTokens = n
		}
	}
	if v := os.Getenv("AI_TEMPERATURE"); v != "" {
		if f, err := strconv.ParseFloat(v, 64); err == nil && f >= 0 && f <= 2 {
			cfg.Temperature = f
		}
	}
	return cfg
}

func defaultModelFor(p string) string {
	switch p {
	case "openrouter":
		return "google/gemma-4-31b-it:free"
	case "groq":
		return "llama-3.3-70b-versatile"
	default:
		return "rule_based"
	}
}

func defaultFastModelFor(p string) string {
	switch p {
	case "openrouter":
		return "nvidia/nemotron-3-nano-30b-a3b:free"
	case "groq":
		return "llama-3.1-8b-instant"
	default:
		return ""
	}
}

func (c AIConfig) Enabled() bool {
	if c.APIKey == "" {
		return false
	}
	return c.Provider == "groq" || c.Provider == "openrouter"
}
