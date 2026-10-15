param(
    [switch]$SelfTestFailurePropagation
)

. (Join-Path $PSScriptRoot "agentone-local-env.ps1")
$goExe = Resolve-AgentOneGo
$gofmtExe = Resolve-AgentOneGofmt
$ErrorActionPreference = "Continue"
$script:failures = 0
$script:failedSteps = @()

function pass { Write-Host "PASS" -ForegroundColor Green }
function fail($msg) { $script:failures++; $script:failedSteps += $msg; Write-Host "FAIL: $msg" -ForegroundColor Red }

if ($SelfTestFailurePropagation) {
    Write-Host "=== RELEASE FAILURE SELF-TEST ==="
    & cmd.exe /c "exit 1"
    if ($LASTEXITCODE -ne 0) { $script:failures++; Write-Host "[RELEASE] controlled failure ... FAIL" }
    else { Write-Host "unexpected success"; exit 2 }
    Write-Host ""
    Write-Host "RELEASE READINESS: FAIL" -ForegroundColor Red
    exit 1
}

Write-Host "=== RELEASE READINESS CI ===" -ForegroundColor Cyan

# 1. Audit
Write-Host "[RELEASE] foundation audit ... " -NoNewline
node scripts/release_readiness_audit_2026.mjs 2>&1 | Out-Null
if ($LASTEXITCODE -eq 0) { pass } else { fail "release audit" }

# 2. Unit tests
Write-Host "[RELEASE] go test ... " -NoNewline
Push-Location server
& $goExe test ./cmd -count=1 2>&1 | Out-Null
$ok = ($LASTEXITCODE -eq 0)
Pop-Location
if ($ok) { pass } else { fail "go test" }

# 3. Go vet
Write-Host "[RELEASE] go vet ... " -NoNewline
Push-Location server
& $goExe vet ./cmd 2>&1 | Out-Null
$ok = ($LASTEXITCODE -eq 0)
Pop-Location
if ($ok) { pass } else { fail "go vet" }

# 4. Build with metadata ldflags
Write-Host "[RELEASE] build with metadata ... " -NoNewline
$buildDir = Join-Path $script:AgentOneTmpDir "agent-one-build"
New-Item -ItemType Directory -Force $buildDir -ErrorAction SilentlyContinue | Out-Null
Push-Location server
& $goExe build -ldflags "-X main.version=1.0.0 -X main.commit=810224a -X main.buildTime=2026-07-09T00:00:00Z" -o (Join-Path $buildDir "agent-one-server.exe") ./cmd 2>&1 | Out-Null
$ok = ($LASTEXITCODE -eq 0)
Pop-Location
if ($ok) { pass } else { fail "build" }

# 5. No binaries in project
Write-Host "[RELEASE] no binaries ... " -NoNewline
$bins = Get-ChildItem -Recurse -File -Force -Filter *.exe -ErrorAction SilentlyContinue | Where-Object { $_.FullName -notmatch '\\.git\\|node_modules|client\\dist' }
if ($bins) { fail "binaries found" } else { pass }

# 6. Secret scan
Write-Host "[RELEASE] secret scan ... " -NoNewline
$hits = Get-ChildItem -Recurse -File -Force -ErrorAction SilentlyContinue | Where-Object { $_.Extension -match '\.(go|mjs)$' -and $_.FullName -notmatch '\\.git\\|node_modules|client\\dist|\\.env$|psi_' -and $_.FullName -notmatch 'audit_2026|security_audit' } | Select-String -Pattern 'gsk_[A-Za-z0-9_-]{20,}' -SimpleMatch
if ($hits) { fail "secrets found" } else { pass }

Write-Host ""
if ($script:failures -gt 0) {
    Write-Host "Failed steps:" -ForegroundColor Red
    $script:failedSteps | ForEach-Object { Write-Host " - $_" -ForegroundColor Red }
    Write-Host "RELEASE READINESS: FAIL" -ForegroundColor Red
    exit 1
}
Write-Host "RELEASE READINESS: PASS" -ForegroundColor Green
exit 0
