package main

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// lockSessionFamily locks all rows in a token family in stable order (id).
func lockSessionFamily(ctx context.Context, tx pgx.Tx, tokenFamily string) error {
	rows, err := tx.Query(ctx,
		`SELECT id FROM auth_sessions WHERE token_family = $1 ORDER BY id FOR UPDATE`, tokenFamily)
	if err != nil {
		return fmt.Errorf("lock family: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("read locked family: %w", err)
	}
	return nil
}

// lockActiveUserSessions locks all active sessions for a user in stable order (id).
func lockActiveUserSessions(ctx context.Context, tx pgx.Tx, userID string) error {
	rows, err := tx.Query(ctx,
		`SELECT id FROM auth_sessions WHERE user_id = $1 AND revoked_at IS NULL ORDER BY id FOR UPDATE`, userID)
	if err != nil {
		return fmt.Errorf("lock user sessions: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("read locked user sessions: %w", err)
	}
	return nil
}

// revokeRefreshFamilyByHash revokes all active sessions in the token family
// identified by the given refresh token hash. Returns nil on success (including unknown hash).
func revokeRefreshFamilyByHash(ctx context.Context, db *pgxpool.Pool, tokenHash string) error {
	tx, err := db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	var family string
	err = tx.QueryRow(ctx,
		`SELECT token_family FROM auth_sessions WHERE refresh_token_hash = $1`, tokenHash).Scan(&family)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil // idempotent: unknown hash is success
	}
	if err != nil {
		return fmt.Errorf("query family: %w", err)
	}

	if err := lockSessionFamily(ctx, tx, family); err != nil {
		return err
	}

	_, err = tx.Exec(ctx,
		`UPDATE auth_sessions SET revoked_at = NOW(), revoke_reason = 'logout'
		WHERE token_family = $1 AND revoked_at IS NULL`, family)
	if err != nil {
		return fmt.Errorf("revoke family: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit revoke: %w", err)
	}
	return nil
}

// revokeAllUserSessions revokes all active sessions for the given user.
// Unknown user or zero active sessions returns success.
func revokeAllUserSessions(ctx context.Context, db *pgxpool.Pool, userID string) error {
	tx, err := db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	if err := lockActiveUserSessions(ctx, tx, userID); err != nil {
		return err
	}

	_, err = tx.Exec(ctx,
		`UPDATE auth_sessions SET revoked_at = NOW(), revoke_reason = 'logout_all'
		WHERE user_id = $1 AND revoked_at IS NULL`, userID)
	if err != nil {
		return fmt.Errorf("revoke user sessions: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit revoke: %w", err)
	}
	return nil
}
