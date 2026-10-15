[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
chcp 65001 2>&1 | Out-Null
$projectRoot = $PSScriptRoot
. (Join-Path $projectRoot "scripts\agentone-local-env.ps1")

Write-Host "=== AGENT.ONE local checks ===" -ForegroundColor Cyan

Write-Host "`n[1] Frontend build..." -ForegroundColor Yellow
Push-Location client; npm run build 2>&1 | Out-Null; Pop-Location
if ($LASTEXITCODE -ne 0) { Write-Host "  FAIL" -ForegroundColor Red; exit 1 } else { Write-Host "  PASS" -ForegroundColor Green }

Write-Host "`n[2] Backend build..." -ForegroundColor Yellow
Push-Location server
$buildDir = Join-Path $script:AgentOneTmpDir "agent-one-build"
New-Item -ItemType Directory -Force $buildDir | Out-Null
$goExe = Resolve-AgentOneGo
& $goExe build -o (Join-Path $buildDir "agent-one-server.exe") ./cmd 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { Pop-Location; Write-Host "  FAIL" -ForegroundColor Red; exit 1 }
& $goExe vet ./cmd 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { Pop-Location; Write-Host "  FAIL" -ForegroundColor Red; exit 1 }
Pop-Location
Write-Host "  PASS" -ForegroundColor Green

Write-Host "`n[3] Backend running?" -ForegroundColor Yellow
try { Invoke-RestMethod "http://localhost:8080/api/health" -Method GET -TimeoutSec 5 | Out-Null; Write-Host "  PASS" -ForegroundColor Green }
catch { Write-Host "  FAIL - start backend first" -ForegroundColor Red; exit 1 }

Write-Host "`n[4] Demo images..." -ForegroundColor Yellow
node scripts/verify_demo_images_http_2026.mjs 2>&1 | Select-Object -Last 1
if ($LASTEXITCODE -ne 0) { Write-Host "  FAIL" -ForegroundColor Red; exit 1 }

Write-Host "`n[5] Smoke test..." -ForegroundColor Yellow
node scripts/smoke.mjs 2>&1 | Select-Object -Last 1
if ($LASTEXITCODE -ne 0) { Write-Host "  FAIL" -ForegroundColor Red; exit 1 }

Write-Host "`n[6] Full flow audit..." -ForegroundColor Yellow
node scripts/full_flow_audit_2026.mjs 2>&1 | Select-Object -Last 1
if ($LASTEXITCODE -ne 0) { Write-Host "  FAIL" -ForegroundColor Red; exit 1 }

Write-Host "`n=== Done ===" -ForegroundColor Cyan
