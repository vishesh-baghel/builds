# builds — working rules

One build a week. Each build automates a piece of messy back-office work for owner-led
service firms, runs on synthetic or my own data, and carries a measured number.

These are the rules the loop skills (`/spec-intake`, `/task-plan`, `/review-pr`, …) audit
against. They describe this repo's engineering spine only. Scope decisions — which workflow
is worth building, who it is for, what the business claim is — are not settled here.

## Layout

```
shared/                 the spine every build plugs into
<build-name>/            one top-level directory per build, named for the build
docs/prds/              PRDs, one per build that needs one
docs/VARIANCE-LOG.md    where a build's reality diverged from its plan
.claude/skills/         the loop: intake -> plan -> implement -> validate -> PR -> review
scripts/loop/           the drivers that chain those stages headlessly
```

## Reuse the spine before writing anything new

Every build composes the same six stages from `shared`:

`extract` → `classify` → `decide` → `act` → `escalate` → `log`

Before proposing a new module, name the incumbent it maps to. `shared/src/pipeline/` owns
stage composition; `shared/src/types.ts` owns the shared shapes. A POC that defines its own
pipeline, its own result type, or its own stage contract is a finding, not a variation.

What legitimately varies per build: the AI product integrated, the deploy target, the system
of record, and the domain logic inside each stage. What does not vary: the stage sequence,
the reliability primitives, and the shape of the audit record.

## The four reliability primitives are not optional

`shared/src/reliability/` ships all four. Every build that touches the outside world uses
every one of them:

- **Idempotency** (`idempotency.ts`) on every side-effecting action. An action that can
  double-send on a retry is a defect regardless of what the demo shows.
- **Retry with backoff** (`retry.ts`) on every vendor API call.
- **Audit log** (`audit-log.ts`) of every decision — input, classification, action taken,
  and why. "The agent decided" with no record is not a decision, it is a guess.
- **Spend cap** (`spend-cap.ts`), hard, per run. A build with no ceiling is not shippable.

A demo that only shows the happy path is not finished. Escalation to a human is a normal
outcome, not an error path — build it as one.

## Claims discipline

This repo is public and its numbers are the whole point, so:

- Every build is a **self-built experiment on synthetic or my own data**. Say so in the
  build's README.
- **No client data, client names, or client results** appear here — ever — unless the client
  has consented in writing and is named as the source.
- A number quoted without a **pre-baselined** counterpart is a demo, not a result. Baseline
  before building, not after. `docs/POC-TEMPLATE.md` has the table.
- Where reality diverged from the plan, it goes in `docs/VARIANCE-LOG.md`. A build whose
  variance log is empty either had no surprises or did not look.

## Acceptance criteria must be verifiable by a command

ACs are the spine of every plan and the stop condition of every loop. An evaluator can only
judge what a transcript shows.

- Good: "`pnpm --filter reckon test` passes, and the audit log fixture
  shows one entry per decision."
- Bad: "the chasing flow works correctly."

Tasks carry them as `- [ ] #N` checkboxes between `<!-- AC:BEGIN -->` / `<!-- AC:END -->`.

## Code

TypeScript throughout, ESM, Node >= 20, pnpm workspaces. No no-code tooling: the glue is code.

- **Write the minimum that satisfies the AC.** No interface with one implementation, no
  factory for one product, no config for a value that never changes, no scaffolding "for
  later". Reuse before you write; stdlib before a dependency; a dependency already installed
  before a new one.
- Never simplify away: input validation at a trust boundary, error handling that prevents
  data loss, secret handling, or anything an AC explicitly requires.
- Secrets come from the environment. Nothing real is committed — `.env.example` only.
- Fixtures over live vendor calls in tests. A test suite that needs a vendor key to run is a
  suite that will not run.

## Gates

```bash
pnpm -r typecheck && pnpm -r --if-present test && pnpm -r --if-present build
```

That is the local gate and the same one CI runs on every PR
(`.github/workflows/ci.yml`). Never push past a red gate; fix it, or say in the PR why it
cannot be fixed here.

**`test` and `build` are `--if-present` because no package defines them yet.** Until a POC
ships a test script, those two steps pass without proving anything — a green gate today means
"it typechecks", no more. The first build to ship tests should say so in its PR. Do not read
green as validated; `/validate-local` Step 4 exists for exactly this gap.

## The loop

`docs/LOOP-RUNBOOK.md` explains how a request becomes a reviewed PR without a human driving
each step. Start at `/spec-intake`.
