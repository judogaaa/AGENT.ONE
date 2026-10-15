package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// ─── SSO cookie name and attributes ───

func TestSSOCookieName(t *testing.T) {
	rec := httptest.NewRecorder()
	setRefreshCookie(rec, "testtoken", 1)
	cookies := rec.Result().Cookies()
	if len(cookies) != 1 || cookies[0].Name != "agentone_sso_refresh_token" {
		t.Error("cookie name should be agentone_sso_refresh_token")
	}
}

func TestSSOCookieHttpOnly(t *testing.T) {
	rec := httptest.NewRecorder()
	setRefreshCookie(rec, "testtoken", 1)
	c := rec.Result().Cookies()[0]
	if !c.HttpOnly {
		t.Error("cookie must be HttpOnly")
	}
}

func TestSSOCookiePath(t *testing.T) {
	rec := httptest.NewRecorder()
	setRefreshCookie(rec, "testtoken", 1)
	c := rec.Result().Cookies()[0]
	if c.Path != "/api/auth" {
		t.Errorf("cookie path = %q, want /api/auth", c.Path)
	}
}

func TestSSOCookieSameSiteStrict(t *testing.T) {
	rec := httptest.NewRecorder()
	setRefreshCookie(rec, "testtoken", 1)
	c := rec.Result().Cookies()[0]
	if c.SameSite != http.SameSiteStrictMode {
		t.Error("cookie SameSite must be Strict for refresh token")
	}
}

func TestSSOCookieSecureDevelopment(t *testing.T) {
	t.Setenv("APP_ENV", "development")
	rec := httptest.NewRecorder()
	setRefreshCookie(rec, "testtoken", 1)
	c := rec.Result().Cookies()[0]
	if c.Secure {
		t.Error("cookie must not be Secure in development")
	}
}

func TestSSOCookieSecureProduction(t *testing.T) {
	t.Setenv("APP_ENV", "production")
	rec := httptest.NewRecorder()
	setRefreshCookie(rec, "testtoken", 1)
	c := rec.Result().Cookies()[0]
	if !c.Secure {
		t.Error("cookie must be Secure in production")
	}
}

func TestSSOCookieMaxAge(t *testing.T) {
	rec := httptest.NewRecorder()
	const ttl = 5
	setRefreshCookie(rec, "testtoken", ttl)
	c := rec.Result().Cookies()[0]
	if c.MaxAge != ttl*3600 {
		t.Errorf("cookie MaxAge = %d, want %d", c.MaxAge, ttl*3600)
	}
}

func TestSSOCookieExpires(t *testing.T) {
	before := time.Now()
	rec := httptest.NewRecorder()
	setRefreshCookie(rec, "testtoken", 1)
	c := rec.Result().Cookies()[0]
	if c.Expires.Before(before) {
		t.Error("cookie Expires must be in the future")
	}
	if c.Expires.After(before.Add(2 * time.Hour)) {
		t.Error("cookie Expires must be within TTL range")
	}
}

// ─── Domain attribute ───

func TestSSOCookieDomainProduction(t *testing.T) {
	refreshCookieDomain = "agent-one.ru"
	defer func() { refreshCookieDomain = "" }()

	rec := httptest.NewRecorder()
	setRefreshCookie(rec, "testtoken", 1)
	c := rec.Result().Cookies()[0]
	if c.Domain != "agent-one.ru" {
		t.Errorf("cookie Domain = %q, want agent-one.ru", c.Domain)
	}
}

func TestSSOCookieDomainLocal(t *testing.T) {
	refreshCookieDomain = ""

	rec := httptest.NewRecorder()
	setRefreshCookie(rec, "testtoken", 1)
	c := rec.Result().Cookies()[0]
	if c.Domain != "" {
		t.Errorf("cookie Domain must be empty locally, got %q", c.Domain)
	}
}

// ─── Clear cookie clears both SSO and legacy ───

func TestClearCookieClearsBoth(t *testing.T) {
	refreshCookieDomain = "agent-one.ru"
	defer func() { refreshCookieDomain = "" }()

	rec := httptest.NewRecorder()
	clearRefreshCookie(rec)
	cookies := rec.Result().Cookies()

	var foundSSO, foundLegacy bool
	for _, c := range cookies {
		if c.Name == "agentone_sso_refresh_token" && c.MaxAge == -1 {
			foundSSO = true
			if c.Domain != "agent-one.ru" {
				t.Error("clear SSO cookie must have Domain set")
			}
		}
		if c.Name == "agentone_refresh_token" && c.MaxAge == -1 {
			foundLegacy = true
		}
	}
	if !foundSSO {
		t.Error("clear must remove SSO cookie")
	}
	if !foundLegacy {
		t.Error("clear must remove legacy cookie")
	}
}

func TestClearCookieLocalNoDomain(t *testing.T) {
	refreshCookieDomain = ""

	rec := httptest.NewRecorder()
	clearRefreshCookie(rec)
	cookies := rec.Result().Cookies()

	for _, c := range cookies {
		if c.Name == "agentone_sso_refresh_token" {
			if c.Domain != "" {
				t.Error("local clear must not set Domain on SSO cookie")
			}
		}
	}
}

// ─── readRefreshCookie: prefer SSO, fallback to legacy ───

func TestReadRefreshCookiePrefersSSO(t *testing.T) {
	req := httptest.NewRequest("POST", "/api/auth/refresh", nil)
	req.AddCookie(&http.Cookie{Name: "agentone_sso_refresh_token", Value: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2"})
	req.AddCookie(&http.Cookie{Name: "agentone_refresh_token", Value: "f0e1d2c3b4a59687a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9"})

	c, err := readRefreshCookie(req)
	if err != nil {
		t.Fatalf("readRefreshCookie failed: %v", err)
	}
	if c.Name != "agentone_sso_refresh_token" {
		t.Error("must prefer SSO cookie over legacy")
	}
	if c.Value != "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2" {
		t.Error("must return SSO cookie value")
	}
}

func TestReadRefreshCookieFallsBackToLegacy(t *testing.T) {
	req := httptest.NewRequest("POST", "/api/auth/refresh", nil)
	req.AddCookie(&http.Cookie{Name: "agentone_refresh_token", Value: "f0e1d2c3b4a59687a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9"})

	c, err := readRefreshCookie(req)
	if err != nil {
		t.Fatalf("readRefreshCookie failed: %v", err)
	}
	if c.Name != "agentone_refresh_token" {
		t.Error("must fall back to legacy cookie when SSO is missing")
	}
	if c.Value != "f0e1d2c3b4a59687a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9" {
		t.Error("must return legacy cookie value")
	}
}

func TestReadRefreshCookieMissingReturnsError(t *testing.T) {
	req := httptest.NewRequest("POST", "/api/auth/refresh", nil)

	_, err := readRefreshCookie(req)
	if err == nil {
		t.Error("must return error when no cookie exists")
	}
}

func TestReadRefreshCookieSSOOnly(t *testing.T) {
	req := httptest.NewRequest("POST", "/api/auth/refresh", nil)
	req.AddCookie(&http.Cookie{Name: "agentone_sso_refresh_token", Value: "b0b1b2b3b4b5b6b7b8b9c0c1c2c3c4c5c6c7c8c9d0d1d2d3d4d5d6d7d8d9e0e1e2"})

	c, err := readRefreshCookie(req)
	if err != nil {
		t.Fatalf("readRefreshCookie failed: %v", err)
	}
	if c.Name != "agentone_sso_refresh_token" {
		t.Error("must return SSO cookie")
	}
}

func TestReadRefreshCookieLegacyOnly(t *testing.T) {
	req := httptest.NewRequest("POST", "/api/auth/refresh", nil)
	req.AddCookie(&http.Cookie{Name: "agentone_refresh_token", Value: "c0c1c2c3c4c5c6c7c8c9d0d1d2d3d4d5d6d7d8d9e0e1e2e3e4e5e6e7e8e9f0f1f2"})

	c, err := readRefreshCookie(req)
	if err != nil {
		t.Fatalf("readRefreshCookie failed: %v", err)
	}
	if c.Name != "agentone_refresh_token" {
		t.Error("must return legacy cookie when SSO is absent")
	}
}

// ─── Existing token format / JWT tests preserved ───

func TestNoStoreHeaders(t *testing.T) {
	rec := httptest.NewRecorder()
	noStoreHeaders(rec)
	cc := rec.Header().Get("Cache-Control")
	if !strings.Contains(cc, "no-store") {
		t.Errorf("Cache-Control missing no-store: %q", cc)
	}
	if rec.Header().Get("Pragma") != "no-cache" {
		t.Error("Pragma must be no-cache")
	}
}

func TestValidRefreshTokenFormat(t *testing.T) {
	valid := "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2"
	if !validRefreshToken.MatchString(valid) {
		t.Error("must accept 64 lowercase hex")
	}
}

func TestEmptyRefreshTokenRejected(t *testing.T) {
	if validRefreshToken.MatchString("") {
		t.Error("must reject empty token")
	}
}

func TestShortRefreshTokenRejected(t *testing.T) {
	if validRefreshToken.MatchString("abc123") {
		t.Error("must reject short token")
	}
}

func TestLongRefreshTokenRejected(t *testing.T) {
	long := strings.Repeat("a", 65)
	if validRefreshToken.MatchString(long) {
		t.Error("must reject long token")
	}
}

func TestUppercaseRefreshTokenRejected(t *testing.T) {
	upper := "A1B2C3D4E5F6A7B8C9D0E1F2A3B4C5D6A7B8C9D0E1F2A3B4C5D6E7F8A9B0C"
	if validRefreshToken.MatchString(upper) {
		t.Error("must reject uppercase")
	}
}

func TestNonHexRefreshTokenRejected(t *testing.T) {
	nonHex := "g1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c"
	if validRefreshToken.MatchString(nonHex) {
		t.Error("must reject non-hex characters")
	}
}

func TestMakeJWTWithTTL(t *testing.T) {
	token, _ := makeJWTWithTTL("testuser", "client", []byte("secret-key-32-chars-here!!!"), 15)
	if token == "" {
		t.Fatal("makeJWTWithTTL returned empty")
	}
	claims, err := parseJWT(token, []byte("secret-key-32-chars-here!!!"))
	if err != nil {
		t.Fatalf("parseJWT failed: %v", err)
	}
	if claims.Sub != "testuser" {
		t.Error("subject mismatch")
	}
	expectedExp := time.Now().Add(15 * time.Minute).Unix()
	if claims.Exp < expectedExp-5 || claims.Exp > expectedExp+5 {
		t.Errorf("expiry range: %d, expected ~%d", claims.Exp, expectedExp)
	}
}

func TestMakeJWTOriginalStillWorks(t *testing.T) {
	token := makeJWT("olduser", "business", []byte("old-secret-key-32-chars-long!"))
	claims, err := parseJWT(token, []byte("old-secret-key-32-chars-long!"))
	if err != nil {
		t.Fatalf("original makeJWT should still work: %v", err)
	}
	if claims.Sub != "olduser" || claims.Role != "business" {
		t.Error("original JWT claims mismatch")
	}
}
