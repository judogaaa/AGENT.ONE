package main

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Organization legal types. Stored separately from the immutable account
// role — a business account can be a self-employed person, an individual
// entrepreneur, or a legal entity.
const (
	legalTypeSelfEmployed           = "self_employed"
	legalTypeIndividualEntrepreneur = "individual_entrepreneur"
	legalTypeLegalEntity            = "legal_entity"
)

// Organization onboarding statuses.
const (
	onboardingRequired      = "required"
	onboardingCompleted     = "completed"
	onboardingPendingReview = "pending_review"
	onboardingVerified      = "verified"
	onboardingRejected      = "rejected"
)

// ensureOrganizationsSchema creates the organizations table idempotently.
// The table belongs to the user (account-level), not to a shop. Social
// identity stays on auth_identities; legal/requisite data lives here.
//
// Migration-safe: all columns except id/user_id are nullable and existing
// rows are never dropped. Uniqueness on user_id guarantees at most one
// organization per account — repeated onboarding requests update in place.
func ensureOrganizationsSchema(ctx context.Context, db *pgxpool.Pool) error {
	if db == nil {
		return errors.New("database pool is nil")
	}

	createTable := `
	CREATE TABLE IF NOT EXISTS organizations (
		id                         TEXT PRIMARY KEY,
		user_id                    TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
		legal_type                 TEXT,
		legal_name                 TEXT,
		short_name                 TEXT,
		display_name               TEXT,
		full_name                  TEXT,
		inn                        TEXT,
		kpp                        TEXT,
		ogrn                       TEXT,
		ogrnip                     TEXT,
		registration_address       TEXT,
		legal_address              TEXT,
		region                     TEXT,
		representative_full_name   TEXT,
		representative_position    TEXT,
		contact_phone              TEXT,
		contact_email              TEXT,
		authority_confirmed_at     TIMESTAMPTZ,
		onboarding_status          TEXT NOT NULL DEFAULT 'required',
		onboarding_completed_at    TIMESTAMPTZ,
		created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		CONSTRAINT uq_organizations_user UNIQUE (user_id),
		CONSTRAINT ck_organizations_legal_type CHECK (legal_type IS NULL OR legal_type IN ('self_employed','individual_entrepreneur','legal_entity')),
		CONSTRAINT ck_organizations_onboarding_status CHECK (onboarding_status IN ('required','completed','pending_review','verified','rejected'))
	);
	CREATE INDEX IF NOT EXISTS idx_organizations_user_id ON organizations(user_id);
	`
	if _, err := db.Exec(ctx, createTable); err != nil {
		return fmt.Errorf("organizations schema migration: %w", err)
	}

	return nil
}
