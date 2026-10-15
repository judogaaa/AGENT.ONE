# AGENT.ONE local startup script
# Run from the root of any AGENT.ONE checkout

$ErrorActionPreference = "Continue"
$projectRoot = $PSScriptRoot
. (Join-Path $projectRoot "scripts\agentone-local-env.ps1")
$runtimeDir = Join-Path $projectRoot ".local"
$runtimeDir = Join-Path $runtimeDir "tmp\agent-one-local"
$backendExe = Join-Path $runtimeDir "agent-one-server.exe"
$stdoutLog = Join-Path $runtimeDir "backend.stdout.log"
$stderrLog = Join-Path $runtimeDir "backend.stderr.log"
$pidFile = Join-Path $runtimeDir "backend.pid"

# Explicitly isolate quick start from any previously selected remote environment.
$env:APP_ENV = "development"
$env:DATABASE_URL = "postgres://agentone:agentone@127.0.0.1:5432/agentone?sslmode=disable"
$env:AI_PROVIDER = "rule_based"
$env:GROQ_API_KEY = ""
$env:OPENROUTER_API_KEY = ""
$env:YANDEX_OAUTH_CLIENT_ID = ""
$env:YANDEX_OAUTH_CLIENT_SECRET = ""
$env:PORT = "8080"
$localSecretFile = Join-Path $projectRoot ".local/dev-jwt-secret"
if (-not (Test-Path $localSecretFile)) {
    $bytes = New-Object byte[] 32
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $secret = [System.BitConverter]::ToString($bytes).Replace("-", "").ToLowerInvariant()
    Set-Content -Path $localSecretFile -Value $secret -NoNewline
}
$env:JWT_SECRET = (Get-Content -Raw $localSecretFile).Trim()
if ($env:JWT_SECRET.Length -lt 32) { throw "Invalid local JWT key" }

Write-Host "=== AGENT.ONE local start ===" -ForegroundColor Cyan

# 1. Docker DB
Write-Host "`n[1/5] Starting PostgreSQL..." -ForegroundColor Yellow
docker compose up -d 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Docker Compose failed" }
Start-Sleep 3
$db = docker ps --filter "name=agentone-db" --format "{{.Status}}"
if ($db) { Write-Host "  DB: $db" -ForegroundColor Green }
else { Write-Host "  DB: FAILED" -ForegroundColor Red; exit 1 }

# 2. Frontend build
Write-Host "`n[2/5] Building frontend..." -ForegroundColor Yellow
Push-Location (Join-Path $projectRoot "client")
if (-not (Test-Path "node_modules")) {
    npm ci
    if ($LASTEXITCODE -ne 0) { Pop-Location; throw "npm ci failed" }
}
npm run build 2>&1 | Out-Null
$buildOk = ($LASTEXITCODE -eq 0)
Pop-Location
if ($buildOk) { Write-Host "  Frontend: built" -ForegroundColor Green }
else { Write-Host "  Frontend: FAILED" -ForegroundColor Red; exit 1 }

# 3. Backend build to TEMP
Write-Host "`n[3/5] Building backend..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force $runtimeDir -ErrorAction SilentlyContinue | Out-Null
Push-Location (Join-Path $projectRoot "server")
$goExe = Resolve-AgentOneGo
& $goExe build -o $backendExe ./cmd 2>&1 | Out-Null
$buildOk = ($LASTEXITCODE -eq 0)
Pop-Location
if ($buildOk -and (Test-Path $backendExe)) { Write-Host "  Backend: built" -ForegroundColor Green }
else { Write-Host "  Backend: FAILED" -ForegroundColor Red; exit 1 }

# 4. Safe stop of old local backend
Write-Host "`n[4/5] Starting backend..." -ForegroundColor Yellow
if (Test-Path $pidFile) {
    $oldPid = Get-Content $pidFile -Raw
    if ($oldPid -match '^\d+$') {
        $oldProc = Get-Process -Id ([int]$oldPid) -ErrorAction SilentlyContinue
        if ($oldProc -and $oldProc.Path -eq $backendExe) {
            Stop-Process -Id $oldProc.Id -Force -ErrorAction SilentlyContinue
            $oldProc.WaitForExit(5000)
            Write-Host "  Stopped previous local backend (PID $oldPid)"
        }
    }
    Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
}

# Check port 8080
$portCheck = Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue
if ($portCheck) {
    $portPid = $portCheck.OwningProcess
    $portProc = Get-Process -Id $portPid -ErrorAction SilentlyContinue
    if ($portProc -and $portProc.Path -ne $backendExe) {
        Write-Host "  Port 8080 occupied by PID $portPid ($($portProc.Name))" -ForegroundColor Red
        Write-Host "  Stop that process first, then retry." -ForegroundColor Yellow
        exit 1
    }
}

# Start backend
$env:PORT = "8080"
$backendProcess = Start-Process -FilePath $backendExe -WorkingDirectory $projectRoot -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog -PassThru
$backendProcess.Id | Out-File -FilePath $pidFile -NoNewline
Start-Sleep -Seconds 3

# Wait for health
$ready = $false
for ($i = 0; $i -lt 15; $i++) {
    if ($backendProcess.HasExited) {
        Write-Host "  Backend exited early (code $($backendProcess.ExitCode))" -ForegroundColor Red
        Write-Host "  Last stderr:" -ForegroundColor Yellow
        Get-Content $stderrLog -Tail 10 -ErrorAction SilentlyContinue
        Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
        exit 1
    }
    try { Invoke-RestMethod -Uri "http://localhost:8080/api/health" -TimeoutSec 3 -ErrorAction Stop | Out-Null; $ready = $true; break } catch {}
    Start-Sleep -Seconds 2
}
if (-not $ready) {
    Write-Host "  Backend not ready after 30s" -ForegroundColor Red
    Get-Content $stderrLog -Tail 10 -ErrorAction SilentlyContinue
    Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
    Stop-Process -Id $backendProcess.Id -Force -ErrorAction SilentlyContinue
    exit 1
}
Write-Host "  Backend: running (PID $($backendProcess.Id))" -ForegroundColor Green

# 5. Open browser
Write-Host "`n[5/5] Opening browser..." -ForegroundColor Yellow
Start-Process "http://localhost:8080/#"
Write-Host "`n=== AGENT.ONE started ===" -ForegroundColor Cyan
Write-Host "  http://localhost:8080"
Write-Host "  To create local demonstration accounts run: node scripts/seed.mjs"
