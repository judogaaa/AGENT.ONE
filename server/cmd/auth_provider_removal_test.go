package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestAuthProvidersReturnsOnlyYandex(t *testing.T) {
	t.Setenv("YANDEX_OAUTH_CLIENT_ID", "test-client-id")
	t.Setenv("YANDEX_OAUTH_CLIENT_SECRET", "test-client-secret")

	w := httptest.NewRecorder()
	yandexProvidersHandler(w, httptest.NewRequest("GET", "/api/auth/providers", nil))
	resp := w.Result()
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}

	var body struct {
		OK   bool `json:"ok"`
		Data struct {
			Providers []map[string]interface{} `json:"providers"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(body.Data.Providers) != 1 {
		t.Fatalf("providers len = %d, want 1: %#v", len(body.Data.Providers), body.Data.Providers)
	}
	provider := body.Data.Providers[0]
	if provider["id"] != "yandex" {
		t.Fatalf("provider id = %#v, want yandex", provider["id"])
	}
	if _, ok := provider["auth_mode"]; ok {
		t.Fatal("provider response must not expose removed provider mode")
	}
	for _, p := range body.Data.Providers {
		if p["id"] == "telegram" {
			t.Fatal("removed provider must be absent from provider API response")
		}
	}
}

func TestRemovedAuthProviderRoutesAreNotRegistered(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/auth/oauth/yandex/start", func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusFound) })
	mux.HandleFunc("GET /api/auth/oauth/yandex/callback", func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusFound) })
	mux.HandleFunc("GET /api/auth/providers", yandexProvidersHandler)

	paths := []string{
		"/api/auth/oauth/telegram/start",
		"/api/auth/oauth/telegram/callback",
		"/api/auth/oauth/telegram/status",
		"/api/auth/oauth/telegram/widget/prepare",
	}
	for _, path := range paths {
		t.Run(path, func(t *testing.T) {
			w := httptest.NewRecorder()
			mux.ServeHTTP(w, httptest.NewRequest("GET", path, nil))
			if w.Result().StatusCode != http.StatusNotFound {
				t.Fatalf("status = %d, want 404", w.Result().StatusCode)
			}
		})
	}
}
