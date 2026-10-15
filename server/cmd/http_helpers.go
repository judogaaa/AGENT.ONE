package main

import (
	"net/http"
)

// clientIP returns the trusted client IP. It delegates to trustedClientIP
// so that all call sites (fingerprint, audit, logging, rate limit) use
// the same safe logic: forwarded headers are trusted only from configured
// proxy CIDRs.
func clientIP(r *http.Request) string {
	return trustedClientIP(r)
}

// userAgent returns the User-Agent header or empty string.
func userAgent(r *http.Request) string {
	return r.Header.Get("User-Agent")
}

// requestMeta returns safe metadata from the request for audit/logging.
func requestMeta(r *http.Request) map[string]interface{} {
	return map[string]interface{}{
		"ip":         clientIP(r),
		"user_agent": userAgent(r),
	}
}
