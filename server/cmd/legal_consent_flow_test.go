package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestRequirePersonalDataConsentOrPrior(t *testing.T) {
	app, cleanup := legalConsentApp(t)
	defer cleanup()

	token, userID := signupTestUserLegal(t, app, "prior-consent@example.com", "client")

	w := httptest.NewRecorder()
	falseVal := false
	if !app.requirePersonalDataConsentOrPrior(w, userID, &falseVal) {
		t.Fatal("expected prior consent to satisfy requirement")
	}

	_, _ = app.db.Exec(app.ctx, "UPDATE profiles SET privacy_version='old' WHERE id=$1", userID)

	w = httptest.NewRecorder()
	if app.requirePersonalDataConsentOrPrior(w, userID, &falseVal) {
		t.Fatal("expected missing consent when privacy version is outdated")
	}
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", w.Code)
	}

	_ = token
}

func TestHandleMeReturnsLegalConsentVersions(t *testing.T) {
	app, cleanup := legalConsentApp(t)
	defer cleanup()

	token, _ := signupTestUserLegal(t, app, "me-legal@example.com", "client")
	req := httptest.NewRequest(http.MethodGet, "/api/auth/me", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	app.handleMe(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d body=%s", w.Code, w.Body.String())
	}
	body := w.Body.String()
	if !containsIgnoreCase(body, legalPrivacyVersion) {
		t.Fatalf("expected privacy version in /api/auth/me response, got %s", body)
	}
	if !containsIgnoreCase(body, legalTermsVersion) {
		t.Fatalf("expected terms version in /api/auth/me response, got %s", body)
	}
}
