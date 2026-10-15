param(
    [switch]$KeepResources,
    [switch]$SelfTestFailurePropagation
)

. (Join-Path $PSScriptRoot "agentone-local-env.ps1")
$goExe = Resolve-AgentOneGo
$gofmtExe = Resolve-AgentOneGofmt
$ErrorActionPreference = "Continue"
$containerName = "agentone-e2e-db"
$dbPort = "56432"
$backendPort = "18080"
$dbUser = "agentone_e2e"
$dbPass = "agentone_e2e"
$dbName = "agentone_e2e"
$proc = $null
$containerCreated = $false
$runFailed = $false
$cleanupFailed = $false

if ($SelfTestFailurePropagation) {
    Write-Host "=== E2E FAILURE PROPAGATION SELF-TEST ==="
    & cmd.exe /c "exit 1"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[E2E] controlled failure ... FAIL"
    } else { Write-Host "[E2E] controlled failure unexpectedly succeeded"; exit 2 }
    Write-Host "E2E CI: FAIL" -ForegroundColor Red
    exit 1
}

if ($containerName -eq "agentone-db") { Write-Host "SAFETY: container name equals production DB" -ForegroundColor Red; exit 1 }

try {
    Write-Host "=== BROWSER E2E CI ===" -ForegroundColor Cyan

    # 0. Snapshot agentone-db
    Write-Host "[E2E] verify agentone-db ... " -NoNewline
    $prodId = docker inspect agentone-db --format "{{.Id}}" 2>$null
    $prodRunning = docker inspect agentone-db --format "{{.State.Running}}" 2>$null
    if ($prodId -and $prodRunning -eq "true") { Write-Host "PASS" -ForegroundColor Green }
    else { Write-Host "FAIL: prod DB not running" -ForegroundColor Red; $runFailed = $true; throw "agentone-db down" }

    # 1. Build backend
    Write-Host "[E2E] build backend ... " -NoNewline
    $buildDir = Join-Path $script:AgentOneTmpDir "agent-one-build"
    New-Item -ItemType Directory -Force $buildDir -ErrorAction SilentlyContinue | Out-Null
    Push-Location server
    & $goExe build -o (Join-Path $buildDir "agent-one-server.exe") ./cmd 2>&1 | Out-Null
    $ok = ($LASTEXITCODE -eq 0)
    Pop-Location
    if ($ok) { Write-Host "PASS" -ForegroundColor Green }
    else { Write-Host "FAIL" -ForegroundColor Red; $runFailed = $true; throw "build" }

    # 2. Ensure frontend built
    Write-Host "[E2E] frontend build ... " -NoNewline
    Push-Location client
    npm run build 2>&1 | Out-Null
    $ok = ($LASTEXITCODE -eq 0)
    Pop-Location
    if ($ok) { Write-Host "PASS" -ForegroundColor Green }
    else { Write-Host "FAIL" -ForegroundColor Red; $runFailed = $true; throw "frontend build" }

    # 3. Start test DB
    Write-Host "[E2E] start test DB ... " -NoNewline
    docker rm -f $containerName 2>$null | Out-Null
    docker run -d --name $containerName `
      -e POSTGRES_USER=$dbUser `
      -e POSTGRES_PASSWORD=$dbPass `
      -e POSTGRES_DB=$dbName `
      -p ${dbPort}:5432 `
      postgres:16 2>&1 | Out-Null
    $containerCreated = $true
    $dbReady = $false
    for ($i=0; $i -lt 30; $i++) { Start-Sleep 2; docker exec $containerName pg_isready -U $dbUser 2>$null | Out-Null; if ($LASTEXITCODE -eq 0) { Start-Sleep 3; try { $tcp = New-Object System.Net.Sockets.TcpClient('localhost', $dbPort); $tcp.Close(); $dbReady = $true; break } catch {} } }
    if ($dbReady) { Write-Host "PASS" -ForegroundColor Green }
    else { Write-Host "FAIL" -ForegroundColor Red; $runFailed = $true; throw "DB timeout" }

    # 4. Start backend
    $env:PORT = $backendPort
    $env:DATABASE_URL = "postgres://${dbUser}:${dbPass}@localhost:${dbPort}/${dbName}?sslmode=disable"
    $env:JWT_SECRET = "e2e-test-secret-32-chars-min-here-now"
    $env:AI_PROVIDER = "rule_based"
    $env:GROQ_API_KEY = ""
    $env:DEV_ADMIN_TOKEN = "dev-secret"
    Write-Host "[E2E] start backend ... " -NoNewline
    $exe = Join-Path $buildDir "agent-one-server.exe"
    $proc = Start-Process -FilePath $exe -WorkingDirectory $PSScriptRoot\.. `
      -RedirectStandardError "$env:TEMP\agent-one-e2e-stderr.log" `
      -RedirectStandardOutput "$env:TEMP\agent-one-e2e-stdout.log" -WindowStyle Hidden -PassThru
    $backendReady = $false
    for ($i=0; $i -lt 20; $i++) { Start-Sleep 2; try { Invoke-RestMethod -Uri "http://localhost:${backendPort}/api/health" -TimeoutSec 3 -ErrorAction Stop | Out-Null; $backendReady = $true; break } catch {} }
    if ($backendReady) { Write-Host "PASS" -ForegroundColor Green }
    else { Write-Host "FAIL" -ForegroundColor Red; $runFailed = $true; throw "backend timeout" }

    # 5. Run Playwright E2E tests
    Write-Host "[E2E] browser tests ..."
    Push-Location client
    npx playwright test --reporter=list 2>&1
    $e2eExit = $LASTEXITCODE
    Pop-Location
    if ($e2eExit -eq 0) { Write-Host "[E2E] browser tests ... PASS" -ForegroundColor Green }
    else {
      Write-Host "[E2E] browser tests ... FAIL (exit $e2eExit)" -ForegroundColor Red
      Write-Host "`n=== Backend stderr (last 50) ==="
      Get-Content "$env:TEMP\agent-one-e2e-stderr.log" -Tail 50 -ErrorAction SilentlyContinue
      $runFailed = $true
    }
}
catch {
    if (-not $runFailed) { $runFailed = $true }
}
finally {
    Write-Host "[E2E] cleanup backend ... " -NoNewline
    if ($proc -and -not $proc.HasExited) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue; try { $proc.WaitForExit(5000) | Out-Null } catch {} }
    Write-Host "DONE"
    if (-not $KeepResources -and $containerCreated) {
        Write-Host "[E2E] cleanup container ... " -NoNewline
        docker rm -f $containerName 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) { Write-Host "DONE" }
        else { Write-Host "FAIL" -ForegroundColor Red; $cleanupFailed = $true }
    }
}

# Post-cleanup
Write-Host "`n=== POST-CLEANUP ===" -ForegroundColor Cyan
Write-Host "[PC] production DB unchanged ... " -NoNewline
$prodIdAfter = docker inspect agentone-db --format "{{.Id}}" 2>$null
$prodRunningAfter = docker inspect agentone-db --format "{{.State.Running}}" 2>$null
if ($prodIdAfter -eq $prodId -and $prodRunningAfter -eq "true") { Write-Host "PASS" -ForegroundColor Green }
else { Write-Host "FAIL" -ForegroundColor Red; $cleanupFailed = $true }

if (-not $KeepResources) {
    Write-Host "[PC] test container removed ... " -NoNewline
    $leftover = docker ps -a --filter "name=^/${containerName}$" --format "{{.Names}}" 2>$null
    if (-not $leftover) { Write-Host "PASS" -ForegroundColor Green }
    else { Write-Host "FAIL" -ForegroundColor Red; $cleanupFailed = $true }
} else { Write-Host "[PC] test container removed ... SKIP (KeepResources)" -ForegroundColor Gray }

Write-Host "[PC] backend process stopped ... " -NoNewline
if (-not $proc -or $proc.HasExited) { Write-Host "PASS" -ForegroundColor Green }
else { Write-Host "FAIL" -ForegroundColor Red; $cleanupFailed = $true }

Write-Host "[PC] test ports free ... " -NoNewline
$p1 = Get-NetTCPConnection -LocalPort $backendPort -State Listen -ErrorAction SilentlyContinue
$p2 = Get-NetTCPConnection -LocalPort $dbPort -State Listen -ErrorAction SilentlyContinue
if (-not $p1 -and -not $p2) { Write-Host "PASS" -ForegroundColor Green }
else { Write-Host "FAIL" -ForegroundColor Red; $cleanupFailed = $true }

Write-Host ""
if ($runFailed -or $cleanupFailed) { Write-Host "E2E CI: FAIL" -ForegroundColor Red; exit 1 }
Write-Host "E2E CI: PASS" -ForegroundColor Green; exit 0
