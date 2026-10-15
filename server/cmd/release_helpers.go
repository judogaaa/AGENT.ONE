package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"regexp"
	"strings"
	"time"
)

// ─── Environment ───

func appEnv() string {
	v := strings.ToLower(strings.TrimSpace(os.Getenv("APP_ENV")))
	if v == "" {
		return "development"
	}
	switch v {
	case "development", "test", "production":
		return v
	}
	return "development" // graceful fallback
}

func isProduction() bool  { return appEnv() == "production" }
func isTest() bool        { return appEnv() == "test" }
func isDevelopment() bool { return appEnv() == "development" }

// ─── Config validation ───

type configCheck struct {
	key    string
	val    string
	secret bool
	err    string
}

func validateRuntimeConfig() []string {
	var issues []string
	add := func(msg string) { issues = append(issues, msg) }

	dbURL := os.Getenv("DATABASE_URL")
	jwtSecret := os.Getenv("JWT_SECRET")
	port := os.Getenv("PORT")
	devToken := os.Getenv("DEV_ADMIN_TOKEN")

	if isProduction() {
		if dbURL == "" {
			add("DATABASE_URL is required in production")
		}
		if jwtSecret == "" {
			add("JWT_SECRET is required in production")
		}
		if jwtSecret != "" && len(jwtSecret) < 16 {
			add("JWT_SECRET must be at least 16 characters in production")
		}
		if jwtSecret == "agentone-dev-secret-key-change-in-production" {
			add("JWT_SECRET must not be the development default in production")
		}
		if devToken != "" {
			add("DEV_ADMIN_TOKEN must be empty in production")
		}
	}

	if port != "" {
		if port == "0" || len(port) > 5 {
			add("PORT is invalid")
		}
	}

	return issues
}

// ─── Build metadata ───

var (
	version   = "dev"
	commit    = "unknown"
	buildTime = "unknown"
)

func buildMeta() map[string]string {
	return map[string]string{
		"version":   version,
		"commit":    commit,
		"buildTime": buildTime,
	}
}

func logBuildMeta() {
	slog.Info("build", "version", version, "commit", commit, "buildTime", buildTime, "env", appEnv())
	issues := validateRuntimeConfig()
	for _, i := range issues {
		slog.Warn("config_warn", "msg", i)
	}
	if len(issues) > 0 && isProduction() {
		slog.Error("production config validation failed", "count", len(issues))
		os.Exit(1)
	}
	opIssues := validateOperationalConfig()
	for _, i := range opIssues {
		slog.Warn("config_warn", "msg", i)
	}
	if len(opIssues) > 0 && isProduction() {
		slog.Error("operational config validation failed", "count", len(opIssues))
		os.Exit(1)
	}
	secIssues := validateSecurityConfig()
	for _, i := range secIssues {
		slog.Warn("config_warn", "msg", i)
	}
	if len(secIssues) > 0 && isProduction() {
		slog.Error("security config validation failed", "count", len(secIssues))
		os.Exit(1)
	}
}

// ─── Liveness & Readiness ───

func handleLiveness(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]interface{}{
		"ok": true, "data": map[string]string{"status": "live"},
	})
}

type dbPinger interface {
	Ping(ctx context.Context) error
}

var readinessPinger dbPinger

func handleReadiness(w http.ResponseWriter, r *http.Request) {
	if readinessPinger == nil {
		writeJSON(w, 503, map[string]interface{}{
			"ok": false, "error": "database_unavailable", "message": "Database not configured.",
		})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	done := make(chan error, 1)
	go func() { done <- readinessPinger.Ping(ctx) }()
	select {
	case err := <-done:
		if err != nil {
			writeJSON(w, 503, map[string]interface{}{
				"ok": false, "error": "database_unavailable", "message": "Database ping failed.",
			})
			return
		}
		writeJSON(w, 200, map[string]interface{}{
			"ok": true, "data": map[string]string{"status": "ready"},
		})
	case <-ctx.Done():
		writeJSON(w, 503, map[string]interface{}{
			"ok": false, "error": "database_timeout", "message": "Database ping timed out.",
		})
	}
}

// ─── Request ID ───

type ctxKey string

const requestIDKey ctxKey = "request_id"

var validRequestID = regexp.MustCompile(`^[a-zA-Z0-9_-]{1,128}$`)

func requestIDMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := r.Header.Get("X-Request-ID")
		if !validRequestID.MatchString(id) {
			b := make([]byte, 8)
			rand.Read(b)
			id = hex.EncodeToString(b)
		}
		w.Header().Set("X-Request-ID", id)
		ctx := context.WithValue(r.Context(), requestIDKey, id)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func getRequestID(r *http.Request) string {
	if id, ok := r.Context().Value(requestIDKey).(string); ok {
		return id
	}
	return ""
}

// ─── Structured request logging ───

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) WriteHeader(code int) {
	r.status = code
	r.ResponseWriter.WriteHeader(code)
}

func loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		sr := &statusRecorder{ResponseWriter: w, status: 200}
		next.ServeHTTP(sr, r)
		dur := time.Since(start).Round(time.Millisecond)
		rid := getRequestID(r)
		level := slog.LevelInfo
		if sr.status >= 500 {
			level = slog.LevelError
		}
		if sr.status >= 400 && sr.status < 500 {
			level = slog.LevelWarn
		}
		slog.Log(r.Context(), level, "request",
			"rid", rid,
			"method", r.Method,
			"path", r.URL.Path,
			"status", sr.status,
			"duration_ms", dur.Milliseconds(),
			"ip", clientIP(r),
		)
	})
}

// ─── Panic recovery ───

func recoveryMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				slog.Error("panic_recovered", "rid", getRequestID(r), "panic", fmt.Sprint(rec))
				writeJSON(w, 500, map[string]interface{}{
					"ok": false, "error": "internal_error", "message": "Внутренняя ошибка сервера.",
				})
			}
		}()
		next.ServeHTTP(w, r)
	})
}
