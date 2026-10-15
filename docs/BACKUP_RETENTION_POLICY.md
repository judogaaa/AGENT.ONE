# AGENT.ONE Backup Retention Policy

## Default: Dry-Run

Retention does not delete any backups unless `-ApplyRetention` is explicitly passed. Without this flag, the script only reports which backups would be deleted.

## Daily Retention

Keep the **last 14 valid daily backups**. This means:
- Minimum 14 valid backup directories are preserved at all times.
- Only directories matching pattern `AGENT_ONE_DB_BACKUP_YYYY-MM-DD_HH-mm-ss` are considered.
- Invalid/incomplete backups (without valid `BACKUP_INFO.txt` and `SHA256SUMS.txt`) do not count toward the 14-copy minimum.
- Backups younger than 24 hours are NOT eligible for deletion, even with `-ApplyRetention`.

## Checkpoint Protection

Verified checkpoint directories are never deleted by database retention. Checkpoints contain `BACKUP_INFO.txt` files that include the word "CHECKPOINT" and must not be purged automatically.

## Path Safety

- Only directories within the explicit `BackupRoot` path are processed.
- Canonical path resolution prevents symlink traversal.
- Recursive deletion outside `BackupRoot` is prevented.

## Usage

```
# Dry-run (safe, default)
powershell -File scripts/backup_retention_2026.ps1

# Dry-run with custom root
powershell -File scripts/backup_retention_2026.ps1 -BackupRoot D:\Backups\DB

# Apply retention (deletes old backups)
powershell -File scripts/backup_retention_2026.ps1 -ApplyRetention -BackupRoot D:\Backups\DB

# Self-test (temp dirs, no real backups affected)
powershell -File scripts/backup_retention_2026.ps1 -SelfTestFailurePropagation
```
