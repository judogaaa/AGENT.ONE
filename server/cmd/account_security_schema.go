package main

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

// ensureAccountSecuritySchema creates idempotent schema structures
// for account security features. Safe to call multiple times.
func ensureAccountSecuritySchema(ctx context.Context, db *pgxpool.Pool) error {
	if db == nil {
		return errors.New("database pool is nil")
	}

	// Phase 1: Add columns to existing profiles table
	alterProfile := `
	ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false;
	ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
	`
	if _, err := db.Exec(ctx, alterProfile); err != nil {
		return fmt.Errorf("profiles schema migration: %w", err)
	}

	// Phase 2: Create auth_sessions table (with FK)
	createSessions := `
	CREATE TABLE IF NOT EXISTS auth_sessions (
		id               TEXT PRIMARY KEY,
		user_id          TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
		refresh_token_hash TEXT NOT NULL,
		token_family     TEXT NOT NULL,
		created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		expires_at       TIMESTAMPTZ NOT NULL,
		last_used_at     TIMESTAMPTZ,
		revoked_at       TIMESTAMPTZ,
		revoke_reason    TEXT,
		user_agent_hash  TEXT,
		ip_hash          TEXT,
		CONSTRAINT uq_auth_sessions_refresh_token_hash UNIQUE (refresh_token_hash),
		CONSTRAINT ck_auth_sessions_token_hash_not_empty CHECK (refresh_token_hash <> ''),
		CONSTRAINT ck_auth_sessions_token_family_not_empty CHECK (token_family <> '')
	);
	CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON auth_sessions(user_id);
	CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at ON auth_sessions(expires_at);
	CREATE INDEX IF NOT EXISTS idx_auth_sessions_token_family ON auth_sessions(token_family);
	CREATE INDEX IF NOT EXISTS idx_auth_sessions_family_revoked ON auth_sessions(token_family, revoked_at);
	`
	if _, err := db.Exec(ctx, createSessions); err != nil {
		return fmt.Errorf("auth_sessions schema migration: %w", err)
	}

	// Phase 3: Create email_verification_tokens table (with FK)
	createVerification := `
	CREATE TABLE IF NOT EXISTS email_verification_tokens (
		id          TEXT PRIMARY KEY,
		user_id     TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
		token_hash  TEXT NOT NULL,
		created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		expires_at  TIMESTAMPTZ NOT NULL,
		used_at     TIMESTAMPTZ,
		CONSTRAINT uq_email_verification_token_hash UNIQUE (token_hash),
		CONSTRAINT ck_email_verification_token_hash_not_empty CHECK (token_hash <> '')
	);
	CREATE INDEX IF NOT EXISTS idx_email_verification_user_id ON email_verification_tokens(user_id);
	CREATE INDEX IF NOT EXISTS idx_email_verification_expires_at ON email_verification_tokens(expires_at);
	`
	if _, err := db.Exec(ctx, createVerification); err != nil {
		return fmt.Errorf("email_verification_tokens schema migration: %w", err)
	}

	// Phase 4: Idempotent FK constraint addition for pre-existing tables
	// If tables were created before this migration (without FK), add them now.
	addFKs := `
	DO $$
	BEGIN
		IF NOT EXISTS (
			SELECT 1 FROM pg_constraint
			WHERE conname = 'auth_sessions_user_id_fkey'
			  AND conrelid = 'auth_sessions'::regclass
		) THEN
			ALTER TABLE auth_sessions
				ADD CONSTRAINT auth_sessions_user_id_fkey
				FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
		END IF;

		IF NOT EXISTS (
			SELECT 1 FROM pg_constraint
			WHERE conname = 'email_verification_tokens_user_id_fkey'
			  AND conrelid = 'email_verification_tokens'::regclass
		) THEN
			ALTER TABLE email_verification_tokens
				ADD CONSTRAINT email_verification_tokens_user_id_fkey
				FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
		END IF;
	END $$;
	`
	if _, err := db.Exec(ctx, addFKs); err != nil {
		return fmt.Errorf("foreign key migration: %w", err)
	}

	// Phase 5: Session rotation tracking + composite replay index
	addReplacedBy := `
	ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS replaced_by_session_id TEXT;
	DO $$
	BEGIN
		IF NOT EXISTS (
			SELECT 1 FROM pg_constraint
			WHERE conname = 'fk_auth_sessions_replaced_by'
			  AND conrelid = 'auth_sessions'::regclass
		) THEN
			ALTER TABLE auth_sessions
				ADD CONSTRAINT fk_auth_sessions_replaced_by
				FOREIGN KEY (replaced_by_session_id) REFERENCES auth_sessions(id) ON DELETE SET NULL;
		END IF;
	END $$;
	CREATE INDEX IF NOT EXISTS idx_auth_sessions_family_revoked ON auth_sessions(token_family, revoked_at);
	`
	if _, err := db.Exec(ctx, addReplacedBy); err != nil {
		return fmt.Errorf("replaced_by migration: %w", err)
	}

	// Phase 6: Email verification table
	addEmailVerify := `
	ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
	CREATE TABLE IF NOT EXISTS auth_email_verification_tokens (
		id          TEXT PRIMARY KEY,
		user_id     TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
		token_hash  TEXT NOT NULL,
		expires_at  TIMESTAMPTZ NOT NULL,
		used_at     TIMESTAMPTZ,
		revoked_at  TIMESTAMPTZ,
		created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		CONSTRAINT uq_auth_email_verify_token_hash UNIQUE (token_hash),
		CONSTRAINT ck_auth_email_verify_token_hash_not_empty CHECK (token_hash <> '')
	);
	CREATE INDEX IF NOT EXISTS idx_auth_email_verify_user_id ON auth_email_verification_tokens(user_id);
	CREATE INDEX IF NOT EXISTS idx_auth_email_verify_expires_at ON auth_email_verification_tokens(expires_at);
	CREATE INDEX IF NOT EXISTS idx_auth_email_verify_user_active
		ON auth_email_verification_tokens(user_id, used_at, revoked_at);
	CREATE UNIQUE INDEX IF NOT EXISTS uq_auth_email_verify_active_token
		ON auth_email_verification_tokens(user_id)
		WHERE used_at IS NULL AND revoked_at IS NULL;
	`
	if _, err := db.Exec(ctx, addEmailVerify); err != nil {
		return fmt.Errorf("email verification migration: %w", err)
	}

	// Phase 7: Legal consent columns on profiles.
	// terms_accepted_at records WHEN the user accepted the documents;
	// terms_version / privacy_version record WHICH document versions
	// were accepted at registration. NULL means the account predates
	// consent tracking (existing users stay valid).
	addTermsConsent := `
	ALTER TABLE profiles ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;
	ALTER TABLE profiles ADD COLUMN IF NOT EXISTS terms_version TEXT;
	ALTER TABLE profiles ADD COLUMN IF NOT EXISTS privacy_version TEXT;
	`
	if _, err := db.Exec(ctx, addTermsConsent); err != nil {
		return fmt.Errorf("legal consent migration: %w", err)
	}

	return nil
}

// ensureAuditEventsSchema creates the audit_events table and its indexes,
// mirroring the production migration in main.go. Safe to call multiple times.
func ensureAuditEventsSchema(ctx context.Context, db *pgxpool.Pool) error {
	if db == nil {
		return errors.New("database pool is nil")
	}
	schema := `
	CREATE TABLE IF NOT EXISTS audit_events (
		id TEXT PRIMARY KEY,
		actor_user_id TEXT,
		actor_role TEXT,
		action TEXT NOT NULL,
		entity_type TEXT,
		entity_id TEXT,
		shop_id TEXT,
		ip TEXT,
		user_agent TEXT,
		metadata JSONB,
		created_at TIMESTAMPTZ DEFAULT now()
	);
	CREATE INDEX IF NOT EXISTS idx_audit_events_actor_created ON audit_events(actor_user_id, created_at DESC);
	CREATE INDEX IF NOT EXISTS idx_audit_events_shop_created ON audit_events(shop_id, created_at DESC);
	CREATE INDEX IF NOT EXISTS idx_audit_events_action_created ON audit_events(action, created_at DESC);
	CREATE INDEX IF NOT EXISTS idx_audit_events_entity ON audit_events(entity_type, entity_id);
	`
	if _, err := db.Exec(ctx, schema); err != nil {
		return fmt.Errorf("audit events schema: %w", err)
	}
	return nil
}
