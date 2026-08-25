#!/usr/bin/env bash
# ============================================================================
# Smoke test - the section 43 milestone, run against a REAL running server.
#
#   ./scripts/smoke_test.sh                          # against localhost:8080
#   ./scripts/smoke_test.sh https://xxx.run.app      # against Cloud Run
#
# Person 7 should run this immediately after every deploy: it proves the whole
# chain (Cloud Run -> Flask -> SQLite) works before the frontend team is told
# the API is up.
# ============================================================================

set -euo pipefail

BASE="${1:-http://localhost:8080}"
PASS=0
FAIL=0

green() { printf "\033[0;32m%s\033[0m\n" "$1"; }
red()   { printf "\033[0;31m%s\033[0m\n" "$1"; }

check() {
  local label="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    green "  PASS  $label"
    PASS=$((PASS + 1))
  else
    red   "  FAIL  $label (expected $expected, got $actual)"
    FAIL=$((FAIL + 1))
  fi
}

# Prints the HTTP status; writes the body to /tmp/sk_body.json
call() {
  curl -s -o /tmp/sk_body.json -w "%{http_code}" -X "$1" "$BASE$2" \
    -H "Content-Type: application/json" \
    ${3:+-d "$3"}
}

# Reads a value out of the last response body.
#   json scoreboard id      ->  body["scoreboard"]["id"]
#   json leaderboard 0 name ->  body["leaderboard"][0]["name"]
# Numeric segments are treated as list indexes.
json() {
  python3 - "$@" <<'PY'
import json, sys
value = json.load(open("/tmp/sk_body.json"))
for key in sys.argv[1:]:
    value = value[int(key)] if key.lstrip("-").isdigit() else value[key]
print(value)
PY
}

echo "Board Game Scorekeeper - smoke test against $BASE"
echo

# 1. health -----------------------------------------------------------------
echo "1. /health"
check "health returns 200" 200 "$(call GET /health)"
check "database connected" "connected" "$(json database)"

# 2. create scoreboard ------------------------------------------------------
echo "2. create scoreboard"
check "created" 201 "$(call POST /api/scoreboards '{"name":"Smoke Test Night"}')"
SB=$(json scoreboard id)
check "status is SETUP" "SETUP" "$(json scoreboard status)"
echo "     scoreboard id = $SB"

# 3. add players ------------------------------------------------------------
echo "3. add players"
check "add Abhiram" 201 "$(call POST "/api/scoreboards/$SB/players" '{"name":"Abhiram"}')"
P1=$(json player id)
check "add Rahul"   201 "$(call POST "/api/scoreboards/$SB/players" '{"name":"Rahul"}')"
P2=$(json player id)
check "add Monish"  201 "$(call POST "/api/scoreboards/$SB/players" '{"name":"Monish"}')"
P3=$(json player id)
check "duplicate name rejected" 409 "$(call POST "/api/scoreboards/$SB/players" '{"name":"Rahul"}')"
check "empty name rejected"     400 "$(call POST "/api/scoreboards/$SB/players" '{"name":"  "}')"

# 4. start ------------------------------------------------------------------
echo "4. start scoreboard"
check "started" 200 "$(call POST "/api/scoreboards/$SB/start")"
check "status is ACTIVE" "ACTIVE" "$(json scoreboard status)"
check "roster locked" 409 "$(call POST "/api/scoreboards/$SB/players" '{"name":"Latecomer"}')"

# 5. round 1 ----------------------------------------------------------------
echo "5. round 1"
call GET "/api/scoreboards/$SB/rounds/current" > /dev/null
R1=$(json round id)
check "submit round 1" 201 \
  "$(call POST "/api/scoreboards/$SB/rounds/$R1/scores" \
    "{\"scores\":[{\"playerId\":$P1,\"points\":20},{\"playerId\":$P2,\"points\":15},{\"playerId\":$P3,\"points\":30}]}")"
check "round complete" "True" "$(json roundComplete)"
check "leader is Monish" "Monish" "$(json leaderboard 0 name)"
check "double submit rejected" 409 \
  "$(call POST "/api/scoreboards/$SB/rounds/$R1/scores" "{\"scores\":[{\"playerId\":$P1,\"points\":5}]}")"

# 6. round 2 ----------------------------------------------------------------
echo "6. round 2"
check "next round created" 201 "$(call POST "/api/scoreboards/$SB/rounds")"
R2=$(json round id)
check "submit round 2" 201 \
  "$(call POST "/api/scoreboards/$SB/rounds/$R2/scores" \
    "{\"scores\":[{\"playerId\":$P1,\"points\":25},{\"playerId\":$P2,\"points\":30},{\"playerId\":$P3,\"points\":20}]}")"

# 7. reads ------------------------------------------------------------------
echo "7. leaderboard / history / analysis"
check "leaderboard 200" 200 "$(call GET "/api/scoreboards/$SB/leaderboard")"
check "Monish total 50" 50 "$(json leaderboard 0 score)"
check "history 200" 200 "$(call GET "/api/scoreboards/$SB/history")"
check "two rounds in history" "[1, 2]" "$(json history roundNumbers)"
check "analysis 200" 200 "$(call GET "/api/scoreboards/$SB/analysis")"
check "timeline 200" 200 "$(call GET "/api/scoreboards/$SB/timeline")"

# 8. end --------------------------------------------------------------------
echo "8. end scoreboard"
check "ended" 200 "$(call POST "/api/scoreboards/$SB/end")"
check "winner is Monish" "Monish" "$(json winner name)"
check "scores locked" 409 \
  "$(call POST "/api/scoreboards/$SB/rounds/$R2/scores" "{\"scores\":[{\"playerId\":$P1,\"points\":5}]}")"

# 9. reset ------------------------------------------------------------------
echo "9. reset / rematch"
check "reset" 200 "$(call POST "/api/scoreboards/$SB/reset")"
check "back to ACTIVE" "ACTIVE" "$(json scoreboard status)"
check "players kept" 3 "$(json scoreboard playerCount)"

# 10. cleanup ---------------------------------------------------------------
echo "10. cleanup"
check "deleted" 200 "$(call DELETE "/api/scoreboards/$SB")"
check "gone" 404 "$(call GET "/api/scoreboards/$SB")"

echo
echo "-------------------------------------"
green "PASSED: $PASS"
[ "$FAIL" -gt 0 ] && red "FAILED: $FAIL" || echo "FAILED: 0"
echo "-------------------------------------"
[ "$FAIL" -eq 0 ] || exit 1
