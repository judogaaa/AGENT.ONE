package main

import (
	"errors"
	"fmt"
	"net"
	"net/url"
	"strings"
)

// AccountSecurityConfig holds configuration for account security features
// including access/refresh token TTLs, email verification, and sender mode.
type AccountSecurityConfig struct {
	AccessTokenTTLMinutes            int
	RefreshTokenTTLHours             int
	EmailVerificationTTLMinutes      int
	EmailVerificationTokenTTLMinutes int
	EmailVerificationResendCooldown  int
	EmailVerificationExposeToken     bool
	EmailVerificationRequired        bool
	EmailSenderMode                  string
	AppPublicURL                     string
}

// validSenderModes defines allowed EMAIL_SENDER_MODE values.
var validSenderModes = map[string]bool{
	"disabled":    true,
	"development": true,
	"smtp":        true,
}

// LoadAccountSecurityConfig reads configuration from environment variables.
// Returns development-safe defaults when values are absent.
// Does NOT perform production validation — use Validate() for that.
func LoadAccountSecurityConfig() AccountSecurityConfig {
	return AccountSecurityConfig{
		AccessTokenTTLMinutes:            envInt("ACCESS_TOKEN_TTL_MINUTES", 15),
		RefreshTokenTTLHours:             envInt("REFRESH_TOKEN_TTL_HOURS", 720),
		EmailVerificationTTLMinutes:      envInt("EMAIL_VERIFICATION_TTL_MINUTES", 60),
		EmailVerificationTokenTTLMinutes: envInt("EMAIL_VERIFICATION_TOKEN_TTL_MINUTES", 30),
		EmailVerificationResendCooldown:  envInt("EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS", 60),
		EmailVerificationExposeToken:     envBool("EMAIL_VERIFICATION_EXPOSE_TOKEN", false),
		EmailVerificationRequired:        envBool("EMAIL_VERIFICATION_REQUIRED", false),
		EmailSenderMode:                  envString("EMAIL_SENDER_MODE", "development"),
		AppPublicURL:                     envString("APP_PUBLIC_URL", ""),
	}
}

// Validate checks the configuration and returns all production issues.
// In development/test, lenient validation allows localhost and empty URL.
func (c AccountSecurityConfig) Validate() []string {
	var issues []string

	// TTLs must be positive
	if c.AccessTokenTTLMinutes <= 0 {
		issues = append(issues, "ACCESS_TOKEN_TTL_MINUTES must be positive")
	}
	if c.RefreshTokenTTLHours <= 0 {
		issues = append(issues, "REFRESH_TOKEN_TTL_HOURS must be positive")
	}
	if c.EmailVerificationTTLMinutes <= 0 {
		issues = append(issues, "EMAIL_VERIFICATION_TTL_MINUTES must be positive")
	}
	if c.EmailVerificationTokenTTLMinutes < 5 || c.EmailVerificationTokenTTLMinutes > 1440 {
		issues = append(issues, "EMAIL_VERIFICATION_TOKEN_TTL_MINUTES must be 5–1440")
	}
	if c.EmailVerificationResendCooldown < 10 || c.EmailVerificationResendCooldown > 3600 {
		issues = append(issues, "EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS must be 10–3600")
	}

	// TTL upper bounds
	if c.AccessTokenTTLMinutes > 1440 {
		issues = append(issues, "ACCESS_TOKEN_TTL_MINUTES must not exceed 1440 (24h)")
	}
	if c.RefreshTokenTTLHours > 2160 {
		issues = append(issues, "REFRESH_TOKEN_TTL_HOURS must not exceed 2160 (90 days)")
	}
	if c.EmailVerificationTTLMinutes > 1440 {
		issues = append(issues, "EMAIL_VERIFICATION_TTL_MINUTES must not exceed 1440 (24h)")
	}

	// Sender mode must be a known value
	if !validSenderModes[c.EmailSenderMode] {
		issues = append(issues, fmt.Sprintf("EMAIL_SENDER_MODE must be one of: %s", strings.Join(senderModeKeys(), ", ")))
	}

	return issues
}

// ValidateProduction runs Validate and adds production-specific checks.
func (c AccountSecurityConfig) ValidateProduction() []string {
	issues := c.Validate()

	// Production must not expose tokens
	if c.EmailVerificationExposeToken {
		issues = append(issues, "EMAIL_VERIFICATION_EXPOSE_TOKEN must be false in production")
	}

	// APP_PUBLIC_URL required in production
	if c.AppPublicURL == "" {
		issues = append(issues, "APP_PUBLIC_URL is required in production")
		return issues
	}

	u, err := url.Parse(c.AppPublicURL)
	if err != nil || u.Scheme == "" || u.Host == "" {
		issues = append(issues, "APP_PUBLIC_URL must be a valid absolute URL with scheme and host")
		return issues
	}

	// Production must use HTTPS
	if u.Scheme != "https" {
		issues = append(issues, "APP_PUBLIC_URL must use https in production")
	}

	// No localhost or loopback in production
	host := strings.ToLower(u.Hostname())
	if host == "localhost" {
		issues = append(issues, "APP_PUBLIC_URL must not be localhost in production")
	}
	if ip := net.ParseIP(host); ip != nil && ip.IsLoopback() {
		issues = append(issues, "APP_PUBLIC_URL must not be a loopback address in production")
	}

	return issues
}

func senderModeKeys() []string {
	keys := make([]string, 0, len(validSenderModes))
	for k := range validSenderModes {
		keys = append(keys, k)
	}
	return keys
}

// errConfig wraps a config validation error without leaking sensitive values.
func errConfig(msg string) error {
	return errors.New("config: " + msg)
}
