package main

import (
	"strings"
	"testing"
)

// ─── Token generation ───

func TestGenerateTokenNotEmpty(t *testing.T) {
	tok, err := GenerateToken()
	if err != nil {
		t.Fatalf("GenerateToken failed: %v", err)
	}
	if tok == "" {
		t.Error("token must not be empty")
	}
}

func TestGeneratedTokensAreDifferent(t *testing.T) {
	t1, _ := GenerateToken()
	t2, _ := GenerateToken()
	if t1 == t2 {
		t.Error("consecutive tokens must be different")
	}
}

func TestTokenHasSufficientEntropy(t *testing.T) {
	tok, _ := GenerateToken()
	// 32 bytes = 64 hex chars
	if len(tok) < 64 {
		t.Errorf("token length %d < 64 hex chars (32 bytes)", len(tok))
	}
}

func TestTokenIsHexEncoded(t *testing.T) {
	tok, _ := GenerateToken()
	for _, c := range tok {
		if !((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f')) {
			t.Errorf("unexpected character in token: %c", c)
		}
	}
}

func TestMultipleTokenUnique(t *testing.T) {
	seen := make(map[string]bool)
	for i := 0; i < 100; i++ {
		tok, _ := GenerateToken()
		if seen[tok] {
			t.Fatal("collision in generated tokens")
		}
		seen[tok] = true
	}
}

// ─── Hashing ───

func TestHashNotEqualToToken(t *testing.T) {
	tok, _ := GenerateToken()
	hash, _ := HashToken(tok)
	if hash == tok {
		t.Error("hash must not equal raw token")
	}
}

func TestSameTokenSameHash(t *testing.T) {
	tok, _ := GenerateToken()
	h1, _ := HashToken(tok)
	h2, _ := HashToken(tok)
	if h1 != h2 {
		t.Error("same token must produce same hash")
	}
}

func TestDifferentTokensDifferentHashes(t *testing.T) {
	t1, _ := GenerateToken()
	t2, _ := GenerateToken()
	h1, _ := HashToken(t1)
	h2, _ := HashToken(t2)
	if h1 == h2 {
		t.Error("different tokens must produce different hashes")
	}
}

// ─── Token/hash verification ───

func TestValidTokenMatchesHash(t *testing.T) {
	tok, _ := GenerateToken()
	hash, _ := HashToken(tok)
	match, err := CheckTokenHash(tok, hash)
	if err != nil {
		t.Fatalf("CheckTokenHash failed: %v", err)
	}
	if !match {
		t.Error("valid token must match its hash")
	}
}

func TestInvalidTokenDoesNotMatchHash(t *testing.T) {
	tok, _ := GenerateToken()
	wrong, _ := GenerateToken()
	hash, _ := HashToken(tok)
	match, _ := CheckTokenHash(wrong, hash)
	if match {
		t.Error("wrong token must not match hash")
	}
}

// ─── Edge cases ───

func TestEmptyTokenRejected(t *testing.T) {
	_, err := HashToken("")
	if err == nil {
		t.Error("empty token must be rejected")
	}
}

func TestTooLongTokenRejected(t *testing.T) {
	long := strings.Repeat("a", maxTokenLength+1)
	_, err := HashToken(long)
	if err == nil {
		t.Error("overly long token must be rejected")
	}
}

func TestCheckTokenHashEmptyToken(t *testing.T) {
	_, err := CheckTokenHash("", "abc123")
	if err == nil {
		t.Error("checking empty token must return error")
	}
}

func TestCheckTokenHashInvalidHashFormat(t *testing.T) {
	tok, _ := GenerateToken()
	_, err := CheckTokenHash(tok, "not-valid-hex")
	if err == nil {
		t.Error("invalid hash format must return error")
	}
}
