package main

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"errors"
)

const (
	// tokenByteLength is the number of random bytes used in token generation.
	tokenByteLength = 32

	// maxTokenLength is the maximum allowed input token length for verification.
	maxTokenLength = 512
)

// GenerateToken returns a cryptographically random URL-safe token.
// The token is hex-encoded from 32 random bytes (64 hex chars).
func GenerateToken() (string, error) {
	b := make([]byte, tokenByteLength)
	if _, err := rand.Read(b); err != nil {
		return "", errors.New("failed to generate random token")
	}
	return hex.EncodeToString(b), nil
}

// HashToken returns the SHA-256 hash of the token as a hex string.
// This is what should be stored — never store the raw token.
func HashToken(token string) (string, error) {
	if token == "" {
		return "", errors.New("token must not be empty")
	}
	if len(token) > maxTokenLength {
		return "", errors.New("token exceeds maximum allowed length")
	}
	h := sha256.Sum256([]byte(token))
	return hex.EncodeToString(h[:]), nil
}

// CheckTokenHash compares a raw token against its stored hash using
// constant-time comparison to prevent timing attacks.
func CheckTokenHash(token, hash string) (bool, error) {
	recomputed, err := HashToken(token)
	if err != nil {
		return false, err
	}
	expected, err := hex.DecodeString(hash)
	if err != nil {
		return false, errors.New("invalid hash format")
	}
	actual, err := hex.DecodeString(recomputed)
	if err != nil {
		return false, err
	}
	return subtle.ConstantTimeCompare(expected, actual) == 1, nil
}
