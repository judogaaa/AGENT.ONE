package main

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"regexp"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Organization is the account-level legal entity data for a business user.
// Owned by the profile (user_id) — one organization per account.
type Organization struct {
	ID                     string `json:"id"`
	UserID                 string `json:"-"`
	LegalType              string `json:"legalType"`
	LegalName              string `json:"legalName,omitempty"`
	ShortName              string `json:"shortName,omitempty"`
	DisplayName            string `json:"displayName,omitempty"`
	FullName               string `json:"fullName,omitempty"`
	Inn                    string `json:"inn,omitempty"`
	Kpp                    string `json:"kpp,omitempty"`
	Ogrn                   string `json:"ogrn,omitempty"`
	Ogrnip                 string `json:"ogrnip,omitempty"`
	RegistrationAddress    string `json:"registrationAddress,omitempty"`
	LegalAddress           string `json:"legalAddress,omitempty"`
	Region                 string `json:"region,omitempty"`
	RepresentativeFullName string `json:"representativeFullName,omitempty"`
	RepresentativePosition string `json:"representativePosition,omitempty"`
	ContactPhone           string `json:"contactPhone,omitempty"`
	ContactEmail           string `json:"contactEmail,omitempty"`
	AuthorityConfirmedAt   string `json:"-"`
	OnboardingStatus       string `json:"-"`
	OnboardingCompletedAt  string `json:"-"`
	CreatedAt              string `json:"-"`
	UpdatedAt              string `json:"-"`
}

// validLegalTypes is the closed set of accepted organizational-legal forms.
var validLegalTypes = map[string]bool{
	legalTypeSelfEmployed:           true,
	legalTypeIndividualEntrepreneur: true,
	legalTypeLegalEntity:            true,
}

// digitOnly matches strings containing digits only.
var digitOnly = regexp.MustCompile(`^[0-9]+$`)

// onboardingStatusFor returns the onboarding status and legal type for a
// user. Accounts without an organization row are treated as "required".
// Client accounts always return an empty status — onboarding is not
// applicable to them.
func onboardingStatusFor(ctx context.Context, db *pgxpool.Pool, userID, role string) (status, legalType string) {
	if role != "business" {
		return "", ""
	}
	var st, lt string
	err := db.QueryRow(ctx, "SELECT COALESCE(onboarding_status,'required'), COALESCE(legal_type,'') FROM organizations WHERE user_id=$1", userID).Scan(&st, &lt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return onboardingRequired, ""
		}
		// DB error: fail safe — treat as not completed so access is not
		// granted without a known onboarding state.
		return onboardingRequired, ""
	}
	return st, lt
}

// attachOnboardingToProfile adds the onboarding block to a profile payload
// for business accounts. Client accounts get no onboarding field.
func attachOnboardingToProfile(ctx context.Context, db *pgxpool.Pool, profile map[string]interface{}, userID, role string) {
	if role != "business" {
		return
	}
	status, legalType := onboardingStatusFor(ctx, db, userID, role)
	profile["onboarding"] = map[string]interface{}{
		"status":    status,
		"legalType": legalType,
	}
}

func (a *App) handleGetBusinessOnboarding(w http.ResponseWriter, r *http.Request) {
	claims, err := a.auth(r)
	if err != nil {
		jsonErr(w, 401, "unauthorized")
		return
	}
	if claims.Role != "business" {
		jsonErr(w, 403, "business only")
		return
	}

	ctx := r.Context()
	var org Organization
	err = a.db.QueryRow(ctx, "SELECT id, user_id, COALESCE(legal_type,''), COALESCE(legal_name,''), COALESCE(short_name,''), COALESCE(display_name,''), COALESCE(full_name,''), COALESCE(inn,''), COALESCE(kpp,''), COALESCE(ogrn,''), COALESCE(ogrnip,''), COALESCE(registration_address,''), COALESCE(legal_address,''), COALESCE(region,''), COALESCE(representative_full_name,''), COALESCE(representative_position,''), COALESCE(contact_phone,''), COALESCE(contact_email,''), COALESCE(authority_confirmed_at::text,''), COALESCE(onboarding_status,'required'), COALESCE(onboarding_completed_at::text,''), COALESCE(created_at::text,''), COALESCE(updated_at::text,'') FROM organizations WHERE user_id=$1", claims.Sub).
		Scan(&org.ID, &org.UserID, &org.LegalType, &org.LegalName, &org.ShortName, &org.DisplayName, &org.FullName, &org.Inn, &org.Kpp, &org.Ogrn, &org.Ogrnip, &org.RegistrationAddress, &org.LegalAddress, &org.Region, &org.RepresentativeFullName, &org.RepresentativePosition, &org.ContactPhone, &org.ContactEmail, &org.AuthorityConfirmedAt, &org.OnboardingStatus, &org.OnboardingCompletedAt, &org.CreatedAt, &org.UpdatedAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			jsonOK(w, map[string]interface{}{
				"onboarding":   map[string]interface{}{"status": onboardingRequired, "legalType": ""},
				"organization": nil,
			})
			return
		}
		jsonErr(w, 500, "internal error")
		return
	}
	jsonOK(w, map[string]interface{}{
		"onboarding":   map[string]interface{}{"status": org.OnboardingStatus, "legalType": org.LegalType},
		"organization": org,
	})
}

// onboardingRequest is the payload of POST /api/business/onboarding.
// Only the fields listed here are accepted; anything else is ignored.
type onboardingRequest struct {
	LegalType string `json:"legalType"`
	// self_employed + individual_entrepreneur
	FullName    string `json:"fullName"`
	DisplayName string `json:"displayName"`
	// self_employed
	Region string `json:"region"`
	// individual_entrepreneur
	Ogrnip              string `json:"ogrnip"`
	RegistrationAddress string `json:"registrationAddress"`
	// legal_entity
	LegalName              string `json:"legalName"`
	ShortName              string `json:"shortName"`
	Kpp                    string `json:"kpp"`
	Ogrn                   string `json:"ogrn"`
	LegalAddress           string `json:"legalAddress"`
	RepresentativeFullName string `json:"representativeFullName"`
	RepresentativePosition string `json:"representativePosition"`
	// common
	Inn                string `json:"inn"`
	ContactPhone       string `json:"contactPhone"`
	ContactEmail       string `json:"contactEmail"`
	AuthorityConfirmed *bool  `json:"authority_confirmed"`
	PDConsent          *bool  `json:"pd_consent"`
	ConsentSource      string `json:"consent_source"`
}

// validateOnboarding validates all fields server-side. The frontend
// validation is never trusted.
func validateOnboarding(req *onboardingRequest) (string, bool) {
	trim := func(s string) string { return strings.TrimSpace(s) }
	req.LegalType = trim(req.LegalType)
	req.FullName = trim(req.FullName)
	req.DisplayName = trim(req.DisplayName)
	req.Region = trim(req.Region)
	req.Ogrnip = trim(req.Ogrnip)
	req.RegistrationAddress = trim(req.RegistrationAddress)
	req.LegalName = trim(req.LegalName)
	req.ShortName = trim(req.ShortName)
	req.Kpp = trim(req.Kpp)
	req.Ogrn = trim(req.Ogrn)
	req.LegalAddress = trim(req.LegalAddress)
	req.RepresentativeFullName = trim(req.RepresentativeFullName)
	req.RepresentativePosition = trim(req.RepresentativePosition)
	req.Inn = trim(req.Inn)
	req.ContactPhone = trim(req.ContactPhone)
	req.ContactEmail = trim(req.ContactEmail)

	if !validLegalTypes[req.LegalType] {
		return "invalid legal type; must be one of self_employed, individual_entrepreneur, legal_entity", false
	}
	if req.AuthorityConfirmed == nil || !*req.AuthorityConfirmed {
		return "authority confirmation required", false
	}
	if req.ContactPhone == "" || req.ContactEmail == "" {
		return "contactPhone and contactEmail required", false
	}
	if !isDigitsOnly(req.Inn) {
		return "inn must contain digits only", false
	}

	switch req.LegalType {
	case legalTypeSelfEmployed:
		if req.FullName == "" || req.Region == "" || req.DisplayName == "" {
			return "fullName, region and displayName are required", false
		}
		if len(req.Inn) != 12 {
			return "self-employed inn must be 12 digits", false
		}
	case legalTypeIndividualEntrepreneur:
		if req.FullName == "" || req.DisplayName == "" || req.RegistrationAddress == "" {
			return "fullName, displayName and registrationAddress are required", false
		}
		if len(req.Inn) != 12 {
			return "individual entrepreneur inn must be 12 digits", false
		}
		if !isDigitsOnly(req.Ogrnip) || len(req.Ogrnip) != 15 {
			return "ogrnip must be 15 digits", false
		}
	case legalTypeLegalEntity:
		if req.LegalName == "" || req.ShortName == "" || req.LegalAddress == "" ||
			req.RepresentativeFullName == "" || req.RepresentativePosition == "" {
			return "legalName, shortName, legalAddress, representativeFullName and representativePosition are required", false
		}
		if len(req.Inn) != 10 {
			return "legal entity inn must be 10 digits", false
		}
		if !isDigitsOnly(req.Kpp) || len(req.Kpp) != 9 {
			return "kpp must be 9 digits", false
		}
		if !isDigitsOnly(req.Ogrn) || len(req.Ogrn) != 13 {
			return "ogrn must be 13 digits", false
		}
	}
	return "", true
}

func isDigitsOnly(s string) bool {
	if s == "" || len(s) > 32 {
		return false
	}
	return digitOnly.MatchString(s)
}

func (a *App) handlePostBusinessOnboarding(w http.ResponseWriter, r *http.Request) {
	claims, err := a.auth(r)
	if err != nil {
		jsonErr(w, 401, "unauthorized")
		return
	}
	if claims.Role != "business" {
		jsonErr(w, 403, "business only")
		return
	}

	// Strict body parsing: exactly one JSON object, no trailing data.
	dec := json.NewDecoder(r.Body)
	var req onboardingRequest
	if err := dec.Decode(&req); err != nil {
		jsonErr(w, 400, "invalid request body")
		return
	}
	if err := dec.Decode(&struct{}{}); err != io.EOF {
		jsonErr(w, 400, "invalid request body")
		return
	}

	// Server-side validation — never trust the frontend.
	msg, ok := validateOnboarding(&req)
	if !ok {
		jsonErr(w, 400, msg)
		return
	}
	if !requirePersonalDataConsent(w, req.PDConsent) {
		return
	}

	ctx := r.Context()
	tx, err := a.db.Begin(ctx)
	if err != nil {
		jsonErr(w, 500, "internal error")
		return
	}
	defer tx.Rollback(ctx)

	// Upsert by user_id: repeated requests update the same organization,
	// duplicates are impossible, and only the caller's own row can be
	// touched (the WHERE is the user_id itself).
	orgID := newID()
	_, err = tx.Exec(ctx, `
		INSERT INTO organizations (
			id, user_id, legal_type, legal_name, short_name, display_name,
			full_name, inn, kpp, ogrn, ogrnip, registration_address,
			legal_address, region, representative_full_name,
			representative_position, contact_phone, contact_email,
			authority_confirmed_at, onboarding_status, onboarding_completed_at, updated_at
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,NOW(),'pending_review',NOW(),NOW())
		ON CONFLICT (user_id) DO UPDATE SET
			legal_type = EXCLUDED.legal_type,
			legal_name = EXCLUDED.legal_name,
			short_name = EXCLUDED.short_name,
			display_name = EXCLUDED.display_name,
			full_name = EXCLUDED.full_name,
			inn = EXCLUDED.inn,
			kpp = EXCLUDED.kpp,
			ogrn = EXCLUDED.ogrn,
			ogrnip = EXCLUDED.ogrnip,
			registration_address = EXCLUDED.registration_address,
			legal_address = EXCLUDED.legal_address,
			region = EXCLUDED.region,
			representative_full_name = EXCLUDED.representative_full_name,
			representative_position = EXCLUDED.representative_position,
			contact_phone = EXCLUDED.contact_phone,
			contact_email = EXCLUDED.contact_email,
			authority_confirmed_at = EXCLUDED.authority_confirmed_at,
			onboarding_status = 'pending_review',
			onboarding_completed_at = COALESCE(organizations.onboarding_completed_at, EXCLUDED.onboarding_completed_at),
			updated_at = NOW()`,
		orgID, claims.Sub, req.LegalType, req.LegalName, req.ShortName, req.DisplayName,
		req.FullName, req.Inn, req.Kpp, req.Ogrn, req.Ogrnip, req.RegistrationAddress,
		req.LegalAddress, req.Region, req.RepresentativeFullName,
		req.RepresentativePosition, req.ContactPhone, req.ContactEmail)
	if err != nil {
		jsonErr(w, 500, "internal error")
		return
	}

	if err := tx.Commit(ctx); err != nil {
		jsonErr(w, 500, "internal error")
		return
	}

	// Audit: never log personal or requisite data — legal type only.
	a.recordAuditEvent(r, claims.Sub, claims.Role, "business.onboarding.submitted", "organization", orgID, "", map[string]interface{}{
		"legalType": req.LegalType,
	})
	src := strings.TrimSpace(req.ConsentSource)
	if src == "" {
		src = "business_onboarding"
	}
	_ = a.recordUserConsent(r, claims.Sub, "personal_data", legalPDConsentVer, src, true)

	jsonOK(w, map[string]interface{}{
		"onboarding": map[string]interface{}{
			"status":    onboardingPendingReview,
			"legalType": req.LegalType,
		},
		"organization": map[string]interface{}{
			"id":                     orgID,
			"legalType":              req.LegalType,
			"legalName":              req.LegalName,
			"shortName":              req.ShortName,
			"displayName":            req.DisplayName,
			"fullName":               req.FullName,
			"inn":                    req.Inn,
			"kpp":                    req.Kpp,
			"ogrn":                   req.Ogrn,
			"ogrnip":                 req.Ogrnip,
			"registrationAddress":    req.RegistrationAddress,
			"legalAddress":           req.LegalAddress,
			"region":                 req.Region,
			"representativeFullName": req.RepresentativeFullName,
			"representativePosition": req.RepresentativePosition,
			"contactPhone":           req.ContactPhone,
			"contactEmail":           req.ContactEmail,
		},
	})
}
