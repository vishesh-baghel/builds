---
name: review-spec
description: builds repo only. Independently review a build PRD in a fresh session at max effort — spine reuse, reliability coverage, claims discipline, scope minimality, AC verifiability — and emit findings without editing the artifacts. The intake-stage analog of review-pr.
---

# Review spec

The intake-stage analog of `/review-pr`. The rule is the same one that skill states: the
agent that **wrote** the PRD is the wrong agent to review it — in the same session it
re-reads its own rationale and agrees with it. This skill is a real review **only in its own
fresh session**, launched by `scripts/loop/spec-review.sh` (or by spec-intake shelling out to
it) as a separate `claude --effort max` process with no memory of the authoring conversation.

If you are in the session that just WROTE the task/PRD, stop — you cannot review it here.
Let the driver run it fresh:

```bash
scripts/loop/spec-review.sh TASK-<id>
```

Argument: a task ID (`TASK-7`, or `7`).

**This review is read-only.** Do NOT edit the task or PRD, and do NOT commit. Emit findings.
The human decides at the spec-intake checkpoint; the authoring session applies the approved
calls. A reviewer that edits the artifact is laundering its opinion past the human — the very
decision the checkpoint exists to protect.

## Step 0 — Resolve the artifacts, read fresh

- Read the PRD at `docs/prds/<build-name>-*-prd.md` — title, description, all
  `- [ ] #N` acceptance criteria, references.
- Find the PRD from the task's references, or `ls docs/prds/*.md` and match the concept.
  Read it **in full**. A task with no PRD is fine — review the task alone.
- Read `CLAUDE.md`, `docs/POC-TEMPLATE.md`, and the target POC's README if one exists.

You are checking the PRD **against the live repo, not against its own claims.** Where the PRD
asserts a helper exists, a primitive is reused, or a number is N, grep and confirm it.

## Step 1 — Review across independent lenses

Run these as independent passes; do not let one lens anchor the next.

1. **Problem & scope (YAGNI / KISS)** — is the "why" real, and is this the *smallest*
   sufficient change? Flag invented scope, speculative generality, and deferred items that
   should be cut outright rather than deferred.
2. **Spine reuse** — every proposed module, type, or helper must name the incumbent in
   `shared/src/` it maps to, or justify why none fits. A POC defining its own pipeline, its
   own result type, or its own stage contract is a BLOCKER. Verify against the repo, not the
   PRD's description of the repo.
3. **Reliability coverage** — for a build that touches the outside world, check all four:
   idempotency on side-effecting actions, retry on vendor calls, an audit entry per decision,
   a hard spend cap. A missing one is a BLOCKER, not a follow-up. Also check that escalation
   to a human is designed as a normal outcome, not an error path.
4. **Claims discipline** — is there a **pre-baselined** number, measured before the build? Is
   the data synthetic or the author's own? Any client name, client data, or client-derived
   number without documented written consent is an immediate BLOCKER. This repo is public.
5. **AC verifiability** — is each acceptance criterion verifiable by a COMMAND, not opinion?
   They are the loop's stop condition; an evaluator can only judge what a transcript shows.
   "the feature works" is a BLOCKER; "`pnpm --filter <pkg> test` passes and the audit fixture
   shows one entry per decision" is good.
6. **Boundary honesty** — does the PRD say what the build deliberately does NOT do? A build
   that reads as fully autonomous when a human is in the loop is a claims problem later.
7. **Fit to a week** — is this scoped to one build cycle? An honest "this is two builds" at
   intake is worth far more than a stalled branch.

## Step 2 — Verify before reporting

Each finding must point at a specific PRD section or task AC and, where it is a factual claim
about the code, cite the `file:line` you checked. Do not report a lens as a blocker on a
hunch — a review that cries wolf gets ignored. Classify each:

- **BLOCKER** — must be resolved before the human commits (duplicated spine primitive,
  missing reliability primitive, unverifiable AC, any claims-discipline violation).
- **SUGGESTION** — worth the human's consideration, not a gate.

## Step 3 — Emit findings (no edits, no commit)

Your **final message** must be exactly this block, so the driver can extract it from the log
and spec-intake can fold it into the checkpoint. Also write the same block to your session
scratchpad as `spec-review-<id>.md`.

```
===SPEC-REVIEW-FINDINGS-BEGIN===
verdict: BLOCKERS | SUGGESTIONS-ONLY | CLEAN
- [BLOCKER|SUGGESTION] <lens> — <one-line claim> — <PRD § / AC #N / file:line> — <recommended change>
- ...
open-questions-for-human:
- <the single decision spec-intake must put to the human, one per BLOCKER>
===SPEC-REVIEW-FINDINGS-END===
```

Findings most-severe first. If nothing survives verification, `verdict: CLEAN` with an empty
list. Do not edit the task or PRD; do not commit anything.

## After the review — findings are decisions, not edits (for the caller)

This skill only emits findings; it never decides or applies. Whoever runs it — spec-intake,
or the human directly — must **drive every important finding to an explicit human decision,
then apply the approved calls to the task/PRD in place.** The author applies; this reviewer
stays read-only. A finding is never silently accepted and never silently dropped — an
unaddressed BLOCKER with no decision is the same failure as never running the review.
