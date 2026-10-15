# AGENT.ONE Security Policy

## Supported Branch

The `main` branch receives security fixes.

## Reporting a Vulnerability

Report vulnerabilities privately through GitHub private vulnerability reporting if enabled, or another non-public maintainer contact channel.

Do NOT publish vulnerabilities publicly before they are fixed.

## What to Include in a Report

1. Affected component (endpoint, middleware, config).
2. Steps to reproduce.
3. Observed vs expected behavior.
4. Whether you believe data was exposed.
5. Whether a proof-of-concept is available.

## What NOT to Include

- Real production credentials or tokens.
- Customer personal data.
- Actual database dumps.
- Full environment dumps.

## Severity Guidance

| Level | Criteria |
|-------|----------|
| Critical | Unauthenticated RCE, JWT key exposure, database credential leak, full data exfiltration |
| High | Auth bypass, IDOR on sensitive data, upload/body handling bypass, metrics token leak |
| Medium | Information disclosure (non-sensitive), misconfiguration without exploit |
| Low | Best-practice deviation, missing header with no known exploit |

## No Bug Bounty

There is currently no bug bounty program. Responsible disclosure is appreciated.

## No SLA

Response time is not guaranteed. Severity assessments are best-effort.

## Security Limitations

- This repository does not certify the security of any independently deployed instance.
- No external vulnerability scanner.
- No penetration test.
- Backup encryption not configured.
- No WAF or CDN.
- In-memory rate limiter not distributed across replicas.

## Related Documents

- `docs/THREAT_MODEL.md` — structured threat analysis.
- `docs/INCIDENT_RUNBOOK.md` — incident response procedures.
- `SECURITY.md` — this file.
