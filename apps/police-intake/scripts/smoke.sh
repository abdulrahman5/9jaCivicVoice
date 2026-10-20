#!/usr/bin/env bash
# Smoke test for a deployed police intake Worker. Stores nothing: every request is
# refused before it reaches the vault's write functions.
#
#   apps/police-intake/scripts/smoke.sh https://police.example.org
#
# Checks the pages and their privacy headers, that the Worker reaches the vault (an
# unknown status code is "not found", not an error), and that Turnstile fails closed.
set -euo pipefail

BASE="${1:?usage: smoke.sh <police form URL>}"
BASE="${BASE%/}"
fail=0
pass() { echo "ok   $1"; }
bad() { echo "FAIL $1"; fail=1; }

headers=$(mktemp)
status=$(curl -sS -o /dev/null -D "$headers" -w '%{http_code}' "$BASE/")
[ "$status" = 200 ] && pass "GET / is 200" || bad "GET / returned $status"
grep -qi "^content-security-policy: default-src 'self'" "$headers" && pass "strict CSP" || bad "CSP missing or not strict"
grep -qi '^cache-control: no-store' "$headers" && pass "not cached" || bad "Cache-Control: no-store missing"
grep -qi '^referrer-policy: no-referrer' "$headers" && pass "no referrer" || bad "Referrer-Policy missing"
grep -qi '^x-robots-tag: noindex' "$headers" && pass "not indexed" || bad "X-Robots-Tag missing"
grep -qi '^set-cookie:' "$headers" && bad "sets a cookie" || pass "no cookies"
rm -f "$headers"

code() { curl -sS -o /dev/null -w '%{http_code}' "$@"; }
post() { code -X POST -H 'content-type: application/json' --data "$2" "$BASE$1"; }

[ "$(code "$BASE/status")" = 200 ] && pass "GET /status is 200" || bad "GET /status failed"
[ "$(code "$BASE/no-such-page")" = 404 ] && pass "unknown page is 404" || bad "unknown page not 404"
[ "$(post /api/submit '{}')" = 422 ] && pass "invalid report refused (422)" || bad "invalid report not refused"
[ "$(post /api/status '{"code":"nope"}')" = 422 ] && pass "malformed code refused (422)" || bad "malformed code not refused"

s=$(post /api/status '{"code":"able acid aged also area army"}')
[ "$s" = 404 ] && pass "reaches the vault: unknown code is 404" \
  || bad "status lookup returned $s (502 means the vault URL, anon key or lookup secret is wrong)"

s=$(post /api/submit '{"city":"lagos","incidentType":"money_demanded","place":"Smoke test","when":"today","consentToForward":false}')
[ "$s" = 403 ] && pass "Turnstile fails closed: report without a token refused (403)" \
  || bad "report without a Turnstile token returned $s (expected 403)"

exit "$fail"
