param(
    [switch]$KeepResources
)

. (Join-Path $PSScriptRoot "agentone-local-env.ps1")
$goExe = Resolve-AgentOneGo
$gofmtExe = Resolve-AgentOneGofmt
$ErrorActionPreference = "Continue"
$containerName = "agentone-ci-email-verification-db"
$dbPort = "56433"
$backendPort = "18082"
$dbUser = "agentone_test"
$dbPass = "agentone_test"
$dbName = "agentone_test"
$proc = $null
$containerCreated = $false
$runFailed = $false

if ($containerName -eq "agentone-db") { Write-Host "SAFETY: container name equals production DB"; exit 1 }

try {
    Write-Host "=== EMAIL VERIFICATION CI ===" -ForegroundColor Cyan
    $prodId = docker inspect agentone-db --format "{{.Id}}" 2>$null
    if ($prodId) { Write-Host "[CI] agentone-db: OK" -ForegroundColor Green } else { $runFailed = $true; throw "agentone-db down" }

    $buildDir = Join-Path $script:AgentOneTmpDir "agent-one-build"
    New-Item -ItemType Directory -Force $buildDir -ErrorAction SilentlyContinue | Out-Null
    Push-Location server; & $goExe build -o (Join-Path $buildDir "agent-one-server.exe") ./cmd 2>&1 | Out-Null; Pop-Location
    if ($LASTEXITCODE -ne 0) { $runFailed = $true; throw "build failed" }
    Write-Host "[CI] build ... PASS" -ForegroundColor Green

    docker rm -f $containerName 2>$null | Out-Null
    docker run -d --name $containerName -e POSTGRES_USER=$dbUser -e POSTGRES_PASSWORD=$dbPass -e POSTGRES_DB=$dbName -p ${dbPort}:5432 postgres:16 2>&1 | Out-Null
    $containerCreated = $true
    $dbReady = $false
    for ($i=0; $i -lt 30; $i++) { Start-Sleep 2; docker exec $containerName pg_isready -U $dbUser 2>$null | Out-Null; if ($LASTEXITCODE -eq 0) { Start-Sleep 3; $dbReady = $true; break } }
    if (-not $dbReady) { $runFailed = $true; throw "DB timeout" }
    Write-Host "[CI] DB ready ... PASS" -ForegroundColor Green

    $backendEnv = @{
        PORT=($backendPort)
        DATABASE_URL="postgres://${dbUser}:${dbPass}@localhost:${dbPort}/${dbName}?sslmode=disable"
        JWT_SECRET="ci-email-verify-test-secret-32-ch"
        AI_PROVIDER="rule_based"
        GROQ_API_KEY=""
        DEV_ADMIN_TOKEN=""
        APP_ENV="development"
        ACCESS_TOKEN_TTL_MINUTES="15"
        REFRESH_TOKEN_TTL_HOURS="24"
        EMAIL_VERIFICATION_TOKEN_TTL_MINUTES="30"
        EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS="10"
        EMAIL_VERIFICATION_EXPOSE_TOKEN="true"
    }

    function Start-Backend {
        foreach ($k in $backendEnv.Keys) { Set-Item -Path "env:$k" -Value $backendEnv[$k] }
        $script:proc = Start-Process -FilePath (Join-Path $buildDir "agent-one-server.exe") -WorkingDirectory $PSScriptRoot\.. -RedirectStandardError "$env:TEMP\agent-one-email-stderr.log" -RedirectStandardOutput "$env:TEMP\agent-one-email-stdout.log" -WindowStyle Hidden -PassThru
        for ($i=0; $i -lt 25; $i++) { Start-Sleep 2; try { Invoke-RestMethod "http://localhost:${backendPort}/api/ready" -TimeoutSec 3 -ErrorAction Stop | Out-Null; return $true } catch {} }
        return $false
    }

    # PHASE 1: non-concurrent tests
    if (-not (Start-Backend)) { $runFailed = $true; throw "phase 1 backend timeout" }
    Write-Host "[CI] phase 1 backend ... PASS" -ForegroundColor Green
    $env:EMAIL_VERIFY_BASE = "http://localhost:${backendPort}"
    $env:EMAIL_VERIFY_PHASE = "1"
    node scripts/integration_email_verification_2026.mjs
    if ($LASTEXITCODE -ne 0) { Write-Host "[CI] phase 1 ... FAIL"; $runFailed = $true }
    else { Write-Host "[CI] phase 1 ... PASS" -ForegroundColor Green }

    # Restart backend to reset in-memory rate limiter
    if (-not $runFailed) {
        if ($script:proc -and -not $script:proc.HasExited) { Stop-Process -Id $script:proc.Id -Force -ErrorAction SilentlyContinue }
        Start-Sleep 2

        # PHASE 2: concurrency tests
        if (-not (Start-Backend)) { $runFailed = $true; throw "phase 2 backend timeout" }
        Write-Host "[CI] phase 2 backend ... PASS" -ForegroundColor Green
        $env:EMAIL_VERIFY_BASE = "http://localhost:${backendPort}"
        $env:EMAIL_VERIFY_PHASE = "2"
        node scripts/integration_email_verification_2026.mjs
        if ($LASTEXITCODE -ne 0) { Write-Host "[CI] phase 2 ... FAIL"; $runFailed = $true }
        else { Write-Host "[CI] phase 2 ... PASS" -ForegroundColor Green }
    }
}
catch { if (-not $runFailed) { $runFailed = $true } }
finally {
    if ($script:proc -and -not $script:proc.HasExited) { Stop-Process -Id $script:proc.Id -Force -ErrorAction SilentlyContinue }
    if (-not $KeepResources -and $containerCreated) { docker rm -f $containerName 2>$null | Out-Null }
}

$prodIdAfter = docker inspect agentone-db --format "{{.Id}}" 2>$null
if ($prodIdAfter -ne $prodId) { $runFailed = $true; Write-Host "agentone-db CHANGED!" -ForegroundColor Red }
else { Write-Host "agentone-db unchanged ... PASS" -ForegroundColor Green }

if ($runFailed) { Write-Host "EMAIL VERIFICATION CI: FAIL" -ForegroundColor Red; exit 1 }
Write-Host "EMAIL VERIFICATION CI: PASS" -ForegroundColor Green; exit 0
