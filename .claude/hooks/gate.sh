#!/usr/bin/env bash
#
# gate.sh — the Stop hook that decides whether an unattended build run may end.
#
# WHY A HOOK AND NOT A DRIVER
# task-loop.sh supplies continuation from OUTSIDE the session: it re-enters with --resume
# until a handoff file appears. A cloud session has no outside — the VM is destroyed with
# the run, so nothing survives to re-enter it. The continuation therefore moves inside:
# Claude Code runs this on every Stop, and an exit of 2 refuses the stop and hands stderr
# back to the model as its next instruction.
#
# INERT UNLESS A RUN IS IN FLIGHT
# A build run writes the build name to .claude/.build as its first action. With no such
# file this exits 0 immediately, so committing the hook does not change an ordinary local
# session.
#
# THE CAPS LIVE HERE, NOT IN THE PROMPT
# "stop after N attempts" written into a prompt is a suggestion a focused model talks
# itself out of. In this file it is arithmetic.
#
# THE BLOCKED EXIT IS DELIBERATE
# A PRD can carry more acceptance criteria than one session can clear. Grinding into the
# attempt cap and opening a half-built PR is the worst outcome, so a handoff that declares
# `status: blocked` with a named blocker is an honest way out. It is visible in the PR and
# in the run transcript, which is what makes it safe to allow.

set -uo pipefail

cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0

BUILD_FILE=".claude/.build"
ATTEMPTS=".claude/.gate-attempts"
MAX_ATTEMPTS="${BUILDS_GATE_MAX_ATTEMPTS:-12}"
TYPECHECK_LOG="/tmp/builds-gate-typecheck.log"

# ── Inert outside a run ───────────────────────────────────────────────────────
[ -f "$BUILD_FILE" ] || exit 0
BUILD=$(tr -d '[:space:]' < "$BUILD_FILE" 2>/dev/null)
[ -n "$BUILD" ] || exit 0

release() { rm -f "$ATTEMPTS"; exit 0; }
refuse()  { printf '%s\n' "$*" >&2; exit 2; }

# ── Caps ──────────────────────────────────────────────────────────────────────
if [ -f AGENT_STOP ]; then
    echo "gate: AGENT_STOP present — releasing the session." >&2
    release
fi

n=$(( $(cat "$ATTEMPTS" 2>/dev/null || echo 0) + 1 ))
echo "$n" > "$ATTEMPTS"
if [ "$n" -gt "$MAX_ATTEMPTS" ]; then
    echo "gate: ${MAX_ATTEMPTS} attempts without passing — releasing. Read the transcript." >&2
    release
fi

# ── What the run is working ───────────────────────────────────────────────────
PRD=$(ls docs/prds/"${BUILD}"-*-prd.md 2>/dev/null | tail -1)
[ -n "$PRD" ] || refuse "gate: no PRD matches docs/prds/${BUILD}-*-prd.md.
The build name in ${BUILD_FILE} is wrong. Correct it, or remove the file if this is not a build run."

HANDOFF=".claude/plans/${BUILD}-handoff.md"
STATUS=""
[ -f "$HANDOFF" ] && STATUS=$(sed -n 's/^status:[[:space:]]*//p' "$HANDOFF" | head -1 | tr -d '[:space:]')

# An honest dead end ends the run. A blocked handoff with no named blocker does not.
if [ "$STATUS" = "blocked" ]; then
    if sed -n 's/^blocker:[[:space:]]*//p' "$HANDOFF" | head -1 | grep -q '[^[:space:]]'; then
        echo "gate: handoff declares status: blocked — releasing for a human." >&2
        release
    fi
    refuse "gate: ${HANDOFF} says 'status: blocked' but carries no 'blocker:' line.
Name what is actually blocking you on a 'blocker:' line, then stop."
fi

# ── The gate proper ───────────────────────────────────────────────────────────
if ! pnpm -r typecheck >"$TYPECHECK_LOG" 2>&1; then
    refuse "gate: typecheck is red. Fix it before finishing.

$(tail -15 "$TYPECHECK_LOG")"
fi

unchecked=$(sed -n '/AC:BEGIN/,/AC:END/p' "$PRD" | grep -c '^- \[ \] #')
if [ "${unchecked:-0}" -gt 0 ]; then
    refuse "gate: ${unchecked} acceptance criteria are still unchecked in ${PRD}.
Work the next one and tick its box only when its command actually passes.
If you cannot finish them in this run, write ${HANDOFF} with 'status: blocked' and a 'blocker:' line."
fi

if [ ! -f "$HANDOFF" ]; then
    refuse "gate: every acceptance criterion is ticked but ${HANDOFF} does not exist.
Write it — status, the PR, and anything that varied from the plan — then stop."
fi

if [ "$STATUS" != "shipped" ]; then
    refuse "gate: ${HANDOFF} carries status '${STATUS:-<missing>}'. Set 'status: shipped' once the PR is open, then stop."
fi

release
