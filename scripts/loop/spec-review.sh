#!/usr/bin/env bash
#
# spec-review.sh — independent, fresh-session review of a build PRD.
#
# WHY A SEPARATE PROCESS
# /spec-intake writes the PRD, then must review it. But the author is the wrong
# reviewer: a same-session audit re-reads its own rationale and agrees with it — the exact
# bias /review-pr guards against for code. This driver launches /review-spec in a FRESH
# `claude` process with no memory of the authoring conversation, and captures its findings
# for spec-intake to fold into the human checkpoint. It is the intake-stage twin of the
# review step task-loop.sh runs for code.
#
# WHY THE MAIN TREE, NOT A WORKTREE
# spec-intake writes the PRD into the MAIN tree, and at review time it is usually
# neither committed nor pushed. A fresh origin/main worktree would not see them, so this
# runs with cwd = the main tree, where the artifacts actually live.
#
# READ-ONLY. The review emits findings; it never edits the PRD and never commits. The
# human decides at the checkpoint; the authoring session applies the approved calls.
#
# Usage:
#   spec-review.sh reckon
#   spec-review.sh reckon --effort high            # override reasoning effort (default: max)
#   spec-review.sh reckon --model claude-opus-5    # override model (default: CLI default)
#   spec-review.sh reckon --stream                 # surface each message as it happens
#   spec-review.sh reckon --gate                   # exit 3 if the review returns BLOCKERS
#
# Findings: /tmp/spec-review-<build>.md    Log: /tmp/spec-review-<build>.log
# Read those rather than re-running — a second max-effort review is not free.

set -euo pipefail

BUILD=""
EFFORT="max"
MODEL=""
STREAM=0
GATE=0

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${GREEN}[INFO]${NC} $*" >&2; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*" >&2; }
err()   { echo -e "${RED}[ERROR]${NC} $*" >&2; }
step()  { echo -e "${CYAN}[STEP]${NC} $*" >&2; }
die()   { err "$*"; exit 1; }
usage() { sed -n '/^# Usage:/,/^# Read those/p' "$0" >&2; exit 2; }

while [ $# -gt 0 ]; do
    case $1 in
        --effort)      EFFORT=$2; shift 2 ;;
        --model)       MODEL=$2; shift 2 ;;
        --stream)      STREAM=1; shift ;;
        --gate)        GATE=1; shift ;;
        -h|--help)     usage ;;
        -*) die "unknown option: $1" ;;
        *)  [ -z "$BUILD" ] || die "unexpected argument: $1"; BUILD=$1; shift ;;
    esac
done

[ -n "$BUILD" ] || usage
BUILD=$(echo "$BUILD" | tr '[:upper:]' '[:lower:]')
SLUG="$BUILD"
[ -d "$BUILD" ] || die "no such build directory: $BUILD"
PRD=$(ls docs/prds/${BUILD}-*-prd.md 2>/dev/null | tail -1)
[ -n "$PRD" ] || die "no PRD found at docs/prds/${BUILD}-*-prd.md — run /spec-intake first"

command -v claude >/dev/null || die "claude CLI not on PATH"

MAIN_WT=$(git worktree list 2>/dev/null | head -1 | awk '{print $1}')
[ -n "$MAIN_WT" ] || die "not inside a git repository"
[ -f "${MAIN_WT}/pnpm-workspace.yaml" ] && [ -d "${MAIN_WT}/shared" ] || die \
    "cwd resolves to ${MAIN_WT}, which is not the builds repo — cd there first"

LOG="/tmp/spec-review-${SLUG}.log"
FINDINGS="/tmp/spec-review-${SLUG}.md"
MARKER="/tmp/spec-review-${SLUG}.marker"
rm -f "$FINDINGS"
touch "$MARKER"

step "reviewing ${BUILD} in a FRESH claude --effort ${EFFORT}${MODEL:+ --model ${MODEL}} session (log: ${LOG})"
declare -a args=(--effort "$EFFORT")
[ -n "$MODEL" ] && args+=(--model "$MODEL")
args+=(-p "/review-spec ${BUILD}")
# Default text output stays silent until the session ends, which looks hung on a long
# review; --stream surfaces messages as they happen.
[ "$STREAM" = 1 ] && args+=(--output-format stream-json --verbose)

( cd "$MAIN_WT" && claude "${args[@]}" ) 2>&1 | tee "$LOG" || die "review session failed — see ${LOG}"

# Extract the findings block the skill emits as its final message. Primary source is the log
# (robust — no dependency on the sub-session's scratchpad path); fall back to the scratchpad
# copy if the marker block did not survive the transport.
if grep -q '===SPEC-REVIEW-FINDINGS-BEGIN===' "$LOG"; then
    sed -n '/===SPEC-REVIEW-FINDINGS-BEGIN===/,/===SPEC-REVIEW-FINDINGS-END===/p' "$LOG" \
        | sed '1d;$d' > "$FINDINGS"
else
    # shellcheck disable=SC2012  # mirrors task-loop.sh place_artifact; scratchpad names are uuid-safe
    found=$(ls -t /tmp/claude-*/*/*/scratchpad/spec-review-"${SLUG}".md 2>/dev/null | head -1 || true)
    if [ -n "$found" ] && [ "$found" -nt "$MARKER" ]; then
        cp -f "$found" "$FINDINGS"
    fi
fi

[ -s "$FINDINGS" ] || { warn "no findings block produced — read ${LOG} directly"; exit 1; }

verdict=$(sed -n 's/^verdict:[[:space:]]*//p' "$FINDINGS" | head -1)
info "findings written: ${FINDINGS}  (verdict: ${verdict:-unknown})"
echo "-------------------- ${FINDINGS} --------------------" >&2
cat "$FINDINGS" >&2
echo "-----------------------------------------------------" >&2

if [ "$GATE" = 1 ] && printf '%s' "$verdict" | grep -qi 'BLOCKER'; then
    err "review returned BLOCKERS and --gate is set — resolve them before proceeding"
    exit 3
fi
exit 0
