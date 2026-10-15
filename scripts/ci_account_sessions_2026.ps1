param(
    [switch]$KeepResources,
    [switch]$SelfTestFailurePropagation
)

. (Join-Path $PSScriptRoot "agentone-local-env.ps1")
$goExe = Resolve-AgentOneGo
$gofmtExe = Resolve-AgentOneGofmt
$ErrorActionPreference = "Continue"
$containerName = "agentone-ci-sessions-db"
$dbPort = "56432"
$backendPort = "18081"
$dbUser = "agentone_test"
$dbPass = "agentone_test"
$dbName = "agentone_test"
$proc = $null
$containerCreated = $false
$runFailed = $false

if ($SelfTestFailurePropagation) {
    Write-Host "=== ACCOUNT SESSIONS FAILURE PROPAGATION SELF-TEST ==="
    & cmd.exe /c "exit 1"
    if ($LASTEXITCODE -ne 0) { Write-Host "[CI] controlled failure ... FAIL"; Write-Host "ACCOUNT SESSIONS CI: FAIL"; exit 1 }
    exit 2
}

if ($containerName -eq "agentone-db") { Write-Host "SAFETY: container name equals production DB"; exit 1 }

try {
    Write-Host "=== ACCOUNT SESSIONS CI ===" -ForegroundColor Cyan

    # 0. Snapshot production DB
    Write-Host "[CI] verify agentone-db ... " -NoNewline
    $prodId = docker inspect agentone-db --format "{{.Id}}" 2>$null
    if ($prodId) { Write-Host "PASS" -ForegroundColor Green } else { Write-Host "FAIL"; $runFailed = $true; throw "agentone-db down" }

    # 1. Build
    Write-Host "[CI] build backend ... " -NoNewline
    $buildDir = Join-Path $script:AgentOneTmpDir "agent-one-build"
    New-Item -ItemType Directory -Force $buildDir -ErrorAction SilentlyContinue | Out-Null
    Push-Location server
    & $goExe build -o (Join-Path $buildDir "agent-one-server.exe") ./cmd 2>&1 | Out-Null
    $ok = ($LASTEXITCODE -eq 0)
    Pop-Location
    if ($ok) { Write-Host "PASS" -ForegroundColor Green } else { Write-Host "FAIL"; $runFailed = $true; throw "build failed" }

    # 2. Start test DB
    Write-Host "[CI] start test DB ... " -NoNewline
    docker rm -f $containerName 2>$null | Out-Null
    docker run -d --name $containerName -e POSTGRES_USER=$dbUser -e POSTGRES_PASSWORD=$dbPass -e POSTGRES_DB=$dbName -p ${dbPort}:5432 postgres:16 2>&1 | Out-Null
    $containerCreated = $true
    $dbReady = $false
    for ($i=0; $i -lt 30; $i++) { Start-Sleep 2; docker exec $containerName pg_isready -U $dbUser 2>$null | Out-Null; if ($LASTEXITCODE -eq 0) { Start-Sleep 3; $dbReady = $true; break } }
    if ($dbReady) { Write-Host "PASS" -ForegroundColor Green } else { Write-Host "FAIL"; $runFailed = $true; throw "DB timeout" }

    # 3. Start backend
    $env:PORT = $backendPort
    $env:DATABASE_URL = "postgres://${dbUser}:${dbPass}@localhost:${dbPort}/${dbName}?sslmode=disable"
    $env:JWT_SECRET = "ci-sessions-test-secret-32-chars"
    $env:AI_PROVIDER = "rule_based"
    $env:GROQ_API_KEY = ""
    $env:DEV_ADMIN_TOKEN = ""
    $env:APP_ENV = "development"
    $env:ACCESS_TOKEN_TTL_MINUTES = "15"
    $env:REFRESH_TOKEN_TTL_HOURS = "24"
    Write-Host "[CI] start backend ... " -NoNewline
    $exe = Join-Path $buildDir "agent-one-server.exe"
    $proc = Start-Process -FilePath $exe -WorkingDirectory $PSScriptRoot\.. -RedirectStandardError "$env:TEMP\agent-one-sessions-stderr.log" -RedirectStandardOutput "$env:TEMP\agent-one-sessions-stdout.log" -WindowStyle Hidden -PassThru
    $backendReady = $false
    for ($i=0; $i -lt 25; $i++) { Start-Sleep 2; try { Invoke-RestMethod "http://localhost:${backendPort}/api/ready" -TimeoutSec 3 -ErrorAction Stop | Out-Null; $backendReady = $true; break } catch {} }
    if ($backendReady) { Write-Host "PASS" -ForegroundColor Green } else { Write-Host "FAIL"; $runFailed = $true; throw "backend timeout" }

    # 4. Run tests
    Write-Host "[CI] session tests ..."
    $env:ACCOUNT_SESSIONS_BASE = "http://localhost:${backendPort}"
    node scripts/integration_account_sessions_2026.mjs
    $rtExit = $LASTEXITCODE
    if ($rtExit -eq 0) { Write-Host "[CI] session tests ... PASS" -ForegroundColor Green }
    else { Write-Host "[CI] session tests ... FAIL (exit $rtExit)"; $runFailed = $true }
}
catch { if (-not $runFailed) { $runFailed = $true }; Write-Host "Runner exception: $_" -ForegroundColor Red }
finally {
    Write-Host "[CI] cleanup backend ... " -NoNewline
    if ($proc -and -not $proc.HasExited) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue; try { $proc.WaitForExit(5000) | Out-Null } catch {} }
    Write-Host "DONE"
    if (-not $KeepResources -and $containerCreated) {
        Write-Host "[CI] cleanup container ... " -NoNewline
        docker rm -f $containerName 2>$null | Out-Null
        Write-Host "DONE"
    }
}

Write-Host ""
$prodIdAfter = docker inspect agentone-db --format "{{.Id}}" 2>$null
if ($prodIdAfter -eq $prodId) { Write-Host "agentone-db unchanged ... PASS" -ForegroundColor Green }
else { Write-Host "agentone-db CHANGED!" -ForegroundColor Red }

if ($runFailed) { Write-Host "ACCOUNT SESSIONS CI: FAIL" -ForegroundColor Red; exit 1 }
Write-Host "ACCOUNT SESSIONS CI: PASS" -ForegroundColor Green; exit 0
