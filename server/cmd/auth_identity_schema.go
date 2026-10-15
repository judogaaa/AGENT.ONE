package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

// newSecureID generates a 128-bit (32 hex chars) random ID.
// Not a UUID — just 16 random bytes encoded as hex.
func newSecureID() string {
	b := make([]byte, 16)
	rand.Read(b)
	return hex.EncodeToString(b)
}

// ensureAuthIdentitiesSchema creates the auth_identities table idempotently.
// Safe to call multiple times across deploys.
func ensureAuthIdentitiesSchema(ctx context.Context, db *pgxpool.Pool) error {
	if db == nil {
		return errors.New("database pool is nil")
	}

	createTable := `
	CREATE TABLE IF NOT EXISTS auth_identities (
		id                    TEXT PRIMARY KEY,
		user_id               TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
		provider              TEXT NOT NULL,
		provider_subject      TEXT NOT NULL,
		provider_email        TEXT,
		provider_username     TEXT,
		provider_email_verified BOOLEAN NOT NULL DEFAULT FALSE,
		metadata              JSONB NOT NULL DEFAULT '{}'::jsonb,
		created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		last_login_at         TIMESTAMPTZ,
		CONSTRAINT ck_auth_identities_provider CHECK (provider IN ('password', 'yandex')),
		CONSTRAINT uq_auth_identities_provider_subject UNIQUE (provider, provider_subject),
		CONSTRAINT uq_auth_identities_user_provider UNIQUE (user_id, provider)
	);
	CREATE INDEX IF NOT EXISTS idx_auth_identities_user_id ON auth_identities(user_id);
	CREATE INDEX IF NOT EXISTS idx_auth_identities_provider ON auth_identities(provider);
	CREATE INDEX IF NOT EXISTS idx_auth_identities_last_login_at ON auth_identities(last_login_at);
	`
	if _, err := db.Exec(ctx, createTable); err != nil {
		return fmt.Errorf("auth_identities schema migration: %w", err)
	}

	return nil
}
