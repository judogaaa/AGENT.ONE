package main

import "time"

// AuthSession represents a refresh token session.
// The refresh token itself is NEVER stored — only its hash.
type AuthSession struct {
	ID                  string
	UserID              string
	RefreshTokenHash    string
	TokenFamily         string
	CreatedAt           time.Time
	ExpiresAt           time.Time
	LastUsedAt          *time.Time
	RevokedAt           *time.Time
	RevokeReason        *string
	UserAgentHash       *string
	IPHash              *string
	ReplacedBySessionID *string
}

// EmailVerificationToken represents a one-time email verification token.
// The token itself is NEVER stored — only its hash.
type EmailVerificationToken struct {
	ID        string
	UserID    string
	TokenHash string
	CreatedAt time.Time
	ExpiresAt time.Time
	UsedAt    *time.Time
}
