# AGENT.ONE Recovery Objectives

## RPO — Recovery Point Objective

**Current target**: 24 hours.

The RPO is the maximum acceptable data loss measured in time. For AGENT.ONE, this means:
- If a catastrophic failure occurs, at most 24 hours of data may be lost.
- This depends on backup frequency — backups created less frequently increase potential data loss.
- Until an automated backup scheduler is configured, actual RPO may vary.

## RTO — Recovery Time Objective

**Current target**: 2 hours.

The RTO is the time to restore service after a failure. This includes:
1. Identifying the most recent valid backup.
2. Running the disposable restore drill (`scripts/database_restore_drill_2026.ps1`).
3. Verifying table counts, product data, and auth flow.
4. Promoting the restored database to production.
5. Verifying `/api/live` and `/api/ready` return 200.

Each restore drill records actual restore duration. Tracked durations should be reviewed to refine the RTO target.

## Important Caveats

These targets are **not guarantees**:
- No automated production scheduler is yet configured.
- Backup encryption is not yet configured.
- External metric storage is not connected.
- No centralized log storage.
- No alert manager.
- No multi-region recovery.
- Real production deployment is not yet performed.

## Retention

Backup retention keeps the **last 14 valid daily backups**. Older backups are removed with `-ApplyRetention`. Checkpoints are never deleted by DB retention. For full retention policy, see `BACKUP_RETENTION_POLICY.md`.
