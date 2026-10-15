package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestMetricsDisabledDefault(t *testing.T) {
	t.Setenv("METRICS_ENABLED", "")
	if metricsEnabled() {
		t.Error("metrics should be disabled by default")
	}
}

func TestMetricsEnabled(t *testing.T) {
	t.Setenv("METRICS_ENABLED", "true")
	if !metricsEnabled() {
		t.Error("metrics should be enabled")
	}
}

func TestMetricsEndpointDisabled(t *testing.T) {
	t.Setenv("METRICS_ENABLED", "")
	req := httptest.NewRequest("GET", "/api/metrics", nil)
	rec := httptest.NewRecorder()
	handleMetrics(rec, req)
	if rec.Code != 404 {
		t.Errorf("disabled metrics status = %d, want 404", rec.Code)
	}
}

func TestMetricsEndpointEnabledDev(t *testing.T) {
	t.Setenv("METRICS_ENABLED", "true")
	t.Setenv("APP_ENV", "development")
	req := httptest.NewRequest("GET", "/api/metrics", nil)
	rec := httptest.NewRecorder()
	handleMetrics(rec, req)
	if rec.Code != 200 {
		t.Errorf("dev metrics status = %d, want 200", rec.Code)
	}
}

func TestMetricsRequiresTokenInProduction(t *testing.T) {
	t.Setenv("APP_ENV", "production")
	t.Setenv("METRICS_ENABLED", "true")
	t.Setenv("METRICS_TOKEN", "prod-token-12c")
	req := httptest.NewRequest("GET", "/api/metrics", nil)
	rec := httptest.NewRecorder()
	handleMetrics(rec, req)
	if rec.Code != 401 {
		t.Errorf("prod no-token status = %d, want 401", rec.Code)
	}
}

func TestMetricsValidToken(t *testing.T) {
	t.Setenv("APP_ENV", "production")
	t.Setenv("METRICS_ENABLED", "true")
	t.Setenv("METRICS_TOKEN", "prod-token-12c")
	req := httptest.NewRequest("GET", "/api/metrics", nil)
	req.Header.Set("Authorization", "Bearer prod-token-12c")
	rec := httptest.NewRecorder()
	handleMetrics(rec, req)
	if rec.Code != 200 {
		t.Errorf("valid token status = %d, want 200", rec.Code)
	}
}

func TestMetricsWrongToken(t *testing.T) {
	t.Setenv("APP_ENV", "production")
	t.Setenv("METRICS_ENABLED", "true")
	t.Setenv("METRICS_TOKEN", "prod-token-12c")
	req := httptest.NewRequest("GET", "/api/metrics", nil)
	req.Header.Set("Authorization", "Bearer wrong-token-xx")
	rec := httptest.NewRecorder()
	handleMetrics(rec, req)
	if rec.Code != 401 {
		t.Errorf("wrong token status = %d, want 401", rec.Code)
	}
}

func TestMetricsContentType(t *testing.T) {
	t.Setenv("METRICS_ENABLED", "true")
	t.Setenv("APP_ENV", "development")
	req := httptest.NewRequest("GET", "/api/metrics", nil)
	rec := httptest.NewRecorder()
	handleMetrics(rec, req)
	ct := rec.Header().Get("Content-Type")
	if !strings.HasPrefix(ct, "text/plain") {
		t.Errorf("content-type = %q", ct)
	}
}

func TestMetricsOutput(t *testing.T) {
	t.Setenv("METRICS_ENABLED", "true")
	t.Setenv("APP_ENV", "development")
	req := httptest.NewRequest("GET", "/api/metrics", nil)
	rec := httptest.NewRecorder()
	handleMetrics(rec, req)
	body := rec.Body.String()
	for _, want := range []string{"agentone_requests_total", "agentone_uptime_seconds", "agentone_info"} {
		if !strings.Contains(body, want) {
			t.Errorf("missing %s in metrics", want)
		}
	}
}

func TestMetricsNoSecrets(t *testing.T) {
	t.Setenv("METRICS_ENABLED", "true")
	t.Setenv("APP_ENV", "development")
	t.Setenv("METRICS_TOKEN", "test-token-12c")
	req := httptest.NewRequest("GET", "/api/metrics", nil)
	rec := httptest.NewRecorder()
	handleMetrics(rec, req)
	body := rec.Body.String()
	for _, s := range []string{"test-token-12c", "DATABASE_URL", "Authorization", "GROQ_API_KEY", "gsk_"} {
		if strings.Contains(body, s) {
			t.Errorf("metrics leak: %s", s)
		}
	}
}

func TestRequestCounterIncrements(t *testing.T) {
	before := atomic.LoadInt64(&opsMetrics.requestsTotal)
	recordRequest(200, time.Millisecond)
	recordRequest(404, time.Millisecond)
	after := atomic.LoadInt64(&opsMetrics.requestsTotal)
	if after-before < 2 {
		t.Error("request counter did not increment")
	}
}

func TestStatusClassCounters(t *testing.T) {
	recordRequest(200, time.Millisecond)
	recordRequest(201, time.Millisecond)
	recordRequest(301, time.Millisecond)
	recordRequest(404, time.Millisecond)
	recordRequest(500, time.Millisecond)
	if atomic.LoadInt64(&opsMetrics.status2xx) < 1 {
		t.Error("2xx not incremented")
	}
	if atomic.LoadInt64(&opsMetrics.status3xx) < 1 {
		t.Error("3xx not incremented")
	}
	if atomic.LoadInt64(&opsMetrics.status4xx) < 1 {
		t.Error("4xx not incremented")
	}
	if atomic.LoadInt64(&opsMetrics.status5xx) < 1 {
		t.Error("5xx not incremented")
	}
}

func TestActiveRequests(t *testing.T) {
	before := atomic.LoadInt64(&opsMetrics.activeReqs)
	recordActiveEnter()
	mid := atomic.LoadInt64(&opsMetrics.activeReqs)
	if mid-before != 1 {
		t.Error("active not incremented on enter")
	}
	recordActiveLeave()
	after := atomic.LoadInt64(&opsMetrics.activeReqs)
	if after != before {
		t.Error("active not decremented on leave")
	}
}

func TestPanicCounter(t *testing.T) {
	before := atomic.LoadInt64(&opsMetrics.panicsTotal)
	recordPanic()
	if atomic.LoadInt64(&opsMetrics.panicsTotal) != before+1 {
		t.Error("panic counter")
	}
}

func TestReadinessCounters(t *testing.T) {
	recordReadySuccess()
	recordReadyFailure()
	recordReadySuccess()
	if atomic.LoadInt64(&opsMetrics.readySuccess) < 2 {
		t.Error("ready success")
	}
	if atomic.LoadInt64(&opsMetrics.readyFailure) < 1 {
		t.Error("ready failure")
	}
}

func TestUptime(t *testing.T) {
	u := uptimeSeconds()
	if u < 0 {
		t.Error("uptime negative")
	}
}

func TestOpsStatusDisabled(t *testing.T) {
	t.Setenv("OPS_STATUS_ENABLED", "")
	req := httptest.NewRequest("GET", "/api/ops/status", nil)
	rec := httptest.NewRecorder()
	handleOpsStatus(rec, req)
	if rec.Code != 404 {
		t.Errorf("ops status disabled = %d, want 404", rec.Code)
	}
}

func TestOpsStatusEnabled(t *testing.T) {
	t.Setenv("OPS_STATUS_ENABLED", "true")
	t.Setenv("APP_ENV", "development")
	req := httptest.NewRequest("GET", "/api/ops/status", nil)
	rec := httptest.NewRecorder()
	handleOpsStatus(rec, req)
	if rec.Code != 200 {
		t.Errorf("ops status = %d", rec.Code)
	}
}

func TestOpsStatusSafeFields(t *testing.T) {
	t.Setenv("OPS_STATUS_ENABLED", "true")
	t.Setenv("APP_ENV", "development")
	req := httptest.NewRequest("GET", "/api/ops/status", nil)
	rec := httptest.NewRecorder()
	handleOpsStatus(rec, req)
	body := rec.Body.String()
	for _, s := range []string{"DATABASE_URL", "postgres://", "METRICS_TOKEN", "gsk_"} {
		if strings.Contains(body, s) {
			t.Errorf("ops status leak: %s", s)
		}
	}
}

func TestConcurrentMetricsRace(t *testing.T) {
	var wg sync.WaitGroup
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func() { defer wg.Done(); recordRequest(200, time.Millisecond) }()
	}
	wg.Wait()
}

func TestValidateOperationalConfig(t *testing.T) {
	t.Setenv("APP_ENV", "production")
	t.Setenv("METRICS_ENABLED", "true")
	t.Setenv("METRICS_TOKEN", "")
	issues := validateOperationalConfig()
	found := false
	for _, i := range issues {
		if strings.Contains(i, "METRICS_TOKEN") {
			found = true
		}
	}
	if !found {
		t.Error("should require METRICS_TOKEN in production")
	}
}

func TestValidateOperationalConfigRejectsDevToken(t *testing.T) {
	t.Setenv("APP_ENV", "production")
	t.Setenv("METRICS_ENABLED", "true")
	t.Setenv("METRICS_TOKEN", "dev-metrics-token")
	issues := validateOperationalConfig()
	found := false
	for _, i := range issues {
		if strings.Contains(i, "development default") {
			found = true
		}
	}
	if !found {
		t.Error("should reject dev metrics token")
	}
}

func TestMetricsMiddleware(t *testing.T) {
	h := metricsMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(201)
	}))
	before := atomic.LoadInt64(&opsMetrics.requestsTotal)
	req := httptest.NewRequest("GET", "/test", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if atomic.LoadInt64(&opsMetrics.requestsTotal) <= before {
		t.Error("metrics middleware did not count")
	}
	if rec.Code != 201 {
		t.Errorf("middleware changed status to %d", rec.Code)
	}
}
