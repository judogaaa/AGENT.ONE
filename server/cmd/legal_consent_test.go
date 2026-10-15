package main

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func legalConsentApp(t *testing.T) (*App, func()) {
	t.Helper()
	pool := dualCookieDB(t)
	ctx := context.Background()
	if err := ensureLegalConsentSchema(ctx, pool); err != nil {
		t.Fatalf("legal schema: %v", err)
	}
	app := signupApp(pool)
	app.ctx = ctx
	return app, func() { pool.Close() }
}

func TestLegalMetaEndpoint(t *testing.T) {
	app, cleanup := legalConsentApp(t)
	defer cleanup()

	req := httptest.NewRequest(http.MethodGet, "/api/legal/meta", nil)
	w := httptest.NewRecorder()
	app.handleLegalMeta(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d", w.Code)
	}
	var resp struct {
		OK   bool `json:"ok"`
		Data struct {
			MarketingConsentPage bool `json:"marketingConsentPage"`
			Pages                []map[string]string
		} `json:"data"`
	}
	json.Unmarshal(w.Body.Bytes(), &resp)
	if !resp.OK {
		t.Fatal("expected ok")
	}
	if resp.Data.MarketingConsentPage {
		t.Error("marketing page should be false")
	}
	if len(resp.Data.Pages) < 8 {
		t.Errorf("pages = %d, want >= 8", len(resp.Data.Pages))
	}
}

func TestSignupRequiresPDConsent(t *testing.T) {
	app, cleanup := legalConsentApp(t)
	defer cleanup()

	w := doEmailSignup(t, app, `{"email":"pdtest@example.com","password":"123456","displayName":"X","role":"client","terms_accepted":true}`)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d without pd_consent, want 400", w.Code)
	}
}

func TestSignupRecordsConsentVersions(t *testing.T) {
	app, cleanup := legalConsentApp(t)
	defer cleanup()

	email := "pdconsent@example.com"
	w := doEmailSignup(t, app, `{"email":"`+email+`","password":"123456","displayName":"X","role":"client","terms_accepted":true,"pd_consent":true,"consent_source":"signup_email"}`)
	if w.Code != http.StatusOK {
		t.Fatalf("signup status = %d body=%s", w.Code, w.Body.String())
	}

	var userID string
	err := app.db.QueryRow(app.ctx, "SELECT id FROM profiles WHERE email=$1", email).Scan(&userID)
	if err != nil {
		t.Fatal(err)
	}
	var count int
	app.db.QueryRow(app.ctx, "SELECT COUNT(*) FROM user_consents WHERE user_id=$1 AND consent_type='personal_data' AND document_version=$2", userID, legalPDConsentVer).Scan(&count)
	if count < 1 {
		t.Error("personal_data consent not recorded")
	}
}

func TestWithdrawConsentPreservesContractNote(t *testing.T) {
	app, cleanup := legalConsentApp(t)
	defer cleanup()

	token, userID := signupTestUserLegal(t, app, "withdraw@example.com", "client")
	req := httptest.NewRequest(http.MethodPost, "/api/legal/consents/withdraw", bytes.NewBufferString(`{"consentType":"marketing"}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	app.handleWithdrawConsent(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d", w.Code)
	}
	var profileExists bool
	app.db.QueryRow(app.ctx, "SELECT EXISTS(SELECT 1 FROM profiles WHERE id=$1)", userID).Scan(&profileExists)
	if !profileExists {
		t.Error("profile deleted after withdraw — must remain for contract/legal retention")
	}
}

func TestAuthProvidersNoTelegram(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/auth/providers", nil)
	w := httptest.NewRecorder()
	yandexProvidersHandler(w, req)
	body := w.Body.String()
	if containsIgnoreCase(body, "telegram") {
		t.Error("telegram must not appear in providers response")
	}
}

func containsIgnoreCase(s, sub string) bool {
	return bytes.Contains(bytes.ToLower([]byte(s)), bytes.ToLower([]byte(sub)))
}

func signupTestUserLegal(t *testing.T, app *App, email, role string) (token, userID string) {
	t.Helper()
	w := doEmailSignup(t, app, `{"email":"`+email+`","password":"123456","displayName":"X","role":"`+role+`","terms_accepted":true,"pd_consent":true}`)
	if w.Code != http.StatusOK {
		t.Fatalf("signup failed: %d %s", w.Code, w.Body.String())
	}
	var resp struct {
		Data struct {
			Token   string `json:"token"`
			Profile struct {
				ID string `json:"id"`
			} `json:"profile"`
		} `json:"data"`
	}
	json.Unmarshal(w.Body.Bytes(), &resp)
	return resp.Data.Token, resp.Data.Profile.ID
}
