package main

import "context"

// EmailVerificationSender delivers verification tokens.
// Production implementations should NEVER log the raw token.
type EmailVerificationSender interface {
	SendVerification(ctx context.Context, email, verificationURL string) error
}

// noopEmailSender does nothing — safe for development/testing.
type noopEmailSender struct{}

func (n *noopEmailSender) SendVerification(_ context.Context, email, _ string) error {
	// No-op: token delivery is not connected to any external service.
	// In test/development, the token is available via EMAIL_VERIFICATION_EXPOSE_TOKEN.
	_ = email
	return nil
}

// testCaptureSender stores the last verification URL in memory for integration tests.
type testCaptureSender struct {
	LastURL string
}

func (t *testCaptureSender) SendVerification(_ context.Context, email, verificationURL string) error {
	t.LastURL = verificationURL
	return nil
}
