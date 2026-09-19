---
name: task-plan
description: builds repo only. Create an isolated worktree for an approved build PRD and write a phased implementation plan against it. Planning only — writes no production code. Run at max effort.
---

# Task plan

Stage 2 of the automated workflow. Runs at **max effort** because plan quality sets the
ceiling on everything downstream. Writes a plan file and nothing else.

Argument: a task ID, e.g. `TASK-7`.

## Step 1 — Load the task

Read the build's PRD at `docs/prds/<build-name>-*-prd.md` — its acceptance criteria are the stop condition.

The task carries numbered acceptance criteria as `- [ ] #N` checkboxes between the
`<!-- AC:BEGIN -->` / `<!-- AC:END -->` markers. Those ACs are the spine of the plan: map each
phase to the AC numbers it closes, and make the plan's Verification command the union of the
commands the ACs name.

**The verification command runs from a worktree — write it for one.** Scope it by filter so
it does not rebuild the world:

```bash
pnpm --filter <package> typecheck && \
pnpm --filter <package> test && \
pnpm --filter <package> build
```

Widen to `pnpm -r` only when the change touches `shared/` — a `shared` change that only
verifies its own package is how a POC breaks silently. Every command gets a `tee` target so
the log can be read back instead of re-run.

If the ACs are prose-only with nothing runnable, do not silently invent a bar. Say which ACs
are unverifiable, propose the command you would use for each, and stop for the user to
confirm — a plan built on a guessed definition of done wastes the whole run.

## Step 2 — Make sure you are in a worktree

**Check first — do not assume.** `task-loop.sh` already creates the worktree and launches you
inside it, so calling `EnterWorktree` there would try to nest a second one.

```bash
git rev-parse --show-toplevel
git worktree list | head -1        # first entry is always the MAIN worktree
```

- **Already in a worktree** (toplevel differs from the main worktree): stay put. The driver
  also ran `pnpm install`, so skip the install below and go to Step 3.
- **In the main worktree**: use the `EnterWorktree` tool with the name
  `task-<id>-<short-slug>`, then `pnpm install --frozen-lockfile` — a fresh worktree has no
  `node_modules` and every gate in it fails until that runs.

## Step 2.5 — Scope the ACs for THIS cycle

Not every AC has to land in one pass, and pretending otherwise produces a plan that stalls at
80% with no way to finish. Before writing phases, split the task's ACs into two lists:

- **In scope this cycle** — what this run will actually close.
- **Deferred** — with a one-line reason each: blocked on another task, needs a decision only
  the user can make, needs a vendor credential that does not exist, or simply too large to
  land safely in one PR.

Record both in the plan under a `## AC scope` heading, by number:

```markdown
## AC scope
In scope:  #1 #2 #3 #5
Deferred:  #4 (needs a real Stripe test key — not available in CI)
           #6 (spend-cap threshold wants a decision on the number)
```

Bias toward a **smaller in-scope set that fully lands** over a larger one that half-lands. A
merged PR closing four ACs beats an abandoned branch touching nine.

If deferring changes what the task is really about — everything interesting is deferred and
only scaffolding remains — stop and say so rather than planning around a hollowed-out scope.

## Step 3 — Understand before planning

Read the actual call sites. Budget real effort here; this is the step that prevents a plan
built on a wrong assumption about what a function returns or which stage runs first.

- Trace the pipeline path end to end for the stage you intend to change
  (`shared/src/pipeline/`), and read the POC's `src/index.ts` composition.
- Name the `shared` primitive you will hang the change off, rather than a new entry point.
  If the answer is "none fits", say that explicitly in the plan — it is a spine change and
  deserves the user's attention, not a quiet new module.
- Check which of the four reliability primitives the change touches, and plan the test that
  proves each still holds. An idempotency guarantee with no test asserting a double-call is
  a no-op is not a guarantee.
- Check the fixtures in `<build-name>/src/fixtures/`. A plan that needs a vendor credential where a
  fixture would do is a plan that will not run in CI.

## Step 4 — Write the plan

Write the plan to `TASK-<id>-plan.md` in your **session scratchpad directory** (NOT under
`.claude/` — that path is guarded from inside the worktree session and the write will be
refused). `task-loop.sh` copies it to `.claude/plans/TASK-<id>-plan.md` after this phase. If
you are running this skill standalone, write it to `.claude/plans/` yourself. Structure:

```markdown
# TASK-<id> — <title>

## Verification command
<the exact command that proves the IN-SCOPE ACs are done.
 It must not depend on anything deferred.>

## AC scope
In scope:  #...
Deferred:  #... (reason)

## Phase 1 — <name>
- [ ] <change>, in <file>
- [ ] <test that covers it>
Verify: <command>

## Phase 2 — ...
```

Rules for the phases:

- **Each phase must end green.** A phase whose verification can only run after a later phase
  is not a phase — merge them.
- **Order phases so the cheapest verification comes first**: typecheck → unit test → package
  build → full-workspace run. A plan that defers all verification to the end wastes the
  loop's time when phase 1 was wrong.
- **Name the exact command per phase**, with a `tee` target.
- Keep phases to a size one context window can hold. Five focused phases beat two large ones.
- If the plan changes anything in `shared/`, pin which POCs consume it now (`rg` for the
  import) and add a phase that verifies each still builds. That blast radius is the single
  thing most likely to be missed.

## Step 5 — Mirror the plan into the PRD

If a PRD exists, make sure its checklist items correspond 1:1 to the plan's phase items. The
implementation loop ticks the PRD checkboxes; a mismatch there is how progress tracking
silently drifts.

## Step 6 — Hand off

Commit nothing. Print the plan path and the verification command, then stop. The driver
(`scripts/loop/task-loop.sh`) restarts Claude at medium effort for code generation — effort
and model are process-level flags, so the switch has to be a new process, not a new turn.
