package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// logSessions queries all auth_sessions for a given user ID and logs
// id, token_family, active status (revoked_at), and hash suffix.
// Does NOT log full refresh tokens — only the last 8 hex chars of the hash.
func logSessions(t *testing.T, ctx context.Context, db *pgxpool.Pool, userID, label string) {
	t.Helper()
	rows, err := db.Query(ctx,
		`SELECT id, token_family, RIGHT(refresh_token_hash,8) AS hash_suffix,
		        revoked_at IS NOT NULL AS is_revoked,
		        COALESCE(revoke_reason,'') AS reason
		 FROM auth_sessions
		 WHERE user_id = $1
		 ORDER BY created_at`, userID)
	if err != nil {
		t.Logf("  [%s] query error: %v", label, err)
		return
	}
	defer rows.Close()
	count := 0
	for rows.Next() {
		count++
		var id, family, hashSuffix, reason string
		var revoked bool
		if err := rows.Scan(&id, &family, &hashSuffix, &revoked, &reason); err != nil {
			t.Logf("  [%s] scan error: %v", label, err)
			continue
		}
		status := "ACTIVE"
		if revoked {
			status = "REVOKED(" + reason + ")"
		}
		t.Logf("  [%s]  sess=%s  family=%s  hash=..%s  %s", label, id[len(id)-12:], family, hashSuffix, status)
	}
	if count == 0 {
		t.Logf("  [%s]  (no sessions)", label)
	}
}

// ── DB integration test helpers ──

func dualCookieDB(t *testing.T) *pgxpool.Pool {
	t.Helper()
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("set DATABASE_URL for dual-cookie migration DB tests")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	t.Cleanup(pool.Close)

	// Bootstrap schema exactly as the application does (main.go lines 443, 457-469)
	if _, err := pool.Exec(ctx, `CREATE TABLE IF NOT EXISTS profiles (
		id TEXT PRIMARY KEY, role TEXT DEFAULT 'client',
		display_name TEXT, email TEXT UNIQUE, password TEXT,
		phone TEXT, first_name TEXT, last_name TEXT,
		patronymic TEXT, birth_date TEXT
	)`); err != nil {
		t.Fatalf("create profiles table: %v", err)
	}
	for _, col := range []string{
		"avatar_url TEXT",
		"delivery_city TEXT", "delivery_address TEXT", "delivery_comment TEXT",
		"payer_type TEXT", "billing_name TEXT", "billing_company_name TEXT", "billing_inn TEXT",
	} {
		if _, err := pool.Exec(ctx, "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS "+col); err != nil {
			t.Fatalf("add column %s: %v", col, err)
		}
	}

	if err := ensureAccountSecuritySchema(ctx, pool); err != nil {
		t.Fatalf("schema: %v", err)
	}

	// wipe any leftover test data
	pool.Exec(ctx, "DELETE FROM auth_sessions WHERE user_id LIKE 'test_dual_%'")
	pool.Exec(ctx, "DELETE FROM profiles WHERE id LIKE 'test_dual_%'")
	t.Cleanup(func() {
		pool.Exec(ctx, "DELETE FROM auth_sessions WHERE user_id LIKE 'test_dual_%'")
		pool.Exec(ctx, "DELETE FROM profiles WHERE id LIKE 'test_dual_%'")
	})
	return pool
}

func insertProfile(t *testing.T, ctx context.Context, db *pgxpool.Pool, id, email string) {
	t.Helper()
	_, err := db.Exec(ctx,
		`INSERT INTO profiles (id, role, display_name, email, password)
		 VALUES ($1,'client','Test',$2,'hash')
		 ON CONFLICT (id) DO UPDATE SET email=$2`,
		id, email)
	if err != nil {
		t.Fatalf("insert profile: %v", err)
	}
}

func insertSession(t *testing.T, ctx context.Context, db *pgxpool.Pool, userID string, ttlHours int) (rawToken, family string) {
	t.Helper()
	raw, err := GenerateToken()
	if err != nil {
		t.Fatalf("GenerateToken: %v", err)
	}
	hash, err := HashToken(raw)
	if err != nil {
		t.Fatalf("HashToken: %v", err)
	}
	family = newID()
	sessID := newID()
	expiresAt := time.Now().Add(time.Duration(ttlHours) * time.Hour)
	_, err = db.Exec(ctx,
		`INSERT INTO auth_sessions (id, user_id, refresh_token_hash, token_family, created_at, expires_at)
		 VALUES ($1,$2,$3,$4,NOW(),$5)`,
		sessID, userID, hash, family, expiresAt)
	if err != nil {
		t.Fatalf("insert session: %v", err)
	}
	return raw, family
}

func dualCookieApp(db *pgxpool.Pool) *App {
	return &App{
		db:     db,
		jwtKey: []byte("test-jwt-secret-key-32-chars-min!!"),
		secCfg: AccountSecurityConfig{
			AccessTokenTTLMinutes: 15,
			RefreshTokenTTLHours:  24,
		},
	}
}

func countActive(t *testing.T, ctx context.Context, db *pgxpool.Pool, family string) int {
	t.Helper()
	var n int
	db.QueryRow(ctx, `SELECT COUNT(*) FROM auth_sessions WHERE token_family=$1 AND revoked_at IS NULL`, family).Scan(&n)
	return n
}

func assertCookie(t *testing.T, cookies []*http.Cookie, name string, wantMaxAge int, wantSecure bool, wantDomain string) *http.Cookie {
	t.Helper()
	for _, c := range cookies {
		if c.Name == name {
			if wantMaxAge >= 0 && c.MaxAge <= 0 {
				t.Errorf("cookie %s: expected MaxAge>0, got %d", name, c.MaxAge)
			}
			if wantMaxAge < 0 && c.MaxAge >= 0 {
				t.Errorf("cookie %s: expected MaxAge<0, got %d", name, c.MaxAge)
			}
			if c.Secure != wantSecure {
				t.Errorf("cookie %s: Secure=%v, want %v", name, c.Secure, wantSecure)
			}
			if wantDomain != "" && c.Domain != wantDomain {
				t.Errorf("cookie %s: Domain=%q, want %q", name, c.Domain, wantDomain)
			}
			return c
		}
	}
	t.Fatalf("cookie %s not found in response", name)
	return nil
}

func assertCookieCleared(t *testing.T, cookies []*http.Cookie, name string) {
	t.Helper()
	for _, c := range cookies {
		if c.Name == name {
			if c.MaxAge >= 0 {
				t.Errorf("cookie %s: expected MaxAge=-1, got %d", name, c.MaxAge)
			}
			return
		}
	}
	// absent is also acceptable (no Set-Cookie header for this name)
}

// ── Tests ──

// 1. SSO-only refresh: normal rotation, legacy cookie never set.
func TestDualCookieRefresh_SSOOnly(t *testing.T) {
	db := dualCookieDB(t)
	ctx := context.Background()
	uid := "test_dual_1"

	insertProfile(t, ctx, db, uid, "dual1@test.dev")
	token, fam := insertSession(t, ctx, db, uid, 24)

	logSessions(t, ctx, db, uid, "before")

	app := dualCookieApp(db)
	req := httptest.NewRequest("POST", "/api/auth/refresh", nil)
	req.Header.Set("User-Agent", "test-agent")
	req.Header.Set("Accept-Language", "en")
	req.AddCookie(&http.Cookie{Name: ssoRefreshCookieName, Value: token})
	rec := httptest.NewRecorder()

	app.handleRefresh(rec, req)
	resp := rec.Result()
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}

	cookies := resp.Cookies()
	assertCookie(t, cookies, ssoRefreshCookieName, 86400, false, "")
	// legacy cookie may or may not be in response — handleRefresh only calls
	// clearLegacyCookie when legacyErr == nil (no legacy cookie in request -> absent).

	logSessions(t, ctx, db, uid, "after")

	if n := countActive(t, ctx, db, fam); n != 1 {
		t.Errorf("expected 1 active session in family %s, got %d", fam, n)
	}
}

// 2. Legacy-only refresh: migration to SSO, legacy cookie cleared.
func TestDualCookieRefresh_LegacyOnly(t *testing.T) {
	db := dualCookieDB(t)
	ctx := context.Background()
	uid := "test_dual_2"

	insertProfile(t, ctx, db, uid, "dual2@test.dev")
	token, fam := insertSession(t, ctx, db, uid, 24)

	logSessions(t, ctx, db, uid, "before")

	app := dualCookieApp(db)
	req := httptest.NewRequest("POST", "/api/auth/refresh", nil)
	req.Header.Set("User-Agent", "test-agent")
	req.Header.Set("Accept-Language", "en")
	req.AddCookie(&http.Cookie{Name: refreshCookieName, Value: token})
	rec := httptest.NewRecorder()

	app.handleRefresh(rec, req)
	resp := rec.Result()
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}

	cookies := resp.Cookies()
	assertCookie(t, cookies, ssoRefreshCookieName, 86400, false, "")
	assertCookieCleared(t, cookies, refreshCookieName)

	logSessions(t, ctx, db, uid, "after")

	if n := countActive(t, ctx, db, fam); n != 1 {
		t.Errorf("expected 1 active session in family %s, got %d", fam, n)
	}
}

// 3. Both cookies carry the same token (pre-migration state): no secondary revoke.
func TestDualCookieRefresh_SameTokenBothCookies(t *testing.T) {
	db := dualCookieDB(t)
	ctx := context.Background()
	uid := "test_dual_3"

	insertProfile(t, ctx, db, uid, "dual3@test.dev")
	token, fam := insertSession(t, ctx, db, uid, 24)

	logSessions(t, ctx, db, uid, "before")

	app := dualCookieApp(db)
	req := httptest.NewRequest("POST", "/api/auth/refresh", nil)
	req.Header.Set("User-Agent", "test-agent")
	req.Header.Set("Accept-Language", "en")
	req.AddCookie(&http.Cookie{Name: ssoRefreshCookieName, Value: token})
	req.AddCookie(&http.Cookie{Name: refreshCookieName, Value: token})
	rec := httptest.NewRecorder()

	app.handleRefresh(rec, req)
	resp := rec.Result()
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}

	cookies := resp.Cookies()
	assertCookie(t, cookies, ssoRefreshCookieName, 86400, false, "")
	assertCookieCleared(t, cookies, refreshCookieName)

	logSessions(t, ctx, db, uid, "after")

	// Only SSO family should still be active (rotated)
	if n := countActive(t, ctx, db, fam); n != 1 {
		t.Errorf("expected 1 active session in family %s, got %d", fam, n)
	}
}

// 4. Both cookies carry DIFFERENT tokens: secondary cleanup revokes legacy family.
func TestDualCookieRefresh_DifferentTokens(t *testing.T) {
	db := dualCookieDB(t)
	ctx := context.Background()
	uid := "test_dual_4"

	insertProfile(t, ctx, db, uid, "dual4@test.dev")
	ssoToken, ssoFam := insertSession(t, ctx, db, uid, 24)
	legacyToken, legacyFam := insertSession(t, ctx, db, uid, 24)

	logSessions(t, ctx, db, uid, "before")

	app := dualCookieApp(db)
	req := httptest.NewRequest("POST", "/api/auth/refresh", nil)
	req.Header.Set("User-Agent", "test-agent")
	req.Header.Set("Accept-Language", "en")
	req.AddCookie(&http.Cookie{Name: ssoRefreshCookieName, Value: ssoToken})
	req.AddCookie(&http.Cookie{Name: refreshCookieName, Value: legacyToken})
	rec := httptest.NewRecorder()

	app.handleRefresh(rec, req)
	resp := rec.Result()
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}

	cookies := resp.Cookies()
	assertCookie(t, cookies, ssoRefreshCookieName, 86400, false, "")
	assertCookieCleared(t, cookies, refreshCookieName)

	logSessions(t, ctx, db, uid, "after")

	// SSO family should still be active (rotated)
	if n := countActive(t, ctx, db, ssoFam); n != 1 {
		t.Errorf("expected 1 active session in SSO family %s, got %d", ssoFam, n)
	}
	// Legacy family should be fully revoked
	if n := countActive(t, ctx, db, legacyFam); n != 0 {
		t.Errorf("expected 0 active sessions in legacy family %s, got %d", legacyFam, n)
	}
}

// 5. SSO valid + legacy damaged (invalid format): no secondary revoke, legacy cleared.
func TestDualCookieRefresh_InvalidLegacyToken(t *testing.T) {
	db := dualCookieDB(t)
	ctx := context.Background()
	uid := "test_dual_5"

	insertProfile(t, ctx, db, uid, "dual5@test.dev")
	ssoToken, ssoFam := insertSession(t, ctx, db, uid, 24)

	logSessions(t, ctx, db, uid, "before")

	app := dualCookieApp(db)
	req := httptest.NewRequest("POST", "/api/auth/refresh", nil)
	req.Header.Set("User-Agent", "test-agent")
	req.Header.Set("Accept-Language", "en")
	req.AddCookie(&http.Cookie{Name: ssoRefreshCookieName, Value: ssoToken})
	req.AddCookie(&http.Cookie{Name: refreshCookieName, Value: "not-valid"})
	rec := httptest.NewRecorder()

	app.handleRefresh(rec, req)
	resp := rec.Result()
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}

	cookies := resp.Cookies()
	assertCookie(t, cookies, ssoRefreshCookieName, 86400, false, "")
	assertCookieCleared(t, cookies, refreshCookieName)

	logSessions(t, ctx, db, uid, "after")

	// SSO family should still be active
	if n := countActive(t, ctx, db, ssoFam); n != 1 {
		t.Errorf("expected 1 active session in SSO family %s, got %d", ssoFam, n)
	}
}

// 6. Logout with same token in both cookies: single family revoked.
func TestDualCookieLogout_SameToken(t *testing.T) {
	db := dualCookieDB(t)
	ctx := context.Background()
	uid := "test_dual_6"

	insertProfile(t, ctx, db, uid, "dual6@test.dev")
	token, fam := insertSession(t, ctx, db, uid, 24)

	logSessions(t, ctx, db, uid, "before")

	app := dualCookieApp(db)
	req := httptest.NewRequest("POST", "/api/auth/logout", nil)
	req.AddCookie(&http.Cookie{Name: ssoRefreshCookieName, Value: token})
	req.AddCookie(&http.Cookie{Name: refreshCookieName, Value: token})
	rec := httptest.NewRecorder()

	app.handleLogout(rec, req)
	resp := rec.Result()
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}

	cookies := resp.Cookies()
	assertCookieCleared(t, cookies, ssoRefreshCookieName)
	assertCookieCleared(t, cookies, refreshCookieName)

	logSessions(t, ctx, db, uid, "after")

	if n := countActive(t, ctx, db, fam); n != 0 {
		t.Errorf("expected 0 active sessions in family %s, got %d", fam, n)
	}
}

// 7. Logout with DIFFERENT tokens: both families revoked.
func TestDualCookieLogout_DifferentTokens(t *testing.T) {
	db := dualCookieDB(t)
	ctx := context.Background()
	uid := "test_dual_7"

	insertProfile(t, ctx, db, uid, "dual7@test.dev")
	ssoToken, ssoFam := insertSession(t, ctx, db, uid, 24)
	legacyToken, legacyFam := insertSession(t, ctx, db, uid, 24)

	logSessions(t, ctx, db, uid, "before")

	app := dualCookieApp(db)
	req := httptest.NewRequest("POST", "/api/auth/logout", nil)
	req.AddCookie(&http.Cookie{Name: ssoRefreshCookieName, Value: ssoToken})
	req.AddCookie(&http.Cookie{Name: refreshCookieName, Value: legacyToken})
	rec := httptest.NewRecorder()

	app.handleLogout(rec, req)
	resp := rec.Result()
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}

	cookies := resp.Cookies()
	assertCookieCleared(t, cookies, ssoRefreshCookieName)
	assertCookieCleared(t, cookies, refreshCookieName)

	logSessions(t, ctx, db, uid, "after")

	if n := countActive(t, ctx, db, ssoFam); n != 0 {
		t.Errorf("expected 0 active sessions in SSO family %s, got %d", ssoFam, n)
	}
	if n := countActive(t, ctx, db, legacyFam); n != 0 {
		t.Errorf("expected 0 active sessions in legacy family %s, got %d", legacyFam, n)
	}
}

// 8. Production cookie attributes: Secure=true, Domain set.
func TestDualCookieRefresh_ProductionCookieAttributes(t *testing.T) {
	db := dualCookieDB(t)
	ctx := context.Background()
	uid := "test_dual_8"

	t.Setenv("APP_ENV", "production")
	oldDomain := refreshCookieDomain
	refreshCookieDomain = "agent-one.ru"
	defer func() { refreshCookieDomain = oldDomain }()

	insertProfile(t, ctx, db, uid, "dual8@test.dev")
	token, _ := insertSession(t, ctx, db, uid, 24)

	logSessions(t, ctx, db, uid, "before")

	app := dualCookieApp(db)
	req := httptest.NewRequest("POST", "/api/auth/refresh", nil)
	req.Header.Set("User-Agent", "test-agent")
	req.Header.Set("Accept-Language", "en")
	req.AddCookie(&http.Cookie{Name: ssoRefreshCookieName, Value: token})
	rec := httptest.NewRecorder()

	app.handleRefresh(rec, req)
	resp := rec.Result()
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}

	cookies := resp.Cookies()
	assertCookie(t, cookies, ssoRefreshCookieName, 86400, true, "agent-one.ru")

	logSessions(t, ctx, db, uid, "after")
}

// 9. No cookies at all → 401, both cookies cleared in response.
func TestDualCookieRefresh_NoCookies(t *testing.T) {
	db := dualCookieDB(t)
	app := dualCookieApp(db)

	req := httptest.NewRequest("POST", "/api/auth/refresh", nil)
	rec := httptest.NewRecorder()

	app.handleRefresh(rec, req)
	resp := rec.Result()
	defer resp.Body.Close()

	if resp.StatusCode != 401 {
		t.Fatalf("expected 401, got %d", resp.StatusCode)
	}

	cookies := resp.Cookies()
	assertCookieCleared(t, cookies, ssoRefreshCookieName)
	assertCookieCleared(t, cookies, refreshCookieName)
}

// 10. Refresh with expired session → 401.
func TestDualCookieRefresh_ExpiredSession(t *testing.T) {
	db := dualCookieDB(t)
	ctx := context.Background()
	uid := "test_dual_10"

	insertProfile(t, ctx, db, uid, "dual10@test.dev")

	// create session with explicit past expiry
	raw, err := GenerateToken()
	if err != nil {
		t.Fatalf("GenerateToken: %v", err)
	}
	hash, err := HashToken(raw)
	if err != nil {
		t.Fatalf("HashToken: %v", err)
	}
	sessID := newID()
	fam := newID()
	db.Exec(ctx,
		`INSERT INTO auth_sessions (id, user_id, refresh_token_hash, token_family, created_at, expires_at)
		 VALUES ($1,$2,$3,$4,NOW() - INTERVAL '2 hours', NOW() - INTERVAL '1 hour')`,
		sessID, uid, hash, fam)
	t.Cleanup(func() { db.Exec(ctx, "DELETE FROM auth_sessions WHERE id=$1", sessID) })

	logSessions(t, ctx, db, uid, "before")

	app := dualCookieApp(db)
	req := httptest.NewRequest("POST", "/api/auth/refresh", nil)
	req.Header.Set("User-Agent", "test-agent")
	req.Header.Set("Accept-Language", "en")
	req.AddCookie(&http.Cookie{Name: ssoRefreshCookieName, Value: raw})
	rec := httptest.NewRecorder()

	app.handleRefresh(rec, req)
	resp := rec.Result()
	defer resp.Body.Close()

	if resp.StatusCode != 401 {
		t.Fatalf("expected 401, got %d", resp.StatusCode)
	}

	cookies := resp.Cookies()
	assertCookieCleared(t, cookies, ssoRefreshCookieName)
	assertCookieCleared(t, cookies, refreshCookieName)

	logSessions(t, ctx, db, uid, "after")
}

// 11. Logout with only SSO cookie (no legacy) → family revoked.
func TestDualCookieLogout_SSOOnly(t *testing.T) {
	db := dualCookieDB(t)
	ctx := context.Background()
	uid := "test_dual_11"

	insertProfile(t, ctx, db, uid, "dual11@test.dev")
	token, fam := insertSession(t, ctx, db, uid, 24)

	logSessions(t, ctx, db, uid, "before")

	app := dualCookieApp(db)
	req := httptest.NewRequest("POST", "/api/auth/logout", nil)
	req.AddCookie(&http.Cookie{Name: ssoRefreshCookieName, Value: token})
	rec := httptest.NewRecorder()

	app.handleLogout(rec, req)
	resp := rec.Result()
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}

	cookies := resp.Cookies()
	assertCookieCleared(t, cookies, ssoRefreshCookieName)
	assertCookieCleared(t, cookies, refreshCookieName)

	logSessions(t, ctx, db, uid, "after")

	if n := countActive(t, ctx, db, fam); n != 0 {
		t.Errorf("expected 0 active sessions in family %s, got %d", fam, n)
	}
}

// 12. Logout with only legacy cookie (no SSO) → family revoked.
func TestDualCookieLogout_LegacyOnly(t *testing.T) {
	db := dualCookieDB(t)
	ctx := context.Background()
	uid := "test_dual_12"

	insertProfile(t, ctx, db, uid, "dual12@test.dev")
	token, fam := insertSession(t, ctx, db, uid, 24)

	logSessions(t, ctx, db, uid, "before")

	app := dualCookieApp(db)
	req := httptest.NewRequest("POST", "/api/auth/logout", nil)
	req.AddCookie(&http.Cookie{Name: refreshCookieName, Value: token})
	rec := httptest.NewRecorder()

	app.handleLogout(rec, req)
	resp := rec.Result()
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}

	cookies := resp.Cookies()
	assertCookieCleared(t, cookies, ssoRefreshCookieName)
	assertCookieCleared(t, cookies, refreshCookieName)

	logSessions(t, ctx, db, uid, "after")

	if n := countActive(t, ctx, db, fam); n != 0 {
		t.Errorf("expected 0 active sessions in family %s, got %d", fam, n)
	}
}

// 13. handleLogout with invalid token format (no DB interaction needed).
func TestDualCookieLogout_InvalidTokenFormat(t *testing.T) {
	db := dualCookieDB(t)
	ctx := context.Background()
	uid := "test_dual_13"

	insertProfile(t, ctx, db, uid, "dual13@test.dev")
	token, fam := insertSession(t, ctx, db, uid, 24)

	logSessions(t, ctx, db, uid, "before")

	app := dualCookieApp(db)
	req := httptest.NewRequest("POST", "/api/auth/logout", nil)
	req.AddCookie(&http.Cookie{Name: ssoRefreshCookieName, Value: "invalid-token"})
	req.AddCookie(&http.Cookie{Name: refreshCookieName, Value: token})
	rec := httptest.NewRecorder()

	app.handleLogout(rec, req)
	resp := rec.Result()
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}

	cookies := resp.Cookies()
	assertCookieCleared(t, cookies, ssoRefreshCookieName)
	assertCookieCleared(t, cookies, refreshCookieName)

	logSessions(t, ctx, db, uid, "after")

	// primary = "invalid-token" → revokeOne skips (format check) → legacy is secondary
	// secondary condition: both exist && different → revokeOne(legacyCookie.Value)
	// "invalid-token" != token → true, so legacy family IS revoked
	if n := countActive(t, ctx, db, fam); n != 0 {
		t.Errorf("expected 0 active sessions in family %s, got %d", fam, n)
	}
}

// ── Helper that does not appear unused ──
var _ = strings.HasPrefix
