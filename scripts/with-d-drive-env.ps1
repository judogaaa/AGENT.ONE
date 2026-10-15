# Compatibility wrapper: all caches live in this checkout, not a fixed drive.
$ErrorActionPreference = "Stop"
$Command = @($args)

. (Join-Path $PSScriptRoot "agentone-local-env.ps1")

if (-not $Command -or $Command.Count -eq 0) {
    Write-Host "Portable project environment configured."
    return
}

$executable = $Command[0]
$arguments = @()
if ($Command.Count -gt 1) { $arguments = $Command[1..($Command.Count - 1)] }
& $executable @arguments
exit $LASTEXITCODE
