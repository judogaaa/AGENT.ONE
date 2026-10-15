package main

import "testing"

// ── parseAuthIntent ──

func TestParseAuthIntent_Valid(t *testing.T) {
	cases := []struct {
		mode string
		want AuthIntent
	}{
		{"login", AuthIntentLogin},
		{"signup", AuthIntentSignup},
	}
	for _, tc := range cases {
		t.Run(tc.mode, func(t *testing.T) {
			got, err := parseAuthIntent(tc.mode)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tc.want {
				t.Errorf("parseAuthIntent(%q) = %q, want %q", tc.mode, got, tc.want)
			}
			if got.String() != tc.mode {
				t.Errorf("String() = %q, want %q", got.String(), tc.mode)
			}
		})
	}
}

func TestParseAuthIntent_RejectsUnknown(t *testing.T) {
	cases := []string{"", " ", "Login", "SIGNUP", "sign-up", "magic", "signup?role=client", "login\n", " signup"}
	for _, mode := range cases {
		t.Run("mode="+mode, func(t *testing.T) {
			if _, err := parseAuthIntent(mode); err == nil {
				t.Errorf("parseAuthIntent(%q) should fail", mode)
			}
		})
	}
}

// ── validSignupRole ──

func TestValidSignupRole(t *testing.T) {
	if !validSignupRole("client") {
		t.Error("client should be valid")
	}
	if !validSignupRole("business") {
		t.Error("business should be valid")
	}
	for _, role := range []string{"", "admin", "Client", "seller", "root", " "} {
		if validSignupRole(role) {
			t.Errorf("role %q should be invalid", role)
		}
	}
}

// ── signupStartParamsValid ──

func TestSignupStartParamsValid_ExactTrueOnly(t *testing.T) {
	for _, tc := range []struct {
		role, terms string
		want        bool
	}{
		{"client", "true", true},
		{"business", "true", true},
		{"client", "", false},
		{"client", "false", false},
		{"client", "1", false},
		{"client", "yes", false},
		{"client", "TRUE", false},
		{"client", "True", false},
		{"", "true", false},
		{"admin", "true", false},
		{"business", "true ", false},
	} {
		if got := signupStartParamsValid(tc.role, tc.terms); got != tc.want {
			t.Errorf("signupStartParamsValid(%q, %q) = %v, want %v", tc.role, tc.terms, got, tc.want)
		}
	}
}

// ── signupStateValid ──

func TestSignupStateValid(t *testing.T) {
	for _, tc := range []struct {
		role  string
		terms bool
		want  bool
	}{
		{"client", true, true},
		{"business", true, true},
		{"", true, false},
		{"admin", true, false},
		{"client", false, false},
		{"business", false, false},
	} {
		if got := signupStateValid(tc.role, tc.terms); got != tc.want {
			t.Errorf("signupStateValid(%q, %v) = %v, want %v", tc.role, tc.terms, got, tc.want)
		}
	}
}
