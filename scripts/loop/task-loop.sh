#!/usr/bin/env bash
#
# task-loop.sh — drive an approved build PRD from plan to reviewed PR, unattended.
#
# WHY A DRIVER AND NOT ONE SESSION
# Two things this workflow needs are process-level, not session-level:
#
#   1. Reasoning effort and model (`claude --effort` / `--model`) are process flags. No
#      skill or hook can change them mid-session, so wanting max for planning and medium
#      for codegen requires a process boundary.
#   2. Context isolation. The agent that wrote the code is a biased reviewer of it. A
#      "second agent" sharing the session inherits every assumption the author made and
#      waves the work through. Only a fresh process is a real second opinion.
#
# So the driver runs three headless invocations against one dedicated worktree:
#   1. /task-plan      at --effort max     -> .claude/plans/<build>-plan.md
#   2. /task-implement at --effort medium  -> phases, validation, commit, push, PR
#   3. /review-pr      at --effort high    -> independent review of the resulting PR
#
# The PRD earns the same fresh-process treatment at intake time via the sibling
# spec-review.sh, which /spec-intake calls before its human checkpoint.
#
# REVIEW FINDINGS ARE DECISIONS, NOT AUTO-APPLIED
# Both review stages only SURFACE findings. The loop never auto-applies or auto-dismisses
# them: each important finding is driven to an explicit human decision and then applied by
# the author. A silently-dropped finding is the same failure as no review.
#
# WHY STEP 2 IS A LOOP
# A headless `claude -p` session has no continuation mechanism — it runs one turn-sequence
# and exits on end_turn. `/goal` would install a Stop hook, but it is a slash command, a
# user-input affordance a model inside -p cannot type. So the driver supplies the
# continuation: it re-enters the SAME session with --resume until the skill writes a
# handoff file, or the iteration cap trips. The handoff file is the completion signal.
#
# Seeing `implement iteration 2/10 (resuming …)` in the log is normal, not a fault.
#
# Usage:
#   task-loop.sh reckon
#   task-loop.sh reckon --plan-only
#   task-loop.sh reckon --implement-only          # reuse an existing plan
#   task-loop.sh reckon --review-only             # review an already-open PR
#   task-loop.sh reckon --review-only --pr 12     # ...naming it explicitly
#   task-loop.sh reckon --no-review               # stop at the PR
#   task-loop.sh reckon --spec-review-only        # fresh PRD review only
#
#   Effort per stage (defaults: plan=max, code=medium, review=high):
#   task-loop.sh reckon --effort-plan high --effort-code low --effort-review max
#
#   Model per stage (default: inherit the CLI's configured model):
#   task-loop.sh reckon --model claude-opus-5                  # every stage
#   task-loop.sh reckon --model-plan claude-opus-5 \
#                       --model-code claude-sonnet-5 \
#                       --model-review claude-opus-5           # per stage; overrides --model
#
#   task-loop.sh reckon --stream        # surface messages as they happen
#   task-loop.sh reckon --dry-run
#
# Logs land in /tmp/task-loop-<id>-{plan,implement[-N],review}.log. Read those rather
# than re-running — a re-run costs another full phase.

set -euo pipefail

BUILD=""
EFFORT_PLAN="max"
EFFORT_CODE="medium"
EFFORT_REVIEW="high"
MODEL=""              # empty = inherit the CLI default model
MODEL_PLAN=""         # per-stage overrides; empty = fall back to $MODEL
MODEL_CODE=""
MODEL_REVIEW=""
PLAN_ONLY=0
IMPLEMENT_ONLY=0
REVIEW_ONLY=0
SPEC_REVIEW_ONLY=0
NO_REVIEW=0
PR_ID=""
DRY_RUN=0
STREAM=0

# How many times to re-enter the implement session before giving up. Each iteration is a
# full turn-sequence, so this is generous: a task needing more than a handful is a task
# whose plan was wrong. Raising the cap is almost never the right fix.
IMPL_MAX_ITER=${BUILDS_IMPL_MAX_ITER:-10}

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${GREEN}[INFO]${NC} $*" >&2; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*" >&2; }
err()   { echo -e "${RED}[ERROR]${NC} $*" >&2; }
step()  { echo -e "${CYAN}[STEP]${NC} $*" >&2; }
die()   { err "$*"; exit 1; }

usage() { sed -n '/^# Usage:/,/^# than re-running/p' "$0" >&2; exit 2; }

while [ $# -gt 0 ]; do
    case $1 in
        --plan-only)        PLAN_ONLY=1; shift ;;
        --implement-only)   IMPLEMENT_ONLY=1; shift ;;
        --review-only)      REVIEW_ONLY=1; shift ;;
        --spec-review-only) SPEC_REVIEW_ONLY=1; shift ;;
        --no-review)        NO_REVIEW=1; shift ;;
        --pr)               PR_ID=$2; shift 2 ;;
        --effort-plan)      EFFORT_PLAN=$2; shift 2 ;;
        --effort-code)      EFFORT_CODE=$2; shift 2 ;;
        --effort-review)    EFFORT_REVIEW=$2; shift 2 ;;
        --model)            MODEL=$2; shift 2 ;;
        --model-plan)       MODEL_PLAN=$2; shift 2 ;;
        --model-code)       MODEL_CODE=$2; shift 2 ;;
        --model-review)     MODEL_REVIEW=$2; shift 2 ;;
        --stream)           STREAM=1; shift ;;
        --dry-run)          DRY_RUN=1; shift ;;
        -h|--help)          usage ;;
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

# Per-stage model resolution: an explicit --model-<stage> wins, then --model, then nothing
# (inherit the CLI default). Resolved here so every invocation path sees the same answer.
: "${MODEL_PLAN:=$MODEL}"
: "${MODEL_CODE:=$MODEL}"
: "${MODEL_REVIEW:=$MODEL}"

command -v claude >/dev/null || die "claude CLI not on PATH"
command -v gh >/dev/null     || die "gh CLI not on PATH — the PR stages need it"

MAIN_WT=$(git worktree list 2>/dev/null | head -1 | awk '{print $1}')
[ -n "$MAIN_WT" ] || die "not inside a git repository"

# The repo is resolved from cwd, so a stray cwd would otherwise plant a worktree and a plan
# in the wrong tree and fail much later, somewhere confusing.
[ -f "${MAIN_WT}/pnpm-workspace.yaml" ] && [ -d "${MAIN_WT}/shared" ] || die \
    "cwd resolves to ${MAIN_WT}, which is not the builds repo — cd there first"

WORKTREE="${MAIN_WT}/.claude/worktrees/${SLUG}"
BRANCH="worktree-${SLUG}"
HANDOFF="${WORKTREE}/.claude/plans/${BUILD}-handoff.md"
SPEC_REVIEW="$(dirname "$(readlink -f "$0")")/spec-review.sh"

run() {
    if [ "$DRY_RUN" = 1 ]; then echo "+ $*" >&2; else "$@"; fi
}

# ── Worktree ──────────────────────────────────────────────────────────────────
# Created here rather than by the agent so every invocation lands in the same tree.
ensure_worktree() {
    if [ -d "$WORKTREE" ]; then
        info "reusing worktree $WORKTREE"
        return
    fi
    step "creating worktree $WORKTREE on branch $BRANCH"
    run git -C "$MAIN_WT" fetch origin main --quiet
    # `-b` fails if the branch already exists — which it does whenever a cycle is being
    # re-entered, e.g. --review-only against an already-open PR.
    if git -C "$MAIN_WT" show-ref --verify --quiet "refs/heads/${BRANCH}"; then
        info "branch ${BRANCH} already exists — checking it out rather than creating it"
        run git -C "$MAIN_WT" worktree add "$WORKTREE" "$BRANCH"
    else
        run git -C "$MAIN_WT" worktree add -b "$BRANCH" "$WORKTREE" origin/main
    fi

    # Reviewing reads a diff and some source; it never builds. Skip the install.
    if [ "$REVIEW_ONLY" = 1 ]; then
        info "review-only: skipping the dependency install"
        return
    fi

    # A fresh worktree has no node_modules, so every gate in it fails until this runs.
    # Cheap here (pnpm's store is shared and hard-linked), expensive to debug later.
    step "installing workspace dependencies (pnpm install --frozen-lockfile)"
    if [ "$DRY_RUN" != 1 ]; then
        ( cd "$WORKTREE" && pnpm install --frozen-lockfile ) \
            || warn "pnpm install failed — the plan phase may hit missing-module errors"
    fi
}

# ── Permissions ───────────────────────────────────────────────────────────────
# The headless invocations run with cwd INSIDE the worktree — a separate origin/main
# checkout that does NOT contain the gitignored .claude/settings.local.json. Without it
# those sub-sessions see none of the user's allow rules, so in a non-interactive session
# every call the classifier does not auto-allow is DENIED with no human to grant it, and
# the loop stalls silently. Symlinking the main tree's local settings in gives the
# sub-sessions the same permission posture the user has interactively. The link target is
# itself gitignored, so it never shows as a dirty file in the worktree.
link_local_settings() {
    local src="${MAIN_WT}/.claude/settings.local.json"
    local dst="${WORKTREE}/.claude/settings.local.json"
    [ -f "$src" ] || return 0
    [ -L "$dst" ] && return 0
    if [ "$DRY_RUN" = 1 ]; then echo "+ ln -sf $src $dst" >&2; return 0; fi
    mkdir -p "${WORKTREE}/.claude"
    ln -sf "$src" "$dst"
}

# ── Claude invocations ────────────────────────────────────────────────────────
# Extra flags (--session-id / --resume) are passed through after the model.
claude_run() {
    local effort=$1 model=$2 prompt=$3 logfile=$4; shift 4
    local -a extra=("$@")
    step "claude --effort ${effort}${model:+ --model ${model}} ${extra[*]-} -p \"${prompt:0:60}…\"  (log: ${logfile})"
    [ "$DRY_RUN" = 1 ] && return 0

    local -a args=(--effort "$effort")
    [ -n "$model" ] && args+=(--model "$model")
    args+=(${extra[@]+"${extra[@]}"} -p "$prompt")
    # Default text output prints nothing until the invocation finishes, which looks hung
    # on a long phase. --stream surfaces each message as it happens.
    [ "$STREAM" = 1 ] && args+=(--output-format stream-json --verbose)

    ( cd "$WORKTREE" && claude "${args[@]}" ) 2>&1 | tee "$logfile"
    return "${PIPESTATUS[0]}"
}

new_session_id() {
    cat /proc/sys/kernel/random/uuid 2>/dev/null || uuidgen
}

# Re-anchors a resumed session. "continue" alone invites a fresh start or a summary; this
# names the exit condition and re-states the rule that kills unattended runs.
continue_prompt() {
    cat <<EOF
Continue /task-implement ${BUILD}. Do NOT start over and do not re-run anything that
already went green — resume at the first incomplete phase in
.claude/plans/${BUILD}-plan.md.

Your previous turn ended without writing .claude/plans/${BUILD}-handoff.md, so the work
is not finished. If the previous turn left something running in the background, it was
killed when that turn ended: re-run it in the FOREGROUND and block on it.

You are done only when the handoff file exists. Write it, then stop.
EOF
}

# ── Artifact placement ────────────────────────────────────────────────────────
# The sub-sessions run with cwd INSIDE the worktree, so ${WORKTREE}/.claude/ is their own
# project-config dir — and the harness guards that dir against edits from within the
# session, overriding any allow rule. So the skills write their artifacts into the session
# scratchpad (always allowed) and the loop copies them into the canonical, gitignored
# .claude/plans/ from THIS shell, which is not subject to the in-session guard.
#
# The scratchpad is located by the worktree slug so a concurrent loop for another task
# never matches; the mtime check against a per-phase marker rejects a stale artifact from
# an earlier run of the same task.
place_artifact() {
    local base=$1 marker=$2 dst=$3
    [ -f "$dst" ] && [ "$dst" -nt "$marker" ] && return 0
    local found
    found=$(ls -t /tmp/claude-*/*worktrees-"${SLUG}"/*/scratchpad/"$base" 2>/dev/null | head -1)
    [ -n "$found" ] && [ "$found" -nt "$marker" ] || return 1
    mkdir -p "$(dirname "$dst")"
    cp -f "$found" "$dst"
}

# ── Phases ────────────────────────────────────────────────────────────────────
run_plan() {
    local marker="/tmp/task-loop-${SLUG}-plan.marker"
    run touch "$marker"
    claude_run "$EFFORT_PLAN" "$MODEL_PLAN" "/task-plan ${BUILD}" "/tmp/task-loop-${SLUG}-plan.log" \
        || die "plan phase failed — see /tmp/task-loop-${SLUG}-plan.log"

    local plan="${WORKTREE}/.claude/plans/${BUILD}-plan.md"
    if [ "$DRY_RUN" != 1 ]; then
        place_artifact "${BUILD}-plan.md" "$marker" "$plan" \
            || die "plan phase wrote no ${BUILD}-plan.md (checked .claude/plans and scratchpad) — read /tmp/task-loop-${SLUG}-plan.log before re-running"
    fi
    info "plan written: ${plan}"
}

# Returns 0 when the skill reported `status: shipped`, 1 on blocked/exhausted.
run_implement() {
    local sid; sid=$(new_session_id)
    local logbase="/tmp/task-loop-${SLUG}-implement"
    local iter=1 consecutive_failures=0

    run rm -f "$HANDOFF"
    local marker="/tmp/task-loop-${SLUG}-implement.marker"
    run touch "$marker"

    while [ "$iter" -le "$IMPL_MAX_ITER" ]; do
        local log="${logbase}.log"
        [ "$iter" -gt 1 ] && log="${logbase}-${iter}.log"

        local rc=0
        if [ "$iter" = 1 ]; then
            claude_run "$EFFORT_CODE" "$MODEL_CODE" "/task-implement ${BUILD}" "$log" \
                --session-id "$sid" || rc=$?
        else
            info "implement iteration ${iter}/${IMPL_MAX_ITER} (resuming ${sid})"
            claude_run "$EFFORT_CODE" "$MODEL_CODE" "$(continue_prompt)" "$log" \
                --resume "$sid" || rc=$?
        fi

        [ "$DRY_RUN" = 1 ] && return 0

        if [ "$rc" != 0 ]; then
            consecutive_failures=$((consecutive_failures + 1))
            warn "implement iteration ${iter} exited ${rc}"
            # Two in a row means the invocation itself is broken (bad flag, auth, quota),
            # not that the model needs another turn. Spinning would just burn the cap.
            if [ "$consecutive_failures" -ge 2 ]; then
                err "two consecutive failed invocations — stopping. See ${log}"
                return 1
            fi
        else
            consecutive_failures=0
        fi

        place_artifact "${BUILD}-handoff.md" "$marker" "$HANDOFF" || true
        if [ -f "$HANDOFF" ]; then
            local status
            status=$(sed -n 's/^status:[[:space:]]*//p' "$HANDOFF" | head -1)
            case "$status" in
                shipped)
                    info "implement finished after ${iter} iteration(s)"
                    return 0 ;;
                blocked)
                    warn "implement reported BLOCKED — not opening a review:"
                    sed -n '1,25p' "$HANDOFF" >&2
                    return 1 ;;
                *)
                    warn "handoff has unrecognised status '${status}'; treating as finished"
                    return 0 ;;
            esac
        fi

        warn "iteration ${iter} ended with no handoff file — the phase is unfinished"
        iter=$((iter + 1))
    done

    err "implement did not finish in ${IMPL_MAX_ITER} iterations — read ${logbase}*.log"
    return 1
}

resolve_pr() {
    if [ -n "$PR_ID" ]; then echo "$PR_ID"; return 0; fi
    local id=""
    if [ -f "$HANDOFF" ]; then
        id=$(sed -n 's/^pr:[[:space:]]*//p' "$HANDOFF" | head -1)
    fi
    if [ -z "$id" ]; then
        id=$(gh pr list --head "$BRANCH" --state all --limit 1 --json number \
             --jq '.[0].number // empty' 2>/dev/null || true)
    fi
    echo "$id"
}

# A FRESH session, deliberately. Resuming the implement session here would hand the
# reviewer every rationalisation the author already made — the one thing a second opinion
# must not inherit.
run_review() {
    local pr; pr=$(resolve_pr)
    if [ -z "$pr" ] || [ "$pr" = "null" ]; then
        warn "no PR found for ${BRANCH} — skipping review"
        warn "if the PR exists under another branch, name it: --review-only --pr <id>"
        return 1
    fi
    info "reviewing PR #${pr} in a fresh session"
    claude_run "$EFFORT_REVIEW" "$MODEL_REVIEW" "/review-pr ${pr}" "/tmp/task-loop-${SLUG}-review.log" \
        || { warn "review phase exited non-zero — see /tmp/task-loop-${SLUG}-review.log"; return 1; }

    # Confirm against the PR, not the log: a log that says "reviewed" and a PR with no
    # [builds-review] comment means the review did not actually land.
    local posted
    posted=$(gh pr view "$pr" --json comments --jq \
        '[.comments[] | select(.body | startswith("[builds-review]"))] | length' 2>/dev/null || echo "?")
    info "review complete — PR #${pr} carries ${posted} [builds-review] summary comment(s)"
    [ "$posted" = "0" ] && warn "no review summary landed on the PR — do not report it as reviewed"
    return 0
}

main() {
    # The task/PRD review runs against the MAIN tree, where the artifacts live — not a
    # worktree. Delegate to the sibling driver before any worktree is created.
    if [ "$SPEC_REVIEW_ONLY" = 1 ]; then
        [ -x "$SPEC_REVIEW" ] || die "spec-review.sh not found or not executable at $SPEC_REVIEW"
        local -a sr_args=("$BUILD")
        [ "$STREAM" = 1 ] && sr_args+=(--stream)
        [ -n "$MODEL_PLAN" ] && sr_args+=(--model "$MODEL_PLAN")
        if [ "$DRY_RUN" = 1 ]; then echo "+ exec $SPEC_REVIEW ${sr_args[*]}" >&2; exit 0; fi
        exec "$SPEC_REVIEW" "${sr_args[@]}"
    fi

    ensure_worktree
    link_local_settings

    if [ "$REVIEW_ONLY" = 1 ]; then
        run_review
        exit $?
    fi

    [ "$IMPLEMENT_ONLY" = 1 ] || run_plan

    if [ "$PLAN_ONLY" = 1 ]; then
        info "--plan-only: stopping before code generation"
        info "review the plan, then: scripts/loop/task-loop.sh ${BUILD} --implement-only"
        exit 0
    fi

    run_implement || die "implement phase did not ship — see /tmp/task-loop-${SLUG}-implement*.log"

    if [ "$NO_REVIEW" = 1 ]; then
        info "--no-review: stopping at the PR"
    else
        run_review || warn "review did not run — start it later with: scripts/loop/task-loop.sh ${BUILD} --review-only"
    fi

    info "done. PR state:"
    gh pr list --head "$BRANCH" --state all --json number,title,state,url \
       --jq '.[] | "#\(.number) \(.state) — \(.title)\n\(.url)"' || true
    info "to tend the PR: claude, then /loop /pr-babysit"
}

main
