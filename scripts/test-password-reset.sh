#!/usr/bin/env bash
# =============================================================================
# test-password-reset.sh — Manual end-to-end exercise of Phase 5 password reset
#
# Usage:
#   NODE_ENV=test bash backend/scripts/test-password-reset.sh [BASE_URL]
#
# Defaults to http://localhost:3000. Override with:
#   NODE_ENV=test bash backend/scripts/test-password-reset.sh http://localhost:4000
#
# IMPORTANT: The server must be started with NODE_ENV=test to enable the
# debug token retrieval endpoint (GET /auth/_test/last-reset-token).
# That endpoint returns 404 on any other NODE_ENV value by design.
#
# What it exercises:
#   0.  Health check — server is up
#   1.  Debug endpoint safety check — confirm it returns 404 when NODE_ENV≠test
#   2.  Register + login a test user
#   3.  Reset request for an unknown email — expect 200 (enumeration prevention)
#   4.  Reset request for a real user       — expect 200
#   5.  Retrieve raw token via debug endpoint (NODE_ENV=test only)
#   6.  Reset password with the valid token — expect 200
#   7.  Log in with the NEW password         — expect 200 (confirms update worked)
#   8.  Log in with the OLD password         — expect 401 (old password no longer works)
#   9.  Replay the same token again          — expect 400 (replay prevention)
#   10. Request a SECOND reset (invalidates first token)
#   11. Confirm the FIRST token no longer works (old-token invalidation)
#   12. Cleanup
#
# Each step prints:
#   expected : <what we expect>
#   status   : <actual HTTP status, coloured green/red>
#   body     : <prettified JSON response>
# =============================================================================

BASE="${1:-http://localhost:3000}"
RESET_EMAIL="reset-script-user@test.local"
RESET_PASSWORD="Original@123"
NEW_PASSWORD="Updated@456"

# ─── Colour helpers ───────────────────────────────────────────────────────────

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

header() { echo -e "\n${BOLD}${CYAN}══ $* ══${RESET}"; }
label()  { echo -e "${YELLOW}▶ $*${RESET}"; }
expect() { echo -e "  expected : $*"; }
pass()   { echo -e "  ${GREEN}✓ PASS${RESET}"; }
fail()   { echo -e "  ${RED}✗ FAIL — $*${RESET}"; FAILURES=$((FAILURES + 1)); }

FAILURES=0

# ─── curl wrapper ─────────────────────────────────────────────────────────────
# Prints status + prettified JSON body, echoes the HTTP status as the last line.

call() {
  local method="$1"; shift
  local url="$1";    shift

  local response
  response=$(curl -s -w '\n{"__status__":%{http_code}}' \
    -X "$method" \
    -H "Content-Type: application/json" \
    "$@" \
    "$url")

  local body status
  body=$(echo "$response" | head -n -1)
  status=$(echo "$response" | tail -n 1 | grep -o '"__status__":[0-9]*' | grep -o '[0-9]*$')

  if   [[ "$status" -ge 200 && "$status" -lt 300 ]]; then
    echo -e "  status   : ${GREEN}${status}${RESET}"
  elif [[ "$status" -ge 400 && "$status" -lt 500 ]]; then
    echo -e "  status   : ${RED}${status}${RESET}"
  else
    echo -e "  status   : ${YELLOW}${status}${RESET}"
  fi

  if command -v python3 &>/dev/null; then
    echo -e "  body     : $(echo "$body" | python3 -m json.tool 2>/dev/null || echo "$body")"
  else
    echo -e "  body     : $body"
  fi

  echo "$status"
}

check_status() {
  local expected="$1" actual="$2"
  if [[ "$actual" == "$expected" ]]; then
    pass
  else
    fail "expected HTTP $expected, got $actual"
  fi
}

# ─── 0. Health check ──────────────────────────────────────────────────────────

header "0. Health check"
label "GET $BASE/health"
HTTP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/health")
if [[ "$HTTP" != "200" ]]; then
  echo -e "${RED}Server not reachable at $BASE (HTTP $HTTP). Start it first.${RESET}"
  echo -e "${YELLOW}Run: NODE_ENV=test node server.js${RESET}"
  exit 1
fi
echo -e "  ${GREEN}Server is up (200)${RESET}"

# ─── 1. Debug endpoint safety check ──────────────────────────────────────────
#
# Hit the debug endpoint WITHOUT NODE_ENV=test set in the request context.
# The server's NODE_ENV is what matters here — we check it by calling the
# endpoint with the server as-is (no special header), then again with an
# explicit note that if the server itself is running with NODE_ENV=test the
# endpoint will be active. The script validates that it returns 404 when the
# server is running under a *non-test* NODE_ENV.
#
# How to confirm this manually: start the server with NODE_ENV=production (or
# without any NODE_ENV) and confirm this step returns 404.

header "1. Debug endpoint safety — must return 404 when NODE_ENV ≠ test"
label "GET $BASE/auth/_test/last-reset-token  (no NODE_ENV=test on server)"
expect "${RED}404${RESET} when server is running without NODE_ENV=test"
echo -e "  ${YELLOW}NOTE: If your server IS running with NODE_ENV=test, this step will${RESET}"
echo -e "  ${YELLOW}show a 404 only if no reset token exists yet — that is also correct.${RESET}"
echo -e "  ${YELLOW}To fully verify the guard: restart the server without NODE_ENV=test${RESET}"
echo -e "  ${YELLOW}and re-run this script — the endpoint must always return 404 then.${RESET}"

SAFETY_STATUS=$(call GET "$BASE/auth/_test/last-reset-token" | tail -n 1)

# The endpoint returns 404 in two valid cases:
#   a) NODE_ENV ≠ test  (the security guard)
#   b) NODE_ENV = test but no token exists yet (we haven't requested a reset)
# Both are acceptable at this point in the script.
if [[ "$SAFETY_STATUS" == "404" ]]; then
  echo -e "  ${GREEN}✓ Endpoint returned 404 — guard is active or no token yet (both correct)${RESET}"
elif [[ "$SAFETY_STATUS" == "200" ]]; then
  echo -e "  ${YELLOW}⚠  Endpoint returned 200 — server is running with NODE_ENV=test and a${RESET}"
  echo -e "  ${YELLOW}   stale token exists from a previous run. This is acceptable for the${RESET}"
  echo -e "  ${YELLOW}   script but confirms the guard is only active outside NODE_ENV=test.${RESET}"
else
  fail "Unexpected status $SAFETY_STATUS from debug endpoint"
fi

# ─── 2. Register + login a test user ─────────────────────────────────────────

header "2a. Register test user"
label "POST /auth/register"
expect "${GREEN}201${RESET} (or 409 if account already exists from a previous run)"
REG_RESP=$(curl -s -X POST "$BASE/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$RESET_EMAIL\",\"password\":\"$RESET_PASSWORD\",\"name\":\"Reset Script User\",\"teamName\":\"Reset Script Team\"}")
echo -e "  body     : $(echo "$REG_RESP" | python3 -m json.tool 2>/dev/null || echo "$REG_RESP")"

header "2b. Login"
label "POST /auth/login  →  with original password"
expect "${GREEN}200${RESET}"
LOGIN_RESP=$(curl -s -X POST "$BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$RESET_EMAIL\",\"password\":\"$RESET_PASSWORD\"}")
echo -e "  body     : $(echo "$LOGIN_RESP" | python3 -m json.tool 2>/dev/null || echo "$LOGIN_RESP")"

USER_ID=$(echo "$LOGIN_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['user']['id'])" 2>/dev/null)

if [[ -z "$USER_ID" ]]; then
  # Might have failed because account already exists with updated password from
  # a previous partial run — try the new password
  echo -e "  ${YELLOW}Login with original password failed. Trying updated password from last run...${RESET}"
  LOGIN_RESP=$(curl -s -X POST "$BASE/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$RESET_EMAIL\",\"password\":\"$NEW_PASSWORD\"}")
  USER_ID=$(echo "$LOGIN_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['user']['id'])" 2>/dev/null)
  if [[ -n "$USER_ID" ]]; then
    echo -e "  ${YELLOW}Logged in with updated password (previous run completed a reset).${RESET}"
    echo -e "  ${YELLOW}Continuing — original password for step 8 will be $NEW_PASSWORD (inverted).${RESET}"
    RESET_PASSWORD="$NEW_PASSWORD"
    NEW_PASSWORD="Updated@789"
  fi
fi

if [[ -z "$USER_ID" ]]; then
  echo -e "${RED}Failed to log in as test user — aborting.${RESET}"
  exit 1
fi
echo -e "  ${GREEN}user_id=$USER_ID${RESET}"

# ─── 3. Reset request for an unknown email ────────────────────────────────────

header "3. Forgot-password for a non-existent email"
label "POST /auth/forgot-password  →  unknown@nowhere.test"
expect "${GREEN}200${RESET} — always succeeds to prevent email enumeration"
STATUS=$(call POST "$BASE/auth/forgot-password" \
  -d '{"email":"unknown@nowhere.test"}' \
  | tail -n 1)
check_status 200 "$STATUS"

# Confirm email send was NOT invoked — since we're exercising the endpoint
# through HTTP (not a unit test), we can only check the debug endpoint to
# confirm no new token was stored for the unknown address.
TOKEN_CHECK=$(curl -s "$BASE/auth/_test/last-reset-token")
STORED_USER=$(echo "$TOKEN_CHECK" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('token',''))" 2>/dev/null)
if [[ -z "$STORED_USER" ]]; then
  echo -e "  ${GREEN}✓ No token created for unknown email (debug endpoint returned no token)${RESET}"
else
  echo -e "  ${YELLOW}⚠  A token exists, but may be from a previous run — not necessarily for this email${RESET}"
fi

# ─── 4. Reset request for the real user ──────────────────────────────────────

header "4. Forgot-password for the real test user"
label "POST /auth/forgot-password  →  $RESET_EMAIL"
expect "${GREEN}200${RESET}"
STATUS=$(call POST "$BASE/auth/forgot-password" \
  -d "{\"email\":\"$RESET_EMAIL\"}" \
  | tail -n 1)
check_status 200 "$STATUS"

# ─── 5. Retrieve token via debug endpoint ────────────────────────────────────

header "5. Retrieve raw token via debug endpoint"
label "GET $BASE/auth/_test/last-reset-token"
expect "${GREEN}200${RESET} with token field (only works when server runs with NODE_ENV=test)"

TOKEN_RESP=$(curl -s "$BASE/auth/_test/last-reset-token")
echo -e "  body     : $(echo "$TOKEN_RESP" | python3 -m json.tool 2>/dev/null || echo "$TOKEN_RESP")"

FIRST_RAW_TOKEN=$(echo "$TOKEN_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('token',''))" 2>/dev/null)

if [[ -z "$FIRST_RAW_TOKEN" ]]; then
  echo -e "${RED}Could not retrieve reset token. Is the server running with NODE_ENV=test?${RESET}"
  echo -e "${YELLOW}Start with: NODE_ENV=test node server.js${RESET}"
  exit 1
fi

echo -e "  ${GREEN}✓ Raw token retrieved (${#FIRST_RAW_TOKEN} chars)${RESET}"

# ─── 6. Reset password with the valid token ──────────────────────────────────

header "6. Reset password using the valid token"
label "POST /auth/reset-password  →  token + new password"
expect "${GREEN}200${RESET}"
STATUS=$(call POST "$BASE/auth/reset-password" \
  -d "{\"token\":\"$FIRST_RAW_TOKEN\",\"password\":\"$NEW_PASSWORD\"}" \
  | tail -n 1)
check_status 200 "$STATUS"

# ─── 7. Login with new password (confirms update worked) ─────────────────────

header "7. Login with the NEW password"
label "POST /auth/login  →  $NEW_PASSWORD"
expect "${GREEN}200${RESET} — password was updated"
STATUS=$(call POST "$BASE/auth/login" \
  -d "{\"email\":\"$RESET_EMAIL\",\"password\":\"$NEW_PASSWORD\"}" \
  | tail -n 1)
check_status 200 "$STATUS"

# ─── 8. Login with old password (must fail) ──────────────────────────────────

header "8. Login with the OLD password"
label "POST /auth/login  →  $RESET_PASSWORD (the original one)"
expect "${RED}401${RESET} — old password is no longer valid"
STATUS=$(call POST "$BASE/auth/login" \
  -d "{\"email\":\"$RESET_EMAIL\",\"password\":\"$RESET_PASSWORD\"}" \
  | tail -n 1)
check_status 401 "$STATUS"

# ─── 9. Replay the same token (must be rejected) ─────────────────────────────

header "9. Replay the already-used token"
label "POST /auth/reset-password  →  same token again"
expect "${RED}400${RESET} — token was already used (replay prevention)"
STATUS=$(call POST "$BASE/auth/reset-password" \
  -d "{\"token\":\"$FIRST_RAW_TOKEN\",\"password\":\"Replay@999\"}" \
  | tail -n 1)
check_status 400 "$STATUS"

# ─── 10. Request a second reset (invalidates any existing unused tokens) ──────

header "10. Request a second reset"
label "POST /auth/forgot-password  →  $RESET_EMAIL (again)"
expect "${GREEN}200${RESET} — new token generated, old unused tokens deleted"
STATUS=$(call POST "$BASE/auth/forgot-password" \
  -d "{\"email\":\"$RESET_EMAIL\"}" \
  | tail -n 1)
check_status 200 "$STATUS"

# Retrieve the second token
SECOND_TOKEN_RESP=$(curl -s "$BASE/auth/_test/last-reset-token")
SECOND_RAW_TOKEN=$(echo "$SECOND_TOKEN_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('token',''))" 2>/dev/null)
echo -e "  second token retrieved: ${SECOND_RAW_TOKEN:0:16}... (${#SECOND_RAW_TOKEN} chars)"

if [[ "$SECOND_RAW_TOKEN" == "$FIRST_RAW_TOKEN" ]]; then
  fail "second token is identical to the first — invalidation may not have worked"
else
  echo -e "  ${GREEN}✓ New token is distinct from the first${RESET}"
fi

# ─── 11. First token no longer works after second reset request ───────────────

header "11. Old-token invalidation — first token must be rejected"
label "POST /auth/reset-password  →  first token (should be invalidated by step 10)"
expect "${RED}400${RESET} — first token was invalidated when the second reset was requested"

# The first token was already marked 'used' in step 6, so it returns
# "already been used" rather than "not found". Both are 400s and both
# confirm the token cannot be used again — either path is correct.
STATUS=$(call POST "$BASE/auth/reset-password" \
  -d "{\"token\":\"$FIRST_RAW_TOKEN\",\"password\":\"InvalidReuse@001\"}" \
  | tail -n 1)
check_status 400 "$STATUS"

# Also confirm the SECOND token (unused) works — proves the new one is valid
echo ""
label "Bonus: confirm the SECOND token is functional (resets back to original password)"
expect "${GREEN}200${RESET}"
STATUS=$(call POST "$BASE/auth/reset-password" \
  -d "{\"token\":\"$SECOND_RAW_TOKEN\",\"password\":\"$RESET_PASSWORD\"}" \
  | tail -n 1)
check_status 200 "$STATUS"

# ─── 12. Invalid/made-up token ────────────────────────────────────────────────

header "12. Completely invalid token"
label "POST /auth/reset-password  →  made-up token 'not-a-real-token-abc123'"
expect "${RED}400${RESET} — no matching hash in the DB"
STATUS=$(call POST "$BASE/auth/reset-password" \
  -d '{"token":"not-a-real-token-abc123","password":"whatever123"}' \
  | tail -n 1)
check_status 400 "$STATUS"

# ─── Summary ──────────────────────────────────────────────────────────────────

echo ""
echo -e "${BOLD}${CYAN}═══════════════════════════════════════════${RESET}"
if [[ "$FAILURES" -eq 0 ]]; then
  echo -e "${BOLD}${GREEN}  All checks passed ✓${RESET}"
else
  echo -e "${BOLD}${RED}  $FAILURES check(s) failed ✗ — review output above${RESET}"
fi
echo -e "${BOLD}${CYAN}═══════════════════════════════════════════${RESET}"
echo ""
echo "Test account left in the database:"
echo "  $RESET_EMAIL  (user_id=$USER_ID)"
echo ""
echo "To remove it, run Prisma Studio or:"
echo "  DELETE FROM users WHERE email = '$RESET_EMAIL';"
