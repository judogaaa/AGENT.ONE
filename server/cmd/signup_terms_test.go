package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// ── Helpers ──

// signupApp returns an App pre-configured for signup tests.
func signupApp(pool *pgxpool.Pool) *App {
	return &App{
		db:     pool,
		jwtKey: []byte("test-jwt-key-for-signup-terms-0123456789"),
		secCfg: AccountSecurityConfig{
			AppPublicURL:          "http://testapp",
			AccessTokenTTLMinutes: 15,
			RefreshTokenTTLHours:  720,
		},
	}
}

// doEmailSignup posts a raw JSON body to handleSignup.
func doEmailSignup(t *testing.T, app *App, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest("POST", "/api/auth/signup", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	app.handleSignup(w, req)
	return w
}

// signupError decodes the error message from a signup response.
func signupError(t *testing.T, w *httptest.ResponseRecorder) string {
	t.Helper()
	var body struct {
		Error string `json:"error"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &body)
	return body.Error
}

// assertNoProfileForEmail fails the test if a profile with this email exists.
func assertNoProfileForEmail(t *testing.T, pool *pgxpool.Pool, email string) {
	t.Helper()
	var count int
	err := pool.QueryRow(context.Background(),
		"SELECT COUNT(*) FROM profiles WHERE LOWER(BTRIM(email))=LOWER(BTRIM($1))", email).Scan(&count)
	if err != nil {
		t.Fatalf("count profiles: %v", err)
	}
	if count != 0 {
		t.Errorf("expected 0 profiles for %q, got %d", email, count)
	}
}

// assertConsentColumns verifies the legal consent columns on a profile.
func assertConsentColumns(t *testing.T, pool *pgxpool.Pool, email, wantRole string) {
	t.Helper()
	var role string
	var termsAt *time.Time
	var termsVer, privVer string
	err := pool.QueryRow(context.Background(),
		"SELECT role, terms_accepted_at, COALESCE(terms_version,''), COALESCE(privacy_version,'') FROM profiles WHERE email=$1",
		email).Scan(&role, &termsAt, &termsVer, &privVer)
	if err != nil {
		t.Fatalf("profile lookup: %v", err)
	}
	if role != wantRole {
		t.Errorf("role = %q, want %q", role, wantRole)
	}
	if termsAt == nil {
		t.Error("terms_accepted_at is NULL, want timestamp")
	}
	if termsVer != termsVersion {
		t.Errorf("terms_version = %q, want %q", termsVer, termsVersion)
	}
	if privVer != privacyVersion {
		t.Errorf("privacy_version = %q, want %q", privVer, privacyVersion)
	}
}

func cleanupProfileByEmail(t *testing.T, pool *pgxpool.Pool, email string) {
	t.Helper()
	ctx := context.Background()
	var uid string
	err := pool.QueryRow(ctx, "SELECT id FROM profiles WHERE email=$1", email).Scan(&uid)
	if err == nil && uid != "" {
		pool.Exec(ctx, "DELETE FROM auth_sessions WHERE user_id=$1", uid)
		pool.Exec(ctx, "DELETE FROM auth_identities WHERE user_id=$1", uid)
		pool.Exec(ctx, "DELETE FROM profiles WHERE id=$1", uid)
	}
}

// ── Email signup: role is mandatory ──

func TestEmailSignup_NoRoleRejected(t *testing.T) {
	pool := getTestDB(t)
	app := signupApp(pool)
	email := "test_no_role_" + randHex(6) + "@example.com"

	w := doEmailSignup(t, app, `{"email":"`+email+`","password":"123456","displayName":"X","terms_accepted":true,"pd_consent":true}`)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
	if got := signupError(t, w); got != "invalid role; must be 'client' or 'business'" {
		t.Errorf("error = %q", got)
	}
	assertNoProfileForEmail(t, pool, email)
}

func TestEmailSignup_InvalidRoleRejected(t *testing.T) {
	pool := getTestDB(t)
	app := signupApp(pool)
	email := "test_bad_role_" + randHex(6) + "@example.com"

	w := doEmailSignup(t, app, `{"email":"`+email+`","password":"123456","role":"admin","terms_accepted":true,"pd_consent":true}`)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
	if got := signupError(t, w); got != "invalid role; must be 'client' or 'business'" {
		t.Errorf("error = %q", got)
	}
	assertNoProfileForEmail(t, pool, email)
}

// ── Email signup: legal consent is mandatory ──

func TestEmailSignup_NoTermsRejected(t *testing.T) {
	pool := getTestDB(t)
	app := signupApp(pool)
	email := "test_no_terms_" + randHex(6) + "@example.com"

	w := doEmailSignup(t, app, `{"email":"`+email+`","password":"123456","role":"client"}`)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
	if got := signupError(t, w); got != "terms acceptance required" {
		t.Errorf("error = %q", got)
	}
	assertNoProfileForEmail(t, pool, email)
}

func TestEmailSignup_TermsFalseRejected(t *testing.T) {
	pool := getTestDB(t)
	app := signupApp(pool)
	email := "test_terms_false_" + randHex(6) + "@example.com"

	w := doEmailSignup(t, app, `{"email":"`+email+`","password":"123456","role":"client","terms_accepted":false}`)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
	if got := signupError(t, w); got != "terms acceptance required" {
		t.Errorf("error = %q", got)
	}
	assertNoProfileForEmail(t, pool, email)
}

// Strings such as "true"/"yes"/"1"/"false" must NOT be accepted for the boolean field.
func TestEmailSignup_TermsStringRejected(t *testing.T) {
	pool := getTestDB(t)
	app := signupApp(pool)

	for _, val := range []string{"true", "yes", "1", "false"} {
		t.Run(val, func(t *testing.T) {
			email := "test_terms_str_" + randHex(6) + "@example.com"
			w := doEmailSignup(t, app, `{"email":"`+email+`","password":"123456","role":"client","terms_accepted":"`+val+`"}`)
			if w.Code != http.StatusBadRequest {
				t.Fatalf("expected 400, got %d", w.Code)
			}
			assertNoProfileForEmail(t, pool, email)
		})
	}
}

// ── Email signup: strict JSON body parsing ──

// Malformed bodies must be rejected with 400 and no profile created.
func TestEmailSignup_MalformedBodiesRejected(t *testing.T) {
	pool := getTestDB(t)
	app := signupApp(pool)

	cases := []struct {
		name string
		body string
	}{
		{"truncated object", `{"email":"x@y.com","password":"123456","role":"client","terms_accepted":true`},
		{"empty body", ``},
		{"array instead of object", `[{"email":"x@y.com","password":"123456","role":"client","terms_accepted":true,"pd_consent":true}]`},
		{"second json object", `{"email":"x@y.com","password":"123456","role":"client","terms_accepted":true,"pd_consent":true}{"email":"z@y.com"}`},
		{"trailing garbage", `{"email":"x@y.com","password":"123456","role":"client","terms_accepted":true,"pd_consent":true} trailing`},
		{"trailing null", `{"email":"x@y.com","password":"123456","role":"client","terms_accepted":true,"pd_consent":true} null`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			email := "test_malformed_" + randHex(6) + "@example.com"
			w := doEmailSignup(t, app, tc.body)
			if w.Code != http.StatusBadRequest {
				t.Fatalf("expected 400, got %d", w.Code)
			}
			if got := signupError(t, w); got != "invalid request body" {
				t.Errorf("error = %q, want %q", got, "invalid request body")
			}
			assertNoProfileForEmail(t, pool, email)
		})
	}
}

// terms_accepted is a valid boolean true, but the following field has the
// wrong JSON type — the whole request must be rejected.
func TestEmailSignup_WrongTypeAfterValidTermsRejected(t *testing.T) {
	pool := getTestDB(t)
	app := signupApp(pool)
	email := "test_wrong_type_" + randHex(6) + "@example.com"

	w := doEmailSignup(t, app, `{"email":"`+email+`","password":"123456","role":"client","terms_accepted":true,"displayName":123}`)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
	if got := signupError(t, w); got != "invalid request body" {
		t.Errorf("error = %q, want %q", got, "invalid request body")
	}
	assertNoProfileForEmail(t, pool, email)
}

// A duplicated terms_accepted field must be rejected: the last value is a
// string, which fails strict boolean decoding.
func TestEmailSignup_DuplicateTermsFieldRejected(t *testing.T) {
	pool := getTestDB(t)
	app := signupApp(pool)
	email := "test_dup_terms_" + randHex(6) + "@example.com"

	w := doEmailSignup(t, app, `{"email":"`+email+`","password":"123456","role":"client","terms_accepted":true,"terms_accepted":"false"}`)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
	if got := signupError(t, w); got != "invalid request body" {
		t.Errorf("error = %q, want %q", got, "invalid request body")
	}
	assertNoProfileForEmail(t, pool, email)
}

// Trailing whitespace after the JSON object is fine (EOF check passes).
func TestEmailSignup_TrailingWhitespaceAllowed(t *testing.T) {
	pool := getTestDB(t)
	app := signupApp(pool)
	email := "test_trail_ws_" + randHex(6) + "@example.com"
	t.Cleanup(func() { cleanupProfileByEmail(t, pool, email) })

	w := doEmailSignup(t, app, "{\"email\":\""+email+"\",\"password\":\"123456\",\"role\":\"client\",\"terms_accepted\":true}\n\n  ")
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	assertConsentColumns(t, pool, email, "client")
}

// None of the rejected requests may leave partial DB records — no profiles,
// no sessions, no identities.
func TestEmailSignup_RejectedRequestsLeaveNoRecords(t *testing.T) {
	pool := getTestDB(t)
	app := signupApp(pool)
	ctx := context.Background()

	emails := []string{
		"test_nr_badjson_" + randHex(6) + "@example.com",
		"test_nr_strterms_" + randHex(6) + "@example.com",
		"test_nr_duptype_" + randHex(6) + "@example.com",
		"test_nr_garbage_" + randHex(6) + "@example.com",
	}
	bodies := []string{
		`{"email":"` + emails[0] + `","password":"123456","role":"client","terms_accepted":true`,
		`{"email":"` + emails[1] + `","password":"123456","role":"client","terms_accepted":"true"}`,
		`{"email":"` + emails[2] + `","password":"123456","role":"client","terms_accepted":true,"displayName":123}`,
		`{"email":"` + emails[3] + `","password":"123456","role":"client","terms_accepted":true,"pd_consent":true} junk`,
	}
	for i, body := range bodies {
		w := doEmailSignup(t, app, body)
		if w.Code != http.StatusBadRequest {
			t.Fatalf("case %d: expected 400, got %d", i, w.Code)
		}
	}

	for _, email := range emails {
		var profileCount int
		err := pool.QueryRow(ctx,
			"SELECT COUNT(*) FROM profiles WHERE LOWER(BTRIM(email))=LOWER(BTRIM($1))", email).Scan(&profileCount)
		if err != nil {
			t.Fatalf("count profiles: %v", err)
		}
		if profileCount != 0 {
			t.Errorf("partial profile created for %q", email)
		}

		var sessionCount int
		err = pool.QueryRow(ctx,
			"SELECT COUNT(*) FROM auth_sessions s JOIN profiles p ON s.user_id=p.id WHERE LOWER(BTRIM(p.email))=LOWER(BTRIM($1))", email).Scan(&sessionCount)
		if err != nil {
			t.Fatalf("count sessions: %v", err)
		}
		if sessionCount != 0 {
			t.Errorf("session created for %q", email)
		}
	}
}

// ── Email signup: success stores consent ──

func TestEmailSignup_ClientConsentStored(t *testing.T) {
	pool := getTestDB(t)
	app := signupApp(pool)
	email := "test_client_terms_" + randHex(6) + "@example.com"
	t.Cleanup(func() { cleanupProfileByEmail(t, pool, email) })

	w := doEmailSignup(t, app, `{"email":"`+email+`","password":"123456","displayName":"Client User","role":"client","terms_accepted":true,"pd_consent":true}`)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	assertConsentColumns(t, pool, email, "client")
}

func TestEmailSignup_BusinessConsentStored(t *testing.T) {
	pool := getTestDB(t)
	app := signupApp(pool)
	email := "test_business_terms_" + randHex(6) + "@example.com"
	t.Cleanup(func() { cleanupProfileByEmail(t, pool, email) })

	w := doEmailSignup(t, app, `{"email":"`+email+`","password":"123456","displayName":"Biz User","role":"business","terms_accepted":true,"pd_consent":true}`)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	assertConsentColumns(t, pool, email, "business")
}

// ── Yandex start: terms_accepted is mandatory for signup ──

func TestYandexStart_SignupRequiresTerms(t *testing.T) {
	cases := []struct {
		name  string
		query string
	}{
		{"missing", "mode=signup&role=client"},
		{"false", "mode=signup&role=client&terms_accepted=false"},
		{"one", "mode=signup&role=client&terms_accepted=1"},
		{"yes", "mode=signup&role=client&terms_accepted=yes"},
		{"uppercase", "mode=signup&role=client&terms_accepted=TRUE"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			origStore := oauthStore
			defer func() { oauthStore = origStore }()
			oauthStore = newMemoryStateStore()

			t.Setenv("YANDEX_OAUTH_CLIENT_ID", "test-id")
			t.Setenv("YANDEX_OAUTH_CLIENT_SECRET", "test-secret")

			req := httptest.NewRequest("GET", "/api/auth/oauth/yandex/start?"+tc.query, nil)
			w := httptest.NewRecorder()
			app := &App{secCfg: AccountSecurityConfig{AppPublicURL: "http://testapp"}}
			app.handleYandexOAuthStart(w, req)
			resp := w.Result()
			defer resp.Body.Close()

			if resp.StatusCode != http.StatusBadRequest {
				t.Fatalf("expected 400, got %d", resp.StatusCode)
			}
			var body struct {
				Error string `json:"error"`
			}
			_ = json.Unmarshal(w.Body.Bytes(), &body)
			if body.Error != "terms acceptance required" {
				t.Errorf("error = %q", body.Error)
			}
		})
	}
}

func TestYandexStart_SignupRequiresPersonalDataConsent(t *testing.T) {
	origStore := oauthStore
	defer func() { oauthStore = origStore }()
	oauthStore = newMemoryStateStore()

	t.Setenv("YANDEX_OAUTH_CLIENT_ID", "test-id")
	t.Setenv("YANDEX_OAUTH_CLIENT_SECRET", "test-secret")

	req := httptest.NewRequest("GET", "/api/auth/oauth/yandex/start?mode=signup&role=client&terms_accepted=true", nil)
	w := httptest.NewRecorder()
	app := &App{secCfg: AccountSecurityConfig{AppPublicURL: "http://testapp"}}
	app.handleYandexOAuthStart(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}

// The role/consent must be persisted in the server-side state.
func TestYandexStart_SignupWithTermsStoresState(t *testing.T) {
	origStore := oauthStore
	defer func() { oauthStore = origStore }()
	store := newMemoryStateStore()
	oauthStore = store

	t.Setenv("YANDEX_OAUTH_CLIENT_ID", "test-client-id")
	t.Setenv("YANDEX_OAUTH_CLIENT_SECRET", "test-secret")

	req := httptest.NewRequest("GET", "/api/auth/oauth/yandex/start?mode=signup&role=business&terms_accepted=true&pd_consent=true", nil)
	w := httptest.NewRecorder()
	app := &App{secCfg: AccountSecurityConfig{AppPublicURL: "http://testapp"}}
	app.handleYandexOAuthStart(w, req)
	resp := w.Result()
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusFound {
		t.Fatalf("expected 302, got %d", resp.StatusCode)
	}
	loc := resp.Header.Get("Location")
	u, err := url.Parse(loc)
	if err != nil {
		t.Fatal(err)
	}
	state := u.Query().Get("state")
	if state == "" {
		t.Fatal("no state in Location")
	}

	// Read the stored state and verify role + consent
	val, err := store.GetDel(context.Background(), oauthStateRedisKey+sha256Hex(state))
	if err != nil {
		t.Fatalf("state not stored: %v", err)
	}
	var stored yandexOAuthState
	if err := json.Unmarshal([]byte(val), &stored); err != nil {
		t.Fatal(err)
	}
	if stored.Mode != "signup" {
		t.Errorf("mode = %q", stored.Mode)
	}
	if stored.Role != "business" {
		t.Errorf("role = %q, want business", stored.Role)
	}
	if !stored.TermsAccepted {
		t.Error("termsAccepted = false, want true")
	}
}

// Login mode must ignore the terms_accepted parameter entirely.
func TestYandexStart_LoginIgnoresTermsParam(t *testing.T) {
	origStore := oauthStore
	defer func() { oauthStore = origStore }()
	oauthStore = newMemoryStateStore()

	t.Setenv("YANDEX_OAUTH_CLIENT_ID", "test-client-id")
	t.Setenv("YANDEX_OAUTH_CLIENT_SECRET", "test-secret")

	req := httptest.NewRequest("GET", "/api/auth/oauth/yandex/start?mode=login&terms_accepted=false", nil)
	w := httptest.NewRecorder()
	app := &App{secCfg: AccountSecurityConfig{AppPublicURL: "http://testapp"}}
	app.handleYandexOAuthStart(w, req)
	resp := w.Result()
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusFound {
		t.Fatalf("expected 302 for login without terms, got %d", resp.StatusCode)
	}
}

// ── Yandex callback: role/consent come from server-side state only ──

func TestYandexCallback_SignupRoleFromStateOnly(t *testing.T) {
	skipIfNoDB(t)
	pool := getTestDB(t)

	origStore := oauthStore
	defer func() { oauthStore = origStore }()
	oauthStore = newMemoryStateStore()

	t.Setenv("YANDEX_OAUTH_CLIENT_ID", "test-client-id")
	t.Setenv("YANDEX_OAUTH_CLIENT_SECRET", "test-client-secret")

	providerSubject := "ya_cb_spoof_" + randHex(8)
	email := providerSubject + "@example.com"

	tokenSrv := successTokenServer("ya_token_cb")
	defer tokenSrv.Close()
	profileSrv := successProfileServer(providerSubject, email, "Callback User")
	defer profileSrv.Close()
	oauthTokenURLOverride = tokenSrv.URL
	oauthProfileURLOverride = profileSrv.URL
	defer func() { oauthTokenURLOverride = ""; oauthProfileURLOverride = "" }()

	app := signupApp(pool)
	t.Cleanup(func() { cleanupProfileByEmail(t, pool, email) })

	// Start signup as business with consent
	startReq := httptest.NewRequest("GET", "/api/auth/oauth/yandex/start?mode=signup&role=business&terms_accepted=true&pd_consent=true", nil)
	startW := httptest.NewRecorder()
	app.handleYandexOAuthStart(startW, startReq)
	startResp := startW.Result()
	if startResp.StatusCode != http.StatusFound {
		startResp.Body.Close()
		t.Fatalf("start: expected 302, got %d", startResp.StatusCode)
	}
	loc := startResp.Header.Get("Location")
	startResp.Body.Close()
	u, err := url.Parse(loc)
	if err != nil {
		t.Fatal(err)
	}
	state := u.Query().Get("state")
	if state == "" {
		t.Fatal("no state in start Location")
	}
	var browserNonce string
	for _, c := range startResp.Header.Values("Set-Cookie") {
		if strings.HasPrefix(c, "agentone_yandex_oauth=") {
			browserNonce = strings.SplitN(strings.TrimPrefix(c, "agentone_yandex_oauth="), ";", 2)[0]
		}
	}
	if browserNonce == "" {
		t.Fatal("no browser nonce cookie set by start")
	}

	// Callback with spoofed role=client and terms_accepted=false in the query —
	// the server must use the state (business + consent), not the query.
	cbReq := httptest.NewRequest("GET", "/api/auth/oauth/yandex/callback?state="+state+"&code=cb_code&role=client&terms_accepted=false", nil)
	cbReq.AddCookie(&http.Cookie{Name: oauthCookieName, Value: browserNonce})
	cbW := httptest.NewRecorder()
	app.handleYandexOAuthCallback(cbW, cbReq)
	cbResp := cbW.Result()
	defer cbResp.Body.Close()
	cbLoc := cbResp.Header.Get("Location")
	if strings.Contains(cbLoc, "error=") {
		t.Fatalf("callback failed: %s", cbLoc)
	}

	assertConsentColumns(t, pool, email, "business")
}

// ── Direct yandexSignup guard tests ──

func TestYandexSignup_NoTermsRejected(t *testing.T) {
	skipIfNoDB(t)
	pool := getTestDB(t)
	ctx := context.Background()

	providerSubject := "ya_no_terms_" + randHex(8)
	email := providerSubject + "@example.com"
	app := signupApp(pool)
	state := yandexOAuthState{ReturnTo: "/", Mode: "signup", Role: "client"} // TermsAccepted missing
	profile := &yandexProfileResponse{ID: providerSubject, DefaultEmail: email}

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/", nil)
	app.yandexSignup(w, req, providerSubject, email, profile, state)
	resp := w.Result()
	defer resp.Body.Close()

	loc := resp.Header.Get("Location")
	if !strings.Contains(loc, "error=oauth_provider_error") {
		t.Errorf("expected oauth_provider_error, got %s", loc)
	}
	assertNoProfileForEmail(t, pool, email)

	var identCount int
	pool.QueryRow(ctx, "SELECT COUNT(*) FROM auth_identities WHERE provider_subject=$1", providerSubject).Scan(&identCount)
	if identCount != 0 {
		t.Errorf("expected 0 identities, got %d", identCount)
	}
}

func TestYandexSignup_InvalidRoleRejected(t *testing.T) {
	skipIfNoDB(t)
	pool := getTestDB(t)
	ctx := context.Background()

	providerSubject := "ya_bad_role_" + randHex(8)
	email := providerSubject + "@example.com"
	app := signupApp(pool)
	state := yandexOAuthState{ReturnTo: "/", Mode: "signup", Role: "admin", TermsAccepted: true}
	profile := &yandexProfileResponse{ID: providerSubject, DefaultEmail: email}

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/", nil)
	app.yandexSignup(w, req, providerSubject, email, profile, state)
	resp := w.Result()
	defer resp.Body.Close()

	loc := resp.Header.Get("Location")
	if !strings.Contains(loc, "error=oauth_provider_error") {
		t.Errorf("expected oauth_provider_error, got %s", loc)
	}
	assertNoProfileForEmail(t, pool, email)

	var identCount int
	pool.QueryRow(ctx, "SELECT COUNT(*) FROM auth_identities WHERE provider_subject=$1", providerSubject).Scan(&identCount)
	if identCount != 0 {
		t.Errorf("expected 0 identities, got %d", identCount)
	}
}

func TestYandexSignup_ClientConsentStored(t *testing.T) {
	skipIfNoDB(t)
	pool := getTestDB(t)

	providerSubject := "ya_terms_client_" + randHex(8)
	email := providerSubject + "@example.com"
	app := signupApp(pool)
	t.Cleanup(func() { cleanupProfileByEmail(t, pool, email) })
	state := yandexOAuthState{ReturnTo: "/", Mode: "signup", Role: "client", TermsAccepted: true}
	profile := &yandexProfileResponse{ID: providerSubject, DefaultEmail: email}

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/", nil)
	app.yandexSignup(w, req, providerSubject, email, profile, state)
	resp := w.Result()
	defer resp.Body.Close()

	loc := resp.Header.Get("Location")
	if strings.Contains(loc, "error=") {
		t.Fatalf("expected success, got %s", loc)
	}
	assertConsentColumns(t, pool, email, "client")
}

func TestYandexSignup_BusinessConsentStored(t *testing.T) {
	skipIfNoDB(t)
	pool := getTestDB(t)

	providerSubject := "ya_terms_business_" + randHex(8)
	email := providerSubject + "@example.com"
	app := signupApp(pool)
	t.Cleanup(func() { cleanupProfileByEmail(t, pool, email) })
	state := yandexOAuthState{ReturnTo: "/", Mode: "signup", Role: "business", TermsAccepted: true}
	profile := &yandexProfileResponse{ID: providerSubject, DefaultEmail: email}

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/", nil)
	app.yandexSignup(w, req, providerSubject, email, profile, state)
	resp := w.Result()
	defer resp.Body.Close()

	loc := resp.Header.Get("Location")
	if strings.Contains(loc, "error=") {
		t.Fatalf("expected success, got %s", loc)
	}
	assertConsentColumns(t, pool, email, "business")
}

// Re-signup with an existing identity must reopen the existing account
// and NEVER change its role, even if the state carries another role.
func TestYandexSignup_ExistingIdentityRoleUnchanged(t *testing.T) {
	skipIfNoDB(t)
	pool := getTestDB(t)
	ctx := context.Background()

	// Existing business account with a Yandex identity
	userID := "test_terms_existing_" + randHex(6)
	email := userID + "@example.com"
	_, err := pool.Exec(ctx,
		"INSERT INTO profiles (id, role, display_name, email) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING",
		userID, "business", "Existing Biz", email)
	if err != nil {
		t.Fatal(err)
	}
	providerSubject := "ya_existing_" + randHex(8)
	identityID := newSecureID()
	now := time.Now()
	_, err = pool.Exec(ctx,
		`INSERT INTO auth_identities (id, user_id, provider, provider_subject, metadata, created_at, updated_at)
		 VALUES ($1,$2,$3,$4,'{}',$5,$6)`,
		identityID, userID, ProviderYandex, providerSubject, now, now)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		pool.Exec(ctx, "DELETE FROM auth_sessions WHERE user_id=$1", userID)
		pool.Exec(ctx, "DELETE FROM auth_identities WHERE user_id=$1", userID)
		pool.Exec(ctx, "DELETE FROM profiles WHERE id=$1", userID)
	})

	app := signupApp(pool)
	state := yandexOAuthState{ReturnTo: "/", Mode: "signup", Role: "client", TermsAccepted: true}
	profile := &yandexProfileResponse{ID: providerSubject, DefaultEmail: email}

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/", nil)
	app.yandexSignup(w, req, providerSubject, email, profile, state)
	resp := w.Result()
	defer resp.Body.Close()

	loc := resp.Header.Get("Location")
	if strings.Contains(loc, "error=") {
		t.Fatalf("expected success redirect, got %s", loc)
	}

	var role string
	err = pool.QueryRow(ctx, "SELECT role FROM profiles WHERE id=$1", userID).Scan(&role)
	if err != nil {
		t.Fatal(err)
	}
	if role != "business" {
		t.Errorf("role = %q, want business (existing account must keep its role)", role)
	}
}
