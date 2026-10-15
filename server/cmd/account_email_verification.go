package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ─── Per-user rate limiter for email verification request ───

type userRateLimitEntry struct {
	count  int
	window time.Time
}

type userRateLimiter struct {
	mu      sync.Mutex
	entries map[string]*userRateLimitEntry
	limit   int
}

var emailRequestUserLimiter = &userRateLimiter{
	entries: make(map[string]*userRateLimitEntry),
	limit:   5, // 5 requests per minute per user
}

func (l *userRateLimiter) allow(userID string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	e, ok := l.entries[userID]
	if !ok || now.Sub(e.window) > time.Minute {
		l.entries[userID] = &userRateLimitEntry{count: 1, window: now}
		return true
	}
	if e.count >= l.limit {
		return false
	}
	e.count++
	return true
}

func (l *userRateLimiter) cleanup() {
	l.mu.Lock()
	defer l.mu.Unlock()
	cutoff := time.Now().Add(-2 * time.Minute)
	for k, e := range l.entries {
		if e.window.Before(cutoff) {
			delete(l.entries, k)
		}
	}
}

func init() {
	go func() {
		for {
			time.Sleep(5 * time.Minute)
			emailRequestUserLimiter.cleanup()
		}
	}()
}

// issueVerificationToken creates/refreshes a verification token for a user.
// Returns raw token for delivery (only exposed in dev/test). isNew is false if cooldown prevents issuance.
func issueVerificationToken(ctx context.Context, db *pgxpool.Pool, cfg AccountSecurityConfig, userID, email string) (rawToken string, alreadyVerified bool, err error) {
	tx, err := db.Begin(ctx)
	if err != nil {
		return "", false, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	// Lock profile
	var emailVerifiedAt *time.Time
	err = tx.QueryRow(ctx, `SELECT id, email, email_verified_at FROM profiles WHERE id = $1 FOR UPDATE`, userID).
		Scan(new(string), new(string), &emailVerifiedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", false, errors.New("user not found")
	}
	if err != nil {
		return "", false, fmt.Errorf("lock profile: %w", err)
	}

	if emailVerifiedAt != nil {
		return "", true, nil
	}

	// Check cooldown
	cooldownSec := cfg.EmailVerificationResendCooldown
	if cooldownSec > 0 {
		var lastCreated *time.Time
		err = tx.QueryRow(ctx,
			`SELECT MAX(created_at) FROM auth_email_verification_tokens WHERE user_id = $1`, userID).Scan(&lastCreated)
		if err == nil && lastCreated != nil && time.Since(*lastCreated) < time.Duration(cooldownSec)*time.Second {
			tx.Commit(ctx)
			return "", false, nil
		}
	}

	// Revoke old active tokens
	_, _ = tx.Exec(ctx,
		`UPDATE auth_email_verification_tokens SET revoked_at = NOW()
		WHERE user_id = $1 AND used_at IS NULL AND revoked_at IS NULL`, userID)

	// Create new token
	raw, err := GenerateToken()
	if err != nil {
		return "", false, fmt.Errorf("generate: %w", err)
	}
	hash, err := HashToken(raw)
	if err != nil {
		return "", false, fmt.Errorf("hash: %w", err)
	}
	id := newID()
	expiry := time.Now().Add(time.Duration(cfg.EmailVerificationTokenTTLMinutes) * time.Minute)

	_, err = tx.Exec(ctx,
		`INSERT INTO auth_email_verification_tokens (id, user_id, token_hash, expires_at, created_at)
		VALUES ($1, $2, $3, $4, NOW())`, id, userID, hash, expiry)
	if err != nil {
		return "", false, fmt.Errorf("insert token: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return "", false, fmt.Errorf("commit: %w", err)
	}
	return raw, false, nil
}

// verifyEmailToken validates a raw token and marks the user's email as verified.
func verifyEmailToken(ctx context.Context, db *pgxpool.Pool, rawToken string) (alreadyVerified bool, err error) {
	if !validRefreshToken.MatchString(rawToken) {
		return false, errors.New("invalid token format")
	}
	hash, err := HashToken(rawToken)
	if err != nil {
		return false, err
	}

	tx, err := db.Begin(ctx)
	if err != nil {
		return false, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	// Find token → get user_id
	var userID string
	err = tx.QueryRow(ctx,
		`SELECT user_id FROM auth_email_verification_tokens WHERE token_hash = $1`, hash).Scan(&userID)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, errors.New("invalid or expired verification token")
	}
	if err != nil {
		return false, fmt.Errorf("query token: %w", err)
	}

	// Lock profile
	var emailVerifiedAt *time.Time
	err = tx.QueryRow(ctx, `SELECT id, email_verified_at FROM profiles WHERE id = $1 FOR UPDATE`, userID).
		Scan(new(string), &emailVerifiedAt)
	if err != nil {
		return false, fmt.Errorf("lock profile: %w", err)
	}

	if emailVerifiedAt != nil {
		tx.Commit(ctx)
		return true, nil
	}

	// Lock all user tokens
	rows, err := tx.Query(ctx,
		`SELECT id FROM auth_email_verification_tokens WHERE user_id = $1 ORDER BY id FOR UPDATE`, userID)
	if err != nil {
		return false, fmt.Errorf("lock tokens: %w", err)
	}
	for rows.Next() {
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return false, fmt.Errorf("read locked tokens: %w", err)
	}
	rows.Close()

	// Re-read target token
	var tokenUsedAt, tokenRevokedAt *time.Time
	var tokenExpiresAt time.Time
	err = tx.QueryRow(ctx,
		`SELECT used_at, revoked_at, expires_at FROM auth_email_verification_tokens WHERE token_hash = $1`, hash).
		Scan(&tokenUsedAt, &tokenRevokedAt, &tokenExpiresAt)
	if err != nil {
		return false, errors.New("invalid or expired verification token")
	}

	if tokenUsedAt != nil || tokenRevokedAt != nil || time.Now().After(tokenExpiresAt) {
		tx.Commit(ctx)
		return false, errors.New("invalid or expired verification token")
	}

	// Success: verify profile + mark token used
	_, _ = tx.Exec(ctx, `UPDATE profiles SET email_verified_at = COALESCE(email_verified_at, NOW()) WHERE id = $1`, userID)
	_, _ = tx.Exec(ctx,
		`UPDATE auth_email_verification_tokens SET used_at = NOW() WHERE token_hash = $1 AND used_at IS NULL`, hash)
	// Revoke other active tokens
	_, _ = tx.Exec(ctx,
		`UPDATE auth_email_verification_tokens SET revoked_at = NOW()
		WHERE user_id = $1 AND used_at IS NULL AND revoked_at IS NULL`, userID)

	if err := tx.Commit(ctx); err != nil {
		return false, fmt.Errorf("commit verify: %w", err)
	}
	return false, nil
}

// ─── Handlers ───

func originCheck(w http.ResponseWriter, r *http.Request) bool {
	origin := r.Header.Get("Origin")
	if origin == "" {
		return true
	}
	return corsAllowed(origin)
}

func (a *App) handleEmailVerificationRequest(w http.ResponseWriter, r *http.Request) {
	noStoreHeaders(w)
	if !originCheck(w, r) {
		jsonErr(w, 403, "forbidden")
		return
	}
	claims, err := a.auth(r)
	if err != nil || claims.Sub == "" {
		jsonErr(w, 401, "unauthorized")
		return
	}

	// Authenticated-user rate limit
	if !emailRequestUserLimiter.allow(claims.Sub) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(429)
		w.Write([]byte(`{"error":"rate_limited","message":"Слишком много запросов. Повторите позже."}`))
		return
	}

	rawToken, alreadyVerified, err := issueVerificationToken(r.Context(), a.db, a.secCfg, claims.Sub, "")
	if err != nil {
		jsonErr(w, 500, "internal error")
		return
	}
	if alreadyVerified {
		jsonOK(w, map[string]interface{}{"status": "already_verified"})
		return
	}
	if rawToken == "" {
		// cooldown: no new token issued but previous one may still be active
		jsonOK(w, map[string]interface{}{"status": "verification_pending"})
		return
	}

	// Send via delivery (fire-and-forget after commit)
	if a.emailSender != nil {
		_ = a.emailSender.SendVerification(r.Context(), "", "")
	}

	resp := map[string]interface{}{"status": "verification_pending"}
	if a.secCfg.EmailVerificationExposeToken {
		resp["verification_token"] = rawToken
	}
	jsonOK(w, resp)
}

func (a *App) handleEmailVerificationVerify(w http.ResponseWriter, r *http.Request) {
	noStoreHeaders(w)
	if !originCheck(w, r) {
		jsonErr(w, 403, "forbidden")
		return
	}

	var req struct {
		Token string `json:"token"`
	}
	json.NewDecoder(r.Body).Decode(&req)

	if req.Token == "" || !validRefreshToken.MatchString(req.Token) {
		jsonErr(w, 400, "invalid or expired verification token")
		return
	}

	alreadyVerified, err := verifyEmailToken(r.Context(), a.db, req.Token)
	if err != nil {
		jsonErr(w, 400, "invalid or expired verification token")
		return
	}
	if alreadyVerified {
		jsonOK(w, map[string]interface{}{"status": "email_verified"})
		return
	}
	jsonOK(w, map[string]interface{}{"status": "email_verified"})
}
