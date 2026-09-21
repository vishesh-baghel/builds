---
name: spec-intake
description: builds repo only. Turn a raw build idea or bug report into a reviewed PRD, audited against the CLAUDE.md spine rules, and stop for human approval before committing to main. Use at the start of any new piece of work.
---

# Spec intake

Stage 1 of the automated workflow. This is a **turn-based loop**: interactive by design,
ending at the one human checkpoint in the whole chain. Do not try to run it unattended.

Input: whatever the user described — a build idea, a bug, a half-formed workflow.

## Step 1 — Interview

Invoke the `requirements-clarity` skill and run the interview to completion. Push on the two
core questions it defines (Why? / Simpler?) plus, for this repo specifically:

- **Which spine stage does this live in?** `extract` / `classify` / `decide` / `act` /
  `escalate` / `log`. Work that does not fit one of them is either mis-scoped or is asking
  for a change to the spine itself — a much bigger decision, and one to name out loud.
- **Which of the four reliability primitives does it touch?** Idempotency, retry, audit log,
  spend cap. Anything that calls out to a vendor or sends something to a human touches at
  least two. CLAUDE.md § "The four reliability primitives are not optional".
- **Is this a new build, or a variation of an existing one?** A new top-level build directory is a
  weekly commitment. A change inside an existing POC is not. Do not let one become the other
  by accident.
- **What is the baseline number, and was it measured before the build?** A build with no
  pre-baselined counterpart produces a demo, not a result. If the baseline does not exist
  yet, measuring it is the first AC.

Scope and business framing — whether this workflow is worth a week, who it is for, what the
claim is — are the user's call, not yours. Ask; do not decide.

Keep interviewing until you can state the problem, the smallest sufficient change, and what
"done" looks like as verifiable acceptance criteria.

## Step 2 — Survey before you write

Do not skip this even when the ask seems obvious.

```bash
# does the spine already do this?
rg -n "export (function|const|class|type)" shared/src --type ts
# has another POC already solved it?
rg -ln "<concept>" --glob '!node_modules' .
# what did a past build learn here?
rg -n "<concept>" docs/VARIANCE-LOG.md docs/prds/
```

The answer "shared already does this, the POC just has to call it" is the most valuable
outcome of this step, and the most commonly missed.

## Step 3 — Write the PRD

The PRD is the tracking surface for this repo: there is no backlog here. Write it to
`docs/prds/<build-name>-v<n>-prd.md` with an **Acceptance criteria** section whose items are
`- [ ] #N` checkboxes — the loop ticks those in place as phases go green.

Acceptance criteria must be **verifiable by a command**, not by opinion. They are the stop
condition of the whole loop, and an evaluator can only judge what a transcript shows.

**Scope guard, and it is load-bearing: this repo is public.** The PRD carries functional and
technical spec only. Anything about the practice rather than the software stays in the private
research and must not be restated here — see `CLAUDE.md` for where the line falls. When the
founder hands you a task, take its requirements and leave its reasoning where it came from.

Good: "`pnpm --filter reckon test` passes and the audit-log fixture shows
one entry per decision."
Bad: "the chasing flow works correctly."

Wrap the acceptance criteria in `<!-- AC:BEGIN -->` / `<!-- AC:END -->` markers — `/task-plan`
reads the block between them. Give the PRD a **phase-by-phase checklist of `- [ ]` items` too;
the implementation loop ticks those and they are how progress is tracked.

A one-file fix does not need a PRD. Anything that spans more than one package, changes a
`shared` contract, or introduces a new external system of record does.

If the work is a new build, also stub `<build-name>/README.md` from
`docs/POC-TEMPLATE.md` with the baseline table filled in as far as it is known. An empty
baseline row at intake is a flag, not a formality.

## Step 4 — Independent review [FRESH SESSION]

You wrote this PRD, so you are the wrong reviewer — a same-session audit re-reads
your own rationale and agrees with it, the exact bias `/review-pr` guards against for code.
**Do NOT audit it in this session.** Dispatch an independent review to a fresh process:

```bash
scripts/loop/spec-review.sh <build>
```

That launches `/review-spec` as a separate `claude --effort max` session with no memory of
this conversation. It checks the PRD against the live repo across the intake lenses —
spine reuse, reliability coverage, claims discipline, AC verifiability, scope minimality —
and writes findings to `/tmp/spec-review-<build>.md`. It is **read-only**: it never edits the
PRD.

Run it after Step 3 has written the artifacts; they need not be committed, the reviewer reads
them from the main tree on disk. Do **not** invoke `/review-spec` in THIS session — the fresh
process is the whole point. When it finishes, read `/tmp/spec-review-<build>.md` and carry its
findings into Step 5.

If `spec-review.sh` genuinely cannot run (no nested `claude`, offline), say so and fall back
to a best-effort self-audit against the same lenses — but flag clearly that it was **not**
independent.

## Step 5 — Stop and present [HUMAN CHECKPOINT]

Present to the user:

1. The PRD as written — title, acceptance criteria, phase checklist.
2. **The independent review's findings** from `/tmp/spec-review-<build>.md` — the verdict, then
   the BLOCKERs and SUGGESTIONs — as the open decisions. Attribute them to the fresh
   reviewer, not to yourself; do not quietly overrule a BLOCKER because you disagree.

**Findings do not self-apply — this is the load-bearing rule of the review step.** Drive
every important finding to an explicit decision from the user, then apply the approved calls
**in place** — never silently accept a finding, never silently drop one.

**Do not commit.** Wait for the user's calls on the open decisions. Apply the approved
changes to the PRD in place, in this authoring session — the reviewer left them
untouched by design. Re-present if the changes were material. If a change materially alters
the scope or the reliability story, offer to re-run `spec-review.sh` for a fresh pass — it is
not automatic (a second max-effort review is not free).

## Step 6 — Commit, on approval only

Only once the user has approved:

```bash
git add docs/prds/ <build-name>/
git commit -m "docs(prd): <build-name> — <title>"
```

Single commit. The PRD lives inside the worktree you are in, so there is no cross-tree shuffle
to do — that hazard left with the backlog.

Then tell the user the next command:

```bash
scripts/loop/task-loop.sh <build>
```
