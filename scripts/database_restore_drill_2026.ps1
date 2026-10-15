param(
    [string]$BackupPath,
    [switch]$SelfTestFailurePropagation
)

$ErrorActionPreference = "Continue"
$vName = "agentone-ops-restore-db"
$dbPort = "60432"
$dbUser = "ops_restore"
$dbPass = "ops_restore"
$dbName = "ops_restore"
$script:failures = 0

function recordFailure($msg) { $script:failures++; Write-Host "DRILL:FAIL $msg" -ForegroundColor Red }
function pass { Write-Host "PASS" -ForegroundColor Green }

function Convert-CommandOutputToText {
    param([object[]]$Output)
    if ($null -eq $Output) { return "" }
    return (@($Output | ForEach-Object { if ($null -eq $_) { "" } else { $_.ToString() } }) -join [Environment]::NewLine).Trim()
}

if ($SelfTestFailurePropagation) {
    Write-Host "=== RESTORE DRILL SELF-TEST ==="
    & cmd.exe /c "exit 1"
    if ($LASTEXITCODE -ne 0) { recordFailure "controlled failure"; Write-Host "DATABASE RESTORE DRILL: FAIL" -ForegroundColor Red; exit 1 }
    exit 2
}

# ─── Find backup ───

if (-not $BackupPath) {
    $root = Join-Path (Split-Path $PSScriptRoot -Parent) ".local/backups"
    if (-not (Test-Path $root)) { recordFailure "No backup root"; Write-Host "DATABASE RESTORE DRILL: FAIL" -ForegroundColor Red; exit 1 }
    $dirs = Get-ChildItem $root -Directory -Filter "AGENT_ONE_DB_BACKUP_*" | Sort-Object Name -Descending
    foreach ($d in $dirs) {
        if ((Test-Path (Join-Path $d.FullName "BACKUP_INFO.txt")) -and (Test-Path (Join-Path $d.FullName "SHA256SUMS.txt"))) {
            $BackupPath = $d.FullName; break
        }
    }
    if (-not $BackupPath) { recordFailure "No valid backup found"; Write-Host "DATABASE RESTORE DRILL: FAIL" -ForegroundColor Red; exit 1 }
}
Write-Host "=== DATABASE RESTORE DRILL ===" -ForegroundColor Cyan
Write-Host "Backup: $BackupPath"

# ─── Verify checksums ───

Write-Host "[DRILL] verify backup checksums ... " -NoNewline
$shaFile = Join-Path $BackupPath "SHA256SUMS.txt"
if (-not (Test-Path $shaFile)) { recordFailure "SHA256SUMS.txt missing"; Write-Host "DATABASE RESTORE DRILL: FAIL" -ForegroundColor Red; exit 1 }
$allGood = $true
Get-Content $shaFile | ForEach-Object {
    $p = $_ -split '  '
    if ($p.Count -eq 2) {
        $fp = Join-Path $BackupPath $p[1]
        if (Test-Path $fp) {
            $hash = (Get-FileHash $fp -Algorithm SHA256).Hash
            if ($hash -ne $p[0]) { $allGood = $false }
        } else { $allGood = $false }
    }
}
if ($allGood) { pass } else { recordFailure "checksum mismatch"; Write-Host "DATABASE RESTORE DRILL: FAIL" -ForegroundColor Red; exit 1 }

# ─── Verify dump with listing ───

$dumpFile = Join-Path $BackupPath "agent_one_backup.dump"
if (-not (Test-Path $dumpFile)) { recordFailure "dump file missing"; Write-Host "DATABASE RESTORE DRILL: FAIL" -ForegroundColor Red; exit 1 }

# ─── Snapshot agentone-db ───

$dbIdRaw = & docker inspect agentone-db --format "{{.Id}}" 2>&1; $dbIdCode = $LASTEXITCODE; $dbId = Convert-CommandOutputToText $dbIdRaw
if ($dbIdCode -ne 0 -or [string]::IsNullOrWhiteSpace($dbId)) { recordFailure "agentone-db not accessible"; Write-Host "DATABASE RESTORE DRILL: FAIL" -ForegroundColor Red; exit 1 }
Write-Host "[DRILL] verify agentone-db unchanged ... Before ID: $dbId"

$dbRunningRaw = & docker inspect agentone-db --format "{{.State.Running}}" 2>&1; $dbRunning = Convert-CommandOutputToText $dbRunningRaw
$dbStartedRaw = & docker inspect agentone-db --format "{{.State.StartedAt}}" 2>&1; $dbStarted = Convert-CommandOutputToText $dbStartedRaw

# ─── Remove old container ───

& docker rm -f $vName 2>$null | Out-Null

# ─── Check port ───

Write-Host "[DRILL] check port $dbPort ... " -NoNewline
$existing = Get-NetTCPConnection -LocalPort $dbPort -State Listen -ErrorAction SilentlyContinue
if ($existing) { recordFailure "port $dbPort already has LISTEN socket"; Write-Host "DATABASE RESTORE DRILL: FAIL" -ForegroundColor Red; exit 1 }
pass

# ─── Start PostgreSQL ───

Write-Host "[DRILL] start restore container ... " -NoNewline
$drRaw = & docker run -d --name $vName -e POSTGRES_USER=$dbUser -e POSTGRES_PASSWORD=$dbPass -e POSTGRES_DB=$dbName -p ${dbPort}:5432 postgres:16 2>&1
$drCode = $LASTEXITCODE
if ($drCode -ne 0) { recordFailure "container start failed: $(Convert-CommandOutputToText $drRaw)"; Write-Host "DATABASE RESTORE DRILL: FAIL" -ForegroundColor Red; exit 1 }
$ready = $false
for ($i=0; $i -lt 25; $i++) {
    Start-Sleep 2
    & docker exec $vName pg_isready -U $dbUser 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
}
if (-not $ready) { recordFailure "pg_isready timeout"; & docker rm -f $vName 2>$null | Out-Null; Write-Host "DATABASE RESTORE DRILL: FAIL" -ForegroundColor Red; exit 1 }
Write-Host "waiting for full startup ..." -NoNewline; Start-Sleep 5; pass

$restoreSuccess = $false
try {
    # ─── Restore ───

    Write-Host "[DRILL] restoring ... " -NoNewline
    $start = Get-Date
    & docker cp "$dumpFile" ${vName}:/tmp/dump.dump 2>$null | Out-Null
    $pgRestoreRaw = & docker exec $vName pg_restore -U $dbUser -d $dbName --no-owner /tmp/dump.dump 2>&1
    $pgRestoreCode = $LASTEXITCODE
    $duration = [math]::Round(((Get-Date) - $start).TotalSeconds, 1)
    if ($pgRestoreCode -ne 0) { recordFailure "pg_restore failed (exit $pgRestoreCode): $((Convert-CommandOutputToText $pgRestoreRaw).Substring(0,[Math]::Min(200,(Convert-CommandOutputToText $pgRestoreRaw).Length)))" }
    else { pass }

    if ($pgRestoreCode -eq 0) {
        # Re-verify pg_isready
        & docker exec $vName pg_isready -U $dbUser 2>$null | Out-Null
        if ($LASTEXITCODE -ne 0) { recordFailure "pg_isready failed after restore" }

        # ─── SQL verification with -h 127.0.0.1 and ON_ERROR_STOP ───

        $psqlBase = @("-h", "127.0.0.1", "-X", "-v", "ON_ERROR_STOP=1", "-U", $dbUser, "-d", $dbName, "-tAc")

        Write-Host "[DRILL] verify restore ... " -NoNewline

        $tablesRaw = & docker exec $vName psql -h 127.0.0.1 -X -v ON_ERROR_STOP=1 -U $dbUser -d $dbName -tAc "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';" 2>&1
        $tablesCode = $LASTEXITCODE; $tablesText = Convert-CommandOutputToText $tablesRaw
        if ($tablesCode -ne 0 -or $tablesText -notmatch '^\d+$') { recordFailure "tables count invalid: $tablesText" }

        $prodRaw = & docker exec $vName psql -h 127.0.0.1 -X -v ON_ERROR_STOP=1 -U $dbUser -d $dbName -tAc "SELECT COUNT(*) FROM products;" 2>&1
        $prodCode = $LASTEXITCODE; $prodText = Convert-CommandOutputToText $prodRaw
        if ($prodCode -ne 0 -or $prodText -notmatch '^\d+$') { recordFailure "products count invalid: $prodText" }

        $shopRaw = & docker exec $vName psql -h 127.0.0.1 -X -v ON_ERROR_STOP=1 -U $dbUser -d $dbName -tAc "SELECT COUNT(*) FROM shops;" 2>&1
        $shopCode = $LASTEXITCODE; $shopText = Convert-CommandOutputToText $shopRaw
        if ($shopCode -ne 0 -or $shopText -notmatch '^\d+$') { recordFailure "shops count invalid: $shopText" }

        $profRaw = & docker exec $vName psql -h 127.0.0.1 -X -v ON_ERROR_STOP=1 -U $dbUser -d $dbName -tAc "SELECT COUNT(*) FROM profiles;" 2>&1
        $profCode = $LASTEXITCODE; $profText = Convert-CommandOutputToText $profRaw
        if ($profCode -ne 0 -or $profText -notmatch '^\d+$') { recordFailure "profiles count invalid: $profText" }

        if ($script:failures -eq 0) {
            $tablesVal = [int]$tablesText; $prodVal = [int]$prodText; $shopVal = [int]$shopText; $profVal = [int]$profText
            Write-Host "tables=$tablesVal products=$prodVal shops=$shopVal profiles=$profVal dur=${duration}s"
            # Reconnect test
            $rcRaw = & docker exec $vName psql -h 127.0.0.1 -X -v ON_ERROR_STOP=1 -U $dbUser -d $dbName -tAc "SELECT 1;" 2>&1
            $rcCode = $LASTEXITCODE; $rcText = Convert-CommandOutputToText $rcRaw
            if ($rcCode -ne 0 -or $rcText.Trim() -ne "1") { recordFailure "reconnect failed: $rcText" }
            else { Write-Host "[DRILL] verify restore ... PASS" -ForegroundColor Green; $restoreSuccess = $true }
        }
        else { Write-Host "tables=$tablesText products=$prodText shops=$shopText profiles=$profText dur=${duration}s" }
    }
}
finally {
    # ─── Cleanup ───

    Write-Host "[DRILL] cleanup ... " -NoNewline
    & docker rm -f $vName 2>$null | Out-Null
    $left = & docker ps -a --filter "name=^/$vName$" --format "{{.Names}}" 2>&1
    if ((Convert-CommandOutputToText $left) -ne "") { recordFailure "failed to remove $vName" }
    else { pass }

    # ─── Verify port free ───
    Write-Host "[DRILL] port $dbPort free ... " -NoNewline
    $portFree = $false
    for ($i = 0; $i -lt 20; $i++) {
        $listeners = Get-NetTCPConnection -LocalPort $dbPort -State Listen -ErrorAction SilentlyContinue
        if (-not $listeners) { $portFree = $true; break }
        Start-Sleep -Milliseconds 500
    }
    if ($portFree) { pass } else { recordFailure "port $dbPort still LISTEN after cleanup" }

    # ─── Verify agentone-db unchanged ───

    Write-Host "[DRILL] agentone-db after ... " -NoNewline
    $dbIdAfterRaw = & docker inspect agentone-db --format "{{.Id}}" 2>&1; $dbIdAfter = Convert-CommandOutputToText $dbIdAfterRaw
    $dbRunningAfterRaw = & docker inspect agentone-db --format "{{.State.Running}}" 2>&1; $dbRunningAfter = Convert-CommandOutputToText $dbRunningAfterRaw
    $dbStartedAfterRaw = & docker inspect agentone-db --format "{{.State.StartedAt}}" 2>&1; $dbStartedAfter = Convert-CommandOutputToText $dbStartedAfterRaw
    if ($dbIdAfter -ne $dbId) { recordFailure "agentone-db ID changed" }
    elseif ($dbRunningAfter -ne $dbRunning) { recordFailure "agentone-db state changed" }
    elseif ($dbStartedAfter -ne $dbStarted) { recordFailure "agentone-db StartedAt changed" }
    else { pass }
}

# ─── Final ───

Write-Host ""
if ($script:failures -eq 0) { Write-Host "DATABASE RESTORE DRILL: PASS" -ForegroundColor Green; exit 0 }
else { Write-Host "DATABASE RESTORE DRILL: FAIL ($script:failures failures)" -ForegroundColor Red; exit 1 }
