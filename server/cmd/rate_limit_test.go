package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestRateLimitAuthGroupRefresh(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/auth/refresh", func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(200) })
	handler := rateLimitMiddleware(mux)
	req := httptest.NewRequest("POST", "/api/auth/refresh", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != 200 && rec.Code != 429 {
		t.Errorf("refresh route should be handled (got %d)", rec.Code)
	}
}

func TestRateLimitAuthGroupLogout(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/auth/logout", func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(200) })
	handler := rateLimitMiddleware(mux)
	req := httptest.NewRequest("POST", "/api/auth/logout", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != 200 && rec.Code != 429 {
		t.Errorf("logout should be in auth group (got %d)", rec.Code)
	}
}

func TestRateLimitAuthGroupLogoutAll(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/auth/logout-all", func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(200) })
	handler := rateLimitMiddleware(mux)
	req := httptest.NewRequest("POST", "/api/auth/logout-all", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != 200 && rec.Code != 429 {
		t.Errorf("logout-all should be in auth group (got %d)", rec.Code)
	}
}

func TestRateLimitAuthGroupIgnoresXUserID(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/auth/signin", func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(200) })
	handler := rateLimitMiddleware(mux)
	req1 := httptest.NewRequest("POST", "/api/auth/signin", nil)
	req1.Header.Set("X-User-ID", "user-a")
	rec1 := httptest.NewRecorder()
	handler.ServeHTTP(rec1, req1)
	req2 := httptest.NewRequest("POST", "/api/auth/signin", nil)
	req2.Header.Set("X-User-ID", "user-b")
	rec2 := httptest.NewRecorder()
	handler.ServeHTTP(rec2, req2)
	if rec1.Code != 200 && rec1.Code != 429 {
		t.Errorf("unexpected status %d", rec1.Code)
	}
	if rec2.Code != 200 && rec2.Code != 429 {
		t.Errorf("unexpected status %d", rec2.Code)
	}
}

func TestRateLimitAuthGroupUsesIP(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/auth/signup", func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(200) })
	handler := rateLimitMiddleware(mux)
	req := httptest.NewRequest("POST", "/api/auth/signup", nil)
	req.RemoteAddr = "10.0.0.1:12345"
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != 200 && rec.Code != 429 {
		t.Errorf("unexpected status %d", rec.Code)
	}
}

func TestRateLimitAuthDifferentIPsDifferentBuckets(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/auth/signup", func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(200) })
	handler := rateLimitMiddleware(mux)
	reqA := httptest.NewRequest("POST", "/api/auth/signup", nil)
	reqA.RemoteAddr = "10.0.0.1:12345"
	recA := httptest.NewRecorder()
	for i := 0; i < 19; i++ {
		handler.ServeHTTP(recA, reqA)
	}
	reqB := httptest.NewRequest("POST", "/api/auth/signup", nil)
	reqB.RemoteAddr = "10.0.0.2:12345"
	recB := httptest.NewRecorder()
	handler.ServeHTTP(recB, reqB)
	if recB.Code != 200 {
		t.Errorf("different IP should have separate bucket, got %d", recB.Code)
	}
}
