# AGENT.ONE — Production Release Runbook

**Checkpoint**: `AGENT_ONE_CHECKPOINT_AFTER_P3_VALID_2026-07-09_07-15-50`
**Git HEAD**: `810224a test: add Chromium browser E2E coverage`

## Preconditions

- Go 1.22+ installed
- PostgreSQL 16 available
- Docker (optional, for containerized DB)
- Environment variables configured (see below)

## Required Production Environment Variables

| Variable | Required | Notes |
|----------|----------|-------|
| `APP_ENV` | Yes | Must be `production` |
| `PORT` | No | Default 8080 |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `JWT_SECRET` | Yes | Min 16 chars, must not be a development value |
| `CORS_ORIGINS` | No | Comma-separated allowed origins |
| `GROQ_API_KEY` | No | AI provider; falls back to rule-based if empty |
| `DEV_ADMIN_TOKEN` | No | Must be empty in production |

Forbidden development values:
- `JWT_SECRET=agentone-dev-secret-key-change-in-production`
- `DEV_ADMIN_TOKEN` set to any value

## Build

```bash
cd server
go build \
  -ldflags "-X main.version=1.0.0 -X main.commit=$(git rev-parse --short HEAD) -X main.buildTime=$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  -o /opt/agent-one/server \
  ./cmd
```

## Database

Schema migrations run automatically on startup.
No separate migration tool required.

## Startup Verification

```bash
# Liveness — process alive
curl http://localhost:8080/api/live

# Readiness — database connected
curl http://localhost:8080/api/ready

# Health — backward compatible
curl http://localhost:8080/api/health
```

Expected: `/api/live` → 200, `/api/ready` → 200

## Graceful Shutdown

Send SIGTERM:
```bash
kill -TERM <pid>
```

Server will:
1. Stop accepting new connections
2. Wait up to 15s for in-flight requests
3. Close database connection
4. Exit with code 0

## Request ID

Every HTTP response includes `X-Request-ID` header.
Pass `X-Request-ID` in request headers to propagate through logs.

## Rollback Decision Criteria

- Increase in 5xx error rate after deploy
- Readiness endpoint fails consistently
- Database connection errors in logs
- Unexpected 401/403 on public endpoints

## Limitations

- Production hosting platform not yet selected
- No external metrics backend
- No distributed tracing
- No centralized log storage
- No load testing performed yet
- AI provider (Groq) is optional — safe rule-based fallback included
