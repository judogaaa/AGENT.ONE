package main

import (
	"context"
	"net/url"
	"os"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Ensure ensureAuthIdentitiesSchema and backfill are referenced (for go vet)
var _ = ensureAuthIdentitiesSchema
var _ = backfillPasswordAuthIdentities

// ─── Schema SQL content checks ───

func getAuthIdentitySchemaSQL() string {
	return `
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
}

func TestAuthIdentitySchemaContainsTable(t *testing.T) {
	sql := getAuthIdentitySchemaSQL()
	if !strings.Contains(sql, "auth_identities") {
		t.Error("schema should contain auth_identities table")
	}
}

func TestAuthIdentitySchemaNoDropTable(t *testing.T) {
	sql := strings.ToUpper(getAuthIdentitySchemaSQL())
	if strings.Contains(sql, "DROP TABLE") {
		t.Error("schema must NOT contain DROP TABLE")
	}
}

func TestAuthIdentitySchemaNoTruncate(t *testing.T) {
	sql := strings.ToUpper(getAuthIdentitySchemaSQL())
	if strings.Contains(sql, "TRUNCATE") {
		t.Error("schema must NOT contain TRUNCATE")
	}
}

func TestAuthIdentitySchemaNoDelete(t *testing.T) {
	sql := strings.ToUpper(getAuthIdentitySchemaSQL())
	if strings.Contains(sql, "DELETE FROM") {
		t.Error("schema must NOT contain DELETE FROM")
	}
}

func TestAuthIdentitySchemaHasProviderCheck(t *testing.T) {
	sql := getAuthIdentitySchemaSQL()
	if !strings.Contains(sql, "provider IN ('password', 'yandex')") {
		t.Error("schema should have CHECK constraint for allowed providers")
	}
}

func TestAuthIdentitySchemaHasProviderSubjectUnique(t *testing.T) {
	sql := getAuthIdentitySchemaSQL()
	if !strings.Contains(sql, "uq_auth_identities_provider_subject") {
		t.Error("schema should have UNIQUE(provider, provider_subject)")
	}
}

func TestAuthIdentitySchemaHasUserProviderUnique(t *testing.T) {
	sql := getAuthIdentitySchemaSQL()
	if !strings.Contains(sql, "uq_auth_identities_user_provider") {
		t.Error("schema should have UNIQUE(user_id, provider)")
	}
}

func TestAuthIdentitySchemaHasForeignKey(t *testing.T) {
	sql := getAuthIdentitySchemaSQL()
	if !strings.Contains(sql, "REFERENCES profiles(id) ON DELETE CASCADE") {
		t.Error("schema should reference profiles(id) with ON DELETE CASCADE")
	}
}

func TestAuthIdentitySchemaHasRequiredIndexes(t *testing.T) {
	sql := getAuthIdentitySchemaSQL()
	indexes := []string{
		"idx_auth_identities_user_id",
		"idx_auth_identities_provider",
		"idx_auth_identities_last_login_at",
	}
	for _, idx := range indexes {
		if !strings.Contains(sql, idx) {
			t.Errorf("schema should have index %s", idx)
		}
	}
}

func TestAuthIdentitySchemaHasJSONBMetadata(t *testing.T) {
	sql := getAuthIdentitySchemaSQL()
	if !strings.Contains(sql, "JSONB") {
		t.Error("schema should have JSONB metadata column")
	}
}

func TestAuthIdentitySchemaHasTimestamptz(t *testing.T) {
	sql := getAuthIdentitySchemaSQL()
	if !strings.Contains(sql, "TIMESTAMPTZ") {
		t.Error("schema should use TIMESTAMPTZ for timestamps")
	}
}

// ─── Helper function tests ───

func TestNewSecureIDLength(t *testing.T) {
	id := newSecureID()
	if len(id) != 32 {
		t.Errorf("newSecureID() should return 32 hex chars, got %d: %s", len(id), id)
	}
}

func TestNewSecureIDRandomness(t *testing.T) {
	ids := make(map[string]bool)
	for i := 0; i < 100; i++ {
		id := newSecureID()
		if ids[id] {
			t.Error("newSecureID() should not collide")
		}
		ids[id] = true
	}
}

func TestNewSecureIDHexChars(t *testing.T) {
	id := newSecureID()
	for _, c := range id {
		if !((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f')) {
			t.Errorf("newSecureID() should only contain hex chars, got %c", c)
			break
		}
	}
}

func TestNormalizeEmailTrimSpace(t *testing.T) {
	got := normalizeEmail("  USER@Example.COM  ")
	want := "user@example.com"
	if got != want {
		t.Errorf("normalizeEmail() = %q, want %q", got, want)
	}
}

func TestNormalizeEmailLowercase(t *testing.T) {
	got := normalizeEmail("User@Example.COM")
	want := "user@example.com"
	if got != want {
		t.Errorf("normalizeEmail() = %q, want %q", got, want)
	}
}

func TestNormalizeEmailAlreadyNormal(t *testing.T) {
	got := normalizeEmail("user@example.com")
	want := "user@example.com"
	if got != want {
		t.Errorf("normalizeEmail() = %q, want %q", got, want)
	}
}

func TestNormalizeEmailEmpty(t *testing.T) {
	got := normalizeEmail("")
	want := ""
	if got != want {
		t.Errorf("normalizeEmail() = %q, want %q", got, want)
	}
}

func TestIsProviderAllowedPassword(t *testing.T) {
	if !isProviderAllowed(ProviderPassword) {
		t.Error("isProviderAllowed should allow 'password'")
	}
}

func TestIsProviderAllowedRemovedProvider(t *testing.T) {
	if isProviderAllowed("telegram") {
		t.Error("isProviderAllowed should reject removed providers")
	}
}

func TestIsProviderAllowedYandex(t *testing.T) {
	if !isProviderAllowed(ProviderYandex) {
		t.Error("isProviderAllowed should allow 'yandex'")
	}
}

func TestIsProviderAllowedInvalid(t *testing.T) {
	if isProviderAllowed("google") {
		t.Error("isProviderAllowed should reject 'google'")
	}
}

func TestIsProviderAllowedEmpty(t *testing.T) {
	if isProviderAllowed("") {
		t.Error("isProviderAllowed should reject empty string")
	}
}

func TestCreateAuthIdentityProviderNotAllowed(t *testing.T) {
	err := createAuthIdentity(context.Background(), nil, &AuthIdentity{Provider: "google"})
	if err != errIdentityProviderNotAllowed {
		t.Errorf("expected errIdentityProviderNotAllowed, got %v", err)
	}
}

// ─── Error sentinel tests ───

func TestErrorSentinels(t *testing.T) {
	if errIdentityLinkedToThisUser.Error() != "identity already linked to this user" {
		t.Error("unexpected error message")
	}
	if errIdentityBelongsToAnother.Error() != "identity belongs to another user" {
		t.Error("unexpected error message")
	}
	if errUserAlreadyHasProvider.Error() != "user already has this provider" {
		t.Error("unexpected error message")
	}
	if errIdentityUserNotFound.Error() != "user not found" {
		t.Error("unexpected error message")
	}
	if errIdentityProviderNotAllowed.Error() != "provider not allowed" {
		t.Error("unexpected error message")
	}
}

// ─── linkAuthIdentityToUser error path tests (no DB — path tested with nil db) ───

func TestLinkAuthIdentityToUserRejectsInvalidProvider(t *testing.T) {
	err := linkAuthIdentityToUser(context.Background(), nil, "user1", "google", "sub", nil, nil, false, nil)
	if err != errIdentityProviderNotAllowed {
		t.Errorf("expected errIdentityProviderNotAllowed, got %v", err)
	}
}

// ─── Backfill safety tests ───

func TestAuthIdentitySchemaHasNoPasswordColumn(t *testing.T) {
	schema := getAuthIdentitySchemaSQL()
	hasPasswordColumn := strings.Contains(schema, "password TEXT") ||
		strings.Contains(schema, "password_hash")
	if hasPasswordColumn {
		t.Error("auth_identities must NOT have a password column")
	}
}

// ─── Integration tests (require DB) ───

func skipIfNoDB(t *testing.T) {
	t.Helper()
	if strings.TrimSpace(os.Getenv("DATABASE_URL")) == "" {
		t.Skip("DATABASE_URL is not configured; PostgreSQL integration test skipped")
	}
}

// validateTestDatabaseURL rejects connection strings that point to
// known production databases. Must be called before any DB connection
// in integration tests to prevent accidental production access.
func validateTestDatabaseURL(t *testing.T, connStr string) {
	t.Helper()
	if connStr == "" {
		return
	}
	lower := strings.ToLower(connStr)
	// Public tests must never touch an arbitrary network database.
	blocked := []string{"agentone_prod", "agentone-production"}
	for _, b := range blocked {
		if strings.Contains(lower, b) {
			t.Fatalf("REFUSED: DATABASE_URL matches production marker %q", b)
		}
	}
	u, err := url.Parse(connStr)
	if err != nil {
		t.Fatalf("REFUSED: malformed DATABASE_URL")
	}
	host := strings.ToLower(u.Hostname())
	if host != "localhost" && host != "127.0.0.1" && host != "::1" && host != "db" && host != "postgres" {
		t.Fatalf("REFUSED: integration tests require a local/container database host")
	}
	// Reject when APP_ENV=production
	if strings.ToLower(strings.TrimSpace(os.Getenv("APP_ENV"))) == "production" {
		t.Fatal("REFUSED: APP_ENV=production blocks integration tests")
	}
}

func getTestDB(t *testing.T) *pgxpool.Pool {
	t.Helper()
	connStr := os.Getenv("DATABASE_URL")
	if connStr == "" {
		t.Skip("DATABASE_URL not set")
	}
	validateTestDatabaseURL(t, connStr)
	pool, err := pgxpool.New(context.Background(), connStr)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	t.Cleanup(pool.Close)

	// Ensure schema exists
	if err := ensureProfilesSchema(context.Background(), pool); err != nil {
		t.Fatalf("profiles schema: %v", err)
	}
	if err := ensureAuthIdentitiesSchema(context.Background(), pool); err != nil {
		t.Fatalf("schema: %v", err)
	}
	if err := ensureAccountSecuritySchema(context.Background(), pool); err != nil {
		t.Fatalf("account security schema: %v", err)
	}
	if err := ensureOrganizationsSchema(context.Background(), pool); err != nil {
		t.Fatalf("organizations schema: %v", err)
	}
	if err := ensureAuditEventsSchema(context.Background(), pool); err != nil {
		t.Fatalf("audit events schema: %v", err)
	}

	// Clean up test data
	pool.Exec(context.Background(), "DELETE FROM auth_sessions WHERE user_id LIKE 'test_%'")
	pool.Exec(context.Background(), "DELETE FROM auth_identities WHERE user_id LIKE 'test_%'")
	pool.Exec(context.Background(), "DELETE FROM profiles WHERE id LIKE 'test_%'")

	return pool
}

func TestAuthIdentityDB_CreatePasswordIdentity(t *testing.T) {
	skipIfNoDB(t)
	pool := getTestDB(t)
	ctx := context.Background()

	userID := "test_user_identity_1"
	pool.Exec(ctx, "DELETE FROM profiles WHERE id=$1", userID)
	_, err := pool.Exec(ctx, "INSERT INTO profiles (id, email, password) VALUES ($1,$2,$3)", userID, "test1@example.com", "hash")
	if err != nil {
		t.Fatalf("setup: %v", err)
	}
	t.Cleanup(func() { pool.Exec(ctx, "DELETE FROM profiles WHERE id=$1", userID) })

	identity := &AuthIdentity{
		UserID:          userID,
		Provider:        ProviderPassword,
		ProviderSubject: "test1@example.com",
		Metadata:        map[string]interface{}{},
	}
	err = createAuthIdentity(ctx, pool, identity)
	if err != nil {
		t.Fatalf("createAuthIdentity: %v", err)
	}
	if identity.ID == "" {
		t.Error("identity ID should not be empty")
	}
	if len(identity.ID) != 32 {
		t.Errorf("identity ID should be 32 hex chars, got %d", len(identity.ID))
	}

	// Verify it exists
	found, err := findAuthIdentityByProviderSubject(ctx, pool, ProviderPassword, "test1@example.com")
	if err != nil {
		t.Fatalf("find: %v", err)
	}
	if found == nil {
		t.Fatal("identity not found")
	}
	if found.Provider != ProviderPassword {
		t.Errorf("provider = %q, want %q", found.Provider, ProviderPassword)
	}
}

func TestAuthIdentityDB_UserCanHaveMultipleProviders(t *testing.T) {
	skipIfNoDB(t)
	pool := getTestDB(t)
	ctx := context.Background()

	userID := "test_user_multi"
	pool.Exec(ctx, "DELETE FROM profiles WHERE id=$1", userID)
	_, err := pool.Exec(ctx, "INSERT INTO profiles (id, email, password) VALUES ($1,$2,$3)", userID, "multi@example.com", "hash")
	if err != nil {
		t.Fatalf("setup: %v", err)
	}
	t.Cleanup(func() { pool.Exec(ctx, "DELETE FROM profiles WHERE id=$1", userID) })

	// password
	err = linkAuthIdentityToUser(ctx, pool, userID, ProviderPassword, "multi@example.com", strPtr("multi@example.com"), nil, false, nil)
	if err != nil {
		t.Fatalf("link password: %v", err)
	}

	// yandex (different subject)
	err = linkAuthIdentityToUser(ctx, pool, userID, ProviderYandex, "ya_67890", strPtr("ya@example.com"), nil, true, nil)
	if err != nil {
		t.Fatalf("link yandex: %v", err)
	}

	// Verify 2 identities
	count, err := countUserAuthIdentities(ctx, pool, userID)
	if err != nil {
		t.Fatalf("count: %v", err)
	}
	if count != 2 {
		t.Errorf("expected 2 identities, got %d", count)
	}
}

func TestAuthIdentityDB_ProviderSubjectUnique(t *testing.T) {
	skipIfNoDB(t)
	pool := getTestDB(t)
	ctx := context.Background()

	u1 := "test_user_subj_1"
	u2 := "test_user_subj_2"
	for _, id := range []string{u1, u2} {
		pool.Exec(ctx, "DELETE FROM profiles WHERE id=$1", id)
		_, err := pool.Exec(ctx, "INSERT INTO profiles (id, email, password) VALUES ($1,$2,$3)", id, id+"@example.com", "hash")
		if err != nil {
			t.Fatalf("setup %s: %v", id, err)
		}
	}
	t.Cleanup(func() {
		for _, id := range []string{u1, u2} {
			pool.Exec(ctx, "DELETE FROM profiles WHERE id=$1", id)
		}
	})

	// u1 gets ya_999
	err := linkAuthIdentityToUser(ctx, pool, u1, ProviderYandex, "ya_999", nil, nil, false, nil)
	if err != nil {
		t.Fatalf("link u1: %v", err)
	}

	// u2 tries same subject → must fail
	err = linkAuthIdentityToUser(ctx, pool, u2, ProviderYandex, "ya_999", nil, nil, false, nil)
	if err != errIdentityBelongsToAnother {
		t.Errorf("expected errIdentityBelongsToAnother, got %v", err)
	}
}

func TestAuthIdentityDB_CannotLinkSameProviderTwice(t *testing.T) {
	skipIfNoDB(t)
	pool := getTestDB(t)
	ctx := context.Background()

	userID := "test_user_dup_provider"
	pool.Exec(ctx, "DELETE FROM profiles WHERE id=$1", userID)
	_, err := pool.Exec(ctx, "INSERT INTO profiles (id, email, password) VALUES ($1,$2,$3)", userID, "dupprov@example.com", "hash")
	if err != nil {
		t.Fatalf("setup: %v", err)
	}
	t.Cleanup(func() { pool.Exec(ctx, "DELETE FROM profiles WHERE id=$1", userID) })

	// First yandex identity
	err = linkAuthIdentityToUser(ctx, pool, userID, ProviderYandex, "ya_444", nil, nil, false, nil)
	if err != nil {
		t.Fatalf("first link: %v", err)
	}

	// Second yandex identity with different subject → must fail
	err = linkAuthIdentityToUser(ctx, pool, userID, ProviderYandex, "ya_555", nil, nil, false, nil)
	if err != errUserAlreadyHasProvider {
		t.Errorf("expected errUserAlreadyHasProvider, got %v", err)
	}
}

func TestAuthIdentityDB_ReLinkSameIdentityIsNoop(t *testing.T) {
	skipIfNoDB(t)
	pool := getTestDB(t)
	ctx := context.Background()

	userID := "test_user_relink"
	pool.Exec(ctx, "DELETE FROM profiles WHERE id=$1", userID)
	_, err := pool.Exec(ctx, "INSERT INTO profiles (id, email, password) VALUES ($1,$2,$3)", userID, "relink@example.com", "hash")
	if err != nil {
		t.Fatalf("setup: %v", err)
	}
	t.Cleanup(func() { pool.Exec(ctx, "DELETE FROM profiles WHERE id=$1", userID) })

	// First link
	err = linkAuthIdentityToUser(ctx, pool, userID, ProviderYandex, "ya_relink", nil, nil, false, nil)
	if err != nil {
		t.Fatalf("first link: %v", err)
	}

	// Same link again
	err = linkAuthIdentityToUser(ctx, pool, userID, ProviderYandex, "ya_relink", nil, nil, false, nil)
	if err != errIdentityLinkedToThisUser {
		t.Errorf("expected errIdentityLinkedToThisUser, got %v", err)
	}

	// Still 1 identity
	count, err := countUserAuthIdentities(ctx, pool, userID)
	if err != nil {
		t.Fatalf("count: %v", err)
	}
	if count != 1 {
		t.Errorf("expected 1 identity after re-link, got %d", count)
	}
}

func TestAuthIdentityDB_LinkDoesNotStealIdentity(t *testing.T) {
	skipIfNoDB(t)
	pool := getTestDB(t)
	ctx := context.Background()

	u1 := "test_user_steal_1"
	u2 := "test_user_steal_2"
	for _, id := range []string{u1, u2} {
		pool.Exec(ctx, "DELETE FROM profiles WHERE id=$1", id)
		_, err := pool.Exec(ctx, "INSERT INTO profiles (id, email, password) VALUES ($1,$2,$3)", id, id+"@example.com", "hash")
		if err != nil {
			t.Fatalf("setup %s: %v", id, err)
		}
	}
	t.Cleanup(func() {
		for _, id := range []string{u1, u2} {
			pool.Exec(ctx, "DELETE FROM profiles WHERE id=$1", id)
		}
	})

	// u1 gets ya_steal
	err := linkAuthIdentityToUser(ctx, pool, u1, ProviderYandex, "ya_steal", nil, nil, false, nil)
	if err != nil {
		t.Fatalf("link u1: %v", err)
	}

	// u2 tries to take ya_steal → fails
	err = linkAuthIdentityToUser(ctx, pool, u2, ProviderYandex, "ya_steal", nil, nil, false, nil)
	if err != errIdentityBelongsToAnother {
		t.Errorf("expected errIdentityBelongsToAnother, got %v", err)
	}

	// Verify u1 still owns it
	id, err := findAuthIdentityByProviderSubject(ctx, pool, ProviderYandex, "ya_steal")
	if err != nil {
		t.Fatalf("find: %v", err)
	}
	if id == nil || id.UserID != u1 {
		t.Errorf("identity should still belong to u1, got user_id=%v", id.UserID)
	}
}

func TestAuthIdentityDB_CascadeDelete(t *testing.T) {
	skipIfNoDB(t)
	pool := getTestDB(t)
	ctx := context.Background()

	userID := "test_user_cascade"
	pool.Exec(ctx, "DELETE FROM profiles WHERE id=$1", userID)
	_, err := pool.Exec(ctx, "INSERT INTO profiles (id, email, password) VALUES ($1,$2,$3)", userID, "cascade@example.com", "hash")
	if err != nil {
		t.Fatalf("setup: %v", err)
	}

	// Create identity
	err = linkAuthIdentityToUser(ctx, pool, userID, ProviderPassword, "cascade@example.com", nil, nil, false, nil)
	if err != nil {
		t.Fatalf("link: %v", err)
	}

	// Delete profile
	_, err = pool.Exec(ctx, "DELETE FROM profiles WHERE id=$1", userID)
	if err != nil {
		t.Fatalf("delete profile: %v", err)
	}

	// Identity should be cascade deleted
	count, err := countUserAuthIdentities(ctx, pool, userID)
	if err != nil {
		t.Fatalf("count: %v", err)
	}
	if count != 0 {
		t.Errorf("expected 0 identities after profile delete, got %d", count)
	}
}

func TestAuthIdentityDB_BackfillCreatesPasswordIdentity(t *testing.T) {
	skipIfNoDB(t)
	pool := getTestDB(t)
	ctx := context.Background()

	userID := "test_user_backfill"
	pool.Exec(ctx, "DELETE FROM profiles WHERE id=$1", userID)
	_, err := pool.Exec(ctx, "INSERT INTO profiles (id, email, password) VALUES ($1,$2,$3)", userID, "backfill@example.com", "$2a$10$hash")
	if err != nil {
		t.Fatalf("setup: %v", err)
	}
	t.Cleanup(func() { pool.Exec(ctx, "DELETE FROM profiles WHERE id=$1", userID) })

	created, err := backfillPasswordAuthIdentities(ctx, pool)
	if err != nil {
		t.Fatalf("backfill: %v", err)
	}
	if created < 1 {
		t.Error("backfill should have created at least 1 identity")
	}

	// Verify
	found, err := findUserAuthIdentity(ctx, pool, userID, ProviderPassword)
	if err != nil {
		t.Fatalf("find: %v", err)
	}
	if found == nil {
		t.Fatal("backfill should create password identity")
	}
	if found.ProviderSubject != "backfill@example.com" {
		t.Errorf("subject = %q, want 'backfill@example.com'", found.ProviderSubject)
	}
}

func TestAuthIdentityDB_BackfillIsIdempotent(t *testing.T) {
	skipIfNoDB(t)
	pool := getTestDB(t)
	ctx := context.Background()

	userID := "test_user_idem"
	pool.Exec(ctx, "DELETE FROM profiles WHERE id=$1", userID)
	_, err := pool.Exec(ctx, "INSERT INTO profiles (id, email, password) VALUES ($1,$2,$3)", userID, "idem@example.com", "$2a$10$hash")
	if err != nil {
		t.Fatalf("setup: %v", err)
	}
	t.Cleanup(func() { pool.Exec(ctx, "DELETE FROM profiles WHERE id=$1", userID) })

	created1, err := backfillPasswordAuthIdentities(ctx, pool)
	if err != nil {
		t.Fatalf("backfill 1: %v", err)
	}

	created2, err := backfillPasswordAuthIdentities(ctx, pool)
	if err != nil {
		t.Fatalf("backfill 2: %v", err)
	}

	if created2 != 0 {
		t.Errorf("second backfill should create 0 identities, got %d", created2)
	}

	count, err := countUserAuthIdentities(ctx, pool, userID)
	if err != nil {
		t.Fatalf("count: %v", err)
	}
	if created1 > 0 && count != 1 {
		t.Errorf("expected 1 identity after idempotent backfill, got %d", count)
	}
}

func TestAuthIdentityDB_BackfillNormalizesEmail(t *testing.T) {
	skipIfNoDB(t)
	pool := getTestDB(t)
	ctx := context.Background()

	userID := "test_user_norm"
	pool.Exec(ctx, "DELETE FROM profiles WHERE id=$1", userID)
	_, err := pool.Exec(ctx, "INSERT INTO profiles (id, email, password) VALUES ($1,$2,$3)", userID, "  Mixed@Example.COM  ", "$2a$10$hash")
	if err != nil {
		t.Fatalf("setup: %v", err)
	}
	t.Cleanup(func() { pool.Exec(ctx, "DELETE FROM profiles WHERE id=$1", userID) })

	_, err = backfillPasswordAuthIdentities(ctx, pool)
	if err != nil {
		t.Fatalf("backfill: %v", err)
	}

	found, err := findUserAuthIdentity(ctx, pool, userID, ProviderPassword)
	if err != nil {
		t.Fatalf("find: %v", err)
	}
	if found == nil {
		t.Fatal("backfill should create identity")
	}
	want := "mixed@example.com"
	if found.ProviderSubject != want {
		t.Errorf("subject = %q, want %q", found.ProviderSubject, want)
	}
	if found.ProviderEmail == nil || *found.ProviderEmail != want {
		t.Errorf("provider_email = %v, want %q", found.ProviderEmail, want)
	}
}

func TestAuthIdentityDB_ListUserIdentities(t *testing.T) {
	skipIfNoDB(t)
	pool := getTestDB(t)
	ctx := context.Background()

	userID := "test_user_list"
	pool.Exec(ctx, "DELETE FROM profiles WHERE id=$1", userID)
	_, err := pool.Exec(ctx, "INSERT INTO profiles (id, email, password) VALUES ($1,$2,$3)", userID, "list@example.com", "hash")
	if err != nil {
		t.Fatalf("setup: %v", err)
	}
	t.Cleanup(func() { pool.Exec(ctx, "DELETE FROM profiles WHERE id=$1", userID) })

	linkAuthIdentityToUser(ctx, pool, userID, ProviderPassword, "list@example.com", nil, nil, false, nil)
	linkAuthIdentityToUser(ctx, pool, userID, ProviderYandex, "ya_list", nil, nil, false, nil)

	list, err := listUserAuthIdentities(ctx, pool, userID)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(list) != 2 {
		t.Errorf("expected 2 identities, got %d", len(list))
	}
}

func TestAuthIdentityDB_DeleteIdentity(t *testing.T) {
	skipIfNoDB(t)
	pool := getTestDB(t)
	ctx := context.Background()

	userID := "test_user_delete"
	pool.Exec(ctx, "DELETE FROM profiles WHERE id=$1", userID)
	_, err := pool.Exec(ctx, "INSERT INTO profiles (id, email, password) VALUES ($1,$2,$3)", userID, "del@example.com", "hash")
	if err != nil {
		t.Fatalf("setup: %v", err)
	}
	t.Cleanup(func() { pool.Exec(ctx, "DELETE FROM profiles WHERE id=$1", userID) })

	identity := &AuthIdentity{UserID: userID, Provider: ProviderPassword, ProviderSubject: "del@example.com"}
	createAuthIdentity(ctx, pool, identity)

	err = deleteAuthIdentity(ctx, pool, identity.ID)
	if err != nil {
		t.Fatalf("delete: %v", err)
	}

	found, _ := findUserAuthIdentity(ctx, pool, userID, ProviderPassword)
	if found != nil {
		t.Error("identity should be deleted")
	}
}

func TestAuthIdentityDB_UpdateLastLogin(t *testing.T) {
	skipIfNoDB(t)
	pool := getTestDB(t)
	ctx := context.Background()

	userID := "test_user_login"
	pool.Exec(ctx, "DELETE FROM profiles WHERE id=$1", userID)
	_, err := pool.Exec(ctx, "INSERT INTO profiles (id, email, password) VALUES ($1,$2,$3)", userID, "login@example.com", "hash")
	if err != nil {
		t.Fatalf("setup: %v", err)
	}
	t.Cleanup(func() { pool.Exec(ctx, "DELETE FROM profiles WHERE id=$1", userID) })

	identity := &AuthIdentity{UserID: userID, Provider: ProviderPassword, ProviderSubject: "login@example.com"}
	createAuthIdentity(ctx, pool, identity)

	if identity.LastLoginAt != nil {
		t.Error("initial LastLoginAt should be nil")
	}

	err = updateAuthIdentityLastLogin(ctx, pool, identity.ID)
	if err != nil {
		t.Fatalf("update: %v", err)
	}

	// Re-read
	found, _ := findAuthIdentityByProviderSubject(ctx, pool, ProviderPassword, "login@example.com")
	if found == nil {
		t.Fatal("identity not found")
	}
	if found.LastLoginAt == nil {
		t.Error("LastLoginAt should be set after update")
	}
}

func TestAuthIdentityDB_BackfillSkipsNoPassword(t *testing.T) {
	skipIfNoDB(t)
	pool := getTestDB(t)
	ctx := context.Background()

	userID := "test_user_nopw"
	pool.Exec(ctx, "DELETE FROM profiles WHERE id=$1", userID)
	_, err := pool.Exec(ctx, "INSERT INTO profiles (id, email) VALUES ($1,$2)", userID, "nopw@example.com")
	if err != nil {
		t.Fatalf("setup: %v", err)
	}
	t.Cleanup(func() { pool.Exec(ctx, "DELETE FROM profiles WHERE id=$1", userID) })

	_, err = backfillPasswordAuthIdentities(ctx, pool)
	if err != nil {
		t.Fatalf("backfill: %v", err)
	}

	// No password identity should be created for this user
	found, _ := findUserAuthIdentity(ctx, pool, userID, ProviderPassword)
	if found != nil {
		t.Error("backfill should skip profiles without password")
	}
}

func TestAuthIdentityDB_LinkFailsForNonexistentUser(t *testing.T) {
	skipIfNoDB(t)
	pool := getTestDB(t)
	ctx := context.Background()

	err := linkAuthIdentityToUser(ctx, pool, "nonexistent_user_id", ProviderYandex, "ya_ghost", nil, nil, false, nil)
	if err != errIdentityUserNotFound {
		t.Errorf("expected errIdentityUserNotFound, got %v", err)
	}
}
