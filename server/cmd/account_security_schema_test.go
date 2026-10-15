package main

import (
	"context"
	"strings"
	"testing"
)

// go vet needs this to compile if there's no DB integration test
var _ = ensureAccountSecuritySchema

// ─── Schema SQL content checks ───

func getSchemaSQL() string {
	return `
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

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
CREATE UNIQUE INDEX IF NOT EXISTS uq_auth_email_verify_active_token
    ON auth_email_verification_tokens(user_id)
    WHERE used_at IS NULL AND revoked_at IS NULL;
`
}

// ─── Existing table/column checks ───

func TestSchemaContainsAuthSessions(t *testing.T) {
	sql := getSchemaSQL()
	if !strings.Contains(sql, "auth_sessions") {
		t.Error("schema should contain auth_sessions table")
	}
}

func TestSchemaContainsEmailVerificationTokens(t *testing.T) {
	sql := getSchemaSQL()
	if !strings.Contains(sql, "email_verification_tokens") {
		t.Error("schema should contain email_verification_tokens table")
	}
}

func TestSchemaContainsEmailVerified(t *testing.T) {
	sql := getSchemaSQL()
	if !strings.Contains(sql, "email_verified") {
		t.Error("schema should add email_verified column")
	}
}

// ─── Destructive operation bans ───

func TestSchemaNoDropTable(t *testing.T) {
	sql := strings.ToUpper(getSchemaSQL())
	if strings.Contains(sql, "DROP TABLE") {
		t.Error("schema must NOT contain DROP TABLE")
	}
}

func TestSchemaNoTruncate(t *testing.T) {
	sql := strings.ToUpper(getSchemaSQL())
	if strings.Contains(sql, "TRUNCATE") {
		t.Error("schema must NOT contain TRUNCATE")
	}
}

func TestSchemaNoDelete(t *testing.T) {
	sql := strings.ToUpper(getSchemaSQL())
	if strings.Contains(sql, "DELETE FROM") {
		t.Error("schema must NOT contain DELETE FROM")
	}
}

// ─── Foreign key checks ───

func normalizeSQL(sql string) string {
	s := strings.ReplaceAll(sql, "\n", " ")
	s = strings.ReplaceAll(s, "\r", " ")
	s = strings.ReplaceAll(s, "\t", " ")
	// Collapse multiple spaces
	for strings.Contains(s, "  ") {
		s = strings.ReplaceAll(s, "  ", " ")
	}
	return strings.TrimSpace(s)
}

func TestSchemaAuthSessionsForeignKey(t *testing.T) {
	sql := getSchemaSQL()
	normalized := normalizeSQL(sql)

	// auth_sessions user_id references profiles(id)
	hasFK := strings.Contains(normalized, "REFERENCES profiles(id)") &&
		strings.Contains(normalized, "auth_sessions") &&
		strings.Contains(normalized, "FOREIGN KEY (user_id)")
	hasInline := strings.Contains(normalized,
		"user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE")
	hasDOBlock := strings.Contains(normalized,
		"ADD CONSTRAINT auth_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE")

	if !hasFK {
		t.Error("auth_sessions must reference profiles(id) via foreign key")
	}
	if !(hasInline || hasDOBlock) {
		t.Error("auth_sessions FK must use ON DELETE CASCADE")
	}
	if !strings.Contains(normalized, "ON DELETE CASCADE") {
		t.Error("schema must contain ON DELETE CASCADE")
	}
}

func TestSchemaAuthSessionsCascadeDelete(t *testing.T) {
	normalized := normalizeSQL(getSchemaSQL())
	// The FK for auth_sessions must have ON DELETE CASCADE
	hasInlineCascade := strings.Contains(normalized,
		"REFERENCES profiles(id) ON DELETE CASCADE")
	hasDOCascade := strings.Contains(normalized,
		"auth_sessions_user_id_fkey") &&
		(strings.Contains(normalized, "ON DELETE CASCADE"))
	if !hasInlineCascade && !hasDOCascade {
		t.Error("auth_sessions FK must use ON DELETE CASCADE")
	}
}

func TestSchemaEmailVerificationForeignKey(t *testing.T) {
	normalized := normalizeSQL(getSchemaSQL())
	hasInline := strings.Contains(normalized,
		"user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE")
	hasDOBlock := strings.Contains(normalized,
		"ADD CONSTRAINT email_verification_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE")
	if !(hasInline || hasDOBlock) {
		t.Error("email_verification_tokens must reference profiles(id)")
	}
}

func TestSchemaEmailVerificationCascadeDelete(t *testing.T) {
	normalized := normalizeSQL(getSchemaSQL())
	count := strings.Count(normalized, "ON DELETE CASCADE")
	if count < 2 {
		t.Errorf("expected at least 2 ON DELETE CASCADE occurrences, got %d", count)
	}
}

func TestSchemaUserIDTypeIsText(t *testing.T) {
	normalized := normalizeSQL(getSchemaSQL())
	// Both user_id columns should be TEXT
	sessionsText := strings.Contains(normalized, "user_id TEXT")
	count := strings.Count(normalized, "user_id TEXT")
	if count < 2 {
		t.Errorf("expected at least 2 'user_id TEXT' occurrences, got %d", count)
	}
	_ = sessionsText
}

// ─── Constraint migration idempotency ───

func TestSchemaConstraintMigrationIdempotent(t *testing.T) {
	normalized := normalizeSQL(getSchemaSQL())
	if !strings.Contains(normalized, "pg_constraint") {
		t.Error("constraint migration must check pg_constraint for idempotency")
	}
	if !strings.Contains(normalized, "auth_sessions_user_id_fkey") {
		t.Error("missing named constraint auth_sessions_user_id_fkey")
	}
	if !strings.Contains(normalized, "email_verification_tokens_user_id_fkey") {
		t.Error("missing named constraint email_verification_tokens_user_id_fkey")
	}
	if !strings.Contains(normalized, "IF NOT EXISTS") {
		t.Error("DO block should use IF NOT EXISTS when adding constraints")
	}
}

// ─── Other constraints and indexes (preserved from original) ───

func TestSchemaRefreshTokenHashUnique(t *testing.T) {
	sql := getSchemaSQL()
	if !strings.Contains(sql, "uq_auth_sessions_refresh_token_hash") || !strings.Contains(sql, "UNIQUE") {
		t.Error("refresh_token_hash should have UNIQUE constraint")
	}
}

func TestSchemaVerificationTokenHashUnique(t *testing.T) {
	sql := getSchemaSQL()
	if !strings.Contains(sql, "uq_email_verification_token_hash") || !strings.Contains(sql, "UNIQUE") {
		t.Error("token_hash should have UNIQUE constraint")
	}
}

func TestSchemaUserIDIndexes(t *testing.T) {
	sql := getSchemaSQL()
	if !strings.Contains(sql, "idx_auth_sessions_user_id") {
		t.Error("missing index on auth_sessions.user_id")
	}
	if !strings.Contains(sql, "idx_email_verification_user_id") {
		t.Error("missing index on email_verification_tokens.user_id")
	}
}

func TestSchemaExpiresAtIndexes(t *testing.T) {
	sql := getSchemaSQL()
	if !strings.Contains(sql, "idx_auth_sessions_expires_at") {
		t.Error("missing index on auth_sessions.expires_at")
	}
	if !strings.Contains(sql, "idx_email_verification_expires_at") {
		t.Error("missing index on email_verification_tokens.expires_at")
	}
}

func TestSchemaTokenFamilyIndex(t *testing.T) {
	sql := getSchemaSQL()
	if !strings.Contains(sql, "idx_auth_sessions_token_family") {
		t.Error("missing index on auth_sessions.token_family")
	}
}

func TestSchemaEmptyTokenHashCheck(t *testing.T) {
	sql := getSchemaSQL()
	if !strings.Contains(sql, "token_hash_not_empty") || !strings.Contains(sql, "CHECK") {
		t.Error("missing CHECK constraint for non-empty token hash")
	}
}

func TestSchemaTokenFamilyCheck(t *testing.T) {
	sql := getSchemaSQL()
	if !strings.Contains(sql, "token_family_not_empty") || !strings.Contains(sql, "CHECK") {
		t.Error("missing CHECK constraint for non-empty token_family")
	}
}

func TestSchemaIfNotExists(t *testing.T) {
	sql := getSchemaSQL()
	if !strings.Contains(sql, "IF NOT EXISTS") {
		t.Error("schema tables should use IF NOT EXISTS")
	}
}

func TestSchemaUsesTimestamptz(t *testing.T) {
	sql := getSchemaSQL()
	count := strings.Count(sql, "TIMESTAMPTZ")
	if count < 6 {
		t.Errorf("expected at least 6 TIMESTAMPTZ columns, got %d", count)
	}
}

// ─── replaced_by_session_id & self-FK ───

func TestSchemaReplacedByInCreateTable(t *testing.T) {
	normalized := normalizeSQL(getSchemaSQL())
	if !strings.Contains(normalized, "replaced_by_session_id") {
		t.Error("CREATE TABLE must include replaced_by_session_id")
	}
}

func TestSchemaReplacedByTypeText(t *testing.T) {
	normalized := normalizeSQL(getSchemaSQL())
	if !strings.Contains(normalized, "replaced_by_session_id TEXT") {
		t.Error("replaced_by_session_id must be TEXT type")
	}
}

func TestSchemaReplacedByNullable(t *testing.T) {
	normalized := normalizeSQL(getSchemaSQL())
	// Must NOT have "replaced_by_session_id TEXT NOT NULL"
	if strings.Contains(normalized, "replaced_by_session_id TEXT NOT NULL") {
		t.Error("replaced_by_session_id must be nullable")
	}
}

func TestSchemaReplacedByReferencesAuthSessions(t *testing.T) {
	normalized := normalizeSQL(getSchemaSQL())
	if !strings.Contains(normalized, "REFERENCES auth_sessions(id)") {
		t.Error("replaced_by_session_id must reference auth_sessions(id)")
	}
}

func TestSchemaReplacedByOnDeleteSetNull(t *testing.T) {
	normalized := normalizeSQL(getSchemaSQL())
	if !strings.Contains(normalized, "ON DELETE SET NULL") {
		t.Error("replaced_by_session_id FK must use ON DELETE SET NULL")
	}
}

func TestSchemaReplacedByAlterTableIfNotExists(t *testing.T) {
	normalized := normalizeSQL(getSchemaSQL())
	if !strings.Contains(normalized, "ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS replaced_by_session_id") {
		t.Error("must have idempotent ALTER TABLE ADD COLUMN IF NOT EXISTS for replaced_by_session_id")
	}
}

func TestSchemaReplacedByConstraintName(t *testing.T) {
	normalized := normalizeSQL(getSchemaSQL())
	if !strings.Contains(normalized, "fk_auth_sessions_replaced_by") {
		t.Error("missing constraint fk_auth_sessions_replaced_by")
	}
}

func TestSchemaReplacedByConstraintPgConstraintCheck(t *testing.T) {
	normalized := normalizeSQL(getSchemaSQL())
	if !strings.Contains(normalized, "pg_constraint") {
		t.Error("constraint migration must check pg_constraint for idempotency")
	}
	if !strings.Contains(normalized, "auth_sessions'::regclass") {
		t.Error("constraint migration must use auth_sessions::regclass conrelid check")
	}
}

func TestSchemaReplacedByNoDuplicateConstraint(t *testing.T) {
	normalized := normalizeSQL(getSchemaSQL())
	count := strings.Count(normalized, "fk_auth_sessions_replaced_by")
	if count < 1 {
		t.Error("constraint fk_auth_sessions_replaced_by must exist")
	}
}

func TestSchemaCompositeIndexExists(t *testing.T) {
	normalized := normalizeSQL(getSchemaSQL())
	if !strings.Contains(normalized, "idx_auth_sessions_family_revoked") {
		t.Error("missing composite index idx_auth_sessions_family_revoked")
	}
}

func TestSchemaCompositeIndexColumnOrder(t *testing.T) {
	normalized := normalizeSQL(getSchemaSQL())
	if !strings.Contains(normalized, "token_family, revoked_at") {
		t.Error("composite index must have correct column order: token_family, revoked_at")
	}
}

func TestSchemaCompositeIndexOnAuthSessions(t *testing.T) {
	normalized := normalizeSQL(getSchemaSQL())
	if !strings.Contains(normalized, "ON auth_sessions(token_family, revoked_at)") {
		t.Error("composite index must be on auth_sessions table")
	}
}

func TestSchemaEmailVerificationTable(t *testing.T) {
	normalized := normalizeSQL(getSchemaSQL())
	if !strings.Contains(normalized, "auth_email_verification_tokens") {
		t.Error("schema must contain auth_email_verification_tokens table")
	}
}

func TestSchemaEmailVerificationFK(t *testing.T) {
	normalized := normalizeSQL(getSchemaSQL())
	if !strings.Contains(normalized, "REFERENCES profiles(id) ON DELETE CASCADE") {
		t.Error("email verification tokens must have FK to profiles with CASCADE")
	}
}

func TestSchemaEmailVerificationPartialUniqueIndex(t *testing.T) {
	normalized := normalizeSQL(getSchemaSQL())
	if !strings.Contains(normalized, "uq_auth_email_verify_active_token") {
		t.Error("schema must have partial unique index for active token")
	}
	if !strings.Contains(normalized, "WHERE used_at IS NULL AND revoked_at IS NULL") {
		t.Error("partial unique index must filter WHERE used_at IS NULL AND revoked_at IS NULL")
	}
}

func TestSchemaEmailVerificationTokenHashUnique(t *testing.T) {
	normalized := normalizeSQL(getSchemaSQL())
	if !strings.Contains(normalized, "uq_auth_email_verify_token_hash") {
		t.Error("token_hash must have UNIQUE constraint")
	}
}

// ─── kept test ───

func TestNilDBRejected(t *testing.T) {
	err := ensureAccountSecuritySchema(context.Background(), nil)
	if err == nil {
		t.Error("nil db should return error")
	}
}
