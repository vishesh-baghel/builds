---
name: task-run
description: builds repo only. Start the full unattended loop for a build — worktree, plan at max effort, code at medium, repo gate, push, PR, independent review — and report progress. Say "run the task loop for reckon" or invoke directly.
---

# Task run

The entry point for working a build. Wraps `scripts/loop/task-loop.sh` so you can start
it from a conversation instead of a separate terminal.

Argument: a build name, e.g. `reckon` — the top-level build directory.

## Step 1 — Pre-flight

Cheap checks that save a wasted run:

```bash
gh auth status                                      # the PR stages need this
git -C "$(git worktree list | head -1 | awk '{print $1}')" status --short
node --version                                      # must be >= 20
```

Report anything wrong and stop. In particular: **an unclean main worktree** means a previous
cycle left work behind, and it will get tangled with this build's commit.

Read the build's PRD at `docs/prds/<build-name>-*-prd.md` and confirm it has `- [ ] #N` acceptance criteria.
If it has none, say so and stop — `task-plan` will refuse anyway, and it is better to find out
here than three minutes in.

## Step 2 — Choose the mode

Default to **plan-first** unless the user has already said to go straight through:

```bash
scripts/loop/task-loop.sh <build> --plan-only
```

Run it with `run_in_background: true` — there is no reason to block the conversation. Tell the
user it is running and roughly what to expect.

When it finishes, read the plan and **summarise it back**: the phases, the AC scope split
(in-scope versus deferred, with reasons), and the verification command. Do not just say "the
plan is ready" — the point of stopping here is that the user sees the scope decision before
any code is written.

Then, once they are happy:

```bash
scripts/loop/task-loop.sh <build> --implement-only --stream
```

Also backgrounded. This is the long one: phases, the full gate, the AC ledger, commit, push,
PR — then a **separate** review session against the PR it just opened.

Two things about this phase are worth knowing when you report on it:

- The driver **re-enters the implement session** each time a turn ends without
  `.claude/plans/<build>-handoff.md`. Multiple iterations are normal, not a fault. You will
  see `implement iteration 2/10 (resuming …)` in the log.
- The review runs as its **own process** with a fresh context, because a reviewer that shares
  the author's session inherits the author's blind spots. It is not optional and not something
  the implement session does.

## Step 2.5 — Model and effort, if the user asks

Effort and model are per-stage process flags. Pass them through rather than trying to change
anything mid-session:

```bash
# cheaper codegen, unchanged planning and review
scripts/loop/task-loop.sh <build> --model-code claude-sonnet-5

# one model everywhere
scripts/loop/task-loop.sh <build> --model claude-opus-5

# effort per stage (defaults: plan=max, code=medium, review=high)
scripts/loop/task-loop.sh <build> --effort-code high
```

A per-stage flag overrides `--model`; omitting both inherits the CLI's configured model. If
the user asks to "use a cheaper model", ask which stage — dropping the *review* model is
usually the worst place to save, since that stage is the one catching mistakes.

## Step 3 — While it runs

The conversation stays usable. If asked for progress, read the log rather than re-running
anything:

```bash
tail -40 /tmp/task-loop-<build>-implement.log      # or -implement-2.log on a resume
tail -40 /tmp/task-loop-<build>-review.log
```

If the user wants it stopped, kill the background task — do not let a half-finished phase sit
silently.

## Step 4 — Report

When it exits, report:

- Which ACs closed, by number, and which were deferred with their reasons.
- The validation evidence: commands run, pass/fail, and anything skipped.
- The PR URL.
- **The review verdict and finding count.** Confirm it against the PR rather than the log:
  ```bash
  gh pr view <pr> --json comments \
    --jq '[.comments[] | select(.body | startswith("[builds-review]"))] | length'
  ```
  A `0` there means the review did not actually run, whatever the log says. Say so and offer
  `scripts/loop/task-loop.sh <build> --review-only` — do not report the PR as reviewed.
- **Findings are decisions, not FYIs.** Do not just report the count and move on: each
  surviving finding must be driven to an explicit call — accept (→ fix and push) or reject (→
  reply with the reason and resolve). `/loop /pr-babysit` does this per comment; never leave a
  finding silently unresolved.
- Anything the run flagged for a human — an ambiguous review comment, a `shared/` change with
  a wide blast radius, a test it could not write without a credential.

Then hand off: `/loop /pr-babysit` tends the PR from here.

## Failure modes worth naming

- **Plan phase produced no plan file** — read `/tmp/task-loop-<build>-plan.log` before
  re-running. Re-running without reading it usually reproduces the same failure.
- **`implement did not finish in 10 iterations`** — the session kept ending without writing a
  handoff. Read the last iteration log: usually the plan asked for something that cannot be
  verified, so no turn ever reaches the end. Fix the plan, do not raise the cap.
- **`status: blocked` in the handoff** — a real result, not a crash. Report what blocked it and
  what it tried. No PR and no review follow; that is correct.
- **`no PR found … skipping review`** — the implement phase shipped but the PR was opened on
  another branch, or was closed. Review it explicitly with `--review-only --pr <id>`; a merged
  PR is still worth reviewing, the findings just become follow-up tasks.
- **`pnpm install failed` during worktree setup** — the lockfile and `package.json` disagree.
  Fix it on main first; a worktree built on a broken install fails every phase confusingly.
