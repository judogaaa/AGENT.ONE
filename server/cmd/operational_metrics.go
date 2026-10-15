package main

import (
	"context"
	"crypto/subtle"
	"fmt"
	"net/http"
	"strings"
	"sync/atomic"
	"time"
)

// ─── Metrics collector ───

type operationalMetrics struct {
	startTime       time.Time
	requestsTotal   int64
	activeReqs      int64
	status2xx       int64
	status3xx       int64
	status4xx       int64
	status5xx       int64
	durationTotalNs int64
	panicsTotal     int64
	readySuccess    int64
	readyFailure    int64
}

var opsMetrics = &operationalMetrics{startTime: time.Now()}

func recordRequest(status int, dur time.Duration) {
	atomic.AddInt64(&opsMetrics.requestsTotal, 1)
	atomic.AddInt64(&opsMetrics.durationTotalNs, dur.Nanoseconds())
	sc := status / 100
	switch sc {
	case 2:
		atomic.AddInt64(&opsMetrics.status2xx, 1)
	case 3:
		atomic.AddInt64(&opsMetrics.status3xx, 1)
	case 4:
		atomic.AddInt64(&opsMetrics.status4xx, 1)
	case 5:
		atomic.AddInt64(&opsMetrics.status5xx, 1)
	}
}

func recordActiveEnter()  { atomic.AddInt64(&opsMetrics.activeReqs, 1) }
func recordActiveLeave()  { atomic.AddInt64(&opsMetrics.activeReqs, -1) }
func recordPanic()        { atomic.AddInt64(&opsMetrics.panicsTotal, 1) }
func recordReadySuccess() { atomic.AddInt64(&opsMetrics.readySuccess, 1) }
func recordReadyFailure() { atomic.AddInt64(&opsMetrics.readyFailure, 1) }

func uptimeSeconds() float64 { return time.Since(opsMetrics.startTime).Seconds() }

type metricsTrackingWriter struct {
	http.ResponseWriter
	status int
}

func (w *metricsTrackingWriter) WriteHeader(code int) {
	w.status = code
	w.ResponseWriter.WriteHeader(code)
}

func metricsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/metrics") || strings.HasPrefix(r.URL.Path, "/api/live") || strings.HasPrefix(r.URL.Path, "/api/ready") {
			next.ServeHTTP(w, r)
			return
		}
		recordActiveEnter()
		start := time.Now()
		mw := &metricsTrackingWriter{ResponseWriter: w, status: 200}
		next.ServeHTTP(mw, r)
		recordRequest(mw.status, time.Since(start))
		recordActiveLeave()
	})
}

// ─── Metrics endpoint ───

func metricsEnabled() bool {
	return strings.ToLower(strings.TrimSpace(envString("METRICS_ENABLED", ""))) == "true"
}

func metricsToken() string { return envString("METRICS_TOKEN", "") }

func requireMetricsToken(w http.ResponseWriter, r *http.Request) bool {
	if !isProduction() && !metricsEnabled() {
		return false
	}
	if !metricsEnabled() {
		return false
	}
	token := metricsToken()
	if token == "" {
		return false
	}
	auth := r.Header.Get("Authorization")
	auth = strings.TrimPrefix(auth, "Bearer ")
	auth = strings.TrimSpace(auth)
	return subtle.ConstantTimeCompare([]byte(auth), []byte(token)) == 1
}

func handleMetrics(w http.ResponseWriter, r *http.Request) {
	if !metricsEnabled() {
		writeError(w, 404, "not_found", "Metrics are not enabled.")
		return
	}
	if isProduction() || metricsToken() != "" {
		if !requireMetricsToken(w, r) {
			w.Header().Set("WWW-Authenticate", "Bearer")
			writeError(w, 401, "unauthorized", "Metrics token required.")
			return
		}
	}
	m := buildMetricsText()
	w.Header().Set("Content-Type", "text/plain; version=0.0.4")
	w.WriteHeader(200)
	w.Write([]byte(m))
}

func buildMetricsText() string {
	var sb strings.Builder
	sb.WriteString("# HELP agentone_requests_total Total HTTP requests.\n")
	sb.WriteString("# TYPE agentone_requests_total counter\n")
	sb.WriteString(fmt.Sprintf("agentone_requests_total %d\n", atomic.LoadInt64(&opsMetrics.requestsTotal)))
	sb.WriteString("# HELP agentone_requests_active Active HTTP requests.\n")
	sb.WriteString("# TYPE agentone_requests_active gauge\n")
	sb.WriteString(fmt.Sprintf("agentone_requests_active %d\n", atomic.LoadInt64(&opsMetrics.activeReqs)))
	sb.WriteString("# HELP agentone_responses_total HTTP responses by status class.\n")
	sb.WriteString("# TYPE agentone_responses_total counter\n")
	sb.WriteString(fmt.Sprintf("agentone_responses_total{status_class=\"2xx\"} %d\n", atomic.LoadInt64(&opsMetrics.status2xx)))
	sb.WriteString(fmt.Sprintf("agentone_responses_total{status_class=\"3xx\"} %d\n", atomic.LoadInt64(&opsMetrics.status3xx)))
	sb.WriteString(fmt.Sprintf("agentone_responses_total{status_class=\"4xx\"} %d\n", atomic.LoadInt64(&opsMetrics.status4xx)))
	sb.WriteString(fmt.Sprintf("agentone_responses_total{status_class=\"5xx\"} %d\n", atomic.LoadInt64(&opsMetrics.status5xx)))
	sb.WriteString("# HELP agentone_panics_total Total recovered panics.\n")
	sb.WriteString("# TYPE agentone_panics_total counter\n")
	sb.WriteString(fmt.Sprintf("agentone_panics_total %d\n", atomic.LoadInt64(&opsMetrics.panicsTotal)))
	sb.WriteString("# HELP agentone_readiness_total Readiness probe results.\n")
	sb.WriteString("# TYPE agentone_readiness_total counter\n")
	sb.WriteString(fmt.Sprintf("agentone_readiness_total{result=\"success\"} %d\n", atomic.LoadInt64(&opsMetrics.readySuccess)))
	sb.WriteString(fmt.Sprintf("agentone_readiness_total{result=\"failure\"} %d\n", atomic.LoadInt64(&opsMetrics.readyFailure)))
	sb.WriteString("# HELP agentone_uptime_seconds Process uptime in seconds.\n")
	sb.WriteString("# TYPE agentone_uptime_seconds gauge\n")
	sb.WriteString(fmt.Sprintf("agentone_uptime_seconds %.2f\n", uptimeSeconds()))
	sb.WriteString("# HELP agentone_info Build metadata.\n")
	sb.WriteString("# TYPE agentone_info gauge\n")
	m := buildMeta()
	sb.WriteString(fmt.Sprintf("agentone_info{version=\"%s\",commit=\"%s\",build_time=\"%s\",env=\"%s\"} 1\n", m["version"], m["commit"], m["buildTime"], appEnv()))
	return sb.String()
}

// ─── Operational status ───

func opsStatusEnabled() bool {
	return strings.ToLower(strings.TrimSpace(envString("OPS_STATUS_ENABLED", ""))) == "true"
}

func handleOpsStatus(w http.ResponseWriter, r *http.Request) {
	if !opsStatusEnabled() {
		writeError(w, 404, "not_found", "Ops status not enabled.")
		return
	}
	if isProduction() || metricsToken() != "" {
		if !requireMetricsToken(w, r) {
			w.Header().Set("WWW-Authenticate", "Bearer")
			writeError(w, 401, "unauthorized", "Token required.")
			return
		}
	}
	dbReady := true
	if readinessPinger != nil {
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()
		if err := readinessPinger.Ping(ctx); err != nil {
			dbReady = false
		}
	}
	m := buildMeta()
	writeJSON(w, 200, map[string]interface{}{
		"ok": true,
		"data": map[string]interface{}{
			"status":                    "operational",
			"environment":               appEnv(),
			"version":                   m["version"],
			"commit":                    m["commit"],
			"buildTime":                 m["buildTime"],
			"uptime_seconds":            fmt.Sprintf("%.0f", uptimeSeconds()),
			"database_ready":            dbReady,
			"graceful_shutdown_enabled": true,
			"metrics_enabled":           metricsEnabled(),
		},
	})
}

// ─── Extend config validation ───

func validateOperationalConfig() []string {
	var issues []string
	metricsOn := strings.ToLower(strings.TrimSpace(envString("METRICS_ENABLED", ""))) == "true"
	if isProduction() && metricsOn {
		tok := metricsToken()
		if tok == "" {
			issues = append(issues, "METRICS_TOKEN is required when METRICS_ENABLED=true in production")
		}
		if tok != "" && len(tok) < 12 {
			issues = append(issues, "METRICS_TOKEN must be at least 12 characters in production")
		}
		if tok == "dev-metrics-token" {
			issues = append(issues, "METRICS_TOKEN must not use development default in production")
		}
	}
	return issues
}
