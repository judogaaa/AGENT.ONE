package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Legal document versions — bump when published texts change.
const (
	legalTermsVersion   = "2026-08-03-legal-v1"
	legalPrivacyVersion = "2026-08-03-legal-v1"
	legalPDConsentVer   = "2026-08-03-legal-v1"
	cookieConsentVer    = "2026-08-03-cookie-v1"
)

var allowedConsentTypes = map[string]bool{
	"personal_data": true,
	"terms":         true,
	"cookies":       true,
	"marketing":     true,
}

func ensureLegalConsentSchema(ctx context.Context, db *pgxpool.Pool) error {
	if db == nil {
		return errors.New("database pool is nil")
	}
	sql := `
	CREATE TABLE IF NOT EXISTS user_consents (
		id               TEXT PRIMARY KEY,
		user_id          TEXT REFERENCES profiles(id) ON DELETE SET NULL,
		consent_type     TEXT NOT NULL,
		document_version TEXT NOT NULL,
		granted          BOOLEAN NOT NULL DEFAULT true,
		source           TEXT NOT NULL DEFAULT '',
		ip_hash          TEXT,
		user_agent_hash  TEXT,
		created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		withdrawn_at     TIMESTAMPTZ,
		CONSTRAINT ck_user_consents_type CHECK (consent_type <> ''),
		CONSTRAINT ck_user_consents_version CHECK (document_version <> '')
	);
	CREATE INDEX IF NOT EXISTS idx_user_consents_user_id ON user_consents(user_id);
	CREATE INDEX IF NOT EXISTS idx_user_consents_type ON user_consents(consent_type);
	CREATE INDEX IF NOT EXISTS idx_user_consents_created ON user_consents(created_at DESC);
	`
	if _, err := db.Exec(ctx, sql); err != nil {
		return fmt.Errorf("user_consents schema: %w", err)
	}
	return nil
}

func (a *App) recordUserConsent(r *http.Request, userID, consentType, documentVersion, source string, granted bool) error {
	if !allowedConsentTypes[consentType] {
		return fmt.Errorf("invalid consent type")
	}
	if documentVersion == "" {
		documentVersion = legalPDConsentVer
	}
	id := newID()
	ip := clientIP(r)
	ua := r.Header.Get("User-Agent")
	_, err := a.db.Exec(a.ctx,
		`INSERT INTO user_consents (id, user_id, consent_type, document_version, granted, source, ip_hash, user_agent_hash)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
		id, nullIfEmpty(userID), consentType, documentVersion, granted, source, sha256Hex(ip), sha256Hex(ua))
	return err
}

func nullIfEmpty(s string) interface{} {
	if strings.TrimSpace(s) == "" {
		return nil
	}
	return s
}

func requirePersonalDataConsent(w http.ResponseWriter, accepted *bool) bool {
	if accepted == nil || !*accepted {
		jsonErr(w, 400, "personal data consent required")
		return false
	}
	return true
}

func (a *App) userHasCurrentPersonalDataConsent(userID string) bool {
	if strings.TrimSpace(userID) == "" {
		return false
	}
	var privacyVer string
	err := a.db.QueryRow(a.ctx, "SELECT COALESCE(privacy_version,'') FROM profiles WHERE id=$1", userID).Scan(&privacyVer)
	if err == nil && privacyVer == legalPrivacyVersion {
		return true
	}
	var exists bool
	_ = a.db.QueryRow(a.ctx, `SELECT EXISTS(
		SELECT 1 FROM user_consents
		WHERE user_id=$1 AND consent_type='personal_data' AND document_version=$2 AND granted=true AND withdrawn_at IS NULL
	)`, userID, legalPDConsentVer).Scan(&exists)
	return exists
}

func (a *App) requirePersonalDataConsentOrPrior(w http.ResponseWriter, userID string, accepted *bool) bool {
	if accepted != nil && *accepted {
		return true
	}
	if a.userHasCurrentPersonalDataConsent(userID) {
		return true
	}
	return requirePersonalDataConsent(w, accepted)
}

func (a *App) handleLegalMeta(w http.ResponseWriter, r *http.Request) {
	jsonOK(w, map[string]interface{}{
		"version":              legalTermsVersion,
		"privacyVersion":       legalPrivacyVersion,
		"personalDataConsent":  legalPDConsentVer,
		"cookieConsentVersion": cookieConsentVer,
		"pages": []map[string]string{
			{"slug": "privacy", "path": "/legal/privacy"},
			{"slug": "personal-data-consent", "path": "/legal/personal-data-consent"},
			{"slug": "cookies", "path": "/legal/cookies"},
			{"slug": "terms", "path": "/legal/terms"},
			{"slug": "offer", "path": "/legal/offer"},
			{"slug": "marketplace-rules", "path": "/legal/marketplace-rules"},
			{"slug": "payment-delivery-returns", "path": "/legal/payment-delivery-returns"},
			{"slug": "requisites", "path": "/legal/requisites"},
		},
		"marketingConsentPage": false,
	})
}

func (a *App) handleRecordConsent(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ConsentType     string `json:"consentType"`
		DocumentVersion string `json:"documentVersion"`
		Source          string `json:"source"`
		Granted         *bool  `json:"granted"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonErr(w, 400, "invalid body")
		return
	}
	if !allowedConsentTypes[req.ConsentType] {
		jsonErr(w, 400, "invalid consent type")
		return
	}
	granted := true
	if req.Granted != nil {
		granted = *req.Granted
	}
	userID := ""
	if claims, err := a.auth(r); err == nil {
		userID = claims.Sub
	}
	if err := a.recordUserConsent(r, userID, req.ConsentType, req.DocumentVersion, req.Source, granted); err != nil {
		jsonErr(w, 500, "failed to record consent")
		return
	}
	jsonOK(w, map[string]interface{}{"recorded": true, "consentType": req.ConsentType, "version": req.DocumentVersion})
}

func (a *App) handleWithdrawConsent(w http.ResponseWriter, r *http.Request) {
	claims, err := a.auth(r)
	if err != nil {
		jsonErr(w, 401, "unauthorized")
		return
	}
	var req struct {
		ConsentType string `json:"consentType"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.ConsentType == "" {
		jsonErr(w, 400, "consentType required")
		return
	}
	if !allowedConsentTypes[req.ConsentType] {
		jsonErr(w, 400, "invalid consent type")
		return
	}
	_ = a.recordUserConsent(r, claims.Sub, req.ConsentType, legalPDConsentVer, "withdraw", false)
	_, _ = a.db.Exec(a.ctx,
		`UPDATE user_consents SET withdrawn_at=NOW() WHERE user_id=$1 AND consent_type=$2 AND withdrawn_at IS NULL`,
		claims.Sub, req.ConsentType)
	jsonOK(w, map[string]interface{}{
		"withdrawn": true,
		"note":      "Данные, необходимые для исполнения договора и требований закона, могут сохраняться.",
	})
}

func (a *App) handleMyConsents(w http.ResponseWriter, r *http.Request) {
	claims, err := a.auth(r)
	if err != nil {
		jsonErr(w, 401, "unauthorized")
		return
	}
	rows, err := a.db.Query(a.ctx,
		`SELECT consent_type, document_version, granted, source, created_at, withdrawn_at
		 FROM user_consents WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100`, claims.Sub)
	if err != nil {
		jsonErr(w, 500, "query failed")
		return
	}
	defer rows.Close()
	type row struct {
		ConsentType     string  `json:"consentType"`
		DocumentVersion string  `json:"documentVersion"`
		Granted         bool    `json:"granted"`
		Source          string  `json:"source"`
		CreatedAt       string  `json:"createdAt"`
		WithdrawnAt     *string `json:"withdrawnAt,omitempty"`
	}
	var out []row
	for rows.Next() {
		var item row
		var created time.Time
		var withdrawn *time.Time
		if err := rows.Scan(&item.ConsentType, &item.DocumentVersion, &item.Granted, &item.Source, &created, &withdrawn); err != nil {
			continue
		}
		item.CreatedAt = created.Format(time.RFC3339)
		if withdrawn != nil {
			s := withdrawn.Format(time.RFC3339)
			item.WithdrawnAt = &s
		}
		out = append(out, item)
	}
	if out == nil {
		out = []row{}
	}
	jsonOK(w, map[string]interface{}{"consents": out})
}
