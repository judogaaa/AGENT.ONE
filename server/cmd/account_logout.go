package main

import (
	"context"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

func logoutOriginAllowed(r *http.Request) bool {
	origin := r.Header.Get("Origin")
	if origin == "" {
		return true
	}
	return corsAllowed(origin)
}

// revokeAccessFromRequest deletes the JTI of a Bearer access token when present.
// Cookie deletion alone is not enough for access-token revocation.
func (a *App) revokeAccessFromRequest(ctx context.Context, r *http.Request) {
	h := r.Header.Get("Authorization")
	if !strings.HasPrefix(h, "Bearer ") || a.jwtKey == nil {
		return
	}
	claims, err := parseJWT(strings.TrimPrefix(h, "Bearer "), a.jwtKey)
	if err != nil || claims == nil || claims.Jti == "" {
		return
	}
	DeleteJTI(ctx, claims.Jti)
}

func (a *App) handleLogout(w http.ResponseWriter, r *http.Request) {
	// Read both cookies BEFORE clearing (need values for DB revocation)
	ssoCookie, ssoErr := r.Cookie(ssoRefreshCookieName)
	legacyCookie, legacyErr := r.Cookie(refreshCookieName)

	noStoreHeaders(w)

	// Origin check before DB
	if !logoutOriginAllowed(r) {
		clearRefreshCookie(w)
		jsonErr(w, 403, "forbidden")
		return
	}

	ctx := r.Context()

	// Helper: revoke a single refresh token session (Redis cleanup + DB revoke).
	revokeOne := func(rawToken string) error {
		if !validRefreshToken.MatchString(rawToken) {
			return nil
		}
		hash, err := HashToken(rawToken)
		if err != nil {
			return err
		}
		family, _ := lookupFamilyByHash(ctx, a.db, hash)
		var sessionJTI string
		if family != "" {
			if sess, lerr := LoadSession(ctx, family); lerr == nil && sess.CurrentJTI != "" {
				sessionJTI = sess.CurrentJTI
			}
		}
		if err := revokeRefreshFamilyByHash(ctx, a.db, hash); err != nil {
			return err
		}
		if sessionJTI != "" {
			DeleteJTI(ctx, sessionJTI)
		}
		if family != "" {
			// Concurrent refresh may have written a newer JTI after our LoadSession.
			if sess, lerr := LoadSession(ctx, family); lerr == nil && sess.CurrentJTI != "" && sess.CurrentJTI != sessionJTI {
				DeleteJTI(ctx, sess.CurrentJTI)
			}
			DeleteSession(ctx, family)
		}
		return nil
	}

	// Determine primary token: prefer SSO, fall back to legacy.
	// Primary revocation preserves the existing error behaviour (return 500 on failure).
	primary := ""
	if ssoErr == nil {
		primary = ssoCookie.Value
	} else if legacyErr == nil {
		primary = legacyCookie.Value
	}
	if primary != "" {
		if err := revokeOne(primary); err != nil {
			clearRefreshCookie(w)
			jsonErr(w, 500, "internal error")
			return
		}
	}

	// Secondary revocation: if both cookies exist with DIFFERENT values,
	// revoke the legacy family too (best-effort, ignore errors).
	if ssoErr == nil && legacyErr == nil && legacyCookie.Value != ssoCookie.Value {
		_ = revokeOne(legacyCookie.Value)
	}

	// Always revoke the presented access token JTI (covers missing sess metadata).
	a.revokeAccessFromRequest(ctx, r)

	// Cookie cleanup only after server-side revocation.
	clearRefreshCookie(w)
	jsonOK(w, map[string]interface{}{"status": "logged_out"})
}

func (a *App) handleLogoutAll(w http.ResponseWriter, r *http.Request) {
	noStoreHeaders(w)

	// Origin check before DB
	if !logoutOriginAllowed(r) {
		clearRefreshCookie(w)
		jsonErr(w, 403, "forbidden")
		return
	}

	claims, err := a.auth(r)
	if err != nil || claims.Sub == "" {
		clearRefreshCookie(w)
		jsonErr(w, 401, "unauthorized")
		return
	}

	ctx := r.Context()

	// Collect JTIs before deleting Redis session keys.
	_, jtis := RevokeAllUserFamilies(ctx, claims.Sub)
	for _, jti := range jtis {
		DeleteJTI(ctx, jti)
	}
	if claims.Jti != "" {
		DeleteJTI(ctx, claims.Jti)
	}

	if err := revokeAllUserSessions(ctx, a.db, claims.Sub); err != nil {
		clearRefreshCookie(w)
		jsonErr(w, 500, "internal error")
		return
	}

	clearRefreshCookie(w)
	jsonOK(w, map[string]interface{}{"status": "all_sessions_revoked"})
}

// lookupFamilyByHash — вынесен в account_refresh.go, тут re-export.
var _ = (*pgxpool.Pool)(nil)
var _ = context.TODO
