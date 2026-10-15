package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestAppEnvDefault(t *testing.T) {
	t.Setenv("APP_ENV", "")
	if e := appEnv(); e != "development" {
		t.Errorf("appEnv() = %q, want development", e)
	}
}

func TestAppEnvDevelopment(t *testing.T) {
	t.Setenv("APP_ENV", "development")
	if e := appEnv(); e != "development" {
		t.Errorf("appEnv() = %q", e)
	}
}

func TestAppEnvTest(t *testing.T) {
	t.Setenv("APP_ENV", "test")
	if e := appEnv(); e != "test" {
		t.Errorf("appEnv() = %q", e)
	}
}

func TestAppEnvProduction(t *testing.T) {
	t.Setenv("APP_ENV", "production")
	if e := appEnv(); e != "production" {
		t.Errorf("appEnv() = %q", e)
	}
}

func TestAppEnvUnknownFallsBack(t *testing.T) {
	t.Setenv("APP_ENV", "staging")
	if e := appEnv(); e != "development" {
		t.Errorf("appEnv() = %q, want development fallback", e)
	}
}

func TestIsProductionFunctions(t *testing.T) {
	t.Setenv("APP_ENV", "production")
	if !isProduction() {
		t.Error("isProduction() = false")
	}
	if isDevelopment() {
		t.Error("isDevelopment() = true")
	}
	if isTest() {
		t.Error("isTest() = true")
	}
	t.Setenv("APP_ENV", "development")
	if isProduction() {
		t.Error("isProduction() = true in dev")
	}
}

func TestProductionConfigRequiresDatabaseURL(t *testing.T) {
	t.Setenv("APP_ENV", "production")
	t.Setenv("DATABASE_URL", "")
	t.Setenv("JWT_SECRET", "valid-16-chars-min")
	issues := validateRuntimeConfig()
	found := false
	for _, i := range issues {
		if i == "DATABASE_URL is required in production" {
			found = true
		}
	}
	if !found {
		t.Error("should require DATABASE_URL in production")
	}
}

func TestProductionConfigRequiresJWT(t *testing.T) {
	t.Setenv("APP_ENV", "production")
	t.Setenv("DATABASE_URL", "postgres://localhost/db")
	t.Setenv("JWT_SECRET", "")
	issues := validateRuntimeConfig()
	found := false
	for _, i := range issues {
		if strings.Contains(i, "JWT_SECRET") {
			found = true
		}
	}
	if !found {
		t.Error("should require JWT_SECRET in production")
	}
}

func TestProductionConfigRejectsWeakJWT(t *testing.T) {
	t.Setenv("APP_ENV", "production")
	t.Setenv("DATABASE_URL", "postgres://localhost/db")
	t.Setenv("JWT_SECRET", "short")
	issues := validateRuntimeConfig()
	found := false
	for _, i := range issues {
		if strings.Contains(i, "at least 16") {
			found = true
		}
	}
	if !found {
		t.Error("should reject short JWT_SECRET")
	}
}

func TestProductionConfigRejectsDevJWT(t *testing.T) {
	t.Setenv("APP_ENV", "production")
	t.Setenv("DATABASE_URL", "postgres://localhost/db")
	t.Setenv("JWT_SECRET", "agentone-dev-secret-key-change-in-production")
	issues := validateRuntimeConfig()
	found := false
	for _, i := range issues {
		if strings.Contains(i, "development default") {
			found = true
		}
	}
	if !found {
		t.Error("should reject dev JWT_SECRET")
	}
}

func TestProductionConfigRejectsDevAdminToken(t *testing.T) {
	t.Setenv("APP_ENV", "production")
	t.Setenv("DATABASE_URL", "postgres://localhost/db")
	t.Setenv("JWT_SECRET", "valid-16-chars-min-here")
	t.Setenv("DEV_ADMIN_TOKEN", "dev-secret")
	issues := validateRuntimeConfig()
	found := false
	for _, i := range issues {
		if strings.Contains(i, "DEV_ADMIN_TOKEN") {
			found = true
		}
	}
	if !found {
		t.Error("should reject DEV_ADMIN_TOKEN in production")
	}
}

func TestProductionConfigAcceptsValid(t *testing.T) {
	t.Setenv("APP_ENV", "production")
	t.Setenv("DATABASE_URL", "postgres://localhost/db")
	t.Setenv("JWT_SECRET", "production-valid-32-character-key")
	t.Setenv("DEV_ADMIN_TOKEN", "")
	issues := validateRuntimeConfig()
	if len(issues) > 0 {
		t.Errorf("should accept valid config, got: %v", issues)
	}
}

func TestDevelopmentConfigLenient(t *testing.T) {
	t.Setenv("APP_ENV", "development")
	t.Setenv("DATABASE_URL", "")
	t.Setenv("JWT_SECRET", "")
	t.Setenv("DEV_ADMIN_TOKEN", "dev-secret")
	issues := validateRuntimeConfig()
	if len(issues) > 0 {
		t.Errorf("development should be lenient, got: %v", issues)
	}
}

func TestConfigErrorsDontLeakSecrets(t *testing.T) {
	t.Setenv("APP_ENV", "production")
	t.Setenv("DATABASE_URL", "postgres://admin:secret@db:5432/db")
	t.Setenv("JWT_SECRET", "")
	issues := validateRuntimeConfig()
	for _, i := range issues {
		if strings.Contains(i, "secret") {
			t.Errorf("config error leaks secret: %q", i)
		}
		if strings.Contains(i, "postgres://") {
			t.Errorf("config error leaks DATABASE_URL: %q", i)
		}
	}
}

func TestValidRequestID(t *testing.T) {
	if !validRequestID.MatchString("abc-123_XYZ") {
		t.Error("valid ID rejected")
	}
	if validRequestID.MatchString("../../../etc") {
		t.Error("path traversal accepted")
	}
	if validRequestID.MatchString(strings.Repeat("x", 200)) {
		t.Error("too long accepted")
	}
}

func TestRequestIDGeneration(t *testing.T) {
	b1 := make([]byte, 8)
	rand.Read(b1)
	b2 := make([]byte, 8)
	rand.Read(b2)
	if hex.EncodeToString(b1) == hex.EncodeToString(b2) {
		t.Log("IDs coincidentally equal — unlikely but possible")
	}
}

func TestLivenessReturns200(t *testing.T) {
	req := httptest.NewRequest("GET", "/api/live", nil)
	rec := httptest.NewRecorder()
	handleLiveness(rec, req)
	if rec.Code != 200 {
		t.Errorf("liveness status = %d", rec.Code)
	}
}

func TestRequestIDMiddlewareGeneratesID(t *testing.T) {
	handler := requestIDMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := getRequestID(r)
		if id == "" {
			t.Error("request ID empty")
		}
		w.WriteHeader(200)
	}))
	req := httptest.NewRequest("GET", "/", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rid := rec.Header().Get("X-Request-ID"); rid == "" {
		t.Error("X-Request-ID header missing")
	}
}

func TestRequestIDMiddlewarePreservesValidID(t *testing.T) {
	handler := requestIDMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if getRequestID(r) != "my-test-id" {
			t.Error("request ID not preserved")
		}
		w.WriteHeader(200)
	}))
	req := httptest.NewRequest("GET", "/", nil)
	req.Header.Set("X-Request-ID", "my-test-id")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
}

func TestRequestIDMiddlewareReplacesInvalidID(t *testing.T) {
	handler := requestIDMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := getRequestID(r)
		if id == "../../etc" {
			t.Error("invalid ID accepted: " + id)
		}
		w.WriteHeader(200)
	}))
	req := httptest.NewRequest("GET", "/", nil)
	req.Header.Set("X-Request-ID", "../../etc")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
}

func TestPanicRecoveryReturns500(t *testing.T) {
	handler := recoveryMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		panic("test panic")
	}))
	req := httptest.NewRequest("GET", "/", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != 500 {
		t.Errorf("recovery status = %d, want 500", rec.Code)
	}
}

func TestPanicRecoverySafeMessage(t *testing.T) {
	handler := recoveryMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		panic("sensitive data")
	}))
	req := httptest.NewRequest("GET", "/", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	body := rec.Body.String()
	if strings.Contains(body, "sensitive") {
		t.Error("response contains panic data")
	}
}

func TestBuildMeta(t *testing.T) {
	m := buildMeta()
	if m["version"] == "" {
		t.Error("version empty")
	}
	if m["commit"] == "" {
		t.Error("commit empty")
	}
	if m["buildTime"] == "" {
		t.Error("buildTime empty")
	}
}

func TestStatusRecorder(t *testing.T) {
	w := httptest.NewRecorder()
	sr := &statusRecorder{ResponseWriter: w, status: 200}
	sr.WriteHeader(404)
	if sr.status != 404 {
		t.Errorf("status = %d", sr.status)
	}
	if w.Code != 404 {
		t.Errorf("wrapped code = %d", w.Code)
	}
}

// ─── Readiness failure path ───

type failingDB struct{}

func (f *failingDB) Ping(ctx context.Context) error { return errors.New("dial failed") }

func TestReadinessReturns503OnDBFailure(t *testing.T) {
	readinessPinger = &failingDB{}
	defer func() { readinessPinger = nil }()
	req := httptest.NewRequest("GET", "/api/ready", nil)
	rec := httptest.NewRecorder()
	handleReadiness(rec, req)
	if rec.Code != 503 {
		t.Errorf("readiness status = %d, want 503", rec.Code)
	}
	body := rec.Body.String()
	if strings.Contains(body, "dial failed") {
		t.Error("readiness leaks DB error")
	}
	if strings.Contains(body, "DATABASE_URL") {
		t.Error("readiness leaks DATABASE_URL")
	}
	if strings.Contains(body, "postgres") {
		t.Error("readiness leaks connection string")
	}
}

// ─── Logging behavior ───

func TestLoggingMiddlewareSetsStatus(t *testing.T) {
	handler := loggingMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(201)
	}))
	req := httptest.NewRequest("GET", "/test", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != 201 {
		t.Error("logging middleware changed status")
	}
}

func TestLoggingMiddlewareRecordsRequestID(t *testing.T) {
	handler := requestIDMiddleware(loggingMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := getRequestID(r)
		if id == "" {
			t.Error("no request ID in context")
		}
		w.WriteHeader(200)
	})))
	req := httptest.NewRequest("GET", "/test", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
}

// ─── Panic recovery: next request works ───

func TestPanicRecoveryNextRequestWorks(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/panic", func(w http.ResponseWriter, r *http.Request) { panic("boom") })
	mux.HandleFunc("/ok", func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(200) })
	wrapped := recoveryMiddleware(mux)

	// First request panics
	req := httptest.NewRequest("GET", "/panic", nil)
	rec := httptest.NewRecorder()
	wrapped.ServeHTTP(rec, req)
	if rec.Code != 500 {
		t.Errorf("panic status = %d", rec.Code)
	}
	if strings.Contains(rec.Body.String(), "boom") {
		t.Error("panic leaks message")
	}

	// Next request works fine
	req2 := httptest.NewRequest("GET", "/ok", nil)
	rec2 := httptest.NewRecorder()
	wrapped.ServeHTTP(rec2, req2)
	if rec2.Code != 200 {
		t.Errorf("post-panic status = %d, want 200", rec2.Code)
	}
}

// ─── Request ID: control characters rejected ───

func TestRequestIDRejectsControlChars(t *testing.T) {
	handler := requestIDMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := getRequestID(r)
		if strings.Contains(id, "\n") {
			t.Error("request ID contains newline")
		}
		w.WriteHeader(200)
	}))
	req := httptest.NewRequest("GET", "/", nil)
	req.Header.Set("X-Request-ID", "bad\nid")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
}

// ─── Build metadata defaults ───

func TestBuildMetaDefaults(t *testing.T) {
	origVersion := version
	origCommit := commit
	origBuildTime := buildTime
	version = "dev"
	commit = "unknown"
	buildTime = "unknown"
	m := buildMeta()
	if m["version"] != "dev" {
		t.Errorf("version = %q", m["version"])
	}
	if m["commit"] != "unknown" {
		t.Errorf("commit = %q", m["commit"])
	}
	version = origVersion
	commit = origCommit
	buildTime = origBuildTime
}

// ─── Config: unknown env doesn't reject in non-production ───

func TestConfigNonProductionLenient(t *testing.T) {
	t.Setenv("APP_ENV", "test")
	t.Setenv("DATABASE_URL", "")
	t.Setenv("JWT_SECRET", "")
	issues := validateRuntimeConfig()
	if len(issues) > 0 {
		t.Errorf("test env should be lenient: %v", issues)
	}
}

// ─── Readiness: valid DB returns 200 ───

type okDB struct{}

func (o *okDB) Ping(ctx context.Context) error { return nil }

func TestReadinessReturns200OnOK(t *testing.T) {
	readinessPinger = &okDB{}
	defer func() { readinessPinger = nil }()
	req := httptest.NewRequest("GET", "/api/ready", nil)
	rec := httptest.NewRecorder()
	handleReadiness(rec, req)
	if rec.Code != 200 {
		t.Errorf("readiness status = %d, want 200", rec.Code)
	}
}
