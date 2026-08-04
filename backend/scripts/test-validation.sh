#!/usr/bin/env bash
# =============================================================================
# test-validation.sh — Manual end-to-end exercise of Phase 3 validation &
#                       sanitization
#
# Usage:
#   bash backend/scripts/test-validation.sh [BASE_URL]
#
# Defaults to http://localhost:3000. Override with:
#   bash backend/scripts/test-validation.sh http://localhost:4000
#
# What it exercises:
#   1. Register with an invalid email format                   → expect 400
#   2. Register with a password that is too short              → expect 400
#   3. Create a task with an empty title                       → expect 400
#   4. Create a task with a whitespace-only title              → expect 400 (or 201 + blank — see note)
#   5. Create a comment with a whitespace-only body            → expect 400
#   6. Create a task with <script>alert(1)</script> in the
#      title, then retrieve it and print the stored value so
#      you can confirm the tag was stripped                    → expect 201, stored title has no <script>
#   7. Join a team passing a blank teamName                    → expect 400
#   8. Add a member with an invalid role value                 → expect 400
#   9. PATCH a task with an unknown status value               → expect 400
#
# Each step prints:
#   expected : <what we expect>
#   status   : <actual HTTP status, coloured green/red>
#   body     : <prettified JSON response>
#
# A test user is registered once (step valid-setup) and reused for all
# authenticated calls. Cleanup deletes the test account at the end.
# =============================================================================

BASE="${1:-http://localhost:3000}"
VAL_EMAIL="val-script-user@test.local"
VAL_PASSWORD="Validation@123"

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

# check_status EXPECTED ACTUAL DESCRIPTION
# Prints pass/fail based on expected vs actual status code.
check_status() {
  local expected="$1" actual="$2"
  if [[ "$actual" == "$expected" ]]; then
    pass
  else
    fail "expected $expected, got $actual"
  fi
}

# ─── 0. Health check ─────────────────────────────────────────────────────────

header "0. Health check"
label "GET $BASE/health"
HTTP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/health")
if [[ "$HTTP" != "200" ]]; then
  echo -e "${RED}Server not reachable at $BASE (HTTP $HTTP). Start it first.${RESET}"
  exit 1
fi
echo -e "  ${GREEN}Server is up (200)${RESET}"

# ─── Setup: register a valid user for authenticated tests ─────────────────────

header "Setup — register test user"
label "POST /auth/register  (valid payload — one-time setup)"
SETUP_REG=$(curl -s -X POST "$BASE/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$VAL_EMAIL\",\"password\":\"$VAL_PASSWORD\",\"name\":\"Val Script User\",\"teamName\":\"Val Script Team\"}")
echo -e "  body     : $(echo "$SETUP_REG" | python3 -m json.tool 2>/dev/null || echo "$SETUP_REG")"

header "Setup — login"
label "POST /auth/login"
SETUP_LOGIN=$(curl -s -X POST "$BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$VAL_EMAIL\",\"password\":\"$VAL_PASSWORD\"}")

TOKEN=$(echo "$SETUP_LOGIN"   | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['token'])" 2>/dev/null)
TEAM_ID=$(echo "$SETUP_LOGIN" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['team']['id'])" 2>/dev/null)
USER_ID=$(echo "$SETUP_LOGIN" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['user']['id'])" 2>/dev/null)

if [[ -z "$TOKEN" || -z "$TEAM_ID" ]]; then
  echo -e "${RED}Login failed — aborting. Is the server running?${RESET}"
  exit 1
fi
echo -e "  ${GREEN}token obtained, team_id=$TEAM_ID${RESET}"

# =============================================================================
# ─── 1. Register — invalid email format ──────────────────────────────────────
# =============================================================================

header "1. Register with invalid email format"
label "POST /auth/register  →  email='not-an-email'"
expect "${RED}400${RESET} — field error on 'email'"
STATUS=$(call POST "$BASE/auth/register" \
  -d '{"email":"not-an-email","password":"Validation@123","name":"Bad Email"}' \
  | tail -n 1)
check_status 400 "$STATUS"

# =============================================================================
# ─── 2. Register — password too short ────────────────────────────────────────
# =============================================================================

header "2. Register with a password shorter than 8 characters"
label "POST /auth/register  →  password='abc'"
expect "${RED}400${RESET} — field error on 'password'"
STATUS=$(call POST "$BASE/auth/register" \
  -d '{"email":"val-shortpw@test.local","password":"abc","name":"Short Pass"}' \
  | tail -n 1)
check_status 400 "$STATUS"

# =============================================================================
# ─── 3. Create task — empty title ─────────────────────────────────────────────
# =============================================================================

header "3. Create task with an empty title"
label "POST /tasks  →  title=''"
expect "${RED}400${RESET} — field error on 'title'"
STATUS=$(call POST "$BASE/tasks" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Team-Id: $TEAM_ID" \
  -d '{"title":""}' \
  | tail -n 1)
check_status 400 "$STATUS"

# =============================================================================
# ─── 4. Create task — whitespace-only title ───────────────────────────────────
# =============================================================================

header "4. Create task with a whitespace-only title"
label "POST /tasks  →  title='   '"
expect "${RED}400${RESET} — title trims to empty string, rejected by refine(v.length >= 1)"
STATUS=$(call POST "$BASE/tasks" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Team-Id: $TEAM_ID" \
  -d '{"title":"   "}' \
  | tail -n 1)
check_status 400 "$STATUS"

# =============================================================================
# ─── 5. Create comment — whitespace-only body ────────────────────────────────
# =============================================================================

header "5. Create comment with a whitespace-only body"
label "POST /tasks/:id/comments  →  content='   '"
expect "${RED}400${RESET} — comment uses .trim().refine(), so whitespace-only is rejected"

# First create a task to attach the comment to
TASK_RESP=$(curl -s -X POST "$BASE/tasks" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Team-Id: $TEAM_ID" \
  -d '{"title":"Scratch task for comment test"}')
SCRATCH_TASK_ID=$(echo "$TASK_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['task']['id'])" 2>/dev/null)

if [[ -z "$SCRATCH_TASK_ID" ]]; then
  echo -e "  ${RED}Could not create scratch task — skipping comment test${RESET}"
  FAILURES=$((FAILURES + 1))
else
  STATUS=$(call POST "$BASE/tasks/$SCRATCH_TASK_ID/comments" \
    -H "Authorization: Bearer $TOKEN" \
    -H "X-Team-Id: $TEAM_ID" \
    -d '{"content":"   "}' \
    | tail -n 1)
  check_status 400 "$STATUS"
fi

# =============================================================================
# ─── 6. XSS sanitization — script tag in task title ─────────────────────────
# =============================================================================

header "6. Create task with <script>alert(1)</script> in the title"
label "POST /tasks  →  title contains a script tag"
expect "${GREEN}201${RESET} — task created, but stored title must NOT contain '<script>'"

XSS_RESP=$(curl -s -X POST "$BASE/tasks" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Team-Id: $TEAM_ID" \
  -d '{"title":"<script>alert(1)<\/script>XSS test task"}')

XSS_STATUS=$(echo "$XSS_RESP" | python3 -c "import sys,json; print('created')" 2>/dev/null)
XSS_TASK_ID=$(echo "$XSS_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['task']['id'])" 2>/dev/null)
STORED_TITLE=$(echo "$XSS_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['task']['title'])" 2>/dev/null)

if [[ -n "$XSS_TASK_ID" ]]; then
  echo -e "  status   : ${GREEN}201${RESET}"
  echo -e "  ${BOLD}stored title (visually inspect — must not contain <script>):${RESET}"
  echo -e "  ${CYAN}  → \"$STORED_TITLE\"${RESET}"

  if echo "$STORED_TITLE" | grep -qi '<script>'; then
    fail "stored title still contains <script> — XSS sanitization is NOT working"
  else
    pass
    echo -e "  ${GREEN}  <script> tag was stripped correctly${RESET}"
  fi
else
  echo -e "  status   : ${RED}$(echo "$XSS_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('error','unknown error'))" 2>/dev/null)${RESET}"
  fail "task creation failed — could not test sanitization"
fi

# =============================================================================
# ─── 7. Join team — blank teamName ───────────────────────────────────────────
# =============================================================================

header "7. Join team with a blank teamName"
label "POST /teams/join  →  teamName=''"
expect "${RED}400${RESET} — field error on 'teamName'"
STATUS=$(call POST "$BASE/teams/join" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"teamName":""}' \
  | tail -n 1)
check_status 400 "$STATUS"

# =============================================================================
# ─── 8. Add member — invalid role value ──────────────────────────────────────
# =============================================================================

header "8. Add member with an invalid role value"
label "POST /teams/$TEAM_ID/members  →  role='superuser'"
expect "${RED}400${RESET} — field error on 'role'"
STATUS=$(call POST "$BASE/teams/$TEAM_ID/members" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"userId\":\"$USER_ID\",\"role\":\"superuser\"}" \
  | tail -n 1)
check_status 400 "$STATUS"

# =============================================================================
# ─── 9. Update task — unknown status value ───────────────────────────────────
# =============================================================================

header "9. PATCH task with an unknown status value"
label "PATCH /tasks/:id  →  status='flying'"
expect "${RED}400${RESET} — status must be todo, in_progress, or done"

if [[ -n "$SCRATCH_TASK_ID" ]]; then
  STATUS=$(call PATCH "$BASE/tasks/$SCRATCH_TASK_ID" \
    -H "Authorization: Bearer $TOKEN" \
    -H "X-Team-Id: $TEAM_ID" \
    -d '{"status":"flying"}' \
    | tail -n 1)
  check_status 400 "$STATUS"
else
  echo -e "  ${YELLOW}Skipped — no scratch task available${RESET}"
fi

# =============================================================================
# ─── Cleanup ──────────────────────────────────────────────────────────────────
# =============================================================================

header "Cleanup — deleting scratch tasks created during this run"

if [[ -n "$SCRATCH_TASK_ID" ]]; then
  label "DELETE /tasks/$SCRATCH_TASK_ID"
  curl -s -o /dev/null -X DELETE "$BASE/tasks/$SCRATCH_TASK_ID" \
    -H "Authorization: Bearer $TOKEN" \
    -H "X-Team-Id: $TEAM_ID"
  echo -e "  ${GREEN}scratch task deleted${RESET}"
fi

if [[ -n "$XSS_TASK_ID" ]]; then
  label "DELETE /tasks/$XSS_TASK_ID  (XSS test task)"
  curl -s -o /dev/null -X DELETE "$BASE/tasks/$XSS_TASK_ID" \
    -H "Authorization: Bearer $TOKEN" \
    -H "X-Team-Id: $TEAM_ID"
  echo -e "  ${GREEN}XSS test task deleted${RESET}"
fi

# =============================================================================
# ─── Summary ──────────────────────────────────────────────────────────────────
# =============================================================================

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
echo "  $VAL_EMAIL  (team_id=$TEAM_ID)"
echo ""
echo "To remove it, run your Prisma Studio or:"
echo "  DELETE FROM users WHERE email = '$VAL_EMAIL';"
