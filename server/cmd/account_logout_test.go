package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// ─── Logout handler ───

func TestLogoutMissingCookieReturns200(t *testing.T) {
	t.Setenv("APP_ENV", "development")
	app := &App{secCfg: AccountSecurityConfig{AccessTokenTTLMinutes: 15, RefreshTokenTTLHours: 24}}
	req := httptest.NewRequest("POST", "/api/auth/logout", nil)
	rec := httptest.NewRecorder()
	app.handleLogout(rec, req)
	if rec.Code != 200 {
		t.Errorf("missing cookie must return 200, got %d", rec.Code)
	}
	body := rec.Body.String()
	if !strings.Contains(body, "logged_out") {
		t.Errorf("body must contain logged_out: %s", body)
	}
}

// ─── Dual-cookie migration tests ───

func TestLogoutBothCookiesClearedInResponse(t *testing.T) {
	defer func() { recover() }()
	t.Setenv("APP_ENV", "development")
	app := &App{secCfg: AccountSecurityConfig{AccessTokenTTLMinutes: 15, RefreshTokenTTLHours: 24}}
	req := httptest.NewRequest("POST", "/api/auth/logout", nil)
	req.AddCookie(&http.Cookie{Name: ssoRefreshCookieName, Value: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2"})
	req.AddCookie(&http.Cookie{Name: refreshCookieName, Value: "f0e1d2c3b4a59687a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9"})
	rec := httptest.NewRecorder()
	app.handleLogout(rec, req)
	// clearRefreshCookie is called before DB — both must be set in response
	cookies := rec.Result().Cookies()
	foundSSO := false
	foundLegacy := false
	for _, c := range cookies {
		if c.Name == ssoRefreshCookieName && c.MaxAge == -1 {
			foundSSO = true
		}
		if c.Name == refreshCookieName && c.MaxAge == -1 {
			foundLegacy = true
		}
	}
	if !foundSSO {
		t.Error("logout with both cookies must clear SSO cookie")
	}
	if !foundLegacy {
		t.Error("logout with both cookies must clear legacy cookie")
	}
}

func TestLogoutClearsCookie(t *testing.T) {
	t.Setenv("APP_ENV", "development")
	app := &App{secCfg: AccountSecurityConfig{AccessTokenTTLMinutes: 15, RefreshTokenTTLHours: 24}}
	req := httptest.NewRequest("POST", "/api/auth/logout", nil)
	rec := httptest.NewRecorder()
	app.handleLogout(rec, req)
	cookies := rec.Result().Cookies()
	foundSSO := false
	foundLegacy := false
	for _, c := range cookies {
		if c.Name == "agentone_sso_refresh_token" && c.MaxAge == -1 {
			foundSSO = true
		}
		if c.Name == "agentone_refresh_token" && c.MaxAge == -1 {
			foundLegacy = true
		}
	}
	if !foundSSO {
		t.Error("logout must clear SSO refresh cookie")
	}
	if !foundLegacy {
		t.Error("logout must clear legacy refresh cookie")
	}
}

func TestLogoutNoStoreHeaders(t *testing.T) {
	t.Setenv("APP_ENV", "development")
	app := &App{secCfg: AccountSecurityConfig{AccessTokenTTLMinutes: 15, RefreshTokenTTLHours: 24}}
	req := httptest.NewRequest("POST", "/api/auth/logout", nil)
	rec := httptest.NewRecorder()
	app.handleLogout(rec, req)
	cc := rec.Header().Get("Cache-Control")
	if !strings.Contains(cc, "no-store") {
		t.Errorf("Cache-Control missing no-store: %q", cc)
	}
}

func TestLogoutMalformedNonHexReturns200(t *testing.T) {
	t.Setenv("APP_ENV", "development")
	app := &App{secCfg: AccountSecurityConfig{AccessTokenTTLMinutes: 15, RefreshTokenTTLHours: 24}}
	req := httptest.NewRequest("POST", "/api/auth/logout", nil)
	req.AddCookie(&http.Cookie{Name: "agentone_refresh_token", Value: "not-hex"})
	rec := httptest.NewRecorder()
	app.handleLogout(rec, req)
	if rec.Code != 200 {
		t.Errorf("malformed cookie must return 200, got %d", rec.Code)
	}
}

func TestLogoutForbiddenOriginReturns403(t *testing.T) {
	t.Setenv("APP_ENV", "development")
	app := &App{secCfg: AccountSecurityConfig{AccessTokenTTLMinutes: 15, RefreshTokenTTLHours: 24}}
	req := httptest.NewRequest("POST", "/api/auth/logout", nil)
	req.Header.Set("Origin", "https://evil.com")
	rec := httptest.NewRecorder()
	app.handleLogout(rec, req)
	if rec.Code != 403 {
		t.Errorf("forbidden origin must return 403, got %d", rec.Code)
	}
}

func TestLogoutAllowedOriginPasses(t *testing.T) {
	t.Setenv("APP_ENV", "development")
	t.Setenv("CORS_ORIGINS", "http://localhost:8080")
	initCORS()
	app := &App{secCfg: AccountSecurityConfig{AccessTokenTTLMinutes: 15, RefreshTokenTTLHours: 24}}
	req := httptest.NewRequest("POST", "/api/auth/logout", nil)
	req.Header.Set("Origin", "http://localhost:8080")
	rec := httptest.NewRecorder()
	app.handleLogout(rec, req)
	if rec.Code != 200 {
		t.Errorf("allowed origin must return 200, got %d", rec.Code)
	}
}

func TestLogoutNoOriginPasses(t *testing.T) {
	t.Setenv("APP_ENV", "development")
	app := &App{secCfg: AccountSecurityConfig{AccessTokenTTLMinutes: 15, RefreshTokenTTLHours: 24}}
	req := httptest.NewRequest("POST", "/api/auth/logout", nil)
	rec := httptest.NewRecorder()
	app.handleLogout(rec, req)
	if rec.Code != 200 {
		t.Errorf("no origin must return 200, got %d", rec.Code)
	}
}

// ─── Logout-all handler ───

func TestLogoutAllMissingJWTReturns401(t *testing.T) {
	t.Setenv("APP_ENV", "development")
	app := &App{secCfg: AccountSecurityConfig{AccessTokenTTLMinutes: 15, RefreshTokenTTLHours: 24}}
	req := httptest.NewRequest("POST", "/api/auth/logout-all", nil)
	rec := httptest.NewRecorder()
	app.handleLogoutAll(rec, req)
	if rec.Code != 401 {
		t.Errorf("missing JWT must return 401, got %d", rec.Code)
	}
	cookies := rec.Result().Cookies()
	foundSSO := false
	foundLegacy := false
	for _, c := range cookies {
		if c.Name == "agentone_sso_refresh_token" && c.MaxAge == -1 {
			foundSSO = true
		}
		if c.Name == "agentone_refresh_token" && c.MaxAge == -1 {
			foundLegacy = true
		}
	}
	if !foundSSO {
		t.Error("logout-all must clear SSO cookie even on auth failure")
	}
	if !foundLegacy {
		t.Error("logout-all must clear legacy cookie even on auth failure")
	}
}

func TestLogoutAllInvalidJWTReturns401(t *testing.T) {
	t.Setenv("APP_ENV", "development")
	app := &App{secCfg: AccountSecurityConfig{AccessTokenTTLMinutes: 15, RefreshTokenTTLHours: 24}, jwtKey: []byte("32-char-test-secret-key-here!!")}
	req := httptest.NewRequest("POST", "/api/auth/logout-all", nil)
	req.Header.Set("Authorization", "Bearer invalid.token.here")
	rec := httptest.NewRecorder()
	app.handleLogoutAll(rec, req)
	if rec.Code != 401 {
		t.Errorf("invalid JWT must return 401, got %d", rec.Code)
	}
}

func TestLogoutAllForbiddenOriginReturns403(t *testing.T) {
	t.Setenv("APP_ENV", "development")
	app := &App{secCfg: AccountSecurityConfig{AccessTokenTTLMinutes: 15, RefreshTokenTTLHours: 24}}
	req := httptest.NewRequest("POST", "/api/auth/logout-all", nil)
	req.Header.Set("Origin", "https://evil.com")
	rec := httptest.NewRecorder()
	app.handleLogoutAll(rec, req)
	if rec.Code != 403 {
		t.Errorf("forbidden origin must return 403, got %d", rec.Code)
	}
}

// ─── JSON contract ───

func TestLogoutSuccessJSON(t *testing.T) {
	t.Setenv("APP_ENV", "development")
	app := &App{secCfg: AccountSecurityConfig{AccessTokenTTLMinutes: 15, RefreshTokenTTLHours: 24}}
	req := httptest.NewRequest("POST", "/api/auth/logout", nil)
	rec := httptest.NewRecorder()
	app.handleLogout(rec, req)
	body := rec.Body.String()
	if !strings.Contains(body, `"ok":true`) || !strings.Contains(body, "logged_out") {
		t.Errorf("invalid success JSON: %s", body)
	}
}

func TestLogoutErrorDoesNotLeak(t *testing.T) {
	t.Setenv("APP_ENV", "development")
	app := &App{secCfg: AccountSecurityConfig{AccessTokenTTLMinutes: 15, RefreshTokenTTLHours: 24}}
	req := httptest.NewRequest("POST", "/api/auth/logout", nil)
	rec := httptest.NewRecorder()
	app.handleLogout(rec, req)
	body := rec.Body.String()
	for _, leak := range []string{"token", "hash", "family", "session_id"} {
		if strings.Contains(strings.ToLower(body), leak) {
			t.Errorf("body leaks %q: %s", leak, body)
		}
	}
}
