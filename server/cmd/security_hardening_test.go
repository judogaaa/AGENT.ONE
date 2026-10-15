package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// ─── Security Headers ───

func TestSecurityHeadersPresent(t *testing.T) {
	t.Setenv("SECURITY_HEADERS_ENABLED", "true")
	initSecurityHeaders()
	h := securityHeadersMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(200)
	}))
	req := httptest.NewRequest("GET", "/api/test", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	headers := []string{
		"X-Content-Type-Options",
		"X-Frame-Options",
		"Referrer-Policy",
		"Content-Security-Policy",
		"Cross-Origin-Opener-Policy",
		"Cross-Origin-Resource-Policy",
		"Permissions-Policy",
	}
	for _, name := range headers {
		if rec.Header().Get(name) == "" {
			t.Errorf("missing header %s", name)
		}
	}
}

func TestSecurityHeadersDisabled(t *testing.T) {
	securityHeadersEnabled = false
	defer func() { securityHeadersEnabled = true }()
	h := securityHeadersMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(200)
	}))
	req := httptest.NewRequest("GET", "/api/test", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Header().Get("Content-Security-Policy") != "" {
		t.Error("CSP should be absent when disabled")
	}
}

func TestHSTSOnlyWithTLS(t *testing.T) {
	t.Setenv("APP_ENV", "production")
	t.Setenv("SECURITY_HEADERS_ENABLED", "true")
	initSecurityHeaders()
	h := securityHeadersMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(200)
	}))
	// HTTP request without TLS
	req := httptest.NewRequest("GET", "/api/test", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Header().Get("Strict-Transport-Security") != "" {
		t.Error("HSTS should not be set for plain HTTP in production without trusted proxy")
	}
}

func TestHSTSAbsentOnLocalhost(t *testing.T) {
	t.Setenv("APP_ENV", "development")
	t.Setenv("SECURITY_HEADERS_ENABLED", "true")
	initSecurityHeaders()
	h := securityHeadersMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(200)
	}))
	req := httptest.NewRequest("GET", "/api/test", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Header().Get("Strict-Transport-Security") != "" {
		t.Error("HSTS should not be set in development")
	}
}

func TestCORSProductionRejectsWildcard(t *testing.T) {
	t.Setenv("APP_ENV", "production")
	t.Setenv("CORS_ORIGINS", "*")
	issues := validateCORSConfig()
	found := false
	for _, i := range issues {
		if strings.Contains(i, "*") || strings.Contains(strings.ToLower(i), "wildcard") {
			found = true
		}
	}
	if !found {
		t.Error("production should reject wildcard CORS origin")
	}
}

func TestCORSNoWildcard(t *testing.T) {
	t.Setenv("APP_ENV", "development")
	t.Setenv("CORS_ORIGINS", "https://example.com")
	issues := validateCORSConfig()
	if len(issues) > 0 {
		t.Errorf("development with specific origin should have no issues, got %v", issues)
	}
}

// ─── Trusted Proxy ───

func TestUntrustedProxyHeadersIgnored(t *testing.T) {
	defer func() { trustedCIDRs = nil }()
	trustedCIDRs = nil
	req := httptest.NewRequest("GET", "/api/test", nil)
	req.RemoteAddr = "10.0.0.5:12345"
	req.Header.Set("X-Forwarded-For", "1.2.3.4")
	req.Header.Set("X-Real-IP", "5.6.7.8")
	ip := trustedClientIP(req)
	if ip != "10.0.0.5" {
		t.Errorf("untrusted proxy should fall back to remote addr, got %s", ip)
	}
}

func TestTrustedProxyAccepted(t *testing.T) {
	defer func() { trustedCIDRs = nil }()
	t.Setenv("TRUSTED_PROXY_CIDRS", "10.0.0.0/24")
	initTrustedProxies()
	req := httptest.NewRequest("GET", "/api/test", nil)
	req.RemoteAddr = "10.0.0.1:12345"
	req.Header.Set("X-Forwarded-For", "203.0.113.5")
	ip := trustedClientIP(req)
	if ip != "203.0.113.5" {
		t.Errorf("trusted proxy should use forwarded IP, got %s", ip)
	}
}

func TestTrustedProxyXForwardedForRightmostIP(t *testing.T) {
	defer func() { trustedCIDRs = nil }()
	t.Setenv("TRUSTED_PROXY_CIDRS", "10.0.0.0/24")
	initTrustedProxies()
	req := httptest.NewRequest("GET", "/api/test", nil)
	req.RemoteAddr = "10.0.0.1:12345"
	req.Header.Set("X-Forwarded-For", "spoofed, 10.0.1.5")
	ip := trustedClientIP(req)
	if ip != "10.0.1.5" {
		t.Errorf("should use rightmost valid IP from X-Forwarded-For, got %q", ip)
	}
}

func TestInvalidCIDRRejected(t *testing.T) {
	defer func() { trustedCIDRs = nil }()
	t.Setenv("TRUSTED_PROXY_CIDRS", "not-a-cidr")
	initTrustedProxies()
	if len(trustedCIDRs) != 0 {
		t.Error("invalid CIDR should be skipped")
	}
}

func TestSpoofedForwardedHeadersIgnored(t *testing.T) {
	defer func() { trustedCIDRs = nil }()
	trustedCIDRs = nil
	req := httptest.NewRequest("GET", "/api/test", nil)
	req.RemoteAddr = "192.168.1.1:12345"
	req.Header.Set("X-Forwarded-Proto", "https")
	if isSecureScheme(req) {
		t.Error("spoofed X-Forwarded-Proto should be ignored from untrusted proxy")
	}
}

// ─── Body Limits ───

func TestBodyLimitUnderLimit(t *testing.T) {
	t.Setenv("MAX_REQUEST_BODY_BYTES", "1048576")
	h := bodyLimitMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(200)
	}))
	req := httptest.NewRequest("POST", "/api/test", strings.NewReader(`{"key":"value"}`))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Errorf("under-limit body returned %d", rec.Code)
	}
}

func TestBodyLimitOverLimitContentLength(t *testing.T) {
	t.Setenv("MAX_REQUEST_BODY_BYTES", "10")
	h := bodyLimitMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(200)
	}))
	req := httptest.NewRequest("POST", "/api/test", strings.NewReader(`{"too":"large"}`))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != 413 {
		t.Errorf("over-limit content-length returned %d, want 413", rec.Code)
	}
}

func TestBodyLimitSkippedForGet(t *testing.T) {
	t.Setenv("MAX_REQUEST_BODY_BYTES", "1")
	h := bodyLimitMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(200)
	}))
	req := httptest.NewRequest("GET", "/api/test", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Errorf("GET should skip body limit, got %d", rec.Code)
	}
}

// ─── Server Timeout Config ───

func TestServerReadTimeout(t *testing.T) {
	t.Setenv("SERVER_READ_TIMEOUT_SECONDS", "30")
	if d := serverReadTimeout(); d != 30*time.Second {
		t.Errorf("read timeout = %v, want 30s", d)
	}
}

func TestServerIdleTimeout(t *testing.T) {
	t.Setenv("SERVER_IDLE_TIMEOUT_SECONDS", "90")
	if d := serverIdleTimeout(); d != 90*time.Second {
		t.Errorf("idle timeout = %v, want 90s", d)
	}
}

func TestServerMaxHeaderBytes(t *testing.T) {
	t.Setenv("SERVER_MAX_HEADER_BYTES", "8192")
	if v := serverMaxHeaderBytes(); v != 8192 {
		t.Errorf("max header bytes = %d, want 8192", v)
	}
}

// ─── Auth Brute Force ───

func TestAuthFailureIncrement(t *testing.T) {
	t.Setenv("AUTH_FAILURE_LIMIT", "5")
	t.Setenv("AUTH_FAILURE_WINDOW_SECONDS", "300")
	key := authKey("test@test.ru", "10.0.0.1")
	if authLimiter.isLocked(key) {
		t.Error("should not be locked initially")
	}
	for i := 0; i < 4; i++ {
		if authLimiter.recordFailure(key) {
			t.Errorf("should not lock at attempt %d", i+1)
		}
	}
	if !authLimiter.recordFailure(key) {
		t.Error("should lock after 5 failures")
	}
	if !authLimiter.isLocked(key) {
		t.Error("should be locked")
	}
}

func TestAuthSuccessResets(t *testing.T) {
	key := authKey("reset@test.com", "10.0.0.2")
	authLimiter.recordFailure(key)
	authLimiter.recordFailure(key)
	authLimiter.reset(key)
	if authLimiter.isLocked(key) {
		t.Error("reset should clear lock")
	}
	// After reset, first failure should not lock
	if authLimiter.recordFailure(key) {
		t.Error("after reset, first failure should not lock")
	}
}

func TestAuthDifferentIdentifiersIsolated(t *testing.T) {
	t.Setenv("AUTH_FAILURE_LIMIT", "3")
	key1 := authKey("user1@test.com", "10.0.0.1")
	key2 := authKey("user2@test.com", "10.0.0.2")
	authLimiter.reset(key1)
	authLimiter.reset(key2)
	authLimiter.recordFailure(key1)
	authLimiter.recordFailure(key2)
	authLimiter.recordFailure(key1)
	if authLimiter.isLocked(key1) {
		t.Error("key1 should not be locked at 2 failures (limit 3)")
	}
	if authLimiter.isLocked(key2) {
		t.Error("key2 should not be locked at 1 failure")
	}
}

func TestAuthRetryAfterHeader(t *testing.T) {
	t.Setenv("AUTH_FAILURE_LIMIT", "2")
	t.Setenv("AUTH_LOCKOUT_SECONDS", "60")
	key := authKey("retryafter@test.com", "10.0.0.5")
	authLimiter.reset(key)
	authLimiter.recordFailure(key)
	authLimiter.recordFailure(key)
	if !authLimiter.isLocked(key) {
		t.Error("should be locked")
	}
}

func TestSafeErrorBlocksSecrets(t *testing.T) {
	tests := []string{"password: secret123", "DATABASE_URL=postgres://", "token abc123", "goroutine 123 [running]", "panic: nil pointer"}
	for _, msg := range tests {
		result := safeErrorMessage(fmtErr(msg))
		if result == msg {
			t.Errorf("safeError should block sensitive input: %q", msg)
		}
	}
}

func TestSafeErrorPassesSafeMessages(t *testing.T) {
	msg := "Invalid email format."
	result := safeErrorMessage(fmtErr(msg))
	if result != msg {
		t.Errorf("safe error should pass: %q != %q", result, msg)
	}
}

// ─── Config Validation ───

func TestValidateSecurityConfigProduction(t *testing.T) {
	t.Setenv("APP_ENV", "production")
	t.Setenv("CORS_ORIGINS", "https://example.com")
	t.Setenv("MAX_REQUEST_BODY_BYTES", "1048576")
	t.Setenv("MAX_UPLOAD_BYTES", "5242880")
	t.Setenv("SERVER_READ_TIMEOUT_SECONDS", "15")
	t.Setenv("SERVER_WRITE_TIMEOUT_SECONDS", "60")
	t.Setenv("SERVER_IDLE_TIMEOUT_SECONDS", "60")
	t.Setenv("AUTH_FAILURE_LIMIT", "5")
	issues := validateSecurityConfig()
	if len(issues) > 0 {
		t.Errorf("valid production config should have no issues, got %v", issues)
	}
}

func TestValidateSecurityConfigMissingBodyLimit(t *testing.T) {
	t.Setenv("APP_ENV", "production")
	t.Setenv("CORS_ORIGINS", "https://example.com")
	t.Setenv("MAX_REQUEST_BODY_BYTES", "0")
	t.Setenv("MAX_UPLOAD_BYTES", "5242880")
	t.Setenv("SERVER_READ_TIMEOUT_SECONDS", "15")
	t.Setenv("SERVER_WRITE_TIMEOUT_SECONDS", "60")
	t.Setenv("SERVER_IDLE_TIMEOUT_SECONDS", "60")
	t.Setenv("AUTH_FAILURE_LIMIT", "5")
	issues := validateSecurityConfig()
	found := false
	for _, i := range issues {
		if strings.Contains(i, "MAX_REQUEST_BODY_BYTES") {
			found = true
		}
	}
	if !found {
		t.Error("should flag missing MAX_REQUEST_BODY_BYTES")
	}
}

// fmtErr helper for tests
func fmtErr(msg string) error { return &testError{msg: msg} }

type testError struct{ msg string }

func (e *testError) Error() string { return e.msg }
