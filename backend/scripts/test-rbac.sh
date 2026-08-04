#!/usr/bin/env bash
# =============================================================================
# test-rbac.sh — Manual end-to-end exercise of Phase 2 RBAC routes
#
# Usage:
#   bash backend/scripts/test-rbac.sh [BASE_URL]
#
# Defaults to http://localhost:3000. Override with:
#   bash backend/scripts/test-rbac.sh http://localhost:4000
#
# What it does:
#   1. Registers an owner and a plain member (or logs in if they already exist)
#   2. Owner adds member to their team
#   3. Task delete  — member tries to delete owner's task (403), then owner deletes it (204)
#   4. Member removal — member tries to remove owner (403), then owner removes member (204)
#   5. Role change  — member tries to promote themselves (403), owner promotes them (200)
#
# Cleans up the two test accounts at the end so it's safe to re-run.
# =============================================================================

BASE="${1:-http://localhost:3000}"
OWNER_EMAIL="rbac-script-owner@test.local"
MEMBER_EMAIL="rbac-script-member@test.local"
PASSWORD="Script@123"

# ─── Colour helpers ───────────────────────────────────────────────────────────

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

header()  { echo -e "\n${BOLD}${CYAN}══ $* ══${RESET}"; }
label()   { echo -e "${YELLOW}▶ $*${RESET}"; }
expect()  { echo -e "  expected : $*"; }

# ─── curl wrapper ─────────────────────────────────────────────────────────────
# Prints status + prettified JSON body, returns the HTTP status code as exit value.

call() {
  local method="$1"; shift
  local url="$1";    shift
  # Remaining args are passed directly to curl (headers, --data, etc.)

  local response
  response=$(curl -s -w '\n{"__status__":%{http_code}}' \
    -X "$method" \
    -H "Content-Type: application/json" \
    "$@" \
    "$url")

  # Split body and status line
  local body status
  body=$(echo "$response" | head -n -1)
  status=$(echo "$response" | tail -n 1 | grep -o '"__status__":[0-9]*' | grep -o '[0-9]*$')

  # Colour the status line
  if [[ "$status" -ge 200 && "$status" -lt 300 ]]; then
    echo -e "  status   : ${GREEN}${status}${RESET}"
  elif [[ "$status" -ge 400 && "$status" -lt 500 ]]; then
    echo -e "  status   : ${RED}${status}${RESET}"
  else
    echo -e "  status   : ${YELLOW}${status}${RESET}"
  fi

  # Pretty-print JSON if python3 is available
  if command -v python3 &>/dev/null; then
    echo -e "  body     : $(echo "$body" | python3 -m json.tool 2>/dev/null || echo "$body")"
  else
    echo -e "  body     : $body"
  fi

  echo "$status"  # last line is the status (captured by callers via $())
}

# Wrapper that captures status into a variable and still prints output
# Usage: run_call STATUS_VAR METHOD URL [extra curl args...]
run_call() {
  local var="$1"; shift
  local output
  output=$(call "$@" 2>&1)
  # Extract the last line (status) and remove it from display output
  local status
  status=$(echo "$output" | tail -n 1)
  echo "$output" | head -n -1  # print everything except the last line
  eval "$var=$status"
}

# ─── 0. Sanity-check: is the server up? ───────────────────────────────────────

header "0. Health check"
label "GET $BASE/health"
HTTP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/health")
if [[ "$HTTP" != "200" ]]; then
  echo -e "${RED}Server not reachable at $BASE (got HTTP $HTTP). Start it first.${RESET}"
  exit 1
fi
echo -e "  ${GREEN}Server is up (200)${RESET}"

# ─── 1. Register / login as owner ─────────────────────────────────────────────

header "1. Register owner"
label "POST /auth/register  →  expect 201 (or 409 if account already exists)"
OWNER_REG=$(curl -s -X POST "$BASE/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$OWNER_EMAIL\",\"password\":\"$PASSWORD\",\"name\":\"Script Owner\",\"teamName\":\"RBAC Script Team\"}")
echo -e "  body     : $(echo "$OWNER_REG" | python3 -m json.tool 2>/dev/null || echo "$OWNER_REG")"

header "1b. Login as owner"
label "POST /auth/login"
expect "201"
OWNER_LOGIN=$(curl -s -X POST "$BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$OWNER_EMAIL\",\"password\":\"$PASSWORD\"}")
echo -e "  body     : $(echo "$OWNER_LOGIN" | python3 -m json.tool 2>/dev/null || echo "$OWNER_LOGIN")"

OWNER_TOKEN=$(echo "$OWNER_LOGIN" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['token'])" 2>/dev/null)
TEAM_ID=$(echo "$OWNER_LOGIN"     | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['team']['id'])" 2>/dev/null)
OWNER_ID=$(echo "$OWNER_LOGIN"    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['user']['id'])" 2>/dev/null)

if [[ -z "$OWNER_TOKEN" || -z "$TEAM_ID" ]]; then
  echo -e "${RED}Failed to log in as owner — aborting.${RESET}"
  exit 1
fi
echo -e "  ${GREEN}owner token obtained, team_id=$TEAM_ID${RESET}"

# ─── 2. Register / login as member ────────────────────────────────────────────

header "2. Register member"
label "POST /auth/register"
MEMBER_REG=$(curl -s -X POST "$BASE/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$MEMBER_EMAIL\",\"password\":\"$PASSWORD\",\"name\":\"Script Member\",\"teamName\":\"Member Own Team\"}")
echo -e "  body     : $(echo "$MEMBER_REG" | python3 -m json.tool 2>/dev/null || echo "$MEMBER_REG")"

header "2b. Login as member"
label "POST /auth/login"
MEMBER_LOGIN=$(curl -s -X POST "$BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$MEMBER_EMAIL\",\"password\":\"$PASSWORD\"}")
echo -e "  body     : $(echo "$MEMBER_LOGIN" | python3 -m json.tool 2>/dev/null || echo "$MEMBER_LOGIN")"

MEMBER_TOKEN=$(echo "$MEMBER_LOGIN" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['token'])" 2>/dev/null)
MEMBER_ID=$(echo "$MEMBER_LOGIN"    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['user']['id'])" 2>/dev/null)

if [[ -z "$MEMBER_TOKEN" || -z "$MEMBER_ID" ]]; then
  echo -e "${RED}Failed to log in as member — aborting.${RESET}"
  exit 1
fi
echo -e "  ${GREEN}member token obtained, member_id=$MEMBER_ID${RESET}"

# ─── 3. Owner adds member to the team ─────────────────────────────────────────

header "3. Add member to owner's team"
label "POST /teams/$TEAM_ID/members  (as owner)"
expect "201"
call POST "$BASE/teams/$TEAM_ID/members" \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  -d "{\"userId\":\"$MEMBER_ID\",\"role\":\"member\"}"

# ─── 4. Owner creates a task ───────────────────────────────────────────────────

header "4. Owner creates a task"
label "POST /tasks  (as owner, scoped to owner's team)"
expect "201"
TASK_RESP=$(curl -s -X POST "$BASE/tasks" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  -H "X-Team-Id: $TEAM_ID" \
  -d '{"title":"Owner task — created by script"}')
echo -e "  body     : $(echo "$TASK_RESP" | python3 -m json.tool 2>/dev/null || echo "$TASK_RESP")"

TASK_ID=$(echo "$TASK_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['task']['id'])" 2>/dev/null)
if [[ -z "$TASK_ID" ]]; then
  echo -e "${RED}Failed to create task — aborting.${RESET}"
  exit 1
fi
echo -e "  ${GREEN}task_id=$TASK_ID${RESET}"

# ─── 5. Task deletion ─────────────────────────────────────────────────────────

header "5a. Member tries to DELETE owner's task  [FORBIDDEN]"
label "DELETE /tasks/$TASK_ID  (as member, X-Team-Id = owner's team)"
expect "${RED}403${RESET}"
call DELETE "$BASE/tasks/$TASK_ID" \
  -H "Authorization: Bearer $MEMBER_TOKEN" \
  -H "X-Team-Id: $TEAM_ID"

header "5b. Owner creates own task to delete"
label "POST /tasks  (as owner)"
expect "201"
OWN_TASK_RESP=$(curl -s -X POST "$BASE/tasks" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  -H "X-Team-Id: $TEAM_ID" \
  -d '{"title":"Owner task — for self-deletion test"}')
OWN_TASK_ID=$(echo "$OWN_TASK_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['task']['id'])" 2>/dev/null)
echo -e "  own_task_id=$OWN_TASK_ID"

header "5c. Owner DELETEs their own task  [ALLOWED]"
label "DELETE /tasks/$OWN_TASK_ID  (as owner)"
expect "${GREEN}204${RESET}"
call DELETE "$BASE/tasks/$OWN_TASK_ID" \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  -H "X-Team-Id: $TEAM_ID"

# ─── 6. Member removal ────────────────────────────────────────────────────────

header "6a. Member tries to REMOVE owner from team  [FORBIDDEN]"
label "DELETE /teams/$TEAM_ID/members/$OWNER_ID  (as member)"
expect "${RED}403${RESET}"
call DELETE "$BASE/teams/$TEAM_ID/members/$OWNER_ID" \
  -H "Authorization: Bearer $MEMBER_TOKEN"

header "6b. Owner tries to remove themselves  [BAD REQUEST]"
label "DELETE /teams/$TEAM_ID/members/$OWNER_ID  (as owner)"
expect "${RED}400${RESET}"
call DELETE "$BASE/teams/$TEAM_ID/members/$OWNER_ID" \
  -H "Authorization: Bearer $OWNER_TOKEN"

header "6c. Owner removes member from team  [ALLOWED]"
label "DELETE /teams/$TEAM_ID/members/$MEMBER_ID  (as owner)"
expect "${GREEN}204${RESET}"
call DELETE "$BASE/teams/$TEAM_ID/members/$MEMBER_ID" \
  -H "Authorization: Bearer $OWNER_TOKEN"

# Re-add member for the role-change tests
header "6d. Owner re-adds member so role-change tests can run"
label "POST /teams/$TEAM_ID/members  (as owner)"
expect "201"
call POST "$BASE/teams/$TEAM_ID/members" \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  -d "{\"userId\":\"$MEMBER_ID\",\"role\":\"member\"}"

# ─── 7. Role changes ──────────────────────────────────────────────────────────

header "7a. Member tries to change owner's role  [FORBIDDEN]"
label "PATCH /teams/$TEAM_ID/members/$OWNER_ID/role  (as member)"
expect "${RED}403${RESET}"
call PATCH "$BASE/teams/$TEAM_ID/members/$OWNER_ID/role" \
  -H "Authorization: Bearer $MEMBER_TOKEN" \
  -d '{"role":"member"}'

header "7b. Owner promotes member to admin  [ALLOWED]"
label "PATCH /teams/$TEAM_ID/members/$MEMBER_ID/role  (as owner)"
expect "${GREEN}200${RESET} — role: admin"
call PATCH "$BASE/teams/$TEAM_ID/members/$MEMBER_ID/role" \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  -d '{"role":"admin"}'

header "7c. Owner demotes member back to member  [ALLOWED]"
label "PATCH /teams/$TEAM_ID/members/$MEMBER_ID/role  (as owner)"
expect "${GREEN}200${RESET} — role: member"
call PATCH "$BASE/teams/$TEAM_ID/members/$MEMBER_ID/role" \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  -d '{"role":"member"}'

header "7d. Invalid role value  [BAD REQUEST]"
label "PATCH /teams/$TEAM_ID/members/$MEMBER_ID/role  (as owner, role=superuser)"
expect "${RED}400${RESET}"
call PATCH "$BASE/teams/$TEAM_ID/members/$MEMBER_ID/role" \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  -d '{"role":"superuser"}'

# ─── 8. Cleanup ───────────────────────────────────────────────────────────────

header "8. Cleanup — deleting test task (the original one from step 4)"
label "DELETE /tasks/$TASK_ID  (as owner)"
call DELETE "$BASE/tasks/$TASK_ID" \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  -H "X-Team-Id: $TEAM_ID"

echo -e "\n${BOLD}${GREEN}═══════════════════════════════════════${RESET}"
echo -e "${BOLD}${GREEN}  Script complete — review output above${RESET}"
echo -e "${BOLD}${GREEN}═══════════════════════════════════════${RESET}"
echo ""
echo "Test accounts left in the database:"
echo "  owner  : $OWNER_EMAIL  (team_id=$TEAM_ID)"
echo "  member : $MEMBER_EMAIL"
echo ""
echo "To delete them, run your Prisma Studio or:"
echo "  DELETE FROM users WHERE email IN ('$OWNER_EMAIL', '$MEMBER_EMAIL');"
