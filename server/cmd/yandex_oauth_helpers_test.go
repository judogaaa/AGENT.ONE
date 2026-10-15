package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync"
	"time"
)

// ── In-memory OAuth state store for tests ──

type memoryStateStore struct {
	mu   sync.Mutex
	data map[string]memoryStateEntry
}

type memoryStateEntry struct {
	value   string
	expires time.Time
}

func newMemoryStateStore() *memoryStateStore {
	return &memoryStateStore{data: make(map[string]memoryStateEntry)}
}

func (s *memoryStateStore) Set(ctx context.Context, key, value string, ttl time.Duration) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.data[key] = memoryStateEntry{value: value, expires: time.Now().Add(ttl)}
	return nil
}

func (s *memoryStateStore) Get(ctx context.Context, key string) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	entry, ok := s.data[key]
	if !ok {
		return "", fmt.Errorf("key not found")
	}
	if time.Now().After(entry.expires) {
		return "", fmt.Errorf("expired")
	}
	return entry.value, nil
}

func (s *memoryStateStore) GetDel(ctx context.Context, key string) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	entry, ok := s.data[key]
	if !ok {
		return "", fmt.Errorf("key not found")
	}
	delete(s.data, key)
	if time.Now().After(entry.expires) {
		return "", fmt.Errorf("expired")
	}
	return entry.value, nil
}

// ── Fake HTTP servers for token and profile endpoints ──

// fakeTokenResponse is sent by the fake token server on success.
type fakeTokenResponse struct {
	AccessToken  string `json:"access_token"`
	ExpiresIn    int    `json:"expires_in"`
	RefreshToken string `json:"refresh_token"`
	TokenType    string `json:"token_type"`
}

// fakeProfileResponse is sent by the fake profile server on success.
type fakeProfileResponse struct {
	ID           string   `json:"id"`
	Login        string   `json:"login"`
	ClientID     string   `json:"client_id,omitempty"`
	DefaultEmail string   `json:"default_email,omitempty"`
	Emails       []string `json:"emails,omitempty"`
	DisplayName  string   `json:"display_name,omitempty"`
	RealName     string   `json:"real_name,omitempty"`
	FirstName    string   `json:"first_name,omitempty"`
	LastName     string   `json:"last_name,omitempty"`
}

// newFakeTokenServer creates an httptest.Server that simulates
// Yandex token endpoint behaviour.
func newFakeTokenServer(success bool, respBody string, statusCode int, contentType string) *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if contentType != "" {
			w.Header().Set("Content-Type", contentType)
		}
		w.WriteHeader(statusCode)
		if respBody != "" {
			w.Write([]byte(respBody))
		}
	}))
}

// newFakeProfileServer creates an httptest.Server that simulates
// Yandex profile endpoint behaviour.
func newFakeProfileServer(success bool, respBody string, statusCode int, contentType string) *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if contentType != "" {
			w.Header().Set("Content-Type", contentType)
		}
		w.WriteHeader(statusCode)
		if respBody != "" {
			w.Write([]byte(respBody))
		}
	}))
}

// successTokenServer starts a server that returns a valid token response.
func successTokenServer(accessToken string) *httptest.Server {
	resp := fakeTokenResponse{
		AccessToken:  accessToken,
		ExpiresIn:    3600,
		RefreshToken: "rt_refresh",
		TokenType:    "bearer",
	}
	body, _ := json.Marshal(resp)
	return newFakeTokenServer(true, string(body), 200, "application/json")
}

// successProfileServer starts a server that returns a valid profile.
func successProfileServer(yandexID, email, displayName string) *httptest.Server {
	resp := fakeProfileResponse{
		ID:           yandexID,
		Login:        "yandex_user",
		DefaultEmail: email,
		Emails:       []string{email},
		DisplayName:  displayName,
	}
	body, _ := json.Marshal(resp)
	return newFakeProfileServer(true, string(body), 200, "application/json")
}

// testOAuthConfig returns a yandexOAuthConfig pre-configured with
// the given token and profile server URLs and a test HTTP client.
func testOAuthConfig(tokenURL, profileURL string) yandexOAuthConfig {
	return yandexOAuthConfig{
		ClientID:         "test-client-id",
		ClientSecret:     "test-client-secret",
		RedirectURI:      "https://auth.example.com/callback",
		Enabled:          true,
		HTTPClient:       http.DefaultClient,
		AuthorizationURL: "https://oauth.yandex.ru/authorize",
		TokenURL:         tokenURL,
		ProfileURL:       profileURL,
	}
}
