package main

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

// ── OAuth helpers ──

const (
	oauthStateTTL           = 10 * time.Minute
	oauthCookieName         = "agentone_yandex_oauth"
	oauthCookiePath         = "/api/auth/oauth/yandex"
	oauthStateRedisKey      = "oauth:yandex:state:"
	oauthDefaultRedirectURI = "http://localhost:8080/api/auth/oauth/yandex/callback"
	yandexAuthorizeURL      = "https://oauth.yandex.ru/authorize"
	yandexTokenURL          = "https://oauth.yandex.ru/token"
	yandexProfileURL        = "https://login.yandex.ru/info?format=json"
)

// maxReturnToDecode is the maximum number of sequential URL-decode passes
// in validateReturnTo. Prevents stack exhaustion.
const maxReturnToDecode = 2

// validateReturnTo validates a return_to URL is a safe internal path.
// Only absolute paths starting with / are allowed.
// All dangerous patterns are rejected and replaced with "/".
// Uses bounded recursion: at most maxReturnToDecode sequential decode passes.
func validateReturnTo(returnTo string) string {
	if returnTo == "" {
		return "/"
	}
	return validateReturnToDepth(returnTo, 0)
}

func validateReturnToDepth(returnTo string, depth int) string {
	if depth > maxReturnToDecode {
		return "/"
	}

	// Must start with /
	if returnTo[0] != '/' {
		return "/"
	}

	// Protocol-relative and double slash
	if len(returnTo) >= 2 && returnTo[0] == '/' && returnTo[1] == '/' {
		return "/"
	}

	// Reject backslash and encoded backslash
	if strings.Contains(returnTo, "\\") || strings.Contains(strings.ToLower(returnTo), "%5c") {
		return "/"
	}

	// Reject control characters and CR/LF
	for _, r := range returnTo {
		if r < 0x20 || r == 0x7f {
			return "/"
		}
	}

	// Reject if contains protocol schemes
	lower := strings.ToLower(returnTo)
	if strings.Contains(lower, "javascript:") || strings.Contains(lower, "data:") || strings.Contains(lower, "vbscript:") {
		return "/"
	}

	// Reject if contains CRLF encoded
	if strings.Contains(lower, "%0d") || strings.Contains(lower, "%0a") || strings.Contains(lower, "%0d%0a") {
		return "/"
	}

	// Reject if contains @ (userinfo)
	if strings.Contains(returnTo, "@") {
		return "/"
	}

	// Reject if looks like an absolute URL with host
	if strings.HasPrefix(lower, "http://") || strings.HasPrefix(lower, "https://") {
		return "/"
	}

	// Attempt to decode once and check for remaining encoded chars
	decoded, err := url.QueryUnescape(returnTo)
	if err != nil {
		return "/"
	}
	if decoded != returnTo {
		return validateReturnToDepth(decoded, depth+1)
	}

	return returnTo
}

// ── Crypto helpers ──

func cryptoRandHex(n int) string {
	b := make([]byte, n)
	rand.Read(b)
	return hex.EncodeToString(b)
}

func cryptoRandBase64(n int) string {
	b := make([]byte, n)
	rand.Read(b)
	return base64.RawURLEncoding.EncodeToString(b)
}

// sha256Hex returns hex-encoded SHA-256 hash.
func sha256Hex(s string) string {
	h := sha256.Sum256([]byte(s))
	return hex.EncodeToString(h[:])
}

// pkceChallengeS256 creates PKCE code challenge from verifier using S256.
func pkceChallengeS256(verifier string) string {
	h := sha256.Sum256([]byte(verifier))
	return base64.RawURLEncoding.EncodeToString(h[:])
}

// ── OAuth state store ──

// oauthStateStore is the interface for storing and atomically consuming
// OAuth state. Production uses Redis; tests can use in-memory store.
// Get reads a state without consuming it; GetDel atomically reads and
// deletes it (single use).
type oauthStateStore interface {
	Set(ctx context.Context, key, value string, ttl time.Duration) error
	Get(ctx context.Context, key string) (string, error)
	GetDel(ctx context.Context, key string) (string, error)
}

// redisOAuthStateStore implements oauthStateStore using the global Redis client.
type redisOAuthStateStore struct{}

func (s *redisOAuthStateStore) Set(ctx context.Context, key, value string, ttl time.Duration) error {
	if rdb == nil || !rdbHealthy.Load() {
		return errors.New("redis unavailable")
	}
	return rdb.Set(ctx, key, value, ttl).Err()
}

func (s *redisOAuthStateStore) Get(ctx context.Context, key string) (string, error) {
	if rdb == nil || !rdbHealthy.Load() {
		return "", errors.New("redis unavailable")
	}
	return rdb.Get(ctx, key).Result()
}

func (s *redisOAuthStateStore) GetDel(ctx context.Context, key string) (string, error) {
	if rdb == nil || !rdbHealthy.Load() {
		return "", errors.New("redis unavailable")
	}
	return rdb.GetDel(ctx, key).Result()
}

// oauthStore is the package-level state store. Override in tests.
var oauthStore oauthStateStore = &redisOAuthStateStore{}

// yandexOAuthState — data stored in Redis for state validation.
type yandexOAuthState struct {
	Provider      string `json:"provider"`
	Mode          string `json:"mode"`
	Role          string `json:"role,omitempty"`
	TermsAccepted bool   `json:"termsAccepted,omitempty"`
	ReturnTo      string `json:"returnTo"`
	CodeVerifier  string `json:"codeVerifier"`
	BrowserNonce  string `json:"browserNonce"`
	CreatedAt     int64  `json:"createdAt"`
}

// oauthConfig returns Yandex OAuth client configuration.
type yandexOAuthConfig struct {
	ClientID         string
	ClientSecret     string
	RedirectURI      string
	Enabled          bool
	HTTPClient       *http.Client
	AuthorizationURL string
	TokenURL         string
	ProfileURL       string
}

// test-only overrides for Yandex token/profile endpoints.
// Production configuration always uses the real Yandex URLs.
var oauthTokenURLOverride, oauthProfileURLOverride string

func loadYandexOAuthConfig() yandexOAuthConfig {
	clientID := os.Getenv("YANDEX_OAUTH_CLIENT_ID")
	clientSecret := os.Getenv("YANDEX_OAUTH_CLIENT_SECRET")
	redirectURI := os.Getenv("YANDEX_OAUTH_REDIRECT_URI")
	if redirectURI == "" {
		redirectURI = oauthDefaultRedirectURI
	}
	enabled := clientID != "" && clientSecret != ""
	tokenURL := yandexTokenURL
	if oauthTokenURLOverride != "" {
		tokenURL = oauthTokenURLOverride
	}
	profileURL := yandexProfileURL
	if oauthProfileURLOverride != "" {
		profileURL = oauthProfileURLOverride
	}
	return yandexOAuthConfig{
		ClientID:         clientID,
		ClientSecret:     clientSecret,
		RedirectURI:      redirectURI,
		Enabled:          enabled,
		HTTPClient:       &http.Client{Timeout: 10 * time.Second},
		AuthorizationURL: yandexAuthorizeURL,
		TokenURL:         tokenURL,
		ProfileURL:       profileURL,
	}
}

// oauthRedirectOrigin returns the base URL for OAuth redirects.
// Uses AppPublicURL from security config. Falls back to APP_PUBLIC_URL env var
// for standalone mode. Returns empty string if unavailable.
func (a *App) oauthRedirectOrigin() string {
	u := a.secCfg.AppPublicURL
	if u == "" {
		u = os.Getenv("APP_PUBLIC_URL")
	}
	if !isValidOAuthRedirectOrigin(u) {
		return ""
	}
	return strings.TrimRight(u, "/")
}

// isValidOAuthRedirectOrigin validates that the origin is a safe absolute URL.
func isValidOAuthRedirectOrigin(origin string) bool {
	if origin == "" {
		return false
	}
	// Must be absolute with scheme
	if !strings.HasPrefix(origin, "http://") && !strings.HasPrefix(origin, "https://") {
		return false
	}
	// Reject protocol-relative
	if strings.HasPrefix(origin, "//") {
		return false
	}
	// Reject userinfo
	if strings.Contains(origin, "@") {
		return false
	}
	// Reject javascript:/data:/file: schemes
	lower := strings.ToLower(origin)
	if strings.HasPrefix(lower, "javascript:") || strings.HasPrefix(lower, "data:") || strings.HasPrefix(lower, "file:") || strings.HasPrefix(lower, "vbscript:") {
		return false
	}
	// Reject control characters
	for _, r := range origin {
		if r < 0x20 || r == 0x7f {
			return false
		}
	}
	u, err := url.Parse(origin)
	if err != nil {
		return false
	}
	// Must have host
	if u.Host == "" {
		return false
	}
	// No userinfo
	if u.User != nil {
		return false
	}
	// No fragment
	if u.Fragment != "" {
		return false
	}
	// No query (origin is just scheme+host+port)
	if u.RawQuery != "" {
		return false
	}
	// In production, must use https
	if isProduction() && u.Scheme != "https" {
		return false
	}
	return true
}

// ── Handlers ──

func yandexProvidersHandler(w http.ResponseWriter, r *http.Request) {
	cfg := loadYandexOAuthConfig()

	jsonOK(w, map[string]interface{}{
		"providers": []map[string]interface{}{
			{
				"id":      "yandex",
				"name":    "Yandex ID",
				"enabled": cfg.Enabled,
			},
		},
	})
}

func (a *App) handleYandexOAuthStart(w http.ResponseWriter, r *http.Request) {
	cfg := loadYandexOAuthConfig()
	if !cfg.Enabled {
		jsonErr(w, http.StatusServiceUnavailable, oauthUnavailable)
		return
	}
	if a.oauthRedirectOrigin() == "" {
		// Invalid or missing APP_PUBLIC_URL — Yandex OAuth cannot redirect.
		jsonErr(w, http.StatusServiceUnavailable, oauthUnavailable)
		return
	}

	mode := r.URL.Query().Get("mode")
	role := r.URL.Query().Get("role")
	termsAccepted := r.URL.Query().Get("terms_accepted")
	pdConsent := r.URL.Query().Get("pd_consent")
	returnTo := r.URL.Query().Get("return_to")

	// Validate the auth intent before any redirect. Unknown or missing
	// mode is rejected here — the provider is never involved.
	intent, err := parseAuthIntent(mode)
	if err != nil {
		jsonErr(w, http.StatusBadRequest, "invalid mode: must be login or signup")
		return
	}

	// For signup mode, role and legal consent are required.
	if intent == AuthIntentSignup {
		if !validSignupRole(role) {
			jsonErr(w, http.StatusBadRequest, "invalid role: must be client or business")
			return
		}
		// Legal consent is mandatory for signup. Only the exact string
		// "true" is accepted — "1", "yes", "TRUE" are rejected.
		if termsAccepted != "true" {
			jsonErr(w, http.StatusBadRequest, "terms acceptance required")
			return
		}
		if pdConsent != "true" {
			jsonErr(w, http.StatusBadRequest, "personal data consent required")
			return
		}
	}

	// Validate return_to server-side
	safeReturnTo := validateReturnTo(returnTo)

	// Generate cryptographically random state and PKCE
	state := cryptoRandHex(32)
	pkceVerifier := cryptoRandBase64(32)
	pkceChallenge := pkceChallengeS256(pkceVerifier)
	browserNonce := cryptoRandHex(16)
	browserNonceHash := sha256Hex(browserNonce)

	// Store state in the state store (Redis in production)
	storedState := yandexOAuthState{
		Provider:      "yandex",
		Mode:          intent.String(),
		Role:          role,
		TermsAccepted: intent == AuthIntentSignup && termsAccepted == "true",
		ReturnTo:      safeReturnTo,
		CodeVerifier:  pkceVerifier,
		BrowserNonce:  browserNonceHash,
		CreatedAt:     time.Now().Unix(),
	}
	stateData, _ := json.Marshal(storedState)
	stateKey := oauthStateRedisKey + sha256Hex(state)

	if err := oauthStore.Set(r.Context(), stateKey, string(stateData), oauthStateTTL); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	// Set temporary browser correlation cookie
	http.SetCookie(w, &http.Cookie{
		Name:     oauthCookieName,
		Value:    browserNonce,
		Path:     oauthCookiePath,
		HttpOnly: true,
		Secure:   isProduction(),
		SameSite: http.SameSiteLaxMode,
		MaxAge:   int(oauthStateTTL.Seconds()),
	})

	// Build Yandex authorization URL
	authURL := fmt.Sprintf("%s?response_type=code&client_id=%s&redirect_uri=%s&state=%s&code_challenge=%s&code_challenge_method=S256",
		cfg.AuthorizationURL,
		url.QueryEscape(cfg.ClientID),
		url.QueryEscape(cfg.RedirectURI),
		url.QueryEscape(state),
		url.QueryEscape(pkceChallenge))

	http.Redirect(w, r, authURL, http.StatusFound)
}

// ── Token exchange and profile ──

type yandexTokenResponse struct {
	AccessToken  string `json:"access_token"`
	ExpiresIn    int    `json:"expires_in"`
	RefreshToken string `json:"refresh_token"`
	TokenType    string `json:"token_type"`
}

type yandexProfileResponse struct {
	ID            string   `json:"id"`
	Login         string   `json:"login"`
	ClientID      string   `json:"client_id"`
	DefaultEmail  string   `json:"default_email"`
	Emails        []string `json:"emails"`
	DisplayName   string   `json:"display_name"`
	RealName      string   `json:"real_name"`
	FirstName     string   `json:"first_name"`
	LastName      string   `json:"last_name"`
	DefaultAvatar string   `json:"default_avatar_id"`
	IsAvatarEmpty bool     `json:"is_avatar_empty"`
	Sex           string   `json:"sex"`
}

func exchangeYandexCode(ctx context.Context, code, codeVerifier string, cfg yandexOAuthConfig) (*yandexTokenResponse, error) {
	data := url.Values{
		"grant_type":    {"authorization_code"},
		"code":          {code},
		"code_verifier": {codeVerifier},
		"redirect_uri":  {cfg.RedirectURI},
	}

	req, err := http.NewRequestWithContext(ctx, "POST", cfg.TokenURL, strings.NewReader(data.Encode()))
	if err != nil {
		return nil, fmt.Errorf("create token request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.SetBasicAuth(cfg.ClientID, cfg.ClientSecret)

	resp, err := cfg.HTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("token request: %w", err)
	}
	defer resp.Body.Close()

	// Check Content-Type
	ct := resp.Header.Get("Content-Type")
	if !strings.HasPrefix(ct, "application/json") {
		return nil, fmt.Errorf("token endpoint: %w", errTokenInvalidContentType)
	}

	// Limit body to 1 MiB
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, fmt.Errorf("read token response: %w", err)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("token endpoint: %w (status %d)", errTokenInvalidStatus, resp.StatusCode)
	}

	var tokenResp yandexTokenResponse
	if err := json.Unmarshal(body, &tokenResp); err != nil {
		return nil, fmt.Errorf("token endpoint: %w", errTokenInvalidJSON)
	}

	if tokenResp.AccessToken == "" {
		return nil, fmt.Errorf("token endpoint: %w", errTokenMissingAccess)
	}

	return &tokenResp, nil
}

func fetchYandexProfile(ctx context.Context, accessToken string, cfg yandexOAuthConfig) (*yandexProfileResponse, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", cfg.ProfileURL, nil)
	if err != nil {
		return nil, fmt.Errorf("create profile request: %w", err)
	}
	req.Header.Set("Authorization", "OAuth "+accessToken)

	resp, err := cfg.HTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("profile request: %w", err)
	}
	defer resp.Body.Close()

	// Check Content-Type
	ct := resp.Header.Get("Content-Type")
	if !strings.HasPrefix(ct, "application/json") {
		return nil, fmt.Errorf("profile endpoint: %w", errTokenInvalidContentType)
	}

	// Limit body to 1 MiB
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, fmt.Errorf("read profile response: %w", err)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("profile endpoint: %w (status %d)", errTokenInvalidStatus, resp.StatusCode)
	}

	var profile yandexProfileResponse
	if err := json.Unmarshal(body, &profile); err != nil {
		return nil, fmt.Errorf("profile endpoint: %w", errTokenInvalidJSON)
	}

	if profile.ID == "" {
		return nil, fmt.Errorf("profile endpoint: %w", errProfileMissingID)
	}

	// Validate client_id if present in response
	if profile.ClientID != "" {
		if subtle.ConstantTimeCompare([]byte(profile.ClientID), []byte(cfg.ClientID)) != 1 {
			return nil, fmt.Errorf("profile endpoint: %w", errProfileClientIDMismatch)
		}
	}

	return &profile, nil
}

// ── Error codes ──

const (
	oauthCancelled             = "oauth_cancelled"
	oauthStateInvalid          = "oauth_state_invalid"
	oauthExpired               = "oauth_expired"
	oauthProviderError         = "oauth_provider_error"
	oauthNotLinked             = "oauth_not_linked"
	oauthYandexNotLinked       = "oauth_yandex_not_linked"
	oauthEmailRequired         = "oauth_email_required"
	oauthAccountExists         = "oauth_account_exists"
	oauthUnavailable           = "oauth_unavailable"
	oauthStateInvalidOrExpired = "oauth_state_invalid_or_expired"
)

// ── Safe error sentinels for logging ──

var (
	errTokenInvalidContentType = errors.New("invalid_content_type")
	errTokenInvalidStatus      = errors.New("invalid_status")
	errTokenInvalidJSON        = errors.New("invalid_json")
	errTokenMissingAccess      = errors.New("missing_access_token")
	errProfileMissingID        = errors.New("missing_profile_id")
	errProfileClientIDMismatch = errors.New("client_id_mismatch")
)

// ── Callback handler ──

func (a *App) handleYandexOAuthCallback(w http.ResponseWriter, r *http.Request) {
	cfg := loadYandexOAuthConfig()
	if !cfg.Enabled || a.oauthRedirectOrigin() == "" {
		a.oauthRedirectError(w, r, oauthUnavailable)
		return
	}

	// 1. Get state and code from query params
	state := r.URL.Query().Get("state")
	code := r.URL.Query().Get("code")
	errorParam := r.URL.Query().Get("error")

	// 2. Check for provider cancellation
	if errorParam != "" {
		a.oauthRedirectError(w, r, oauthCancelled)
		return
	}

	if state == "" {
		a.oauthRedirectError(w, r, oauthStateInvalid)
		return
	}

	// 3. Atomically get and delete state
	stateKey := oauthStateRedisKey + sha256Hex(state)
	var storedState yandexOAuthState

	val, err := oauthStore.GetDel(r.Context(), stateKey)
	if err != nil || val == "" {
		a.oauthRedirectError(w, r, oauthStateInvalid)
		return
	}
	if err := json.Unmarshal([]byte(val), &storedState); err != nil {
		a.oauthRedirectError(w, r, oauthStateInvalid)
		return
	}

	// 4. Check provider
	if storedState.Provider != "yandex" {
		a.oauthRedirectError(w, r, oauthStateInvalid)
		return
	}

	// 5. Check expiry
	if time.Now().Unix()-storedState.CreatedAt > int64(oauthStateTTL.Seconds()) {
		a.oauthRedirectError(w, r, oauthExpired)
		return
	}

	// 6. Check browser correlation cookie
	cookie, err := r.Cookie(oauthCookieName)
	if err != nil || cookie.Value == "" {
		a.oauthRedirectError(w, r, oauthStateInvalid)
		return
	}

	// Clear the temporary cookie before any further processing
	clearOAuthCookie(w)

	// Constant-time comparison of browser nonce
	cookieNonceHash := sha256Hex(cookie.Value)
	if subtle.ConstantTimeCompare([]byte(cookieNonceHash), []byte(storedState.BrowserNonce)) != 1 {
		a.oauthRedirectError(w, r, oauthStateInvalid)
		return
	}

	// 7. Check code
	if code == "" {
		a.oauthRedirectError(w, r, oauthProviderError)
		return
	}

	// 8. Exchange code for token
	tokenResp, err := exchangeYandexCode(r.Context(), code, storedState.CodeVerifier, cfg)
	if err != nil {
		logSafeOAuthError("token exchange failed")
		a.oauthRedirectError(w, r, oauthProviderError)
		return
	}

	// 9. Fetch profile
	profile, err := fetchYandexProfile(r.Context(), tokenResp.AccessToken, cfg)
	if err != nil {
		logSafeOAuthError("profile fetch failed")
		a.oauthRedirectError(w, r, oauthProviderError)
		return
	}

	// Discard tokens — never store them
	tokenResp = nil

	// 10. Get email
	email := profile.DefaultEmail
	if email == "" && len(profile.Emails) > 0 {
		email = profile.Emails[0]
	}

	providerSubject := profile.ID

	// 11. Execute login or signup. Intent, role and consent come from the
	// single-use server-side state — the callback query is never trusted.
	switch intent, _ := parseAuthIntent(storedState.Mode); intent {
	case AuthIntentLogin:
		a.yandexLogin(w, r, providerSubject, email, profile, storedState)
	case AuthIntentSignup:
		a.yandexSignup(w, r, providerSubject, email, profile, storedState)
	default:
		a.oauthRedirectError(w, r, oauthProviderError)
	}
}

func (a *App) yandexLogin(w http.ResponseWriter, r *http.Request, providerSubject, email string, profile *yandexProfileResponse, state yandexOAuthState) {
	ctx := r.Context()

	// Look up existing identity
	identity, err := findAuthIdentityByProviderSubject(ctx, a.db, ProviderYandex, providerSubject)
	if err != nil {
		logSafeOAuthError("identity operation failed")
		a.oauthRedirectError(w, r, oauthProviderError)
		return
	}

	if identity == nil {
		// No linked account — login never creates one. The user is sent to
		// the register screen instead.
		a.oauthRedirectError(w, r, oauthYandexNotLinked)
		return
	}

	// Log the user into their existing account. Role and consent come from
	// the profile, never from the OAuth state.
	a.oauthLoginExistingIdentity(w, r, identity, state.ReturnTo, yandexOAuthCtx)
}

func (a *App) yandexSignup(w http.ResponseWriter, r *http.Request, providerSubject, email string, profile *yandexProfileResponse, state yandexOAuthState) {
	ctx := r.Context()

	// Check if identity already exists
	identity, err := findAuthIdentityByProviderSubject(ctx, a.db, ProviderYandex, providerSubject)
	if err != nil {
		logSafeOAuthError("identity operation failed")
		a.oauthRedirectError(w, r, oauthProviderError)
		return
	}

	if identity != nil {
		// Identity exists — log the user into their existing account.
		// Role, organization and consent stay untouched; no duplicate
		// profile and no second identity are ever created.
		a.oauthLoginExistingIdentity(w, r, identity, state.ReturnTo, yandexOAuthCtx)
		return
	}

	// Email is required for signup
	if email == "" {
		a.oauthRedirectError(w, r, oauthEmailRequired)
		return
	}

	// Defense in depth: role and legal consent are validated at /start
	// and carried in the server-side state only. The callback query
	// is never trusted for these values.
	if state.Role != "client" && state.Role != "business" {
		a.oauthRedirectError(w, r, oauthProviderError)
		return
	}
	if !state.TermsAccepted {
		a.oauthRedirectError(w, r, oauthProviderError)
		return
	}

	normalizedEmail := normalizeEmail(email)

	// Check if email already belongs to another profile
	var existingUserID string
	err = a.db.QueryRow(ctx, "SELECT id FROM profiles WHERE LOWER(BTRIM(email))=LOWER(BTRIM($1))", normalizedEmail).Scan(&existingUserID)
	if err == nil && existingUserID != "" {
		a.oauthRedirectError(w, r, oauthAccountExists)
		return
	}

	// Generate user ID
	userID := newID()

	// Start transaction
	tx, err := a.db.Begin(ctx)
	if err != nil {
		logSafeOAuthError("identity operation failed")
		a.oauthRedirectError(w, r, oauthProviderError)
		return
	}
	defer tx.Rollback(ctx)

	// Create profile — use Yandex display name if available
	displayName := ""
	if profile.DisplayName != "" {
		displayName = profile.DisplayName
	} else if profile.RealName != "" {
		displayName = profile.RealName
	} else if profile.Login != "" {
		displayName = profile.Login
	} else {
		displayName = "Yandex User"
	}

	_, err = tx.Exec(ctx,
		"INSERT INTO profiles (id, role, display_name, email, terms_accepted_at, terms_version, privacy_version) VALUES ($1,$2,$3,$4,NOW(),$5,$6)",
		userID, state.Role, displayName, normalizedEmail, termsVersion, privacyVersion)
	if err != nil {
		if isUniqueViolation(err) {
			a.oauthRedirectError(w, r, oauthAccountExists)
			return
		}
		logSafeOAuthError("identity operation failed")
		a.oauthRedirectError(w, r, oauthProviderError)
		return
	}

	// Create auth identity for Yandex
	identityID := newSecureID()
	now := time.Now()
	_, err = tx.Exec(ctx,
		`INSERT INTO auth_identities
			(id, user_id, provider, provider_subject, provider_email,
			 provider_username, provider_email_verified, metadata,
			 created_at, updated_at, last_login_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
		identityID, userID, ProviderYandex, providerSubject,
		strPtr(normalizedEmail), strPtr(profile.Login), false,
		"{}", now, now, &now)
	if err != nil {
		if isUniqueViolation(err) {
			a.oauthRedirectError(w, r, oauthAccountExists)
			return
		}
		logSafeOAuthError("identity operation failed")
		a.oauthRedirectError(w, r, oauthProviderError)
		return
	}

	if err := tx.Commit(ctx); err != nil {
		logSafeOAuthError("identity operation failed")
		a.oauthRedirectError(w, r, oauthProviderError)
		return
	}

	// Record audit event
	a.recordAuditEvent(r, userID, state.Role, "oauth_signup", "profile", userID, "", map[string]interface{}{
		"provider":        "yandex",
		"terms_version":   termsVersion,
		"privacy_version": privacyVersion,
	})

	// Create standard session and redirect
	a.createOAuthSession(w, r, userID, state.Role, state.ReturnTo)
}

// createOAuthSession creates a standard OAuth session and redirects to the
// main app. Kept for Yandex callers and existing tests.
func (a *App) createOAuthSession(w http.ResponseWriter, r *http.Request, userID, userRole, returnTo string) {
	a.createOAuthSessionFor(w, r, userID, userRole, returnTo, "yandex")
}

// createOAuthSessionFor creates a standard OAuth session and redirects to the
// main app. The provider is recorded in the audit event so that every login
// is attributed to the real identity provider.
func (a *App) createOAuthSessionFor(w http.ResponseWriter, r *http.Request, userID, userRole, returnTo, provider string) {
	ctx := r.Context()

	raw, sessionID, err := insertAuthSessionRow(ctx, a.db, userID, a.secCfg.RefreshTokenTTLHours)
	if err != nil {
		logSafeOAuthError("session creation failed")
		a.oauthRedirectError(w, r, oauthProviderError)
		return
	}

	a.completeOAuthLogin(w, r, userID, userRole, returnTo, sessionID, raw, provider)
}

// allowlistedOAuthErrorCodes is the set of safe error codes that may appear
// in the /auth/complete redirect URL.
var allowlistedOAuthErrorCodes = map[string]bool{
	oauthCancelled:             true,
	oauthStateInvalid:          true,
	oauthExpired:               true,
	oauthProviderError:         true,
	oauthNotLinked:             true, // legacy alias, kept for backward compatibility
	oauthYandexNotLinked:       true,
	oauthEmailRequired:         true,
	oauthAccountExists:         true,
	oauthUnavailable:           true,
	oauthStateInvalidOrExpired: true,
}

// safeOAuthErrorCode returns the error code if allowlisted, or a safe fallback.
func safeOAuthErrorCode(code string) string {
	if allowlistedOAuthErrorCodes[code] {
		return code
	}
	return oauthProviderError
}

// oauthRedirectError sends the user to the main app's /auth/complete page
// with a fixed allowlisted error code in the query string.
// Uses APP_PUBLIC_URL as the fixed origin — never from Host header.
func (a *App) oauthRedirectError(w http.ResponseWriter, r *http.Request, errorCode string) {
	clearOAuthCookie(w)
	q := url.Values{}
	q.Set("error", safeOAuthErrorCode(errorCode))
	origin := a.oauthRedirectOrigin()
	if origin == "" {
		// Fallback: relative redirect when origin is not configured.
		// Only happens in development if APP_PUBLIC_URL is unset.
		origin = ""
	}
	redirectURL := origin + "/auth/complete?" + q.Encode()
	http.Redirect(w, r, redirectURL, http.StatusFound)
}

// clearOAuthCookie removes the temporary Yandex OAuth cookie.
func clearOAuthCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     oauthCookieName,
		Value:    "",
		Path:     oauthCookiePath,
		HttpOnly: true,
		Secure:   isProduction(),
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1,
	})
}

// logSafeOAuthError logs a fixed message without any sensitive data.
// No raw errors, tokens, codes, emails, or identifiers are ever logged.
func logSafeOAuthError(msg string) {
	log.Printf("yandex oauth: %s", msg)
}
