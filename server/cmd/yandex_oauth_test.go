package main

import (
	"testing"
)

func TestValidateReturnTo(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{"root", "/", "/"},
		{"account", "/account", "/account"},
		{"dashboard", "/dashboard", "/dashboard"},
		{"business", "/business", "/business"},
		{"business onboarding", "/business/onboarding", "/business/onboarding"},
		{"nested", "/catalog/items?page=1", "/catalog/items?page=1"},
		{"with query", "/dashboard?tab=orders", "/dashboard?tab=orders"},
		{"empty string", "", "/"},
		{"external http", "http://evil.example", "/"},
		{"external https", "https://evil.example", "/"},
		{"protocol relative", "//evil.example", "/"},
		{"backslash prefix", "\\evil.example", "/"},
		{"backslash in path", "/path\\evil", "/"},
		{"encoded backslash", "/path%5cevil", "/"},
		{"javascript", "javascript:alert(1)", "/"},
		{"data uri", "data:text/html,<script>alert(1)</script>", "/"},
		{"control char", "/pa\x00th", "/"},
		{"newline", "/pa\nth", "/"},
		{"carriage return", "/pa\rth", "/"},
		{"CRLF", "/pa\r\nth", "/"},
		{"encoded CR", "/path%0d%0a", "/"},
		{"encoded LF", "/path%0a", "/"},
		{"userinfo", "http://user@evil.com", "/"},
		{"at sign in path", "/@evil.com", "/"},
		{"double encoding", "%2fevil", "/"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := validateReturnTo(tt.input)
			if got != tt.expected {
				t.Errorf("validateReturnTo(%q) = %q, want %q", tt.input, got, tt.expected)
			}
		})
	}
}

func TestPkceChallengeS256(t *testing.T) {
	verifier := "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
	challenge := pkceChallengeS256(verifier)
	expected := "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
	if challenge != expected {
		t.Errorf("pkceChallengeS256 = %q, want %q", challenge, expected)
	}
}

func TestCryptoRandHex(t *testing.T) {
	id := cryptoRandHex(32)
	if len(id) != 64 {
		t.Errorf("cryptoRandHex(32) length = %d, want 64", len(id))
	}
	// Should be valid hex
	for _, c := range id {
		if !((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f')) {
			t.Errorf("cryptoRandHex produced non-hex char %c", c)
		}
	}
}

func TestCryptoRandBase64(t *testing.T) {
	id := cryptoRandBase64(32)
	if len(id) < 40 {
		t.Errorf("cryptoRandBase64(32) too short: %d", len(id))
	}
}

func TestSha256Hex(t *testing.T) {
	h := sha256Hex("test")
	if len(h) != 64 {
		t.Errorf("sha256Hex length = %d, want 64", len(h))
	}
}

func TestOauthConfigDisabled(t *testing.T) {
	cfg := loadYandexOAuthConfig()
	if cfg.Enabled {
		t.Error("expected Yandex OAuth to be disabled without env vars")
	}
}
