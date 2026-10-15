#!/usr/bin/env bash
# AGENT.ONE — Production health verification script
# Usage: bash deploy/verify-production.sh [host]
#   host: default http://localhost:8080

set -euo pipefail

HOST="${1:-http://localhost:8080}"
echo "=== Verifying $HOST ==="

check() {
  local label="$1" method="$2" path="$3" expect_code="$4" expect_body="${5:-}"
  local url="${HOST}${path}"
  echo -n "  $label ... "
  local resp
  resp=$(curl -sS -o /tmp/verify_resp.txt -w "%{http_code}" -X "$method" "$url" 2>/tmp/verify_err.txt) || {
    echo "FAIL (curl error: $(cat /tmp/verify_err.txt))"; return 1
  }
  if [ "$resp" != "$expect_code" ]; then
    echo "FAIL (HTTP $resp, expected $expect_code)"
    cat /tmp/verify_resp.txt 2>/dev/null | head -5
    return 1
  fi
  if [ -n "$expect_body" ]; then
    if ! grep -q "$expect_body" /tmp/verify_resp.txt 2>/dev/null; then
      echo "FAIL (body missing '$expect_body')"
      cat /tmp/verify_resp.txt 2>/dev/null | head -5
      return 1
    fi
  fi
  echo "OK"
}

check "Liveness"   "GET" "/api/live"   200
check "Health"     "GET" "/api/health" 200
check "Shop list"  "GET" "/api/shops"  200
check "Serves SPA" "GET" "/"           200 "root"

echo "=== All checks passed ==="
