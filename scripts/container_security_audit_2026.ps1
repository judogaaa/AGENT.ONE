param(
    [switch]$SelfTestFailurePropagation,
    [switch]$KeepImage
)

$ErrorActionPreference = "Continue"
$script:failures = 0
function recordFailure($msg) { $script:failures++; Write-Host "C-AUDIT:FAIL $msg" -ForegroundColor Red }

function Convert-CommandOutputToText {
    param([object[]]$Output)
    if ($null -eq $Output) { return "" }
    return (@($Output | ForEach-Object { if ($null -eq $_) { "" } else { $_.ToString() } }) -join [Environment]::NewLine).Trim()
}

function Pull-ImageWithRetry {
    param([string]$Image, [int]$Attempts = 4)
    for ($attempt = 1; $attempt -le $Attempts; $attempt++) {
        Write-Host "[C-AUDIT] pull $Image attempt $attempt/$Attempts ..."
        $raw = & docker pull $Image 2>&1; $code = $LASTEXITCODE; $text = Convert-CommandOutputToText $raw
        if ($code -eq 0) { Write-Host "[C-AUDIT] pull $Image ... PASS" -ForegroundColor Green; return }
        if ($attempt -lt $Attempts) { Start-Sleep -Seconds ([Math]::Min(5 * $attempt, 20)) }
    }
    recordFailure "Unable to pull $Image after $Attempts attempts: $text"
    Write-Host "CONTAINER SECURITY: FAIL" -ForegroundColor Red; exit 1
}

if ($SelfTestFailurePropagation) {
    Write-Host "=== CONTAINER FAILURE PROPAGATION SELF-TEST ==="
    & cmd.exe /c "exit 1"
    if ($LASTEXITCODE -ne 0) { Write-Host "[C-AUDIT] controlled failure ... FAIL"; Write-Host "CONTAINER SECURITY: FAIL"; exit 1 }
    exit 2
}

Write-Host "=== CONTAINER SECURITY AUDIT ===" -ForegroundColor Cyan

# Р Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљ Docker preflight Р Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљ

Write-Host "[C-AUDIT] docker preflight ..."
$dvRaw = & docker version --format "{{.Server.Version}}" 2>&1; $dvCode = $LASTEXITCODE; $dvText = Convert-CommandOutputToText $dvRaw
if ($dvCode -ne 0 -or [string]::IsNullOrWhiteSpace($dvText)) { recordFailure "docker version failed: $dvText"; Write-Host "CONTAINER SECURITY: FAIL" -ForegroundColor Red; exit 1 }
$diRaw = & docker info --format "{{.ServerVersion}}" 2>&1; $diCode = $LASTEXITCODE; $diText = Convert-CommandOutputToText $diRaw
if ($diCode -ne 0 -or [string]::IsNullOrWhiteSpace($diText)) { recordFailure "docker info failed: $diText"; Write-Host "CONTAINER SECURITY: FAIL" -ForegroundColor Red; exit 1 }
Write-Host "[C-AUDIT] docker preflight ... PASS" -ForegroundColor Green

$imageName = "agentone-security-audit:local"
$appPort = 20080
$dbPort = 62432
$dbContainer = "agentone-security-db"
$appContainer = "agentone-security-app"

# Р Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљ Capture agentone-db Р Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљ

$dbIdBeforeRaw = & docker inspect agentone-db --format "{{.Id}}" 2>&1; $dbIdBeforeCode = $LASTEXITCODE; $dbIdBefore = Convert-CommandOutputToText $dbIdBeforeRaw
if ($dbIdBeforeCode -ne 0 -or [string]::IsNullOrWhiteSpace($dbIdBefore)) { recordFailure "agentone-db not accessible"; Write-Host "CONTAINER SECURITY: FAIL" -ForegroundColor Red; exit 1 }
$dbRunningBeforeRaw = & docker inspect agentone-db --format "{{.State.Running}}" 2>&1; $dbRunningBefore = Convert-CommandOutputToText $dbRunningBeforeRaw
$dbStartedBeforeRaw = & docker inspect agentone-db --format "{{.State.StartedAt}}" 2>&1; $dbStartedBefore = Convert-CommandOutputToText $dbStartedBeforeRaw

# Р Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљ Pull base images Р Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљ

Write-Host "[C-AUDIT] pulling base images ..."
Pull-ImageWithRetry "node:20-alpine"
Pull-ImageWithRetry "golang:1.26-alpine"
Pull-ImageWithRetry "alpine:3.19"
Pull-ImageWithRetry "postgres:16"
Write-Host "[C-AUDIT] base images ... PASS" -ForegroundColor Green

# Р Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљ Build Р Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљ

Write-Host "[C-AUDIT] building image ..."
$buildOut = & docker build --pull=false --progress=plain -t $imageName --build-arg VERSION=1.0.0 --build-arg COMMIT=security-audit --build-arg BUILD_TIME=2026-07-10T10:00:00Z . 2>&1
$buildCode = $LASTEXITCODE
if ($buildCode -ne 0) { recordFailure "build failed (exit $buildCode)"; Write-Host "CONTAINER SECURITY: FAIL" -ForegroundColor Red; exit 1 }
Write-Host "[C-AUDIT] build ... PASS" -ForegroundColor Green

# Р Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљ Image inspect Р Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљ

Write-Host "[C-AUDIT] image inspect ..."
$userRaw = & docker inspect $imageName --format "{{.Config.User}}" 2>&1; $userText = Convert-CommandOutputToText $userRaw
if ($userText) { Write-Host "[C-AUDIT] user: $userText ... PASS" -ForegroundColor Green } else { recordFailure "no non-root user configured" }
$entryRaw = & docker inspect $imageName --format "{{.Config.Entrypoint}}" 2>&1; $entryText = Convert-CommandOutputToText $entryRaw
if ($entryText -match "server") { Write-Host "[C-AUDIT] entrypoint OK ... PASS" } else { recordFailure "bad entrypoint: $entryText" }
$envRaw = & docker inspect $imageName --format "{{.Config.Env}}" 2>&1; $envText = Convert-CommandOutputToText $envRaw
$secretsFound = $false
foreach ($pat in @('JWT_SECRET=', 'DATABASE_URL=postgres:', 'METRICS_TOKEN=', 'GROQ_API_KEY=gsk_', 'DB_PASSWORD=')) {
    if ($envText -match $pat) { $secretsFound = $true; recordFailure "secret in image env: $pat" }
}
if (-not $secretsFound) { Write-Host "[C-AUDIT] no secrets in image env ... PASS" -ForegroundColor Green }

# Р Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљ Start DB Р Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљ

Write-Host "[C-AUDIT] start DB ..."
& docker rm -f $dbContainer 2>$null | Out-Null
$dbRunOut = & docker run -d --name $dbContainer -e POSTGRES_USER=sec_test -e POSTGRES_PASSWORD=sec_test -e POSTGRES_DB=sec_db -p ${dbPort}:5432 postgres:16 2>&1
if ($LASTEXITCODE -ne 0) { recordFailure "DB container start failed: $(Convert-CommandOutputToText $dbRunOut)"; Write-Host "CONTAINER SECURITY: FAIL" -ForegroundColor Red; exit 1 }
$ready = $false
for ($i=0; $i -lt 15; $i++) { Start-Sleep 2; & docker exec $dbContainer pg_isready -U sec_test 2>$null | Out-Null; if ($LASTEXITCODE -eq 0) { $ready = $true; break } }
if (-not $ready) { recordFailure "DB not ready"; & docker rm -f $dbContainer 2>$null | Out-Null; Write-Host "CONTAINER SECURITY: FAIL" -ForegroundColor Red; exit 1 }
Write-Host "[C-AUDIT] DB ready ... PASS" -ForegroundColor Green

try {
    # Р Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљ Start app Р Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљ
    Write-Host "[C-AUDIT] start app ..."
    & docker rm -f $appContainer 2>$null | Out-Null
    $appRunOut = & docker run -d --name $appContainer -p ${appPort}:8080 `
        -e APP_ENV=production -e PORT=8080 `
        -e JWT_SECRET=sec-test-jwt-32-characters-minimum `
        -e "DATABASE_URL=postgres://sec_test:sec_test@host.docker.internal:${dbPort}/sec_db?sslmode=disable" `
        -e "CORS_ORIGINS=http://localhost:${appPort}" `
        -e AI_PROVIDER=rule_based -e GROQ_API_KEY="" `
        -e SECURITY_HEADERS_ENABLED=true -e METRICS_ENABLED=false -e OPS_STATUS_ENABLED=false `
        -e MAX_REQUEST_BODY_BYTES=1048576 `
        -e MAX_UPLOAD_BYTES=10485760 `
        -e SERVER_READ_TIMEOUT_SECONDS=15 `
        -e SERVER_WRITE_TIMEOUT_SECONDS=30 `
        -e SERVER_IDLE_TIMEOUT_SECONDS=60 `
        -e AUTH_FAILURE_LIMIT=5 `
        --security-opt=no-new-privileges:true --read-only --tmpfs /tmp:mode=1777,size=64M `
        $imageName 2>&1
    $appStartExit = $LASTEXITCODE

    if ($appStartExit -ne 0) {
        recordFailure "app start failed: $(Convert-CommandOutputToText $appRunOut)"
    }

    # Wait for live endpoint while also watching the container state.
    Write-Host "[C-AUDIT] wait for app..."
    $live = $false

    if ($appStartExit -eq 0) {
        for ($i = 0; $i -lt 25; $i++) {
            Start-Sleep 2

            $runningRaw = & docker inspect --format '{{.State.Running}}' $appContainer 2>&1
            $runningExit = $LASTEXITCODE
            $running = Convert-CommandOutputToText $runningRaw

            if ($runningExit -ne 0 -or $running -ne "true") {
                break
            }

            try {
                $r = Invoke-WebRequest `
                    "http://localhost:${appPort}/api/live" `
                    -TimeoutSec 3 `
                    -UseBasicParsing

                if ($r.StatusCode -eq 200) {
                    $live = $true
                    break
                }
            }
            catch {
            }
        }
    }

    if ($live) {
        Write-Host "[C-AUDIT] /api/live 200 ... PASS" -ForegroundColor Green
    }
    else {
        recordFailure "/api/live not 200"

        Write-Host "[C-AUDIT] app diagnostics ..."

        $stateRaw = & docker inspect `
            --format 'Status={{.State.Status}} ExitCode={{.State.ExitCode}} Error={{.State.Error}} OOMKilled={{.State.OOMKilled}}' `
            $appContainer 2>&1

        Write-Host "[APP-STATE] $(Convert-CommandOutputToText $stateRaw)"

        $logsRaw = & docker logs $appContainer 2>&1

        foreach ($logLine in @($logsRaw)) {
            Write-Host "[APP-LOG] $logLine"
        }
    }

    if ($live) {
        # Ready endpoint.
        try {
            $rdy = Invoke-WebRequest `
                "http://localhost:${appPort}/api/ready" `
                -TimeoutSec 5 `
                -UseBasicParsing

            if ($rdy.StatusCode -eq 200) {
                Write-Host "[C-AUDIT] /api/ready 200 ... PASS"
            }
            else {
                recordFailure "/api/ready not 200"
            }
        }
        catch {
            recordFailure "/api/ready failed: $($_.Exception.Message)"
        }

        # Security headers.
        Write-Host "[C-AUDIT] security headers ..."

        try {
            $resp = Invoke-WebRequest `
                "http://localhost:${appPort}/api/health" `
                -TimeoutSec 5 `
                -UseBasicParsing

            $hdrs = $resp.Headers

            if ($hdrs["X-Content-Type-Options"] -eq "nosniff") {
                Write-Host "[C-AUDIT] X-Content-Type-Options OK"
            }
            else {
                recordFailure "nosniff missing"
            }

            if ($hdrs["X-Frame-Options"] -eq "DENY") {
                Write-Host "[C-AUDIT] X-Frame-Options OK"
            }
            else {
                recordFailure "X-Frame-Options missing"
            }
        }
        catch {
            recordFailure "health check failed: $($_.Exception.Message)"
        }

        # Confirm that the container is still running.
        $runningRaw = & docker inspect --format '{{.State.Running}}' $appContainer 2>&1
        $runningExit = $LASTEXITCODE
        $running = Convert-CommandOutputToText $runningRaw

        if ($runningExit -ne 0 -or $running -ne "true") {
            recordFailure "app container stopped before runtime checks"
        }
        else {
            # Non-root process.
            Write-Host "[C-AUDIT] process check ..."

            $psUserRaw = & docker exec $appContainer whoami 2>&1
            $psUserExit = $LASTEXITCODE
            $psUser = Convert-CommandOutputToText $psUserRaw

            if ($psUserExit -ne 0) {
                recordFailure "cannot inspect process user: $psUser"
            }
            elseif (-not $psUser -or $psUser -eq "root") {
                recordFailure "process is root ($psUser)"
            }
            else {
                Write-Host "[C-AUDIT] process non-root ($psUser) ... PASS"
            }

            # .env absence.
            $envStateRaw = & docker exec $appContainer /bin/sh -c `
                'if [ -f /app/.env ]; then echo PRESENT; else echo ABSENT; fi' 2>&1
            $envStateExit = $LASTEXITCODE
            $envState = Convert-CommandOutputToText $envStateRaw

            if ($envStateExit -ne 0) {
                recordFailure "cannot check /app/.env: $envState"
            }
            elseif ($envState -eq "PRESENT") {
                recordFailure ".env in container"
            }
            else {
                Write-Host "[C-AUDIT] no .env ... PASS"
            }

            # .git absence.
            $gitStateRaw = & docker exec $appContainer /bin/sh -c `
                'if [ -d /app/.git ]; then echo PRESENT; else echo ABSENT; fi' 2>&1
            $gitStateExit = $LASTEXITCODE
            $gitState = Convert-CommandOutputToText $gitStateRaw

            if ($gitStateExit -ne 0) {
                recordFailure "cannot check /app/.git: $gitState"
            }
            elseif ($gitState -eq "PRESENT") {
                recordFailure ".git in container"
            }
            else {
                Write-Host "[C-AUDIT] no .git ... PASS"
            }

            # Go compiler absence.
            $goStateRaw = & docker exec $appContainer /bin/sh -c `
                'if command -v go >/dev/null 2>&1; then echo PRESENT; else echo ABSENT; fi' 2>&1
            $goStateExit = $LASTEXITCODE
            $goState = Convert-CommandOutputToText $goStateRaw

            if ($goStateExit -ne 0) {
                recordFailure "cannot check Go compiler: $goState"
            }
            elseif ($goState -eq "PRESENT") {
                recordFailure "go compiler in container"
            }
            else {
                Write-Host "[C-AUDIT] no Go ... PASS"
            }

            # Node.js absence.
            $nodeStateRaw = & docker exec $appContainer /bin/sh -c `
                'if command -v node >/dev/null 2>&1; then echo PRESENT; else echo ABSENT; fi' 2>&1
            $nodeStateExit = $LASTEXITCODE
            $nodeState = Convert-CommandOutputToText $nodeStateRaw

            if ($nodeStateExit -ne 0) {
                recordFailure "cannot check Node.js: $nodeState"
            }
            elseif ($nodeState -eq "PRESENT") {
                recordFailure "node in container"
            }
            else {
                Write-Host "[C-AUDIT] no Node ... PASS"
            }
        }
    }
    else {
        recordFailure "runtime checks skipped because app container is not healthy"
    }
}
finally {
    & docker rm -f $appContainer 2>$null | Out-Null
    & docker rm -f $dbContainer 2>$null | Out-Null
    if (-not $KeepImage) { & docker rmi $imageName 2>$null | Out-Null }
    $pApp = Get-NetTCPConnection -LocalPort $appPort -State Listen -ErrorAction SilentlyContinue
    $pDB = Get-NetTCPConnection -LocalPort $dbPort -State Listen -ErrorAction SilentlyContinue
    if ($pApp) { recordFailure "port $appPort still LISTEN" } else { Write-Host "[C-AUDIT] port $appPort free ... PASS" }
    if ($pDB) { recordFailure "port $dbPort still LISTEN" } else { Write-Host "[C-AUDIT] port $dbPort free ... PASS" }
}

# Р Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљ agentone-db unchanged Р Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљ

$dbIdAfterRaw = & docker inspect agentone-db --format "{{.Id}}" 2>&1; $dbIdAfter = Convert-CommandOutputToText $dbIdAfterRaw
$dbRunningAfterRaw = & docker inspect agentone-db --format "{{.State.Running}}" 2>&1; $dbRunningAfter = Convert-CommandOutputToText $dbRunningAfterRaw
if ($dbIdAfter -ne $dbIdBefore) { recordFailure "agentone-db ID changed" }
elseif ($dbRunningAfter -ne $dbRunningBefore) { recordFailure "agentone-db state changed" }
else { Write-Host "[C-AUDIT] agentone-db unchanged ($dbIdAfter) ... PASS" }

Write-Host ""
if ($script:failures -eq 0) { Write-Host "CONTAINER SECURITY AUDIT: PASS" -ForegroundColor Green; exit 0 }
else { Write-Host "CONTAINER SECURITY AUDIT: FAIL ($script:failures failures)" -ForegroundColor Red; exit 1 }