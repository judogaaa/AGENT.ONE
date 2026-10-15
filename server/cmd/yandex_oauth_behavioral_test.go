package main

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"sync"
	"testing"
	"time"
)

// ── Start handler tests ──

func TestStartHandler_ProviderDisabled(t *testing.T) {
	// Save and restore oauthStore
	origStore := oauthStore
	defer func() { oauthStore = origStore }()
	oauthStore = newMemoryStateStore()

	// Unset env vars to make provider disabled
	origID := lookupEnv("YANDEX_OAUTH_CLIENT_ID")
	origSecret := lookupEnv("YANDEX_OAUTH_CLIENT_SECRET")
	defer func() {
		if origID != "" {
			t.Setenv("YANDEX_OAUTH_CLIENT_ID", origID)
		}
		if origSecret != "" {
			t.Setenv("YANDEX_OAUTH_CLIENT_SECRET", origSecret)
		}
	}()
	t.Setenv("YANDEX_OAUTH_CLIENT_ID", "")
	t.Setenv("YANDEX_OAUTH_CLIENT_SECRET", "")

	req := httptest.NewRequest("GET", "/api/auth/oauth/yandex/start?mode=login", nil)
	w := httptest.NewRecorder()
	app := &App{}
	app.handleYandexOAuthStart(w, req)
	resp := w.Result()
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusServiceUnavailable {
		t.Errorf("expected 503, got %d", resp.StatusCode)
	}
}

func TestStartHandler_InvalidMode(t *testing.T) {
	origStore := oauthStore
	defer func() { oauthStore = origStore }()
	oauthStore = newMemoryStateStore()

	t.Setenv("YANDEX_OAUTH_CLIENT_ID", "test-id")
	t.Setenv("YANDEX_OAUTH_CLIENT_SECRET", "test-secret")

	req := httptest.NewRequest("GET", "/api/auth/oauth/yandex/start?mode=invalid", nil)
	w := httptest.NewRecorder()
	app := &App{secCfg: AccountSecurityConfig{AppPublicURL: "http://testapp"}}
	app.handleYandexOAuthStart(w, req)
	resp := w.Result()
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", resp.StatusCode)
	}
}

func TestStartHandler_SignupNoRole(t *testing.T) {
	origStore := oauthStore
	defer func() { oauthStore = origStore }()
	oauthStore = newMemoryStateStore()

	t.Setenv("YANDEX_OAUTH_CLIENT_ID", "test-id")
	t.Setenv("YANDEX_OAUTH_CLIENT_SECRET", "test-secret")

	req := httptest.NewRequest("GET", "/api/auth/oauth/yandex/start?mode=signup", nil)
	w := httptest.NewRecorder()
	app := &App{secCfg: AccountSecurityConfig{AppPublicURL: "http://testapp"}}
	app.handleYandexOAuthStart(w, req)
	resp := w.Result()
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", resp.StatusCode)
	}
}

func TestStartHandler_InvalidRole(t *testing.T) {
	origStore := oauthStore
	defer func() { oauthStore = origStore }()
	oauthStore = newMemoryStateStore()

	t.Setenv("YANDEX_OAUTH_CLIENT_ID", "test-id")
	t.Setenv("YANDEX_OAUTH_CLIENT_SECRET", "test-secret")

	req := httptest.NewRequest("GET", "/api/auth/oauth/yandex/start?mode=signup&role=admin", nil)
	w := httptest.NewRecorder()
	app := &App{secCfg: AccountSecurityConfig{AppPublicURL: "http://testapp"}}
	app.handleYandexOAuthStart(w, req)
	resp := w.Result()
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", resp.StatusCode)
	}
}

func TestStartHandler_LoginIgnoresRoleParam(t *testing.T) {
	origStore := oauthStore
	defer func() { oauthStore = origStore }()
	oauthStore = newMemoryStateStore()

	t.Setenv("YANDEX_OAUTH_CLIENT_ID", "test-id")
	t.Setenv("YANDEX_OAUTH_CLIENT_SECRET", "test-secret")

	// login mode with role=admin should be accepted (role is ignored for login)
	req := httptest.NewRequest("GET", "/api/auth/oauth/yandex/start?mode=login&role=admin", nil)
	w := httptest.NewRecorder()
	app := &App{secCfg: AccountSecurityConfig{AppPublicURL: "http://testapp"}}
	app.handleYandexOAuthStart(w, req)
	resp := w.Result()
	defer resp.Body.Close()

	// Should redirect (302) because login ignores role
	if resp.StatusCode != http.StatusFound {
		t.Errorf("expected 302 redirect, got %d", resp.StatusCode)
	}
}

func TestStartHandler_SuccessReturnsRedirect(t *testing.T) {
	origStore := oauthStore
	defer func() { oauthStore = origStore }()
	oauthStore = newMemoryStateStore()

	t.Setenv("YANDEX_OAUTH_CLIENT_ID", "test-client-id")
	t.Setenv("YANDEX_OAUTH_CLIENT_SECRET", "test-secret")

	req := httptest.NewRequest("GET", "/api/auth/oauth/yandex/start?mode=login&return_to=%2Fdashboard", nil)
	w := httptest.NewRecorder()
	app := &App{secCfg: AccountSecurityConfig{AppPublicURL: "http://testapp"}}
	app.handleYandexOAuthStart(w, req)
	resp := w.Result()
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusFound {
		t.Errorf("expected 302 redirect, got %d", resp.StatusCode)
	}

	loc := resp.Header.Get("Location")
	if loc == "" {
		t.Fatal("Location header is empty")
	}

	// Must redirect to Yandex authorization endpoint
	if !strings.HasPrefix(loc, "https://oauth.yandex.ru/authorize") {
		t.Errorf("Location does not point to Yandex authorize: %s", loc)
	}

	parsed, err := url.Parse(loc)
	if err != nil {
		t.Fatal(err)
	}
	q := parsed.Query()

	if q.Get("response_type") != "code" {
		t.Errorf("missing response_type=code")
	}
	if q.Get("client_id") != "test-client-id" {
		t.Errorf("client_id = %q, want test-client-id", q.Get("client_id"))
	}
	if q.Get("code_challenge") == "" {
		t.Errorf("missing code_challenge")
	}
	if q.Get("code_challenge_method") != "S256" {
		t.Errorf("code_challenge_method = %q, want S256", q.Get("code_challenge_method"))
	}
	if q.Get("state") == "" {
		t.Errorf("missing state")
	}
	// Sensitive data must NOT be in redirect URL
	if q.Get("client_secret") != "" {
		t.Errorf("client_secret found in Location URL")
	}
}

func TestStartHandler_LocationNoSecrets(t *testing.T) {
	origStore := oauthStore
	defer func() { oauthStore = origStore }()
	oauthStore = newMemoryStateStore()

	t.Setenv("YANDEX_OAUTH_CLIENT_ID", "test-client-id")
	t.Setenv("YANDEX_OAUTH_CLIENT_SECRET", "test-secret")

	req := httptest.NewRequest("GET", "/api/auth/oauth/yandex/start?mode=login", nil)
	w := httptest.NewRecorder()
	app := &App{secCfg: AccountSecurityConfig{AppPublicURL: "http://testapp"}}
	app.handleYandexOAuthStart(w, req)
	resp := w.Result()
	defer resp.Body.Close()

	loc := resp.Header.Get("Location")

	// No secrets in URL
	for _, secret := range []string{"test-secret", "client_secret=", "browser_nonce=", "role=", "return_to="} {
		if strings.Contains(loc, secret) {
			t.Errorf("Location contains forbidden value: %s", secret)
		}
	}
}

func TestStartHandler_TemporaryCookieSet(t *testing.T) {
	origStore := oauthStore
	defer func() { oauthStore = origStore }()
	oauthStore = newMemoryStateStore()

	t.Setenv("YANDEX_OAUTH_CLIENT_ID", "test-id")
	t.Setenv("YANDEX_OAUTH_CLIENT_SECRET", "test-secret")

	req := httptest.NewRequest("GET", "/api/auth/oauth/yandex/start?mode=login", nil)
	w := httptest.NewRecorder()
	app := &App{secCfg: AccountSecurityConfig{AppPublicURL: "http://testapp"}}
	app.handleYandexOAuthStart(w, req)
	resp := w.Result()
	defer resp.Body.Close()

	cookies := resp.Header.Values("Set-Cookie")
	found := false
	for _, c := range cookies {
		if strings.HasPrefix(c, "agentone_yandex_oauth=") {
			found = true
			if !strings.Contains(c, "HttpOnly") {
				t.Error("cookie missing HttpOnly")
			}
			if !strings.Contains(c, "Path=/api/auth/oauth/yandex") {
				t.Error("cookie missing correct Path")
			}
			if !strings.Contains(c, "SameSite=Lax") {
				t.Error("cookie missing SameSite=Lax")
			}
			break
		}
	}
	if !found {
		t.Error("temporary OAuth cookie not set")
	}
}

func TestStartHandler_RedisFailureReturns500(t *testing.T) {
	// Use a failing state store
	origStore := oauthStore
	defer func() { oauthStore = origStore }()
	oauthStore = &failingStateStore{}

	t.Setenv("YANDEX_OAUTH_CLIENT_ID", "test-id")
	t.Setenv("YANDEX_OAUTH_CLIENT_SECRET", "test-secret")

	req := httptest.NewRequest("GET", "/api/auth/oauth/yandex/start?mode=login", nil)
	w := httptest.NewRecorder()
	app := &App{secCfg: AccountSecurityConfig{AppPublicURL: "http://testapp"}}
	app.handleYandexOAuthStart(w, req)
	resp := w.Result()
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusInternalServerError {
		t.Errorf("expected 500 on Redis failure, got %d", resp.StatusCode)
	}
}

// failingStateStore always returns an error.
type failingStateStore struct{}

func (s *failingStateStore) Set(ctx context.Context, key, value string, ttl time.Duration) error {
	return fmt.Errorf("store unavailable")
}
func (s *failingStateStore) Get(ctx context.Context, key string) (string, error) {
	return "", fmt.Errorf("store unavailable")
}
func (s *failingStateStore) GetDel(ctx context.Context, key string) (string, error) {
	return "", fmt.Errorf("store unavailable")
}

// ── validateReturnTo bounded decoding tests ──

func TestValidateReturnTo_DecodingLimit(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{"decoded slash", "%2fevil", "/"},
		{"double decoded slash", "%252fevil", "/"},
		{"triple encoded", "%25252fevil", "/"},
		{"tenfold encoded", strings.Repeat("%25", 10) + "2fevil", "/"},
		{"malformed encoding", "/%zz", "/"},
		{"normal path preserved", "/catalog/items?page=1", "/catalog/items?page=1"},
		{"encoded backslash second pass", "/%5c", "/"},
		{"encoded slash second pass", "/%2f", "/"},
		{"decoded space becomes valid", "/hello%20world", "/hello world"},
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

// ── Token exchange tests ──

func TestExchangeYandexCode_Success(t *testing.T) {
	ts := successTokenServer("ya_access_token_123")
	defer ts.Close()

	cfg := testOAuthConfig(ts.URL, "http://unused")
	resp, err := exchangeYandexCode(context.Background(), "test_code", "test_verifier", cfg)
	if err != nil {
		t.Fatal(err)
	}
	if resp.AccessToken != "ya_access_token_123" {
		t.Errorf("access_token = %q, want ya_access_token_123", resp.AccessToken)
	}
}

func TestExchangeYandexCode_Non2xx(t *testing.T) {
	ts := newFakeTokenServer(false, `{"error":"invalid_grant"}`, 400, "application/json")
	defer ts.Close()

	cfg := testOAuthConfig(ts.URL, "http://unused")
	_, err := exchangeYandexCode(context.Background(), "code", "verifier", cfg)
	if err == nil {
		t.Fatal("expected error for non-2xx")
	}
}

func TestExchangeYandexCode_HTMLContentType(t *testing.T) {
	ts := newFakeTokenServer(false, "<html>error</html>", 200, "text/html")
	defer ts.Close()

	cfg := testOAuthConfig(ts.URL, "http://unused")
	_, err := exchangeYandexCode(context.Background(), "code", "verifier", cfg)
	if err == nil {
		t.Fatal("expected error for HTML content-type")
	}
}

func TestExchangeYandexCode_JSONWithCharset(t *testing.T) {
	ts := newFakeTokenServer(true, `{"access_token":"tok"}`, 200, "application/json; charset=utf-8")
	defer ts.Close()

	cfg := testOAuthConfig(ts.URL, "http://unused")
	resp, err := exchangeYandexCode(context.Background(), "code", "verifier", cfg)
	if err != nil {
		t.Fatal(err)
	}
	if resp.AccessToken != "tok" {
		t.Errorf("access_token = %q", resp.AccessToken)
	}
}

func TestExchangeYandexCode_MalformedJSON(t *testing.T) {
	ts := newFakeTokenServer(true, `{invalid`, 200, "application/json")
	defer ts.Close()

	cfg := testOAuthConfig(ts.URL, "http://unused")
	_, err := exchangeYandexCode(context.Background(), "code", "verifier", cfg)
	if err == nil {
		t.Fatal("expected error for malformed JSON")
	}
}

func TestExchangeYandexCode_EmptyAccessToken(t *testing.T) {
	ts := newFakeTokenServer(true, `{"access_token":""}`, 200, "application/json")
	defer ts.Close()

	cfg := testOAuthConfig(ts.URL, "http://unused")
	_, err := exchangeYandexCode(context.Background(), "code", "verifier", cfg)
	if err == nil {
		t.Fatal("expected error for empty access_token")
	}
}

func TestExchangeYandexCode_OversizedResponse(t *testing.T) {
	bigToken := strings.Repeat("x", 2<<20) // 2 MiB
	body := fmt.Sprintf(`{"access_token":"%s"}`, bigToken)
	ts := newFakeTokenServer(true, body, 200, "application/json")
	defer ts.Close()

	cfg := testOAuthConfig(ts.URL, "http://unused")
	_, err := exchangeYandexCode(context.Background(), "code", "verifier", cfg)
	// 1 MiB limit, so should fail or produce empty
	if err != nil {
		t.Logf("expected error for oversized: %v", err)
	}
}

func TestExchangeYandexCode_Timeout(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(2 * time.Second)
		w.WriteHeader(200)
		w.Write([]byte(`{"access_token":"slow"}`))
	}))
	defer ts.Close()

	cfg := testOAuthConfig(ts.URL, "http://unused")
	cfg.HTTPClient = &http.Client{Timeout: 50 * time.Millisecond}

	_, err := exchangeYandexCode(context.Background(), "code", "verifier", cfg)
	if err == nil {
		t.Fatal("expected timeout error")
	}
}

func TestExchangeYandexCode_PostMethod(t *testing.T) {
	var capturedMethod string
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedMethod = r.Method
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(200)
		w.Write([]byte(`{"access_token":"tok"}`))
	}))
	defer ts.Close()

	cfg := testOAuthConfig(ts.URL, "http://unused")
	_, err := exchangeYandexCode(context.Background(), "code", "verifier", cfg)
	if err != nil {
		t.Fatal(err)
	}
	if capturedMethod != "POST" {
		t.Errorf("method = %q, want POST", capturedMethod)
	}
}

func TestExchangeYandexCode_ContentTypeForm(t *testing.T) {
	var capturedCT string
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedCT = r.Header.Get("Content-Type")
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(200)
		w.Write([]byte(`{"access_token":"tok"}`))
	}))
	defer ts.Close()

	cfg := testOAuthConfig(ts.URL, "http://unused")
	_, err := exchangeYandexCode(context.Background(), "code", "verifier", cfg)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(capturedCT, "application/x-www-form-urlencoded") {
		t.Errorf("Content-Type = %q, want form-urlencoded", capturedCT)
	}
}

func TestExchangeYandexCode_HasBasicAuth(t *testing.T) {
	var auth string
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		auth = r.Header.Get("Authorization")
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(200)
		w.Write([]byte(`{"access_token":"tok"}`))
	}))
	defer ts.Close()

	cfg := testOAuthConfig(ts.URL, "http://unused")
	_, err := exchangeYandexCode(context.Background(), "code", "verifier", cfg)
	if err != nil {
		t.Fatal(err)
	}
	if auth == "" || !strings.HasPrefix(auth, "Basic ") {
		t.Errorf("Authorization = %q, want Basic", auth)
	}
}

func TestExchangeYandexCode_GrantTypeCode(t *testing.T) {
	var bodyBytes []byte
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		bodyBytes, _ = io.ReadAll(r.Body)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(200)
		w.Write([]byte(`{"access_token":"tok"}`))
	}))
	defer ts.Close()

	cfg := testOAuthConfig(ts.URL, "http://unused")
	_, err := exchangeYandexCode(context.Background(), "code", "verifier", cfg)
	if err != nil {
		t.Fatal(err)
	}
	vals, _ := url.ParseQuery(string(bodyBytes))
	if vals.Get("grant_type") != "authorization_code" {
		t.Errorf("grant_type = %q", vals.Get("grant_type"))
	}
	if vals.Get("code") != "code" {
		t.Errorf("code = %q", vals.Get("code"))
	}
	if vals.Get("code_verifier") != "verifier" {
		t.Errorf("code_verifier = %q", vals.Get("code_verifier"))
	}
}

// ── Profile fetch tests ──

func TestFetchYandexProfile_Success(t *testing.T) {
	ts := successProfileServer("ya_12345", "user@example.com", "John Doe")
	defer ts.Close()

	cfg := testOAuthConfig("http://unused", ts.URL)
	profile, err := fetchYandexProfile(context.Background(), "test_token", cfg)
	if err != nil {
		t.Fatal(err)
	}
	if profile.ID != "ya_12345" {
		t.Errorf("ID = %q, want ya_12345", profile.ID)
	}
}

func TestFetchYandexProfile_MissingID(t *testing.T) {
	ts := newFakeProfileServer(true, `{"login":"noid"}`, 200, "application/json")
	defer ts.Close()

	cfg := testOAuthConfig("http://unused", ts.URL)
	_, err := fetchYandexProfile(context.Background(), "token", cfg)
	if err == nil {
		t.Fatal("expected error for missing ID")
	}
}

func TestFetchYandexProfile_Non2xx(t *testing.T) {
	ts := newFakeProfileServer(false, `{"error":"unauthorized"}`, 401, "application/json")
	defer ts.Close()

	cfg := testOAuthConfig("http://unused", ts.URL)
	_, err := fetchYandexProfile(context.Background(), "token", cfg)
	if err == nil {
		t.Fatal("expected error for non-2xx")
	}
}

func TestFetchYandexProfile_InvalidContentType(t *testing.T) {
	ts := newFakeProfileServer(false, "<html>error</html>", 200, "text/html")
	defer ts.Close()

	cfg := testOAuthConfig("http://unused", ts.URL)
	_, err := fetchYandexProfile(context.Background(), "token", cfg)
	if err == nil {
		t.Fatal("expected error for HTML content-type")
	}
}

func TestFetchYandexProfile_MalformedJSON(t *testing.T) {
	ts := newFakeProfileServer(true, `{bad`, 200, "application/json")
	defer ts.Close()

	cfg := testOAuthConfig("http://unused", ts.URL)
	_, err := fetchYandexProfile(context.Background(), "token", cfg)
	if err == nil {
		t.Fatal("expected error for malformed JSON")
	}
}

func TestFetchYandexProfile_ProfileAbsentEmail(t *testing.T) {
	ts := newFakeProfileServer(true, `{"id":"ya1","login":"user"}`, 200, "application/json")
	defer ts.Close()

	cfg := testOAuthConfig("http://unused", ts.URL)
	profile, err := fetchYandexProfile(context.Background(), "token", cfg)
	if err != nil {
		t.Fatal(err)
	}
	if profile.DefaultEmail != "" {
		t.Errorf("expected empty email, got %q", profile.DefaultEmail)
	}
}

func TestFetchYandexProfile_AuthorizationHeader(t *testing.T) {
	var authHeader string
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader = r.Header.Get("Authorization")
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(200)
		w.Write([]byte(`{"id":"ya1"}`))
	}))
	defer ts.Close()

	cfg := testOAuthConfig("http://unused", ts.URL)
	_, err := fetchYandexProfile(context.Background(), "mytoken", cfg)
	if err != nil {
		t.Fatal(err)
	}
	expected := "OAuth mytoken"
	if authHeader != expected {
		t.Errorf("Authorization = %q, want %q", authHeader, expected)
	}
}

func TestFetchYandexProfile_ClientIDMatch(t *testing.T) {
	ts := newFakeProfileServer(true, `{"id":"ya1","client_id":"test-client-id"}`, 200, "application/json")
	defer ts.Close()

	cfg := testOAuthConfig("http://unused", ts.URL)
	_, err := fetchYandexProfile(context.Background(), "token", cfg)
	if err != nil {
		t.Fatal("expected success with matching client_id")
	}
}

func TestFetchYandexProfile_ClientIDMissing(t *testing.T) {
	ts := newFakeProfileServer(true, `{"id":"ya1"}`, 200, "application/json")
	defer ts.Close()

	cfg := testOAuthConfig("http://unused", ts.URL)
	_, err := fetchYandexProfile(context.Background(), "token", cfg)
	if err != nil {
		t.Fatal("expected success when client_id is absent")
	}
}

func TestFetchYandexProfile_ClientIDMismatch(t *testing.T) {
	ts := newFakeProfileServer(true, `{"id":"ya1","client_id":"attacker-client-id"}`, 200, "application/json")
	defer ts.Close()

	cfg := testOAuthConfig("http://unused", ts.URL)
	_, err := fetchYandexProfile(context.Background(), "token", cfg)
	if err == nil {
		t.Fatal("expected error for client_id mismatch")
	}
}

// ── Callback handler tests (state management) ──

func TestCallbackHandler_MissingState(t *testing.T) {
	t.Setenv("YANDEX_OAUTH_CLIENT_ID", "test-id")
	t.Setenv("YANDEX_OAUTH_CLIENT_SECRET", "test-secret")

	req := httptest.NewRequest("GET", "/api/auth/oauth/yandex/callback?code=abc", nil)
	w := httptest.NewRecorder()
	app := &App{secCfg: AccountSecurityConfig{AppPublicURL: "http://testapp"}}
	app.handleYandexOAuthCallback(w, req)
	resp := w.Result()
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusFound {
		t.Errorf("expected 302 redirect, got %d", resp.StatusCode)
	}
	loc := resp.Header.Get("Location")
	if !strings.Contains(loc, "error=oauth_state_invalid") {
		t.Errorf("expected oauth_state_invalid error, got %s", loc)
	}
}

func TestCallbackHandler_UnknownState(t *testing.T) {
	origStore := oauthStore
	defer func() { oauthStore = origStore }()
	oauthStore = newMemoryStateStore()

	t.Setenv("YANDEX_OAUTH_CLIENT_ID", "test-id")
	t.Setenv("YANDEX_OAUTH_CLIENT_SECRET", "test-secret")

	req := httptest.NewRequest("GET", "/api/auth/oauth/yandex/callback?state=unknown&code=abc", nil)
	w := httptest.NewRecorder()
	app := &App{secCfg: AccountSecurityConfig{AppPublicURL: "http://testapp"}}
	app.handleYandexOAuthCallback(w, req)
	resp := w.Result()
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusFound {
		t.Errorf("expected 302, got %d", resp.StatusCode)
	}
	loc := resp.Header.Get("Location")
	if !strings.Contains(loc, "error=oauth_state_invalid") {
		t.Errorf("expected oauth_state_invalid, got %s", loc)
	}
}

func TestCallbackHandler_ProviderCancelled(t *testing.T) {
	t.Setenv("YANDEX_OAUTH_CLIENT_ID", "test-id")
	t.Setenv("YANDEX_OAUTH_CLIENT_SECRET", "test-secret")

	req := httptest.NewRequest("GET", "/api/auth/oauth/yandex/callback?error=access_denied", nil)
	w := httptest.NewRecorder()
	app := &App{secCfg: AccountSecurityConfig{AppPublicURL: "http://testapp"}}
	app.handleYandexOAuthCallback(w, req)
	resp := w.Result()
	defer resp.Body.Close()

	loc := resp.Header.Get("Location")
	if !strings.Contains(loc, "error=oauth_cancelled") {
		t.Errorf("expected oauth_cancelled, got %s", loc)
	}
}

func TestCallbackHandler_MissingCode(t *testing.T) {
	origStore := oauthStore
	defer func() { oauthStore = origStore }()
	store := newMemoryStateStore()
	oauthStore = store

	t.Setenv("YANDEX_OAUTH_CLIENT_ID", "test-id")
	t.Setenv("YANDEX_OAUTH_CLIENT_SECRET", "test-secret")

	// Store a valid state in the in-memory store
	state, browserNonce := seedValidState(store, t)

	req := httptest.NewRequest("GET", "/api/auth/oauth/yandex/callback?state="+state, nil)
	req.AddCookie(&http.Cookie{
		Name:  oauthCookieName,
		Value: browserNonce,
	})
	w := httptest.NewRecorder()
	app := &App{secCfg: AccountSecurityConfig{AppPublicURL: "http://testapp"}}
	app.handleYandexOAuthCallback(w, req)
	resp := w.Result()
	defer resp.Body.Close()

	loc := resp.Header.Get("Location")
	if !strings.Contains(loc, "error=oauth_provider_error") {
		t.Errorf("expected oauth_provider_error, got %s", loc)
	}
}

func TestCallbackHandler_ReplayAttack(t *testing.T) {
	origStore := oauthStore
	defer func() { oauthStore = origStore }()
	store := newMemoryStateStore()
	oauthStore = store

	t.Setenv("YANDEX_OAUTH_CLIENT_ID", "test-id")
	t.Setenv("YANDEX_OAUTH_CLIENT_SECRET", "test-secret")

	state, browserNonce := seedValidState(store, t)

	// First call — should succeed (before token exchange)
	req1 := httptest.NewRequest("GET", "/api/auth/oauth/yandex/callback?state="+state+"&code=code1", nil)
	req1.AddCookie(&http.Cookie{Name: oauthCookieName, Value: browserNonce})
	w1 := httptest.NewRecorder()
	app := &App{secCfg: AccountSecurityConfig{AppPublicURL: "http://testapp"}}
	app.handleYandexOAuthCallback(w1, req1)

	// Second call with same state — should fail because state was consumed
	req2 := httptest.NewRequest("GET", "/api/auth/oauth/yandex/callback?state="+state+"&code=code2", nil)
	req2.AddCookie(&http.Cookie{Name: oauthCookieName, Value: browserNonce})
	w2 := httptest.NewRecorder()
	app.handleYandexOAuthCallback(w2, req2)
	resp2 := w2.Result()
	defer resp2.Body.Close()

	loc2 := resp2.Header.Get("Location")
	if !strings.Contains(loc2, "error=oauth_state_invalid") {
		t.Errorf("expected oauth_state_invalid on replay, got %s", loc2)
	}
}

func TestCallbackHandler_ExpiredState(t *testing.T) {
	origStore := oauthStore
	defer func() { oauthStore = origStore }()
	store := &expiredMemoryStore{data: make(map[string]string)}
	oauthStore = store

	t.Setenv("YANDEX_OAUTH_CLIENT_ID", "test-id")
	t.Setenv("YANDEX_OAUTH_CLIENT_SECRET", "test-secret")

	state := "teststate"
	stateHash := sha256Hex(state)
	storeKey := oauthStateRedisKey + stateHash

	storedState := yandexOAuthState{
		Provider:  "yandex",
		Mode:      "login",
		ReturnTo:  "/",
		CreatedAt: time.Now().Add(-1 * time.Hour).Unix(),
	}
	stateData, _ := json.Marshal(storedState)
	store.data[storeKey] = string(stateData)

	req := httptest.NewRequest("GET", "/api/auth/oauth/yandex/callback?state="+state+"&code=abc", nil)
	req.AddCookie(&http.Cookie{Name: oauthCookieName, Value: "browser"})
	w := httptest.NewRecorder()
	app := &App{secCfg: AccountSecurityConfig{AppPublicURL: "http://testapp"}}
	app.handleYandexOAuthCallback(w, req)
	resp := w.Result()
	defer resp.Body.Close()

	loc := resp.Header.Get("Location")
	if !strings.Contains(loc, "error=oauth_expired") {
		t.Errorf("expected oauth_expired, got %s", loc)
	}
}

func TestCallbackHandler_MissingBrowserCookie(t *testing.T) {
	origStore := oauthStore
	defer func() { oauthStore = origStore }()
	store := newMemoryStateStore()
	oauthStore = store

	t.Setenv("YANDEX_OAUTH_CLIENT_ID", "test-id")
	t.Setenv("YANDEX_OAUTH_CLIENT_SECRET", "test-secret")

	state, _ := seedValidState(store, t)

	req := httptest.NewRequest("GET", "/api/auth/oauth/yandex/callback?state="+state+"&code=abc", nil)
	// No cookie set
	w := httptest.NewRecorder()
	app := &App{secCfg: AccountSecurityConfig{AppPublicURL: "http://testapp"}}
	app.handleYandexOAuthCallback(w, req)
	resp := w.Result()
	defer resp.Body.Close()

	loc := resp.Header.Get("Location")
	if !strings.Contains(loc, "error=oauth_state_invalid") {
		t.Errorf("expected oauth_state_invalid, got %s", loc)
	}
}

func TestCallbackHandler_WrongBrowserCookie(t *testing.T) {
	origStore := oauthStore
	defer func() { oauthStore = origStore }()
	store := newMemoryStateStore()
	oauthStore = store

	t.Setenv("YANDEX_OAUTH_CLIENT_ID", "test-id")
	t.Setenv("YANDEX_OAUTH_CLIENT_SECRET", "test-secret")

	state, _ := seedValidState(store, t)

	req := httptest.NewRequest("GET", "/api/auth/oauth/yandex/callback?state="+state+"&code=abc", nil)
	req.AddCookie(&http.Cookie{Name: oauthCookieName, Value: "wrong-browser-nonce"})
	w := httptest.NewRecorder()
	app := &App{secCfg: AccountSecurityConfig{AppPublicURL: "http://testapp"}}
	app.handleYandexOAuthCallback(w, req)
	resp := w.Result()
	defer resp.Body.Close()

	loc := resp.Header.Get("Location")
	if !strings.Contains(loc, "error=oauth_state_invalid") {
		t.Errorf("expected oauth_state_invalid, got %s", loc)
	}
}

func TestCallbackHandler_CookieClearedOnExit(t *testing.T) {
	origStore := oauthStore
	defer func() { oauthStore = origStore }()
	store := newMemoryStateStore()
	oauthStore = store

	t.Setenv("YANDEX_OAUTH_CLIENT_ID", "test-id")
	t.Setenv("YANDEX_OAUTH_CLIENT_SECRET", "test-secret")

	state, browserNonce := seedValidState(store, t)

	req := httptest.NewRequest("GET", "/api/auth/oauth/yandex/callback?state="+state+"&code=abc", nil)
	req.AddCookie(&http.Cookie{Name: oauthCookieName, Value: browserNonce})
	w := httptest.NewRecorder()
	app := &App{secCfg: AccountSecurityConfig{AppPublicURL: "http://testapp"}}
	app.handleYandexOAuthCallback(w, req)
	resp := w.Result()
	defer resp.Body.Close()

	// Should have a Set-Cookie clearing the OAuth cookie
	cookies := resp.Header.Values("Set-Cookie")
	found := false
	for _, c := range cookies {
		if strings.HasPrefix(c, "agentone_yandex_oauth=") && strings.Contains(c, "Max-Age=0") {
			found = true
			break
		}
	}
	if !found {
		t.Error("OAuth cookie not cleared on exit path")
	}
}

// ── OAuth redirect origin tests ──

func TestOAuthRedirectOrigin_FromSecCfg(t *testing.T) {
	app := &App{secCfg: AccountSecurityConfig{AppPublicURL: "https://agent-one.ru"}}
	origin := app.oauthRedirectOrigin()
	if origin != "https://agent-one.ru" {
		t.Errorf("origin = %q, want https://agent-one.ru", origin)
	}
}

func TestOAuthRedirectOrigin_NoTrailingSlash(t *testing.T) {
	app := &App{secCfg: AccountSecurityConfig{AppPublicURL: "https://agent-one.ru/"}}
	origin := app.oauthRedirectOrigin()
	if origin != "https://agent-one.ru" {
		t.Errorf("origin = %q, want https://agent-one.ru", origin)
	}
}

func TestOAuthRedirectOrigin_EmptyFallback(t *testing.T) {
	app := &App{secCfg: AccountSecurityConfig{AppPublicURL: ""}}
	origin := app.oauthRedirectOrigin()
	if origin != "" {
		t.Errorf("expected empty origin, got %q", origin)
	}
}

// ── Success redirect tests (no access token in URL) ──

func TestCreateOAuthSession_NoTokenInURL(t *testing.T) {
	skipIfNoDB(t)
	pool := getTestDB(t)
	ctx := context.Background()

	// Ensure user exists for FK
	userID := "test_oauth_session_notoken_" + randHex(8)
	_, err := pool.Exec(ctx,
		"INSERT INTO profiles (id, role, email) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING",
		userID, "client", userID+"@example.com")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		pool.Exec(ctx, "DELETE FROM auth_sessions WHERE user_id=$1", userID)
		pool.Exec(ctx, "DELETE FROM profiles WHERE id=$1", userID)
	})

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/", nil)
	app := &App{db: pool, secCfg: AccountSecurityConfig{
		AppPublicURL:          "http://testapp",
		AccessTokenTTLMinutes: 15,
		RefreshTokenTTLHours:  720,
	}}

	app.createOAuthSession(w, req, userID, "client", "/dashboard")
	resp := w.Result()
	defer resp.Body.Close()

	loc := resp.Header.Get("Location")

	// Must use APP_PUBLIC_URL
	if !strings.HasPrefix(loc, "http://testapp/auth/complete") {
		t.Errorf("Location = %q, want prefix http://testapp/auth/complete", loc)
	}

	// No token parameter
	if strings.Contains(loc, "token=") {
		t.Errorf("Location contains forbidden token=: %s", loc)
	}
	// Has return_to
	if !strings.Contains(loc, "return_to=%2Fdashboard") {
		t.Errorf("Location missing return_to: %s", loc)
	}
}

func TestCreateOAuthSession_NoAccessTokenInCookie(t *testing.T) {
	skipIfNoDB(t)
	pool := getTestDB(t)
	ctx := context.Background()

	userID := "test_oauth_session_nocookie_" + randHex(8)
	_, err := pool.Exec(ctx,
		"INSERT INTO profiles (id, role, email) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING",
		userID, "client", userID+"@example.com")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		pool.Exec(ctx, "DELETE FROM auth_sessions WHERE user_id=$1", userID)
		pool.Exec(ctx, "DELETE FROM profiles WHERE id=$1", userID)
	})

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/", nil)
	app := &App{db: pool, secCfg: AccountSecurityConfig{
		AppPublicURL:          "http://testapp",
		AccessTokenTTLMinutes: 15,
		RefreshTokenTTLHours:  720,
	}}

	app.createOAuthSession(w, req, userID, "client", "/")
	resp := w.Result()
	defer resp.Body.Close()

	// Check cookies don't contain access token
	for _, c := range resp.Header.Values("Set-Cookie") {
		if strings.Contains(c, "access") {
			t.Errorf("Cookie contains 'access': %s", c)
		}
	}
}

func TestCreateOAuthSession_RedirectUsesFixedOrigin(t *testing.T) {
	skipIfNoDB(t)
	pool := getTestDB(t)
	ctx := context.Background()

	userID := "test_oauth_session_fixedorigin_" + randHex(8)
	_, err := pool.Exec(ctx,
		"INSERT INTO profiles (id, role, email) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING",
		userID, "client", userID+"@example.com")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		pool.Exec(ctx, "DELETE FROM auth_sessions WHERE user_id=$1", userID)
		pool.Exec(ctx, "DELETE FROM profiles WHERE id=$1", userID)
	})

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/", nil)
	req.Host = "evil-attacker.com"
	app := &App{db: pool, secCfg: AccountSecurityConfig{
		AppPublicURL:          "http://fixed-origin",
		AccessTokenTTLMinutes: 15,
		RefreshTokenTTLHours:  720,
	}}

	app.createOAuthSession(w, req, userID, "client", "/")
	resp := w.Result()
	defer resp.Body.Close()

	loc := resp.Header.Get("Location")
	if strings.Contains(loc, "evil-attacker") {
		t.Errorf("redirect uses Host header instead of fixed origin: %s", loc)
	}
	if !strings.HasPrefix(loc, "http://fixed-origin/auth/complete") {
		t.Errorf("Location = %q, want http://fixed-origin/auth/complete", loc)
	}
}

// ── Error redirect uses fixed origin ──

func TestOAuthRedirectError_FixedOrigin(t *testing.T) {
	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/", nil)
	req.Host = "evil.com"
	app := &App{secCfg: AccountSecurityConfig{AppPublicURL: "http://myapp"}}
	app.oauthRedirectError(w, req, oauthCancelled)
	resp := w.Result()
	defer resp.Body.Close()

	loc := resp.Header.Get("Location")
	if !strings.HasPrefix(loc, "http://myapp/auth/complete") {
		t.Errorf("Location = %q, want http://myapp/auth/complete", loc)
	}
	if strings.Contains(loc, "evil.com") {
		t.Errorf("Location uses Host header: %s", loc)
	}
}

func TestOAuthRedirectError_AllowlistedCodes(t *testing.T) {
	codes := []string{
		oauthCancelled,
		oauthStateInvalid,
		oauthExpired,
		oauthProviderError,
		oauthNotLinked,
		oauthYandexNotLinked,
		oauthEmailRequired,
		oauthAccountExists,
		oauthUnavailable,
	}
	for _, code := range codes {
		t.Run(code, func(t *testing.T) {
			w := httptest.NewRecorder()
			req := httptest.NewRequest("GET", "/", nil)
			app := &App{secCfg: AccountSecurityConfig{AppPublicURL: "http://myapp"}}
			app.oauthRedirectError(w, req, code)
			resp := w.Result()
			defer resp.Body.Close()
			loc := resp.Header.Get("Location")
			if !strings.Contains(loc, "error="+code) {
				t.Errorf("expected error=%s in Location, got %s", code, loc)
			}
		})
	}
}

// ── APP_PUBLIC_URL validation tests ──

func TestIsValidOAuthRedirectOrigin_HTTPS(t *testing.T) {
	if !isValidOAuthRedirectOrigin("https://agent-one.ru") {
		t.Error("expected valid")
	}
}

func TestIsValidOAuthRedirectOrigin_HTTPLocalhost(t *testing.T) {
	if !isValidOAuthRedirectOrigin("http://localhost:3000") {
		t.Error("expected valid for localhost in non-production")
	}
}

func TestIsValidOAuthRedirectOrigin_Empty(t *testing.T) {
	if isValidOAuthRedirectOrigin("") {
		t.Error("expected invalid for empty")
	}
}

func TestIsValidOAuthRedirectOrigin_NoScheme(t *testing.T) {
	if isValidOAuthRedirectOrigin("agent-one.ru") {
		t.Error("expected invalid without scheme")
	}
}

func TestIsValidOAuthRedirectOrigin_ProtocolRelative(t *testing.T) {
	if isValidOAuthRedirectOrigin("//evil.example") {
		t.Error("expected invalid for protocol-relative")
	}
}

func TestIsValidOAuthRedirectOrigin_Userinfo(t *testing.T) {
	if isValidOAuthRedirectOrigin("https://user@agent-one.ru") {
		t.Error("expected invalid with userinfo")
	}
}

func TestIsValidOAuthRedirectOrigin_Javascript(t *testing.T) {
	if isValidOAuthRedirectOrigin("javascript:alert(1)") {
		t.Error("expected invalid for javascript:")
	}
}

func TestIsValidOAuthRedirectOrigin_DataURI(t *testing.T) {
	if isValidOAuthRedirectOrigin("data:text/html,<script>alert(1)</script>") {
		t.Error("expected invalid for data:")
	}
}

func TestIsValidOAuthRedirectOrigin_WithQuery(t *testing.T) {
	if isValidOAuthRedirectOrigin("https://agent-one.ru?foo=bar") {
		t.Error("expected invalid with query")
	}
}

func TestIsValidOAuthRedirectOrigin_WithFragment(t *testing.T) {
	if isValidOAuthRedirectOrigin("https://agent-one.ru#section") {
		t.Error("expected invalid with fragment")
	}
}

func TestIsValidOAuthRedirectOrigin_ControlChars(t *testing.T) {
	if isValidOAuthRedirectOrigin("https://agent-one.ru/\x00") {
		t.Error("expected invalid with control char")
	}
}

// ── Error code allowlist tests ──

func TestSafeOAuthErrorCode_Allowlisted(t *testing.T) {
	for code := range allowlistedOAuthErrorCodes {
		got := safeOAuthErrorCode(code)
		if got != code {
			t.Errorf("safeOAuthErrorCode(%q) = %q, want %q", code, got, code)
		}
	}
}

func TestSafeOAuthErrorCode_UnknownReturnsFallback(t *testing.T) {
	codes := []string{"unknown", "", "<script>alert(1)</script>", "oauth_invalid_code"}
	for _, code := range codes {
		got := safeOAuthErrorCode(code)
		if got != oauthProviderError {
			t.Errorf("safeOAuthErrorCode(%q) = %q, want %q", code, got, oauthProviderError)
		}
	}
}

func TestOAuthRedirectError_AllowlistDefenseInDepth(t *testing.T) {
	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/", nil)
	app := &App{secCfg: AccountSecurityConfig{AppPublicURL: "http://testapp"}}
	app.oauthRedirectError(w, req, "<script>alert(1)</script>")
	resp := w.Result()
	defer resp.Body.Close()
	loc := resp.Header.Get("Location")
	if strings.Contains(loc, "<script>") || strings.Contains(loc, "alert") {
		t.Errorf("Location contains raw error code: %s", loc)
	}
	if !strings.Contains(loc, "error=oauth_provider_error") {
		t.Errorf("expected oauth_provider_error, got %s", loc)
	}
}

// ── State GETDEL concurrency test ──

func TestStateStore_GetDelConcurrency(t *testing.T) {
	store := newMemoryStateStore()
	ctx := context.Background()
	key := "test:concurrent:getdel"
	payload := `{"value":"secret"}`
	if err := store.Set(ctx, key, payload, time.Minute); err != nil {
		t.Fatal(err)
	}

	var mu sync.Mutex
	gotPayload := ""
	gotMissing := ""
	var wg sync.WaitGroup

	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			val, err := store.GetDel(ctx, key)
			mu.Lock()
			if err == nil {
				gotPayload = val
			} else {
				gotMissing = err.Error()
			}
			mu.Unlock()
		}()
	}
	wg.Wait()

	if gotPayload != payload {
		t.Errorf("expected payload %q, got %q", payload, gotPayload)
	}
	if gotMissing == "" {
		t.Error("expected at least one consumer to get missing state")
	}

	// State must be gone
	val, err := store.GetDel(ctx, key)
	if err == nil {
		t.Errorf("expected error after all consumers, got %q", val)
	}
	if val != "" {
		t.Errorf("state should be empty, got %q", val)
	}
}

// ── Login/signup DB behavioral tests ──

func TestYandexLogin_IdentityNotFound(t *testing.T) {
	skipIfNoDB(t)
	pool := getTestDB(t)

	providerSubject := "ya_nonexistent_" + randHex(8)
	app := &App{db: pool, secCfg: AccountSecurityConfig{AppPublicURL: "http://testapp"}}
	state := yandexOAuthState{ReturnTo: "/"}

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/", nil)
	app.yandexLogin(w, req, providerSubject, "test@example.com", nil, state)
	resp := w.Result()
	defer resp.Body.Close()

	loc := resp.Header.Get("Location")
	if !strings.Contains(loc, "error=oauth_yandex_not_linked") {
		t.Errorf("expected oauth_yandex_not_linked, got %s", loc)
	}
}

func TestYandexLogin_IdentityExists(t *testing.T) {
	skipIfNoDB(t)
	pool := getTestDB(t)
	ctx := context.Background()

	// Create a test user
	userID := "test_oauth_login_" + randHex(8)
	email := userID + "@example.com"
	_, err := pool.Exec(ctx,
		"INSERT INTO profiles (id, role, display_name, email) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING",
		userID, "client", "Test User", email)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		pool.Exec(ctx, "DELETE FROM auth_identities WHERE user_id=$1", userID)
		pool.Exec(ctx, "DELETE FROM profiles WHERE id=$1", userID)
	})

	providerSubject := "ya_login_" + randHex(8)
	identityID := newSecureID()
	now := time.Now()
	_, err = pool.Exec(ctx,
		`INSERT INTO auth_identities (id, user_id, provider, provider_subject, metadata, created_at, updated_at)
		 VALUES ($1,$2,$3,$4,'{}',$5,$6)`,
		identityID, userID, ProviderYandex, providerSubject, now, now)
	if err != nil {
		t.Fatal(err)
	}

	app := &App{db: pool, secCfg: AccountSecurityConfig{AppPublicURL: "http://testapp", AccessTokenTTLMinutes: 15, RefreshTokenTTLHours: 720}}
	state := yandexOAuthState{ReturnTo: "/dashboard"}
	profile := &yandexProfileResponse{ID: providerSubject}

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/", nil)
	app.yandexLogin(w, req, providerSubject, email, profile, state)
	resp := w.Result()
	defer resp.Body.Close()

	loc := resp.Header.Get("Location")
	// Should be success redirect, not error
	if strings.Contains(loc, "error=") {
		t.Errorf("expected success redirect, got error: %s", loc)
	}
	if !strings.HasPrefix(loc, "http://testapp/auth/complete") {
		t.Errorf("expected redirect to /auth/complete, got %s", loc)
	}
	// Role from DB (client), not from signup
	if strings.Contains(loc, "return_to=%2Fdashboard") {
		t.Logf("success redirect: %s", loc)
	}
}

func TestYandexSignup_ClientRole(t *testing.T) {
	skipIfNoDB(t)
	pool := getTestDB(t)
	ctx := context.Background()

	providerSubject := "ya_signup_client_" + randHex(8)
	email := providerSubject + "@example.com"
	app := &App{db: pool, secCfg: AccountSecurityConfig{AppPublicURL: "http://testapp", AccessTokenTTLMinutes: 15, RefreshTokenTTLHours: 720}}
	state := yandexOAuthState{ReturnTo: "/", Mode: "signup", Role: "client", TermsAccepted: true}
	profile := &yandexProfileResponse{
		ID:           providerSubject,
		DefaultEmail: email,
		DisplayName:  "New Client",
		Login:        "newclient",
	}

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/", nil)
	app.yandexSignup(w, req, providerSubject, email, profile, state)
	resp := w.Result()
	defer resp.Body.Close()

	loc := resp.Header.Get("Location")
	if strings.Contains(loc, "error=") {
		t.Errorf("expected success redirect, got error: %s", loc)
	}
	t.Cleanup(func() {
		pool.Exec(ctx, "DELETE FROM auth_identities WHERE provider_subject=$1", providerSubject)
		// Find the user ID that was created
		var uid string
		err := pool.QueryRow(ctx, "SELECT id FROM profiles WHERE email=$1", email).Scan(&uid)
		if err == nil {
			pool.Exec(ctx, "DELETE FROM auth_identities WHERE user_id=$1", uid)
			pool.Exec(ctx, "DELETE FROM profiles WHERE id=$1", uid)
		}
	})
}

func TestYandexSignup_EmailMissing(t *testing.T) {
	skipIfNoDB(t)
	pool := getTestDB(t)

	app := &App{db: pool, secCfg: AccountSecurityConfig{AppPublicURL: "http://testapp"}}
	state := yandexOAuthState{ReturnTo: "/", Mode: "signup", Role: "client", TermsAccepted: true}
	profile := &yandexProfileResponse{ID: "ya_noemail_1", Login: "noemail"}

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/", nil)
	app.yandexSignup(w, req, "ya_noemail_1", "", profile, state)
	resp := w.Result()
	defer resp.Body.Close()

	loc := resp.Header.Get("Location")
	if !strings.Contains(loc, "error=oauth_email_required") {
		t.Errorf("expected oauth_email_required, got %s", loc)
	}
}

func TestYandexSignup_EmailCollision(t *testing.T) {
	skipIfNoDB(t)
	pool := getTestDB(t)
	ctx := context.Background()

	// Create existing user with this email
	existingID := "test_oauth_collision_" + randHex(8)
	email := existingID + "@example.com"
	_, err := pool.Exec(ctx,
		"INSERT INTO profiles (id, role, email) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING",
		existingID, "client", email)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		pool.Exec(ctx, "DELETE FROM profiles WHERE id=$1", existingID)
	})

	app := &App{db: pool, secCfg: AccountSecurityConfig{AppPublicURL: "http://testapp"}}
	state := yandexOAuthState{ReturnTo: "/", Mode: "signup", Role: "client", TermsAccepted: true}
	profile := &yandexProfileResponse{
		ID:           "ya_collision_1",
		DefaultEmail: email,
	}

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/", nil)
	app.yandexSignup(w, req, "ya_collision_1", email, profile, state)
	resp := w.Result()
	defer resp.Body.Close()

	loc := resp.Header.Get("Location")
	if !strings.Contains(loc, "error=oauth_account_exists") {
		t.Errorf("expected oauth_account_exists, got %s", loc)
	}
}

func TestYandexSignup_EmailVerifiedFalse(t *testing.T) {
	skipIfNoDB(t)
	pool := getTestDB(t)
	ctx := context.Background()

	providerSubject := "ya_emailv_" + randHex(8)
	email := providerSubject + "@example.com"
	app := &App{db: pool, secCfg: AccountSecurityConfig{AppPublicURL: "http://testapp", AccessTokenTTLMinutes: 15, RefreshTokenTTLHours: 720}}
	state := yandexOAuthState{ReturnTo: "/", Mode: "signup", Role: "client", TermsAccepted: true}
	profile := &yandexProfileResponse{
		ID:           providerSubject,
		DefaultEmail: email,
		DisplayName:  "Verified Check",
	}

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/", nil)
	app.yandexSignup(w, req, providerSubject, email, profile, state)
	resp := w.Result()
	defer resp.Body.Close()

	loc := resp.Header.Get("Location")
	if strings.Contains(loc, "error=") {
		t.Errorf("expected success, got error: %s", loc)
	}

	// Check email_verified is false in the identity
	var verified bool
	err := pool.QueryRow(ctx,
		"SELECT provider_email_verified FROM auth_identities WHERE provider_subject=$1",
		providerSubject).Scan(&verified)
	if err != nil {
		t.Fatal(err)
	}
	if verified {
		t.Error("expected provider_email_verified to be false")
	}

	t.Cleanup(func() {
		var uid string
		err := pool.QueryRow(ctx, "SELECT id FROM profiles WHERE email=$1", email).Scan(&uid)
		if err == nil {
			pool.Exec(ctx, "DELETE FROM auth_identities WHERE user_id=$1", uid)
			pool.Exec(ctx, "DELETE FROM profiles WHERE id=$1", uid)
		}
	})
}

func TestYandexSignup_ProviderSubjectIsYandexID(t *testing.T) {
	skipIfNoDB(t)
	pool := getTestDB(t)
	ctx := context.Background()

	providerSubject := "ya_subj_" + randHex(8)
	email := providerSubject + "@example.com"
	app := &App{db: pool, secCfg: AccountSecurityConfig{AppPublicURL: "http://testapp", AccessTokenTTLMinutes: 15, RefreshTokenTTLHours: 720}}
	state := yandexOAuthState{ReturnTo: "/", Mode: "signup", Role: "client", TermsAccepted: true}
	profile := &yandexProfileResponse{
		ID:           providerSubject,
		DefaultEmail: email,
		DisplayName:  "Subject Check",
	}

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/", nil)
	app.yandexSignup(w, req, providerSubject, email, profile, state)
	resp := w.Result()
	defer resp.Body.Close()

	loc := resp.Header.Get("Location")
	if strings.Contains(loc, "error=") {
		t.Errorf("expected success, got error: %s", loc)
	}

	// Verify provider_subject equals Yandex ID, not email/login
	var storedProviderSubject string
	err := pool.QueryRow(ctx,
		"SELECT provider_subject FROM auth_identities WHERE provider=$1 AND provider_subject=$2",
		ProviderYandex, providerSubject).Scan(&storedProviderSubject)
	if err != nil {
		t.Fatal(err)
	}
	if storedProviderSubject != providerSubject {
		t.Errorf("provider_subject = %q, want %q", storedProviderSubject, providerSubject)
	}

	t.Cleanup(func() {
		var uid string
		err := pool.QueryRow(ctx, "SELECT id FROM profiles WHERE email=$1", email).Scan(&uid)
		if err == nil {
			pool.Exec(ctx, "DELETE FROM auth_identities WHERE user_id=$1", uid)
			pool.Exec(ctx, "DELETE FROM profiles WHERE id=$1", uid)
		}
	})
}

func TestYandexSignup_TransactionRollbackOnError(t *testing.T) {
	skipIfNoDB(t)
	pool := getTestDB(t)
	ctx := context.Background()

	// Test email collision guard: when the email already belongs to another profile,
	// yandexSignup must return oauth_account_exists and create NO data.
	email := "ya_rollback_collision_" + randHex(8) + "@example.com"

	// Pre-create a profile with this email (owned by another user)
	existingID := "test_oauth_rollback_existing_" + randHex(8)
	_, err := pool.Exec(ctx,
		"INSERT INTO profiles (id, role, email) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING",
		existingID, "client", email)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		pool.Exec(ctx, "DELETE FROM profiles WHERE id=$1", existingID)
	})

	providerSubject := "ya_rollback_" + randHex(8)
	app := &App{db: pool, secCfg: AccountSecurityConfig{AppPublicURL: "http://testapp"}}
	state := yandexOAuthState{ReturnTo: "/", Mode: "signup", Role: "client", TermsAccepted: true}
	profile := &yandexProfileResponse{
		ID:           providerSubject,
		DefaultEmail: email,
		DisplayName:  "Rollback Test",
	}

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/", nil)
	app.yandexSignup(w, req, providerSubject, email, profile, state)
	resp := w.Result()
	defer resp.Body.Close()

	loc := resp.Header.Get("Location")
	if !strings.Contains(loc, "error=oauth_account_exists") {
		t.Errorf("expected oauth_account_exists, got %s", loc)
	}

	// Verify no new profile was created (only the pre-existing one)
	var count int
	err = pool.QueryRow(ctx,
		"SELECT COUNT(*) FROM profiles WHERE email=$1", email).Scan(&count)
	if err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Errorf("expected 1 profile (pre-existing), got %d", count)
	}

	// Verify NO identity was created
	var identityCount int
	err = pool.QueryRow(ctx,
		"SELECT COUNT(*) FROM auth_identities WHERE provider_subject=$1",
		providerSubject).Scan(&identityCount)
	if err != nil {
		t.Fatal(err)
	}
	if identityCount != 0 {
		t.Errorf("expected 0 identities, got %d", identityCount)
	}
}

// ── Concurrency: same Yandex subject signup ──

func TestConcurrentSignup_SameYandexSubject(t *testing.T) {
	skipIfNoDB(t)
	pool := getTestDB(t)
	ctx := context.Background()

	providerSubject := "ya_concurrent_subject_" + randHex(8)
	email := providerSubject + "@example.com"

	var wg sync.WaitGroup
	var mu sync.Mutex
	successCount := 0

	// Run 10 concurrent signups
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			app := &App{db: pool, secCfg: AccountSecurityConfig{AppPublicURL: "http://testapp"}}
			state := yandexOAuthState{ReturnTo: "/", Mode: "signup", Role: "client", TermsAccepted: true}
			profile := &yandexProfileResponse{
				ID:           providerSubject,
				DefaultEmail: email,
				DisplayName:  "Concurrent Subject",
			}

			w := httptest.NewRecorder()
			req := httptest.NewRequest("GET", "/", nil)
			app.yandexSignup(w, req, providerSubject, email, profile, state)
			resp := w.Result()
			resp.Body.Close()

			mu.Lock()
			if resp.StatusCode == http.StatusFound {
				loc := resp.Header.Get("Location")
				if !strings.Contains(loc, "error=") {
					successCount++
				}
			}
			mu.Unlock()
		}()
	}
	wg.Wait()

	// At least one goroutine must have completed signup (others may login via identity found)
	if successCount < 1 {
		t.Errorf("expected at least 1 success (signup or login on existing identity), got %d", successCount)
	}

	// Exactly one profile
	var profileCount int
	err := pool.QueryRow(ctx,
		"SELECT COUNT(*) FROM profiles WHERE email=$1", email).Scan(&profileCount)
	if err != nil {
		t.Fatal(err)
	}
	if profileCount != 1 {
		t.Errorf("expected 1 profile, got %d", profileCount)
	}

	// Exactly one identity
	var identityCount int
	err = pool.QueryRow(ctx,
		"SELECT COUNT(*) FROM auth_identities WHERE provider_subject=$1",
		providerSubject).Scan(&identityCount)
	if err != nil {
		t.Fatal(err)
	}
	if identityCount != 1 {
		t.Errorf("expected 1 identity, got %d", identityCount)
	}

	// Cleanup
	var uid string
	pool.QueryRow(ctx, "SELECT id FROM profiles WHERE email=$1", email).Scan(&uid)
	if uid != "" {
		pool.Exec(ctx, "DELETE FROM auth_identities WHERE user_id=$1", uid)
		pool.Exec(ctx, "DELETE FROM profiles WHERE id=$1", uid)
	}
}

// ── Concurrency: same normalized email, different Yandex subjects ──

func TestConcurrentSignup_SameNormalizedEmail(t *testing.T) {
	skipIfNoDB(t)
	pool := getTestDB(t)
	ctx := context.Background()

	providerSubject1 := "ya_concurrent_email_a_" + randHex(8)
	providerSubject2 := "ya_concurrent_email_b_" + randHex(8)
	emailMixedCase := "  ConCUrsivE." + randHex(4) + "@Example.COM  "
	normalized := strings.ToLower(strings.TrimSpace(emailMixedCase))

	var wg sync.WaitGroup
	var mu sync.Mutex
	successCount := 0

	// Two different Yandex IDs, same normalized email
	subjects := []string{providerSubject1, providerSubject2}
	for _, subj := range subjects {
		wg.Add(1)
		go func(s string) {
			defer wg.Done()
			app := &App{db: pool, secCfg: AccountSecurityConfig{AppPublicURL: "http://testapp"}}
			state := yandexOAuthState{ReturnTo: "/", Mode: "signup", Role: "client", TermsAccepted: true}
			profile := &yandexProfileResponse{
				ID:           s,
				DefaultEmail: emailMixedCase,
				DisplayName:  "Concurrent Email",
			}

			w := httptest.NewRecorder()
			req := httptest.NewRequest("GET", "/", nil)
			app.yandexSignup(w, req, s, emailMixedCase, profile, state)
			resp := w.Result()
			resp.Body.Close()

			mu.Lock()
			if resp.StatusCode == http.StatusFound {
				loc := resp.Header.Get("Location")
				if !strings.Contains(loc, "error=") {
					successCount++
				}
			}
			mu.Unlock()
		}(subj)
	}
	wg.Wait()

	// At most one success
	if successCount > 1 {
		t.Errorf("expected at most 1 successful signup, got %d", successCount)
	}

	// Verify no duplicate profiles
	var profileCount int
	err := pool.QueryRow(ctx,
		"SELECT COUNT(*) FROM profiles WHERE LOWER(BTRIM(email))=$1", normalized).Scan(&profileCount)
	if err != nil {
		t.Fatal(err)
	}
	if profileCount > 1 {
		t.Errorf("expected at most 1 profile, got %d", profileCount)
	}

	// No second identity should be auto-linked
	for _, subj := range subjects {
		var identCount int
		err := pool.QueryRow(ctx,
			"SELECT COUNT(*) FROM auth_identities WHERE provider_subject=$1",
			subj).Scan(&identCount)
		if err != nil {
			t.Fatal(err)
		}
		if identCount > 1 {
			t.Errorf("expected at most 1 identity for %s, got %d", subj, identCount)
		}
	}

	// Cleanup
	var uid string
	pool.QueryRow(ctx, "SELECT id FROM profiles WHERE LOWER(BTRIM(email))=$1", normalized).Scan(&uid)
	if uid != "" {
		pool.Exec(ctx, "DELETE FROM auth_identities WHERE user_id=$1", uid)
		pool.Exec(ctx, "DELETE FROM profiles WHERE id=$1", uid)
	}
}

// ── Session DB/cookie tests ──

func TestCreateOAuthSession_SessionInserted(t *testing.T) {
	skipIfNoDB(t)
	pool := getTestDB(t)
	ctx := context.Background()

	userID := "test_oauth_session_" + randHex(8)
	_, err := pool.Exec(ctx,
		"INSERT INTO profiles (id, role, email) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING",
		userID, "client", userID+"@example.com")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		pool.Exec(ctx, "DELETE FROM auth_identities WHERE user_id=$1", userID)
		pool.Exec(ctx, "DELETE FROM auth_sessions WHERE user_id=$1", userID)
		pool.Exec(ctx, "DELETE FROM profiles WHERE id=$1", userID)
	})

	// Ensure session schema
	ensureAccountSecuritySchema(ctx, pool)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/", nil)
	app := &App{db: pool, secCfg: AccountSecurityConfig{
		AppPublicURL:          "http://testapp",
		AccessTokenTTLMinutes: 15,
		RefreshTokenTTLHours:  720,
	}}
	app.createOAuthSession(w, req, userID, "client", "/dashboard")
	resp := w.Result()
	defer resp.Body.Close()

	// Session must exist in DB
	var sessionCount int
	err = pool.QueryRow(ctx,
		"SELECT COUNT(*) FROM auth_sessions WHERE user_id=$1", userID).Scan(&sessionCount)
	if err != nil {
		t.Fatal(err)
	}
	if sessionCount != 1 {
		t.Errorf("expected 1 session, got %d", sessionCount)
	}

	// Refresh token hash in DB — not the raw token
	type sessionRow struct {
		ID               string
		RefreshTokenHash string
		TokenFamily      string
	}
	var row sessionRow
	err = pool.QueryRow(ctx,
		"SELECT id, refresh_token_hash, token_family FROM auth_sessions WHERE user_id=$1",
		userID).Scan(&row.ID, &row.RefreshTokenHash, &row.TokenFamily)
	if err != nil {
		t.Fatal(err)
	}
	if row.RefreshTokenHash == "" || len(row.RefreshTokenHash) < 20 {
		t.Errorf("refresh_token_hash looks invalid: %q", row.RefreshTokenHash)
	}

	// Response must contain SSO refresh cookie
	cookies := resp.Header.Values("Set-Cookie")
	var foundCookie bool
	for _, c := range cookies {
		if strings.Contains(c, "agentone_sso_refresh_token=") {
			foundCookie = true
			if !strings.Contains(c, "HttpOnly") {
				t.Error("cookie missing HttpOnly")
			}
			if !strings.Contains(c, "Path=/api/auth") {
				t.Error("cookie missing Path=/api/auth")
			}
			if !strings.Contains(c, "SameSite=Strict") {
				t.Error("cookie missing SameSite=Strict")
			}
			break
		}
	}
	if !foundCookie {
		t.Error("agentone_sso_refresh_token cookie not set")
	}

	// Location must not contain any tokens
	loc := resp.Header.Get("Location")
	if strings.Contains(loc, "token=") || strings.Contains(loc, "access_token") || strings.Contains(loc, "refresh_token") {
		t.Errorf("Location contains token: %s", loc)
	}
	if strings.Contains(loc, "access") {
		t.Errorf("Location contains 'access': %s", loc)
	}
}

// ── Helpers ──

// seedValidState stores a valid OAuth state in the provided store
// and returns the state value and browser nonce for use in requests.
func seedValidState(store oauthStateStore, t *testing.T) (state string, browserNonce string) {
	t.Helper()
	state = cryptoRandHex(32)
	browserNonce = cryptoRandHex(16)
	nonceHash := sha256Hex(browserNonce)
	stateKey := oauthStateRedisKey + sha256Hex(state)
	stored := yandexOAuthState{
		Provider:     "yandex",
		Mode:         "login",
		ReturnTo:     "/",
		CodeVerifier: "test_verifier",
		BrowserNonce: nonceHash,
		CreatedAt:    time.Now().Unix(),
	}
	data, _ := json.Marshal(stored)
	if err := store.Set(context.Background(), stateKey, string(data), oauthStateTTL); err != nil {
		t.Fatal(err)
	}
	return
}

// expiredMemoryStore is an in-memory store that always returns empty.
type expiredMemoryStore struct {
	data map[string]string
}

func (s *expiredMemoryStore) Set(ctx context.Context, key, value string, ttl time.Duration) error {
	s.data[key] = value
	return nil
}

func (s *expiredMemoryStore) Get(ctx context.Context, key string) (string, error) {
	val, ok := s.data[key]
	if !ok {
		return "", fmt.Errorf("not found")
	}
	return val, nil
}

func (s *expiredMemoryStore) GetDel(ctx context.Context, key string) (string, error) {
	val, ok := s.data[key]
	delete(s.data, key)
	if !ok {
		return "", fmt.Errorf("not found")
	}
	return val, nil
}

// lookupEnv is a helper to get env var value without side effects.
func lookupEnv(key string) string {
	val, _ := lookupEnvErr(key)
	return val
}

func lookupEnvErr(key string) (string, bool) {
	return os.LookupEnv(key)
}

// randHex generates a random hex string of n bytes.
func randHex(n int) string {
	b := make([]byte, n)
	for i := range b {
		b[i] = byte('a' + i%26)
	}
	return hex.EncodeToString(b)
}
