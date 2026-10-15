package main

import (
	"net/http"
	"strings"
	"sync"
	"time"
)

// rateLimitEntry — in-memory fallback когда Redis недоступен.
type rateLimitEntry struct {
	count  int
	window time.Time
}

type rateLimiter struct {
	mu      sync.Mutex
	entries map[string]*rateLimitEntry
	limits  map[string]int // group → requests per minute
}

var rl = &rateLimiter{
	entries: make(map[string]*rateLimitEntry),
	limits: map[string]int{
		"auth": 20,
		"ai":   60,
		"lead": 30,
	},
}

func (rl *rateLimiter) allow(key string, limit int) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()
	now := time.Now()
	e, ok := rl.entries[key]
	if !ok || now.Sub(e.window) > time.Minute {
		rl.entries[key] = &rateLimitEntry{count: 1, window: now}
		return true
	}
	if e.count >= limit {
		return false
	}
	e.count++
	return true
}

func (rl *rateLimiter) cleanup() {
	rl.mu.Lock()
	defer rl.mu.Unlock()
	cutoff := time.Now().Add(-2 * time.Minute)
	for k, e := range rl.entries {
		if e.window.Before(cutoff) {
			delete(rl.entries, k)
		}
	}
}

// rateLimitMiddleware: сначала Redis (быстро, общее между инстансами), при
// недоступности — fallback в in-memory. Это даёт корректный rate limit даже
// если Redis упал (только для одного инстанса).
func rateLimitMiddleware(next http.Handler) http.Handler {
	// Periodic cleanup in-memory fallback
	go func() {
		for {
			time.Sleep(5 * time.Minute)
			rl.cleanup()
		}
	}()
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path
		var group string
		if strings.HasPrefix(path, "/api/auth/signin") || strings.HasPrefix(path, "/api/auth/signup") || strings.HasPrefix(path, "/api/auth/refresh") || strings.HasPrefix(path, "/api/auth/logout") || strings.HasPrefix(path, "/api/auth/email-verification") {
			group = "auth"
		} else if strings.HasPrefix(path, "/api/assistant/chat") || strings.HasPrefix(path, "/api/ai-manager/chat") || strings.HasPrefix(path, "/api/business/copilot/reply") {
			group = "ai"
		} else if strings.HasPrefix(path, "/api/products/") && (strings.HasSuffix(path, "/contact") || strings.Contains(path, "/contact")) {
			group = "lead"
		} else {
			next.ServeHTTP(w, r)
			return
		}
		limit, ok := rl.limits[group]
		if !ok {
			next.ServeHTTP(w, r)
			return
		}
		// Key: for auth routes use client IP only (no untrusted header)
		key := group + ":"
		if group == "auth" {
			key += trustedClientIP(r)
		} else if userID := r.Header.Get("X-User-ID"); userID != "" {
			key += userID
		} else {
			key += clientIP(r)
		}

		// Redis-backed counter (распределённо между инстансами)
		if RedisHealthy() {
			allowed := RateLimitAllow(r.Context(), key, limit, time.Minute)
			if !allowed {
				rejected(w)
				return
			}
		} else {
			// Fallback in-memory
			if !rl.allow(key, limit) {
				rejected(w)
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

func rejected(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(429)
	w.Write([]byte(`{"error":"rate_limited","message":"Слишком много запросов. Повторите позже."}`))
}
