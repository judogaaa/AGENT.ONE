package main

// This file defines the unified authentication intent shared by every
// identity provider (email/password, Yandex OAuth and any future provider).
//
// Core rule: the intent of an authentication attempt is NEVER derived from
// whether an account happens to exist. It is declared by the client up front
// and locked into the server-side OAuth state at /start time:
//
//   - AuthIntentLogin  — only searches for an existing account and creates a
//     session. If the account is missing, the flow fails with a provider
//     specific "not linked" error. Login NEVER creates, links or modifies
//     accounts.
//   - AuthIntentSignup — the only flow allowed to create an account. It
//     requires an explicit role and legal consent, both fixed in the
//     single-use server-side state before the provider redirect.
//
// The callback query can never change the intent, role or consent — the
// OAuth state is the single source of truth.

import (
	"fmt"
	"net/http"
)

// AuthIntent is the canonical login/signup intent value.
type AuthIntent string

const (
	// AuthIntentLogin signs an existing user in. Never creates accounts.
	AuthIntentLogin AuthIntent = "login"
	// AuthIntentSignup creates a new account (requires role + consent).
	AuthIntentSignup AuthIntent = "signup"
)

// parseAuthIntent validates a mode value. Only the exact strings "login" and
// "signup" are accepted — empty, unknown or mixed-case values are rejected
// before any redirect to an identity provider.
func parseAuthIntent(mode string) (AuthIntent, error) {
	switch mode {
	case "login":
		return AuthIntentLogin, nil
	case "signup":
		return AuthIntentSignup, nil
	default:
		return "", fmt.Errorf("invalid auth intent: must be login or signup")
	}
}

// String returns the canonical query-string value of the intent.
func (i AuthIntent) String() string {
	return string(i)
}

// validSignupRole reports whether role is one of the allowed signup roles.
// There is no default role — the client must pick one explicitly.
func validSignupRole(role string) bool {
	return role == "client" || role == "business"
}

// signupStartParamsValid validates the signup parameters of a /start request:
// an allowed role and the exact string "true" for terms acceptance. Anything
// else ("1", "yes", "TRUE", missing) is rejected before the provider redirect.
func signupStartParamsValid(role, termsAccepted string) bool {
	return validSignupRole(role) && termsAccepted == "true"
}

// signupStateValid is the callback-time defense in depth: role and consent
// must be present in the server-side state. Values from the callback query
// are never trusted for this.
func signupStateValid(role string, termsAccepted bool) bool {
	return validSignupRole(role) && termsAccepted
}

// oauthProviderCtx carries the provider-specific error handling used by the
// shared OAuth helpers. Each provider keeps its own safe log prefix and its
// own internal error code.
type oauthProviderCtx struct {
	name      string
	logError  func(string)
	errorCode string
}

var yandexOAuthCtx = oauthProviderCtx{
	name:      "yandex",
	logError:  logSafeOAuthError,
	errorCode: oauthProviderError,
}

// oauthLoginExistingIdentity logs an already-registered user into their
// existing account. The role is read from the profile row — never from the
// OAuth state. Login never creates, links or modifies accounts: it only
// touches last_login_at and creates a new session.
func (a *App) oauthLoginExistingIdentity(w http.ResponseWriter, r *http.Request, identity *AuthIdentity, returnTo string, pctx oauthProviderCtx) {
	ctx := r.Context()

	var userID, userRole string
	if err := a.db.QueryRow(ctx, "SELECT id, role FROM profiles WHERE id=$1", identity.UserID).Scan(&userID, &userRole); err != nil {
		pctx.logError("identity operation failed")
		a.oauthRedirectError(w, r, pctx.errorCode)
		return
	}

	if err := updateAuthIdentityLastLogin(ctx, a.db, identity.ID); err != nil {
		pctx.logError("identity operation failed")
		a.oauthRedirectError(w, r, pctx.errorCode)
		return
	}

	a.createOAuthSessionFor(w, r, userID, userRole, returnTo, pctx.name)
}
