package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"regexp"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var validRefreshToken = regexp.MustCompile(`^[0-9a-f]{64}$`)

// createSession вставляет новую сессию и возвращает (raw, family, err).
func createSession(ctx context.Context, db *pgxpool.Pool, userID, fingerprint string, ttlHours int) (rawToken, family string, err error) {
	raw, err := GenerateToken()
	if err != nil {
		return "", "", fmt.Errorf("generate token: %w", err)
	}
	if !validRefreshToken.MatchString(raw) {
		return "", "", errors.New("generated token does not match required format")
	}
	hash, err := HashToken(raw)
	if err != nil {
		return "", "", fmt.Errorf("hash token: %w", err)
	}
	sessionID := newID()
	family = newID()
	expiresAt := time.Now().Add(time.Duration(ttlHours) * time.Hour)

	// fingerprint хранится как SHA-256 (необратимый), на случай если Redis офлайн
	// и нужно верифицировать устройство из БД.
	var uaHash, ipHash *string
	if fingerprint != "" {
		// fingerprint уже хэш; для отдельного хранения используем префикс версии
		fp := fingerprint
		uaHash = &fp
		ipHash = &fp
	}

	_, err = db.Exec(ctx,
		`INSERT INTO auth_sessions (id, user_id, refresh_token_hash, token_family, created_at, expires_at, user_agent_hash, ip_hash) VALUES ($1,$2,$3,$4,NOW(),$5,$6,$7)`,
		sessionID, userID, hash, family, expiresAt, uaHash, ipHash)
	if err != nil {
		return "", "", fmt.Errorf("create session: %w", err)
	}
	return raw, family, nil
}

type refreshSessionData struct {
	NewRawToken string
	AccessToken string
	Profile     map[string]interface{}
	Family      string
}

func rotateRefreshSession(ctx context.Context, db *pgxpool.Pool, rawToken string, jwtKey []byte, accessTTLMin int, refreshTTLHours int, fingerprint string) (*refreshSessionData, error) {
	if !validRefreshToken.MatchString(rawToken) {
		return nil, errors.New("invalid token format")
	}
	hash, err := HashToken(rawToken)
	if err != nil {
		return nil, err
	}
	for attempt := 0; attempt < 2; attempt++ {
		result, err := doRotate(ctx, db, hash, jwtKey, accessTTLMin, refreshTTLHours, fingerprint)
		if err != nil {
			if attempt == 0 && errors.Is(err, errHashCollision) {
				continue
			}
			return nil, err
		}
		return result, nil
	}
	return nil, errors.New("hash collision after retry")
}

var errHashCollision = errors.New("hash collision")

func doRotate(ctx context.Context, db *pgxpool.Pool, oldHash string, jwtKey []byte, accessTTLMin int, refreshTTLHours int, fingerprint string) (*refreshSessionData, error) {
	tx, err := db.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	// 1. Read family WITHOUT lock (immutable mapping)
	var family string
	err = tx.QueryRow(ctx,
		`SELECT token_family FROM auth_sessions WHERE refresh_token_hash = $1`, oldHash).Scan(&family)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, errUnknownToken
	}
	if err != nil {
		return nil, fmt.Errorf("query family: %w", err)
	}

	// 2. Lock entire family in stable order
	if err := lockSessionFamily(ctx, tx, family); err != nil {
		return nil, fmt.Errorf("lock family: %w", err)
	}

	// 3. Re-read target session with profile (now safely locked with family)
	var oldID, userID, role, email, displayName, phone, firstName, lastName, patronymic, birthDate string
	var avatarUrl, deliveryCity, deliveryAddress, deliveryComment, payerType, billingName, billingCompanyName, billingInn *string
	var expiresAt, revokedAt *time.Time
	var readFamily, emailVerifiedAt string

	err = tx.QueryRow(ctx,
		`SELECT a.id, a.token_family, a.expires_at, a.revoked_at,
			p.id, p.role, COALESCE(p.email,''), COALESCE(p.display_name,''),
			COALESCE(p.phone,''), COALESCE(p.first_name,''), COALESCE(p.last_name,''),
			COALESCE(p.patronymic,''), COALESCE(p.birth_date,''),
			COALESCE(p.avatar_url,''), COALESCE(p.delivery_city,''), COALESCE(p.delivery_address,''),
			COALESCE(p.delivery_comment,''), COALESCE(p.payer_type,''),
			COALESCE(p.billing_name,''), COALESCE(p.billing_company_name,''), 			COALESCE(p.billing_inn,''),
			COALESCE(p.email_verified_at::text,'') AS email_verified_at
		FROM auth_sessions a
		JOIN profiles p ON a.user_id = p.id
		WHERE a.refresh_token_hash = $1`, oldHash).
		Scan(&oldID, &readFamily, &expiresAt, &revokedAt,
			&userID, &role, &email, &displayName,
			&phone, &firstName, &lastName,
			&patronymic, &birthDate,
			&avatarUrl, &deliveryCity, &deliveryAddress,
			&deliveryComment, &payerType,
			&billingName, &billingCompanyName, &billingInn,
			&emailVerifiedAt)
	if err != nil {
		return nil, fmt.Errorf("query session: %w", err)
	}
	if readFamily != family {
		return nil, fmt.Errorf("internal consistency error")
	}

	// 4. Check revoked → replay
	if revokedAt != nil {
		_, _ = tx.Exec(ctx,
			`UPDATE auth_sessions SET revoked_at = NOW(), revoke_reason = 'replay'
			WHERE token_family = $1 AND revoked_at IS NULL`, family)
		tx.Commit(ctx)
		return nil, errReplayDetected
	}

	// 5. Check expired
	if expiresAt != nil && time.Now().After(*expiresAt) {
		_, _ = tx.Exec(ctx,
			`UPDATE auth_sessions SET revoked_at = NOW(), revoke_reason = 'expired'
			WHERE id = $1 AND revoked_at IS NULL`, oldID)
		tx.Commit(ctx)
		return nil, errTokenExpired
	}

	// 6. Active rotation
	newRaw, err := GenerateToken()
	if err != nil {
		return nil, fmt.Errorf("generate new token: %w", err)
	}
	newHash, err := HashToken(newRaw)
	if err != nil {
		return nil, fmt.Errorf("hash new token: %w", err)
	}
	newID := newID()
	newExpiry := time.Now().Add(time.Duration(refreshTTLHours) * time.Hour)

	tag, err := tx.Exec(ctx,
		`INSERT INTO auth_sessions (id, user_id, refresh_token_hash, token_family, created_at, expires_at, last_used_at)
		VALUES ($1, $2, $3, $4, NOW(), $5, NOW())`,
		newID, userID, newHash, family, newExpiry)
	if err != nil {
		if isUniqueViolation(err) {
			return nil, errHashCollision
		}
		return nil, fmt.Errorf("insert new session: %w", err)
	}
	if tag.RowsAffected() != 1 {
		return nil, errors.New("unexpected rows affected on session insert")
	}

	tag, err = tx.Exec(ctx,
		`UPDATE auth_sessions
		SET revoked_at = NOW(), revoke_reason = 'rotation', last_used_at = NOW(), replaced_by_session_id = $1
		WHERE id = $2 AND revoked_at IS NULL`, newID, oldID)
	if err != nil {
		return nil, fmt.Errorf("revoke old session: %w", err)
	}
	if tag.RowsAffected() != 1 {
		return nil, errors.New("unexpected rows affected on session revoke")
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit rotation: %w", err)
	}

	profile := buildProfileMap(userID, role, email, displayName, phone, firstName, lastName, patronymic, birthDate,
		avatarUrl, deliveryCity, deliveryAddress, deliveryComment, payerType, billingName, billingCompanyName, billingInn)
	profile["email_verified"] = emailVerifiedAt != ""
	attachOnboardingToProfile(ctx, db, profile, userID, role)

	accessToken, jti := makeJWTWithTTL(userID, role, jwtKey, accessTTLMin)

	// Concurrent logout may have revoked the rotated row after commit.
	var stillActive bool
	if err := db.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM auth_sessions WHERE id = $1 AND revoked_at IS NULL)`, newID).
		Scan(&stillActive); err != nil {
		return nil, fmt.Errorf("verify rotated session: %w", err)
	}
	if !stillActive {
		return nil, errReplayDetected
	}

	// ── Redis: JTI + sliding session + fingerprint binding ──
	bindIssuedAccessSession(ctx, family, userID, fingerprint, newID2(jti+userID), jti, accessTTLMin, refreshTTLHours)

	return &refreshSessionData{
		NewRawToken: newRaw,
		AccessToken: accessToken,
		Profile:     profile,
		Family:      family,
	}, nil
}

// newID2 — короткий sessionID на основе jti+userID (для отслеживания, не для аутентификации).
func newID2(seed string) string {
	h := sha256.Sum256([]byte(seed))
	return hex.EncodeToString(h[:8])
}

var (
	errUnknownToken   = errors.New("unknown token")
	errReplayDetected = errors.New("replay detected")
	errTokenExpired   = errors.New("token expired")
	errDeviceMismatch = errors.New("device mismatch")
)

func isUniqueViolation(err error) bool {
	return err != nil && (contains(err.Error(), "duplicate") || contains(err.Error(), "unique") || contains(err.Error(), "23505"))
}
func contains(s, substr string) bool { return len(s) >= len(substr) && searchString(s, substr) }
func searchString(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
func buildProfileMap(userID, role, email, displayName, phone, firstName, lastName, patronymic, birthDate string,
	avatarUrl, deliveryCity, deliveryAddress, deliveryComment, payerType, billingName, billingCompanyName, billingInn *string) map[string]interface{} {
	m := map[string]interface{}{
		"id": userID, "email": email, "displayName": displayName, "role": role,
		"phone": phone, "firstName": firstName, "lastName": lastName,
		"patronymic": patronymic, "birthDate": birthDate,
	}
	if avatarUrl != nil {
		m["avatarUrl"] = *avatarUrl
	}
	if deliveryCity != nil {
		m["deliveryCity"] = *deliveryCity
	}
	if deliveryAddress != nil {
		m["deliveryAddress"] = *deliveryAddress
	}
	if deliveryComment != nil {
		m["deliveryComment"] = *deliveryComment
	}
	if payerType != nil {
		m["payerType"] = *payerType
	}
	if billingName != nil {
		m["billingName"] = *billingName
	}
	if billingCompanyName != nil {
		m["billingCompanyName"] = *billingCompanyName
	}
	if billingInn != nil {
		m["billingInn"] = *billingInn
	}
	return m
}
