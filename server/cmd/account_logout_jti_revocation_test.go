package main

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
)

func withTestRedis(t *testing.T) *miniredis.Miniredis {
	t.Helper()
	mr := miniredis.RunT(t)
	client := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	if err := client.Ping(context.Background()).Err(); err != nil {
		t.Fatalf("redis ping: %v", err)
	}
	prev := rdb
	prevHealthy := rdbHealthy.Load()
	rdb = client
	rdbHealthy.Store(true)
	t.Cleanup(func() {
		rdb = prev
		rdbHealthy.Store(prevHealthy)
		_ = client.Close()
	})
	return mr
}

func logoutRevocationApp(t *testing.T) (*App, context.Context) {
	t.Helper()
	db := dualCookieDB(t)
	withTestRedis(t)
	t.Setenv("APP_ENV", "development")
	app := dualCookieApp(db)
	return app, context.Background()
}

func issueEmailLikeSession(t *testing.T, ctx context.Context, app *App, userID string) (accessToken, refreshRaw, family, jti string) {
	t.Helper()
	insertProfile(t, ctx, app.db, userID, userID+"@logout.test")
	raw, family := insertSession(t, ctx, app.db, userID, 24)
	access, jti := makeJWTWithTTL(userID, "client", app.jwtKey, app.secCfg.AccessTokenTTLMinutes)
	fp := ComputeFingerprint("127.0.0.1", "logout-jti-test", "ru")
	bindIssuedAccessSession(ctx, family, userID, fp, "sess-"+userID, jti, app.secCfg.AccessTokenTTLMinutes, app.secCfg.RefreshTokenTTLHours)
	return access, raw, family, jti
}

func issueYandexLikeSession(t *testing.T, ctx context.Context, app *App, userID string) (accessToken, refreshRaw, family, jti string) {
	t.Helper()
	// Shared OAuth session path: auth_sessions row + access bind after session establishment.
	return issueEmailLikeSession(t, ctx, app, userID)
}

func doLogout(t *testing.T, app *App, refreshRaw, accessToken string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest("POST", "/api/auth/logout", nil)
	if refreshRaw != "" {
		req.AddCookie(&http.Cookie{Name: ssoRefreshCookieName, Value: refreshRaw})
	}
	if accessToken != "" {
		req.Header.Set("Authorization", "Bearer "+accessToken)
	}
	rec := httptest.NewRecorder()
	app.handleLogout(rec, req)
	return rec
}

func doLogoutRefresh(t *testing.T, app *App, refreshRaw string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest("POST", "/api/auth/refresh", nil)
	req.RemoteAddr = "127.0.0.1:12345"
	req.AddCookie(&http.Cookie{Name: ssoRefreshCookieName, Value: refreshRaw})
	req.Header.Set("User-Agent", "logout-jti-test")
	req.Header.Set("Accept-Language", "ru")
	rec := httptest.NewRecorder()
	app.handleRefresh(rec, req)
	return rec
}

func authMe(t *testing.T, app *App, accessToken string) int {
	t.Helper()
	req := httptest.NewRequest("GET", "/api/auth/me", nil)
	req.Header.Set("Authorization", "Bearer "+accessToken)
	_, err := app.auth(req)
	if err != nil {
		return 401
	}
	return 200
}

func assertBodyNoSecrets(t *testing.T, body string) {
	t.Helper()
	lower := strings.ToLower(body)
	for _, leak := range []string{"jti", "token_family", "refresh_token", "bearer "} {
		if strings.Contains(lower, leak) && !strings.Contains(lower, `"status":"logged_out"`) {
			// status responses are fine; reject accidental token material
		}
	}
	if strings.Contains(body, "eyJ") {
		t.Errorf("response leaks JWT material: %s", body)
	}
}

func TestLogoutRevokesAccessAndRefresh_Email(t *testing.T) {
	app, ctx := logoutRevocationApp(t)
	uid := "test_dual_logout_email_1"
	access, refresh, _, jti := issueEmailLikeSession(t, ctx, app, uid)

	if authMe(t, app, access) != 200 {
		t.Fatal("access token must work before logout")
	}
	if !JTIExists(ctx, jti) {
		t.Fatal("jti must exist before logout")
	}

	rec := doLogout(t, app, refresh, access)
	if rec.Code != 200 {
		t.Fatalf("logout status=%d body=%s", rec.Code, rec.Body.String())
	}
	assertCookieCleared(t, rec.Result().Cookies(), ssoRefreshCookieName)
	assertBodyNoSecrets(t, rec.Body.String())

	if authMe(t, app, access) != 401 {
		t.Fatal("P1: old access token must be rejected after logout")
	}
	if JTIExists(ctx, jti) {
		t.Fatal("jti must be deleted after logout")
	}
	ref := doLogoutRefresh(t, app, refresh)
	if ref.Code != 401 {
		t.Fatalf("old refresh must be rejected after logout, got %d body=%s", ref.Code, ref.Body.String())
	}
}

func TestLogoutRevokesAccessAndRefresh_YandexSession(t *testing.T) {
	app, ctx := logoutRevocationApp(t)
	uid := "test_dual_logout_yandex_1"
	access, refresh, _, jti := issueYandexLikeSession(t, ctx, app, uid)

	if authMe(t, app, access) != 200 {
		t.Fatal("yandex-like access must work before logout")
	}
	rec := doLogout(t, app, refresh, access)
	if rec.Code != 200 {
		t.Fatalf("logout status=%d", rec.Code)
	}
	if authMe(t, app, access) != 401 {
		t.Fatal("yandex-like access must be rejected after logout")
	}
	if JTIExists(ctx, jti) {
		t.Fatal("yandex-like jti must be deleted")
	}
	if doLogoutRefresh(t, app, refresh).Code != 401 {
		t.Fatal("yandex-like refresh must be rejected after logout")
	}
}

func TestLogoutRepeatedIsIdempotent(t *testing.T) {
	app, ctx := logoutRevocationApp(t)
	uid := "test_dual_logout_repeat"
	access, refresh, _, _ := issueEmailLikeSession(t, ctx, app, uid)
	rec1 := doLogout(t, app, refresh, access)
	rec2 := doLogout(t, app, refresh, access)
	if rec1.Code != 200 || rec2.Code != 200 {
		t.Fatalf("repeated logout must be 200/200, got %d/%d", rec1.Code, rec2.Code)
	}
	if authMe(t, app, access) != 401 {
		t.Fatal("access remains revoked after repeated logout")
	}
}

func TestLogoutOnlyRevokesCurrentSession(t *testing.T) {
	app, ctx := logoutRevocationApp(t)
	uid := "test_dual_logout_multi"
	access1, refresh1, _, jti1 := issueEmailLikeSession(t, ctx, app, uid)
	access2, refresh2, _, jti2 := issueEmailLikeSession(t, ctx, app, uid)

	rec := doLogout(t, app, refresh1, access1)
	if rec.Code != 200 {
		t.Fatalf("logout=%d", rec.Code)
	}
	if authMe(t, app, access1) != 401 {
		t.Fatal("session1 access must be revoked")
	}
	if doLogoutRefresh(t, app, refresh1).Code != 401 {
		t.Fatal("session1 refresh must be revoked")
	}
	if authMe(t, app, access2) != 200 {
		t.Fatal("session2 access must remain valid")
	}
	if !JTIExists(ctx, jti2) {
		t.Fatal("session2 jti must remain")
	}
	if JTIExists(ctx, jti1) {
		t.Fatal("session1 jti must be gone")
	}
	if doLogoutRefresh(t, app, refresh2).Code != 200 {
		t.Fatal("session2 refresh must remain valid")
	}
}

func TestLogoutAllRevokesEverySessionJTI(t *testing.T) {
	app, ctx := logoutRevocationApp(t)
	uid := "test_dual_logout_all"
	access1, _, _, jti1 := issueEmailLikeSession(t, ctx, app, uid)
	access2, _, _, jti2 := issueEmailLikeSession(t, ctx, app, uid)

	req := httptest.NewRequest("POST", "/api/auth/logout-all", nil)
	req.Header.Set("Authorization", "Bearer "+access1)
	rec := httptest.NewRecorder()
	app.handleLogoutAll(rec, req)
	if rec.Code != 200 {
		t.Fatalf("logout-all=%d body=%s", rec.Code, rec.Body.String())
	}
	if authMe(t, app, access1) != 401 || authMe(t, app, access2) != 401 {
		t.Fatal("logout-all must revoke all access tokens")
	}
	if JTIExists(ctx, jti1) || JTIExists(ctx, jti2) {
		t.Fatal("logout-all must delete all JTIs")
	}
}

func TestLogoutWithoutRedisSessionStillRevokesBearerJTI(t *testing.T) {
	app, ctx := logoutRevocationApp(t)
	uid := "test_dual_logout_bearer_only"
	insertProfile(t, ctx, app.db, uid, uid+"@logout.test")
	raw, _ := insertSession(t, ctx, app.db, uid, 24)
	access, jti := makeJWTWithTTL(uid, "client", app.jwtKey, app.secCfg.AccessTokenTTLMinutes)
	// Reproduce pre-fix bug shape: JTI stored, sess metadata missing.
	StoreJTI(ctx, jti, uid, 15*time.Minute)

	if authMe(t, app, access) != 200 {
		t.Fatal("access must work before logout")
	}
	rec := doLogout(t, app, raw, access)
	if rec.Code != 200 {
		t.Fatalf("logout=%d", rec.Code)
	}
	if authMe(t, app, access) != 401 {
		t.Fatal("bearer JTI must be revoked even without sess metadata")
	}
	if JTIExists(ctx, jti) {
		t.Fatal("bearer jti must be deleted")
	}
}

func TestLogoutRefreshReuseRejected(t *testing.T) {
	app, ctx := logoutRevocationApp(t)
	uid := "test_dual_logout_reuse"
	_, refresh, _, _ := issueEmailLikeSession(t, ctx, app, uid)
	if doLogout(t, app, refresh, "").Code != 200 {
		t.Fatal("logout failed")
	}
	if doLogoutRefresh(t, app, refresh).Code != 401 {
		t.Fatal("refresh reuse after logout must be rejected")
	}
	if doLogoutRefresh(t, app, refresh).Code != 401 {
		t.Fatal("second refresh reuse must stay rejected")
	}
}

func TestLogoutConcurrentWithRefresh(t *testing.T) {
	app, ctx := logoutRevocationApp(t)
	uid := "test_dual_logout_race"
	access, refresh, _, _ := issueEmailLikeSession(t, ctx, app, uid)

	var wg sync.WaitGroup
	var logoutCode, refreshCode int
	wg.Add(2)
	go func() {
		defer wg.Done()
		logoutCode = doLogout(t, app, refresh, access).Code
	}()
	go func() {
		defer wg.Done()
		refreshCode = doLogoutRefresh(t, app, refresh).Code
	}()
	wg.Wait()

	if logoutCode != 200 {
		t.Fatalf("logout code=%d", logoutCode)
	}
	if refreshCode != 200 && refreshCode != 401 {
		t.Fatalf("refresh code=%d want 200 or 401", refreshCode)
	}
	if doLogoutRefresh(t, app, refresh).Code != 401 {
		t.Fatal("original refresh must be dead after concurrent logout/refresh")
	}
	if authMe(t, app, access) != 401 {
		t.Fatal("original access must be dead after concurrent logout/refresh")
	}
	var active int
	if err := app.db.QueryRow(ctx,
		`SELECT COUNT(*) FROM auth_sessions WHERE user_id=$1 AND revoked_at IS NULL`, uid).Scan(&active); err != nil {
		t.Fatalf("count active: %v", err)
	}
	if active != 0 {
		t.Fatalf("no active DB sessions should remain after concurrent logout/refresh, got %d (refreshCode=%d)", active, refreshCode)
	}
}

func TestLogoutRevocationSurvivesRedisSessionRecreate(t *testing.T) {
	app, ctx := logoutRevocationApp(t)
	uid := "test_dual_logout_persist"
	access, refresh, family, jti := issueEmailLikeSession(t, ctx, app, uid)
	if doLogout(t, app, refresh, access).Code != 200 {
		t.Fatal("logout failed")
	}
	// Simulate app/redis session-cache recreation: sess key gone, DB revoke remains.
	DeleteSession(ctx, family)
	if doLogoutRefresh(t, app, refresh).Code != 401 {
		t.Fatal("DB-backed refresh revocation must survive sess cache loss")
	}
	if JTIExists(ctx, jti) {
		t.Fatal("jti should remain deleted")
	}
	if authMe(t, app, access) != 401 {
		t.Fatal("access should remain rejected")
	}
}

func TestLogoutInvalidAndExpiredUnchanged(t *testing.T) {
	app, _ := logoutRevocationApp(t)
	expired, _ := makeJWTWithTTL("nobody", "client", app.jwtKey, -1)
	if authMe(t, app, expired) != 401 {
		t.Fatal("expired token must stay rejected")
	}
	if authMe(t, app, "not-a-jwt") != 401 {
		t.Fatal("invalid token must stay rejected")
	}
	rec := doLogout(t, app, "not-hex", "")
	if rec.Code != 200 {
		t.Fatalf("malformed refresh logout must stay 200, got %d", rec.Code)
	}
}

func TestLogoutErrorJSONHasNoTokenMaterial(t *testing.T) {
	app, ctx := logoutRevocationApp(t)
	uid := "test_dual_logout_nosecret"
	access, refresh, _, jti := issueEmailLikeSession(t, ctx, app, uid)
	rec := doLogout(t, app, refresh, access)
	body, _ := io.ReadAll(rec.Result().Body)
	s := string(body)
	if strings.Contains(s, jti) || strings.Contains(s, refresh) || strings.Contains(s, access) {
		t.Fatalf("logout response leaked secret material: %s", s)
	}
	var payload map[string]interface{}
	if err := json.Unmarshal(body, &payload); err != nil {
		t.Fatalf("json: %v", err)
	}
}

// Reproduce historical P1 shape against fixed helpers: login bind must create sess metadata.
func TestBindIssuedAccessSessionCreatesLogoutableMetadata(t *testing.T) {
	withTestRedis(t)
	ctx := context.Background()
	family := "fam-bind-1"
	userID := "user-bind-1"
	jti := "jti-bind-1"
	bindIssuedAccessSession(ctx, family, userID, "fp", "sid", jti, 15, 24)
	sess, err := LoadSession(ctx, family)
	if err != nil {
		t.Fatalf("LoadSession: %v", err)
	}
	if sess.CurrentJTI != jti {
		t.Fatalf("CurrentJTI=%q", sess.CurrentJTI)
	}
	if !JTIExists(ctx, jti) {
		t.Fatal("jti missing")
	}
}
