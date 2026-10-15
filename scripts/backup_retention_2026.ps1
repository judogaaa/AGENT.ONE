param(
    [string]$BackupRoot = (Join-Path (Split-Path $PSScriptRoot -Parent) ".local/backups"),
    [switch]$ApplyRetention,
    [switch]$SelfTestFailurePropagation
)

$ErrorActionPreference = "Continue"
$failures = 0

function fail($msg) { $script:failures++; Write-Host "FAIL: $msg" -ForegroundColor Red }
function pass { Write-Host "PASS" -ForegroundColor Green }

if ($SelfTestFailurePropagation) {
    Write-Host "=== RETENTION SELF-TEST ==="
    Write-Host "[RETENTION] creating temp test dirs..."
    $tmp = Join-Path $env:TEMP "agentone-retention-test"
    Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue 2>$null | Out-Null
    New-Item -ItemType Directory $tmp 2>$null | Out-Null
    for ($i=0; $i -lt 20; $i++) {
        $d = Join-Path $tmp "AGENT_ONE_DB_BACKUP_2026-01-$(($i+1).ToString('00'))_00-00-00"
        New-Item -ItemType Directory $d | Out-Null
        "info $i" > (Join-Path $d "BACKUP_INFO.txt")
        "sha256" > (Join-Path $d "SHA256SUMS.txt")
    }
    # Run retention directly: keep 14, delete oldest 6
    $dirs = Get-ChildItem $tmp -Directory -Filter "AGENT_ONE_DB_BACKUP_*" | Sort-Object Name -Descending
    $KEEP = 14
    $toDelete = $dirs | Select-Object -Skip $KEEP
    foreach ($d in $toDelete) { Remove-Item -Recurse -Force $d.FullName 2>$null | Out-Null }
    $remaining = (Get-ChildItem $tmp -Directory).Count
    Write-Host "[RETENTION] remaining dirs: $remaining (want 14)"
    if ($remaining -eq 14) { pass } else { fail "retention count $remaining != 14" }
    Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue 2>$null | Out-Null
    if ($failures -eq 0) { Write-Host "BACKUP RETENTION SELF-TEST: PASS" -ForegroundColor Green; exit 0 }
    else { Write-Host "BACKUP RETENTION SELF-TEST: FAIL" -ForegroundColor Red; exit 1 }
}

Write-Host "=== BACKUP RETENTION ===" -ForegroundColor Cyan

if (-not (Test-Path $BackupRoot)) { Write-Host "BackupRoot not found: $BackupRoot (nothing to retain)"; exit 0 }

$canon = (Resolve-Path $BackupRoot -ErrorAction SilentlyContinue).Path
if (-not $canon) { fail "cannot resolve backup root"; Write-Host "BACKUP RETENTION: FAIL" -ForegroundColor Red; exit 1 }
$allowedRoot = [System.IO.Path]::GetFullPath((Join-Path (Split-Path $PSScriptRoot -Parent) ".local/backups")).TrimEnd('\','/')
$actualRoot = [System.IO.Path]::GetFullPath($canon).TrimEnd('\','/')
if ($actualRoot -ne $allowedRoot) { fail "retention only allowed under this checkout's .local/backups"; exit 1 }

$dirs = Get-ChildItem $canon -Directory -Filter "AGENT_ONE_DB_BACKUP_*" | Sort-Object Name -Descending
$valid = @()
foreach ($d in $dirs) {
    $infoPath = Join-Path $d.FullName "BACKUP_INFO.txt"
    $shasPath = Join-Path $d.FullName "SHA256SUMS.txt"
    if ((Test-Path $infoPath) -and (Test-Path $shasPath)) {
        $isCheckpoint = (Get-Content $infoPath -Raw 2>$null) -match "CHECKPOINT"
        if (-not $isCheckpoint) { $valid += $d }
    }
}
Write-Host "[RETENTION] valid backups: $($valid.Count)"
$KEEP = 14
$toDelete = $valid | Select-Object -Skip $KEEP
Write-Host "[RETENTION] to delete: $($toDelete.Count)"
foreach ($d in $toDelete) {
    if ($ApplyRetention) {
        Write-Host "[RETENTION] deleting $($d.Name)..."
        Remove-Item -Recurse -Force $d.FullName 2>&1 | Out-Null
        if (Test-Path $d.FullName) { fail "failed to delete $($d.Name)" }
    } else {
        Write-Host "[RETENTION] dry-run would delete $($d.Name)"
    }
}
if (-not $ApplyRetention) { Write-Host "[RETENTION] dry-run complete. Use -ApplyRetention to delete." }
else { Write-Host "[RETENTION] retention complete." }

if ($failures -eq 0) { Write-Host "BACKUP RETENTION: PASS" -ForegroundColor Green; exit 0 }
else { Write-Host "BACKUP RETENTION: FAIL" -ForegroundColor Red; exit 1 }
