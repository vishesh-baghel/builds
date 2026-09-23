# sift · shared-inbox triage · PRD v1

> **Scope note.** This is the spec for one build in a public repo: functional and technical
> only. The business reasoning behind it (who it is for, what it is worth, what it may claim
> commercially) lives in the private research and is deliberately not restated here.

Sift reads a firm's shared mailbox and, for each message, decides **who it goes to**, **how
urgent it is**, **whether a contractual or regulatory clock has started**, and **drafts a reply
from the firm's own project data**, never sending anything. It is a low-design-risk build
because the judgment is TypeSafe's own published intent-routing pattern applied to a domain
where a missed clock is a liability event, not a late reply.

This build follows Reckon's conventions exactly: the six-stage spine from `@builds/shared`, the
four reliability primitives, a labelled fixture set built **before** the system and frozen once a
number is published, judgments from Jev with the decision in plain TypeScript, no generative
model, and a fixture-only sandbox with no free-text input.

## Requirements description

### Background

Shared-inbox tools already ship AI triage. Missive's three plans list at $14, $24 and $36 per
user/mo billed annually, with AI features requiring your own API key (BYOK) or Missive credits
(missiveapp.com/pricing, accessed 2026-09-21). Front's plans list at $25, $65 and $105 per
seat/mo billed annually, with AI Copilot, Smart QA and Smart CSAT included at the top tier or
sold as add-ons at $10 to $20/seat/mo (front.com/pricing, accessed 2026-09-21). Their triage is
generic: it sorts by sender, keyword and coarse intent. What it does **not** do is reach into
the firm's own project list, RFI and submittal logs, and CRM to judge **firm-specific** urgency
(that an RFI blocks a concrete pour scheduled Thursday, or that a plan-review letter which reads
like a form email has started a 14-day statutory clock), nor pull that live project data into a
drafted reply.

Checkable statement of the gap, in its only defensible form: *Missive and Front ship
AI-assisted triage (their pricing pages, accessed 2026-09-21); reaching a firm's project,
RFI/submittal and CRM context to judge firm-specific urgency and draft with live data is not
part of that.* Nothing in this repo asserts that Missive or Front **cannot** triage a shared
inbox.

**The design frame is retrofit.** Whatever inbox tool the firm already runs keeps running. Sift
adds the firm-context judgment those tools handle only the median way. It routes, labels,
prioritises, detects clocks and drafts, all internal. It sends nothing and writes to no system
of record.

The scene firm is Meridian Architects (invented, never quotable as client work).

### Feature overview

**Core features**

1. **The triage pipeline**: the six stages from `@builds/shared` implementing, per inbound
   message, multi-topic classification by Jev, a deterministic decision in code that derives one
   route, priority and deadline **per topic** from the asserted classes joined to the firm's
   synthetic systems of record, a code-templated draft reply where one is warranted, and an
   owner alert on anything carrying a clock. Nothing is sent.
2. **The scorecard**: a command that runs the pipeline over the committed inbox and emits the
   headline clocked-item catch rate, per-class routing and priority accuracy (ordinary and hard
   subsets scored separately), and the share of the system's own errors the confidence gate
   caught.
3. **The sandbox**: a Next.js app on its own deploy where a visitor picks a committed message,
   sees the topic probabilities and the clock judgment, the derived route, priority and
   deadline, the code-templated draft, moves the decision threshold and watches the outcome
   change, and reads the audit log and the live spend counter.

**Feature boundaries: not included**

- **No auto-send. No mail vendor. No send path anywhere.** Sift drafts replies; a human sends
  them from the tool the firm already runs. There is no endpoint that accepts a destination
  address and nothing to accept one for.
- **No generative model.** Every drafted reply is a fixed template with slots filled from the
  matched system-of-record fixtures; every reason string is composed by code. Nothing in this
  build writes free prose. (This is the founder's 2026-09-21 call: each tool must earn its
  place, and code-templated drafts satisfy the requirement without a second AI dependency.)
- **No write path to any system of record.** The project list, RFI/submittal logs and CRM are
  read-only joins. An RFI is never marked answered, an invoice never marked paid.
- **No document extraction vendor.** Every input is text; there are no PDFs to parse.
- **No free-text input on the sandbox.** The visitor picks from the committed fixtures.
- **No multi-tenancy, no per-firm configuration layer, no reusable demo shell.** A later build
  earns those, not this one.

**User scenarios**

- *A visitor on the sandbox.* Picks the plan-review letter that reads like a form email, sees
  `carries_clock` asserted at a probability that clears its deliberately low threshold, watches
  it raise an owner alert with a 14-day deadline **and** route to the principal, even though its
  topic classification was uncertain. Drags the clock threshold up and watches the alert
  disappear, the point being that the fail-safe direction is theirs to set and the judgment is
  unchanged.
- *An engineer reading the repo.* Finds one Jev request per message, a decide stage that is
  plain TypeScript joining asserted topics to the synthetic project and RFI logs to compute
  firm-specific priority, deadline arithmetic that belongs to code against a fixed
  `INBOX_AS_OF`, drafts assembled from templates rather than generated, and a test suite that
  never touches the vendor.

### Detailed requirements

**Input / output**

| Surface | Input | Output |
|---|---|---|
| Pipeline | `RawInput`: one inbox message joined at extract time to any matching project, RFI, submittal and contact rows | `PipelineOutcome`: one routed/labelled/drafted outcome per asserted topic and, where a human must own it, the escalation |
| `score` command | the committed inbox | a dated scorecard file and a run artifact holding every Jev answer |
| Sandbox | a fixture id and a threshold setting | the topic probabilities, the clock judgment, the derived route/priority/deadline, the draft, the audit rows, the spend counter |

**The topic classes**, fixed by the committed fixture set, which is the measurement instrument
and is frozen once a number is published. Each is a yes/no judgment; a message may assert more
than one (see multi-topic below). Classes come from what the code must do *differently*: if two
classes triggered the same route, priority and action, they would be one class.

| Class | The message | routes to (code-derived) | drafts a reply? |
|---|---|---|---|
| `rfi` | is a contractor request for information (formal, usually blocks work, has a response window) | the project's coordinator | yes: acknowledgement with the logged RFI number and due date |
| `submittal` | is a product/material submittal to review or approve | the reviewing architect | yes: acknowledgement with the review deadline |
| `agency_letter` | is a permit, plan-review, city or regulatory letter | the principal **and** the coordinator | yes: acknowledgement of receipt and the response deadline |
| `invoice` | is a consultant or vendor bill | accounting | no |
| `client_status` | is a client asking about progress, or chasing one | the client's project lead | yes: status pulled live from the submittal/RFI logs |
| `vendor_pitch` | is vendor marketing or unsolicited noise | no one | no |
| `internal` | is internal team correspondence | stays on its thread, low priority | no |
| `other` | is actionable but outside the taxonomy | none; escalates | no |

**The clock judgment is separate from the topic class, on purpose.** A ninth Jev question,
`carries_clock`, asks only whether the message asserts or implies a contractual or regulatory
response deadline, independent of which topic class holds it. This is the instrument's headline.
It exists because AC #4's hardest case is a message **whose surface form looks routine**: an
agency letter that reads like a form email, or an RFI buried in a chatty thread. Separating the
clock judgment from the topic means the clock is caught even when the topic class is uncertain,
and the code corroborates it with a deterministic parse of the message text and a cross-reference
against the RFI log's response windows. Its threshold is set low deliberately: on a clock, a
false alarm costs a human a glance, a miss costs a deadline.

`carries_clock` is a label in the classification vocabulary, so it rides the widened
`Classified.probabilities`/`asserted` that Reckon already put in `shared` and reaches the audit
log through the existing classify writer, needing no new shared contract. Code treats it as a
**signal, not a routable topic**: it never appears in the topic fan-out that produces routes and
drafts; it only drives the clock corroboration and the owner alert. That keeps the "no new
`shared` change" claim true and stops the clock judgment from being mistaken for a ninth route.

**Multi-topic is the requirement, not an edge case.** A real thread carries more than one topic:
a client email that chases a submittal status **and** raises a new RFI; an agency letter that
also requests a resubmittal. Each asserted topic produces its **own** route, priority, deadline,
reason and action. A pick-one classifier manufactures wrong answers on these, so the judgment is
**one Noul per topic class**, not a Choice across the eight. This is the same finding Reckon
reached for its debtor replies, here generalised so the multiple outcomes route to different
people.

**Priority is firm-specific and computed in code, not read from the message.** This is the seam
the whole build rests on: urgency depends on the firm's own state, not on the words in the
email. Levels are `urgent`, `high`, `normal`, `low`, derived deterministically from the asserted
topic joined to the systems of record: a clock whose deadline is near `INBOX_AS_OF`; an RFI or
submittal matched to a project with a scheduled activity inside its blocking window; a client
status chase that the CRM/thread history shows is a repeat. Jev classifies the topic and detects
the clock; **code** computes the priority from the project data. A message with no matching
project cannot be assigned firm-specific urgency and takes a base priority from its class alone.

**Data validation**

- The inbox JSONL and every system-of-record CSV are parsed through a typed loader that
  validates each row at load. A malformed fixture fails `typecheck` or the loader test, never a
  demo.
- All clock and deadline arithmetic is evaluated against a fixed `INBOX_AS_OF` constant, never
  `Date.now()`. Wall-clock drift must not silently change which items are urgent or the recorded
  outputs.
- Message bodies are untrusted text. They enter Jev `state` and are classified; they are never
  instructions. The route set, the priority levels and the action space are closed enums in
  code, so nothing a message says can widen them, redirect a route, suppress an escalation or
  move a threshold.

**Edge cases, each with a test**

| Case | Required behaviour |
|---|---|
| Plan-review letter that reads like a form email | `carries_clock` fires and an owner alert with the response deadline is raised, even when the `agency_letter` topic probability is modest. The clock is caught on the clock judgment, not on the topic. |
| RFI matched to a project with a pour scheduled inside its response window | Priority is `urgent`, derived in code from the project schedule fixture, not from any urgency word in the message. |
| One message chasing a submittal status **and** raising a new RFI | Two outcomes in one run: a status draft to the project lead **and** an RFI route to the coordinator. Never collapsed to one route. |
| Clock implied but not datable ("respond promptly per the enclosed") | The clock is flagged and the item escalates for a human to set the date. Code never invents a deadline. |
| Vendor marketing email | `vendor_pitch`: labelled noise, routed to no one, not escalated. Asserted by comparing state before and after. |
| Nothing clears its threshold | The message escalates to a human whatever the highest probability was. |
| The same message processed twice | One route record, one alert, one draft per topic. The second run is a no-op. |
| Instruction-shaped message text | Classified as data. No route outside the enum, no threshold change, no suppressed alert, no draft content taken from the injected text. |

## Design decisions

### Technical approach

**Architecture: compose the existing spine. Reuse Reckon's spine corrections; do not re-fork
them.** Reckon is the spine's first consumer and already widened three `@builds/shared`
contracts (see *Spine dependency* below). Sift builds on those.

| Stage | Implementation | Why |
|---|---|---|
| `extract` | Code. Joins the message to any matching project, RFI, submittal and contact rows by subject tokens, referenced numbers and sender; parses candidate deadline language; computes clock windows against `INBOX_AS_OF`. | Matching, arithmetic and lookups belong to code. |
| `classify` | **Jev, one request per message**: one Noul per topic class plus the `carries_clock` Noul, over the same state. | See below. |
| `decide` | Plain TypeScript over the topic probabilities, the clock judgment, the thresholds and the joined system-of-record rows. Derives one route, priority and deadline **per asserted topic**; selects the draft template; composes every reason string. | Deterministic, testable without the vendor, and auditable. Never a model. |
| `act` | Records the routing/label, creates the draft artifact, raises the owner alert, each per topic, each through `once()`. No external send, no system-of-record write. | The only side effects this build has, and all internal. |
| `escalate` | Builds a handoff carrying the message, the matched project rows, every topic probability, the clock judgment, the derived priority and the reason. | A human acts without re-reading the mailbox. |
| `log` | An `AuditLog` row per stage that ran. | AC #13. |

**The Jev request: one round trip.**

- **One Noul per topic class**, each phrased so a high probability means the class applies,
  each carrying `criteria` with `true`/`false` descriptions drawn from the fixture tie-break
  rules, so the boundary the labeller used is the boundary the model is asked about.
- **One `carries_clock` Noul**, phrased on the clock alone and independent of topic.
- Jev does not route, does not compute priority, does not resolve dates, and does not write
  prose. It answers bounded yes/no questions; **code** derives route, priority and deadline from
  the answers joined to the firm's data, and **code** assembles the draft from a template.

The exact question set is a design output, not a frozen number: an AC that hardcoded "eight
Nouls plus a clock Noul" would forbid the design from improving without editing the spec. What
is fixed is the shape: one bounded judgment per class, multi-label, plus the separated clock
judgment.

**The gate.** A Noul answer is a single probability and carries no separate confidence value,
so the gate is a probability band per class, configured in one object, exactly as in Reckon:

| Band | Meaning | Behaviour |
|---|---|---|
| `p >= act[class]` | the class applies | its outcome (route/label/draft) is auto-executable |
| `review <= p < act[class]` | ambiguous | the topic escalates; it does not act |
| `p < review` | the class does not apply | ignored |

Thresholds scale with risk. `carries_clock` sits **low**: a missed clock is the failure this
build exists to prevent, so the gate is tuned to over-alert rather than under-alert. If no topic
clears its act threshold, the message escalates whatever the shape of the distribution. That is
AC #7.

**Threshold selection must not be fitted to the number it produces.** Thresholds are swept on
the **ordinary** subset only, the chosen values are committed as config, and the published
scorecard reports ordinary and hard subsets separately with the full sweep committed alongside.
Nothing is chosen on the hard subset and then reported against it. Any class too sparse to sweep
has its threshold **declared** with its `n` and reason recorded in `policy.ts`, as Reckon did
for `partial`.

**The draft is code, not generation.** Each drafting class has one template with named slots.
`decide` fills the slots from the matched system-of-record rows (the RFI number and logged due
date, the submittal's current review status, the project name and the responsible contact), and
refuses to draft when a required slot has no match, escalating instead. The message body is never
copied into the draft, so no untrusted text can reach the output as prose. This is the
prompt-injection guard for the draft surface (AC #9).

**Spine dependency: satisfied.** Sift's Phase 1 depended on three spine corrections landing on
`main`: `Classified` carrying per-class probabilities and the asserted set; `Decision` carrying a
list of actions plus an escalate flag; `runPipeline` taking an `AuditLog` and writing a row per
stage. Reckon merged to `main` on 2026-09-21 (PRs #1 to #6), so all three are now live in
`shared/src/types.ts` and `shared/src/pipeline/index.ts`. Sift builds on them directly and does
not re-fork the contracts in `sift/`.

Sift needs one thing Reckon did not: each outcome must carry its **own** route, priority,
deadline and reason, because one message fans out to several people, while `shared`'s
`Decision.actions` is a flat list of strings (`TAction extends string`, `shared/src/types.ts`).
`shared` itself builds no idempotency key; Reckon's own `act` does, by string interpolation
(`` `${inputId}:${action}` ``, `reckon/src/pipeline.ts`). Widening the shared action to an object
would push an `[object Object]` into any such key a consumer builds and would fight the
`TAction extends string` constraint. So Sift follows **Reckon's own precedent**
(`reckon/src/pipeline.ts`, `plan.effects`): a **Sift-local plan object** holds the per-topic
route, priority, deadline and reason, keyed by a **topic-qualified action string** (for example
`route:rfi`), so two asserted topics never dedupe through `runPipeline`'s
`new Set(decision.actions)`, and Sift builds its own `` `${inputId}:${action}` `` key from that
string. `shared`'s `Decision`, `ActionResult` and the `TAction extends string` constraint are
left untouched. This is domain logic inside the stages, which CLAUDE.md permits, not a
build-local *result type*, which it forbids. Because the per-topic detail lives in Sift's plan
and not in `shared`, this build introduces **no new `shared` contract change** and files no
variance-log row of its own beyond inheriting Reckon's.

**Key components**

- `sift/src/fixtures/`: typed loader and schema for the inbox JSONL and every system-of-record
  CSV.
- `sift/src/stages/`: the six stage implementations.
- `sift/src/policy.ts`: thresholds, the bands, the route map, the priority rules, the clock
  corroboration, the draft templates. One file, so the policy is readable without reading the
  pipeline.
- `sift/src/score.ts`: the scorecard harness.
- `sift/app/`: the Next.js sandbox. Server routes own the Jev key; no key reaches the browser.

**Data storage.** Fixtures and run artifacts are committed files. Routing records, labels,
alerts and drafts are a per-run store, in-memory in tests and KV on the deploy. The idempotency
store needs persistence on the deploy; the in-memory implementations in `shared` are for tests
and are explicitly not the production backend. Following Reckon's measured finding
(`docs/VARIANCE-LOG.md`, 2026-09-20: a single judgment costs a small fraction of a cent, so a
dollar buys tens of thousands of calls), a **per-instance** ceiling is enough for this build; a
shared cross-instance counter is not re-litigated here.

**Spend control has two layers.** First, `SpendCap` from `shared`, fed by real token usage, is a
**hard per-run ceiling**, the primitive's window as CLAUDE.md states it: `guard()` refuses a call
that would cross the ceiling **before** it spends, raising `SpendCapExceededError`. Second, the
deploy enforces a **per-instance ceiling of at most 500 live Jev classifications per rolling 24
hours**, a technical guardrail keeping the public demo within the shelf-wide budget without a
cross-instance counter. On either limit the sandbox serves the committed run artifact behind a
visible notice saying it is replaying a recorded run. Never an error page, never a silent
fake-live state. Both the per-run cap behaviour and the per-instance ceiling are verified against
the deployed instance (AC #35, #36), not only in a unit test.

**How the sandbox spends: live per pick, not replay.** Picking a committed fixture issues **one
live, capped Jev classification**, and that call is what the visible spend counter measures.
Moving the threshold slider afterwards does **not** spend: the probabilities are unchanged and
only the code composition re-runs, which is the whole point of keeping policy in code and
judgments reusable. The committed run artifact from `score` is the replay served when a ceiling
is reached, not the sandbox's normal source. The prompt-injection hole stays closed because the
visitor can only pick a committed fixture; there is no free-text input for the live call to
consume.

### The measurement instrument

Per the fixture-first protocol Reckon established (recorded in the private research), the
labelled set is authored **before** the system and frozen once the number is published. For Sift
the instrument is a synthetic shared inbox plus the synthetic systems of record it is judged
against.

- `inbox.jsonl`: hand-labelled messages at a deliberately imbalanced, real-inbox distribution
  (mostly noise). Each record carries `id`, `from`, `subject`, `body`, `received_at`, the
  asserted `topics` (array), the correct `route` (array), `priority`, `deadline` (nullable),
  `clocked` (bool), the matched `project` key (nullable), `hard` (bool) and a `note` on hard
  cases.
- Systems of record, shaped like real exports, contents synthetic, frozen with the inbox:
  `projects.csv` (with schedule milestones such as the next pour date, which is what makes
  firm-specific priority computable), `rfi-log.csv` (open RFIs and their response windows),
  `submittal-log.csv` (open submittals and review status), `contacts.csv` (the CRM: who holds
  which role on which project).

**Distribution and the size floors, set in Phase 1 and frozen at the commit.** The set must be
large enough that its numbers are measurements, not anecdotes. Reckon needed 72 replies for 7
classes and still had to *declare* rather than sweep its sparsest class (`partial`, n=2
ordinary); Sift carries 8 topic classes plus the separate clock judgment, so a naive ~60
messages would strand most classes at n=2 to 5. Two floors are therefore binding before the
freeze:

- **The clocked subset (the headline's denominator) is at least 12 messages**, split across
  routine-looking and overt clocks, so the clocked-item catch rate is reported on a real `n`.
- **Every topic class has at least 6 ordinary examples** (matching Reckon's smallest *swept*
  class), or its threshold is **declared** rather than swept with its `n` and reason recorded in
  `policy.ts`, as Reckon did, never swept on a handful and then reported against it.

The total is whatever meets both floors, expected to land **above 60, likely 80 to 100**, with
noise still the plurality and roughly a third flagged `hard`. The required boundary types are
fixed regardless of counts: clocked items disguised as routine, multi-topic threads, repeat
client chases, and at least one clock that is implied but not datable. The taxonomy, the
tie-break rules and the exact counts are committed and frozen in Phase 1; they are not adjusted
after a number is published.

### The number

Resolved with the founder (2026-09-21): **Reckon-consistent, no before/after comparison.** No
baseline was measured before this build against a firm's real inbox, so no comparison would be
honest. What is published is the system's own performance on the frozen instrument.

- **Headline: the clocked-item catch rate.** Of every message carrying a real clock, the share
  the system flagged with an owner alert, reported with `n`. The point is not that the model
  reads every email perfectly, it is that a clock does not slip past unseen.
- **Its counterpart, printed beside it: the false-alarm rate on unclocked messages, and the
  automation-vs-escalation share.** The clock gate is deliberately tuned to over-alert, so a
  system that alerted on *everything* would post a 100% catch rate. Publishing the false-alarm
  count on the unclocked subset, and how much the system acted on automatically versus escalated,
  is what stops the headline from flattering itself, the same guard Reckon's scorecard prints for
  its escalation rate. Neither figure is optional; the headline is not published without them.
- **Per-class routing accuracy and priority accuracy**, ordinary and hard subsets scored
  **separately**, with `n` beside every figure. No single headline accuracy number.
- **The confidence-gate catch rate**: the share of the system's own errors the gate sent to a
  human instead of acting on.
- **Measured machine time and cost per message**, from real run data.
- Any human-time figure is a **declared estimate**: held in one named constant, rendered with
  the word "estimate" on every surface, and never placed in the measured table or beside a
  measured figure. There is no before/after table on any surface.

### Constraints

**Performance.** A live classification returns within ~3s or the UI shows a working state. A
threshold change re-renders without a network call. A full scorecard run completes within one
command invocation.

**Compatibility.** TypeScript, ESM, Node >= 20, pnpm workspace. The sandbox lives inside
`sift/` so the repo keeps one top-level directory per build; as in Reckon, a second tsconfig
covers the app's `.tsx` and a composite `typecheck` script in `sift/package.json` runs both, so
the root `pnpm -r typecheck` cannot silently skip the UI.

**Security.** The Jev key is server-side only and verified absent from the built client bundle
by grepping the build output. Message text is untrusted data throughout. TypeSafe's own model
notes list adversarial steering as a current known weakness, so every side effect sits behind
both the probability gate **and** a closed enum in code (routes, priority levels and actions are
all closed), never behind the judgment alone. Drafts are code-templated so no message text
reaches the output as prose. No endpoint accepts a destination address and there is no send path
to accept one for.

**Scalability.** Not a goal.

### Risk assessment

| Risk | Mitigation |
|---|---|
| A clocked item reads as routine and is missed | The clock judgment is separate from the topic and its threshold is deliberately low; code corroborates with a deadline parse and an RFI-log cross-reference; the catch rate is the published headline, not hidden. |
| Firm-specific priority is really just keyword urgency in disguise | Priority is computed in code from the project schedule and RFI-log joins, never from message words; a test asserts the same message text yields different priority under different project data. |
| Multi-topic threads collapsed to one route | One Noul per topic; each asserted topic produces its own outcome; a test asserts two routes from one message. |
| Thresholds overfitted to the instrument | Swept on the ordinary subset only; hard subset reported separately; the full sweep committed. |
| A drafted reply leaks untrusted text or is sent | Drafts are fixed templates filled from system-of-record fixtures, never from the message body; there is no send path at all. |
| A visitor makes the demo expensive | Fixture picker only, no free text; per-visitor rate limit; hard spend cap with a committed replay behind it. |
| The per-topic outcome shape destabilises the spine | Per-topic route/priority/deadline/reason live in a Sift-local plan keyed by the string action (Reckon's own proven pattern, `plan.effects`), so `shared`'s `Decision`, `ActionResult` and the string idempotency key are untouched and no shared contract changes. |

## What this build does and does not claim

- A **self-built experiment on synthetic data**, labelled as such on every surface. No client
  data, names or results appear anywhere.
- The published numbers are the system's own performance on the frozen instrument. **No
  before/after claim**, no "replaces N minutes" figure set beside a measured one.
- On the incumbents, only the checkable form: *Missive and Front ship AI-assisted triage;
  reaching a firm's project, RFI/submittal and CRM context to judge firm-specific urgency and
  draft with live data is not part of that, as of 2026-09-21.* Nothing asserts they cannot
  triage.

## Acceptance criteria

Every item below is checkable by running a command. Vendor-dependent accuracy is **reported** by
the scorecard; code-deterministic behaviour is **asserted** by tests that inject topic
probabilities and never call Jev.

<!-- AC:BEGIN -->

### Functional

- [x] #1 `pnpm --filter @builds/sift test` passes, and a loader test asserts every inbox record and every system-of-record row parses against the typed schema, with all clock/deadline arithmetic computed from `INBOX_AS_OF` and not from the clock, matching the committed `deadline` field on every clocked row.
- [x] #2 A test asserts the classify stage issues **exactly one Jev request per message**, carrying one Noul per topic class plus the `carries_clock` Noul, and that every question the design uses is present, asserted by **shape against a recorded vendor response**, not by counting. The test suite makes no network call. (The published cost-per-message figure depends on this being one request, not nine.)
- [x] #3 For an inbound message the pipeline assigns a route, a priority level and a deadline where one is present, each with a non-empty reason string naming the rule that fired. Asserted over injected probabilities across the topic classes.
- [x] #4 A message carrying a contractual or regulatory clock raises an owner alert with the deadline **even when its topic probability is modest**, asserted with the `agency_letter` probability held below its act threshold while `carries_clock` clears its low threshold, so the alert fires on the clock judgment, not the topic.
- [x] #5 The clock is corroborated in code: a test asserts an owner alert also fires when the deterministic deadline parse or the RFI-log cross-reference finds a clock the model missed, and that a clock implied but not datable escalates for a human to set the date rather than defaulting one.
- [x] #6 Priority is firm-specific and computed in code: a test asserts the **same** message text yields `urgent` when the matched project has a scheduled activity inside the response window and a lower priority when it does not, proving priority is not read from the message.
- [x] #7 Below the act threshold a topic escalates without acting, and when no topic clears its threshold the whole message escalates whatever the highest probability was. Both asserted at the band boundaries.
- [x] #8 A message asserting two topics produces two outcomes in one run: two routes, each with its own priority, deadline and reason held in the Sift-local plan. The plan is keyed by a topic-qualified action string (for example `route:rfi` and `route:submittal`), so `runPipeline`'s `new Set(decision.actions)` cannot dedupe two topics into one `act` call. Asserted over injected probabilities, and never collapsed to a single route.
- [x] #9 A matched drafting-class message produces a draft assembled from a fixed template with slots filled from the matched system-of-record rows; a test asserts the draft contains the looked-up values, is never auto-sent (there is no send path in the route handlers or the dependency manifest), and takes no text from the message body, so instruction-shaped body text cannot reach the draft.
- [x] #10 A `vendor_pitch` message is labelled noise, routed to no one and not escalated, asserted by comparing routing state before and after.
- [x] #11 Running the pipeline twice on the same message produces one route record, one alert and one draft per topic; the second run is a no-op. Asserted through `once()` with the in-memory store, including a multi-topic message whose two actions produce two distinct topic-qualified string idempotency keys.
- [x] #12 Every vendor call is wrapped in `withRetry`, and a test asserts an exhausted retry surfaces as a failed result in the audit log, never as a silent success.
- [ ] #13 The audit log holds one row **per stage that ran, and one per action acted** (multi-topic fan-out writes one `act` row per topic, matching the committed audit fixture), each row carrying input id, topic probabilities, the clock judgment, the derived route, priority and deadline, the action taken and the reason. *Open, 2026-09-23: rows exist per stage and per action, but do not carry the clock judgment, route, priority or deadline, and there is no committed audit fixture.*
- [x] #14 A test asserts an instruction-shaped message body is classified as data: no route outside the enum, no priority outside the levels, no threshold change, no suppressed escalation. The adversarial inputs live in a separate fixture file and never enter `inbox.jsonl`, which is the frozen scored set.
- [x] #15 A test fails if the `runPipeline` invariant is removed: an outcome not listed as auto-executable can never reach `act`.

### The number

- [x] #16 A loader test fails when the committed inbox misses either size floor: the `clocked` subset holds fewer than 12 messages, or any topic class holds fewer than 6 ordinary examples without its threshold being declared (rather than swept) in `policy.ts` with its `n` and reason. The instrument cannot freeze below its floors.
- [x] #17 `pnpm --filter @builds/sift score` runs the pipeline over the committed inbox and writes a dated scorecard plus a run artifact holding every Jev answer, both committed. `score` requires a vendor key and is therefore **outside** the CI gate; the PRD and the package scripts both say so.
- [x] #18 The scorecard reports the **clocked-item catch rate** as the headline, with `n`: of all messages labelled `clocked`, the share the system flagged with an owner alert.
- [x] #19 The scorecard prints, **beside the headline and never without it**, the false-alarm count and rate on the unclocked subset (with that `n`) and the automation-vs-escalation share, so a system that alerted on every message reads as high false-alarm and low automation rather than as a 100% success. A test asserts the harness does not emit the catch rate without both counterparts present.
- [x] #20 The scorecard reports per-class routing accuracy and priority accuracy, the ordinary and hard subsets scored **separately**, with `n` beside every figure. No single headline accuracy figure is produced by the harness.
- [x] #21 The scorecard reports the confidence-gate catch rate, the share of the system's own errors sent to a human, with the error denominator printed as a count, not only a percentage.
- [x] #22 The threshold sweep over the ordinary subset is committed alongside the chosen thresholds; any class below the ordinary floor has its threshold **declared** with its `n` and reason recorded in `policy.ts`.
- [x] #23 Measured machine time per message and measured cost per message, both from real run data, appear in the scorecard.
- [x] #24 Any human-time figure is a **declared estimate** held in one named constant, rendered with the word "estimate" on every surface, and never placed in the measured table or beside a measured figure. A test asserts the constant's rendered label contains "estimate". No before/after comparison appears on any surface.

### Quality

- [x] #25 `pnpm -r typecheck && pnpm -r --if-present test && pnpm -r --if-present build` is green at the repo root.
- [x] #26 The sandbox is covered by the gate: `sift`'s typecheck script spans both the engine sources and the app's `.tsx`, so the root `pnpm -r typecheck` cannot silently skip the UI.
- [x] #27 The test suite runs with no vendor key present. A test run in a clean environment passes.
- [x] #28 Grepping the built sandbox bundle finds no Jev key and no vendor token.
- [x] #29 The no-send-path boundary is checked by command, not by reading: grepping the dependency manifest for mail transports (`nodemailer`, `resend`, `@sendgrid`, `postmark`, `mailgun`) returns nothing, and grepping the route handlers for a destination-address or free-message-body request parameter returns nothing. (Contact addresses exist in the fixtures as data; what must not exist is anything able to send to one.)
- [x] #30 A test asserts `SpendCap.guard()` **refuses before spending**: when the estimated cost would cross the per-run ceiling it raises `SpendCapExceededError` and the wrapped vendor call is never made (asserted with a spy that records zero invocations).
- [x] #31 No type declared in `sift/` duplicates `Classified`, `Decision`, `ActionResult` or `PipelineOutcome` from `@builds/shared`, checked by `grep -rnE "(interface|type) +(Classified|Decision|ActionResult|PipelineOutcome)\b" sift/src` returning nothing. Sift's own domain vocabulary (topic classes, routes, priority levels, fixture-row types, and the per-topic plan) is expected and permitted as stage-local domain logic; the per-topic plan is keyed by the string action and introduces **no** `@builds/shared` contract change, so this build files no variance-log row of its own beyond inheriting Reckon's.

### Surfaces

- [x] #32 The sandbox exposes only a fixture-id selector, checked by command: grepping the UI and the route handlers finds no free-text input, no `textarea`, and no free-message-body request parameter, and no field accepts a visitor-supplied address.
- [ ] #33 Picking a fixture issues **one live, capped Jev classification** and the visible spend counter advances by that call; **moving the threshold afterwards issues no further Jev call** and the counter does not advance. Both asserted against the deployed instance. *Open, 2026-09-23: one live call on pick and none on a dial move are verified locally, in the browser; not yet against the deployed instance.*
- [x] #34 The sandbox captions the probabilities as the model's raw judgment rather than calibrated frequencies, since jev-1.13 is documented as weakly numerically calibrated.
- [x] #35 A simulated per-run spend-cap exhaustion serves the committed run artifact with a visible replay notice; it neither errors nor appears live.
- [ ] #36 The deploy enforces a **per-instance ceiling of at most 500 live Jev classifications per rolling 24 hours** (a technical guardrail, not a commercial figure), and exhausting it against the **deployed** instance serves the committed replay behind the visible notice rather than an error or an uncapped live call. Verified against the deployment, not locally. *Open, 2026-09-23: built and tested, but held per instance on the deploy (no Turso); see the variance log.*
- [ ] #37 The per-visitor rate limit is enforced and verified against the **deployed** instance, not locally. *Open, 2026-09-23: built and tested, but held per instance on the deploy (no Turso); see the variance log.*
- [ ] #38 The deployed sandbox is reachable at sift.visheshbaghel.com; a command against the deployment fetches the page and drives one committed fixture end to end. *Open, 2026-09-23: deployed and reachable at sift.visheshbaghel.com; driving a fixture end to end against it is not yet done.*
- [x] #39 `sift/README.md` carries the measured numbers (no `_unmeasured_` placeholder remains), names the stack actually used, and labels the work a self-built experiment on synthetic data with no client results, as does the sandbox page. Checkable by grepping the README for the label and for the absence of the placeholder.

<!-- AC:END -->

## Execution phases

**Scope for the week, and the cut line.** Sift is larger than Reckon (four synthetic systems of
record, 80 to 100 labelled messages, eight topic classes plus the clock judgment, per-topic
fan-out, several draft templates, a scorecard, a sandbox and a deploy). The week's committed
deliverable is **Phases 1 to 3**: the frozen instrument, the working headless pipeline, and the
measured number. **Phase 4 (the sandbox and the public deploy) is the explicit cut** if the week
runs long; the number stands on its own without it, published in the README and the scorecard.
This keeps the build inside its one-week slot without dropping the part that carries the claim.

### Phase 1: Instrument and spine
**Goal:** the fixtures load typed, and the Sift-local plan carries a per-topic outcome.

- [x] **Precondition met: Reckon is merged to `main`** (2026-09-21, PRs #1 to #6). The widened `Classified`, `Decision` and `runPipeline(AuditLog)` are live in `@builds/shared`; build on them and do not re-fork the contracts in `sift/`.
- [x] Define the Sift-local plan (keyed by the string action) carrying per-topic route, priority, deadline and reason, following Reckon's `plan.effects` precedent (`reckon/src/pipeline.ts`). `@builds/shared`'s `Decision`, `ActionResult` and the string idempotency key stay untouched; this build files no new variance-log row for it.
- [x] Author `inbox.jsonl` and the system-of-record CSVs to the distribution, **meeting both size floors** (clocked subset at least 12; every topic class at least 6 ordinary or its threshold declared); flag the boundary cases; record the tie-break rules and the exact per-class counts, then freeze.
- [x] Typed fixture loader with schema validation for the inbox and every CSV; `INBOX_AS_OF` fixed; the committed `deadline` field asserted against code arithmetic on every clocked row.
- [x] Add vitest to `sift` as its `test` script; confirm the root gate runs it.
- [x] TypeSafe key in the environment only; one live smoke call recorded as the classify test's fixture, and the one-request-per-message shape asserted against it.

**Deliverables:** frozen instrument with a README meeting the size floors, typed loader, the Sift-local per-topic plan with green tests, recorded vendor response.

### Phase 2: The judgment and the decision
**Goal:** the workflow runs correctly and survives failure, headless.

- [x] The single Jev request: one Noul per topic class with tie-break-derived criteria, plus the separated `carries_clock` Noul.
- [x] `policy.ts`: per-class thresholds and bands, the route map, the firm-specific priority rules over the project/RFI joins, the clock corroboration (deadline parse plus RFI-log cross-reference), the draft templates.
- [x] `extract`, `decide`, `act`, `escalate`, `log` implemented; per-topic routing, alerts and drafts; `once()` per action; `withRetry` on every vendor call; `SpendCap` wired to real usage within the shelf-wide budget.
- [x] Adversarial fixtures in their own file, deliberately outside the scored inbox.
- [ ] The full test suite: every AC in the Functional block above. *Open: #13 still lacks the clock judgment, route, priority and deadline on its audit rows, and a committed audit fixture.*

**Deliverables:** working headless pipeline, green suite, no network in tests.

### Phase 3: The number
**Goal:** a figure a stranger can check.

- [x] Threshold sweep over the ordinary subset; commit the sweep and the chosen thresholds; declare any sparse class's threshold with its reason.
- [x] Full run over the committed inbox; commit the run artifact and the dated scorecard.
- [x] Clocked-item catch rate as the headline, with the false-alarm and automation/escalation counterparts beside it; per-class routing and priority accuracy with `n`, ordinary and hard separately; gate catch rate with the error count; measured time and cost per message.
- [x] Fill `sift/README.md` with the measured numbers. No before/after table; the human-time estimate sits apart, labelled.

**Deliverables:** committed scorecard and run artifact, README carrying the numbers.

### Phase 4: The sandbox and the deploy
**Goal:** a stranger can drive it. This phase is the explicit cut if the week runs long.

- [ ] The Next.js app: pick a committed message; show the topic probabilities and the clock judgment, the derived route/priority/deadline, the code-templated draft, the audit rows and the live spend counter; a threshold control that re-renders without a Jev call. *Open: built and deployed, but the page shows neither the code-templated draft nor the audit rows for a message.*
- [x] Server-side Jev key; grep the built bundle for the key and any vendor token; no free-text input in the UI or any route handler.
- [x] Per-visitor rate limit; the per-instance ceiling; spend-cap exhaustion serves the committed run artifact behind a visible replay notice.
- [x] Second tsconfig for the app and a composite `typecheck` so the root gate sees the UI.
- [ ] Deploy to sift.visheshbaghel.com; verify the rate limit, the per-instance ceiling and a full fixture end to end against the deployment. *Open: deployed; the rate limit, the ceiling and a fixture end to end are not yet verified against it.*

**Deliverables:** deployed sandbox, gate covering the UI, README and sandbox page labelled.
