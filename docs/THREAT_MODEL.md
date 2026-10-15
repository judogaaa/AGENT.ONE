# AGENT.ONE Threat Model

Structured using STRIDE methodology.

## Assets

| Asset | Sensitivity | Location |
|-------|-------------|----------|
| User credentials (email, bcrypt hash) | High | PostgreSQL `profiles` |
| JWT tokens | High | Client storage, in transit |
| Business verification data | High | PostgreSQL `verification_requests` |
| Product/order/lead data | Medium | PostgreSQL |
| Uploaded images | Low | Filesystem `uploads/` |
| Database backups | High | Backup directory |
| Metrics token | High | Environment variable |
| Operational endpoints | Medium | `/api/metrics`, `/api/ops/status` |
| AI provider key (GROQ_API_KEY) | High | Environment variable |
| Git history and checkpoints | Medium | Filesystem |

## Threats

### Spoofing

| Threat | Asset | Current Mitigation | Residual Risk | Recommended |
|--------|-------|-------------------|---------------|-------------|
| Forged JWT | JWT | HMAC-SHA256 signature, constant-time verify | Medium | Add `iss`/`aud` claims |
| Forged X-Forwarded-For | IP logging | Trusted proxy CIDR filter | Low | Leave as-is |
| Forged business verification | Verification data | Manual review required | Medium | Add document validation |

### Tampering

| Threat | Asset | Current Mitigation | Residual Risk | Recommended |
|--------|-------|-------------------|---------------|-------------|
| Request body tampering | Data integrity | JSON decode validation, body size limits | Low | Leave as-is |
| Database tampering | All data | PostgreSQL auth, no public port | Low | Enable TLS for DB connections |
| Backup tampering | Backups | SHA256 checksums | Low | Leave as-is |

### Repudiation

| Threat | Asset | Current Mitigation | Residual Risk | Recommended |
|--------|-------|-------------------|---------------|-------------|
| Action denial | Audit trail | `audit_events` table with IP, user-agent | Medium | Add request ID to audit events |

### Information Disclosure

| Threat | Asset | Current Mitigation | Residual Risk | Recommended |
|--------|-------|-------------------|---------------|-------------|
| Secret in logs | JWT, GROQ key | Not logged (by design) | Low | Leave as-is |
| Secret in metrics | Metrics token | Token not included in metric output | Low | Leave as-is |
| Stack trace in error | Code paths | Panic recovery returns generic 500 | Low | Leave as-is |
| SQL error in response | DB schema | Error response sanitization | Medium | Safe error middleware added |
| Metrics endpoint exposure | System state | Bearer token required in production | Low | Leave as-is |

### Denial of Service

| Threat | Asset | Current Mitigation | Residual Risk | Recommended |
|--------|-------|-------------------|---------------|-------------|
| Request flood | Availability | Rate limiter (in-memory) | Medium | Distributed rate limiting |
| Large body upload | Disk, memory | Body/upload size limits | Low | Leave as-is |
| Slowloris | Connections | Read/Write/Idle timeouts | Low | Leave as-is |
| Auth brute force | User accounts | Per-email+IP failure limit, lockout | Low | Leave as-is |

### Elevation of Privilege

| Threat | Asset | Current Mitigation | Residual Risk | Recommended |
|--------|-------|-------------------|---------------|-------------|
| Role escalation | Authorization | JWT role check per handler | Low | Leave as-is |
| IDOR on shop data | Other shops | Shop ownership check per handler | Low | Leave as-is |
| Dev token in production | Admin access | Config validation exits on DEV_ADMIN_TOKEN in prod | Low | Leave as-is |
| Metrics token guess | Metrics | 12+ char token, constant-time compare | Low | Leave as-is |

## Cross-Cutting Concerns

### AI-Specific

| Threat | Asset | Current Mitigation | Residual Risk | Recommended |
|--------|-------|-------------------|---------------|-------------|
| Prompt injection | AI responses | Message sanitization (zero-width chars, control chars) | Medium | Add content safety filter |
| AI hallucinated claims | Business liability | System prompt forbids inventing warranty/delivery/pricing | Medium | Human review of AI responses |
| AI provider key leak | GROQ_API_KEY | Proxy via localhost:18080, not embedded in source | Low | Leave as-is |

### Supply Chain

| Threat | Asset | Current Mitigation | Residual Risk | Recommended |
|--------|-------|-------------------|---------------|-------------|
| Malicious dependency | Build pipeline | Go module proxy, npm lockfile | Medium | Dependency scanning |
| CI secret exposure | CI pipeline | `contents: read` permissions, no secrets in workflow | Low | Leave as-is |
| Malicious restore | Database | Checksum verification before restore | Low | Leave as-is |

## Verification Methods

- Go unit tests for security hardening, CORS, proxy, limits, auth
- Operational audit (152 checks)
- Container security audit
- Security hardening audit (100+ checks)
- Static analysis (gofmt, go vet)
- Runtime integration tests
- Browser E2E tests

## Residual Risk Statement

This threat model reflects the **current deployed state** (no production deployment). Several mitigations are in place but have not been verified under real production load. The following controls are **not yet implemented**:

- No production deployment
- No external vulnerability scanner
- No penetration test
- No WAF/CDN
- No centralized secrets manager
- No distributed rate limiting
- No backup encryption
