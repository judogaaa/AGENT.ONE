package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

// ── Helpers ──

// doEmailSignin posts a raw JSON body to handleSignin.
func doEmailSignin(t *testing.T, app *App, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest("POST", "/api/auth/signin", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	app.handleSignin(w, req)
	return w
}

// signinError decodes the error message from a signin response.
func signinError(t *testing.T, w *httptest.ResponseRecorder) string {
	t.Helper()
	var body struct {
		Error string `json:"error"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &body)
	return body.Error
}

// signinProfile decodes the profile object from a successful signin response.
func signinProfile(t *testing.T, w *httptest.ResponseRecorder) map[string]interface{} {
	t.Helper()
	var body struct {
		Data struct {
			Token   string                 `json:"token"`
			Profile map[string]interface{} `json:"profile"`
		} `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body.Data.Token == "" {
		t.Fatal("no token in signin response")
	}
	return body.Data.Profile
}

// countUserRows returns profile/identity/session counts for a user id.
func countUserRows(t *testing.T, pool *pgxpool.Pool, userID string) (profiles, identities, sessions int) {
	t.Helper()
	ctx := context.Background()
	_ = pool.QueryRow(ctx, "SELECT COUNT(*) FROM profiles WHERE id=$1", userID).Scan(&profiles)
	_ = pool.QueryRow(ctx, "SELECT COUNT(*) FROM auth_identities WHERE user_id=$1", userID).Scan(&identities)
	_ = pool.QueryRow(ctx, "SELECT COUNT(*) FROM auth_sessions WHERE user_id=$1", userID).Scan(&sessions)
	return
}

// authTableSnapshot is a before/after snapshot of the five record categories
// the auth flows may touch. Password credentials are not stored in a separate
// table in this project — the password hash lives in the `password` column of
// `profiles`, so credentials are counted as profiles rows with a password set.
type authTableSnapshot struct {
	Profiles      int // profiles rows
	Credentials   int // profiles rows with password (email/password credentials)
	Identities    int // auth_identities rows
	Sessions      int // auth_sessions rows
	Organizations int // organizations rows
}

// snapshotAuthTables takes a global before/after snapshot across the five
// categories. Global counts are safe here because Go runs tests in a package
// sequentially (no t.Parallel in these files) and each test creates its own
// unique fixtures.
func snapshotAuthTables(t *testing.T, pool *pgxpool.Pool) authTableSnapshot {
	t.Helper()
	ctx := context.Background()
	var s authTableSnapshot
	if err := pool.QueryRow(ctx, "SELECT COUNT(*) FROM profiles").Scan(&s.Profiles); err != nil {
		t.Fatalf("count profiles: %v", err)
	}
	if err := pool.QueryRow(ctx, "SELECT COUNT(*) FROM profiles WHERE password IS NOT NULL AND password <> ''").Scan(&s.Credentials); err != nil {
		t.Fatalf("count credentials: %v", err)
	}
	if err := pool.QueryRow(ctx, "SELECT COUNT(*) FROM auth_identities").Scan(&s.Identities); err != nil {
		t.Fatalf("count auth_identities: %v", err)
	}
	if err := pool.QueryRow(ctx, "SELECT COUNT(*) FROM auth_sessions").Scan(&s.Sessions); err != nil {
		t.Fatalf("count auth_sessions: %v", err)
	}
	if err := pool.QueryRow(ctx, "SELECT COUNT(*) FROM organizations").Scan(&s.Organizations); err != nil {
		t.Fatalf("count organizations: %v", err)
	}
	return s
}

// assertSnapshotsEqual fails the test when a global before/after snapshot
// changed in any of the five categories.
func assertSnapshotsEqual(t *testing.T, before, after authTableSnapshot) {
	t.Helper()
	if after.Profiles != before.Profiles {
		t.Errorf("profiles changed: before=%d after=%d", before.Profiles, after.Profiles)
	}
	if after.Credentials != before.Credentials {
		t.Errorf("credentials changed: before=%d after=%d", before.Credentials, after.Credentials)
	}
	if after.Identities != before.Identities {
		t.Errorf("auth_identities changed: before=%d after=%d", before.Identities, after.Identities)
	}
	if after.Sessions != before.Sessions {
		t.Errorf("auth_sessions changed: before=%d after=%d", before.Sessions, after.Sessions)
	}
	if after.Organizations != before.Organizations {
		t.Errorf("organizations changed: before=%d after=%d", before.Organizations, after.Organizations)
	}
}

// emailLinkedCounts counts records that could be linked to a unique email:
// profiles, password credentials and auth_identities.
func emailLinkedCounts(t *testing.T, pool *pgxpool.Pool, email string) (profiles, credentials, identities int) {
	t.Helper()
	ctx := context.Background()
	_ = pool.QueryRow(ctx, "SELECT COUNT(*) FROM profiles WHERE LOWER(BTRIM(email))=LOWER(BTRIM($1))", email).Scan(&profiles)
	_ = pool.QueryRow(ctx, "SELECT COUNT(*) FROM profiles WHERE LOWER(BTRIM(email))=LOWER(BTRIM($1)) AND password IS NOT NULL AND password <> ''", email).Scan(&credentials)
	_ = pool.QueryRow(ctx, "SELECT COUNT(*) FROM auth_identities WHERE provider_email=$1 OR provider_username=$1", email).Scan(&identities)
	return
}

// hasSSORefreshCookie reports whether the response sets the SSO refresh cookie.
func hasSSORefreshCookie(t *testing.T, w *httptest.ResponseRecorder) bool {
	t.Helper()
	for _, c := range w.Result().Cookies() {
		if c.Name == ssoRefreshCookieName {
			return true
		}
	}
	return false
}

// ── Login never creates accounts ──

func TestEmailSignin_UnknownEmail_NoRecordsCreated(t *testing.T) {
	pool := getTestDB(t)
	app := signupApp(pool)
	ctx := context.Background()
	email := "test_signin_unknown_" + randHex(6) + "@example.com"

	before := snapshotAuthTables(t, pool)

	w := doEmailSignin(t, app, `{"email":"`+email+`","password":"123456"}`)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", w.Code)
	}
	if got := signinError(t, w); got != "invalid credentials" {
		t.Errorf("error = %q", got)
	}

	// The unknown email must have no linked profile, no password credential,
	// no identity — and no global rows may appear in any category.
	var profiles, credentials, identities int
	_ = pool.QueryRow(ctx, "SELECT COUNT(*) FROM profiles WHERE LOWER(BTRIM(email))=LOWER(BTRIM($1))", email).Scan(&profiles)
	_ = pool.QueryRow(ctx, "SELECT COUNT(*) FROM profiles WHERE LOWER(BTRIM(email))=LOWER(BTRIM($1)) AND password IS NOT NULL AND password <> ''", email).Scan(&credentials)
	_ = pool.QueryRow(ctx, "SELECT COUNT(*) FROM auth_identities WHERE provider_email=$1 OR provider_username=$1", email).Scan(&identities)
	if profiles != 0 || credentials != 0 || identities != 0 {
		t.Errorf("login created records: profiles=%d credentials=%d identities=%d", profiles, credentials, identities)
	}

	after := snapshotAuthTables(t, pool)
	assertSnapshotsEqual(t, before, after)
}

func TestEmailSignin_WrongPassword_NoNewRecords(t *testing.T) {
	pool := getTestDB(t)
	app := signupApp(pool)
	ctx := context.Background()
	email := "test_signin_wrongpw_" + randHex(6) + "@example.com"

	reg := doEmailSignup(t, app, `{"email":"`+email+`","password":"123456","displayName":"X","role":"client","terms_accepted":true,"pd_consent":true}`)
	if reg.Code != http.StatusOK {
		t.Fatalf("signup: expected 200, got %d", reg.Code)
	}
	t.Cleanup(func() { cleanupProfileByEmail(t, pool, email) })
	var uid string
	if err := pool.QueryRow(ctx, "SELECT id FROM profiles WHERE email=$1", email).Scan(&uid); err != nil {
		t.Fatal(err)
	}

	before := snapshotAuthTables(t, pool)
	profilesBefore, credentialsBefore, identitiesBefore := emailLinkedCounts(t, pool, email)

	w := doEmailSignin(t, app, `{"email":"`+email+`","password":"wrong-password"}`)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", w.Code)
	}

	// The existing account stays untouched: 1 profile, 1 credential, 0 identities.
	profiles, credentials, identities := emailLinkedCounts(t, pool, email)
	if profiles != 1 || credentials != 1 || identities != 0 {
		t.Errorf("account records wrong: profiles=%d credentials=%d identities=%d, want 1/1/0", profiles, credentials, identities)
	}
	if profilesBefore != 1 || credentialsBefore != 1 || identitiesBefore != 0 {
		t.Fatalf("pre-condition wrong: profiles=%d credentials=%d identities=%d, want 1/1/0", profilesBefore, credentialsBefore, identitiesBefore)
	}

	// No new session and no global row in any category.
	_, _, sessions := countUserRows(t, pool, uid)
	if sessions != 1 {
		t.Errorf("sessions = %d, want 1 (only the signup session)", sessions)
	}
	after := snapshotAuthTables(t, pool)
	assertSnapshotsEqual(t, before, after)
}

func TestEmailSignin_ParallelUnknownEmail_NoRecordsCreated(t *testing.T) {
	pool := getTestDB(t)
	app := signupApp(pool)
	ctx := context.Background()
	email := "test_signin_race_" + randHex(6) + "@example.com"

	before := snapshotAuthTables(t, pool)

	const n = 8
	var wg sync.WaitGroup
	codes := make([]int, n)
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			w := doEmailSignin(t, app, `{"email":"`+email+`","password":"123456"}`)
			codes[idx] = w.Code
		}(i)
	}
	wg.Wait()

	for i, code := range codes {
		if code != http.StatusUnauthorized {
			t.Errorf("request %d: expected 401, got %d", i, code)
		}
	}

	// No profile, no credential, no identity may exist for the unknown email.
	var profiles, credentials, identities int
	_ = pool.QueryRow(ctx, "SELECT COUNT(*) FROM profiles WHERE LOWER(BTRIM(email))=LOWER(BTRIM($1))", email).Scan(&profiles)
	_ = pool.QueryRow(ctx, "SELECT COUNT(*) FROM profiles WHERE LOWER(BTRIM(email))=LOWER(BTRIM($1)) AND password IS NOT NULL AND password <> ''", email).Scan(&credentials)
	_ = pool.QueryRow(ctx, "SELECT COUNT(*) FROM auth_identities WHERE provider_email=$1 OR provider_username=$1", email).Scan(&identities)
	if profiles != 0 || credentials != 0 || identities != 0 {
		t.Errorf("parallel logins created records: profiles=%d credentials=%d identities=%d", profiles, credentials, identities)
	}

	after := snapshotAuthTables(t, pool)
	assertSnapshotsEqual(t, before, after)
}

// ── Login ignores signup parameters ──

func TestEmailSignin_RoleAndTermsInBodyIgnored(t *testing.T) {
	pool := getTestDB(t)
	app := signupApp(pool)
	ctx := context.Background()
	email := "test_signin_roleign_" + randHex(6) + "@example.com"
	t.Cleanup(func() { cleanupProfileByEmail(t, pool, email) })

	reg := doEmailSignup(t, app, `{"email":"`+email+`","password":"123456","displayName":"X","role":"client","terms_accepted":true,"pd_consent":true}`)
	if reg.Code != http.StatusOK {
		t.Fatalf("signup: expected 200, got %d", reg.Code)
	}

	// role, terms_accepted and mode in the signin body must be ignored —
	// the login endpoint never registers, never changes the role.
	w := doEmailSignin(t, app, `{"email":"`+email+`","password":"123456","role":"business","terms_accepted":true,"mode":"signup"}`)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d (%s)", w.Code, signinError(t, w))
	}
	profile := signinProfile(t, w)
	if profile["role"] != "client" {
		t.Errorf("role = %v, want client (unchanged)", profile["role"])
	}

	var role string
	if err := pool.QueryRow(ctx, "SELECT role FROM profiles WHERE id=$1", profile["id"]).Scan(&role); err != nil {
		t.Fatal(err)
	}
	if role != "client" {
		t.Errorf("db role = %q, want client", role)
	}
}

// ── Login success path ──

func TestEmailSignin_Success_CreatesSessionAndCookie(t *testing.T) {
	pool := getTestDB(t)
	app := signupApp(pool)
	ctx := context.Background()
	email := "test_signin_ok_" + randHex(6) + "@example.com"
	t.Cleanup(func() { cleanupProfileByEmail(t, pool, email) })

	reg := doEmailSignup(t, app, `{"email":"`+email+`","password":"123456","displayName":"X","role":"client","terms_accepted":true,"pd_consent":true}`)
	if reg.Code != http.StatusOK {
		t.Fatalf("signup: expected 200, got %d", reg.Code)
	}
	var uid string
	if err := pool.QueryRow(ctx, "SELECT id FROM profiles WHERE email=$1", email).Scan(&uid); err != nil {
		t.Fatal(err)
	}

	w := doEmailSignin(t, app, `{"email":"`+email+`","password":"123456"}`)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d (%s)", w.Code, signinError(t, w))
	}
	if !hasSSORefreshCookie(t, w) {
		t.Error("SSO refresh cookie not set")
	}
	profile := signinProfile(t, w)
	if profile["id"] != uid {
		t.Errorf("profile id = %v, want %s", profile["id"], uid)
	}

	// Exactly one new session row (signup created one, signin created one more).
	_, _, sessions := countUserRows(t, pool, uid)
	if sessions != 2 {
		t.Errorf("sessions = %d, want 2 (signup + signin)", sessions)
	}

	// Signin must never create auth identities.
	_, identities, _ := countUserRows(t, pool, uid)
	if identities != 0 {
		t.Errorf("identities = %d, want 0", identities)
	}
}

func TestEmailSignin_NormalizesEmailCase(t *testing.T) {
	pool := getTestDB(t)
	app := signupApp(pool)
	email := "test_signin_case_" + randHex(6) + "@example.com"
	t.Cleanup(func() { cleanupProfileByEmail(t, pool, email) })

	reg := doEmailSignup(t, app, `{"email":"`+email+`","password":"123456","displayName":"X","role":"client","terms_accepted":true,"pd_consent":true}`)
	if reg.Code != http.StatusOK {
		t.Fatalf("signup: expected 200, got %d", reg.Code)
	}

	w := doEmailSignin(t, app, `{"email":"`+strings.ToUpper(email)+`","password":"123456"}`)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 for upper-case email, got %d (%s)", w.Code, signinError(t, w))
	}
}

// ── Signup never doubles accounts ──

func TestEmailSignup_DuplicateEmailRejected(t *testing.T) {
	pool := getTestDB(t)
	app := signupApp(pool)
	ctx := context.Background()
	email := "test_signup_dup_" + randHex(6) + "@example.com"
	t.Cleanup(func() { cleanupProfileByEmail(t, pool, email) })

	first := doEmailSignup(t, app, `{"email":"`+email+`","password":"123456","displayName":"X","role":"client","terms_accepted":true,"pd_consent":true}`)
	if first.Code != http.StatusOK {
		t.Fatalf("first signup: expected 200, got %d", first.Code)
	}

	second := doEmailSignup(t, app, `{"email":"`+email+`","password":"123456","displayName":"Y","role":"business","terms_accepted":true,"pd_consent":true}`)
	if second.Code != http.StatusConflict {
		t.Fatalf("second signup: expected 409, got %d", second.Code)
	}
	if got := signupError(t, second); got != "email taken" {
		t.Errorf("error = %q, want %q", got, "email taken")
	}

	var profiles, sessions int
	_ = pool.QueryRow(ctx, "SELECT COUNT(*) FROM profiles WHERE email=$1", email).Scan(&profiles)
	_ = pool.QueryRow(ctx, "SELECT COUNT(*) FROM auth_sessions WHERE user_id=(SELECT id FROM profiles WHERE email=$1)", email).Scan(&sessions)
	if profiles != 1 || sessions != 1 {
		t.Errorf("duplicate signup created records: profiles=%d sessions=%d", profiles, sessions)
	}
}
