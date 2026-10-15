package main

import (
	"strings"
	"testing"
)

func TestValidateAIOutputEmptyResponse(t *testing.T) {
	reason, unsafe := validateAIOutput("", AIRequest{Scenario: ScenarioBuyerAssistant})
	if !unsafe {
		t.Error("empty output should be unsafe")
	}
	if reason != "empty_output" {
		t.Errorf("reason = %q, want empty_output", reason)
	}
}

func TestValidateAIOutputTooShort(t *testing.T) {
	reason, unsafe := validateAIOutput("ab", AIRequest{Scenario: ScenarioBuyerAssistant})
	if !unsafe {
		t.Error("short output should be unsafe")
	}
	if reason != "empty_output" {
		t.Errorf("reason = %q, want empty_output", reason)
	}
}

func TestValidateAIOutputValid(t *testing.T) {
	reason, unsafe := validateAIOutput("Это нормальный ответ без опасных утверждений.", AIRequest{Scenario: ScenarioBuyerAssistant})
	if unsafe {
		t.Errorf("valid output flagged unsafe: %s", reason)
	}
}

func TestValidateAIOutputDetectsForbiddenClaims(t *testing.T) {
	tests := []string{
		"бесплатная доставка доступна",
		"мы предоставляем гарантию",
		"скидка 20%",
		"в наличии на складе",
		"вернём деньги без проблем",
		"рассрочка на 12 месяцев",
	}
	for _, claim := range tests {
		t.Run("claim_"+claim[:10], func(t *testing.T) {
			_, unsafe := validateAIOutput(claim, AIRequest{Scenario: ScenarioBuyerAssistant})
			if !unsafe {
				t.Errorf("should reject forbidden claim: %q", claim)
			}
		})
	}
}

func TestValidateAIOutputAllowsForbiddenWithContext(t *testing.T) {
	// With warranty policy set, "гарантия" is allowed
	req := AIRequest{
		Scenario: ScenarioClientAIManager,
		SellerSettings: &AIManagerSettings{
			WarrantyPolicy: "Гарантия 1 год на все товары",
		},
	}
	_, unsafe := validateAIOutput("гарантия 1 год от производителя", req)
	if unsafe {
		t.Error("should allow гарантия when warranty policy is set")
	}
}

func TestSanitizeUserMessage(t *testing.T) {
	tests := []struct {
		in, out string
	}{
		{"hello", "hello"},
		{"  spaces  ", "spaces"},
		{"line\nbreak", "line\nbreak"},
		{strings.Repeat("x", 100), "x" + strings.Repeat("", 0)}, // truncated
	}
	for _, tc := range tests {
		r := sanitizeUserMessage(tc.in, 10)
		if len(r) > 10 {
			t.Errorf("sanitizeUserMessage(%q, 10) = %q, too long", tc.in, r)
		}
	}
	r := sanitizeUserMessage("abc", 10)
	if r != "abc" {
		t.Errorf("expected abc, got %q", r)
	}
}

func TestDefaultAIManagerSettings(t *testing.T) {
	s := defaultAIManagerSettings("shop-123")
	if s.ShopID != "shop-123" {
		t.Errorf("ShopID = %q", s.ShopID)
	}
	if !s.Enabled {
		t.Error("Enabled should be true")
	}
	if s.Mode != "assistive" {
		t.Errorf("Mode = %q", s.Mode)
	}
	if s.Tone != "professional" {
		t.Errorf("Tone = %q", s.Tone)
	}
	if !s.AutoCreateLeads {
		t.Error("AutoCreateLeads should be true")
	}
	if !s.AutoSuggestProducts {
		t.Error("AutoSuggestProducts should be true")
	}
	if !s.AutoSuggestCheckout {
		t.Error("AutoSuggestCheckout should be true")
	}
	if !s.HandoffOnUnknown {
		t.Error("HandoffOnUnknown should be true")
	}
	if !s.AiStrictCatalogGrounding {
		t.Error("AiStrictCatalogGrounding should be true")
	}
}

func TestDefaultAIManagerSettingsNoPaymentClaims(t *testing.T) {
	s := defaultAIManagerSettings("x")
	text := s.DeliveryPolicy + s.WarrantyPolicy + s.PaymentPolicy + s.DiscountPolicy
	lower := strings.ToLower(text)
	forbidden := []string{"оплатить", "юкасса", "карта", "сбп", "online"}
	for _, f := range forbidden {
		if strings.Contains(lower, f) {
			t.Errorf("default settings contain forbidden claim: %s in %q", f, text)
		}
	}
}

func TestMapLeadStatus(t *testing.T) {
	tests := map[string]string{
		"new":              "waiting",
		"in_progress":      "waiting",
		"answered":         "answered",
		"closed":           "closed",
		"cancelled":        "closed",
		"lead_created":     "answered",
		"taken_over":       "answered",
		"waiting_seller":   "waiting",
		"unknown_status_x": "waiting",
	}
	for in, want := range tests {
		got := mapLeadStatus(in)
		if got != want {
			t.Errorf("mapLeadStatus(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestTruncate(t *testing.T) {
	r := truncate("hello world", 5)
	if r != "hello…" {
		t.Errorf("truncate = %q, want %q", r, "hello…")
	}
	r = truncate("hi", 10)
	if r != "hi" {
		t.Errorf("truncate = %q", r)
	}
}

func TestAllowedImageMIMEs(t *testing.T) {
	if _, ok := allowedImageMIMEs["image/jpeg"]; !ok {
		t.Error("image/jpeg should be allowed")
	}
	if _, ok := allowedImageMIMEs["image/png"]; !ok {
		t.Error("image/png should be allowed")
	}
	if _, ok := allowedImageMIMEs["image/webp"]; !ok {
		t.Error("image/webp should be allowed")
	}
	if _, ok := allowedImageMIMEs["text/html"]; ok {
		t.Error("text/html should NOT be allowed")
	}
}
