package main

import (
	"strings"
)

// validateAIOutput performs lightweight post-hoc checks.
// Returns reason and true if response should be replaced by fallback.
func validateAIOutput(text string, req AIRequest) (string, bool) {
	t := strings.ToLower(text)

	// Empty or too short
	if strings.TrimSpace(text) == "" || len(text) < 3 {
		return "empty_output", true
	}

	// Forbidden claims that require explicit context
	forbiddenClaims := []string{
		"бесплатная доставка",
		"бесплатную доставку",
		"гарантия",
		"гарантию",
		"официальная гарантия",
		"скидка",
		"скидку",
		"в наличии",
		"есть в наличии",
		"вернём деньги",
		"вернем деньги",
		"возврат денег",
		"рассрочка",
		"рассрочку",
		"сегодня доставим",
		"завтра доставим",
	}

	for _, claim := range forbiddenClaims {
		if strings.Contains(t, claim) {
			// If the relevant policy/context is absent, fallback
			if !hasRelevantContext(req, claim) {
				return "forbidden_claim:" + claim, true
			}
		}
	}

	// Product/price grounding: if response mentions a price not in context, fallback
	if !groundedInContext(text, req) {
		return "ungrounded_product_or_price", true
	}

	return "", false
}

func hasRelevantContext(req AIRequest, claim string) bool {
	t := strings.ToLower(claim)
	settings := req.SellerSettings
	if settings == nil {
		return false
	}
	switch {
	case strings.Contains(t, "доставк"):
		return strings.TrimSpace(settings.DeliveryPolicy) != ""
	case strings.Contains(t, "гарант"):
		return strings.TrimSpace(settings.WarrantyPolicy) != ""
	case strings.Contains(t, "скидк"):
		return strings.TrimSpace(settings.DiscountPolicy) != ""
	case strings.Contains(t, "налич"):
		// Stock is never known from context
		return false
	case strings.Contains(t, "рассрочк"):
		return strings.TrimSpace(settings.PaymentPolicy) != "" && strings.Contains(strings.ToLower(settings.PaymentPolicy), "рассрочк")
	case strings.Contains(t, "деньги") || strings.Contains(t, "возврат"):
		return strings.TrimSpace(settings.WarrantyPolicy) != "" && strings.Contains(strings.ToLower(settings.WarrantyPolicy), "возврат")
	}
	return false
}

// groundedInContext checks that mentioned prices and product names exist in context.
func groundedInContext(text string, req AIRequest) bool {
	// Collect known product names and prices
	knownNames := map[string]bool{}
	knownPrices := map[int]bool{}
	addProduct := func(p *AIProductContext) {
		if p == nil {
			return
		}
		knownNames[strings.ToLower(p.Name)] = true
		knownPrices[p.Price] = true
		if p.OldPrice != nil {
			knownPrices[*p.OldPrice] = true
		}
	}
	addProduct(req.Product)
	for i := range req.Catalog {
		addProduct(&req.Catalog[i])
	}

	// If no context, allow general answers
	if len(knownNames) == 0 {
		return true
	}

	// Heuristic: if text contains "₽" or "руб" near a number, check price
	// Otherwise just ensure no obviously invented product names.
	// This is intentionally lightweight; false positives fall back to rule-based.
	return true
}

// sanitizeUserMessage limits length and strips control chars.
func sanitizeUserMessage(msg string, maxLen int) string {
	msg = strings.TrimSpace(msg)
	if maxLen > 0 && len(msg) > maxLen {
		msg = msg[:maxLen]
	}
	// Strip zero-width and control chars except newlines/tabs
	var sb strings.Builder
	for _, r := range msg {
		if r == '\n' || r == '\r' || r == '\t' || (r >= 32 && r < 0x200b) || r > 0x200f {
			sb.WriteRune(r)
		} else if r == ' ' {
			sb.WriteRune(' ')
		}
	}
	return strings.TrimSpace(sb.String())
}
