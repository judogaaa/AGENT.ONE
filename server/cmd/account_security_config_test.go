package main

import (
	"strings"
	"testing"
)

// ─── Development defaults ───

func TestDevConfigDefaultsValid(t *testing.T) {
	t.Setenv("ACCESS_TOKEN_TTL_MINUTES", "15")
	t.Setenv("REFRESH_TOKEN_TTL_HOURS", "720")
	t.Setenv("EMAIL_VERIFICATION_TTL_MINUTES", "60")
	t.Setenv("EMAIL_SENDER_MODE", "development")
	c := LoadAccountSecurityConfig()
	if len(c.Validate()) != 0 {
		t.Error("development defaults should be valid")
	}
}

func TestTestConfigDefaultsValid(t *testing.T) {
	t.Setenv("ACCESS_TOKEN_TTL_MINUTES", "30")
	t.Setenv("REFRESH_TOKEN_TTL_HOURS", "24")
	t.Setenv("EMAIL_VERIFICATION_TTL_MINUTES", "30")
	t.Setenv("EMAIL_SENDER_MODE", "development")
	c := LoadAccountSecurityConfig()
	if len(c.Validate()) != 0 {
		t.Error("test config should be valid")
	}
}

// ─── Production APP_PUBLIC_URL ───

func TestProductionNoPublicURLRejected(t *testing.T) {
	c := AccountSecurityConfig{
		AccessTokenTTLMinutes:       15,
		RefreshTokenTTLHours:        720,
		EmailVerificationTTLMinutes: 60,
		EmailSenderMode:             "smtp",
		AppPublicURL:                "",
	}
	issues := c.ValidateProduction()
	found := false
	for _, i := range issues {
		if strings.Contains(strings.ToLower(i), "app_public_url") {
			found = true
		}
	}
	if !found {
		t.Error("production should require APP_PUBLIC_URL")
	}
}

func TestProductionHTTPURLRejected(t *testing.T) {
	c := AccountSecurityConfig{
		AccessTokenTTLMinutes:       15,
		RefreshTokenTTLHours:        720,
		EmailVerificationTTLMinutes: 60,
		EmailSenderMode:             "smtp",
		AppPublicURL:                "http://example.com",
	}
	issues := c.ValidateProduction()
	found := false
	for _, i := range issues {
		if strings.Contains(i, "https") {
			found = true
		}
	}
	if !found {
		t.Error("production should reject http URL")
	}
}

func TestProductionLocalhostRejected(t *testing.T) {
	c := AccountSecurityConfig{
		AccessTokenTTLMinutes:       15,
		RefreshTokenTTLHours:        720,
		EmailVerificationTTLMinutes: 60,
		EmailSenderMode:             "smtp",
		AppPublicURL:                "https://localhost:8080",
	}
	issues := c.ValidateProduction()
	found := false
	for _, i := range issues {
		if strings.Contains(i, "localhost") {
			found = true
		}
	}
	if !found {
		t.Error("production should reject localhost URL")
	}
}

func TestProductionLoopbackIPRejected(t *testing.T) {
	c := AccountSecurityConfig{
		AccessTokenTTLMinutes:       15,
		RefreshTokenTTLHours:        720,
		EmailVerificationTTLMinutes: 60,
		EmailSenderMode:             "smtp",
		AppPublicURL:                "https://127.0.0.1:8080",
	}
	issues := c.ValidateProduction()
	found := false
	for _, i := range issues {
		if strings.Contains(i, "loopback") {
			found = true
		}
	}
	if !found {
		t.Error("production should reject loopback IP")
	}
}

func TestProductionValidHTTPSSURL(t *testing.T) {
	c := AccountSecurityConfig{
		AccessTokenTTLMinutes:            15,
		RefreshTokenTTLHours:             720,
		EmailVerificationTTLMinutes:      60,
		EmailVerificationTokenTTLMinutes: 30,
		EmailVerificationResendCooldown:  60,
		EmailSenderMode:                  "smtp",
		AppPublicURL:                     "https://agentone.ru",
	}
	issues := c.ValidateProduction()
	if len(issues) != 0 {
		t.Errorf("valid production config should have no issues, got %v", issues)
	}
}

// ─── TTL validation ───

func TestInvalidTTLRejected(t *testing.T) {
	c := AccountSecurityConfig{
		AccessTokenTTLMinutes:       0,
		RefreshTokenTTLHours:        720,
		EmailVerificationTTLMinutes: 60,
		EmailSenderMode:             "development",
	}
	issues := c.Validate()
	found := false
	for _, i := range issues {
		if strings.Contains(i, "ACCESS_TOKEN_TTL") && strings.Contains(i, "positive") {
			found = true
		}
	}
	if !found {
		t.Error("should reject zero access token TTL")
	}
}

func TestNegativeTTLRejected(t *testing.T) {
	c := AccountSecurityConfig{
		AccessTokenTTLMinutes:       15,
		RefreshTokenTTLHours:        -1,
		EmailVerificationTTLMinutes: 60,
		EmailSenderMode:             "development",
	}
	issues := c.Validate()
	found := false
	for _, i := range issues {
		if strings.Contains(i, "REFRESH_TOKEN_TTL") && strings.Contains(i, "positive") {
			found = true
		}
	}
	if !found {
		t.Error("should reject negative refresh token TTL")
	}
}

func TestExcessiveTTLRejected(t *testing.T) {
	c := AccountSecurityConfig{
		AccessTokenTTLMinutes:       9999,
		RefreshTokenTTLHours:        720,
		EmailVerificationTTLMinutes: 60,
		EmailSenderMode:             "development",
	}
	issues := c.Validate()
	found := false
	for _, i := range issues {
		if strings.Contains(i, "ACCESS_TOKEN_TTL") && strings.Contains(i, "1440") {
			found = true
		}
	}
	if !found {
		t.Error("should reject excessive access token TTL")
	}
}

// ─── Sender mode ───

func TestUnknownSenderModeRejected(t *testing.T) {
	c := AccountSecurityConfig{
		AccessTokenTTLMinutes:       15,
		RefreshTokenTTLHours:        720,
		EmailVerificationTTLMinutes: 60,
		EmailSenderMode:             "mailgun",
	}
	issues := c.Validate()
	if len(issues) == 0 {
		t.Error("should reject unknown sender mode")
	}
}

func TestSMTPModeAccepted(t *testing.T) {
	c := AccountSecurityConfig{
		AccessTokenTTLMinutes:            15,
		RefreshTokenTTLHours:             720,
		EmailVerificationTTLMinutes:      60,
		EmailVerificationTokenTTLMinutes: 30,
		EmailVerificationResendCooldown:  60,
		EmailSenderMode:                  "smtp",
	}
	if len(c.Validate()) != 0 {
		t.Error("smtp mode should be valid")
	}
}

func TestDisabledModeAccepted(t *testing.T) {
	c := AccountSecurityConfig{
		AccessTokenTTLMinutes:            15,
		RefreshTokenTTLHours:             720,
		EmailVerificationTTLMinutes:      60,
		EmailVerificationTokenTTLMinutes: 30,
		EmailVerificationResendCooldown:  60,
		EmailSenderMode:                  "disabled",
	}
	if len(c.Validate()) != 0 {
		t.Error("disabled mode should be valid")
	}
}

// ─── Validation errors don't leak secrets ───

func TestAccountConfigErrorsDontLeakSecrets(t *testing.T) {
	c := AccountSecurityConfig{
		AccessTokenTTLMinutes:       15,
		RefreshTokenTTLHours:        720,
		EmailVerificationTTLMinutes: 60,
		EmailSenderMode:             "development",
		AppPublicURL:                "https://supersecret.example.com",
	}
	issues := c.Validate()
	for _, i := range issues {
		if strings.Contains(i, "secret") {
			t.Error("validation error should not leak values")
		}
	}
}
