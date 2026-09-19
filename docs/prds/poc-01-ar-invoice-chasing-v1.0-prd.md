# poc-01 · AR invoice chasing — Product Requirements Document (PRD)

> ## ⚠ PARTIALLY SUPERSEDED — read this first (2026-09-19)
>
> Business scope for this build moved on after v1.0 was written. **Where this PRD and the
> private vault task disagree, the task wins**; where either and the vault disagree, the
> vault wins. Known deltas:
>
> - **Named `reckon`, not `poc-01`.** Directory, package and public label all renamed. "poc" is
>   retired as a public word.
> - **The classification taxonomy changed.** v1.0 lists five labels; the labelled fixture set
>   now committed at `reckon/fixtures/` uses **seven**, and 6 of its 72 replies carry two
>   classes at once — so a single pick-one label is wrong for this build. v1.0's "dispute wins"
>   edge-case rule is superseded by that finding.
> - **The number changed.** Reporting is now per-class, ordinary and hard subsets scored
>   separately, plus the share of the system's own errors the confidence gate caught.
> - **A decide layer is named.** TypeSafe's Jev owns the judgments; code owns arithmetic, dates
>   and side effects.
> - **A constraint on the writeup:** it may not assert that Chaser cannot read replies.
>
> - **The phase plan predates the site rebuild merging (2026-09-17).** Its site-deployment
>   phase is largely done; re-read it against reality before planning against it.
>
> The engineering sections below — the six-stage spine, gateway routing, the two-layer spend
> control, reliability primitives — are **not** superseded and remain the reference.


> **Scope note.** This PRD covers one build in the `builds` repo. This repo is public; the
> PRD carries functional and technical spec only. Anything about the practice rather than the
> software is canonical in the private research and is not restated here.

## Requirements Description

### Background

- **What this build is.** The first build on the shelf: a working system on synthetic data, a
  measured number, and a public repo — a labeled experiment rather than an assertion.
- **Why AR invoice chasing.** Strongest independent evidence of any workflow surveyed. 2025 Intuit
  QuickBooks Small Business Late Payments Report (2,000+ US small businesses, Feb 2025): 56% were
  owed money on unpaid invoices, averaging $17.5K per business; 47% carried invoices more than 30
  days overdue. It touches accounting + email + CRM, so the glue code is visibly real engineering,
  and it is legible to every owner in the ICP without explanation.
  Source: the private research vault.
- **Target users — two, deliberately split.** Owners of US commercial-trades firms ($2M–$5M) get
  the hosted sandbox, the demo video, and the plain-words writeup. Engineers, AI-product vendors,
  and agencies get the public repo and the technical writeup. The site carries no audience wording;
  qualification happens on the 15-minute call.
- **Value proposition.** For the reader: evidence that the tedious multi-system grind can be
  handed to an operated system, with a measured before/after they can check themselves.

### Feature Overview

**Core features**

1. **The chase pipeline** — six composed stages from `@builds/shared` implementing reply-aware AR
   chasing over a synthetic commercial-trades ledger: send escalating reminders, read debtor
   replies, tell a promise-to-pay from a dispute, escalate what a human must own, log every
   decision with its reason.
2. **The hosted sandbox** — a public page where a visitor loads the synthetic ledger, clicks run,
   and watches the loop work: reminders drafted, a reply classified, a dispute escalated to a human,
   the audit log filling, the spend counter ticking.
3. **The measured baseline** — the same ledger worked by hand with a stopwatch first, so the demo
   carries a real before/after rather than an assertion.
4. **Two writeups** — plain-words (buyer-facing, with illustrations) and technical (stack, failure
   modes, code walk), as a toggle on one `/builds/[slug]` page.
5. **The demo video** — the plain-words flow narrated over the sandbox, leading with the number.

**Feature boundaries — what is NOT included**

- No connection to any real accounting system, in either direction. Synthetic ledger only.
- No write path to a client ledger; invoices are never auto-marked paid.
- No autonomous escalation to collections. Disputes always route to a human.
- **No email to any visitor-supplied address.** Outbound chases go only to synthetic debtor
  addresses inside the agent's own AgentMail account; a visitor's reply is *injected* into that
  inbox. A public demo must not be usable to email strangers from the practice's domain.
- No multi-tenancy, no per-client configuration layer, no reusable demo-shell abstraction designed
  up front. The shell is extracted from poc-01 after poc-02 needs it, not before.
- No claim of client results anywhere, in any track.

**User scenarios**

- *Owner, 90 seconds, from an inbound link.* Lands on the build page, reads the one-line
  before/after, plays the video, clicks into the sandbox, picks the "we never received this" canned
  reply, sees it escalate to a human with the invoice attached. Books the 15-minute call or leaves.
- *Engineer, from X or the repo.* Reads the technical track, opens the repo, checks how idempotency
  and the spend cap are actually implemented, finds the six-stage spine.
- *AI-product vendor.* Filters `/builds` by tool, finds a real business use case built on their API,
  reshares or reaches out. Upside, never the plan — the reshare premise is unevidenced
  (the private research vault).

### Detailed Requirements

**Input / output**

| Surface | Input | Output |
|---|---|---|
| Pipeline | `RawInput` — a debtor email reply (subject, body, thread id, invoice ref) | `PipelineOutcome` — `acted` (reminder sent / chase paused) or `escalated` (human handoff with context) |
| Extraction (build time) | Synthetic invoice PDFs | Committed JSON fixtures: amounts, dates, terms, line items |
| Sandbox | Ledger selection, `run`, canned reply choice or free-text reply | Streamed step states, drafted reminder bodies, classification + reason, escalation card, audit log rows, spend counter |

**Synthetic ledger — commercial trades, committed as a fixture**

- 12 invoices, **4 overdue**: 15, 35, 60, and 95 days past due. Amounts $1,200–$18,000, net-30.
- Each invoice carries a work-order reference and line items (labor hours, materials, change
  orders) — trades-shaped, so the dispute case is realistic.
- One overdue invoice has a change-order line that seeds the "you billed for 3 units not 2" reply.
- Customers are plausible commercial clients (property managers, general contractors) with
  obviously fictional names. Every record labeled synthetic in the data itself, not just the page.

**Classification taxonomy — the fixed label set**

| Label | Decision | `autoExecutable` |
|---|---|---|
| `promise_to_pay` | Pause the chase until the promised date; log the promise | `true` |
| `dispute` | Stop chasing; escalate to a human with the invoice and thread attached | `false` |
| `already_paid` | Escalate for reconciliation — never auto-mark paid (no ledger write path) | `false` |
| `wrong_recipient` | Stop chasing this address; escalate for a contact correction | `false` |
| `unclear` | Escalate with the thread attached | `false` |

Confidence below threshold forces `unclear` regardless of the predicted label. `runPipeline` in
`shared/src/pipeline/index.ts` already enforces the invariant that `autoExecutable: false` never
reaches `act` — this PRD adds no new mechanism for it.

**Data validation**

- Ledger fixture validated against a typed schema at load; a malformed fixture fails the build.
- Classification returns via structured outputs (`output_config.format` with a JSON schema), so the
  label is schema-valid without a parse-retry loop. Supported on `claude-haiku-4-5`.
- Free-text visitor replies: length-capped, stripped of HTML, rejected if empty. Treated as
  untrusted input — a reply that contains instructions is data to classify, never an instruction to
  follow.

**Edge cases**

- Reply that is both a promise and a dispute ("paying the labor, disputing the parts") → `dispute`
  wins; ambiguity escalates rather than half-acting.
- Out-of-office auto-reply → `unclear`, chase resumes on schedule rather than pausing forever.
- Reply arriving after the invoice was already escalated → no second escalation; appended to the
  existing handoff.
- Two replies on one thread inside the retry window → idempotency key on `(thread, invoice, action)`
  so one reminder is not sent twice.
- Spend cap reached mid-run → the sandbox degrades to a recorded replay with a visible notice, not
  an error page.
- Vendor API down → `withRetry` with backoff; exhausted retries surface as a failed `ActionResult`
  in the audit log, never as a silent success.

## Design Decisions

### Technical Approach

**Architecture choice.** Compose the existing six-stage spine — `extract → classify → decide →
act → escalate → log` — supplying a poc-01 implementation of each stage. No new architecture. The
spine and all four reliability primitives are already written in `shared/`; this build is the first
consumer, and the point of the repo is that build N is a variation, not a new project.

**Only two of six stages call a model.** This is deliberate and is the load-bearing claim of the
technical writeup: `decide` is rules in code, not an LLM, so the action taken on a classified reply
is deterministic and auditable.

| Stage | Implementation | Rationale |
|---|---|---|
| `extract` | Invofox API, **run once at build time**, output committed as fixtures | Per-page vendor charge belongs off the visitor hot path; also makes the demo instant and deterministic |
| `classify` | Model via **Vercel AI Gateway**, `generateObject` + Zod schema | Short input, fixed label set — the shape a small model handles well; schema-validated without a parse-retry loop |
| `decide` | Plain TypeScript rules over `(label, confidence)` | Deterministic, testable, auditable. Never a model. |
| `act` | Model via gateway to draft the reminder body; AgentMail to send | Short generation from invoice fields plus tone rules |
| `escalate` | Template + attached thread/invoice context | No model needed; the human reads the evidence |
| `log` | `AuditLog` append | Every decision with its reason, reviewable |

**Model routing — Vercel AI Gateway, cheap models, founder-directed (2026-09-14).**

All model calls go through **Vercel AI Gateway** via the AI SDK (`ai@^6`). Model choice is a
per-stage config value, not a code decision — one config file maps `classify` and `act` to a slug,
so swapping a model or a provider is a string change.

- **Slug format is `provider/model` with dots for versions** — `anthropic/claude-haiku-4.5`, never
  `anthropic/claude-haiku-4-5`. Gateway slugs lag the first-party model list, so **confirm every
  slug with `gateway.getAvailableModels()` in Phase 1** and commit the enumerated list; do not
  hardcode a slug from any document, including this one.
- **Default: the cheapest capable small model on the gateway at Phase 1.** Anchor for budgeting is
  `anthropic/claude-haiku-4.5` at $1/1M input, $5/1M output — gateway pricing is **zero markup**
  (provider list price), so that number holds. ~$0.0025 per classification, ~$0.005 per full
  sandbox run with one drafted reminder → **~1,000 runs/month at $5**; budgeting $0.01/run for
  retries still leaves ~500. Phase 1 shops the enumerated list for anything cheaper that holds up
  and records the choice.
- **Not first-party API calls, so the model-specific parameter traps do not apply.** No
  `output_config.effort`, no `thinking` config, no per-model prompt-cache minimum to reason about —
  `generateObject` with a Zod schema is the whole interface. This is part of why the gateway is a
  clean fit for a six-stage spine that should not carry provider-specific branching.
- **Accuracy tradeoff, stated.** A small model will be weaker on genuinely ambiguous free-text
  replies. It degrades in the correct direction: low confidence forces `unclear` → escalate, so the
  failure mode is *more human escalations, not more wrong actions*. Escalation rate on custom
  replies is tracked in Phase 3.
- **Escape hatch is now a config change.** If custom-reply classification is visibly weak, point
  only the `classify` stage at a stronger slug and leave `act` on the cheap one. Recorded as a
  variance-log row if used.
- **Provider failover is configured, not hoped for.** `providerOptions.gateway.order` gives a
  provider priority list and `models` a fallback model list, so a provider outage fails over instead
  of breaking the demo. This is real, demo-able reliability engineering at roughly zero cost, and it
  is exactly the kind of thing the technical writeup exists to show.
- **Cost attribution via tags.** Every call carries `tags: ['build:poc-01', 'stage:classify'|'stage:act', 'env:production']`
  so spend is attributable per build and per stage — which is what makes the measured
  cost-per-run acceptance criterion satisfiable and feeds the variance log.
- **Strategic side effect, worth naming.** Varying the model provider across future builds becomes a
  string change, so the founder's "showcase a wide variety of stacks" direction costs nothing per
  build from here. The spine stays stable; the visible surface varies freely.

**Authentication.** Gateway OIDC by default — `vercel link`, enable AI Gateway on the project, then
`vercel env pull .env.local` provisions a short-lived `VERCEL_OIDC_TOKEN` (~24h, auto-refreshed on
deployments). **No per-provider API keys are managed at all.** `AI_GATEWAY_API_KEY` is the static
fallback for CI or non-Vercel execution, and takes priority over the OIDC token when set.

**Spend control — two independent layers.**

| Layer | Mechanism | Role |
|---|---|---|
| Gateway hard spending limit | Dashboard budget; returns **HTTP 402** when exhausted | The real backstop. An application bug cannot spend past it. |
| Gateway per-user rate limits | Dashboard: requests/min, tokens/day, concurrent — keyed on `providerOptions.gateway.user`; returns **429** with `retry-after` | Abuse control. A hashed visitor IP is passed as `user`, so throttling is managed rather than hand-rolled. |
| App-level `SpendCap` | `shared/src/reliability/spend-cap.ts`, fed by the AI SDK `usage` field | Drives the **visible spend counter** in the demo from real token counts, not an estimate, and triggers the graceful replay before 402 is ever hit. |

Both 402 and 429 are caught via `APICallError.isInstance(error)` on `error.statusCode` and degrade to
the recorded replay with a plain notice — never an error page, never a silent fake-live state.

**Gateway response caching on the free-text path.** `providerOptions.gateway.cacheControl` with a
`max-age` keyed on model + prompt + params, so repeated identical custom replies (visitors type the
same things) cost nothing on the second hit. Deliberately **not** used as the determinism mechanism
for the canned path — see below.

**Observability.** Gateway logs carry model, provider, token counts, latency, status, tags, and the
failover chain, and prompt/completion content is **not** logged by default — which suits treating
visitor replies as untrusted input. There is **no programmatic metrics API**: cost measurement comes
from the dashboard, the Vercel logs endpoint, and the per-response `usage` field stored at runtime.

**Key components**

- `reckon/` — stage implementations, ledger fixture, extraction fixtures, tests.
- Sandbox UI — Next.js route rendering streamed step states; server-side route owns all vendor calls.
- Spend gate — `SpendCap` from `shared/`, backed by a persistent counter (not in-memory), checked
  before every model and email call.
- Rate limiter — per-IP, in front of the free-text path only.

**Data storage.** Synthetic ledger and extraction output are committed fixtures. Sandbox run state
is per-session and ephemeral. The spend counter and idempotency keys need a persistent store (KV);
the in-memory implementations in `shared/` are for tests and are explicitly not the production
backend.

**Interface design.** The sandbox's server route exposes: load ledger, start run, inject reply
(canned id or free text), stream events. No vendor key ever reaches the browser. No endpoint accepts
a destination email address.

**Canned replies ship as pre-generated real model outputs**, labeled "recorded run" on the page,
with the live path reserved for "type your own". The original reason was cost; at ~$0.0025/call that
reason is gone, and gateway response caching does not replace it either — a cache expiry means the
next visitor gets a fresh call that could label differently. The surviving reasons are
**determinism and latency** — a buyer-facing demo must
not occasionally mislabel "paying friday". The outputs are genuine model responses captured at build
time, not hand-written, so nothing is fabricated.

### Constraints

**Performance**

- Canned-reply path: renders from fixtures, no model call, sub-second.
- Free-text path: classification returns inside ~3s or the UI shows a working state.
- Whole sandbox run visibly completes inside ~60s — a demo a visitor abandons is not a demo.

**Compatibility**

- TypeScript throughout, Node ≥ 20, pnpm workspace (`builds` monorepo conventions). `ai@^6`.
- Deploy target **Vercel** for poc-01 — fastest path for a Next.js sandbox plus durable workflow.
  Cloudflare Workers + Durable Objects is reserved for poc-02, per the founder's vary-the-visible-
  surface direction.
- Site integration must fit the already-built `/builds/[slug]` page shape (proof strip, video slot,
  plain/technical toggle) without reworking it. The live-demo button is already gated on the shell
  existing.

**Security**

- No per-provider model keys exist at all (gateway OIDC). Invofox and AgentMail keys are
  server-side only and never reach the browser bundle.
- Free-text replies are untrusted data. Prompt-injection content in a reply is classified, never
  obeyed; the classifier's output is schema-constrained to the label set, so a crafted reply cannot
  widen the action space.
- No visitor-supplied email destinations (above). No visitor-triggered writes to anything real.
- Rate limiting on the free-text path is gateway-enforced, keyed on a **hashed** visitor IP passed
  as `providerOptions.gateway.user`. The raw IP is never sent to the gateway or stored.
- Synthetic data only — no real person or firm named anywhere in the fixtures.

**Scalability.** Not a goal. One build, one rotating shelf slot. Clean seams between workflow logic
and per-build config are kept because they are cheap; multi-tenancy and config-driven generality are
deliberately not built, per the "would I build this if the SaaS never existed?" test in
the private research vault.

### Risk Assessment

**Technical risks**

| Risk | Mitigation |
|---|---|
| Small model misclassifies ambiguous replies | Confidence threshold → `unclear` → escalate. Escalation rate tracked in Phase 3; pointing `classify` at a stronger slug is a one-line config change. |
| Public sandbox abused to burn the cap | Gateway hard limit (402) as the backstop an app bug cannot cross, gateway per-user rate limits (429), app-level `SpendCap` for graceful replay, and a canned path that costs nothing. |
| AgentMail pricing unverified | **Open.** The $5 cap covers model spend only. Email send cost must be checked in Phase 1 before the sandbox goes public, and a separate ceiling set if it is not negligible. |
| Sandbox becomes a spam vector | No visitor-supplied destinations; sends confined to the agent's own synthetic addresses. |
| Gateway slug drift — a hardcoded slug stops resolving | Slugs enumerated via `getAvailableModels()` in Phase 1 and committed; a 400 on an unknown model is caught and surfaced, not swallowed. |
| Gateway is an added hop and a dependency above the providers | ~<20ms routing overhead is immaterial against the ~3s classification budget, and the same hop is what supplies provider failover. A gateway outage degrades to the recorded replay. |

**Dependency risks.** Invofox, AgentMail, and Vercel (hosting + gateway) are the external
dependencies. Model providers are explicitly *not* single points of failure — gateway `order` and
`models` fail over between them.
Extraction is pre-computed, so Invofox is only a build-time dependency. AgentMail outage degrades the
sandbox to the recorded replay rather than breaking the page. Vendor capability claims in the tool
research are all **stated**, not verified — this build is the first test of them.

**Schedule.** Phase dates are below. Sequencing against anything outside this repo is tracked
privately and is not restated here.

## Acceptance Criteria

### Functional Acceptance

- [ ] **Ledger fixture** — 12 synthetic trades invoices, 4 overdue at 95/60/35/15 days, typed so a malformed fixture fails `pnpm typecheck`, every record synthetic and labeled as such in the source. Totals **derived** from line items, never stored, so an edit cannot leave a total disagreeing with itself. Evaluated against a fixed `LEDGER_AS_OF` constant — never `Date.now()` — so overdue counts cannot drift with wall-clock time and silently break both the baseline and the recorded outputs.
- [ ] **Customer records carry a mailbox local part, not a full address** — the agent composes the domain from config at runtime, so the fixture format cannot express a recipient outside the agent's own domain. The blast-radius rule enforced in the data model rather than in a comment.
- [ ] **Canned reply fixtures** — one per demonstrated branch, each with an `expectedLabel` assertion so a classification regression fails a test instead of surfacing in front of a buyer.
- [ ] **Baseline measured before any automation exists** — the ledger worked by hand with a stopwatch, per-invoice timings recorded, committed as a dated note in the build directory.
- [ ] **Extraction fixtures** — invoice PDFs parsed once via Invofox, structured output committed, no runtime extraction call on any path.
- [ ] **Pipeline** — all six stages implemented for poc-01 and composed through `runPipeline`.
- [ ] **Classification** — all five labels reachable; each returns a schema-valid object via `generateObject` + Zod; sub-threshold confidence forces `unclear`.
- [ ] **Model config is data, not code** — per-stage slugs live in one config file, verified against the committed `getAvailableModels()` output; no slug hardcoded at a call site.
- [ ] **Provider failover works** — `order` / `models` configured, and a forced primary-provider failure fails over rather than surfacing an error.
- [ ] **The invariant holds under test** — no `Decision` with `autoExecutable: false` ever reaches `act`. Covered by a test that fails if the invariant is removed.
- [ ] **Escalation carries evidence** — the handoff contains the invoice, the thread, the label, and the reason, with no need to re-read the mailbox.
- [ ] **Reliability, each demonstrated by a test** — idempotent sends (no duplicate reminder on retry or redeploy), retry with backoff on vendor failure, an audit row for every decision with its reason, hard stop at the spend cap.
- [ ] **Sandbox, canned path** — four canned replies each produce their recorded classification and correct downstream action, labeled "recorded run", zero model spend.
- [ ] **Sandbox, live path** — a free-text reply is classified live, the decision and reason are shown, and the spend counter increments.
- [ ] **Spend cap degradation** — a simulated gateway **402** and a simulated **429** each produce the recorded replay with a plain notice; neither errors nor silently appears live.
- [ ] **The visible spend counter is real** — driven by accumulated AI SDK `usage` token counts, never an estimate.
- [ ] **No visitor-supplied destination** — no endpoint accepts an email address; verified by reading the route handlers, not only by testing the UI.
- [ ] **Edge cases** — promise+dispute, auto-reply, post-escalation reply, and double-reply-in-window each behave as specified above, each with a test.

### Quality Standards

- [ ] `pnpm typecheck`, `pnpm build`, `pnpm test` all green at the repo root.
- [ ] Test coverage on the six stage implementations and all four reliability paths. Coverage of the sandbox UI is not required.
- [ ] No vendor key or gateway token reachable from the browser bundle — verified by grepping the built output.
- [ ] Free-text input treated as data: a reply containing instruction-shaped text is classified, not obeyed. Covered by a test case.
- [ ] Cost per run measured from gateway logs and stored `usage` values — not estimated — and recorded in the build README, attributable per stage via tags.
- [ ] Built site HTML greps clean for unsourced figures and for any client claim.

### User Acceptance

- [ ] **The number is real and labeled** — before/after present in the build page's numbers strip, sourced from the Phase 1 stopwatch run, labeled synthetic-manual. No projected figure anywhere.
- [ ] **Plain-words writeup** — what this replaces, one before/after illustration, the steps in order, the honest numbers block. Passes the voice file: lowercase, every claim carrying a number or a named thing.
- [ ] **Technical writeup** — named and versioned stack, what breaks and what happens, the code walked at a public commit.
- [ ] **Demo video** — leads with the number, shows one escalation, states the synthetic-data label out loud.
- [ ] **Proof-labeling rule satisfied on every surface** — page, video, repo README: self-built experiment, synthetic data, not a client engagement.
- [ ] **Repo README** complete against `docs/POC-TEMPLATE.md`, including the deliberately-not-doing section.
- [ ] **Variance log** — a row for anything poc-01 needed that the shared spine could not supply as-is.
- [ ] **Founder approval before the merge** (always-ask law). Nothing customer-facing ships without it.

## Execution Phases

### Phase 1: Preparation — ledger, baseline, and the number

**Goal:** the measurable ground truth exists before any automation does.

- [ ] Build the synthetic commercial-trades ledger fixture to the spec above; generate the invoice PDFs from it (input for the one-time Invofox run).
- [ ] **Work the chase by hand with a stopwatch.** Draft each reminder, read each reply, decide promise vs dispute, write each escalation, log each decision. Record minutes elapsed, decisions made, and per-invoice time.
- [ ] Commit the baseline as a dated note. Choose the headline metric — recommended: **human-touch minutes per 10 overdue invoices**, because a real engagement can re-measure exactly that.
- [ ] `vercel link`, enable AI Gateway on the project, `vercel env pull .env.local` to provision `VERCEL_OIDC_TOKEN`.
- [ ] Call `gateway.getAvailableModels()`; commit the enumerated list. Read current per-model prices and the free-credit allowance off the dashboard and record both — no price in this PRD except the Haiku anchor is treated as verified.
- [ ] Pick the cheapest capable slug for `classify` and `act`; write both into the per-stage model config.
- [ ] Set the gateway **hard spending limit** and the per-user rate limits (requests/min, tokens/day, concurrent); confirm 402 and 429 are the observed responses.
- [ ] Configure `order` / `models` failover and the `build:poc-01` tag set.
- [ ] Open Invofox and AgentMail accounts; **verify AgentMail send pricing** and set a separate ceiling if it is not negligible.
- [ ] Run Invofox once over the PDFs; commit the structured output as fixtures.
- [ ] Wire app-level `SpendCap` to a persistent counter fed by AI SDK `usage`, below the gateway limit, with the replay-on-exhaustion path.

**Deliverables:** ledger fixture, extraction fixtures, dated baseline note, gateway configured (models enumerated, budget + rate limits + failover + tags), vendor accounts, working two-layer spend gate, confirmed email cost and gateway prices.
**Time:** 2026-09-14 → 2026-09-17.

### Phase 2: Core Development — the chase pipeline

**Goal:** the workflow runs correctly and survives failure, headless.

- [ ] Implement `extract` (reads fixtures), `classify` (`generateObject` + Zod via gateway), `decide` (rules in code), `act` (draft via gateway + AgentMail send), `escalate`, `log`.
- [ ] Compose through `runPipeline`; add the test that fails if the `autoExecutable` invariant is removed.
- [ ] Idempotency keys on `(thread, invoice, action)`; `withRetry` on every vendor call; `AuditLog` row per decision, recording the model slug and provider actually served.
- [ ] `APICallError` handling for 402 / 429 / 503, each mapped to its degradation path rather than a throw.
- [ ] Tests for all five labels, the confidence threshold, and each of the four edge cases.
- [ ] Measure real cost per classification and per run; record in the README.
- [ ] Prompt-injection test case on the free-text path.

**Deliverables:** working headless pipeline, green test suite, measured per-run cost.
**Time:** 2026-09-17 → 2026-09-21.

### Phase 3: Integration & Testing — the hosted sandbox

**Goal:** a stranger can run it safely, and it cannot be made expensive or abusive.

- [ ] Sandbox UI: ledger load, run, streamed step states, drafted reminder bodies, classification + reason, escalation card, audit log, spend counter.
- [ ] Canned reply path from pre-generated real model outputs, labeled "recorded run".
- [ ] Free-text path live, behind the gateway per-user rate limit and both spend layers, with `cacheControl` set so repeated identical replies are free on the second hit.
- [ ] Reply injection confined to the agent's own AgentMail inbox; confirm no endpoint accepts a destination address.
- [ ] Deploy to Vercel; verify the spend cap and rate limit against the deployed instance, not locally.
- [ ] Adversarial pass: cap exhaustion (402), rate-limit trip (429), provider outage (failover), gateway outage (replay), oversized input, injection-shaped reply.
- [ ] Track escalation rate on custom replies; if visibly weak, point `classify` at a stronger slug in config and log a variance row.

**Deliverables:** live sandbox, adversarial pass recorded, observed escalation rate.
**Time:** 2026-09-22 → 2026-09-26.

### Phase 4: Deployment — content, merge, and the unblock

**Goal:** the build page ships on the site.

- [ ] Write both tracks: plain-words (with the before/after illustration) and technical.
- [ ] Record the demo video leading with the measured number.
- [ ] Set the build's four facet tags (industry · department · tool · status) so `/builds` filters correctly.
- [ ] Land the build page, both writeups, video, and live-demo button on the site.
- [ ] Verify built HTML greps clean for unsourced figures and client claims.
- [ ] **Founder review, then merge** — the merge deploys the build page.
- [ ] Post to X as distribution: the plain track adapted, never a third piece.
- [ ] File the variance log rows and update the repo README.

**Deliverables:** live build page with a working demo.
**Time:** 2026-09-27 → 2026-09-30.

## Success Metrics

- **Primary:** 15-minute conversations booked that are attributable to this build. The initiative
  already names booked conversations as the funnel metric.
- **Gate, scored separately:** shipped on time with both tracks, the video, and the merge done.
  Cadence is the lane's discipline.
- **Logged as upside, never as the score:** vendor reshares, repo interest, X engagement. The
  reshare premise is unevidenced and treated as upside, not plan.

## Open Items

- **AgentMail send pricing** — unverified. Phase 1 blocker before the sandbox is public.
- **Gateway free-credit allowance and current per-model prices** — unverified; the reference consulted
  carried templated placeholder figures, so both are read off the dashboard in Phase 1. Free credits
  may cover the whole $5 budget, in which case the cap is pure safety net.
- **Which slug is actually cheapest** — settled in Phase 1 against `getAvailableModels()`, not now.
- **How many canned replies, and which labels get a button.** Four were previewed. A draft fixture
  set found that `dispute` is worth exercising twice — a delivery problem ("we never received
  this") and a change-order argument ("you billed 3, we approved 2") escalate with very different
  evidence attached — and that `already_paid` ("we paid this in July") is the strongest reliability
  case available, because the system must *not* mark the invoice paid, having no ledger write path
  by design. That is five buttons, leaving `wrong_recipient` reachable only via custom input.
  Recommendation: five buttons, `wrong_recipient` covered by test only — a sixth crowds the demo.
  Founder's call at Phase 3.
- **Escalation rate on free-text replies** — unknown until Phase 3; drives the Haiku-vs-Sonnet call
  on `classify`.
- **Outbound optics** — poc 01 sends automated email on a site that refuses lead-gen, and with the
  not-for row gone the 15-minute call is the only filter. Three options are already recorded in
  the private copy review; the plain-words copy
  should tilt hard to the tedium ("chasing your own overdue invoices"), and the founder's call on
  whether that is enough is still open.
- **`mappingBookingUrl`** — still routes to the free call until the paid-booking mechanism is named.
  Carried on the site side, not resolved by this build.

---

**Document Version**: 1.0
**Created**: 2026-09-14
**Clarification Rounds**: 2 (8 questions) + 2 founder directives (cheap models; Vercel AI Gateway)
**Quality Score**: 96/100
