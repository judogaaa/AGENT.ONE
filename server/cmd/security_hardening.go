package main

import (
	"fmt"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

// ═══════════════════════════════════════════════════════════════
// Security Headers
// ═══════════════════════════════════════════════════════════════

var securityHeadersEnabled = true

func initSecurityHeaders() {
	if strings.ToLower(envString("SECURITY_HEADERS_ENABLED", "true")) != "true" {
		securityHeadersEnabled = false
	}
}

func securityHeadersMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !securityHeadersEnabled {
			next.ServeHTTP(w, r)
			return
		}
		// CSP — permissive enough for current SPA + product images
		w.Header().Set("Content-Security-Policy", "default-src 'self'; img-src 'self' https: data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'")
		// Already set in corsMiddleware, but ensure consistency
		if w.Header().Get("X-Content-Type-Options") == "" {
			w.Header().Set("X-Content-Type-Options", "nosniff")
		}
		if w.Header().Get("X-Frame-Options") == "" {
			w.Header().Set("X-Frame-Options", "DENY")
		}
		if w.Header().Get("Referrer-Policy") == "" {
			w.Header().Set("Referrer-Policy", "no-referrer")
		}
		w.Header().Set("Permissions-Policy", "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()")
		w.Header().Set("Cross-Origin-Opener-Policy", "same-origin")
		w.Header().Set("Cross-Origin-Resource-Policy", "cross-origin")

		// HSTS only when HTTPS is detected via trusted proxy
		if isSecureScheme(r) && isProduction() {
			w.Header().Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
		}

		// Cache-Control for auth/private endpoints
		if strings.HasPrefix(r.URL.Path, "/api/auth/") || strings.HasPrefix(r.URL.Path, "/api/my/") {
			w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate, private")
			w.Header().Set("Pragma", "no-cache")
		}

		next.ServeHTTP(w, r)
	})
}

func isSecureScheme(r *http.Request) bool {
	if r.TLS != nil {
		return true
	}
	proto := r.Header.Get("X-Forwarded-Proto")
	if proto == "https" && isTrustedProxy(r) {
		return true
	}
	return false
}

// ═══════════════════════════════════════════════════════════════
// Trusted Proxy
// ═══════════════════════════════════════════════════════════════

var trustedCIDRs []*net.IPNet

func initTrustedProxies() {
	raw := envString("TRUSTED_PROXY_CIDRS", "")
	if raw == "" {
		return
	}
	for _, s := range strings.Split(raw, ",") {
		s = strings.TrimSpace(s)
		if s == "" {
			continue
		}
		if !strings.Contains(s, "/") {
			if !strings.Contains(s, ":") {
				s += "/32"
			} else {
				s += "/128"
			}
		}
		_, cidr, err := net.ParseCIDR(s)
		if err != nil {
			continue
		}
		trustedCIDRs = append(trustedCIDRs, cidr)
	}
}

func isTrustedProxy(r *http.Request) bool {
	if len(trustedCIDRs) == 0 {
		return false
	}
	ipStr, _, _ := net.SplitHostPort(r.RemoteAddr)
	ip := net.ParseIP(ipStr)
	if ip == nil {
		return false
	}
	for _, cidr := range trustedCIDRs {
		if cidr.Contains(ip) {
			return true
		}
	}
	return false
}

// trustedClientIP returns the real client IP: only trusts forwarded headers from trusted proxies
func trustedClientIP(r *http.Request) string {
	if !isTrustedProxy(r) {
		ip, _, _ := net.SplitHostPort(r.RemoteAddr)
		return ip
	}
	xff := r.Header.Get("X-Forwarded-For")
	if xff != "" {
		parts := strings.Split(xff, ",")
		if len(parts) > 0 {
			ip := strings.TrimSpace(parts[len(parts)-1])
			// Validate IP format
			if net.ParseIP(ip) != nil {
				return ip
			}
		}
	}
	xri := r.Header.Get("X-Real-IP")
	if xri != "" {
		ip := strings.TrimSpace(xri)
		if net.ParseIP(ip) != nil {
			return ip
		}
	}
	ip, _, _ := net.SplitHostPort(r.RemoteAddr)
	return ip
}

// ═══════════════════════════════════════════════════════════════
// Request Body Limits
// ═══════════════════════════════════════════════════════════════

func maxRequestBodyBytes() int64 {
	v := envInt("MAX_REQUEST_BODY_BYTES", 1<<20)
	if v <= 0 {
		return 1 << 20
	}
	if v > 50<<20 {
		return 50 << 20
	}
	return int64(v)
}

func maxUploadBytes() int64 {
	v := envInt("MAX_UPLOAD_BYTES", 5<<20)
	if v <= 0 {
		return 5 << 20
	}
	if v > 20<<20 {
		return 20 << 20
	}
	return int64(v)
}

func bodyLimitMiddleware(next http.Handler) http.Handler {
	limit := maxRequestBodyBytes()
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "GET" || r.Method == "HEAD" || r.Method == "OPTIONS" {
			next.ServeHTTP(w, r)
			return
		}
		if r.ContentLength > limit {
			writeError(w, 413, "payload_too_large", "Request body too large.")
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, limit)
		next.ServeHTTP(w, r)
	})
}

// ═══════════════════════════════════════════════════════════════
// Server Timeout Config
// ═══════════════════════════════════════════════════════════════

func serverReadTimeout() time.Duration {
	v := envInt("SERVER_READ_TIMEOUT_SECONDS", 15)
	if v <= 0 {
		return 15 * time.Second
	}
	return time.Duration(v) * time.Second
}

func serverWriteTimeout() time.Duration {
	v := envInt("SERVER_WRITE_TIMEOUT_SECONDS", 60)
	if v <= 0 {
		return 60 * time.Second
	}
	return time.Duration(v) * time.Second
}

func serverIdleTimeout() time.Duration {
	v := envInt("SERVER_IDLE_TIMEOUT_SECONDS", 60)
	if v <= 0 {
		return 60 * time.Second
	}
	return time.Duration(v) * time.Second
}

func serverMaxHeaderBytes() int {
	v := envInt("SERVER_MAX_HEADER_BYTES", 1<<20)
	if v <= 0 {
		return 1 << 20
	}
	if v > 4<<20 {
		return 4 << 20
	}
	return v
}

// ═══════════════════════════════════════════════════════════════
// Auth Brute-Force Hardening
// ═══════════════════════════════════════════════════════════════

type authFailureEntry struct {
	count       int
	firstSeen   time.Time
	lastSeen    time.Time
	locked      bool
	lockedUntil time.Time
}

type authBruteForceLimiter struct {
	mu      sync.Mutex
	entries map[string]*authFailureEntry
}

var authLimiter = &authBruteForceLimiter{
	entries: make(map[string]*authFailureEntry),
}

func authFailureLimit() int {
	v := envInt("AUTH_FAILURE_LIMIT", 5)
	if v <= 0 {
		v = 5
	}
	return v
}

func authFailureWindow() time.Duration {
	v := envInt("AUTH_FAILURE_WINDOW_SECONDS", 300)
	if v <= 0 {
		v = 300
	}
	return time.Duration(v) * time.Second
}

func authLockoutDuration() time.Duration {
	v := envInt("AUTH_LOCKOUT_SECONDS", 600)
	if v <= 0 {
		v = 600
	}
	return time.Duration(v) * time.Second
}

// authKey builds a normalized key: email + client IP
func authKey(email, remoteIP string) string {
	return fmt.Sprintf("%s:%s", strings.TrimSpace(remoteIP), normalizeEmail(email))
}

func (l *authBruteForceLimiter) recordFailure(key string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	entry, exists := l.entries[key]
	if !exists {
		l.entries[key] = &authFailureEntry{count: 1, firstSeen: now, lastSeen: now}
		return false
	}
	// If locked, check if lockout expired
	if entry.locked {
		if now.Before(entry.lockedUntil) {
			return true // still locked
		}
		// Lockout expired, reset
		entry.locked = false
		entry.count = 1
		entry.firstSeen = now
		entry.lastSeen = now
		return false
	}
	// Check if window expired — reset
	if now.Sub(entry.firstSeen) > authFailureWindow() {
		entry.count = 1
		entry.firstSeen = now
		entry.lastSeen = now
		return false
	}
	entry.count++
	entry.lastSeen = now
	if entry.count >= authFailureLimit() {
		entry.locked = true
		entry.lockedUntil = now.Add(authLockoutDuration())
		return true
	}
	return false
}

func (l *authBruteForceLimiter) reset(key string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	delete(l.entries, key)
}

func (l *authBruteForceLimiter) isLocked(key string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	entry, exists := l.entries[key]
	if !exists || !entry.locked {
		return false
	}
	if time.Now().After(entry.lockedUntil) {
		delete(l.entries, key)
		return false
	}
	return true
}

func (l *authBruteForceLimiter) cleanup() {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	for k, e := range l.entries {
		if e.locked && now.After(e.lockedUntil) {
			delete(l.entries, k)
		} else if !e.locked && now.Sub(e.lastSeen) > authFailureWindow()*2 {
			delete(l.entries, k)
		}
	}
}

// startAuthLimiterCleanup runs periodic cleanup
func startAuthLimiterCleanup() {
	go func() {
		for {
			time.Sleep(5 * time.Minute)
			authLimiter.cleanup()
		}
	}()
}

// ═══════════════════════════════════════════════════════════════
// Safe Error Response — ensures no sensitive data leaks
// ═══════════════════════════════════════════════════════════════

func safeErrorMessage(err error) string {
	if err == nil {
		return "Internal server error."
	}
	msg := err.Error()
	// Block known sensitive patterns
	lower := strings.ToLower(msg)
	for _, p := range []string{"password", "secret", "token", "database_url", "gsk_", "postgres://", "stack", "goroutine", "panic"} {
		if strings.Contains(lower, p) {
			return "Internal server error."
		}
	}
	// Generic fallback for any detailed error
	if len(msg) > 200 {
		return "Internal server error."
	}
	return msg
}

// ═══════════════════════════════════════════════════════════════
// Hardened CORS Validation
// ═══════════════════════════════════════════════════════════════

func validateCORSConfig() []string {
	var issues []string
	if !isProduction() {
		return issues
	}
	origins := envCSV("CORS_ORIGINS")
	if len(origins) == 0 {
		origins = envCSV("APP_ORIGIN")
	}
	if len(origins) == 0 {
		issues = append(issues, "CORS_ORIGINS must be set in production")
		return issues
	}
	for _, o := range origins {
		o = strings.TrimSpace(o)
		if o == "*" {
			issues = append(issues, "CORS_ORIGINS must not be '*' in production")
		}
		if o == "" {
			issues = append(issues, "CORS_ORIGINS contains empty entry")
		}
	}
	return issues
}

// ═══════════════════════════════════════════════════════════════
// Extended Config Validation
// ═══════════════════════════════════════════════════════════════

func validateSecurityConfig() []string {
	var issues []string
	if !isProduction() {
		return issues
	}
	// Security headers
	if envString("SECURITY_HEADERS_ENABLED", "true") != "true" {
		issues = append(issues, "SECURITY_HEADERS_ENABLED must be true in production")
	}
	// CORS
	issues = append(issues, validateCORSConfig()...)
	// Body limits
	bodyBytes := envInt("MAX_REQUEST_BODY_BYTES", 0)
	if bodyBytes <= 0 {
		issues = append(issues, "MAX_REQUEST_BODY_BYTES must be set in production")
	}
	uploadBytes := envInt("MAX_UPLOAD_BYTES", 0)
	if uploadBytes <= 0 {
		issues = append(issues, "MAX_UPLOAD_BYTES must be set in production")
	}
	// Server timeouts
	readTO := envInt("SERVER_READ_TIMEOUT_SECONDS", 0)
	if readTO <= 0 {
		issues = append(issues, "SERVER_READ_TIMEOUT_SECONDS must be set in production")
	}
	writeTO := envInt("SERVER_WRITE_TIMEOUT_SECONDS", 0)
	if writeTO <= 0 {
		issues = append(issues, "SERVER_WRITE_TIMEOUT_SECONDS must be set in production")
	}
	idleTO := envInt("SERVER_IDLE_TIMEOUT_SECONDS", 0)
	if idleTO <= 0 {
		issues = append(issues, "SERVER_IDLE_TIMEOUT_SECONDS must be set in production")
	}
	// Auth
	authLimit := envInt("AUTH_FAILURE_LIMIT", 0)
	if authLimit <= 0 {
		issues = append(issues, "AUTH_FAILURE_LIMIT must be set in production")
	}
	return issues
}
