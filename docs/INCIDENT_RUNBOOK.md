# AGENT.ONE Incident Runbook

> Reference to latest verified checkpoint: `AGENT_ONE_CHECKPOINT_AFTER_RELEASE_READINESS_VALID_2026-07-09_13-02-50`

## Severity Classification

- **SEV-1**: Production down — service unreachable, database offline, all endpoints return 5xx.
- **SEV-2**: Degraded — partial outage, slow responses, specific endpoints failing.
- **SEV-3**: Minor — non-critical feature broken, tests failing, low-impact regression.

## First 15 Minutes — Immediate Response

1. Check `/api/live` and `/api/ready`.
2. Check `/api/metrics` (if enabled) for error spikes.
3. Search structured logs by `X-Request-ID` from affected clients.
4. Check database health: `docker exec agentone-db pg_isready -U agentone`.
5. Check disk space and container uptime.

## Evidence Preservation

1. Save relevant log lines to a temporary file.
2. Note timestamps (UTC) of first and last observed failure.
3. Do NOT delete or restart containers before preserving state.
4. Capture `docker inspect agentone-db` output.

## Service Health Checks

1. `GET /api/live` — should return 200 with `"status": "live"`.
2. `GET /api/ready` — should return 200 with `"status": "ready"`.
3. Subdomain/HostHeader resolution intact — test with `shop-name.agentone.ru`.

## Database Health Checks

1. PostgreSQL connection: `docker exec agentone-db psql -U agentone -d agentone -c "SELECT 1"`.
2. Table integrity: `SELECT COUNT(*) FROM products`, `SELECT COUNT(*) FROM shops`.
3. Replication status: `docker exec agentone-db psql -U agentone -c "SELECT pg_is_in_recovery()"`.

## Metrics Checks

1. Check 5xx error rate via `/api/metrics`.
2. Check active request count — sustained high values indicate backlog.
3. Check panic counter — any non-zero value requires investigation.
4. Check readiness failure counter — sustained failures indicate DB issue.

## Log Checks by Request ID

1. Extract `X-Request-ID` from affected client request headers.
2. Search structured logs: `grep "<request-id>" server/logs/*`.
3. Trace the full request lifecycle: start → middleware → handler → response.

## Secret Exposure Response

1. **Rotate the exposed secret immediately**: generate a new value.
2. Example for `JWT_SECRET`: generate new value, set in environment, restart server.
3. Verify `/api/auth/signin` still works after rotation.
4. Audit logs — ensure the secret value was never logged.
5. If secret was committed to repository: force-push cleaned history, rotate secret.

## Database Corruption Response

1. Do NOT attempt live repair on production container.
2. Select the most recent verified backup with valid `BACKUP_INFO.txt` and `SHA256SUMS.txt`.
3. Run restore drill: `powershell -File scripts/database_restore_drill_2026.ps1 -BackupPath <path>`.
4. Verify table counts, sample product data, and auth flow.
5. If drill passes, apply restore to production using the same procedure.

## Failed Deployment Response

1. Identify which commit introduced the failure.
2. Check `go vet ./cmd`, Go unit tests, and audit scripts.
3. If the failure is confirmed: revert to the previous verified checkpoint.
4. The latest verified checkpoint is: `AGENT_ONE_CHECKPOINT_AFTER_RELEASE_READINESS_VALID_2026-07-09_13-02-50`.

## High 5xx Response

1. Check `/api/metrics` for 5xx counter spike timing.
2. Check recent deployment or config change.
3. Check database connection: run `/api/ready`.
4. Check panic recovery counter — if non-zero, examine panic messages in logs.
5. Check resource exhaustion: open file descriptors, memory, connection pool.

## AI Provider Outage

1. Check if AI_PROVIDER is set and whether the provider is reachable.
2. Verify fallback mode is enabled (rule_based or empty AI_PROVIDER).
3. If primary provider down: system should degrade to rule_based fallback automatically.
4. Monitor `/api/ready` — AI provider outage should NOT affect readiness.

## Rollback Decision

1. Determine if the issue is introduced by a recent code change.
2. If yes: revert to previous verified checkpoint.
3. The current verified checkpoint is: `AGENT_ONE_CHECKPOINT_AFTER_RELEASE_READINESS_VALID_2026-07-09_13-02-50`.
4. Verify rollback by running full CI pipeline: static+unit → integration → E2E → release-readiness → operational.
5. Inform stakeholders after rollback is complete.

## Backup Selection

1. Browse backup directories: `./.local/backups/AGENT_ONE_DB_BACKUP_*`.
2. Verify `BACKUP_INFO.txt` and `SHA256SUMS.txt` exist and are valid.
3. Run checksum verification: re-compute SHA256 for all files and compare.
4. Select the most recent backup that passes all verification checks.

## Restore Drill Procedure

1. Ensure agentone-db is NOT stopped during the drill.
2. Run: `powershell -File scripts/database_restore_drill_2026.ps1 -BackupPath <selected_backup>`.
3. Confirm tables > 0, products count > 0, shops count > 0, profiles count > 0.
4. Note restore duration.
5. Confirm agentone-db unchanged (same container ID, state, StartedAt).
6. Confirm port 60432 is freed after drill.

## Customer Communication Principles

1. Be transparent but concise.
2. Do not share internal details (secrets, paths, versions) with customers.
3. Provide estimated resolution time if known.
4. Update storefront or status page if available.

## Post-Incident Review

1. Review all evidence collected during the incident.
2. Identify root cause (not just symptom).
3. Document the timeline (UTC timestamps).
4. Propose prevention measures (new tests, validation, monitoring).
5. Update this runbook with any new procedures discovered.
