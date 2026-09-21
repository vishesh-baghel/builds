---
name: task-implement
description: builds repo only. Execute an approved implementation plan phase by phase, ticking task and PRD checkboxes as each phase goes green, then run the full gate and open a GitHub PR. Runs unattended at medium effort; task-loop.sh resumes the session until it writes a handoff file.
---

# Task implement

Stage 3 of the automated workflow. Run at **medium effort** — plan quality is already banked,
this is execution.

Argument: a build name, e.g. `reckon` — the top-level build directory.

## Step 0 — The completion contract

Read `.claude/plans/<build>-plan.md`, in particular its **Verification command** and its
**AC scope** section.

You are running inside `task-loop.sh`, which will **resume this exact session** every time
your turn ends without a handoff file present. That file is the only completion signal (write
it to your session scratchpad as `<build>-handoff.md`; `task-loop.sh` copies it into
`.claude/plans/`, which is where it is read back from):

```
.claude/plans/<build>-handoff.md
```

Write it once, at the very end (Step 5), and not before. Until it exists the driver assumes
the work is unfinished and gives you another turn, so **ending your turn mid-phase is
recoverable — faking completion is not.** If you are stuck, write the handoff with
`status: blocked` rather than leaving it absent; an absent file burns the whole iteration cap.

Do not try to run `/goal`. It is a user-input slash command that installs a session-scoped
Stop hook; a headless session cannot invoke one, and attempting it wastes a turn. The driver's
resume loop is the continuation mechanism here.

Work only the **in-scope** ACs from the plan. Deferred ACs are settled in Step 2.5, not
implemented.

## Step 1 — Per-phase cycle

### Write the minimum that satisfies the AC

Before writing each change, climb this ladder and stop at the first rung that holds:

1. Does this need to exist at all? Speculative need = skip it, note it in one line. (YAGNI)
2. Already in this repo? Reuse it — `shared/src/` first, then the POC's own helpers.
3. Stdlib does it? Use it.
4. A platform/runtime feature covers it? Use it.
5. An already-installed dependency solves it? Use it — never add a new one for a few lines.
6. Can it be one line? One line.
7. Only then: the minimum code that works.

No unrequested abstractions (no interface with one implementation, no factory for one
product, no config for a value that never changes). No scaffolding "for later". Never simplify
away: validation at a trust boundary, error handling that prevents data loss, secret handling,
or anything an AC explicitly requires. The ladder shortens the solution, never the reading —
trace the real flow first.

For each phase in order:

1. **Implement** the phase's changes. Match the surrounding code's idiom, comment density,
   and naming.
2. **Run that phase's verification**, captured to a file:
   ```bash
   pnpm --filter <package> test 2>&1 | tee /tmp/<build>-phase<N>.log
   ```
   Then read the log back. **Never re-run a test command to inspect a failure** — re-running
   costs time and loses the original output.
3. **Fix forward** until green. If two consecutive attempts make no progress, stop and report
   rather than thrashing.
4. **Tick the checkboxes** in the same edit that closes the phase — this is the progress
   signal, and leaving it to the end defeats the point. Tick all of:
   - the plan file's phase items;
   - the PRD's `- [ ] #N` acceptance criteria, for every AC the phase actually satisfied.

   The PRD is a file in the worktree you are already in, so it commits with the code and needs
   no cross-tree shuffle.
5. Move to the next phase.

## Non-negotiables while coding

From CLAUDE.md, and enforced by the gate — violating them just costs a round trip:

- **The four reliability primitives are not optional.** Anything that calls a vendor or
  contacts a human uses idempotency, retry, the audit log and the spend cap from
  `shared/src/reliability/`. Do not hand-roll a local equivalent.
- **Do not fork the spine.** No POC-local pipeline, result type, or stage contract. If the
  spine genuinely does not fit, stop and say so — that is a decision, not an implementation
  detail.
- **No real credentials, no client data, no client-derived numbers.** Fixtures in
  `<build-name>/src/fixtures/`, secrets from the environment, `.env.example` only. This repo is
  public.
- Escalation to a human is a normal outcome. Build and test it as one, not as a `catch`.
- TypeScript strict; no `any` to silence the compiler. If a type is genuinely unknown at a
  boundary, validate it there and narrow.
- Never bypass the gate. No `// @ts-ignore` to get a build green, no skipped test left
  skipped without an annotated reason.

## Step 2 — Full validation

Once every phase is green, **run the plan's Verification command exactly as written**. Do not
skip it because the per-phase tests passed — the regressions this workflow exists to catch
are the cross-package ones.

Run the command itself; do not route through the `validate-local` skill and assume that
counts. Nested skill invocation from inside a long headless session is unreliable. The plan's
command is already written in `validate-local`'s required shape, so running it verbatim gets
the same guarantees with nothing left to chance. Read `validate-local` only if you need to
*change* the scope of what runs.

**Run it in the FOREGROUND and wait for it. Never background a long command and end your
turn.** This is not a style preference — it is the single failure that actually breaks
unattended loops. A background task does not survive the turn that spawned it: the child is
killed, the suite never runs, and validation, commit, push and PR are all silently skipped
while the log still reads "in progress". There is nothing to "pick up" later. Block on it,
read the captured log, then proceed.

## Step 2.5 — Settle the deferred ACs

Before committing, write the AC ledger. This is what stops a partial cycle from looking like
a failed one.

For every AC **not** closed this cycle, annotate it in the PRD with a one-line reason
and whatever evidence exists. An unannotated open AC is indistinguishable from one nobody
looked at.

Also annotate any AC that was in scope but turned out to be undeliverable. Do not silently
drop it and do not fake the checkbox: say what blocked it and what you learned. If the
divergence is interesting — the plan assumed something about the workflow that turned out to
be false — that belongs in `docs/VARIANCE-LOG.md`, which is the point of that file.

**Do not mark the task Done.** Closing a task with open ACs is a judgement call that belongs
to the user. Leave the status alone and report `<closed>/<total> ACs closed, <n> deferred`.
If the remainder warrants its own task, say so and propose a title; do not create it.

## Step 2.7 — Debloat pass (one bounded pass, before commit)

Validation green does not mean the diff is minimal. Read your full diff
(`git diff origin/main...HEAD`) once with the deletion lenses: `delete:` dead code you added,
`stdlib:` hand-rolled things the platform ships, `yagni:` abstractions with one caller,
`shrink:` same logic in fewer lines.

Apply only **behavior-preserving cuts inside your own diff** — deletions and inlinings that
cannot change semantics: unused helpers/imports/params you introduced, speculative
abstractions, copy-paste that folds into an existing `shared` util. Do not touch pre-existing
code, do not restructure working logic, and do not iterate — one pass, then stop.

If the pass changed nothing, move on. If it changed code, re-run the *targeted* tests for the
touched packages, captured with `tee`.

## Step 3 — Commit

```bash
git add -A
git commit -m "<type>(<scope>): <build-name> — <summary>"
```

**One commit for the whole session**, not granular commits. The PRD is in this worktree, so
ticked acceptance criteria commit alongside the code that satisfied them.

## Step 4 — Ship

```bash
git push -u origin HEAD
gh pr create \
  --base main \
  --title "<build>: <title>" \
  --body-file /tmp/<build>-pr-body.md
```

Write the PR body first, and open it with a **plain-language summary** the reviewer can act on
without opening the task — three short parts, in simple words:

1. **The problem / feature** — what was broken or missing, from the operator's point of view,
   before any module names appear.
2. **The change** — what this PR does about it and where. One anchor (file/function/stage) per
   claim.
3. **What is validated** — what was run and what passing it proves, stated plainly (e.g.
   "the idempotency test sends the same invoice twice and asserts one email").

Then the mechanics: **which ACs this PR closes by number**, the validation evidence (commands
run and their results), and a **Deferred** section listing every open AC with its reason. A
reviewer must be able to tell "deliberately out of scope" from "missed" without opening the
task.

If the change touches `shared/`, **flag it at the top** along with which POCs consume it —
that is the blast radius a reviewer most needs to see.

## Step 5 — Write the handoff and stop

Last action of the run. Write `<build>-handoff.md` into your **session scratchpad
directory** (NOT under `.claude/` — guarded from inside the worktree session).
`task-loop.sh` copies it to `.claude/plans/<build>-handoff.md`, which is the completion
signal it polls for:

```
status: shipped
pr: 12
url: https://github.com/vishesh-baghel/builds/pull/12
acs: 4/6 closed, 2 deferred
validation: reckon typecheck/test/build green; shared unaffected
```

`status:` must be `shipped` or `blocked`, and it is the first thing the driver reads. Use
`blocked` when you genuinely cannot finish — a wrong premise in the plan, a dependency that
does not exist, a test that cannot pass without a decision you are not authorised to make.
Follow it with a short paragraph on what blocked you and what you tried. A `blocked` handoff
is a useful result; a missing handoff is just a stall.

Then report the PR URL and stop.

**Do not review your own PR.** The driver opens a *separate* session for `/review-pr`, on
purpose: a reviewer sharing your context inherits every assumption you made while writing the
code and will wave it through. Leaving the review to the fresh session is the whole reason it
catches anything.
