package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// normalizeEmail trims whitespace and lowercases.
func normalizeEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

// isProviderAllowed checks if provider is one of the allowed values.
func isProviderAllowed(provider string) bool {
	switch provider {
	case ProviderPassword, ProviderYandex:
		return true
	}
	return false
}

// createAuthIdentity inserts a new auth identity and returns it.
func createAuthIdentity(ctx context.Context, db *pgxpool.Pool, identity *AuthIdentity) error {
	if !isProviderAllowed(identity.Provider) {
		return errIdentityProviderNotAllowed
	}

	id := identity.ID
	if id == "" {
		id = newSecureID()
	}

	metaJSON, err := json.Marshal(identity.Metadata)
	if err != nil {
		return fmt.Errorf("marshal metadata: %w", err)
	}
	if string(metaJSON) == "null" {
		metaJSON = []byte("{}")
	}

	now := time.Now()
	_, err = db.Exec(ctx,
		`INSERT INTO auth_identities
			(id, user_id, provider, provider_subject, provider_email,
			 provider_username, provider_email_verified, metadata,
			 created_at, updated_at, last_login_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
		id, identity.UserID, identity.Provider, identity.ProviderSubject,
		identity.ProviderEmail, identity.ProviderUsername,
		identity.ProviderEmailVerified, string(metaJSON),
		now, now, identity.LastLoginAt)
	if err != nil {
		if isUniqueViolation(err) {
			return fmt.Errorf("duplicate identity: %w", err)
		}
		return fmt.Errorf("insert auth_identity: %w", err)
	}

	identity.ID = id
	identity.CreatedAt = now
	identity.UpdatedAt = now
	return nil
}

// findAuthIdentityByProviderSubject looks up an identity by provider + subject.
func findAuthIdentityByProviderSubject(ctx context.Context, db *pgxpool.Pool, provider, subject string) (*AuthIdentity, error) {
	id, err := scanAuthIdentity(db.QueryRow(ctx,
		`SELECT id, user_id, provider, provider_subject,
			provider_email, provider_username, provider_email_verified,
			metadata, created_at, updated_at, last_login_at
		FROM auth_identities
		WHERE provider = $1 AND provider_subject = $2`,
		provider, subject))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return id, err
}

// findUserAuthIdentity looks up a specific provider identity for a user.
func findUserAuthIdentity(ctx context.Context, db *pgxpool.Pool, userID, provider string) (*AuthIdentity, error) {
	id, err := scanAuthIdentity(db.QueryRow(ctx,
		`SELECT id, user_id, provider, provider_subject,
			provider_email, provider_username, provider_email_verified,
			metadata, created_at, updated_at, last_login_at
		FROM auth_identities
		WHERE user_id = $1 AND provider = $2`,
		userID, provider))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return id, err
}

// listUserAuthIdentities lists all auth identities for a user.
func listUserAuthIdentities(ctx context.Context, db *pgxpool.Pool, userID string) ([]AuthIdentity, error) {
	rows, err := db.Query(ctx,
		`SELECT id, user_id, provider, provider_subject,
			provider_email, provider_username, provider_email_verified,
			metadata, created_at, updated_at, last_login_at
		FROM auth_identities
		WHERE user_id = $1
		ORDER BY created_at ASC`,
		userID)
	if err != nil {
		return nil, fmt.Errorf("list auth_identities: %w", err)
	}
	defer rows.Close()

	var list []AuthIdentity
	for rows.Next() {
		var id AuthIdentity
		if err := scanAuthIdentityRow(rows, &id); err != nil {
			return nil, err
		}
		list = append(list, id)
	}
	return list, rows.Err()
}

// linkAuthIdentityToUser safely links an identity to a user within a transaction.
// Returns distinct errors for each conflict case.
func linkAuthIdentityToUser(ctx context.Context, db *pgxpool.Pool, userID, provider, providerSubject string, providerEmail, providerUsername *string, emailVerified bool, requestMeta map[string]interface{}) error {
	if !isProviderAllowed(provider) {
		return errIdentityProviderNotAllowed
	}

	tx, err := db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	// 1. Check user exists
	var exists bool
	err = tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM profiles WHERE id=$1)", userID).Scan(&exists)
	if err != nil {
		return fmt.Errorf("check user: %w", err)
	}
	if !exists {
		return errIdentityUserNotFound
	}

	// 2. Check provider+subject not taken by another user
	var ownerID string
	err = tx.QueryRow(ctx,
		"SELECT user_id FROM auth_identities WHERE provider=$1 AND provider_subject=$2",
		provider, providerSubject).Scan(&ownerID)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return fmt.Errorf("check existing identity: %w", err)
	}
	if ownerID != "" {
		if ownerID == userID {
			return errIdentityLinkedToThisUser
		}
		return errIdentityBelongsToAnother
	}

	// 3. Check user doesn't already have this provider
	var providerCount int
	err = tx.QueryRow(ctx,
		"SELECT COUNT(*) FROM auth_identities WHERE user_id=$1 AND provider=$2",
		userID, provider).Scan(&providerCount)
	if err != nil {
		return fmt.Errorf("check provider count: %w", err)
	}
	if providerCount > 0 {
		return errUserAlreadyHasProvider
	}

	// 4. Insert
	metaJSON, _ := json.Marshal(requestMeta)
	if string(metaJSON) == "null" {
		metaJSON = []byte("{}")
	}
	now := time.Now()
	id := newSecureID()

	_, err = tx.Exec(ctx,
		`INSERT INTO auth_identities
			(id, user_id, provider, provider_subject, provider_email,
			 provider_username, provider_email_verified, metadata,
			 created_at, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
		id, userID, provider, providerSubject,
		providerEmail, providerUsername, emailVerified,
		string(metaJSON), now, now)
	if err != nil {
		return fmt.Errorf("insert identity: %w", err)
	}

	return tx.Commit(ctx)
}

// updateAuthIdentityLastLogin updates the last_login_at timestamp.
func updateAuthIdentityLastLogin(ctx context.Context, db *pgxpool.Pool, identityID string) error {
	_, err := db.Exec(ctx,
		"UPDATE auth_identities SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1",
		identityID)
	if err != nil {
		return fmt.Errorf("update last_login: %w", err)
	}
	return nil
}

// countUserAuthIdentities counts all identities for a user.
func countUserAuthIdentities(ctx context.Context, db *pgxpool.Pool, userID string) (int, error) {
	var count int
	err := db.QueryRow(ctx,
		"SELECT COUNT(*) FROM auth_identities WHERE user_id = $1", userID).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("count auth_identities: %w", err)
	}
	return count, nil
}

// deleteAuthIdentity removes an identity by ID.
func deleteAuthIdentity(ctx context.Context, db *pgxpool.Pool, identityID string) error {
	_, err := db.Exec(ctx, "DELETE FROM auth_identities WHERE id = $1", identityID)
	if err != nil {
		return fmt.Errorf("delete auth_identity: %w", err)
	}
	return nil
}

// backfillPasswordAuthIdentities creates password identities for existing
// profiles that have a non-empty email and password hash.
// Idempotent — safe to run multiple times. Does not copy password hashes.
func backfillPasswordAuthIdentities(ctx context.Context, db *pgxpool.Pool) (int, error) {
	rows, err := db.Query(ctx,
		`SELECT id, email, COALESCE(email_verified, false) AS email_verified
		FROM profiles
		WHERE email IS NOT NULL AND email <> '' AND password IS NOT NULL AND password <> ''`)
	if err != nil {
		return 0, fmt.Errorf("query profiles for backfill: %w", err)
	}
	defer rows.Close()

	var created int
	for rows.Next() {
		var userID, email string
		var emailVerified bool
		if err := rows.Scan(&userID, &email, &emailVerified); err != nil {
			return created, fmt.Errorf("scan profile for backfill: %w", err)
		}

		normalized := normalizeEmail(email)

		// Skip if identity already exists (idempotent)
		existing, err := findAuthIdentityByProviderSubject(ctx, db, ProviderPassword, normalized)
		if err != nil {
			return created, fmt.Errorf("check existing identity: %w", err)
		}
		if existing != nil {
			continue
		}

		identity := &AuthIdentity{
			UserID:                userID,
			Provider:              ProviderPassword,
			ProviderSubject:       normalized,
			ProviderEmail:         strPtr(normalized),
			ProviderEmailVerified: emailVerified,
			Metadata:              map[string]interface{}{},
		}
		if err := createAuthIdentity(ctx, db, identity); err != nil {
			return created, fmt.Errorf("create password identity for user %s: %w", userID, err)
		}
		created++
	}

	return created, rows.Err()
}

// ── scan helpers ──

type authIdentityRowScanner interface {
	Scan(dest ...interface{}) error
}

func scanAuthIdentityRow(row authIdentityRowScanner, id *AuthIdentity) error {
	var providerEmail, providerUsername *string
	var metaJSON string
	var lastLoginAt *time.Time

	err := row.Scan(
		&id.ID, &id.UserID, &id.Provider, &id.ProviderSubject,
		&providerEmail, &providerUsername, &id.ProviderEmailVerified,
		&metaJSON, &id.CreatedAt, &id.UpdatedAt, &lastLoginAt)
	if err != nil {
		return err
	}

	id.ProviderEmail = providerEmail
	id.ProviderUsername = providerUsername
	id.LastLoginAt = lastLoginAt

	if metaJSON != "" {
		json.Unmarshal([]byte(metaJSON), &id.Metadata)
	}
	if id.Metadata == nil {
		id.Metadata = map[string]interface{}{}
	}

	return nil
}

func scanAuthIdentity(row authIdentityRowScanner) (*AuthIdentity, error) {
	id := &AuthIdentity{}
	if err := scanAuthIdentityRow(row, id); err != nil {
		return nil, err
	}
	return id, nil
}

func strPtr(s string) *string { return &s }

// Ensure ensureAuthIdentitiesSchema is used (for go vet)
var _ = ensureAuthIdentitiesSchema
