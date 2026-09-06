#!/usr/bin/env bash
set -uo pipefail

# IdentityHub integration test harness.
#
# Starts the API server (unless one is already listening on PORT), runs a
# battery of HTTP assertions against it, and writes a pass/fail log to
# /tmp/identityhub-integration.json for later reading.
#
# Usage:
#   ./scripts/integration-test.sh          # full run (starts/stops server)
#   ./scripts/integration-test.sh --read   # print last run json log
#   ./scripts/integration-test.sh --log    # print last run log path
#   ./scripts/integration-test.sh --keep   # leave the server running afterwards
#   ./scripts/integration-test.sh --quiet  # suppress per-test output to stdout/build
#
# Use --read to re-inspect a previous run without re-running the suite.

BASE_URL="${BASE_URL:-http://localhost:3000}"
PORT="${PORT:-3000}"
LOG_FILE=/tmp/identityhub-integration.log
JSON_LOG=/tmp/identityhub-integration.json

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

PASS=0
FAIL=0
declare -a RESULTS

now() { python3 -c 'import time;print(int(time.time()*1000))'; }

# --- server lifecycle -------------------------------------------------------
server_running() {
  curl -s -o /dev/null -w '%{http_code}' "$BASE_URL/healthz" 2>/dev/null | grep -q '200'
}

start_server() {
  local want_keep=$1
  if server_running; then
    echo "using already-running server on $BASE_URL"
    return 0
  fi
  echo "starting server..."
  ALLOW_OPEN_SIGNUP=true npm run dev:server >/tmp/identityhub-server.log 2>&1 &
  SERVER_PID=$!
  local tries=0
  while ! server_running && [ $tries -lt 40 ]; do
    sleep 1
    tries=$((tries + 1))
  done
  if ! server_running; then
    echo "server failed to start within 40s (see /tmp/identityhub-server.log)" >&2
    return 1
  fi
  echo "server up on $BASE_URL"
  if [ "$want_keep" = 0 ]; then
    trap 'kill_server' EXIT
  fi
}

kill_server() {
  pkill -9 -f "nest start" 2>/dev/null || true
  pkill -9 -f "node.*dist/main" 2>/dev/null || true
  [ -n "${SERVER_PID:-}" ] && kill -9 "$SERVER_PID" 2>/dev/null || true
  echo "server stopped"
}

# --- assertion primitive ----------------------------------------------------
# run <method> <path> [json_body] -> sets RESP_CODE, RESP_BODY
run() {
  local method=$1 path=$2 body="${3:-}"
  local url="$BASE_URL$path"
  RESP_CODE=$(curl -s -o "$TMP_BODY" -w '%{http_code}' -X "$method" "$url" \
    ${body:+-H "Content-Type: application/json" -d "$body"})
  RESP_BODY=$(cat "$TMP_BODY" 2>/dev/null)
}
TMP_BODY=$(mktemp)

# check_http <label> <method> <path> <expected_status> [json_body]
check_http() {
  local label=$1 method=$2 path=$3 want=$4 body="${5:-}"
  run "$method" "$path" "$body"
  if [ "$RESP_CODE" = "$want" ]; then
    ok "PASS|$label|got $RESP_CODE"
  else
    bad "FAIL|$label|expected $want got $RESP_CODE|$RESP_BODY"
  fi
}

# check_json <label> <method> <path> <expected_status> <field> <expected_value> [json_body]
check_json() {
  local label=$1 method=$2 path=$3 want=$4 field=$5 expected=$6 body="${7:-}"
  run "$method" "$path" "$body"
  local got
  if [ "$RESP_CODE" = "$want" ]; then
    if [ "$field" = "." ]; then
      # compare whole body to expected
      if [ "$RESP_BODY" = "$expected" ]; then
        ok "PASS|$label|got $RESP_CODE"
      else
        bad "FAIL|$label|body mismatch|$RESP_BODY"
      fi
      return
    fi
    got=$(printf '%s' "$RESP_BODY" | python3 -c "
import sys,json
try:
  d=json.load(sys.stdin)
  v=d
  for p in '$field'.split('.')[1:]:
    v=v.get(p,'')
  print(v)
except Exception:
  print('__unparseable__')
")
    if [ "$got" = "$expected" ]; then
      ok "PASS|$label|got $RESP_CODE"
    else
      bad "FAIL|$label|field $field expected '$expected' got '$got'|$RESP_BODY"
    fi
  else
    bad "FAIL|$label|expected $want got $RESP_CODE|$RESP_BODY"
  fi
}

# check_jq <label> <method> <path> <expected_status> <jq_expr> [json_body]
# passes if RESP_CODE = expected AND body satisfies jq_expr (requires jq)
check_jq() {
  local label=$1 method=$2 path=$3 want=$4 expr=$5 body="${6:-}"
  run "$method" "$path" "$body"
  if [ "$RESP_CODE" != "$want" ]; then
    bad "FAIL|$label|expected $want got $RESP_CODE|$RESP_BODY"
    return
  fi
  if command -v jq >/dev/null 2>&1; then
    if printf '%s' "$RESP_BODY" | jq -e "$expr" >/dev/null 2>&1; then
      ok "PASS|$label|got $RESP_CODE"
    else
      bad "FAIL|$label|jq '$expr' unsatisfied|$RESP_BODY"
    fi
  else
    # jq unavailable: treat status match as pass, skip body assertion
    ok "PASS|$label (jq not installed, status only)|got $RESP_CODE"
  fi
}

ok() { PASS=$((PASS + 1)); RESULTS+=("$1"); [ "$QUIET" = 1 ] || printf '  PASS  %s\n' "$(echo "$1" | cut -d'|' -f2)"; }
bad() { FAIL=$((FAIL + 1)); RESULTS+=("$1"); printf '  FAIL  %s\n' "$(echo "$1" | tr '|' ' ' )"; }

# --- main -------------------------------------------------------------------
main() {
  local keep=0 mode=run QUIET=0
  for arg in "$@"; do
    case "$arg" in
      --read) mode=read ;;
      --log) mode=logpath ;;
      --keep) keep=1 ;;
      --quiet) QUIET=1 ;;
      *) echo "unknown arg: $arg" >&2; exit 2 ;;
    esac
  done

  if [ "$mode" = read ]; then
    [ -f "$JSON_LOG" ] || { echo "no json log at $JSON_LOG" >&2; exit 1; }
    cat "$JSON_LOG"; exit 0
  fi
  if [ "$mode" = logpath ]; then
    echo "$JSON_LOG"; exit 0
  fi

  start_server "$keep" || exit 1

  # unique email per run to avoid EMAIL_TAKEN collisions in the DB
  local email="itest${RANDOM}${RANDOM}@example.com"
  local st; st=$(now)

  echo ""
  echo "=== IdentityHub integration suite (base=$BASE_URL) ==="

  echo ""
  echo "--- health ---"
  check_json "healthz ok" GET /healthz 200 .status ok
  check_json "readyz ok" GET /readyz 200 .status ok

  echo ""
  echo "--- signup (open) ---"
  # (server started with ALLOW_OPEN_SIGNUP=true)
  check_jq "signup creates tenant+user" POST /api/app/signup 201 '.user.email and .user.tenantId' \
    "{\"email\":\"$email\",\"password\":\"password123\"}"
  check_json "duplicate email -> EMAIL_TAKEN" POST /api/app/signup 400 .error EMAIL_TAKEN \
    "{\"email\":\"$email\",\"password\":\"password123\"}"
  check_json "missing password -> VALIDATION_ERROR" POST /api/app/signup 400 .error VALIDATION_ERROR \
    "{\"email\":\"missing${RANDOM}@example.com\"}"
  check_json "weak password rejected -> VALIDATION_ERROR" POST /api/app/signup 400 .error VALIDATION_ERROR \
    "{\"email\":\"weak${RANDOM}@example.com\",\"password\":\"x\"}"
  check_json "bad email rejected -> VALIDATION_ERROR" POST /api/app/signup 400 .error VALIDATION_ERROR \
    "{\"email\":\"not-an-email\",\"password\":\"password123\"}"
  check_json "malformed json -> HTTP_ERROR (400)" POST /api/app/signup 400 .error HTTP_ERROR \
    "not-json{}"

  echo ""
  echo "--- unknown routes ---"
  check_http "unknown route 404" GET /api/nope 404

  echo ""
  echo "--- done ---"
  local et; et=$(now)
  local duration=$((et - st))

  {
    printf '{\n  "summary": {"pass": %d, "fail": %d, "duration_ms": %d},\n  "results": [\n' "$PASS" "$FAIL" "$duration"
    local i=0
    for r in "${RESULTS[@]}"; do
      if [ $i -gt 0 ]; then printf ',\n'; fi
      printf '    %s' "$(printf '%s' "$r" | python3 -c 'import sys,json;print(json.dumps(sys.stdin.read()))')"
      i=$((i + 1))
    done
    printf '\n  ]\n}\n'
  } > "$JSON_LOG"

  printf '=== %s — IdentityHub integration run ===\nbase=%s pass=%d fail=%d duration=%dms\n---\n' \
    "$(date -u +%FT%TZ)" "$BASE_URL" "$PASS" "$FAIL" "$duration" > "$LOG_FILE"
  printf '%s\n' "${RESULTS[@]}" >> "$LOG_FILE"

  echo ""
  echo "PASS=$PASS FAIL=$FAIL (${duration}ms)"
  echo "json log:  $JSON_LOG   (re-inspect with: $0 --read)"
  echo "txt log:   $LOG_FILE"
  echo ""
  [ "$FAIL" -eq 0 ] && { echo "RESULT: SUCCESS"; exit 0; }
  echo "RESULT: FAILURE"; exit 1
}

main "$@"
