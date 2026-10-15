// ═══════════════════════════════════════════════════════════════
//  Redis client + helpers for session/JTI/rate-limit cache
// ═══════════════════════════════════════════════════════════════
//
//  Схема ключей:
//   jti:{jti}                → userID            (TTL = access token TTL)
//   sess:{family}            → userID|fp|sessID|jti  (TTL = refresh TTL, sliding)
//   fp:{userID}              → set of families   (для "logout all")
//   rl:{group}:{key}:{bucket}→ counter           (TTL = window)
//
//  Если Redis недоступен — все helpers тихо no-op, деградация в in-memory.

package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"log"
	"os"
	"strconv"
	"strings"
	"sync/atomic"
	"time"

	"github.com/redis/go-redis/v9"
)

var (
	rdb        *redis.Client
	rdbHealthy atomic.Bool
)

// InitRedis подключается к Redis. Если REDIS_URL пуст — работаем без него.
func InitRedis() {
	var url string
	if v := strings.TrimSpace(os.Getenv("REDIS_URL")); v != "" {
		url = v
	} else {
		host := envString("REDIS_HOST", "127.0.0.1")
		port := envString("REDIS_PORT", "6379")
		pwd := os.Getenv("REDIS_PASSWORD")
		dbStr := os.Getenv("REDIS_DB")
		dbNum := 0
		if dbStr != "" {
			if n, err := strconv.Atoi(dbStr); err == nil {
				dbNum = n
			}
		}
		if pwd != "" {
			url = "redis://:" + pwd + "@" + host + ":" + port + "/" + strconv.Itoa(dbNum)
		} else {
			url = "redis://" + host + ":" + port + "/" + strconv.Itoa(dbNum)
		}
	}

	opt, err := redis.ParseURL(url)
	if err != nil {
		log.Printf("redis: bad URL, running without cache: %v", err)
		rdbHealthy.Store(false)
		return
	}
	rdb = redis.NewClient(opt)
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	if err := rdb.Ping(ctx).Err(); err != nil {
		log.Printf("redis: ping failed, running without cache: %v", err)
		rdbHealthy.Store(false)
		return
	}
	rdbHealthy.Store(true)
	log.Printf("redis: connected ok")
}

// RedisHealthy возвращает true если Redis доступен.
func RedisHealthy() bool { return rdbHealthy.Load() }

// ── JTI blocklist ─────────────────────────────────────────────
//
//  При выдаче access-токена кладём jti:{jti} → userID с TTL = TTL access-токена.
//  При logout / "logout all" — удаляем ключ. auth() проверяет существование ключа:
//  если ключа нет (истёк или удалён) — токен считается отозванным.

func StoreJTI(ctx context.Context, jti, userID string, ttl time.Duration) {
	if rdb == nil || !rdbHealthy.Load() {
		return
	}
	_ = rdb.Set(ctx, "jti:"+jti, userID, ttl).Err()
}

// JTIExists возвращает true если jti валиден (ключ жив в Redis).
// При недоступном Redis — пропускает (graceful degradation).
func JTIExists(ctx context.Context, jti string) bool {
	if rdb == nil || !rdbHealthy.Load() {
		return true
	}
	n, err := rdb.Exists(ctx, "jti:"+jti).Result()
	if err != nil {
		return true
	}
	return n == 1
}

func DeleteJTI(ctx context.Context, jti string) {
	if rdb == nil || !rdbHealthy.Load() {
		return
	}
	_ = rdb.Del(ctx, "jti:"+jti).Err()
}

// ── Sliding session cache ─────────────────────────────────────
//
//  При refresh обновляем TTL ключа sess:{family}.
//  Значение: "{userID}|{fingerprint}|{sessionID}|{currentJTI}".

const sessValSep = "|"

func StoreSession(ctx context.Context, family, userID, fingerprint, sessionID, currentJTI string, ttl time.Duration) {
	if rdb == nil || !rdbHealthy.Load() {
		return
	}
	val := userID + sessValSep + fingerprint + sessValSep + sessionID + sessValSep + currentJTI
	pipe := rdb.Pipeline()
	pipe.Set(ctx, "sess:"+family, val, ttl)
	// индекс семейств пользователя — для "logout all"
	pipe.SAdd(ctx, "fp:"+userID, family)
	pipe.Expire(ctx, "fp:"+userID, ttl+time.Hour)
	_, _ = pipe.Exec(ctx)
}

// SessMeta — состояние активной сессии в Redis.
type SessMeta struct {
	UserID      string
	Fingerprint string
	SessionID   string
	CurrentJTI  string
}

func LoadSession(ctx context.Context, family string) (SessMeta, error) {
	if rdb == nil || !rdbHealthy.Load() {
		return SessMeta{}, errors.New("redis offline")
	}
	val, err := rdb.Get(ctx, "sess:"+family).Result()
	if err != nil {
		return SessMeta{}, err
	}
	parts := strings.SplitN(val, sessValSep, 4)
	if len(parts) < 4 {
		return SessMeta{}, errors.New("malformed sess value")
	}
	return SessMeta{
		UserID:      parts[0],
		Fingerprint: parts[1],
		SessionID:   parts[2],
		CurrentJTI:  parts[3],
	}, nil
}

func TouchSession(ctx context.Context, family string, ttl time.Duration) {
	if rdb == nil || !rdbHealthy.Load() {
		return
	}
	_ = rdb.Expire(ctx, "sess:"+family, ttl).Err()
}

func DeleteSession(ctx context.Context, family string) {
	if rdb == nil || !rdbHealthy.Load() {
		return
	}
	_ = rdb.Del(ctx, "sess:"+family).Err()
}

// RevokeAllUserFamilies loads CurrentJTI values, then deletes all session
// families for the user. JTIs are collected BEFORE sess keys are deleted so
// logout-all can revoke access tokens.
func RevokeAllUserFamilies(ctx context.Context, userID string) (families []string, jtis []string) {
	if rdb == nil || !rdbHealthy.Load() {
		return nil, nil
	}
	families, err := rdb.SMembers(ctx, "fp:"+userID).Result()
	if err != nil {
		return nil, nil
	}
	if len(families) == 0 {
		return nil, nil
	}
	for _, f := range families {
		if sess, lerr := LoadSession(ctx, f); lerr == nil && sess.CurrentJTI != "" {
			jtis = append(jtis, sess.CurrentJTI)
		}
	}
	pipe := rdb.Pipeline()
	for _, f := range families {
		pipe.Del(ctx, "sess:"+f)
	}
	pipe.Del(ctx, "fp:"+userID)
	_, _ = pipe.Exec(ctx)
	return families, jtis
}

// bindIssuedAccessSession stores the access-token JTI and Redis session
// metadata so logout can revoke both the refresh family and the access token.
func bindIssuedAccessSession(ctx context.Context, family, userID, fingerprint, sessionID, jti string, accessTTLMin, refreshTTLHours int) {
	if jti == "" || family == "" || userID == "" {
		return
	}
	ttlAccess := time.Duration(accessTTLMin) * time.Minute
	ttlRefresh := time.Duration(refreshTTLHours) * time.Hour
	StoreJTI(ctx, jti, userID, ttlAccess)
	StoreSession(ctx, family, userID, fingerprint, sessionID, jti, ttlRefresh)
}

// ── Device fingerprint ────────────────────────────────────────

// ComputeFingerprint — стабильный хэш клиента.
// SHA-256 от "ao:v1|ip|ua|lang". Не PII, обратно не восстанавливается.
func ComputeFingerprint(ip, ua, lang string) string {
	const salt = "ao:v1"
	raw := salt + "|" + ip + "|" + ua + "|" + lang
	h := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(h[:])
}

// ── Rate limit (sliding window через Redis INCR) ──────────────

// RateLimitAllow возвращает true если запрос в окне. key — уникальный bucket.
// При недоступном Redis возвращает true (graceful degradation).
func RateLimitAllow(ctx context.Context, key string, limit int, window time.Duration) bool {
	if rdb == nil || !rdbHealthy.Load() {
		return true
	}
	bucket := "rl:" + key + ":" + strconv.FormatInt(time.Now().UnixNano()/int64(window), 10)
	n, err := rdb.Incr(ctx, bucket).Result()
	if err != nil {
		return true
	}
	if n == 1 {
		_ = rdb.Expire(ctx, bucket, window+time.Second).Err()
	}
	return n <= int64(limit)
}
