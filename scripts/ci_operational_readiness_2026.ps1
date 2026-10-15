param(
    [switch]$SelfTestFailurePropagation
)

. (Join-Path $PSScriptRoot "agentone-local-env.ps1")
$goExe = Resolve-AgentOneGo
$gofmtExe = Resolve-AgentOneGofmt
$ErrorActionPreference = "Continue"
$script:failures = 0
$projectRoot = Split-Path $PSScriptRoot -Parent

function recordFailure($msg) { $script:failures++; Write-Host "CI-OPS:FAIL $msg" -ForegroundColor Red }

function Convert-CommandOutputToText {
    param([object[]]$Output)
    if ($null -eq $Output) { return "" }
    return (@($Output | ForEach-Object { if ($null -eq $_) { "" } else { $_.ToString() } }) -join [Environment]::NewLine).Trim()
}

# ═══════════════════════════════════════════════════════════════
# SELF-TEST BARRIER — FIRST
# ═══════════════════════════════════════════════════════════════

if ($SelfTestFailurePropagation) {
    Write-Host "=== OPERATIONAL FAILURE PROPAGATION SELF-TEST ==="
    & cmd.exe /c "exit 1"
    $code = $LASTEXITCODE
    if ($code -ne 0) {
        Write-Host "[CI-OPS] controlled failure ... FAIL"
        Write-Host ""
        Write-Host "OPERATIONAL READINESS: FAIL"
        exit 1
    }
    Write-Host "Self-test command unexpectedly succeeded"
    exit 2
}

Write-Host "=== OPERATIONAL READINESS CI ===" -ForegroundColor Cyan

# ═══════════════════════════════════════════════════════════════
# Docker preflight
# ═══════════════════════════════════════════════════════════════

Write-Host "[CI-OPS] docker preflight ..."

$dvRaw = & docker version --format "{{.Server.Version}}" 2>&1; $dvCode = $LASTEXITCODE; $dvText = Convert-CommandOutputToText $dvRaw
if ($dvCode -ne 0 -or [string]::IsNullOrWhiteSpace($dvText)) { recordFailure "docker version failed: $dvText"; Write-Host "OPERATIONAL READINESS: FAIL" -ForegroundColor Red; exit 1 }

$diRaw = & docker info --format "{{.ServerVersion}}" 2>&1; $diCode = $LASTEXITCODE; $diText = Convert-CommandOutputToText $diRaw
if ($diCode -ne 0 -or [string]::IsNullOrWhiteSpace($diText)) { recordFailure "docker info failed: $diText"; Write-Host "OPERATIONAL READINESS: FAIL" -ForegroundColor Red; exit 1 }

$dbRaw = & docker inspect agentone-db --format "{{.Id}}" 2>&1; $dbCode = $LASTEXITCODE; $dbText = Convert-CommandOutputToText $dbRaw
$dbRunRaw = & docker inspect agentone-db --format "{{.State.Running}}" 2>&1; $dbRunCode = $LASTEXITCODE; $dbRunText = Convert-CommandOutputToText $dbRunRaw
if ($dbCode -ne 0 -or [string]::IsNullOrWhiteSpace($dbText)) { recordFailure "agentone-db not accessible: $dbText"; Write-Host "OPERATIONAL READINESS: FAIL" -ForegroundColor Red; exit 1 }
if ($dbRunText -ne "true") { recordFailure "agentone-db not running"; Write-Host "OPERATIONAL READINESS: FAIL" -ForegroundColor Red; exit 1 }

$dbIdBefore = $dbText
$dbStateBefore = $dbRunText
$dbStartedRaw = & docker inspect agentone-db --format "{{.State.StartedAt}}" 2>&1; $dbStartedCode = $LASTEXITCODE; $dbStartedBefore = Convert-CommandOutputToText $dbStartedRaw

Write-Host "[CI-OPS] docker preflight ... PASS" -ForegroundColor Green

# ═══════════════════════════════════════════════════════════════
# Go executable
# ═══════════════════════════════════════════════════════════════

if (-not (Test-Path $goExe)) { recordFailure "Go not found" }

function goTest() {
    $prev = Get-Location; Set-Location (Join-Path $projectRoot "server")
    & $goExe test ./cmd -count=1 2>&1 | Out-Host; $code = $LASTEXITCODE; Set-Location $prev; return $code
}
function goVet() {
    $prev = Get-Location; Set-Location (Join-Path $projectRoot "server")
    & $goExe vet ./cmd 2>&1 | Out-Host; $code = $LASTEXITCODE; Set-Location $prev; return $code
}
function goBuild($outPath) {
    $prev = Get-Location; Set-Location (Join-Path $projectRoot "server")
    & $goExe build -o $outPath ./cmd 2>&1 | Out-Host; $code = $LASTEXITCODE; Set-Location $prev; return $code
}

# ═══════════════════════════════════════════════════════════════
# Step 1: Operational audit
# ═══════════════════════════════════════════════════════════════

Write-Host "[CI-OPS] operational audit ..."
node (Join-Path $projectRoot "scripts/operational_readiness_audit_2026.mjs") 2>&1
if ($LASTEXITCODE -ne 0) { recordFailure "audit failed" } else { Write-Host "[CI-OPS] operational audit ... PASS" -ForegroundColor Green }

# ═══════════════════════════════════════════════════════════════
# Step 2-4: Go tests, vet, build
# ═══════════════════════════════════════════════════════════════

Write-Host "[CI-OPS] go test ./cmd ..."
$testCode = goTest
if ($testCode -ne 0) { recordFailure "go test failed (exit $testCode)" } else { Write-Host "[CI-OPS] go test ./cmd ... PASS" -ForegroundColor Green }

Write-Host "[CI-OPS] go vet ./cmd ..."
$vetCode = goVet
if ($vetCode -ne 0) { recordFailure "go vet failed (exit $vetCode)" } else { Write-Host "[CI-OPS] go vet ./cmd ... PASS" -ForegroundColor Green }

$tempBuildDir = Join-Path $env:TEMP "agent-one-build"
New-Item -ItemType Directory -Force $tempBuildDir 2>$null | Out-Null
$tempExe = Join-Path $tempBuildDir "agent-one-server.exe"
Write-Host "[CI-OPS] temp build ..."
$buildCode = goBuild $tempExe
if ($buildCode -ne 0) { recordFailure "build failed (exit $buildCode)" } else { Write-Host "[CI-OPS] temp build ... PASS" -ForegroundColor Green }

# ═══════════════════════════════════════════════════════════════
# Backup + Restore (with fail-fast)
# ═══════════════════════════════════════════════════════════════

$tempBackupRoot = Join-Path $env:TEMP "agent-one-operational-backups"
$backupSuccess = $false
$backupDir = $null

try {
    Write-Host "[CI-OPS] real backup ..."
    $backupScript = Join-Path $projectRoot "scripts/backup_postgres_2026.ps1"
    $backupOutput = & powershell -NoProfile -ExecutionPolicy Bypass -File $backupScript -BackupRoot $tempBackupRoot 2>&1
    $backupCode = $LASTEXITCODE
    Write-Host ($backupOutput | ForEach-Object { if ($null -eq $_) { "" } else { $_.ToString() } } | Out-String)
    if ($backupCode -ne 0) { recordFailure "real backup failed (exit $backupCode)" }

    if ($backupCode -eq 0) {
        Write-Host "[CI-OPS] real backup ... PASS" -ForegroundColor Green
        # Find created backup directory
        $backupDir = Get-ChildItem -LiteralPath $tempBackupRoot -Directory -Filter "AGENT_ONE_DB_BACKUP_*" -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
        if (-not $backupDir) { recordFailure "no backup directory found" }
        else {
            Write-Host "[CI-OPS] backup dir: $($backupDir.FullName)"
            $dumpPath = Join-Path $backupDir.FullName "agent_one_backup.dump"
            $schemaPath = Join-Path $backupDir.FullName "agent_one_backup_schema.sql"
            $shaPath = Join-Path $backupDir.FullName "SHA256SUMS.txt"
            $listingPath = Join-Path $backupDir.FullName "agent_one_backup_listing.txt"

            $allArtifactsOk = $true
            if (Test-Path -LiteralPath $dumpPath) {
                $dumpSize = (Get-Item -LiteralPath $dumpPath).Length
                if ($dumpSize -gt 0) { Write-Host "[CI-OPS] dump verified: $([math]::Round($dumpSize/1KB,1)) KB" } else { $allArtifactsOk = $false; recordFailure "dump empty" }
            } else { $allArtifactsOk = $false; recordFailure "dump file missing" }

            if (-not (Test-Path -LiteralPath $schemaPath)) { $allArtifactsOk = $false; recordFailure "schema file missing" }
            if (-not (Test-Path -LiteralPath $shaPath)) { $allArtifactsOk = $false; recordFailure "SHA256SUMS.txt missing" }
            if (-not (Test-Path -LiteralPath $listingPath)) { $allArtifactsOk = $false; recordFailure "listing file missing" }

            if ($allArtifactsOk) {
                # Verify SHA256
                $allGood = $true
                Get-Content -LiteralPath $shaPath | ForEach-Object {
                    $p = $_ -split '  '
                    if ($p.Count -eq 2) {
                        $fp = Join-Path $backupDir.FullName $p[1]
                        if (Test-Path -LiteralPath $fp) {
                            if ((Get-FileHash -LiteralPath $fp -Algorithm SHA256).Hash -ne $p[0]) { $allGood = $false }
                        }
                    }
                }
                if ($allGood) { Write-Host "[CI-OPS] checksum verify ... PASS" -ForegroundColor Green }
                else { $allArtifactsOk = $false; recordFailure "checksum mismatch" }
            }

            if ($allArtifactsOk) {
                # Run restore drill only if backup fully verified
                Write-Host "[CI-OPS] real restore drill ..."
                $drillScript = Join-Path $projectRoot "scripts/database_restore_drill_2026.ps1"
                $drillOutput = & powershell -NoProfile -ExecutionPolicy Bypass -File $drillScript -BackupPath $backupDir.FullName 2>&1
                $drillCode = $LASTEXITCODE
                Write-Host ($drillOutput | ForEach-Object { if ($null -eq $_) { "" } else { $_.ToString() } } | Out-String)
                $drillText = Convert-CommandOutputToText $drillOutput
                if ($drillCode -ne 0) { recordFailure "restore drill failed (exit $drillCode)" }
                elseif ($drillText -match "DATABASE RESTORE DRILL:\s*PASS") {
                    Write-Host "[CI-OPS] real restore drill ... PASS" -ForegroundColor Green
                    $backupSuccess = $true
                }
                else { recordFailure "restore drill missing PASS marker (exit $drillCode)" }
                # Reject any error markers in output even if exit was 0
                if ($drillText -match "ConvertToFinalInvalidCastException|RuntimeException|psql: error|DRILL:FAIL") {
                    recordFailure "restore drill output contains error markers"
                }
            }
        }
    }

    # Retention self-test (independent of backup success)
    Write-Host "[CI-OPS] retention self-test ..."
    $retScript = Join-Path $projectRoot "scripts/backup_retention_2026.ps1"
    $retOutput = & powershell -NoProfile -ExecutionPolicy Bypass -File $retScript -SelfTestFailurePropagation 2>&1
    $retCode = $LASTEXITCODE
    Write-Host ($retOutput | ForEach-Object { if ($null -eq $_) { "" } else { $_.ToString() } } | Out-String)
    if ($retCode -ne 0) { recordFailure "retention self-test failed (exit $retCode)" }
    else { Write-Host "[CI-OPS] retention self-test ... PASS" -ForegroundColor Green }

}
finally {
    Write-Host "[CI-OPS] cleanup ..."
    if (Test-Path -LiteralPath $tempBackupRoot) {
        Remove-Item -LiteralPath $tempBackupRoot -Recurse -Force -ErrorAction SilentlyContinue 2>$null | Out-Null
        if (Test-Path -LiteralPath $tempBackupRoot) { recordFailure "failed to remove temp backup root" }
    }
    $rcRaw = & docker ps -a --filter "name=^/agentone-ops-restore-db$" --format "{{.Names}}" 2>&1; $rcText = Convert-CommandOutputToText $rcRaw
    if ($rcText) { Write-Host "[CI-OPS] removing restore container..."; docker rm -f agentone-ops-restore-db 2>$null | Out-Null }
    Write-Host "[CI-OPS] cleanup ... PASS" -ForegroundColor Green
}

# ═══════════════════════════════════════════════════════════════
# Host-survival
# ═══════════════════════════════════════════════════════════════

Write-Host "[CI-OPS] host-survival ..."
$dbAfterRaw = & docker inspect agentone-db --format "{{.Id}}" 2>&1; $dbAfterCode = $LASTEXITCODE; $dbIdAfter = Convert-CommandOutputToText $dbAfterRaw
$dbStateAfterRaw = & docker inspect agentone-db --format "{{.State.Running}}" 2>&1; $dbStateCode = $LASTEXITCODE; $dbStateAfter = Convert-CommandOutputToText $dbStateAfterRaw
$dbStartedAfterRaw = & docker inspect agentone-db --format "{{.State.StartedAt}}" 2>&1; $dbStartedCode = $LASTEXITCODE; $dbStartedAfter = Convert-CommandOutputToText $dbStartedAfterRaw

if ($dbAfterCode -ne 0) { recordFailure "agentone-db post-check failed: $dbIdAfter" }
elseif ($dbIdAfter -ne $dbIdBefore) { recordFailure "agentone-db ID changed" }
elseif ($dbStateAfter -ne "true") { recordFailure "agentone-db not running after" }
elseif ($dbStartedAfter -ne $dbStartedBefore) { recordFailure "agentone-db StartedAt changed" }
else { Write-Host "[CI-OPS] agentone-db unchanged ... PASS" -ForegroundColor Green }

$portUsed = Get-NetTCPConnection -LocalPort 60432 -State Listen -ErrorAction SilentlyContinue
if ($portUsed) { recordFailure "port 60432 still LISTEN" } else { Write-Host "[CI-OPS] port 60432 free ... PASS" -ForegroundColor Green }

$restoreLeftRaw = & docker ps -a --filter "name=^/agentone-ops-restore-db$" --format "{{.Names}}" 2>&1; $restoreLeft = Convert-CommandOutputToText $restoreLeftRaw
if ($restoreLeft) { recordFailure "restore container not removed" } else { Write-Host "[CI-OPS] restore container absent ... PASS" -ForegroundColor Green }

# ═══════════════════════════════════════════════════════════════
# Final
# ═══════════════════════════════════════════════════════════════

Write-Host ""
if ($script:failures -eq 0) { Write-Host "OPERATIONAL READINESS: PASS" -ForegroundColor Green; exit 0 }
else { Write-Host "OPERATIONAL READINESS: FAIL ($script:failures failures)" -ForegroundColor Red; exit 1 }
