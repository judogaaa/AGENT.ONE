package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"
)

const groqAPIURL = "https://api.groq.com/openai/v1/chat/completions"

// GroqProvider calls Groq OpenAI-compatible API.
type GroqProvider struct {
	cfg AIConfig
}

type groqRequest struct {
	Model       string              `json:"model"`
	Messages    []map[string]string `json:"messages"`
	Temperature float64             `json:"temperature"`
	MaxTokens   int                 `json:"max_tokens"`
}

type groqResponse struct {
	Error   *groqError `json:"error,omitempty"`
	Model   string     `json:"model,omitempty"`
	Usage   *groqUsage `json:"usage,omitempty"`
	Choices []struct {
		Message struct {
			Content string `json:"content"`
			Refusal string `json:"refusal,omitempty"`
		} `json:"message"`
		FinishReason string `json:"finish_reason"`
	} `json:"choices,omitempty"`
}

type groqError struct {
	Message string `json:"message"`
	Type    string `json:"type"`
	Code    string `json:"code"`
}

type groqUsage struct {
	PromptTokens     int `json:"prompt_tokens"`
	CompletionTokens int `json:"completion_tokens"`
	TotalTokens      int `json:"total_tokens"`
}

func (g *GroqProvider) Generate(ctx context.Context, req AIRequest) (AIResponse, error) {
	start := time.Now()
	scenario := string(req.Scenario)
	model := g.cfg.Model
	if req.UseFastModel && g.cfg.FastModel != "" {
		model = g.cfg.FastModel
	}
	temperature := req.Temperature
	if temperature == 0 {
		temperature = g.cfg.Temperature
	}
	maxTokens := req.MaxTokens
	if maxTokens <= 0 {
		maxTokens = g.cfg.MaxTokens
	}

	system := buildSystemPrompt(req)
	messages := []map[string]string{{"role": "system", "content": system}}
	for _, h := range req.History {
		role := h.Role
		if role != "user" && role != "assistant" && role != "system" {
			role = "user"
		}
		messages = append(messages, map[string]string{"role": role, "content": h.Content})
	}
	messages = append(messages, map[string]string{"role": "user", "content": req.UserMessage})

	body, err := json.Marshal(groqRequest{
		Model:       model,
		Messages:    messages,
		Temperature: temperature,
		MaxTokens:   maxTokens,
	})
	if err != nil {
		return g.fallback(req, "marshal_error", err), nil
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST", groqAPIURL, bytes.NewReader(body))
	if err != nil {
		return g.fallback(req, "request_error", err), nil
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+g.cfg.APIKey)

	resp, err := (&http.Client{Timeout: g.cfg.Timeout}).Do(httpReq)
	if err != nil {
		log.Printf("AI provider=%s scenario=%s error=%s duration=%s fallback=true", "groq", scenario, sanitizeError(err.Error()), time.Since(start).Round(time.Millisecond))
		return g.fallback(req, "http_error", err), nil
	}
	defer resp.Body.Close()

	data, err := io.ReadAll(io.LimitReader(resp.Body, 1<<19))
	if err != nil {
		return g.fallback(req, "read_error", err), nil
	}

	var gr groqResponse
	if err := json.Unmarshal(data, &gr); err != nil {
		return g.fallback(req, "parse_error", err), nil
	}

	if resp.StatusCode == 429 {
		log.Printf("AI provider=%s scenario=%s status=429 duration=%s fallback=true", "groq", scenario, time.Since(start).Round(time.Millisecond))
		return g.fallback(req, "rate_limited", fmt.Errorf("rate limited")), nil
	}
	if resp.StatusCode == 401 {
		log.Printf("AI provider=%s scenario=%s status=401 duration=%s fallback=true", "groq", scenario, time.Since(start).Round(time.Millisecond))
		return g.fallback(req, "unauthorized", fmt.Errorf("unauthorized")), nil
	}
	if resp.StatusCode >= 500 {
		log.Printf("AI provider=%s scenario=%s status=%d duration=%s fallback=true", "groq", scenario, resp.StatusCode, time.Since(start).Round(time.Millisecond))
		return g.fallback(req, "server_error", fmt.Errorf("server error %d", resp.StatusCode)), nil
	}
	if resp.StatusCode >= 400 || gr.Error != nil {
		errMsg := "provider error"
		if gr.Error != nil && gr.Error.Message != "" {
			errMsg = gr.Error.Message
		}
		log.Printf("AI provider=%s scenario=%s status=%d error=%s duration=%s fallback=true", "groq", scenario, resp.StatusCode, sanitizeError(errMsg), time.Since(start).Round(time.Millisecond))
		return g.fallback(req, "provider_error", fmt.Errorf("%s", errMsg)), nil
	}

	if len(gr.Choices) == 0 || gr.Choices[0].Message.Content == "" {
		return g.fallback(req, "empty_response", fmt.Errorf("empty response")), nil
	}

	text := gr.Choices[0].Message.Content
	tokens := 0
	if gr.Usage != nil {
		tokens = gr.Usage.TotalTokens
	}

	// Post-hoc safety validation
	if reason, unsafe := validateAIOutput(text, req); unsafe {
		log.Printf("AI provider=%s scenario=%s safety=%s duration=%s fallback=true", "groq", scenario, reason, time.Since(start).Round(time.Millisecond))
		return g.fallback(req, reason, fmt.Errorf("safety fallback")), nil
	}

	log.Printf("AI provider=%s model=%s scenario=%s duration=%s tokens=%d fallback=false", "groq", gr.Model, scenario, time.Since(start).Round(time.Millisecond), tokens)

	return AIResponse{
		Text:         text,
		Provider:     "groq",
		Model:        gr.Model,
		UsedFallback: false,
		Confidence:   0.85,
	}, nil
}

func (g *GroqProvider) fallback(req AIRequest, reason string, err error) AIResponse {
	fb, _ := (&RuleBasedProvider{cfg: g.cfg}).Generate(context.Background(), req)
	fb.Provider = "groq+" + fb.Provider
	fb.Model = "fallback"
	fb.UsedFallback = true
	fb.RefusalReason = reason
	return fb
}

func sanitizeError(s string) string {
	// Never allow API key fragments in logs.
	if len(s) > 200 {
		s = s[:200]
	}
	return s
}
