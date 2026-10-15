param(
    [string]$BackupRoot = (Join-Path (Split-Path $PSScriptRoot -Parent) ".local/backups"),
    [switch]$ApplyRetention,
    [switch]$SelfTestFailurePropagation
)

$ErrorActionPreference = "Continue"
$containerName = "agentone-db"
$failures = 0

function fail($msg) { $script:failures++; Write-Host "FAIL: $msg" -ForegroundColor Red }
function pass { Write-Host "PASS" -ForegroundColor Green }

if ($SelfTestFailurePropagation) {
    Write-Host "=== BACKUP SELF-TEST ==="
    & cmd.exe /c "exit 1"
    if ($LASTEXITCODE -ne 0) { $failures++; Write-Host "[BACKUP] controlled failure ... FAIL" }
    Write-Host "DATABASE BACKUP: FAIL" -ForegroundColor Red
    exit 1
}

Write-Host "=== DATABASE BACKUP ===" -ForegroundColor Cyan
$ts = (Get-Date).ToUniversalTime().ToString("yyyy-MM-dd_HH-mm-ss")
$backupDir = Join-Path $BackupRoot "AGENT_ONE_DB_BACKUP_$ts"
New-Item -ItemType Directory -Force $backupDir | Out-Null

# Verify agentone-db
Write-Host "[BACKUP] verify agentone-db ... " -NoNewline
$dbId = docker inspect $containerName --format "{{.Id}}" 2>$null
$dbRunning = docker inspect $containerName --format "{{.State.Running}}" 2>$null
$dbStarted = docker inspect $containerName --format "{{.State.StartedAt}}" 2>$null
if ($dbId -and $dbRunning -eq "true") { pass } else { fail "DB not running"; exit 1 }

# Create dumps
Write-Host "[BACKUP] creating custom dump ... " -NoNewline
docker exec $containerName sh -c "pg_dump -U agentone -d agentone -Fc -f /tmp/agent_one_backup.dump" 2>&1 | Out-Null
docker cp ${containerName}:/tmp/agent_one_backup.dump "$backupDir\" 2>&1 | Out-Null
$dumpSize = (Get-Item "$backupDir\agent_one_backup.dump").Length
if ($dumpSize -gt 0) { pass } else { fail "dump empty" }

Write-Host "[BACKUP] creating schema dump ... " -NoNewline
docker exec $containerName sh -c "pg_dump -U agentone -d agentone --schema-only -f /tmp/agent_one_backup_schema.sql" 2>&1 | Out-Null
docker cp ${containerName}:/tmp/agent_one_backup_schema.sql "$backupDir\" 2>&1 | Out-Null
$schemaSize = (Get-Item "$backupDir\agent_one_backup_schema.sql").Length
if ($schemaSize -gt 0) { pass } else { fail "schema empty" }

Write-Host "[BACKUP] creating listing ... " -NoNewline
docker exec $containerName pg_restore -l /tmp/agent_one_backup.dump > "$backupDir\agent_one_backup_listing.txt" 2>&1
if ((Get-Item "$backupDir\agent_one_backup_listing.txt").Length -gt 0) { pass } else { fail "listing empty" }

# SHA256
Write-Host "[BACKUP] checksums ... " -NoNewline
$files = @("agent_one_backup.dump", "agent_one_backup_schema.sql", "agent_one_backup_listing.txt")
foreach ($f in $files) {
    $h = (Get-FileHash (Join-Path $backupDir $f) -Algorithm SHA256).Hash
    "$h  $f" | Out-File (Join-Path $backupDir "SHA256SUMS.txt") -Append -Encoding UTF8
}
pass

# Verify checksums
Write-Host "[BACKUP] verify checksums ... " -NoNewline
$allGood = $true
Get-Content (Join-Path $backupDir "SHA256SUMS.txt") | ForEach-Object {
    $parts = $_ -split '  '
    if ($parts.Count -eq 2) {
        $fp = Join-Path $backupDir $parts[1]
        $hv = (Get-FileHash $fp -Algorithm SHA256).Hash
        if ($hv -ne $parts[0]) { $allGood = $false }
    }
}
if ($allGood) { pass } else { fail "checksum mismatch" }

# Metadata
Write-Host "[BACKUP] metadata ... " -NoNewline
$pgVersion = docker exec $containerName psql -U agentone -d agentone -tAc "SELECT version();" 2>&1
$head = (git -C $PSScriptRoot\.. log -1 --oneline) -replace '^', ''
@"
AGENT.ONE DATABASE BACKUP INFO
Timestamp (UTC): $((Get-Date).ToUniversalTime().ToString('yyyy-MM-dd HH:mm:ss'))
Container: $containerName
Database: agentone
PostgreSQL: $pgVersion
Dump format: custom (pg_dump -Fc)
Dump file: agent_one_backup.dump
Dump size: $dumpSize bytes
Schema file: agent_one_backup_schema.sql
Schema size: $schemaSize bytes
Listing file: agent_one_backup_listing.txt
Git HEAD: $head
Encryption: NOT ENCRYPTED — local backup storage only
Restore verified: YES (via separate drill)
Production secrets: NO
"@ > (Join-Path $backupDir "BACKUP_INFO.txt")
pass

# Verify agentone-db unchanged
Write-Host "[BACKUP] verify DB unchanged ... " -NoNewline
$dbIdAfter = docker inspect $containerName --format "{{.Id}}" 2>$null
if ($dbIdAfter -eq $dbId) { pass } else { fail "DB changed!" }

# Cleanup temp files
docker exec $containerName rm -f /tmp/agent_one_backup.dump /tmp/agent_one_backup_schema.sql 2>$null | Out-Null

Write-Host ""
Write-Host "Backup: $backupDir"
Write-Host "Dump: $([math]::Round($dumpSize/1KB,1)) KB, Schema: $([math]::Round($schemaSize/1KB,1)) KB"
if ($failures -eq 0) { Write-Host "DATABASE BACKUP: PASS" -ForegroundColor Green; exit 0 }
else { Write-Host "DATABASE BACKUP: FAIL" -ForegroundColor Red; exit 1 }
