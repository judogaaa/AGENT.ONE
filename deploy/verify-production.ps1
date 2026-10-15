# AGENT.ONE — Production health verification script (PowerShell)
# Usage: .\deploy\verify-production.ps1 [[-Host] <string>]
#   Host: default http://localhost:8080

param([string]$TargetHost = "http://localhost:8080")

Write-Host "=== Verifying $TargetHost ==="

$checks = @(
    @{Label="Liveness";   Method="GET"; Path="/api/live";   Expect=200}
    @{Label="Health";     Method="GET"; Path="/api/health"; Expect=200}
    @{Label="Shop list";  Method="GET"; Path="/api/shops";  Expect=200}
    @{Label="Serves SPA"; Method="GET"; Path="/";           Expect=200}
)

$allPassed = $true
foreach ($c in $checks) {
    Write-Host "  $($c.Label) ... " -NoNewline
    try {
        $resp = curl.exe -sS -o nul -w "%{http_code}" "$($TargetHost)$($c.Path)" 2>$null
        if ($resp -eq $c.Expect) {
            Write-Host "OK"
        } else {
            Write-Host "FAIL (HTTP $resp, expected $($c.Expect))"
            $allPassed = $false
        }
    } catch {
        Write-Host "FAIL ($($_.Exception.Message))"
        $allPassed = $false
    }
}

if ($allPassed) {
    Write-Host "=== All checks passed ==="
} else {
    Write-Host "=== Some checks FAILED ==="
    exit 1
}
