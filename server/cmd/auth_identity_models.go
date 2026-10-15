package main

import (
	"errors"
	"time"
)

// Allowed auth identity providers.
const (
	ProviderPassword = "password"
	ProviderYandex   = "yandex"
)

// AuthIdentity represents an external or password-based login method
// linked to a user profile. One user may have multiple identities
// (e.g. password + yandex).
type AuthIdentity struct {
	ID                    string                 `json:"id"`
	UserID                string                 `json:"userId"`
	Provider              string                 `json:"provider"`
	ProviderSubject       string                 `json:"providerSubject"`
	ProviderEmail         *string                `json:"providerEmail,omitempty"`
	ProviderUsername      *string                `json:"providerUsername,omitempty"`
	ProviderEmailVerified bool                   `json:"providerEmailVerified"`
	Metadata              map[string]interface{} `json:"metadata"`
	CreatedAt             time.Time              `json:"createdAt"`
	UpdatedAt             time.Time              `json:"updatedAt"`
	LastLoginAt           *time.Time             `json:"lastLoginAt,omitempty"`
}

// Sentinel errors for auth identity operations.
var (
	errIdentityLinkedToThisUser   = errors.New("identity already linked to this user")
	errIdentityBelongsToAnother   = errors.New("identity belongs to another user")
	errUserAlreadyHasProvider     = errors.New("user already has this provider")
	errIdentityUserNotFound       = errors.New("user not found")
	errIdentityProviderNotAllowed = errors.New("provider not allowed")
)
