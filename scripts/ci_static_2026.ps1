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
    Write-Host "=== CI FAILURE PROPAGATION SELF-TEST ==="

    & cmd.exe /c "exit 1"
    $exitCode = $LASTEXITCODE

    if ($exitCode -ne 0) {
        $script:failures++
        $script:failedSteps += "controlled failure propagation test"
        Write-Host "[CI] controlled failure ... FAIL"
    }
    else {
        Write-Host "[CI] controlled failure unexpectedly succeeded"
        exit 2
    }

    Write-Host ""
    Write-Host "CI STATIC: FAIL" -ForegroundColor Red
    Write-Host "Failed steps:"
    $script:failedSteps | ForEach-Object {
        Write-Host " - $_" -ForegroundColor Red
    }
    exit 1
}

Write-Host "=== CI STATIC ===" -ForegroundColor Cyan

# 1. No .env tracked
Write-Host "[CI] no .env tracked ... " -NoNewline
git ls-files --error-unmatch .env 2>$null
if ($LASTEXITCODE -eq 0) { fail ".env is tracked" } else { pass }

# 2. No binaries in project tree
Write-Host "[CI] no binaries ... " -NoNewline
$bins = Get-ChildItem -Recurse -File -Force -Filter *.exe -ErrorAction SilentlyContinue | Where-Object {
  $_.FullName -notmatch '\\.git\\' -and $_.FullName -notmatch '\\node_modules\\' -and $_.FullName -notmatch '\\client\\dist\\' -and $_.FullName -notmatch '\\AGENT_ONE_BACKUPS\\'
}
if ($bins) { fail "Binary found" } else { pass }

# 3. No gsk_ secret
Write-Host "[CI] no gsk_ secret ... " -NoNewline
$hits = $false
$srcFiles = Get-ChildItem -Recurse -File -Force -ErrorAction SilentlyContinue | Where-Object {
  $_.FullName -notmatch '\\.git\\' -and $_.FullName -notmatch '\\node_modules\\' -and $_.FullName -notmatch '\\client\\dist\\' -and $_.FullName -notmatch '\\AGENT_ONE_BACKUPS\\' -and $_.Extension -match '\.(go|mjs|jsx?|yml|json|md|ps1)$' -and $_.FullName -notmatch '\\.env$'
}
foreach ($f in $srcFiles) {
  $c = Get-Content $f.FullName -Raw -ErrorAction SilentlyContinue
  if ($c -and ($c -match 'gsk_[A-Za-z0-9_-]{20,}')) { $hits = $true; break }
}
if ($hits) { fail "Secret pattern found" } else { pass }

# 4. npm ci (skip if node_modules exists)
$needCi = (-not (Test-Path client\node_modules))
if (-not $needCi) {
  Write-Host "[CI] npm ci ... SKIP (node_modules exists)" -ForegroundColor Gray
} else {
  Write-Host "[CI] npm ci ... " -NoNewline
  Push-Location client
  cmd /c "npm.cmd ci 2>&1" | Out-Null
  $ok = ($LASTEXITCODE -eq 0)
  Pop-Location
  if ($ok) { pass } else { fail "npm ci" }
}

# 5. npm run build
Write-Host "[CI] npm run build ... " -NoNewline
Push-Location client
cmd /c "npm.cmd run build 2>&1" | Out-Null
$ok = ($LASTEXITCODE -eq 0)
Pop-Location
if ($ok) { pass } else { fail "npm build" }

# 6. gofmt
Write-Host "[CI] gofmt check ... " -NoNewline
Push-Location server
$badFmt = @()
foreach ($f in (Get-ChildItem cmd -Filter *.go -File)) {
  $diff = & $gofmtExe -d $f.FullName 2>&1
  if ($diff) { $badFmt += $f.Name }
}
Pop-Location
if ($badFmt.Count -gt 0) { fail "Unformatted: $($badFmt -join ', ')" } else { pass }

# 7. go test
Write-Host "[CI] go test ./cmd ... " -NoNewline
Push-Location server
& $goExe test ./cmd -count=1 2>&1 | Out-Null
$ok = ($LASTEXITCODE -eq 0)
Pop-Location
if ($ok) { pass } else { fail "go test" }

# 8. go vet
Write-Host "[CI] go vet ./cmd ... " -NoNewline
Push-Location server
& $goExe vet ./cmd 2>&1 | Out-Null
$ok = ($LASTEXITCODE -eq 0)
Pop-Location
if ($ok) { pass } else { fail "go vet" }

# 9. go build (outside source)
Write-Host "[CI] go build ... " -NoNewline
Push-Location server
$buildDir = Join-Path $script:AgentOneTmpDir "agent-one-build"
New-Item -ItemType Directory -Force $buildDir -ErrorAction SilentlyContinue | Out-Null
& $goExe build -o (Join-Path $buildDir "agent-one-server.exe") ./cmd 2>&1 | Out-Null
$ok = ($LASTEXITCODE -eq 0)
Pop-Location
if ($ok) { pass } else { fail "go build" }

# 10. CI foundation audit
Write-Host "[CI] ci foundation audit ... " -NoNewline
node scripts/ci_foundation_audit_2026.mjs 2>&1 | Out-Null
$ok = ($LASTEXITCODE -eq 0)
if ($ok) { pass } else { fail "ci_foundation_audit" }

# Final
Write-Host ""
if ($script:failures -gt 0) {
  Write-Host "Failed steps:" -ForegroundColor Red
  $script:failedSteps | ForEach-Object { Write-Host " - $_" -ForegroundColor Red }
  Write-Host "CI STATIC: FAIL" -ForegroundColor Red
  exit 1
} else {
  Write-Host "CI STATIC: PASS" -ForegroundColor Green
  exit 0
}
