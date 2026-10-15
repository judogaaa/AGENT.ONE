# Portable project-specific cache and temporary paths.
$script:AgentOneProjectRoot = Split-Path $PSScriptRoot -Parent
$script:AgentOneLocalDir = Join-Path $script:AgentOneProjectRoot ".local"
$script:AgentOneTmpDir = Join-Path $script:AgentOneLocalDir "tmp"
$script:AgentOneCacheRoot = Join-Path $script:AgentOneLocalDir "cache"

foreach ($dir in @(
    $script:AgentOneLocalDir,
    $script:AgentOneTmpDir,
    (Join-Path $script:AgentOneLocalDir "logs"),
    (Join-Path $script:AgentOneLocalDir "data"),
    $script:AgentOneCacheRoot,
    (Join-Path $script:AgentOneCacheRoot "npm"),
    (Join-Path $script:AgentOneCacheRoot "pnpm-store"),
    (Join-Path $script:AgentOneCacheRoot "go-build"),
    (Join-Path $script:AgentOneCacheRoot "go-mod"),
    (Join-Path $script:AgentOneCacheRoot "playwright")
)) {
    New-Item -ItemType Directory -Force -Path $dir -ErrorAction SilentlyContinue | Out-Null
}

$env:NPM_CONFIG_CACHE = Join-Path $script:AgentOneCacheRoot "npm"
$env:npm_config_cache = $env:NPM_CONFIG_CACHE
$env:PNPM_STORE_PATH = Join-Path $script:AgentOneCacheRoot "pnpm-store"
$env:PNPM_STORE_DIR = $env:PNPM_STORE_PATH
$env:GOCACHE = Join-Path $script:AgentOneCacheRoot "go-build"
$env:GOMODCACHE = Join-Path $script:AgentOneCacheRoot "go-mod"
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path $script:AgentOneCacheRoot "playwright"
$env:TEMP = $script:AgentOneTmpDir
$env:TMP = $script:AgentOneTmpDir

& (Join-Path $PSScriptRoot "assert-d-drive.ps1") -RequireProjectEnv
if ($LASTEXITCODE -ne 0) { throw "AGENT.ONE project environment preflight failed" }

function Resolve-AgentOneGo {
    $cmd = Get-Command go.exe -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    throw "Go executable not found in PATH"
}

function Resolve-AgentOneGofmt {
    $cmd = Get-Command gofmt.exe -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    throw "gofmt executable not found in PATH"
}
