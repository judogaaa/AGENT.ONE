# Compatibility filename kept so existing scripts keep working.
# Validates only that this is the AGENT.ONE checkout; does not constrain the disk.
param([switch]$RequireProjectEnv)
$ErrorActionPreference = "Stop"
try {
    $root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
    $gitRoot = (& git -C $root rev-parse --show-toplevel 2>$null).Trim()
    if (-not $gitRoot) { throw "Unable to find Git root" }
    $normalizedRepo = [System.IO.Path]::GetFullPath($root).TrimEnd('\','/')
    $normalizedGit = [System.IO.Path]::GetFullPath($gitRoot).TrimEnd('\','/')
    if ($normalizedRepo -ne $normalizedGit) { throw "Not running inside AGENT.ONE root" }

    if ($RequireProjectEnv) {
        foreach ($name in @("NPM_CONFIG_CACHE", "GOCACHE", "GOMODCACHE", "TEMP")) {
            if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name, "Process"))) {
                throw "Missing project environment variable: $name"
            }
        }
    }
    Write-Host "Project preflight OK: $root"
    exit 0
} catch {
    Write-Error $_.Exception.Message
    exit 1
}
