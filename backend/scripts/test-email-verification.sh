#!/usr/bin/env bash
# =============================================================================
# test-email-verification.sh — Manual end-to-end exercise of Phase 6
#                               email verification flow
#
# Usage:
#   NODE_ENV=test bash backend/scripts/test-email-verification.sh [BASE_URL]
#
# Defaults to http://localhost:3000. Override with:
#   NODE_ENV=test bash backend/scripts/test-email-verification.sh http://localhost:4000
#
# IMPORTANT: The server must be started with NODE_ENV=test to enable the
# debug token retrieval endpoint (GET /auth/_test/last-verify-token).
# That endpoint returns 404 on any other NODE_ENV value by design.
#
# What it exercises:
#   0.  Health check — server is up
#   1.  Debug endpoint safety check — confirm it 404s when NODE_ENV ≠ test
#   2.  Register a new user — confirm emailVerified is false in the response
#   3.  Perform a restricted action (create a task) as an unverified user —
#       confirm it is ALLOWED (unverified users are not locked out) and inspect
#       the login response for the emailVerified indicator the frontend uses to
#       show the "please verify your email" banner
#   4.  Call GET /auth/verify-email with a made-up token — expect 400
#   5.  Call GET /auth/verify-email with an expired token — DB-level expiry
#       simulation via direct DB manipulation note (manual-only check flagged)
#   6.  Retrieve the real token via the debug endpoint
#   7.  Call GET /auth/verify-email with the real token — expect 200
#   8.  Confirm the user is now marked verified (login response shows
#       emailVerified: true)
#   9.  Confirm the same restricted action (task creation) still works — no
#       regression after verification
#   10. Request resend-verification for the now-verified user — expect 200
#       (silent no-op, user already verified — enumeration prevention)
#   11. Register a SECOND test user to exercise resend token invalidation:
#       a. Register second user, grab first verification token
#       b. Request resend — grab second token
#       c. Confirm old token no longer works (invalidated)
#       d. Confirm new token works
#   12. Cleanup — delete test tasks created during this run
#
# Each step prints:
#   expected : <what we expect>
#   status   : <actual HTTP status, coloured green/red>
#   body     : <prettified JSON response>
# =============================================================================

BASE="${1:-http://localhost:3000}"
# Use a timestamp suffix so each run gets a fresh user that is guaranteed
# to be unverified — avoids the "account already exists" edge case on reruns.
TS=$(date +%s)
VER_EMAIL="ver-script-${TS}@test.local"
VER_EMAIL2="ver-script-${TS}-2@test.local"
VER_PASSWORD="Verify@123"

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
info()   { echo -e "  ${YELLOW}ℹ  $*${RESET}"; }

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
# Mirrors the same check in test-password-reset.sh. The endpoint must return
# 404 unless NODE_ENV=test is set on the server. We accept 404 here because:
#   a) NODE_ENV ≠ test   → security guard fires
#   b) NODE_ENV = test + no token in memory yet → also 404 (no prior register)
# Both cases are correct at this point in the script.

header "1. Debug endpoint safety — must return 404 when NODE_ENV ≠ test"
label "GET $BASE/auth/_test/last-verify-token  (before any registration)"
expect "${RED}404${RESET} when server is not running with NODE_ENV=test"
echo ""
info "NOTE: If your server IS running with NODE_ENV=test, this step returns"
info "404 because no verify token has been minted yet — that is also correct."
info "To fully verify the guard: restart without NODE_ENV=test and re-run."

SAFETY_STATUS=$(call GET "$BASE/auth/_test/last-verify-token" | tail -n 1)

if [[ "$SAFETY_STATUS" == "404" ]]; then
  echo -e "  ${GREEN}✓ Endpoint returned 404 — guard is active or no token yet (both correct)${RESET}"
elif [[ "$SAFETY_STATUS" == "200" ]]; then
  echo -e "  ${YELLOW}⚠  Endpoint returned 200 — stale token from a previous run exists.${RESET}"
  echo -e "  ${YELLOW}   This is acceptable for the script but confirms NODE_ENV=test is set.${RESET}"
else
  fail "Unexpected status $SAFETY_STATUS from debug endpoint"
fi

# ─── 2. Register test user — confirm emailVerified is false ──────────────────

header "2. Register test user — emailVerified must be false"
label "POST /auth/register  →  $VER_EMAIL"
expect "${GREEN}201${RESET} with user.emailVerified = false  (or 409 if account already exists)"

REG_RESP=$(curl -s -X POST "$BASE/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$VER_EMAIL\",\"password\":\"$VER_PASSWORD\",\"name\":\"Ver Script User\",\"teamName\":\"Ver Script Team\"}")
echo -e "  body     : $(echo "$REG_RESP" | python3 -m json.tool 2>/dev/null || echo "$REG_RESP")"

EMAIL_VERIFIED_AFTER_REG=$(echo "$REG_RESP" | python3 -c \
  "import sys,json; d=json.load(sys.stdin); print(d.get('user',{}).get('emailVerified','MISSING'))" 2>/dev/null)
if [[ "$EMAIL_VERIFIED_AFTER_REG" == "False" || "$EMAIL_VERIFIED_AFTER_REG" == "false" ]]; then
  pass
  echo -e "  ${GREEN}✓ user.emailVerified = false immediately after registration${RESET}"
elif [[ "$EMAIL_VERIFIED_AFTER_REG" == "MISSING" ]]; then
  info "emailVerified field not present in register response — will check via login below"
else
  fail "Expected emailVerified=false after registration, got: $EMAIL_VERIFIED_AFTER_REG"
fi

# Login to get the token and team ID — also shows the emailVerified indicator
header "2b. Login as newly-registered user — inspect emailVerified indicator"
label "POST /auth/login  →  $VER_EMAIL"
expect "${GREEN}200${RESET} with user.emailVerified = false (this is what the frontend reads to show the banner)"

LOGIN_RESP=$(curl -s -X POST "$BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$VER_EMAIL\",\"password\":\"$VER_PASSWORD\"}")
echo -e "  body     : $(echo "$LOGIN_RESP" | python3 -m json.tool 2>/dev/null || echo "$LOGIN_RESP")"

USER_TOKEN=$(echo "$LOGIN_RESP"   | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['token'])" 2>/dev/null)
TEAM_ID=$(echo "$LOGIN_RESP"      | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['team']['id'])" 2>/dev/null)
USER_ID=$(echo "$LOGIN_RESP"      | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['user']['id'])" 2>/dev/null)
EMAIL_VERIFIED=$(echo "$LOGIN_RESP" | python3 -c \
  "import sys,json; d=json.load(sys.stdin); print(d.get('user',{}).get('emailVerified','MISSING'))" 2>/dev/null)

if [[ -z "$USER_TOKEN" || -z "$TEAM_ID" ]]; then
  echo -e "${RED}Failed to log in — aborting.${RESET}"
  exit 1
fi

echo -e "  ${BOLD}emailVerified indicator in login response:${RESET} ${CYAN}$EMAIL_VERIFIED${RESET}"
if [[ "$EMAIL_VERIFIED" == "False" || "$EMAIL_VERIFIED" == "false" ]]; then
  pass
  echo -e "  ${GREEN}✓ user.emailVerified = false — frontend will show the 'please verify' banner${RESET}"
elif [[ "$EMAIL_VERIFIED" == "True" || "$EMAIL_VERIFIED" == "true" ]]; then
  info "User is already verified (account may exist from a prior run that completed step 7)."
  info "Continuing — steps 4, 6, 7 will exercise the flow against a new token from resend."
else
  info "emailVerified field returned: '$EMAIL_VERIFIED'"
fi

echo -e "  ${GREEN}user_id=$USER_ID  team_id=$TEAM_ID${RESET}"

# ─── 3. Restricted action as unverified user — must be ALLOWED ───────────────

header "3. Create a task as an unverified user — must be ALLOWED"
label "POST /tasks  (unverified user, X-Team-Id: $TEAM_ID)"
expect "${GREEN}201${RESET} — unverified users can still use the app (not locked out)"
info "The 'please verify your email' banner comes from user.emailVerified=false in"
info "the login response — checked in step 2b above. No per-request warning header"
info "is emitted by task routes; the frontend drives the UX from login state."

STATUS=$(call POST "$BASE/tasks" \
  -H "Authorization: Bearer $USER_TOKEN" \
  -H "X-Team-Id: $TEAM_ID" \
  -d '{"title":"Verification flow test task"}' \
  | tail -n 1)
check_status 201 "$STATUS"

# Capture the task ID for cleanup at the end
TASK_RESP=$(curl -s -X POST "$BASE/tasks" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $USER_TOKEN" \
  -H "X-Team-Id: $TEAM_ID" \
  -d '{"title":"Verification flow scratch task (cleanup target)"}')
SCRATCH_TASK_ID=$(echo "$TASK_RESP" | python3 -c \
  "import sys,json; d=json.load(sys.stdin); print(d.get('task',{}).get('id',''))" 2>/dev/null)

# ─── 4. Invalid token — must be rejected ─────────────────────────────────────

header "4. Verify-email with a made-up token — must be rejected"
label "GET $BASE/auth/verify-email?token=not-a-real-token-abc123xyz"
expect "${RED}400${RESET} — no matching hash in the DB"

STATUS=$(call GET "$BASE/auth/verify-email?token=not-a-real-token-abc123xyz" \
  | tail -n 1)
check_status 400 "$STATUS"

# ─── 5. Expired token simulation note ────────────────────────────────────────

header "5. Expired token — expiry simulation"
label "NOTE — manual-only check"
echo ""
info "Simulating an expired verification token requires either:"
info "  a) Directly updating the expiresAt column in the DB to a past timestamp"
info "     before calling GET /auth/verify-email, or"
info "  b) Setting VERIFY_TOKEN_TTL_MS=1 in the server and waiting 1ms."
info ""
info "This is covered by the Jest test suite (email-verification.test.js),"
info "which manipulates the DB directly to force expiry in test environments."
info ""
info "To test manually:"
info "  1. Run the server, register a user, grab the token from the debug endpoint"
info "  2. In psql/Prisma Studio, set:"
info "       UPDATE email_verification_tokens"
info "         SET expires_at = now() - interval '1 hour'"
info "         WHERE token_hash = sha256(decode('<raw_token>','hex'))::text;"
info "  3. Call GET /auth/verify-email?token=<raw_token> — expect 400"
echo ""
echo -e "  ${YELLOW}⊘ SKIPPED (manual-only — covered by Jest unit tests)${RESET}"

# ─── 6. Retrieve real token via debug endpoint ────────────────────────────────

header "6. Retrieve the real verification token via debug endpoint"
label "GET $BASE/auth/_test/last-verify-token"
expect "${GREEN}200${RESET} with token field (only works when server runs with NODE_ENV=test)"

TOKEN_RESP=$(curl -s "$BASE/auth/_test/last-verify-token")
echo -e "  body     : $(echo "$TOKEN_RESP" | python3 -m json.tool 2>/dev/null || echo "$TOKEN_RESP")"

RAW_TOKEN=$(echo "$TOKEN_RESP" | python3 -c \
  "import sys,json; d=json.load(sys.stdin); print(d.get('token',''))" 2>/dev/null)

if [[ -z "$RAW_TOKEN" ]]; then
  echo -e "${RED}Could not retrieve verification token. Is the server running with NODE_ENV=test?${RESET}"
  echo -e "${YELLOW}Start with: NODE_ENV=test node server.js${RESET}"
  exit 1
fi

echo -e "  ${GREEN}✓ Raw verify token retrieved (${#RAW_TOKEN} chars)${RESET}"

# ─── 7. Call verify-email with the real token — expect success ───────────────

header "7. Verify email with the real token — expect success"
label "GET $BASE/auth/verify-email?token=<retrieved_token>"
expect "${GREEN}200${RESET} — email verified successfully"

STATUS=$(call GET "$BASE/auth/verify-email?token=$RAW_TOKEN" \
  | tail -n 1)
check_status 200 "$STATUS"

# ─── 8. Confirm user is now marked verified ───────────────────────────────────

header "8. Login again — confirm emailVerified is now true"
label "POST /auth/login  →  $VER_EMAIL"
expect "${GREEN}200${RESET} with user.emailVerified = true"

POST_LOGIN_RESP=$(curl -s -X POST "$BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$VER_EMAIL\",\"password\":\"$VER_PASSWORD\"}")
echo -e "  body     : $(echo "$POST_LOGIN_RESP" | python3 -m json.tool 2>/dev/null || echo "$POST_LOGIN_RESP")"

EMAIL_VERIFIED_AFTER=$(echo "$POST_LOGIN_RESP" | python3 -c \
  "import sys,json; d=json.load(sys.stdin); print(d.get('user',{}).get('emailVerified','MISSING'))" 2>/dev/null)

echo -e "  ${BOLD}emailVerified after verification:${RESET} ${CYAN}$EMAIL_VERIFIED_AFTER${RESET}"
if [[ "$EMAIL_VERIFIED_AFTER" == "True" || "$EMAIL_VERIFIED_AFTER" == "true" ]]; then
  pass
  echo -e "  ${GREEN}✓ user.emailVerified = true — banner would be dismissed in the frontend${RESET}"
else
  fail "Expected emailVerified=true after verification, got: $EMAIL_VERIFIED_AFTER"
fi

# Refresh token (same user, now verified)
USER_TOKEN=$(echo "$POST_LOGIN_RESP" | python3 -c \
  "import sys,json; d=json.load(sys.stdin); print(d['token'])" 2>/dev/null)

# ─── 9. Task creation still works after verification ─────────────────────────

header "9. Create a task as a VERIFIED user — must still work"
label "POST /tasks  (verified user, X-Team-Id: $TEAM_ID)"
expect "${GREEN}201${RESET} — no regression after verification"

STATUS=$(call POST "$BASE/tasks" \
  -H "Authorization: Bearer $USER_TOKEN" \
  -H "X-Team-Id: $TEAM_ID" \
  -d '{"title":"Post-verification task — regression check"}' \
  | tail -n 1)
check_status 201 "$STATUS"

# Capture this task ID for cleanup
POST_VER_TASK_RESP=$(curl -s -X POST "$BASE/tasks" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $USER_TOKEN" \
  -H "X-Team-Id: $TEAM_ID" \
  -d '{"title":"Post-verification scratch task (cleanup target)"}')
POST_VER_TASK_ID=$(echo "$POST_VER_TASK_RESP" | python3 -c \
  "import sys,json; d=json.load(sys.stdin); print(d.get('task',{}).get('id',''))" 2>/dev/null)

# ─── 10. Resend-verification for an already-verified user — silent no-op ──────

header "10. Resend-verification for an already-verified user"
label "POST /auth/resend-verification  →  $VER_EMAIL (already verified)"
expect "${GREEN}200${RESET} — always 200 to prevent email enumeration; silently no-ops"

STATUS=$(call POST "$BASE/auth/resend-verification" \
  -d "{\"email\":\"$VER_EMAIL\"}" \
  | tail -n 1)
check_status 200 "$STATUS"

# ─── 11. Token invalidation on resend — requires a second test user ───────────
#
# Scenario: unverified user requests resend. The old token must be deleted and
# the new token must work. Mirrors the same pattern as steps 10–11 in
# test-password-reset.sh.

header "11a. Register second test user — grab first verification token"
label "POST /auth/register  →  $VER_EMAIL2"
expect "${GREEN}201${RESET} (or 409 if account already exists from a previous run)"

REG2_RESP=$(curl -s -X POST "$BASE/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$VER_EMAIL2\",\"password\":\"$VER_PASSWORD\",\"name\":\"Ver Script User 2\",\"teamName\":\"Ver Script Team 2\"}")
echo -e "  body     : $(echo "$REG2_RESP" | python3 -m json.tool 2>/dev/null || echo "$REG2_RESP")"

REG2_ERROR=$(echo "$REG2_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('error',''))" 2>/dev/null)
if [[ "$REG2_ERROR" == *"already exists"* ]]; then
  info "Account 2 already exists from a previous run — calling resend-verification to mint a fresh token."
  curl -s -o /dev/null -X POST "$BASE/auth/resend-verification" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$VER_EMAIL2\"}"
  echo -e "  ${YELLOW}Resend requested for user 2 — continuing${RESET}"
fi

# Retrieve the first token (generated by registration)
FIRST_TOKEN_RESP=$(curl -s "$BASE/auth/_test/last-verify-token")
FIRST_RAW_TOKEN=$(echo "$FIRST_TOKEN_RESP" | python3 -c \
  "import sys,json; d=json.load(sys.stdin); print(d.get('token',''))" 2>/dev/null)

if [[ -z "$FIRST_RAW_TOKEN" ]]; then
  echo -e "${RED}Could not retrieve first token for user 2 — aborting step 11.${RESET}"
  FAILURES=$((FAILURES + 1))
else
  echo -e "  ${GREEN}✓ First token retrieved for user 2 (${#FIRST_RAW_TOKEN} chars)${RESET}"

  # ── 11b. Request resend — generates a new token, invalidates the first ──────

  header "11b. Request resend-verification for second user"
  label "POST /auth/resend-verification  →  $VER_EMAIL2"
  expect "${GREEN}200${RESET} — new token generated, old token invalidated"

  STATUS=$(call POST "$BASE/auth/resend-verification" \
    -d "{\"email\":\"$VER_EMAIL2\"}" \
    | tail -n 1)
  check_status 200 "$STATUS"

  # Retrieve the new (second) token
  SECOND_TOKEN_RESP=$(curl -s "$BASE/auth/_test/last-verify-token")
  SECOND_RAW_TOKEN=$(echo "$SECOND_TOKEN_RESP" | python3 -c \
    "import sys,json; d=json.load(sys.stdin); print(d.get('token',''))" 2>/dev/null)

  if [[ "$SECOND_RAW_TOKEN" == "$FIRST_RAW_TOKEN" ]]; then
    fail "Second token is identical to the first — invalidation may not have worked"
  else
    echo -e "  ${GREEN}✓ New token is distinct from the first${RESET}"
  fi

  # ── 11c. Old token must now be rejected ──────────────────────────────────────

  header "11c. Old token must be rejected after resend"
  label "GET $BASE/auth/verify-email?token=<first_token>"
  expect "${RED}400${RESET} — first token was invalidated by the resend request"

  STATUS=$(call GET "$BASE/auth/verify-email?token=$FIRST_RAW_TOKEN" \
    | tail -n 1)
  check_status 400 "$STATUS"

  # ── 11d. New token must work ──────────────────────────────────────────────────

  header "11d. New token must successfully verify the second user"
  label "GET $BASE/auth/verify-email?token=<second_token>"
  expect "${GREEN}200${RESET} — second user's email is now verified"

  STATUS=$(call GET "$BASE/auth/verify-email?token=$SECOND_RAW_TOKEN" \
    | tail -n 1)
  check_status 200 "$STATUS"

  # ── 11e. Using the now-consumed new token again must be rejected ──────────────

  header "11e. Replay the used token — must be rejected"
  label "GET $BASE/auth/verify-email?token=<second_token>  (same token, second attempt)"
  expect "${RED}400${RESET} — token already used (replay prevention)"

  STATUS=$(call GET "$BASE/auth/verify-email?token=$SECOND_RAW_TOKEN" \
    | tail -n 1)
  check_status 400 "$STATUS"
fi

# ─── 12. Cleanup ──────────────────────────────────────────────────────────────

header "12. Cleanup — deleting scratch tasks created during this run"

for task_id in "$SCRATCH_TASK_ID" "$POST_VER_TASK_ID"; do
  if [[ -n "$task_id" ]]; then
    label "DELETE /tasks/$task_id"
    curl -s -o /dev/null -X DELETE "$BASE/tasks/$task_id" \
      -H "Authorization: Bearer $USER_TOKEN" \
      -H "X-Team-Id: $TEAM_ID"
    echo -e "  ${GREEN}task $task_id deleted${RESET}"
  fi
done

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
echo "Test accounts left in the database:"
echo "  $VER_EMAIL   (user_id=$USER_ID, team_id=$TEAM_ID)"
echo "  $VER_EMAIL2  (from step 11)"
echo ""
echo "To remove them, run Prisma Studio or:"
echo "  DELETE FROM users WHERE email IN ('$VER_EMAIL', '$VER_EMAIL2');"
