package main

import (
	"net/http/httptest"
	"testing"
)

func TestClientIPIgnoresUntrustedXForwardedFor(t *testing.T) {
	defer func() { trustedCIDRs = nil }()
	trustedCIDRs = nil
	r := httptest.NewRequest("GET", "/", nil)
	r.RemoteAddr = "10.0.0.1:12345"
	r.Header.Set("X-Forwarded-For", "1.2.3.4, 5.6.7.8")
	ip := clientIP(r)
	if ip != "10.0.0.1" {
		t.Errorf("clientIP = %q, want 10.0.0.1 (untrusted proxy)", ip)
	}
}

func TestClientIPIgnoresUntrustedXRealIP(t *testing.T) {
	defer func() { trustedCIDRs = nil }()
	trustedCIDRs = nil
	r := httptest.NewRequest("GET", "/", nil)
	r.RemoteAddr = "10.0.0.1:12345"
	r.Header.Set("X-Real-IP", "192.168.1.1")
	ip := clientIP(r)
	if ip != "10.0.0.1" {
		t.Errorf("clientIP = %q, want 10.0.0.1", ip)
	}
}

func TestClientIPUsesRemoteAddrWhenNoHeaders(t *testing.T) {
	r := httptest.NewRequest("GET", "/", nil)
	r.RemoteAddr = "10.0.0.1:12345"
	ip := clientIP(r)
	if ip != "10.0.0.1" {
		t.Errorf("clientIP = %q, want 10.0.0.1", ip)
	}
}

func TestClientIPNoPanicEmptyHeaders(t *testing.T) {
	r := httptest.NewRequest("GET", "/", nil)
	_ = clientIP(r) // must not panic
}

func TestClientIPTrustedProxyRespectsXForwardedFor(t *testing.T) {
	defer func() { trustedCIDRs = nil }()
	t.Setenv("TRUSTED_PROXY_CIDRS", "10.0.0.0/24")
	initTrustedProxies()
	r := httptest.NewRequest("GET", "/", nil)
	r.RemoteAddr = "10.0.0.1:12345"
	r.Header.Set("X-Forwarded-For", "203.0.113.5")
	ip := clientIP(r)
	if ip != "203.0.113.5" {
		t.Errorf("clientIP = %q, want 203.0.113.5", ip)
	}
}

func TestUserAgent(t *testing.T) {
	r := httptest.NewRequest("GET", "/", nil)
	r.Header.Set("User-Agent", "TestAgent/1.0")
	if ua := userAgent(r); ua != "TestAgent/1.0" {
		t.Errorf("userAgent = %q, want TestAgent/1.0", ua)
	}
}

func TestUserAgentEmpty(t *testing.T) {
	r := httptest.NewRequest("GET", "/", nil)
	if ua := userAgent(r); ua != "" {
		t.Errorf("userAgent = %q, want empty", ua)
	}
}

func TestRequestMeta(t *testing.T) {
	r := httptest.NewRequest("GET", "/", nil)
	r.Header.Set("User-Agent", "Metabot")
	meta := requestMeta(r)
	if meta["ip"] == "" {
		t.Error("meta ip should not be empty")
	}
	if meta["user_agent"] != "Metabot" {
		t.Errorf("meta ua = %v", meta["user_agent"])
	}
	// No Authorization header in meta
	if _, ok := meta["authorization"]; ok {
		t.Error("meta must not contain authorization")
	}
}

func TestClientIPInvalidForwardedFor(t *testing.T) {
	r := httptest.NewRequest("GET", "/", nil)
	r.Header.Set("X-Forwarded-For", "")
	// Should fall back to X-Real-IP or RemoteAddr
	ip := clientIP(r)
	// Just verify it returns something, not panics
	if len(ip) == 0 {
		t.Error("clientIP returned empty")
	}
}

func TestClientIPNoHeaderFields(t *testing.T) {
	r := httptest.NewRequest("GET", "/", nil)
	r.Header = nil // unusual, but should not panic
	ip := clientIP(r)
	if len(ip) == 0 {
		t.Error("clientIP returned empty with nil headers")
	}
}

func TestWriteJSONStatus(t *testing.T) {
	for _, code := range []int{200, 201, 400, 404, 500} {
		w := httptest.NewRecorder()
		writeJSON(w, code, map[string]int{"x": 1})
		if w.Code != code {
			t.Errorf("writeJSON status = %d, want %d", w.Code, code)
		}
	}
}

func TestEnvCSV(t *testing.T) {
	t.Setenv("CSV_KEY", "a, b ,c")
	v := envCSV("CSV_KEY")
	if len(v) != 3 || v[0] != "a" || v[1] != "b" || v[2] != "c" {
		t.Errorf("envCSV = %v", v)
	}
}

func TestEnvCSVEmpty(t *testing.T) {
	v := envCSV("NONEXISTENT_CSV")
	if v != nil {
		t.Errorf("envCSV(empty) = %v, want nil", v)
	}
}

func TestIsLocalDev(t *testing.T) {
	t.Setenv("APP_ENV", "production")
	if isLocalDev() {
		t.Error("isLocalDev should be false in production")
	}
	t.Setenv("APP_ENV", "development")
	if !isLocalDev() {
		t.Error("isLocalDev should be true in development")
	}
}

func TestWriteForbiddenDefault(t *testing.T) {
	w := httptest.NewRecorder()
	writeForbidden(w, "")
	if w.Code != 403 {
		t.Errorf("status = %d, want 403", w.Code)
	}
}

// Test JSON helpers use bytes import
func TestWriteJSONBytes(t *testing.T) {
	w := httptest.NewRecorder()
	writeJSON(w, 201, []byte(`"raw"`))
	if w.Code != 201 {
		t.Errorf("status = %d", w.Code)
	}
}
