# AGENT.ONE Production Deployment Design

## 1. Scope and Non-Goals

**Scope**: Document the design for a secure production deployment of AGENT.ONE.

**Non-goals**:
- Select a specific cloud provider.
- Configure TLS certificate automation (Let's Encrypt, etc.).
- Deploy to production.
- Set up monitoring SaaS.
- Configure CI/CD pipeline for deployment.

## 2. Current Architecture

Single Go binary serving:
- `/api/*` — REST API
- `/` — React SPA (hash router)
- `/uploads/*` — static files

The binary expects:
- PostgreSQL 16 for persistent data.
- File system for uploads (can be a volume).
- Environment variables for all configuration.

## 3. Reverse Proxy / TLS Termination

Place a reverse proxy (Nginx, Caddy, or cloud LB) in front of the app:
- TLS termination at the proxy.
- Proxy sets `X-Forwarded-Proto: https`.
- Proxy sets `X-Forwarded-For` with real client IP.
- Proxy IP configured in `TRUSTED_PROXY_CIDRS`.
- HTTP → HTTPS redirect handled by proxy.
- HSTS header added by app only when `X-Forwarded-Proto: https` from trusted proxy.

## 4. Trusted Proxy Configuration

Set `TRUSTED_PROXY_CIDRS` to the CIDR of the reverse proxy or load balancer.

Example: `TRUSTED_PROXY_CIDRS=10.0.0.0/24,172.16.0.0/12`

Without this, all forwarded headers are ignored and `RemoteAddr` is used.

## 5. Application Container

- Base: `alpine:3.19`
- Runtime user: `appuser` (non-root, UID:GID created at build time)
- Read-only root filesystem with `tmpfs` for `/tmp`
- No shell entrypoint (direct `./server` binary)
- Health check: `GET /api/live`
- No source code, Go toolchain, Node, or npm in final image
- Build metadata injected via `-ldflags`

## 6. PostgreSQL Persistence

- PostgreSQL 16 container (or managed service)
- Volume for `/var/lib/postgresql/data`
- DB port NOT exposed to host in production
- App connects via internal Docker network
- TLS for database connections (future)
- Regular backups via `backup_postgres_2026.ps1`

## 7. Upload Persistence

- Docker named volume or host-mounted directory
- Mapped to `/app/uploads` in container
- Only JPEG, PNG, WebP allowed (content-based MIME detection)
- Random server-generated filenames
- 5 MB per file limit (configurable)

## 8. Secrets Injection

All secrets are passed as environment variables **at runtime**, never embedded in the image:

| Variable | Source |
|----------|--------|
| `JWT_SECRET` | External secret manager or env file |
| `GROQ_API_KEY` | External secret manager or env file |
| `METRICS_TOKEN` | External secret manager or env file |
| `DATABASE_URL` | Includes credentials from secret manager |
| `DB_PASSWORD` | Docker secret or env variable |

The image contains **zero** hardcoded secrets.

## 9. CORS Origins

Production: explicit allowlist via `CORS_ORIGINS`.

Example: `CORS_ORIGINS=https://agentone.ru,https://shop.agentone.ru`

Wildcard `*` is rejected in production. `Origin: null` is not allowed unless explicitly listed.

## 10. Metrics/Ops Endpoint Protection

- `/api/metrics` and `/api/ops/status` require `METRICS_TOKEN` (Bearer) in production.
- Disabled by default. Enable with `METRICS_ENABLED=true`.
- Token must be >= 12 characters.

## 11. Health Checks

| Endpoint | Purpose | Auth |
|----------|---------|------|
| `/api/live` | Container liveness | None |
| `/api/ready` | Database + dependency readiness | None |
| `/api/health` | Legacy health | None |

## 12. Backup Scheduler Requirement

Automated backup scheduling is **not yet configured**. Current backup is manual via:

```
powershell -File scripts/backup_postgres_2026.ps1
```

Production requires a cron job or scheduled task to run backup + retention daily.

## 13. Log Collection Requirement

Structured logs are emitted to stdout via `slog`. Production requires log aggregation (e.g., filebeat, fluentd, cloud logging agent). Not yet configured.

## 14. Resource Sizing Assumptions

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| App CPU | 0.5 core | 1 core |
| App Memory | 256 MB | 512 MB |
| DB CPU | 0.5 core | 1 core |
| DB Memory | 512 MB | 1 GB |
| Disk (DB) | 1 GB | 10 GB |
| Disk (Uploads) | 100 MB | 1 GB |

## 15. Scaling Constraints

- Single instance (monolith). No horizontal scaling without external session/rate-limit store.
- In-memory rate limiter and brute-force limiter not shared across instances.
- Database is the scaling bottleneck. Connection pooling via `database/sql`.

## 16. Database Migration Approach

Current: auto-migration on startup (`CREATE TABLE IF NOT EXISTS`). No versioned migrations.

Production recommendation: extract to versioned migration tool before first production deploy.

## 17. Rollback Design

1. Identify verified checkpoint (`<your-backup-directory>\...`).
2. Restore database from checkpoint dump.
3. Redeploy previous container image or rebuild from checkpoint source.
4. Verify live/ready/frontend.

## 18. Zero/Low-Downtime Future Design

Not supported in current single-instance architecture. Requires:
- Blue-green deployment with two instances.
- Database migration compatibility.
- Session-independent auth (JWT is stateless, which helps).

## 19. Security Boundaries

| Boundary | Control |
|----------|---------|
| Internet → Reverse Proxy | TLS, WAF (future) |
| Reverse Proxy → App | Internal network, trusted CIDR |
| App → Database | Internal network, no public port |
| App → AI Provider | Internal proxy (localhost:18080) |
| App → File System | Read-only root, tmpfs for temp |

## 20. Known Limitations

- **Production deployment has not been performed.**
- Cloud provider not selected.
- Container registry not configured.
- TLS certificate automation not configured.
- WAF/CDN not configured.
- Centralized secrets manager not connected.
- Automated backup scheduler not configured.
- Backup encryption not configured.
- No external vulnerability scanner.
- No penetration test.
- In-memory rate limiter not distributed across replicas.
- No horizontal scaling without architecture changes.
