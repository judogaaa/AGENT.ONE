param(
    [switch]$KeepResources,
    [switch]$SelfTestFailurePropagation
)

. (Join-Path $PSScriptRoot "agentone-local-env.ps1")
$goExe = Resolve-AgentOneGo
$gofmtExe = Resolve-AgentOneGofmt
$ErrorActionPreference = "Continue"
$containerName = "agentone-ci-db"
$dbPort = "55432"
$backendPort = "18080"
$dbUser = "agentone_test"
$dbPass = "agentone_test"
$dbName = "agentone_test"
$proc = $null
$containerCreated = $false
$runFailed = $false
$cleanupFailed = $false

if ($SelfTestFailurePropagation) {
    Write-Host "=== INTEGRATION FAILURE PROPAGATION SELF-TEST ==="
    & cmd.exe /c "exit 1"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[CI] controlled failure ... FAIL"
    } else { Write-Host "[CI] controlled failure unexpectedly succeeded"; exit 2 }
    Write-Host ""
    Write-Host "INTEGRATION CI: FAIL" -ForegroundColor Red
    exit 1
}

# Safety
if ($containerName -eq "agentone-db") { Write-Host "SAFETY: container name equals production DB" -ForegroundColor Red; exit 1 }

try {
    Write-Host "=== INTEGRATION CI ===" -ForegroundColor Cyan

    # 0. Snapshot production DB state
    Write-Host "[CI] verify agentone-db ... " -NoNewline
    $prodId = docker inspect agentone-db --format "{{.Id}}" 2>$null
    $prodRunning = docker inspect agentone-db --format "{{.State.Running}}" 2>$null
    if ($prodId -and $prodRunning -eq "true") { Write-Host "PASS" -ForegroundColor Green }
    else { Write-Host "FAIL: prod DB not running" -ForegroundColor Red; $runFailed = $true; throw "agentone-db down" }

    # 1. Build
    Write-Host "[CI] build backend ... " -NoNewline
    $buildDir = Join-Path $script:AgentOneTmpDir "agent-one-build"
    New-Item -ItemType Directory -Force $buildDir -ErrorAction SilentlyContinue | Out-Null
    Push-Location server
    & $goExe build -o (Join-Path $buildDir "agent-one-server.exe") ./cmd 2>&1 | Out-Null
    $ok = ($LASTEXITCODE -eq 0)
    Pop-Location
    if ($ok) { Write-Host "PASS" -ForegroundColor Green }
    else { Write-Host "FAIL" -ForegroundColor Red; $runFailed = $true; throw "build failed" }

    # 2. Start test DB
    Write-Host "[CI] start test DB ... " -NoNewline
    docker rm -f $containerName 2>$null | Out-Null
    docker run -d --name $containerName `
      -e POSTGRES_USER=$dbUser `
      -e POSTGRES_PASSWORD=$dbPass `
      -e POSTGRES_DB=$dbName `
      -p ${dbPort}:5432 `
      postgres:16 2>&1 | Out-Null
    $containerCreated = $true
    $dbReady = $false
    for ($i=0; $i -lt 30; $i++) {
      Start-Sleep -Seconds 2
      $check = docker exec $containerName pg_isready -U $dbUser 2>$null
      if ($LASTEXITCODE -eq 0) {
        Start-Sleep -Seconds 3
        try { $tcp = New-Object System.Net.Sockets.TcpClient('localhost', $dbPort); $tcp.Close(); $dbReady = $true; break } catch {}
      }
    }
    if ($dbReady) { Write-Host "PASS" -ForegroundColor Green }
    else { Write-Host "FAIL: test DB not ready" -ForegroundColor Red; $runFailed = $true; throw "DB timeout" }

    # 3. Start backend
    $env:PORT = $backendPort
    $env:DATABASE_URL = "postgres://${dbUser}:${dbPass}@localhost:${dbPort}/${dbName}?sslmode=disable"
    $env:JWT_SECRET = "integration-test-secret-32-chars-min"
    $env:AI_PROVIDER = "rule_based"
    $env:GROQ_API_KEY = ""
    $env:DEV_ADMIN_TOKEN = "dev-secret"
    Write-Host "[CI] start backend ... " -NoNewline
    $exe = Join-Path $buildDir "agent-one-server.exe"
    $proc = Start-Process -FilePath $exe -WorkingDirectory $PSScriptRoot\.. `
      -RedirectStandardError "$env:TEMP\agent-one-backend-stderr.log" `
      -RedirectStandardOutput "$env:TEMP\agent-one-backend-stdout.log" -WindowStyle Hidden -PassThru
    $backendReady = $false
    for ($i=0; $i -lt 20; $i++) {
      Start-Sleep -Seconds 2
      try { Invoke-RestMethod -Uri "http://localhost:${backendPort}/api/health" -TimeoutSec 3 -ErrorAction Stop | Out-Null; $backendReady = $true; break } catch {}
    }
    if ($backendReady) { Write-Host "PASS" -ForegroundColor Green }
    else { Write-Host "FAIL: backend not ready" -ForegroundColor Red; $runFailed = $true; throw "backend timeout" }

    # 4. Run tests
    Write-Host "[CI] integration tests ..."
    node scripts/integration_runtime_2026.mjs
    $rtExit = $LASTEXITCODE
    if ($rtExit -eq 0) { Write-Host "[CI] integration tests ... PASS" -ForegroundColor Green }
    else {
      Write-Host "[CI] integration tests ... FAIL (exit $rtExit)" -ForegroundColor Red
      Write-Host "`n=== Backend stderr (last 50) ==="
      Get-Content "$env:TEMP\agent-one-backend-stderr.log" -Tail 50 -ErrorAction SilentlyContinue
      $runFailed = $true
    }
}
catch {
    if (-not $runFailed) { $runFailed = $true }
    Write-Host "Runner exception: $_" -ForegroundColor Red
}
finally {
    # Cleanup: stop test backend process
    Write-Host "[CI] cleanup backend ... " -NoNewline
    if ($proc -and -not $proc.HasExited) {
        Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
        try { $proc.WaitForExit(5000) | Out-Null } catch {}
    }
    Write-Host "DONE"

    # Cleanup: remove test container
    if (-not $KeepResources -and $containerCreated) {
        Write-Host "[CI] cleanup container ... " -NoNewline
        docker rm -f $containerName 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) { Write-Host "DONE" }
        else { Write-Host "FAIL" -ForegroundColor Red; $cleanupFailed = $true }
    }
}

# Post-cleanup verification
Write-Host ""
Write-Host "=== POST-CLEANUP ===" -ForegroundColor Cyan

# A. Verify production DB unchanged
Write-Host "[PC] production DB unchanged ... " -NoNewline
$prodIdAfter = docker inspect agentone-db --format "{{.Id}}" 2>$null
$prodRunningAfter = docker inspect agentone-db --format "{{.State.Running}}" 2>$null
if ($prodIdAfter -eq $prodId -and $prodRunningAfter -eq "true") { Write-Host "PASS" -ForegroundColor Green }
else { Write-Host "FAIL" -ForegroundColor Red; $cleanupFailed = $true }

# B. Verify test container removed
if (-not $KeepResources) {
    Write-Host "[PC] test container removed ... " -NoNewline
    $leftover = docker ps -a --filter "name=^/${containerName}$" --format "{{.Names}}" 2>$null
    if (-not $leftover) { Write-Host "PASS" -ForegroundColor Green }
    else { Write-Host "FAIL: still present" -ForegroundColor Red; $cleanupFailed = $true }
} else {
    Write-Host "[PC] test container removed ... SKIP (KeepResources)" -ForegroundColor Gray
}

# C. Verify backend process stopped
Write-Host "[PC] backend process stopped ... " -NoNewline
if (-not $proc -or $proc.HasExited) { Write-Host "PASS" -ForegroundColor Green }
else { Write-Host "FAIL: still running" -ForegroundColor Red; $cleanupFailed = $true }

# D. Verify test ports free
Write-Host "[PC] test ports free ... " -NoNewline
$port18080 = Get-NetTCPConnection -LocalPort 18080 -State Listen -ErrorAction SilentlyContinue
$port55432 = Get-NetTCPConnection -LocalPort 55432 -State Listen -ErrorAction SilentlyContinue
if (-not $port18080 -and -not $port55432) { Write-Host "PASS" -ForegroundColor Green }
else {
    $msg = @()
    if ($port18080) { $msg += "18080" }
    if ($port55432) { $msg += "55432" }
    Write-Host "FAIL: ports $($msg -join ', ') still in use" -ForegroundColor Red
    $cleanupFailed = $true
}

Write-Host ""
if ($runFailed -or $cleanupFailed) {
    Write-Host "INTEGRATION CI: FAIL" -ForegroundColor Red
    exit 1
}
Write-Host "INTEGRATION CI: PASS" -ForegroundColor Green
exit 0
