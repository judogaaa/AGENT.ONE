package main

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

func (a *App) handleRefresh(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	// Read both cookies: SSO (primary) and legacy (migration)
	ssoCookie, ssoErr := r.Cookie(ssoRefreshCookieName)
	legacyCookie, legacyErr := r.Cookie(refreshCookieName)

	// Determine active cookie: prefer SSO, fall back to legacy
	var activeValue string
	if ssoErr == nil {
		activeValue = ssoCookie.Value
	} else if legacyErr == nil {
		activeValue = legacyCookie.Value
	} else {
		clearRefreshCookie(w)
		noStoreHeaders(w)
		jsonErr(w, 401, "invalid credentials")
		return
	}

	if !validRefreshToken.MatchString(activeValue) {
		clearRefreshCookie(w)
		noStoreHeaders(w)
		jsonErr(w, 401, "invalid credentials")
		return
	}

	// ── Fingerprint binding (anti-theft) ──
	fp := ComputeFingerprint(clientIP(r), r.Header.Get("User-Agent"), r.Header.Get("Accept-Language"))

	hash, herr := HashToken(activeValue)
	if herr == nil {
		if cur, lerr := lookupFamilyByHash(ctx, a.db, hash); lerr == nil && cur != "" {
			if sess, lerr := LoadSession(ctx, cur); lerr == nil && sess.Fingerprint != "" && sess.Fingerprint != fp {
				_ = revokeRefreshFamilyByHash(ctx, a.db, hash)
				DeleteSession(ctx, cur)
				clearRefreshCookie(w)
				noStoreHeaders(w)
				jsonErr(w, 401, "session device mismatch")
				return
			}
		}
	}

	data, err := rotateRefreshSession(ctx, a.db, activeValue, a.jwtKey, a.secCfg.AccessTokenTTLMinutes, a.secCfg.RefreshTokenTTLHours, fp)
	if err != nil {
		clearRefreshCookie(w)
		noStoreHeaders(w)
		if errors.Is(err, errUnknownToken) || errors.Is(err, errTokenExpired) || errors.Is(err, errReplayDetected) {
			jsonErr(w, 401, "invalid credentials")
			return
		}
		if errors.Is(err, errDeviceMismatch) {
			jsonErr(w, 401, "session device mismatch")
			return
		}
		jsonErr(w, 500, "internal error")
		return
	}

	// Sliding TTL
	if data != nil && data.Family != "" {
		TouchSession(ctx, data.Family, slidingRefreshTTL(a.secCfg.RefreshTokenTTLHours))
	}

	// ── Legacy migration cleanup ──
	// Scenario A: both cookies exist with DIFFERENT tokens → revoke legacy family (best-effort)
	if ssoErr == nil && legacyErr == nil && legacyCookie.Value != activeValue && validRefreshToken.MatchString(legacyCookie.Value) {
		legacyHash, lerr := HashToken(legacyCookie.Value)
		if lerr == nil {
			if legacyFamily, ferr := lookupFamilyByHash(ctx, a.db, legacyHash); ferr == nil && legacyFamily != "" {
				if sess, serr := LoadSession(ctx, legacyFamily); serr == nil && sess.CurrentJTI != "" {
					DeleteJTI(ctx, sess.CurrentJTI)
				}
				DeleteSession(ctx, legacyFamily)
			}
			_ = revokeRefreshFamilyByHash(ctx, a.db, legacyHash)
		}
	}

	// Scenario B: legacy was used as active → rotation already revoked old token.
	// In both scenarios, clear the stale legacy cookie from the browser.
	if legacyErr == nil {
		clearLegacyCookie(w)
	}

	// Success: set new SSO cookie, return access token + profile
	setRefreshCookie(w, data.NewRawToken, a.secCfg.RefreshTokenTTLHours)
	noStoreHeaders(w)
	jsonOK(w, map[string]interface{}{
		"token":   data.AccessToken,
		"profile": data.Profile,
	})
}

// lookupFamilyByHash — быстрый lookup семейства по хэшу refresh-токена (read-only).
func lookupFamilyByHash(ctx context.Context, db *pgxpool.Pool, hash string) (string, error) {
	var family string
	err := db.QueryRow(ctx, `SELECT token_family FROM auth_sessions WHERE refresh_token_hash = $1`, hash).Scan(&family)
	return family, err
}

// slidingRefreshTTL — на сколько продлевать сессию при каждой активности.
// Используем 80% от полного TTL чтобы сессия сама истекала если юзер реально ушёл.
func slidingRefreshTTL(fullHours int) time.Duration {
	return time.Duration(fullHours) * time.Hour * 8 / 10
}
