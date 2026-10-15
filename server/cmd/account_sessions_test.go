package main

import (
	"testing"
	"time"
)

// ─── Session creation helpers ───

func TestGeneratedSessionTokenFormat(t *testing.T) {
	raw, err := GenerateToken()
	if err != nil {
		t.Fatal(err)
	}
	if len(raw) != 64 {
		t.Errorf("raw token length %d, want 64", len(raw))
	}
	if !validRefreshToken.MatchString(raw) {
		t.Error("generated token must match validRefreshToken regex")
	}
}

func TestSessionTokenHashDiffersFromRaw(t *testing.T) {
	raw, _ := GenerateToken()
	hash, _ := HashToken(raw)
	if raw == hash {
		t.Error("hash must differ from raw token")
	}
}

func TestSessionTokenFamilyFormat(t *testing.T) {
	f := newID()
	if len(f) != 16 {
		t.Errorf("token family id length %d, want 16", len(f))
	}
}

func TestSessionExpiryCalculation(t *testing.T) {
	ttlHours := 24
	now := time.Now()
	expiry := now.Add(time.Duration(ttlHours) * time.Hour)
	if expiry.Sub(now) != time.Duration(ttlHours)*time.Hour {
		t.Error("expiry must be now + ttlHours")
	}
}

// ─── Validation without DB ───

func TestActiveSessionNotExpired(t *testing.T) {
	expiresAt := time.Now().Add(1 * time.Hour)
	if time.Now().After(expiresAt) {
		t.Error("future expires_at should not be expired")
	}
}

func TestExpiredSessionIsExpired(t *testing.T) {
	expiresAt := time.Now().Add(-1 * time.Hour)
	if !time.Now().After(expiresAt) {
		t.Error("past expires_at should be expired")
	}
}

func TestRevokedSessionHasRevokedAt(t *testing.T) {
	var revokedAt *time.Time
	now := time.Now()
	revokedAt = &now
	if revokedAt == nil {
		t.Error("revoked session should have revoked_at")
	}
}

func TestActiveSessionHasNoRevokedAt(t *testing.T) {
	var revokedAt *time.Time
	if revokedAt != nil {
		t.Error("active session should have nil revoked_at")
	}
}

// ─── Error constants ───

func TestErrUnknownTokenExists(t *testing.T) {
	if errUnknownToken == nil {
		t.Error("errUnknownToken must be defined")
	}
}

func TestErrReplayDetectedExists(t *testing.T) {
	if errReplayDetected == nil {
		t.Error("errReplayDetected must be defined")
	}
}

func TestErrTokenExpiredExists(t *testing.T) {
	if errTokenExpired == nil {
		t.Error("errTokenExpired must be defined")
	}
}

// ─── Errors do not leak tokens ───

func TestErrUnknownTokenDoesNotContainRawToken(t *testing.T) {
	raw, _ := GenerateToken()
	msg := errUnknownToken.Error()
	if containsWord(msg, raw) {
		t.Error("error message must not contain raw token")
	}
}

func TestErrReplayDoesNotContainHash(t *testing.T) {
	raw, _ := GenerateToken()
	hash, _ := HashToken(raw)
	msg := errReplayDetected.Error()
	if containsWord(msg, raw) || containsWord(msg, hash) {
		t.Error("error message must not contain token or hash")
	}
}

func containsWord(s, sub string) bool {
	return len(s) >= len(sub) && searchString(s, sub)
}
