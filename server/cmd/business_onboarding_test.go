package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

// ── Helpers ──

// createOnboardingProfile inserts a profile directly (bypassing signup)
// and returns its ID.
func createOnboardingProfile(t *testing.T, pool *pgxpool.Pool, role string) (string, string) {
	t.Helper()
	ctx := context.Background()
	userID := "test_ob_" + newSecureID()[:16]
	email := userID + "@example.com"
	_, err := pool.Exec(ctx,
		"INSERT INTO profiles (id, role, display_name, email) VALUES ($1,$2,$3,$4)",
		userID, role, "Onboarding Test", email)
	if err != nil {
		t.Fatalf("insert profile: %v", err)
	}
	t.Cleanup(func() {
		pool.Exec(ctx, "DELETE FROM organizations WHERE user_id=$1", userID)
		pool.Exec(ctx, "DELETE FROM auth_sessions WHERE user_id=$1", userID)
		pool.Exec(ctx, "DELETE FROM auth_identities WHERE user_id=$1", userID)
		pool.Exec(ctx, "DELETE FROM profiles WHERE id=$1", userID)
	})
	return userID, email
}

// onboardingToken issues a valid access token for the given user.
func onboardingToken(app *App, userID, role string) string {
	token, _ := makeJWTWithTTL(userID, role, app.jwtKey, 60)
	return token
}

func doOnboardingPost(t *testing.T, app *App, token, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest("POST", "/api/business/onboarding", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	w := httptest.NewRecorder()
	app.handlePostBusinessOnboarding(w, req)
	return w
}

func doOnboardingGet(t *testing.T, app *App, token string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest("GET", "/api/business/onboarding", nil)
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	w := httptest.NewRecorder()
	app.handleGetBusinessOnboarding(w, req)
	return w
}

func onboardingError(t *testing.T, w *httptest.ResponseRecorder) string {
	t.Helper()
	var body struct {
		Error string `json:"error"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &body)
	return body.Error
}

func countOrganizationsFor(t *testing.T, pool *pgxpool.Pool, userID string) int {
	t.Helper()
	var n int
	err := pool.QueryRow(context.Background(), "SELECT COUNT(*) FROM organizations WHERE user_id=$1", userID).Scan(&n)
	if err != nil {
		t.Fatalf("count organizations: %v", err)
	}
	return n
}

// selfEmployedBody builds a valid self_employed payload.
func selfEmployedBody(inn string) string {
	return `{"legalType":"self_employed","fullName":"Иван Иванов","inn":"` + inn + `","region":"Москва","displayName":"Магазин Ивана","contactPhone":"+79990001122","contactEmail":"ivan@example.com","authority_confirmed":true}`
}

func individualEntrepreneurBody(inn, ogrnip string) string {
	return `{"legalType":"individual_entrepreneur","fullName":"Пётр Петров","inn":"` + inn + `","ogrnip":"` + ogrnip + `","displayName":"Петров и Ко","registrationAddress":"Москва, ул. Ленина, 1","contactPhone":"+79990001122","contactEmail":"petr@example.com","authority_confirmed":true}`
}

func legalEntityBody(inn, kpp, ogrn string) string {
	return `{"legalType":"legal_entity","legalName":"ООО Ромашка","shortName":"Ромашка","inn":"` + inn + `","kpp":"` + kpp + `","ogrn":"` + ogrn + `","legalAddress":"Москва, ул. Пушкина, 2","representativeFullName":"Иван Иванов","representativePosition":"Генеральный директор","contactPhone":"+79990001122","contactEmail":"info@example.com","authority_confirmed":true}`
}

// fetchOrgRow returns the stored org row fields for the user.
func fetchOrgRow(t *testing.T, pool *pgxpool.Pool, userID string) (legalType, inn, status string, confirmedAtIsSet, completedAtIsSet bool) {
	t.Helper()
	err := pool.QueryRow(context.Background(),
		"SELECT COALESCE(legal_type,''), COALESCE(inn,''), COALESCE(onboarding_status,'required'), authority_confirmed_at IS NOT NULL, onboarding_completed_at IS NOT NULL FROM organizations WHERE user_id=$1",
		userID).Scan(&legalType, &inn, &status, &confirmedAtIsSet, &completedAtIsSet)
	if err != nil {
		t.Fatalf("fetch org row: %v", err)
	}
	return
}

// ── 1. Client role rejected ──

func TestOnboarding_ClientRoleRejected(t *testing.T) {
	skipIfNoDB(t)
	pool := getTestDB(t)
	app := signupApp(pool)
	userID, _ := createOnboardingProfile(t, pool, "client")
	token := onboardingToken(app, userID, "client")

	w := doOnboardingPost(t, app, token, selfEmployedBody("123456789012"))
	if w.Code != http.StatusForbidden {
		t.Fatalf("POST: expected 403, got %d", w.Code)
	}
	if got := onboardingError(t, w); got != "business only" {
		t.Errorf("error = %q", got)
	}
	if n := countOrganizationsFor(t, pool, userID); n != 0 {
		t.Errorf("expected 0 organizations, got %d", n)
	}

	w2 := doOnboardingGet(t, app, token)
	if w2.Code != http.StatusForbidden {
		t.Fatalf("GET: expected 403, got %d", w2.Code)
	}
}

// ── 2. Unauthenticated rejected ──

func TestOnboarding_UnauthenticatedRejected(t *testing.T) {
	skipIfNoDB(t)
	pool := getTestDB(t)
	app := signupApp(pool)

	w := doOnboardingPost(t, app, "", selfEmployedBody("123456789012"))
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("POST: expected 401, got %d", w.Code)
	}
	w2 := doOnboardingGet(t, app, "")
	if w2.Code != http.StatusUnauthorized {
		t.Fatalf("GET: expected 401, got %d", w2.Code)
	}
}

// ── 3. Unknown legal_type rejected ──

func TestOnboarding_UnknownLegalTypeRejected(t *testing.T) {
	skipIfNoDB(t)
	pool := getTestDB(t)
	app := signupApp(pool)
	userID, _ := createOnboardingProfile(t, pool, "business")
	token := onboardingToken(app, userID, "business")

	body := `{"legalType":"zakrytoe_ao","fullName":"Иван","inn":"123456789012","region":"Москва","displayName":"X","contactPhone":"+7","contactEmail":"a@b.ru","authority_confirmed":true}`
	w := doOnboardingPost(t, app, token, body)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
	if got := onboardingError(t, w); got != "invalid legal type; must be one of self_employed, individual_entrepreneur, legal_entity" {
		t.Errorf("error = %q", got)
	}
	if n := countOrganizationsFor(t, pool, userID); n != 0 {
		t.Errorf("expected 0 organizations, got %d", n)
	}
}

// ── 4-6. Valid submissions per legal type ──

func TestOnboarding_SelfEmployedSaved(t *testing.T) {
	skipIfNoDB(t)
	pool := getTestDB(t)
	app := signupApp(pool)
	userID, _ := createOnboardingProfile(t, pool, "business")
	token := onboardingToken(app, userID, "business")

	w := doOnboardingPost(t, app, token, selfEmployedBody("123456789012"))
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	legalType, inn, status, confirmedSet, completedSet := fetchOrgRow(t, pool, userID)
	if legalType != legalTypeSelfEmployed || inn != "123456789012" {
		t.Errorf("row = %q/%q, want self_employed/123456789012", legalType, inn)
	}
	if status != onboardingPendingReview {
		t.Errorf("status = %q, want pending_review", status)
	}
	if !confirmedSet || !completedSet {
		t.Errorf("authority_confirmed_at set=%v, onboarding_completed_at set=%v, want both", confirmedSet, completedSet)
	}
}

func TestOnboarding_IndividualEntrepreneurSaved(t *testing.T) {
	skipIfNoDB(t)
	pool := getTestDB(t)
	app := signupApp(pool)
	userID, _ := createOnboardingProfile(t, pool, "business")
	token := onboardingToken(app, userID, "business")

	w := doOnboardingPost(t, app, token, individualEntrepreneurBody("987654321098", "312345678901234"))
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	legalType, inn, status, _, _ := fetchOrgRow(t, pool, userID)
	if legalType != legalTypeIndividualEntrepreneur || inn != "987654321098" {
		t.Errorf("row = %q/%q, want individual_entrepreneur/987654321098", legalType, inn)
	}
	if status != onboardingPendingReview {
		t.Errorf("status = %q, want pending_review", status)
	}
	var ogrnip string
	pool.QueryRow(context.Background(), "SELECT COALESCE(ogrnip,'') FROM organizations WHERE user_id=$1", userID).Scan(&ogrnip)
	if ogrnip != "312345678901234" {
		t.Errorf("ogrnip = %q", ogrnip)
	}
}

func TestOnboarding_LegalEntitySaved(t *testing.T) {
	skipIfNoDB(t)
	pool := getTestDB(t)
	app := signupApp(pool)
	userID, _ := createOnboardingProfile(t, pool, "business")
	token := onboardingToken(app, userID, "business")

	w := doOnboardingPost(t, app, token, legalEntityBody("7701234567", "770101001", "1027700132195"))
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	legalType, inn, status, _, _ := fetchOrgRow(t, pool, userID)
	if legalType != legalTypeLegalEntity || inn != "7701234567" {
		t.Errorf("row = %q/%q, want legal_entity/7701234567", legalType, inn)
	}
	if status != onboardingPendingReview {
		t.Errorf("status = %q, want pending_review", status)
	}
	var kpp, ogrn string
	pool.QueryRow(context.Background(), "SELECT COALESCE(kpp,''), COALESCE(ogrn,'') FROM organizations WHERE user_id=$1", userID).Scan(&kpp, &ogrn)
	if kpp != "770101001" || ogrn != "1027700132195" {
		t.Errorf("kpp/ogrn = %q/%q", kpp, ogrn)
	}
}

// ── 7-10. Invalid identifiers rejected ──

func TestOnboarding_InvalidInnLengthRejected(t *testing.T) {
	skipIfNoDB(t)
	pool := getTestDB(t)
	app := signupApp(pool)

	cases := []struct {
		name    string
		body    string
		wantErr string
	}{
		{"self_employed 10 digits", selfEmployedBody("1234567890"), "self-employed inn must be 12 digits"},
		{"self_employed 13 digits", selfEmployedBody("1234567890123"), "self-employed inn must be 12 digits"},
		{"ip 10 digits", individualEntrepreneurBody("1234567890", "312345678901234"), "individual entrepreneur inn must be 12 digits"},
		{"legal_entity 12 digits", legalEntityBody("123456789012", "770101001", "1027700132195"), "legal entity inn must be 10 digits"},
		{"non digits", selfEmployedBody("12345678901a"), "inn must contain digits only"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			userID, _ := createOnboardingProfile(t, pool, "business")
			token := onboardingToken(app, userID, "business")
			w := doOnboardingPost(t, app, token, tc.body)
			if w.Code != http.StatusBadRequest {
				t.Fatalf("expected 400, got %d", w.Code)
			}
			if got := onboardingError(t, w); got != tc.wantErr {
				t.Errorf("error = %q, want %q", got, tc.wantErr)
			}
			if n := countOrganizationsFor(t, pool, userID); n != 0 {
				t.Errorf("expected 0 organizations, got %d", n)
			}
		})
	}
}

func TestOnboarding_InvalidOgrnipRejected(t *testing.T) {
	skipIfNoDB(t)
	pool := getTestDB(t)
	app := signupApp(pool)

	cases := []struct {
		name    string
		ogrnip  string
		wantErr string
	}{
		{"14 digits", "31234567890123", "ogrnip must be 15 digits"},
		{"16 digits", "3123456789012345", "ogrnip must be 15 digits"},
		{"non digits", "31234567890123a", "ogrnip must be 15 digits"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			userID, _ := createOnboardingProfile(t, pool, "business")
			token := onboardingToken(app, userID, "business")
			w := doOnboardingPost(t, app, token, individualEntrepreneurBody("987654321098", tc.ogrnip))
			if w.Code != http.StatusBadRequest {
				t.Fatalf("expected 400, got %d", w.Code)
			}
			if got := onboardingError(t, w); got != tc.wantErr {
				t.Errorf("error = %q, want %q", got, tc.wantErr)
			}
			if n := countOrganizationsFor(t, pool, userID); n != 0 {
				t.Errorf("expected 0 organizations, got %d", n)
			}
		})
	}
}

func TestOnboarding_InvalidOgrnRejected(t *testing.T) {
	skipIfNoDB(t)
	pool := getTestDB(t)
	app := signupApp(pool)

	cases := []struct {
		name    string
		ogrn    string
		wantErr string
	}{
		{"12 digits", "102770013219", "ogrn must be 13 digits"},
		{"14 digits", "10277001321950", "ogrn must be 13 digits"},
		{"non digits", "102770013219a", "ogrn must be 13 digits"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			userID, _ := createOnboardingProfile(t, pool, "business")
			token := onboardingToken(app, userID, "business")
			w := doOnboardingPost(t, app, token, legalEntityBody("7701234567", "770101001", tc.ogrn))
			if w.Code != http.StatusBadRequest {
				t.Fatalf("expected 400, got %d", w.Code)
			}
			if got := onboardingError(t, w); got != tc.wantErr {
				t.Errorf("error = %q, want %q", got, tc.wantErr)
			}
			if n := countOrganizationsFor(t, pool, userID); n != 0 {
				t.Errorf("expected 0 organizations, got %d", n)
			}
		})
	}
}

func TestOnboarding_InvalidKppRejected(t *testing.T) {
	skipIfNoDB(t)
	pool := getTestDB(t)
	app := signupApp(pool)

	cases := []struct {
		name    string
		kpp     string
		wantErr string
	}{
		{"8 digits", "77010100", "kpp must be 9 digits"},
		{"10 digits", "7701010012", "kpp must be 9 digits"},
		{"non digits", "77010100a", "kpp must be 9 digits"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			userID, _ := createOnboardingProfile(t, pool, "business")
			token := onboardingToken(app, userID, "business")
			w := doOnboardingPost(t, app, token, legalEntityBody("7701234567", tc.kpp, "1027700132195"))
			if w.Code != http.StatusBadRequest {
				t.Fatalf("expected 400, got %d", w.Code)
			}
			if got := onboardingError(t, w); got != tc.wantErr {
				t.Errorf("error = %q, want %q", got, tc.wantErr)
			}
			if n := countOrganizationsFor(t, pool, userID); n != 0 {
				t.Errorf("expected 0 organizations, got %d", n)
			}
		})
	}
}

// ── 11-12. authority_confirmed must be boolean true ──

func TestOnboarding_AuthorityFalseRejected(t *testing.T) {
	skipIfNoDB(t)
	pool := getTestDB(t)
	app := signupApp(pool)
	userID, _ := createOnboardingProfile(t, pool, "business")
	token := onboardingToken(app, userID, "business")

	body := `{"legalType":"self_employed","fullName":"Иван","inn":"123456789012","region":"Москва","displayName":"X","contactPhone":"+7","contactEmail":"a@b.ru","authority_confirmed":false}`
	w := doOnboardingPost(t, app, token, body)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
	if got := onboardingError(t, w); got != "authority confirmation required" {
		t.Errorf("error = %q", got)
	}
	if n := countOrganizationsFor(t, pool, userID); n != 0 {
		t.Errorf("expected 0 organizations, got %d", n)
	}
}

func TestOnboarding_AuthorityStringRejected(t *testing.T) {
	skipIfNoDB(t)
	pool := getTestDB(t)
	app := signupApp(pool)

	for _, val := range []string{"true", "1", "yes"} {
		t.Run(val, func(t *testing.T) {
			userID, _ := createOnboardingProfile(t, pool, "business")
			token := onboardingToken(app, userID, "business")
			body := `{"legalType":"self_employed","fullName":"Иван","inn":"123456789012","region":"Москва","displayName":"X","contactPhone":"+7","contactEmail":"a@b.ru","authority_confirmed":"` + val + `"}`
			w := doOnboardingPost(t, app, token, body)
			if w.Code != http.StatusBadRequest {
				t.Fatalf("expected 400, got %d", w.Code)
			}
			if got := onboardingError(t, w); got != "invalid request body" {
				t.Errorf("error = %q, want %q", got, "invalid request body")
			}
			if n := countOrganizationsFor(t, pool, userID); n != 0 {
				t.Errorf("expected 0 organizations, got %d", n)
			}
		})
	}
}

// ── 13-14. Malformed JSON and trailing data rejected ──

func TestOnboarding_MalformedJSONRejected(t *testing.T) {
	skipIfNoDB(t)
	pool := getTestDB(t)
	app := signupApp(pool)

	cases := []struct {
		name string
		body string
	}{
		{"truncated object", `{"legalType":"self_employed","fullName":"Иван"`},
		{"empty body", ``},
		{"array instead of object", `[{"legalType":"self_employed"}]`},
		{"trailing garbage", selfEmployedBody("123456789012") + ` trailing`},
		{"trailing null", selfEmployedBody("123456789012") + ` null`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			userID, _ := createOnboardingProfile(t, pool, "business")
			token := onboardingToken(app, userID, "business")
			w := doOnboardingPost(t, app, token, tc.body)
			if w.Code != http.StatusBadRequest {
				t.Fatalf("expected 400, got %d", w.Code)
			}
			if got := onboardingError(t, w); got != "invalid request body" {
				t.Errorf("error = %q, want %q", got, "invalid request body")
			}
			if n := countOrganizationsFor(t, pool, userID); n != 0 {
				t.Errorf("expected 0 organizations, got %d", n)
			}
		})
	}
}

func TestOnboarding_SecondJSONObjectRejected(t *testing.T) {
	skipIfNoDB(t)
	pool := getTestDB(t)
	app := signupApp(pool)
	userID, _ := createOnboardingProfile(t, pool, "business")
	token := onboardingToken(app, userID, "business")

	body := selfEmployedBody("123456789012") + `{"legalType":"legal_entity"}`
	w := doOnboardingPost(t, app, token, body)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
	if got := onboardingError(t, w); got != "invalid request body" {
		t.Errorf("error = %q, want %q", got, "invalid request body")
	}
	if n := countOrganizationsFor(t, pool, userID); n != 0 {
		t.Errorf("expected 0 organizations, got %d", n)
	}
}

// ── 15. Errors leave no partial organization ──

func TestOnboarding_ErrorLeavesNoPartialOrganization(t *testing.T) {
	skipIfNoDB(t)
	pool := getTestDB(t)
	app := signupApp(pool)

	bodies := []string{
		`{"legalType":"self_employed","fullName":"Иван","inn":"123456789012","region":"Москва","displayName":"X","contactPhone":"+7","contactEmail":"a@b.ru","authority_confirmed":false}`,
		`{"legalType":"self_employed","fullName":"Иван","inn":"123456789012","region":"Москва","displayName":"X","contactPhone":"+7","contactEmail":"a@b.ru","authority_confirmed":"true"}`,
		`{"legalType":"nope","fullName":"Иван","inn":"123456789012","region":"Москва","displayName":"X","contactPhone":"+7","contactEmail":"a@b.ru","authority_confirmed":true}`,
		`{"legalType":"self_employed","fullName":"Иван","inn":"123456789012","region":"Москва","displayName":"X","contactPhone":"+7","contactEmail":"a@b.ru","authority_confirmed":true`,
		`{"legalType":"legal_entity","legalName":"ООО X","shortName":"X","inn":"7701234567","kpp":"770101001","ogrn":"102770013219","legalAddress":"Москва","representativeFullName":"Иван","representativePosition":"Директор","contactPhone":"+7","contactEmail":"a@b.ru","authority_confirmed":true}`,
	}
	for i, body := range bodies {
		userID, _ := createOnboardingProfile(t, pool, "business")
		token := onboardingToken(app, userID, "business")
		w := doOnboardingPost(t, app, token, body)
		if w.Code != http.StatusBadRequest {
			t.Fatalf("case %d: expected 400, got %d", i, w.Code)
		}
		if n := countOrganizationsFor(t, pool, userID); n != 0 {
			t.Errorf("case %d: partial organization created", i)
		}
	}
}

// ── 16. Repeated request does not duplicate ──

func TestOnboarding_RepeatedRequestNoDuplicate(t *testing.T) {
	skipIfNoDB(t)
	pool := getTestDB(t)
	app := signupApp(pool)
	userID, _ := createOnboardingProfile(t, pool, "business")
	token := onboardingToken(app, userID, "business")

	w1 := doOnboardingPost(t, app, token, selfEmployedBody("123456789012"))
	if w1.Code != http.StatusOK {
		t.Fatalf("first: expected 200, got %d", w1.Code)
	}
	w2 := doOnboardingPost(t, app, token, selfEmployedBody("123456789013"))
	if w2.Code != http.StatusOK {
		t.Fatalf("second: expected 200, got %d: %s", w2.Code, w2.Body.String())
	}
	if n := countOrganizationsFor(t, pool, userID); n != 1 {
		t.Fatalf("expected exactly 1 organization, got %d", n)
	}
	legalType, inn, status, confirmedSet, _ := fetchOrgRow(t, pool, userID)
	if inn != "123456789013" || legalType != legalTypeSelfEmployed {
		t.Errorf("row not updated: %q/%q", legalType, inn)
	}
	if status != onboardingPendingReview {
		t.Errorf("status = %q, want pending_review", status)
	}
	if !confirmedSet {
		t.Error("authority_confirmed_at not set after repeated request")
	}
}

// ── 17. Cannot touch another user's organization ──

func TestOnboarding_CannotEditAnotherUsersOrganization(t *testing.T) {
	skipIfNoDB(t)
	pool := getTestDB(t)
	app := signupApp(pool)
	userA, _ := createOnboardingProfile(t, pool, "business")
	userB, _ := createOnboardingProfile(t, pool, "business")

	tokenA := onboardingToken(app, userA, "business")
	tokenB := onboardingToken(app, userB, "business")

	wA := doOnboardingPost(t, app, tokenA, selfEmployedBody("123456789012"))
	if wA.Code != http.StatusOK {
		t.Fatalf("A: expected 200, got %d", wA.Code)
	}

	wB := doOnboardingPost(t, app, tokenB, legalEntityBody("7701234567", "770101001", "1027700132195"))
	if wB.Code != http.StatusOK {
		t.Fatalf("B: expected 200, got %d", wB.Code)
	}

	// A's organization must be untouched by B's request.
	legalTypeA, innA, _, _, _ := fetchOrgRow(t, pool, userA)
	if legalTypeA != legalTypeSelfEmployed || innA != "123456789012" {
		t.Errorf("A's org changed: %q/%q", legalTypeA, innA)
	}
	legalTypeB, innB, _, _, _ := fetchOrgRow(t, pool, userB)
	if legalTypeB != legalTypeLegalEntity || innB != "7701234567" {
		t.Errorf("B's org = %q/%q", legalTypeB, innB)
	}
}

// ── 18. Role is never changed ──

func TestOnboarding_RoleUnchanged(t *testing.T) {
	skipIfNoDB(t)
	pool := getTestDB(t)
	app := signupApp(pool)
	userID, _ := createOnboardingProfile(t, pool, "business")
	token := onboardingToken(app, userID, "business")

	w := doOnboardingPost(t, app, token, selfEmployedBody("123456789012"))
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var role string
	err := pool.QueryRow(context.Background(), "SELECT role FROM profiles WHERE id=$1", userID).Scan(&role)
	if err != nil {
		t.Fatalf("role lookup: %v", err)
	}
	if role != "business" {
		t.Errorf("role = %q, want business", role)
	}
}

// ── 19-23. Redirect / onboarding status in auth responses ──

// A fresh business signup must report onboarding as required.
func TestSignup_NewBusiness_OnboardingRequired(t *testing.T) {
	skipIfNoDB(t)
	pool := getTestDB(t)
	app := signupApp(pool)
	email := "test_ob_signup_" + randHex(6) + "@example.com"
	t.Cleanup(func() { cleanupProfileByEmail(t, pool, email) })

	w := doEmailSignup(t, app, `{"email":"`+email+`","password":"123456","displayName":"Biz","role":"business","terms_accepted":true,"pd_consent":true}`)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var resp struct {
		Data struct {
			Onboarding map[string]interface{} `json:"onboarding"`
		} `json:"data"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &resp)
	if resp.Data.Onboarding == nil {
		t.Fatal("onboarding block missing from signup response")
	}
	if resp.Data.Onboarding["status"] != onboardingRequired {
		t.Errorf("status = %v, want required", resp.Data.Onboarding["status"])
	}
}

// A client signup must NOT carry an onboarding block.
func TestSignup_Client_NoOnboarding(t *testing.T) {
	skipIfNoDB(t)
	pool := getTestDB(t)
	app := signupApp(pool)
	email := "test_ob_client_" + randHex(6) + "@example.com"
	t.Cleanup(func() { cleanupProfileByEmail(t, pool, email) })

	w := doEmailSignup(t, app, `{"email":"`+email+`","password":"123456","displayName":"Client","role":"client","terms_accepted":true,"pd_consent":true}`)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var resp struct {
		Data struct {
			Onboarding interface{} `json:"onboarding"`
		} `json:"data"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &resp)
	if resp.Data.Onboarding != nil {
		t.Errorf("client signup must not have onboarding, got %v", resp.Data.Onboarding)
	}
}

// An existing business with a filled organization must not be sent to
// onboarding: signin reports pending_review.
func TestSignin_ExistingBusinessWithOrg_PendingReview(t *testing.T) {
	skipIfNoDB(t)
	pool := getTestDB(t)
	app := signupApp(pool)

	email := "test_ob_signin_" + randHex(6) + "@example.com"
	userID, _ := createOnboardingProfile(t, pool, "business")
	// createOnboardingProfile uses its own email; align it with signin.
	pool.Exec(context.Background(), "UPDATE profiles SET email=$1 WHERE id=$2", email, userID)
	t.Cleanup(func() { cleanupProfileByEmail(t, pool, email) })

	// Insert password hash so signin works.
	pool.Exec(context.Background(), "UPDATE profiles SET password=$1 WHERE id=$2", hashPW("123456"), userID)

	token := onboardingToken(app, userID, "business")
	w := doOnboardingPost(t, app, token, selfEmployedBody("123456789012"))
	if w.Code != http.StatusOK {
		t.Fatalf("onboarding: expected 200, got %d", w.Code)
	}

	req := httptest.NewRequest("POST", "/api/auth/signin", strings.NewReader(`{"email":"`+email+`","password":"123456"}`))
	req.Header.Set("Content-Type", "application/json")
	sw := httptest.NewRecorder()
	app.handleSignin(sw, req)
	if sw.Code != http.StatusOK {
		t.Fatalf("signin: expected 200, got %d: %s", sw.Code, sw.Body.String())
	}
	var resp struct {
		Data struct {
			Profile struct {
				Onboarding map[string]interface{} `json:"onboarding"`
			} `json:"profile"`
		} `json:"data"`
	}
	_ = json.Unmarshal(sw.Body.Bytes(), &resp)
	if resp.Data.Profile.Onboarding == nil {
		t.Fatal("onboarding block missing from signin profile")
	}
	if resp.Data.Profile.Onboarding["status"] != onboardingPendingReview {
		t.Errorf("status = %v, want pending_review", resp.Data.Profile.Onboarding["status"])
	}
}

// refreshCookieValue extracts the SSO refresh cookie from a recorder.
func refreshCookieValue(t *testing.T, w *httptest.ResponseRecorder) string {
	t.Helper()
	for _, c := range w.Result().Cookies() {
		if c.Name == ssoRefreshCookieName && c.Value != "" {
			return c.Value
		}
	}
	t.Fatal("no refresh cookie in response")
	return ""
}

// doRefresh performs POST /api/auth/refresh with the given cookie.
func doRefresh(t *testing.T, app *App, cookieValue string) (*httptest.ResponseRecorder, string) {
	t.Helper()
	req := httptest.NewRequest("POST", "/api/auth/refresh", nil)
	req.AddCookie(&http.Cookie{Name: ssoRefreshCookieName, Value: cookieValue})
	w := httptest.NewRecorder()
	app.handleRefresh(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("refresh: expected 200, got %d: %s", w.Code, w.Body.String())
	}
	newCookie := refreshCookieValue(t, w)
	return w, newCookie
}

func profileOnboardingFromResponse(t *testing.T, w *httptest.ResponseRecorder) (map[string]interface{}, string) {
	t.Helper()
	var resp struct {
		Data struct {
			Token   string `json:"token"`
			Profile struct {
				Onboarding map[string]interface{} `json:"onboarding"`
			} `json:"profile"`
		} `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode refresh response: %v", err)
	}
	return resp.Data.Profile.Onboarding, resp.Data.Token
}

// The refresh endpoint must keep reporting the onboarding status — for a
// new business it is "required"; after filling the organization it becomes
// "pending_review" and stays that way on subsequent logins.
func TestRefresh_BusinessOnboardingStatusPersists(t *testing.T) {
	skipIfNoDB(t)
	pool := getTestDB(t)
	app := signupApp(pool)
	email := "test_ob_refresh_" + randHex(6) + "@example.com"
	t.Cleanup(func() { cleanupProfileByEmail(t, pool, email) })

	w := doEmailSignup(t, app, `{"email":"`+email+`","password":"123456","displayName":"Biz","role":"business","terms_accepted":true,"pd_consent":true}`)
	if w.Code != http.StatusOK {
		t.Fatalf("signup: expected 200, got %d", w.Code)
	}
	cookie := refreshCookieValue(t, w)

	// First refresh: onboarding must be required.
	w1, cookie1 := doRefresh(t, app, cookie)
	onb1, token1 := profileOnboardingFromResponse(t, w1)
	if onb1 == nil || onb1["status"] != onboardingRequired {
		t.Fatalf("first refresh onboarding = %v, want required", onb1)
	}

	// Fill the onboarding.
	w2 := doOnboardingPost(t, app, token1, selfEmployedBody("123456789012"))
	if w2.Code != http.StatusOK {
		t.Fatalf("onboarding: expected 200, got %d", w2.Code)
	}

	// Next refresh with the rotated cookie: pending_review.
	w3, _ := doRefresh(t, app, cookie1)
	onb2, _ := profileOnboardingFromResponse(t, w3)
	if onb2 == nil || onb2["status"] != onboardingPendingReview {
		t.Fatalf("second refresh onboarding = %v, want pending_review", onb2)
	}
}

// Yandex business signup must funnel the user to onboarding: the refresh
// after the OAuth flow reports "required", and a later login does not
// reset the completed onboarding.
func TestYandexSignup_BusinessOnboardingFlow(t *testing.T) {
	skipIfNoDB(t)
	pool := getTestDB(t)
	app := signupApp(pool)
	ctx := context.Background()

	providerSubject := "ya_ob_" + randHex(8)
	email := providerSubject + "@example.com"
	t.Cleanup(func() { cleanupProfileByEmail(t, pool, email) })

	state := yandexOAuthState{ReturnTo: "/", Mode: "signup", Role: "business", TermsAccepted: true}
	profile := &yandexProfileResponse{ID: providerSubject, DefaultEmail: email}

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/", nil)
	app.yandexSignup(w, req, providerSubject, email, profile, state)
	resp := w.Result()
	defer resp.Body.Close()
	loc := resp.Header.Get("Location")
	if strings.Contains(loc, "error=") {
		t.Fatalf("expected success, got %s", loc)
	}
	cookie := refreshCookieValue(t, w)

	// Refresh after OAuth signup → required.
	w1, cookie1 := doRefresh(t, app, cookie)
	onb1, token1 := profileOnboardingFromResponse(t, w1)
	if onb1 == nil || onb1["status"] != onboardingRequired {
		t.Fatalf("after yandex signup onboarding = %v, want required", onb1)
	}

	// Complete onboarding.
	w2 := doOnboardingPost(t, app, token1, selfEmployedBody("123456789012"))
	if w2.Code != http.StatusOK {
		t.Fatalf("onboarding: expected 200, got %d", w2.Code)
	}

	// Refresh again → still pending_review, not reset.
	w3, _ := doRefresh(t, app, cookie1)
	onb2, _ := profileOnboardingFromResponse(t, w3)
	if onb2 == nil || onb2["status"] != onboardingPendingReview {
		t.Fatalf("after onboarding onboarding = %v, want pending_review", onb2)
	}

	// Sanity: exactly one organization row exists.
	var orgCount int
	pool.QueryRow(ctx, "SELECT COUNT(*) FROM organizations o JOIN profiles p ON o.user_id=p.id WHERE p.email=$1", email).Scan(&orgCount)
	if orgCount != 1 {
		t.Errorf("expected 1 organization, got %d", orgCount)
	}
}

// GET /api/business/onboarding returns the status and org for a completed
// user and the required status for a new one.
func TestOnboarding_GetStatus(t *testing.T) {
	skipIfNoDB(t)
	pool := getTestDB(t)
	app := signupApp(pool)

	newUser, _ := createOnboardingProfile(t, pool, "business")
	token := onboardingToken(app, newUser, "business")
	w := doOnboardingGet(t, app, token)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var body struct {
		Data struct {
			Onboarding map[string]interface{} `json:"onboarding"`
		} `json:"data"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &body)
	if body.Data.Onboarding["status"] != onboardingRequired {
		t.Errorf("new user status = %v, want required", body.Data.Onboarding["status"])
	}

	doneUser, _ := createOnboardingProfile(t, pool, "business")
	token2 := onboardingToken(app, doneUser, "business")
	w2 := doOnboardingPost(t, app, token2, legalEntityBody("7701234567", "770101001", "1027700132195"))
	if w2.Code != http.StatusOK {
		t.Fatalf("onboarding: expected 200, got %d", w2.Code)
	}
	w3 := doOnboardingGet(t, app, token2)
	var body3 struct {
		Data struct {
			Onboarding map[string]interface{} `json:"onboarding"`
		} `json:"data"`
	}
	_ = json.Unmarshal(w3.Body.Bytes(), &body3)
	if body3.Data.Onboarding["status"] != onboardingPendingReview {
		t.Errorf("done user status = %v, want pending_review", body3.Data.Onboarding["status"])
	}
}
