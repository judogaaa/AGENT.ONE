param(
    [switch]$SelfTestFailurePropagation
)

. (Join-Path $PSScriptRoot "agentone-local-env.ps1")
$goExe = Resolve-AgentOneGo
$gofmtExe = Resolve-AgentOneGofmt
$ErrorActionPreference = "Continue"
$script:failures = 0
$projectRoot = Split-Path $PSScriptRoot -Parent

function recordFailure($msg) { $script:failures++; Write-Host "SEC-CI:FAIL $msg" -ForegroundColor Red }

function Convert-CommandOutputToText {
    param([object[]]$Output)
    if ($null -eq $Output) { return "" }
    return (@($Output | ForEach-Object { if ($null -eq $_) { "" } else { $_.ToString() } }) -join [Environment]::NewLine).Trim()
}

if ($SelfTestFailurePropagation) {
    Write-Host "=== SECURITY FAILURE PROPAGATION SELF-TEST ==="
    & cmd.exe /c "exit 1"
    if ($LASTEXITCODE -ne 0) { Write-Host "[SEC-CI] controlled failure ... FAIL"; Write-Host "SECURITY HARDENING: FAIL"; exit 1 }
    exit 2
}

Write-Host "=== SECURITY HARDENING CI ===" -ForegroundColor Cyan

# ─── Docker preflight

Write-Host "[SEC-CI] docker preflight ..."
$dvRaw = & docker version --format "{{.Server.Version}}" 2>&1; $dvCode = $LASTEXITCODE; $dvText = Convert-CommandOutputToText $dvRaw
if ($dvCode -ne 0 -or [string]::IsNullOrWhiteSpace($dvText)) { recordFailure "docker version failed: $dvText"; Write-Host "SECURITY HARDENING: FAIL" -ForegroundColor Red; exit 1 }
$diRaw = & docker info --format "{{.ServerVersion}}" 2>&1; $diCode = $LASTEXITCODE; $diText = Convert-CommandOutputToText $diRaw
if ($diCode -ne 0 -or [string]::IsNullOrWhiteSpace($diText)) { recordFailure "docker info failed: $diText"; Write-Host "SECURITY HARDENING: FAIL" -ForegroundColor Red; exit 1 }
Write-Host "[SEC-CI] docker preflight ... PASS" -ForegroundColor Green

# ─── Go resolution

if (-not (Test-Path $goExe)) { recordFailure "Go not found" }

# ─── 1. Security audit

Write-Host "[SEC-CI] security audit ..."
node (Join-Path $projectRoot "scripts/security_hardening_audit_2026.mjs") 2>&1
if ($LASTEXITCODE -ne 0) { recordFailure "audit failed" } else { Write-Host "[SEC-CI] security audit ... PASS" -ForegroundColor Green }

# ─── 2. Go tests

Write-Host "[SEC-CI] go test ./cmd ..."
$prev = Get-Location; Set-Location (Join-Path $projectRoot "server")
& $goExe test ./cmd -count=1 2>&1 | Out-Host
$tc = $LASTEXITCODE; Set-Location $prev
if ($tc -ne 0) { recordFailure "go test failed" } else { Write-Host "[SEC-CI] go test ./cmd ... PASS" -ForegroundColor Green }

# ─── 3. go vet

Write-Host "[SEC-CI] go vet ./cmd ..."
$prev = Get-Location; Set-Location (Join-Path $projectRoot "server")
& $goExe vet ./cmd 2>&1 | Out-Host
$vc = $LASTEXITCODE; Set-Location $prev
if ($vc -ne 0) { recordFailure "go vet failed" } else { Write-Host "[SEC-CI] go vet ./cmd ... PASS" -ForegroundColor Green }

# ─── 4. gofmt

Write-Host "[SEC-CI] gofmt ..."
$gofiles = Get-ChildItem (Join-Path $projectRoot "server/cmd") -Filter "*.go" -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName }
$unf = $false
foreach ($f in $gofiles) {
    $diff = & $gofmtExe -d $f 2>&1
    if ($diff -and (Convert-CommandOutputToText $diff).Trim()) { $unf = $true; Write-Host "Unformatted: $f" }
}
if ($unf) { recordFailure "gofmt failed" } else { Write-Host "[SEC-CI] gofmt ... PASS" -ForegroundColor Green }

# ─── 5. Temp build

Write-Host "[SEC-CI] temp build ..."
$tmpOut = Join-Path $env:TEMP "agent-one-sec-build.exe"
$prev = Get-Location; Set-Location (Join-Path $projectRoot "server")
& $goExe build -o $tmpOut ./cmd 2>&1
$bc = $LASTEXITCODE; Set-Location $prev; Remove-Item $tmpOut -Force -ErrorAction SilentlyContinue 2>$null
if ($bc -ne 0) { recordFailure "build failed" } else { Write-Host "[SEC-CI] temp build ... PASS" -ForegroundColor Green }

# ─── 6. Dependency check

$gomodDiff = git -C $projectRoot diff -- server/go.mod server/go.sum 2>&1
if ($gomodDiff -and (Convert-CommandOutputToText $gomodDiff).Trim()) { recordFailure "go.mod changed" } else { Write-Host "[SEC-CI] go.mod unchanged ... PASS" -ForegroundColor Green }

# ─── 7. Container security audit (MANDATORY)

Write-Host "[SEC-CI] container security audit ..."
$contScript = Join-Path $projectRoot "scripts/container_security_audit_2026.ps1"
$contOutput = & powershell -NoProfile -ExecutionPolicy Bypass -File $contScript 2>&1
$contCode = $LASTEXITCODE
Write-Host ($contOutput | ForEach-Object { if ($null -eq $_) { "" } else { $_.ToString() } } | Out-String)
if ($contCode -ne 0) { recordFailure "container audit failed (exit $contCode)" }
else {
    $contText = Convert-CommandOutputToText $contOutput
    if ($contText -notmatch "CONTAINER SECURITY( AUDIT)?:?\s*PASS") { recordFailure "container audit missing PASS marker (exit $contCode)" }
    else { Write-Host "[SEC-CI] container security audit ... PASS" -ForegroundColor Green }
}

# ─── 8. Host survival

Write-Host "[SEC-CI] agentone-db check ..."
$dbRaw = & docker inspect agentone-db --format "{{.Id}}" 2>&1; $dbCode = $LASTEXITCODE; $dbText = Convert-CommandOutputToText $dbRaw
if ($dbCode -ne 0 -or [string]::IsNullOrWhiteSpace($dbText)) { recordFailure "docker inspect agentone-db failed: $dbText" }
else {
    $dbId = $dbText
    $dbRunRaw = & docker inspect agentone-db --format "{{.State.Running}}" 2>&1; $dbRunCode = $LASTEXITCODE; $dbRunText = Convert-CommandOutputToText $dbRunRaw
    if ($dbRunCode -ne 0) { recordFailure "agentone-db state check failed" }
    elseif ($dbRunText -ne "true") { recordFailure "agentone-db not running" }
    else { Write-Host "[SEC-CI] agentone-db: $dbId running ... PASS" -ForegroundColor Green }
}

# ─── 8. Test container cleanup

$scRaw = & docker ps -a --filter "name=^/agentone-security-db$" --format "{{.Names}}" 2>&1; $scText = Convert-CommandOutputToText $scRaw
if ($scText) { Write-Host "[SEC-CI] removing test DB container..."; docker rm -f agentone-security-db 2>$null | Out-Null }
$acRaw = & docker ps -a --filter "name=^/agentone-security-app$" --format "{{.Names}}" 2>&1; $acText = Convert-CommandOutputToText $acRaw
if ($acText) { Write-Host "[SEC-CI] removing test app container..."; docker rm -f agentone-security-app 2>$null | Out-Null }
Write-Host "[SEC-CI] test container cleanup ... PASS" -ForegroundColor Green

# ─── Final

Write-Host ""
if ($script:failures -eq 0) { Write-Host "SECURITY HARDENING: PASS" -ForegroundColor Green; exit 0 }
else { Write-Host "SECURITY HARDENING: FAIL ($script:failures failures)" -ForegroundColor Red; exit 1 }
