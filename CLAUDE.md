# builds, working rules

One build a week. Each build automates a piece of messy back-office work for owner-led
service firms, runs on synthetic or my own data, and carries a measured number.

These are the rules the loop skills (`/spec-intake`, `/task-plan`, `/review-pr`, …) audit
against. They describe this repo's engineering spine only. Scope decisions, which workflow
is worth building, who it is for, what the business claim is, are not settled here.

## This repo is public. Write accordingly.

Peers, vendors and prospective clients read this repo. It documents engineering, and only
engineering. Commercial matters, positioning, pricing, who the work is sold to, how it is
sold, and any internal planning or targets, live in a separate private vault and are not
restated here in any form: not in a PRD, a README, a commit message, a code comment, a
fixture, or a task note. Do not cite the vault by path; say "the private research".

What belongs here: the workflow being automated, its functional requirements,
publicly-citable evidence for why that workflow matters (a named survey, a vendor's own
published page), the measured number and how it was measured, the claim constraints, and all
engineering.

The test before writing anything is not "is this true", it is **"would I be content for a
prospective client to read this?"** If a commercial fact would be needed to justify a
requirement, state the requirement and leave the justification in the vault.

Git history counts: what is written is written. Keep it out in the first place.

## Layout

```
shared/                 the spine every build plugs into
<build-name>/            one top-level directory per build, named for the build
docs/prds/              PRDs, one per build that needs one
docs/VARIANCE-LOG.md    where a build's reality diverged from its plan
reels/                  a short motion piece per build, drawn from its committed run; not a build
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
- **Audit log** (`audit-log.ts`) of every decision, input, classification, action taken,
  and why. "The agent decided" with no record is not a decision, it is a guess.
- **Spend cap** (`spend-cap.ts`), hard, per run. A build with no ceiling is not shippable.

A demo that only shows the happy path is not finished. Escalation to a human is a normal
outcome, not an error path, build it as one.

## Claims discipline

This repo is public and its numbers are the whole point, so:

- Every build is a **self-built experiment on synthetic or my own data**. Say so in the
  build's README.
- **No client data, client names, or client results** appear here, ever, unless the client
  has consented in writing and is named as the source.
- Every figure published anywhere carries a source, or it does not get published.
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

## No em dashes

Do not use em dashes (`-`) or en dashes (`-`) anywhere: not in copy, not in READMEs, not in
PRDs, not in commit messages, not in code comments, not in strings the UI renders. This is a
house style rule and it is absolute, because the alternative is arguing about it case by case.

Use a comma where the clause is an aside, a colon where the second half explains the first, a
semicolon where both halves stand alone, or a full stop where it should have been two sentences
all along. Each of those says something specific; an em dash says only "something goes here".

`,` and `,` count. So does pasting one in from somewhere else.

## Code

TypeScript throughout, ESM, Node >= 20, pnpm workspaces. No no-code tooling: the glue is code.

- **Write the minimum that satisfies the AC.** No interface with one implementation, no
  factory for one product, no config for a value that never changes, no scaffolding "for
  later". Reuse before you write; stdlib before a dependency; a dependency already installed
  before a new one.
- Never simplify away: input validation at a trust boundary, error handling that prevents
  data loss, secret handling, or anything an AC explicitly requires.
- Secrets come from the environment. Nothing real is committed, `.env.example` only.
- Fixtures over live vendor calls in tests. A test suite that needs a vendor key to run is a
  suite that will not run.

## Every UI works on a phone

Most people first open a build's link on a phone. A dashboard that only works at desktop width
is not finished, however good it looks on a laptop. Build responsive from the first commit, not as
a follow-up.

- **No horizontal page scroll at 320px, 375px, 768px or 1280px.** Check each width in Chromium
  with Playwright (`document.documentElement.scrollWidth - innerWidth` is 0) and look at the
  screenshots before calling a UI done.
- **Navigation collapses behind a burger into a drawer** under the build's breakpoint, as reckon's
  bar (`reckon/app/globals.css`, narrow-screen block) and sift's sidebar
  (`sift/app/globals.css`, dashboard shell) do. The drawer is a sibling of any bar with a
  `backdrop-filter`, closes on Escape, on the scrim and on picking a destination.
- **Tables stack on a phone** rather than truncating five columns into unreadable slivers.
- **Tap sizing keys off `(pointer: coarse)`, not width:** 44px for buttons, selects and range
  inputs.
- **Layout lives in CSS classes, not inline styles.** A media query cannot override an inline
  `style`, so anything that must change with width (grid columns, position, display) goes in a
  class.

## Gates

```bash
pnpm -r typecheck && pnpm -r --if-present test && pnpm -r --if-present build
```

That is the local gate and the same one CI runs on every PR
(`.github/workflows/ci.yml`). Never push past a red gate; fix it, or say in the PR why it
cannot be fixed here.

**`test` and `build` are `--if-present` because no package defines them yet.** Until a POC
ships a test script, those two steps pass without proving anything, a green gate today means
"it typechecks", no more. The first build to ship tests should say so in its PR. Do not read
green as validated; `/validate-local` Step 4 exists for exactly this gap.

## Deploys

Each build gets its own Vercel project, configured with **Root Directory** set to the build's
directory and "include source files outside the root directory" left on. That combination is
what makes a workspace build work: framework detection reads the build's own `package.json`,
while the install still sees the repo root, which is the only place `workspace:*` can resolve.

A `vercel.json` at the repo root does not work for this and was tried: with a Root Directory
set, Vercel reads `vercel.json` from inside it, and without one the framework detection looks
at the root `package.json`, finds no framework, and refuses.

Deploy variables are prefixed with the build's name, so one account hosting several builds
never has them reading each other's keys. Each build reads its own environment through a single
module that prefers the prefixed name and falls back to the unprefixed one, so a local clone
keeps whatever names its vendor SDKs already expect.

## The loop

`docs/LOOP-RUNBOOK.md` explains how a request becomes a reviewed PR without a human driving
each step. Start at `/spec-intake`.
