# Loop runbook — how a request becomes a reviewed PR

How the intake → plan → implement → validate → PR → review workflow runs as a set of Claude
Code loops on this repo.

Everything runs **locally**. The whole system is committed here — the skills in
`.claude/skills/`, the drivers in `scripts/loop/` — so the loop is part of the repo rather
than part of one laptop's config.

## The loop-type map

Each stage maps to exactly one loop type; picking the wrong type is what makes automation feel
like it fights you.

| # | Stage | Loop type | Primitive | Effort |
|---|---|---|---|---|
| 1 | Intake: request → task + PRD | Turn-based | `/spec-intake` | max |
| — | **Approve task + PRD** | — | **you** | — |
| 2 | Plan against a worktree | Turn-based | `/task-plan` | max |
| 3 | Implement in-scope ACs by phase | Goal-based | `/task-implement` + driver resume loop | medium |
| 4 | Run the repo gate | Goal-based | `/validate-local` | medium |
| 5 | Review the PR, independently | Turn-based | `/review-pr` in its own process | high |
| 6 | Tend the PR: CI + comments | Time-based | `/loop /pr-babysit` | medium |

Stages 2–5 are chained by `scripts/loop/task-loop.sh`, which is unattended end to end.
`/task-run` is the conversational front door to that script.

### Why a driver script instead of one long session

Two things this workflow needs are **process-level**, not session-level.

**Effort and model.** `claude --effort …` and `--model …` are process flags; no skill or hook
can change them mid-session. Wanting max for planning and medium for codegen — or a cheaper
model for codegen than for review — requires a process boundary.

**Context isolation.** The agent that wrote the code is a biased reviewer of it. A "second
agent" sharing the session inherits every assumption the author made and will wave the work
through. Only a fresh process gives a real second opinion.

So `task-loop.sh` runs three headless invocations against one worktree: plan at max, implement
at medium, review at high — the last in a session that has never seen the author's reasoning.

### Why the driver resumes

A headless `claude -p` session has **no continuation mechanism**: it runs one turn-sequence and
exits on `end_turn`. `/goal` would install a session-scoped Stop hook, which is the right
primitive interactively — but it is a slash command, a user-input affordance, and a model
inside `-p` cannot type one.

Left alone, an implement session will end its turn saying "the build is running in the
background, I'll pick up the next phase once it reports". It will not. The background child is
killed with the turn, and validation, commit, push, PR and review are skipped in silence while
the driver sees exit 0 and reports success.

The fix is the driver supplying the continuation: it re-enters the same session with
`--resume` until `.claude/plans/TASK-<id>-handoff.md` appears, capped at `BUILDS_IMPL_MAX_ITER`
(default 10). The handoff file carries `status: shipped|blocked` plus the PR number, and is the
completion signal a Stop hook would otherwise have judged. Seeing
`implement iteration 2/10 (resuming …)` in the log is normal.

No always-on Stop hook is configured. One in a settings file would fire on **every** turn of
**every** session in scope — including interactive question-answering — and cost an evaluation
each time.

### Review findings are decisions, not auto-applied

Both review stages — the intake `/review-spec` and the code `/review-pr` — only **surface**
findings. The loop never auto-applies or auto-dismisses them. Each important finding is driven
to an explicit human decision and then applied by the author: spec-intake applies PRD calls in
place, pr-babysit applies PR calls on the branch. A silently-dropped finding is the same
failure as no review.

## One-time setup

1. **`gh` authenticated** — `gh auth status`. The PR stages use it directly; there is no
   token file and no wrapper script.
2. **Node >= 20 and pnpm 10** — the same versions CI uses.
3. **Permissions.** The headless sub-sessions run with cwd inside a worktree and cannot ask a
   human for approval. `.claude/settings.json` carries the allowlist for the loop's own
   commands; anything outside it stalls the run silently. If a fresh run reports denials, that
   file is the first place to look.
4. **The PRD is the tracking surface.** There is no backlog in this repo — it moved to the
   private research, because this repo is public and planning should not be.
   `/spec-intake` writes `docs/prds/<build-name>-v<n>-prd.md` with `- [ ] #N` acceptance
   criteria; every later stage reads it and `/task-implement` ticks it in place. The PRD sits
   inside the worktree, so it commits with the code that satisfied it.
5. **Public repo.** The PRD carries functional and technical spec only. Anything about the
   practice rather than the software stays in the private research — see `CLAUDE.md`.

## Running it

```bash
# intake: interactive, ends at your approval checkpoint
claude
> /spec-intake <describe the build or bug>

# plan first, read the scope split, then go
scripts/loop/task-loop.sh TASK-7 --plan-only
scripts/loop/task-loop.sh TASK-7 --implement-only --stream

# or straight through
scripts/loop/task-loop.sh TASK-7

# tend the PR afterwards
claude
> /loop /pr-babysit
```

### Choosing effort and model per stage

Defaults: plan `max`, code `medium`, review `high`, spec-review `max`. Model defaults to
whatever the CLI is configured to use.

```bash
scripts/loop/task-loop.sh TASK-7 --effort-code high
scripts/loop/task-loop.sh TASK-7 --model claude-opus-5                 # all stages
scripts/loop/task-loop.sh TASK-7 --model-code claude-sonnet-5          # codegen only
scripts/loop/task-loop.sh TASK-7 --model-plan claude-opus-5 \
                                 --model-code claude-sonnet-5 \
                                 --model-review claude-opus-5
```

A per-stage flag beats `--model`. Dropping the *review* model is usually the worst place to
economise — that stage is the one catching what the other two got wrong.

## Where things land

| Thing | Path | Committed? |
|---|---|---|
| Skills and drivers | `.claude/skills/`, `scripts/loop/` | yes |
| PRDs (spec + tracking) | `docs/prds/` | yes |
| Worktrees | `.claude/worktrees/<build>/` | no |
| Plans and handoffs | `.claude/plans/<build>-{plan,handoff}.md` | no |
| Phase logs | `/tmp/task-loop-<build>-*.log` | no |
| Spec-review findings | `/tmp/spec-review-<build>.md` | no |

Read the logs rather than re-running a phase. A re-run costs the whole phase and usually
reproduces the same failure.

## Not ported from the original

The system this came from also ran a nightly CI-triage loop and a 10am daily briefing, both
tied to infrastructure that does not exist here (a Jenkins release pipeline, a shared Docker
stack, three task-loop slots a day). If this repo ever grows a nightly pipeline, the triage
stage slots in as stage 7 — proactive loop, scheduled, producing either an all-clear or a
filed task with evidence attached.
