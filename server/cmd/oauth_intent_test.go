package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// countRecordsForEmail returns profiles/identities/sessions counts that match
// a unique email or subject prefix. Used to prove that failed logins create
// nothing.
func countRecordsForEmail(t *testing.T, pool *pgxpool.Pool, email string) (profiles, identities int) {
	t.Helper()
	ctx := context.Background()
	_ = pool.QueryRow(ctx, "SELECT COUNT(*) FROM profiles WHERE email=$1", email).Scan(&profiles)
	_ = pool.QueryRow(ctx, "SELECT COUNT(*) FROM auth_identities WHERE provider_email=$1", email).Scan(&identities)
	return
}

// countLinkedToSubject counts identities linked to a unique provider subject.
func countLinkedToSubject(t *testing.T, pool *pgxpool.Pool, provider, subject string) int {
	t.Helper()
	var n int
	err := pool.QueryRow(context.Background(),
		"SELECT COUNT(*) FROM auth_identities WHERE provider=$1 AND provider_subject=$2",
		provider, subject).Scan(&n)
	if err != nil {
		t.Fatalf("count identities by subject: %v", err)
	}
	return n
}

// countAuditLoginsByProvider counts oauth_login audit events for a user.
func countAuditLoginsByProvider(t *testing.T, pool *pgxpool.Pool, userID, provider string) int {
	t.Helper()
	var n int
	err := pool.QueryRow(context.Background(),
		"SELECT COUNT(*) FROM audit_events WHERE actor_user_id=$1 AND action='oauth_login' AND metadata->>'provider'=$2",
		userID, provider).Scan(&n)
	if err != nil {
		t.Fatalf("count audit events: %v", err)
	}
	return n
}

// ── Callback query can never change the intent ──

// Login state + signup params in the callback query → login path still runs.
func TestYandexCallback_QueryCannotChangeLoginToSignup(t *testing.T) {
	skipIfNoDB(t)
	pool := getTestDB(t)

	origStore := oauthStore
	defer func() { oauthStore = origStore }()
	oauthStore = newMemoryStateStore()

	t.Setenv("YANDEX_OAUTH_CLIENT_ID", "test-client-id")
	t.Setenv("YANDEX_OAUTH_CLIENT_SECRET", "test-client-secret")

	providerSubject := "ya_cb_intent_" + randHex(8)
	email := providerSubject + "@example.com"

	tokenSrv := successTokenServer("ya_token_intent")
	defer tokenSrv.Close()
	profileSrv := successProfileServer(providerSubject, email, "Intent User")
	defer profileSrv.Close()
	oauthTokenURLOverride = tokenSrv.URL
	oauthProfileURLOverride = profileSrv.URL
	defer func() { oauthTokenURLOverride = ""; oauthProfileURLOverride = "" }()

	app := signupApp(pool)

	// Start as login (no role, no consent in the state).
	startW := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/api/auth/oauth/yandex/start?mode=login", nil)
	app.handleYandexOAuthStart(startW, req)
	startResp := startW.Result()
	loc := startResp.Header.Get("Location")
	startResp.Body.Close()
	u, _ := url.Parse(loc)
	state := u.Query().Get("state")
	var browserNonce string
	for _, c := range startResp.Header.Values("Set-Cookie") {
		if strings.HasPrefix(c, "agentone_yandex_oauth=") {
			browserNonce = strings.SplitN(strings.TrimPrefix(c, "agentone_yandex_oauth="), ";", 2)[0]
		}
	}

	before := snapshotAuthTables(t, pool)

	// Callback tries to turn it into a signup via the query — must be ignored.
	cbReq := httptest.NewRequest("GET", "/api/auth/oauth/yandex/callback?state="+state+"&code=cb&mode=signup&role=business&terms_accepted=true", nil)
	cbReq.AddCookie(&http.Cookie{Name: oauthCookieName, Value: browserNonce})
	cbW := httptest.NewRecorder()
	app.handleYandexOAuthCallback(cbW, cbReq)
	cbResp := cbW.Result()
	cbLoc := cbResp.Header.Get("Location")
	cbResp.Body.Close()

	if !strings.Contains(cbLoc, "error=oauth_yandex_not_linked") {
		t.Errorf("expected login path with oauth_yandex_not_linked, got %s", cbLoc)
	}

	// No account may exist — the signup must not have happened.
	profiles, identities := countRecordsForEmail(t, pool, email)
	if profiles != 0 || identities != 0 {
		t.Errorf("query-triggered signup created records: profiles=%d identities=%d", profiles, identities)
	}
	if n := countLinkedToSubject(t, pool, ProviderYandex, providerSubject); n != 0 {
		t.Errorf("query-triggered signup created identities for subject: %d", n)
	}
	after := snapshotAuthTables(t, pool)
	assertSnapshotsEqual(t, before, after)
}

// Signup state + login params in the callback query → signup path still runs.
func TestYandexCallback_QueryCannotChangeSignupToLogin(t *testing.T) {
	skipIfNoDB(t)
	pool := getTestDB(t)

	origStore := oauthStore
	defer func() { oauthStore = origStore }()
	oauthStore = newMemoryStateStore()

	t.Setenv("YANDEX_OAUTH_CLIENT_ID", "test-client-id")
	t.Setenv("YANDEX_OAUTH_CLIENT_SECRET", "test-client-secret")

	providerSubject := "ya_cb_intent2_" + randHex(8)
	email := providerSubject + "@example.com"
	t.Cleanup(func() { cleanupProfileByEmail(t, pool, email) })

	tokenSrv := successTokenServer("ya_token_intent2")
	defer tokenSrv.Close()
	profileSrv := successProfileServer(providerSubject, email, "Intent User")
	defer profileSrv.Close()
	oauthTokenURLOverride = tokenSrv.URL
	oauthProfileURLOverride = profileSrv.URL
	defer func() { oauthTokenURLOverride = ""; oauthProfileURLOverride = "" }()

	app := signupApp(pool)

	// Start as signup with an explicit role and consent.
	startW := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/api/auth/oauth/yandex/start?mode=signup&role=business&terms_accepted=true", nil)
	app.handleYandexOAuthStart(startW, req)
	startResp := startW.Result()
	loc := startResp.Header.Get("Location")
	startResp.Body.Close()
	u, _ := url.Parse(loc)
	state := u.Query().Get("state")
	var browserNonce string
	for _, c := range startResp.Header.Values("Set-Cookie") {
		if strings.HasPrefix(c, "agentone_yandex_oauth=") {
			browserNonce = strings.SplitN(strings.TrimPrefix(c, "agentone_yandex_oauth="), ";", 2)[0]
		}
	}

	// Callback tries to downgrade to login — the stored signup intent wins.
	cbReq := httptest.NewRequest("GET", "/api/auth/oauth/yandex/callback?state="+state+"&code=cb&mode=login", nil)
	cbReq.AddCookie(&http.Cookie{Name: oauthCookieName, Value: browserNonce})
	cbW := httptest.NewRecorder()
	app.handleYandexOAuthCallback(cbW, cbReq)
	cbResp := cbW.Result()
	cbLoc := cbResp.Header.Get("Location")
	cbResp.Body.Close()

	if strings.Contains(cbLoc, "error=") {
		t.Fatalf("expected success redirect, got %s", cbLoc)
	}

	// The signup ran: business profile with consent, exactly one identity.
	var role string
	var termsSet bool
	err := pool.QueryRow(context.Background(),
		"SELECT role, terms_accepted_at IS NOT NULL FROM profiles WHERE email=$1", email).Scan(&role, &termsSet)
	if err != nil {
		t.Fatalf("profile lookup: %v", err)
	}
	if role != "business" {
		t.Errorf("role = %q, want business (from state, not query)", role)
	}
	if !termsSet {
		t.Error("terms_accepted_at not set")
	}
	profiles, identities := countRecordsForEmail(t, pool, email)
	if profiles != 1 || identities != 1 {
		t.Errorf("records: profiles=%d identities=%d, want 1/1", profiles, identities)
	}
}

// ── Login with unknown subject creates nothing ──

func TestYandexLogin_UnknownSubject_NoRecords(t *testing.T) {
	skipIfNoDB(t)
	pool := getTestDB(t)
	app := &App{db: pool, secCfg: AccountSecurityConfig{AppPublicURL: "http://testapp"}}
	email := "ya_norecords_" + randHex(8) + "@example.com"
	subject := "ya_norecords_sub_" + randHex(8)
	state := yandexOAuthState{ReturnTo: "/", Mode: "login"}

	before := snapshotAuthTables(t, pool)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/", nil)
	app.yandexLogin(w, req, subject, email, nil, state)
	resp := w.Result()
	defer resp.Body.Close()

	if !strings.Contains(resp.Header.Get("Location"), "error=oauth_yandex_not_linked") {
		t.Errorf("expected oauth_yandex_not_linked, got %s", resp.Header.Get("Location"))
	}
	profiles, identities := countRecordsForEmail(t, pool, email)
	if profiles != 0 || identities != 0 {
		t.Errorf("login created records: profiles=%d identities=%d", profiles, identities)
	}
	if n := countLinkedToSubject(t, pool, ProviderYandex, subject); n != 0 {
		t.Errorf("login created identities for subject: %d", n)
	}
	after := snapshotAuthTables(t, pool)
	assertSnapshotsEqual(t, before, after)
}

// ── Login ignores role/consent from the OAuth state ──

func TestYandexLogin_StateRoleAndConsentIgnored(t *testing.T) {
	skipIfNoDB(t)
	pool := getTestDB(t)
	ctx := context.Background()

	userID := "test_yandex_login_role_" + randHex(8)
	email := userID + "@example.com"
	_, err := pool.Exec(ctx,
		"INSERT INTO profiles (id, role, display_name, email) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING",
		userID, "client", "Test User", email)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		pool.Exec(ctx, "DELETE FROM auth_identities WHERE user_id=$1", userID)
		pool.Exec(ctx, "DELETE FROM auth_sessions WHERE user_id=$1", userID)
		pool.Exec(ctx, "DELETE FROM profiles WHERE id=$1", userID)
	})

	providerSubject := "ya_login_role_" + randHex(8)
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
	// A hostile state carries business role + consent; login mode must ignore both.
	state := yandexOAuthState{ReturnTo: "/", Mode: "login", Role: "business", TermsAccepted: true}

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/", nil)
	app.yandexLogin(w, req, providerSubject, email, nil, state)
	resp := w.Result()
	defer resp.Body.Close()

	if strings.Contains(resp.Header.Get("Location"), "error=") {
		t.Fatalf("expected success, got %s", resp.Header.Get("Location"))
	}

	var role string
	err = pool.QueryRow(ctx, "SELECT role FROM profiles WHERE id=$1", userID).Scan(&role)
	if err != nil {
		t.Fatal(err)
	}
	if role != "client" {
		t.Errorf("role = %q, want client (never changed by login)", role)
	}

	// Exactly one session was created, no new identity, no organization.
	var sessions, identities, orgs int
	_ = pool.QueryRow(ctx, "SELECT COUNT(*) FROM auth_sessions WHERE user_id=$1", userID).Scan(&sessions)
	_ = pool.QueryRow(ctx, "SELECT COUNT(*) FROM auth_identities WHERE user_id=$1", userID).Scan(&identities)
	_ = pool.QueryRow(ctx, "SELECT COUNT(*) FROM organizations WHERE user_id=$1", userID).Scan(&orgs)
	if sessions != 1 {
		t.Errorf("sessions = %d, want 1", sessions)
	}
	if identities != 1 {
		t.Errorf("identities = %d, want 1", identities)
	}
	if orgs != 0 {
		t.Errorf("organizations = %d, want 0 (login never touches orgs)", orgs)
	}
}

// ── Audit provider attribution ──

func TestYandexLogin_AuditProviderIsYandex(t *testing.T) {
	skipIfNoDB(t)
	pool := getTestDB(t)
	ctx := context.Background()

	userID := "test_yandex_audit_" + randHex(8)
	email := userID + "@example.com"
	_, err := pool.Exec(ctx,
		"INSERT INTO profiles (id, role, display_name, email) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING",
		userID, "client", "Test User", email)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		pool.Exec(ctx, "DELETE FROM audit_events WHERE actor_user_id=$1", userID)
		pool.Exec(ctx, "DELETE FROM auth_identities WHERE user_id=$1", userID)
		pool.Exec(ctx, "DELETE FROM auth_sessions WHERE user_id=$1", userID)
		pool.Exec(ctx, "DELETE FROM profiles WHERE id=$1", userID)
	})

	providerSubject := "ya_audit_" + randHex(8)
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
	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/", nil)
	app.yandexLogin(w, req, providerSubject, email, nil, yandexOAuthState{ReturnTo: "/", Mode: "login"})
	w.Result().Body.Close()

	if got := countAuditLoginsByProvider(t, pool, userID, "yandex"); got != 1 {
		t.Errorf("yandex login audits = %d, want 1", got)
	}
}
