package main

import (
	"net/http"
	"time"
)

const (
	// ssoRefreshCookieName is the new shared cookie with Domain support.
	ssoRefreshCookieName = "agentone_sso_refresh_token"
	// refreshCookieName is the legacy host-only cookie, kept for migration.
	refreshCookieName = "agentone_refresh_token"
)

// refreshCookieDomain is set from REFRESH_COOKIE_DOMAIN env var.
// Empty by default (host-only). Set to "agent-one.ru" in production
// so the cookie is shared across auth.agent-one.ru and agent-one.ru.
var refreshCookieDomain string

// setRefreshCookie sets the SSO refresh token cookie with Domain (if configured).
// HttpOnly + Secure (prod) + SameSite=Strict + Path=/api/auth.
func setRefreshCookie(w http.ResponseWriter, rawToken string, ttlHours int) {
	c := &http.Cookie{
		Name:     ssoRefreshCookieName,
		Value:    rawToken,
		Path:     "/api/auth",
		HttpOnly: true,
		Secure:   isProduction(),
		SameSite: http.SameSiteStrictMode,
		MaxAge:   ttlHours * 3600,
		Expires:  time.Now().Add(time.Duration(ttlHours) * time.Hour),
	}
	if refreshCookieDomain != "" {
		c.Domain = refreshCookieDomain
	}
	http.SetCookie(w, c)
}

// readRefreshCookie reads the refresh token from the request.
// Prefers the new SSO cookie; falls back to the legacy host-only cookie for migration.
func readRefreshCookie(r *http.Request) (*http.Cookie, error) {
	c, err := r.Cookie(ssoRefreshCookieName)
	if err == nil {
		return c, nil
	}
	return r.Cookie(refreshCookieName)
}

// clearRefreshCookie removes both the new SSO cookie (with Domain if configured)
// and the legacy host-only cookie, so users are fully logged out on any subdomain.
func clearRefreshCookie(w http.ResponseWriter) {
	// Clear new SSO cookie
	c1 := &http.Cookie{
		Name:     ssoRefreshCookieName,
		Value:    "",
		Path:     "/api/auth",
		HttpOnly: true,
		Secure:   isProduction(),
		SameSite: http.SameSiteStrictMode,
		MaxAge:   -1,
		Expires:  time.Unix(0, 0),
	}
	if refreshCookieDomain != "" {
		c1.Domain = refreshCookieDomain
	}
	http.SetCookie(w, c1)

	// Clear legacy host-only cookie
	http.SetCookie(w, &http.Cookie{
		Name:     refreshCookieName,
		Value:    "",
		Path:     "/api/auth",
		HttpOnly: true,
		Secure:   isProduction(),
		SameSite: http.SameSiteStrictMode,
		MaxAge:   -1,
		Expires:  time.Unix(0, 0),
	})
}

// clearLegacyCookie removes only the legacy host-only cookie.
// Used in handleRefresh on success — we want to clear the stale legacy
// cookie while keeping the new SSO cookie.
func clearLegacyCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     refreshCookieName,
		Value:    "",
		Path:     "/api/auth",
		HttpOnly: true,
		Secure:   isProduction(),
		SameSite: http.SameSiteStrictMode,
		MaxAge:   -1,
		Expires:  time.Unix(0, 0),
	})
}

// noStoreHeaders sets Cache-Control and Pragma for auth responses.
func noStoreHeaders(w http.ResponseWriter) {
	w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate, private")
	w.Header().Set("Pragma", "no-cache")
}
