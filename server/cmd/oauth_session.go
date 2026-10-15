package main

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
)

// sessionExecer is implemented by both *pgxpool.Pool and pgx.Tx.
type sessionExecer interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
}

// insertAuthSessionRow creates an auth_sessions row using the provided
// executor (pool or transaction) and returns the raw token and session id.
func insertAuthSessionRow(ctx context.Context, db sessionExecer, userID string, ttlHours int) (raw, sessionID string, err error) {
	raw, err = GenerateToken()
	if err != nil {
		return "", "", fmt.Errorf("generate token: %w", err)
	}
	hash, err := HashToken(raw)
	if err != nil {
		return "", "", fmt.Errorf("hash token: %w", err)
	}
	sessionID = newID()
	family := newID()
	expiresAt := time.Now().Add(time.Duration(ttlHours) * time.Hour)

	_, err = db.Exec(ctx,
		"INSERT INTO auth_sessions (id, user_id, refresh_token_hash, token_family, created_at, expires_at) VALUES ($1,$2,$3,$4,NOW(),$5)",
		sessionID, userID, hash, family, expiresAt)
	if err != nil {
		return "", "", fmt.Errorf("insert auth session: %w", err)
	}
	return raw, sessionID, nil
}

// completeOAuthLogin finishes an OAuth login by setting the refresh cookie,
// recording a provider audit event and redirecting to /auth/complete.
// No token, code or state ever appears in the redirect URL.
func (a *App) completeOAuthLogin(w http.ResponseWriter, r *http.Request, userID, userRole, returnTo, sessionID, raw, provider string) {
	setRefreshCookie(w, raw, a.secCfg.RefreshTokenTTLHours)
	noStoreHeaders(w)

	a.recordAuditEvent(r, userID, userRole, "oauth_login", "session", sessionID, "", map[string]interface{}{
		"provider": provider,
	})

	q := url.Values{}
	if returnTo != "" {
		q.Set("return_to", returnTo)
	}
	origin := a.oauthRedirectOrigin()
	completeURL := origin + "/auth/complete"
	if qEncode := q.Encode(); qEncode != "" {
		completeURL += "?" + qEncode
	}
	http.Redirect(w, r, completeURL, http.StatusFound)
}
