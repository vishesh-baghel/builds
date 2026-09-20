# reckon · AR inbound reply handling — PRD v1

> **Scope note.** This is the spec for one build in a public repo: functional and technical
> only. The business reasoning behind it — who it is for, what it is worth, what it may claim
> commercially — lives in a private vault and is deliberately not restated here.

Supersedes `poc-01-ar-invoice-chasing-v1.0-prd.md` in full. That document specified a
five-label taxonomy, outbound sending via a mail vendor, and document extraction via an
extraction vendor. All three are out. Read this file, not that one.

## Requirements description

### Background

Chasing unpaid invoices splits into two halves. **Sending the reminder** is a commodity:
QuickBooks Payments AI ships inside an $85/mo plan and Chaser lists $180/mo for firms under
$5M revenue. **Reading the reply** is the other half.

Evidence the workflow is worth automating, publicly citable: the 2025 Intuit QuickBooks Small
Business Late Payments Report (2,000+ US small businesses) found 56% were owed money on unpaid
invoices, averaging $17.5K, and 47% carried invoices more than 30 days overdue.

**Correction, 2026-09-20.** v1 of this PRD stated that Chaser's features page describes
outbound reminders and that inbound reply handling was not listed there. That was checked
against one page and is wrong as a characterisation of the product. Chaser's Gmail and Outlook
integration pages state that *"any replies to these chase emails land directly in your Gmail
inbox while simultaneously being logged within the corresponding customer history in Chaser"*,
and its AI email generator page states that *"The AI reads each debtor's message, detects
intent (promise-to-pay, dispute, document request, etc.), and produces a courteous draft"*.
Intent detection on inbound replies ships today in an incumbent.

The claim this build may make is therefore narrower, and is about the **output**, not the
capability. The incumbent feature produces a draft for a person to send. This build produces a
typed decision that moves chase state, over a closed action enum, with nothing written and
nothing sent, a threshold the operator owns, an audit row per decision, and a published
per-class accuracy figure. Nothing in this repo may assert that Chaser cannot read replies, and
nothing may imply the reading half is unautomated.

**The design frame is retrofit.** Whatever the firm already runs keeps running and keeps
sending. Reckon reads what comes back and updates the chase state. It sends nothing.

### Feature overview

**Core features**

1. **The reply pipeline** — the six stages from `@builds/shared` implementing multi-label
   classification of a debtor reply, a deterministic decision over the resulting class set,
   chase-state transitions and work items as side effects, human escalation as a normal
   outcome, and an audit row for every decision.
2. **The scorecard** — a command that runs the pipeline over the 72 committed replies and
   emits per-class precision and recall, ordinary and hard subsets scored separately, and the
   share of the system's own errors the confidence gate caught.
3. **The sandbox** — a Next.js app on its own deploy, where a visitor picks a committed reply,
   sees the seven probabilities, moves the decision threshold and watches the outcome change,
   and reads the audit log and the live spend counter.

**Feature boundaries — not included**

- **No outbound email. No mail vendor. No email address anywhere in the system.** Reckon
  never sends, drafts or delivers a message.
- **No generative model.** Jev returns typed judgments; code composes every human-readable
  reason string from the class set and the rule that fired. Nothing in this build writes prose.
- **No document extraction vendor.** The ledger is a committed CSV in the shape of a QuickBooks
  A/R Aging Detail export. There are no PDFs to parse.
- **No write path to any ledger, in either direction.** An invoice is never marked paid.
- ~~**No free-text input on the sandbox.**~~ **Reversed 2026-09-20** — see AC #35. Free text is accepted under a length cap, a committed-invoice requirement, a per-visitor allowance and the hard spend cap. Nothing a visitor writes enters the scored set or moves a published figure.
- **No multi-tenancy, no per-client configuration layer, no reusable demo shell.** A second
  build earns those, not this one.

**User scenarios**

- *A visitor on the sandbox.* Picks the reply that says *"Already handled."*, sees
  `claimed_payment` at a probability that does not clear the threshold, watches it route to a
  human for confirmation rather than closing the invoice. Drags the threshold down and watches
  the same reply act automatically — the point being that the policy is theirs and the judgment
  is unchanged.
- *An engineer reading the repo.* Finds one Jev request per reply, a decide stage that is plain
  TypeScript with the five tie-break rules written as code, date arithmetic that belongs to code
  rather than the model, and a test suite that never touches the vendor.

### Detailed requirements

**Input / output**

| Surface | Input | Output |
|---|---|---|
| Pipeline | `RawInput` — one reply record joined to its invoice row | `PipelineOutcome` — the actions applied and, when a human must own it, the escalation |
| `score` command | the 72 committed replies | a dated scorecard file and a run artifact holding every Jev answer |
| Sandbox | a fixture id and a threshold setting | the seven probabilities, the decision, the reason, the audit rows, the spend counter |

**The seven classes** — fixed by the committed fixture set, which is the measurement
instrument and is frozen once a number is published.

| Class | What the reply does | n |
|---|---|---|
| `claimed_payment` | asserts the invoice is already paid | 10 |
| `promise_to_pay` | commits to paying in future | 12 |
| `partial` | pays or is paying part of the balance now | 6 |
| `dispute` | contests the amount, scope, validity or terms | 6 |
| `question` | needs information before it can proceed | 12 |
| `wrong_contact` | is not the right recipient, or redirects | 8 |
| `noise` | carries nothing actionable | 18 |

**Multi-label is the requirement, not an edge case.** 6 of the 72 replies carry two classes at
once — pays part *and* disputes the rest; claims payment *and* offers to reissue. A pick-one
answer manufactures wrong answers on those, so the judgment is **one Noul per class**, not a
Choice across seven.

**Data validation**

- The ledger CSV and the replies JSONL are parsed through a typed loader that validates every
  row at load. A malformed fixture fails `typecheck` or the loader test, never a demo.
- Aging is evaluated against a fixed `LEDGER_AS_OF` constant, never `Date.now()`. Wall-clock
  drift must not silently change the overdue counts or the recorded outputs.
- Reply bodies are untrusted text. They enter Jev `state` and are classified; they are never
  instructions. The action space is a closed enum in code, so nothing a reply says can widen it.

**Edge cases, each with a test**

| Case | Required behaviour |
|---|---|
| Pays part and disputes the remainder | Both classes act. The partial payment is recorded *and* the dispute escalates. Never collapsed to one. |
| Promise with no date | The promise is recorded, the resume date is absent, and it escalates for a human to set one. Code never invents a date. |
| Out-of-office naming a live alternate contact | `wrong_contact`, not `noise` — tie-break rule 3. |
| "Received, thank you" | `noise`, not `claimed_payment` — tie-break rule 4. |
| "Our contract says net 60" | `dispute`, even though no amount is contested — tie-break rule 5. |
| Unsubscribe request | A deterministic code guard raises a stop-contacting item regardless of the class Jev returns. See "The unsubscribe guard". |
| The same reply processed twice | One work item, one state transition. The second run is a no-op. |
| Instruction-shaped reply text | Classified as data. No action outside the enum, no change to the threshold, no escalation suppressed. |

## Design decisions

### Technical approach

**Architecture: compose the existing spine, correct it where it is genuinely wrong.**

| Stage | Implementation | Why |
|---|---|---|
| `extract` | Code. Joins the reply to its invoice row; computes days past due against `LEDGER_AS_OF`; finds **candidate** dates and amounts in the reply text by parsing, not by model. | Arithmetic, dates and lookups belong to code. |
| `classify` | **Jev, one request per reply**, over the same state. | See below. |
| `decide` | Plain TypeScript over the nine answers plus the threshold config. The five tie-break rules from the fixture set are written here as code. | Deterministic, testable without the vendor, and auditable. Never a model. |
| `act` | Applies chase-state transitions and creates work items, each through `once()`. | The only side effects this build has. |
| `escalate` | Builds a handoff carrying the invoice, the full reply, every class probability, and the rule that fired. | A human reads the evidence without re-reading the mailbox. |
| `log` | An `AuditLog` row per stage. | AC #10. |

**The Jev request — one round trip.**

- **Seven Nouls**, one per class, each phrased so a high probability means the class applies.
  Each carries `criteria` with `true`/`false` descriptions drawn from the tie-break rules, so
  the boundary the labeller used is the boundary the model is asked about.
- **Date resolution is component Choices plus code assembly, not candidate selection.** Only 4
  of the 12 `promise_to_pay` replies contain any numeral; the rest say "by Friday", "in the next
  cycle", "give me until Monday", "before month end". There is nothing to select among, so
  selecting is the wrong shape. Following TypeSafe's documented date pattern, Jev answers
  *components* — the anchor kind (explicit day-of-month, named weekday, relative period, none)
  and its value — and **code** assembles the actual date against `LEDGER_AS_OF` and a business
  calendar. When the anchor is `none`, code invents nothing: the promise is recorded without a
  date and escalates for a human to set one.
- **Amount resolution works the same way.** A shape Choice (numeral present / fraction of the
  balance / none) plus its value; code computes "half" against the open balance rather than
  asking the model for arithmetic. Two of the six `partial` replies state the amount only as a
  fraction, so this is required, not defensive.
- Jev does not extract values, does not generate text, and does no arithmetic. It answers
  bounded questions; code assembles.

The exact question set is a design output, not a frozen number — an AC that hardcodes "seven
Nouls and two Choices" would forbid the design from improving without editing the spec.

**The gate, stated correctly.** A Noul answer is a single probability and **carries no separate
confidence value** — the `confidence` property exists on Choice and Score only. So the gate is a
probability band per class, configured in one object:

| Band | Meaning | Behaviour |
|---|---|---|
| `p >= act[class]` | the class applies | its action is auto-executable |
| `review <= p < act[class]` | ambiguous | the class escalates; it does not act |
| `p < review` | the class does not apply | ignored |

Thresholds scale with risk, per TypeSafe's own guidance: `dispute` and `claimed_payment` — the
two classes whose errors cost the most — sit higher than the rest. If **no** class clears its
act threshold, the reply escalates whatever the shape of the distribution. That is AC #8.

**Threshold selection must not be fitted to the number it produces.** Thresholds are swept on
the **51 ordinary replies only**, the chosen values are committed as config, and the published
scorecard reports ordinary and hard subsets separately with the full sweep committed alongside.
Nothing is chosen on the hard subset and then reported against it.

**The unsubscribe guard.** The fixture set records a known gap: a "remove me from this
distribution list" reply is labelled `noise` because none of the seven classes holds it. The
taxonomy stays at seven and the labels stay frozen. A deterministic code guard runs on every
reply and raises a stop-contacting item when the text matches, independent of what Jev returns.
The gap stays recorded in the fixtures README; the system no longer ignores it.

**Three corrections to `@builds/shared`, each a variance-log row.** Reckon is the spine's first
consumer, and three contracts do not survive first contact:

1. `Classified<TLabel>` carries a single `label` and a single `confidence`. A multi-label
   judgment cannot express itself through it. → `Classified` carries the per-class
   probabilities and the asserted set.
2. `PipelineOutcome` is `acted` **or** `escalated`, exclusively. But a dispute must stop the
   chase **and** escalate, and a claimed payment must pause the chase **and** open a
   reconciliation item. → `Decision` carries a list of actions plus an escalate flag, and
   `runPipeline` returns both the results and the optional escalation.

3. **`log` is not a stage at all.** `Pipeline` has five methods, `AuditEntry.stage` is a
   five-value union with no `"log"`, and `runPipeline` takes no `AuditLog` — so the spine
   documents a six-stage pipeline it cannot actually record. → `runPipeline` accepts an
   `AuditLog` and writes a row per stage that ran.

The intended post-change declarations belong in the plan, written as TypeScript rather than
described in prose, so the planner does not re-invent them:

```ts
interface ClassProbability<TLabel extends string> { readonly label: TLabel; readonly probability: number }
interface Classified<TLabel extends string = string> {
  readonly inputId: string;
  readonly probabilities: readonly ClassProbability<TLabel>[];  // every class, always
  readonly asserted: readonly TLabel[];                          // those clearing their threshold
  readonly primary: TLabel | null;                               // highest asserted, null if none
}
interface Decision<TAction extends string = string> {
  readonly inputId: string;
  readonly actions: readonly TAction[];   // auto-executable by construction; may be empty
  readonly escalate: boolean;
  readonly reason: string;
}
type PipelineOutcome = { results: readonly ActionResult[]; escalation?: Escalation };
```

`act` is called once per action and each call carries its own idempotency key, so a decision
that both records a partial payment and opens a dispute cannot half-apply on a retry.

The invariant `runPipeline` exists to enforce is preserved and strengthened: only actions the
decision listed as auto-executable ever reach `act`; anything a human must own goes to
`escalate`. Both changes land in `shared`, not in a Reckon-local fork — a build that defines its
own result type is a finding, not a variation.

**Key components**

- `reckon/src/fixtures/` — typed loader and schema for the CSV and the JSONL.
- `reckon/src/stages/` — the six stage implementations.
- `reckon/src/policy.ts` — thresholds, tie-break rules, the unsubscribe guard. One file, so the
  policy is readable without reading the pipeline.
- `reckon/src/score.ts` — the scorecard harness.
- `reckon/app/` — the Next.js sandbox. Server routes own the Jev key; no key reaches the browser.

**Data storage.** Fixtures and run artifacts are committed files. Chase state and work items are
a per-run store, in-memory in tests and KV on the deploy. The spend counter and the idempotency
store need persistence on the deploy; the in-memory implementations in `shared` are for tests and
are explicitly not the production backend.

**Spend control.** `SpendCap` from `shared`, fed by real token usage, with a hard per-month
ceiling below the shelf-wide budget. On `SpendCapExceededError` the sandbox serves the committed
run artifact — the same file the scorecard produced — behind a visible notice saying it is
replaying a recorded run. Never an error page, never a silent fake-live state. Moving the
threshold slider does **not** spend: the probabilities are unchanged and only the composition
re-runs, which is the whole point of keeping policy in code and judgments reusable.

### Constraints

**Performance.** A live classification returns within ~3s or the UI shows a working state. A
threshold change re-renders without a network call. A full 72-reply scorecard run completes
within one command invocation.

**Compatibility.** TypeScript, ESM, Node >= 20, pnpm workspace. The sandbox lives inside
`reckon/` so the repo keeps one top-level directory per build — but `pnpm-workspace.yaml`
globs `"*"` (top level only) and `reckon/tsconfig.json` covers `src/**/*.ts` with no `jsx` and
no DOM lib, so `.tsx` under `reckon/app/` would be silently skipped by the root typecheck.
Resolution: a second tsconfig for the app and a composite `typecheck` script in
`reckon/package.json` that runs both. The gate must see the UI, not just the engine.

**This build makes the repo gate real.** `test` and `build` are `--if-present` in CI and no
package defines either yet, so a green gate today proves only that the repo typechecks. Reckon
ships the first `test` script and the first `build` script. The PR must say so.

**Security.** The Jev key is server-side only and is verified absent from the built client
bundle by grepping the build output. Reply text is untrusted data throughout. TypeSafe's own
model notes list adversarial steering as a **current** known weakness — crafted text can move
the answer — so every side effect sits behind both the probability gate **and** a closed action
enum in code, never behind the judgment alone. The same notes record that jev-1.13 is weakly
numerically calibrated and that thresholds do not transfer between Noul and Choice, which is
why thresholds are swept per question type on this build's own data rather than borrowed.
No endpoint accepts an email address, and there is no send path to accept one for.

**Scalability.** Not a goal.

### Risk assessment

| Risk | Mitigation |
|---|---|
| Jev misreads the genuinely ambiguous replies | The gate degrades in the correct direction — more escalations, not more wrong actions. The catch rate is published, not hidden. |
| Thresholds overfitted to the instrument | Swept on the ordinary subset only; hard subset reported separately; the full sweep committed. |
| The published accuracy flatters itself on an imbalanced set | Per-class reporting only. No single headline accuracy figure anywhere. |
| A visitor makes the demo expensive | Free text is capped at 1,200 characters and must name a committed invoice; per-visitor monthly allowance; hard spend cap. The fixture path falls back to the committed replay; the free-text path refuses rather than faking a judgment. |
| Vendor rate limits change without notice | `withRetry` on every Jev call; exhausted retries surface as a failed result in the audit log and fall back to the replay. |
| Two `shared` contract changes destabilise the spine | Both are additive to the spine's purpose and covered by tests that fail if the invariant is removed. Both recorded in the variance log. |

## What this build does and does not claim

**No pre-baseline exists, and that is a decision rather than an oversight.** CLAUDE.md warns
that a number quoted without a pre-baselined counterpart is a demo, not a result. The
resolution adopted here is to **make no comparison claim at all**: the published result is the
system's own per-class accuracy on the frozen instrument, which is a measurement of the system
and needs no counterpart. There is no before/after table, no "replaces N hours" claim, and no
machine figure placed beside a human one.

Any human-time figure is a **declared estimate**, lives in one named constant, renders with
the word "estimate" wherever it appears, and never sits in the measured table or next to a
measured figure.

## Acceptance criteria

Every item below is checkable by running a command. Vendor-dependent accuracy is **reported**
by the scorecard; code-deterministic behaviour is **asserted** by tests that inject class
probabilities and never call Jev.

<!-- AC:BEGIN -->

### Functional

- [ ] #1 `pnpm --filter @builds/reckon test` passes, and a loader test asserts all 15 invoice rows and all 72 reply records parse against the typed schema, with aging computed from `LEDGER_AS_OF = 2026-10-11` and not from the clock, matching the committed `Days Past Due` column on every row.
- [ ] #2 A test asserts the classify stage issues exactly one Jev request per reply, that it carries one Noul per class, and that every question the design uses is present — asserted by shape against a recorded vendor response, not by counting questions. The test suite makes no network call.
- [ ] #3 For every reply the pipeline returns an asserted class set drawn from the seven classes and a non-empty reason string naming the rule that fired.
- [ ] #4 A `claimed_payment` decision pauses the chase and opens a reconciliation item, and a test asserts no code path can mark an invoice paid — there is no such action in the enum.
- [ ] #5 A `dispute` decision stops the chase **and** produces an escalation carrying the invoice, the full reply, all seven probabilities, and the reason.
- [ ] #6 A `promise_to_pay` decision resolves the promised date from the component answers via code assembly against `LEDGER_AS_OF`, and pauses the chase until it. A test covers an explicit day-of-month, a named weekday, a relative period, and `none` — and asserts the `none` case records the promise with no date and escalates rather than defaulting one.
- [ ] #7 Reaching a promise's resume date with no payment raises an overdue-promise work item. Tested deterministically by advancing an injected clock, never by waiting.
- [ ] #8 A `partial` decision resolves the amount from the shape answer — numeral, fraction of the open balance computed in code, or none — and a test covers all three, including a reply stating only "half".
- [ ] #9 A reply asserting both `partial` and `dispute` produces both outcomes in one run — the partial recorded and the dispute escalated — asserted over injected probabilities.
- [ ] #10 A `question` decision pauses the chase and escalates for a human to answer, carrying the invoice and the full reply. Chasing someone who is waiting on information is the behaviour this build exists to stop.
- [ ] #11 A `wrong_contact` decision stops chasing that contact and raises a contact-correction item carrying the invoice, the full reply and the asserted class — and explicitly **not** a parsed replacement address, since extraction is out of scope. A test asserts the item names the reply a human must read rather than a value the system guessed.
- [ ] #12 A `noise` decision neither pauses nor advances the chase — **except** where the unsubscribe guard fires. Asserted by comparing chase state before and after, with `r072` named as the exception case.
- [ ] #13 When no class clears its act threshold the reply escalates, whatever the highest probability was; and a class in the review band escalates without acting. Both asserted at the band boundaries.
- [ ] #14 The five tie-break rules from the fixture set are implemented in `policy.ts`, each with a named test referencing the rule number.
- [ ] #15 An unsubscribe-shaped reply raises a stop-contacting item regardless of the class returned, asserted with the class forced to `noise` (`r072`).
- [ ] #16 Running the pipeline twice on the same reply produces one work item and one state transition per action; the second run is a no-op. Asserted through `once()` with the in-memory store, including a decision carrying two actions.
- [ ] #17 Every vendor call is wrapped in `withRetry`, and a test asserts an exhausted retry surfaces as a failed result in the audit log, never as a silent success.
- [ ] #18 The audit log holds one row **per stage that ran**, carrying input id, asserted classes with probabilities, action taken, reason and the rule that fired. Asserted against a committed audit fixture.
- [ ] #19 A test asserts an instruction-shaped reply body is classified as data: no action outside the enum, no threshold change, no suppressed escalation. The adversarial inputs live in a separate fixture file and never enter `replies.jsonl`, which is the frozen scored set.
- [ ] #20 A test fails if the `runPipeline` invariant is removed — an action not listed as auto-executable can never reach `act`.

### The number

- [ ] #21 `pnpm --filter @builds/reckon score` runs the pipeline over all 72 replies and writes a dated scorecard plus a run artifact holding every Jev answer, both committed. `score` requires a vendor key and is therefore **outside** the CI gate; the PRD and the package scripts both say so.
- [ ] #22 The scorecard reports per-class precision and recall with `dispute` and `claimed_payment` first, the 51 ordinary and 21 hard replies scored **separately**, and prints `n` beside every figure. No single headline accuracy figure is produced by the harness.
- [ ] #23 The scorecard publishes, per class, the share acted on automatically and the share escalated, **alongside** the gate catch rate — so a system that escalates everything reads as 100% caught and 0% automated rather than as a success. The error denominator is printed as a count, not only a percentage.
- [ ] #24 The primary-class derivation rule is implemented in `policy.ts` and stated in the scorecard: the highest-probability asserted class, or none when nothing clears its threshold. Multi-label replies are scored against `label` and `also` separately from the strict primary figure.
- [ ] #25 `noise` is excluded from `also` credit, so asserting `noise` on `r053` is not rewarded — tie-break rule 3 requires an actionable redirect to outrank an auto-reply, and AC #14 tests exactly that.
- [ ] #26 The threshold sweep over the ordinary subset is committed alongside the chosen thresholds. `partial`'s threshold is declared rather than swept, with `n = 2 ordinary` and the reason recorded in `policy.ts`.
- [ ] #27 Measured machine time per reply and measured cost per reply, both from real run data, appear in the scorecard.
- [ ] #28 Any human-time figure is a **declared estimate** held in one named constant, rendered with the word "estimate" on every surface, and never placed in the measured table or beside a measured figure. A test asserts the constant's rendered label contains "estimate". No before/after comparison appears on any surface.

### Quality

- [ ] #29 `pnpm -r typecheck && pnpm -r --if-present test && pnpm -r --if-present build` is green at the repo root, with `reckon` supplying the repo's first real `test` and `build` scripts.
- [ ] #30 The sandbox is covered by the gate: `reckon`'s typecheck script spans both the engine sources and the app's `.tsx`, so the root `pnpm -r typecheck` cannot silently skip the UI.
- [ ] #31 The test suite runs with no vendor key present. A test run in a clean environment passes.
- [ ] #32 Grepping the built sandbox bundle finds no Jev key and no vendor token.
- [ ] #33 The repo contains no send path, no mail-transport dependency, and no endpoint parameter that accepts a destination address — verified by reading the route handlers and the dependency manifest, not only the UI. (Contact addresses exist in the fixtures as data; what must not exist is anything able to send to one.)
- [ ] #34 All three `shared` contract changes are recorded as rows in `docs/VARIANCE-LOG.md`.

### Surfaces

- [ ] #35 **Superseded 2026-09-20.** Originally: *the sandbox lets a visitor pick from the committed fixtures only — no free-text input exists in the UI or in any route handler.* A sandbox that only replays committed fixtures reads as hardcoded, and a visitor who believes the demo is faked has learned nothing true. Free text is now in scope. The protection the exclusion stood for is kept and is what this AC now tests: visitor text is length-capped, is rejected unless it names an invoice already in the committed ledger, is never stored, is subject to the same per-visitor allowance and the same hard spend cap, and has **no replay fallback** — a recorded run holds no judgment for unseen text, and inventing one would be the dishonesty the feature exists to disprove. A test asserts each of those.
- [ ] #36 The threshold control changes the outcome without issuing a Jev call, verified by the spend counter not moving.
- [ ] #37 The sandbox captions the probabilities as the model's raw judgment rather than calibrated frequencies, since jev-1.13 is documented as weakly numerically calibrated.
- [ ] #38 A simulated spend-cap exhaustion serves the committed run artifact with a visible replay notice; it neither errors nor appears live.
- [ ] #39 The per-visitor rate limit is enforced and verified against the **deployed** instance, not locally.
- [ ] #40 The deployed sandbox is reachable and runs a full fixture end to end, verified against the deployment.
- [ ] #41 `reckon/README.md` carries the measured numbers, names the stack actually used, and labels the work a self-built experiment on synthetic data with no client results — as does the sandbox page.

<!-- AC:END -->

## Execution phases

### Phase 1 — Contracts and instrument
**Goal:** the spine fits the judgment, and the fixtures load typed.

- [ ] Widen `Classified` in `shared` to carry per-class probabilities and the asserted set; update `Pipeline` and its tests.
- [ ] Widen `Decision` to carry a list of actions plus an escalate flag; make `runPipeline` return both results and escalation; keep the invariant and the test that fails if it is removed.
- [ ] Wire `AuditLog` into `runPipeline` and add `"log"` where the stage union needs it, so the spine can record the pipeline it documents.
- [ ] File all three changes as rows in `docs/VARIANCE-LOG.md`.
- [ ] Add vitest to `reckon` as the repo's first `test` script; confirm the root gate runs it.
- [ ] Typed fixture loader with schema validation for `ar-aging.csv` and `replies.jsonl`; `LEDGER_AS_OF = 2026-10-11`, asserted against the committed `Days Past Due` column on all 15 rows.
- [ ] TypeSafe account, key in the environment only, one live smoke call recorded as the classify test's fixture.

**Deliverables:** corrected spine with green tests, typed loader, first `test` script, recorded vendor response.

### Phase 2 — The judgment and the decision
**Goal:** the workflow runs correctly and survives failure, headless.

- [ ] The single Jev request: one Noul per class with tie-break-derived criteria, plus the date and amount component questions.
- [ ] Code-side date assembly against `LEDGER_AS_OF` and a business calendar, covering explicit day-of-month, named weekday, relative period and none; and amount assembly covering numeral, fraction-of-balance and none.
- [ ] `policy.ts` — per-class thresholds, the three bands, the five tie-break rules, the unsubscribe guard.
- [ ] `decide`, `act`, `escalate`, `log` implemented; chase state and work items; the promise watchdog on an injected clock; `once()` per action; `withRetry` on every vendor call; `SpendCap` wired to real usage.
- [ ] Adversarial fixtures in their own file, deliberately outside the scored 72.
- [ ] The full test suite: every AC in the Functional block above.

**Deliverables:** working headless pipeline, green suite, no network in tests.

### Phase 3 — The number
**Goal:** a figure a stranger can check.

- [ ] Threshold sweep over the 51 ordinary replies; commit the sweep and the chosen thresholds. Declare `partial`'s threshold with its reason — n = 2 ordinary is not a sweep.
- [ ] Full run over all 72; commit the run artifact and the dated scorecard.
- [ ] Per-class precision and recall with `n` beside each, ordinary and hard separately, gate catch rate **with** automation and escalation shares, strict and set-level figures, measured time and cost per reply.
- [ ] Fill `reckon/README.md` with the measured numbers. No before/after table; the human-time estimate sits apart, labelled.

**Deliverables:** committed scorecard and run artifact, README carrying the numbers.

### Phase 4 — The sandbox
**Goal:** a stranger can run it, and cannot make it expensive.

- [ ] Next.js app in `reckon/`: fixture picker, the seven probabilities, threshold control, decision and reason, escalation card, audit log, spend counter.
- [ ] Server-side Jev calls only; per-visitor rate limit; persistent spend counter and idempotency store.
- [ ] Replay-on-cap from the committed run artifact, with the visible notice.
- [ ] Deploy to its own project; verify the cap and the rate limit against the deployed instance, not locally.
- [ ] Adversarial pass against the deployed instance: cap exhaustion, rate-limit trip, vendor outage, oversized input, instruction-shaped fixture from the separate adversarial file.
- [ ] Bundle grep for keys; handler read-through for any destination parameter.

**Deliverables:** live sandbox, adversarial pass recorded, deployed cap verified.

---

**Document version:** 1
**Created:** 2026-09-19
**Supersedes:** `poc-01-ar-invoice-chasing-v1.0-prd.md`
**Clarification rounds:** 2 (8 questions)
**Independent review:** findings applied 2026-09-19. The fresh reviewer's pre-baseline blocker
was resolved by dropping every comparison claim rather than by adding a baseline — recorded
here because the decision, not the omission, is what a later reader needs.
