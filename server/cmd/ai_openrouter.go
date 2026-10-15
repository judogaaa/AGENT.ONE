// ═══════════════════════════════════════════════════════════════
//  OpenRouter provider — OpenAI-compatible API, 100+ моделей
// ═══════════════════════════════════════════════════════════════
//
//  Стратегия:
//   1. Пробуем основную модель (cfg.Model)
//   2. При 429/503/timeout → пробуем быструю (cfg.FastModel)
//   3. При повторной ошибке → возвращаем ошибку, выше по стеку
//      сработает rule_based fallback
//
//  Модели по умолчанию:
//    - google/gemma-4-31b-it:free             (основная, хорош для RU)
//    - nvidia/nemotron-3-nano-30b-a3b:free    (быстрая, для retry)

package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"
)

const openRouterAPIURL = "https://openrouter.ai/api/v1/chat/completions"

// OpenRouterProvider — провайдер через OpenRouter.ai.
type OpenRouterProvider struct {
	cfg AIConfig
}

type orRequest struct {
	Model       string              `json:"model"`
	Messages    []map[string]string `json:"messages"`
	Temperature float64             `json:"temperature"`
	MaxTokens   int                 `json:"max_tokens"`
}

type orResponse struct {
	Error   *orError `json:"error,omitempty"`
	Model   string   `json:"model,omitempty"`
	Usage   *orUsage `json:"usage,omitempty"`
	Choices []struct {
		Message struct {
			Content string `json:"content"`
			Refusal string `json:"refusal,omitempty"`
		} `json:"message"`
		FinishReason string `json:"finish_reason"`
	} `json:"choices,omitempty"`
}

type orError struct {
	Message string `json:"message"`
	Type    string `json:"type"`
	Code    string `json:"code"`
}

type orUsage struct {
	PromptTokens     int `json:"prompt_tokens"`
	CompletionTokens int `json:"completion_tokens"`
	TotalTokens      int `json:"total_tokens"`
}

// Generate вызывает OpenRouter chat completions API.
// Делает до 2 попыток: основная → быстрая. При повторной ошибке — возвращает её.
func (o *OpenRouterProvider) Generate(ctx context.Context, req AIRequest) (AIResponse, error) {
	primary := o.cfg.Model
	fallback := o.cfg.FastModel
	if req.UseFastModel && fallback != "" {
		// если вызывающий явно попросил fast — пробуем только fast
		primary = fallback
		fallback = ""
	}

	// собираем messages один раз (для всех попыток одинаковые)
	messages := buildMessages(req)
	maxTokens := req.MaxTokens
	if maxTokens == 0 {
		maxTokens = o.cfg.MaxTokens
	}
	temperature := req.Temperature
	if temperature == 0 {
		temperature = o.cfg.Temperature
	}

	// попытка 1: основная
	if resp, err := o.call(ctx, primary, messages, temperature, maxTokens); err == nil {
		return resp, nil
	} else {
		log.Printf("AI provider=openrouter model=%s err=%v", primary, err)
		// если это явно 4xx (кроме 429) — не пробуем fast, ошибка скорее всего не от rate limit
		if !isRetryable(err) {
			return AIResponse{}, err
		}
	}

	// попытка 2: быстрая (если отличается)
	if fallback != "" && fallback != primary {
		log.Printf("AI provider=openrouter retry with fast model=%s", fallback)
		resp, err := o.call(ctx, fallback, messages, temperature, maxTokens)
		if err == nil {
			return resp, nil
		} else {
			log.Printf("AI provider=openrouter model=%s err=%v", fallback, err)
			return AIResponse{}, err
		}
	}

	return AIResponse{}, fmt.Errorf("all openrouter models failed")
}

func (o *OpenRouterProvider) call(ctx context.Context, model string, messages []map[string]string, temperature float64, maxTokens int) (AIResponse, error) {
	body := orRequest{
		Model:       model,
		Messages:    messages,
		Temperature: temperature,
		MaxTokens:   maxTokens,
	}
	payload, _ := json.Marshal(body)

	httpReq, err := http.NewRequestWithContext(ctx, "POST", openRouterAPIURL, bytes.NewReader(payload))
	if err != nil {
		return AIResponse{}, fmt.Errorf("build request: %w", err)
	}
	httpReq.Header.Set("Authorization", "Bearer "+o.cfg.APIKey)
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("HTTP-Referer", "https://agentone.earflow.ru")
	httpReq.Header.Set("X-Title", "AGENT.ONE")

	timeout := o.cfg.Timeout
	if timeout == 0 {
		timeout = 25 * time.Second
	}
	httpClient := &http.Client{Timeout: timeout}

	start := time.Now()
	resp, err := httpClient.Do(httpReq)
	if err != nil {
		return AIResponse{}, fmt.Errorf("http: %w", err)
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	duration := time.Since(start)

	var out orResponse
	if err := json.Unmarshal(respBody, &out); err != nil {
		return AIResponse{}, fmt.Errorf("decode: %w (body: %s)", err, truncateString(string(respBody), 300))
	}

	if out.Error != nil {
		log.Printf("AI provider=openrouter model=%s status=%d error=%s duration=%s", model, resp.StatusCode, out.Error.Message, duration)
		return AIResponse{}, fmt.Errorf("openrouter[%d]: %s", resp.StatusCode, out.Error.Message)
	}
	if resp.StatusCode != 200 {
		log.Printf("AI provider=openrouter model=%s status=%d duration=%s", model, resp.StatusCode, duration)
		return AIResponse{}, fmt.Errorf("openrouter: status %d", resp.StatusCode)
	}
	if len(out.Choices) == 0 {
		return AIResponse{}, fmt.Errorf("openrouter: empty choices")
	}

	text := out.Choices[0].Message.Content
	if strings.TrimSpace(text) == "" && out.Choices[0].Message.Refusal != "" {
		text = "Не могу ответить на этот вопрос."
	}

	log.Printf("AI provider=openrouter model=%s status=200 duration=%s", model, duration)
	return AIResponse{
		Text:         text,
		Provider:     "openrouter",
		Model:        out.Model,
		UsedFallback: false,
	}, nil
}

func buildMessages(req AIRequest) []map[string]string {
	messages := []map[string]string{}
	for _, m := range req.History {
		messages = append(messages, map[string]string{"role": m.Role, "content": m.Content})
	}
	if req.UserMessage != "" {
		messages = append(messages, map[string]string{"role": "user", "content": req.UserMessage})
	}
	if sys := buildSystemPrompt(req); sys != "" {
		messages = append([]map[string]string{{"role": "system", "content": sys}}, messages...)
	}
	return messages
}

// isRetryable — стоит ли пробовать следующую модель после ошибки
func isRetryable(err error) bool {
	if err == nil {
		return false
	}
	s := err.Error()
	return strings.Contains(s, "status 429") ||
		strings.Contains(s, "status 503") ||
		strings.Contains(s, "status 502") ||
		strings.Contains(s, "status 504") ||
		strings.Contains(s, "temporarily rate-limited") ||
		strings.Contains(s, "timeout") ||
		strings.Contains(s, "EOF")
}

func truncateString(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}
