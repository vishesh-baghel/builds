# sift Â· shared-inbox triage

> **Self-built experiment on synthetic data.** Every number below is measured from a synthetic
> shared inbox and hand-labelled synthetic systems of record, never from a client. No client
> data, names or results appear here.

Status: **not started** , , ,  spec written (`docs/prds/sift-v1-prd.md`), no implementation yet.

## The workflow

A firm's shared mailbox (`info@, , ¦`) holds everything overnight: a contractor RFI that blocks
Thursday's concrete pour, two consultant invoices, a plan-review letter from the city with a
14-day clock that reads like a form email, vendor spam about window systems, and a client
asking for the second time why the submittal log hasn't moved. Someone sorts these by hand
every morning, and the letter that looks routine gets filed under "read later" while its clock
runs anyway.

Sift reads each message and decides who it goes to, how urgent it is (from the firm's own
project state, not from words in the email), whether a contractual or regulatory clock has
started, and drafts a reply from the firm's project data. Whatever inbox tool the firm already
runs keeps running; Sift adds the firm-context judgment. **It sends nothing and writes to no
system of record.**

## Why this one

Shared-inbox tools already ship AI triage , , ,  Missive lists three plans at $14/$24/$36 per
user/mo billed annually with AI requiring your own API key (missiveapp.com/pricing, accessed
2026-09-21), and Front lists $25/$65/$105 per seat/mo billed annually with AI add-ons at
$10, , , 20/seat/mo (front.com/pricing, accessed 2026-09-21). In its only checkable form: Missive
and Front ship AI-assisted triage; reaching a firm's project, RFI/submittal and CRM
context to judge firm-specific urgency and draft with live data is not part of that, as of those
pages on 2026-09-21. That is a statement about published pages on a date, and nothing more.
Nothing here asserts those tools cannot triage.

## The measurement instrument

`fixtures/` was built **before** the system, on purpose , , ,  a fixture set authored afterwards
gets shaped by what the system already handles and the number stops meaning anything.

- `inbox.jsonl` , , ,  hand-labelled shared-inbox messages at a deliberately imbalanced real-inbox
  distribution (mostly noise), each labelled with its route(s), priority, deadline where one
  exists, topic class(es), and whether it carries a clock. Boundary cases flagged.
- `projects.csv`, `rfi-log.csv`, `submittal-log.csv`, `contacts.csv` , , ,  synthetic
  systems of record in the shape of real exports, joined at extract time and used to compute
  firm-specific priority and to fill the drafted replies.

A message may carry more than one topic, which is why the judgment is one yes/no question per
topic class rather than one pick-one question , , ,  a multi-topic thread routes to more than one
person. Frozen once a number is published.

## The numbers

Measured on the committed inbox, per class, ordinary and hard cases scored separately.

| Measure | Value |
|---|---|
| Clocked-item catch rate (headline, with n) | _unmeasured_ |
| False-alarm rate on unclocked messages (with n) | _unmeasured_ |
| Share acted on automatically / escalated | _unmeasured_ |
| Per-class routing accuracy (with n), ordinary / hard | _unmeasured_ |
| Per-class priority accuracy (with n), ordinary / hard | _unmeasured_ |
| Share of its own errors the gate caught | _unmeasured_ |
| Machine time per message | _unmeasured_ |
| Cost per message | _unmeasured_ |

Filled by `pnpm --filter @builds/sift score` in Phase 3, from a committed run artifact.

**There is no before/after claim here, deliberately.** No baseline was measured before the
build, so no comparison would be honest. What is published is the system's own performance on a
frozen instrument. Any human-time figure that appears is a **declared estimate**, labelled as
an estimate, and is never set beside a machine figure.

## Stack

| Layer | Choice |
|---|---|
| Orchestration | the six-stage spine in `@builds/shared` |
| Judgment (`classify`) | TypeSafe Jev , , ,  one Noul per topic class plus a separate clock judgment, in one request |
| Decision (`decide`) | plain TypeScript. Never a model. Routes, priority and deadlines derived from the synthetic systems of record. |
| Drafting | code-templated from the matched project data , , ,  no generative model |
| Deploy target | Vercel, own project , , ,  sift.visheshbaghel.com |
| System of record | none written to. Synthetic project/RFI/submittal/CRM fixtures, read-only. |

## Reliability

- **Idempotency** on every routing record, alert and draft, keyed on message, topic and action.
- **Retry with backoff** on every Jev call; an exhausted retry is a failed result in the audit
  log, never a silent success.
- **Audit log** of every decision: the topic probabilities, the clock judgment, the route,
  priority, deadline, action and reason.
- **Spend cap**, hard and per run, within the shelf-wide budget; `guard()` refuses a call before
  it spends. Exhaustion serves a committed recorded run behind a visible notice, not an error
  page.
- **Escalation is a normal outcome.** Below threshold, ambiguous, or nothing confident , , ,  a
  human gets it with the message, the matched project rows and every probability attached.

## Deliberately not doing

- **No auto-send.** No mail vendor, no send path, no destination-address field anywhere. Sift
  drafts; a human sends from the tool the firm already runs.
- **No generative model.** Drafts are templates filled from fixture data; nothing here writes
  free prose.
- **No system-of-record write path.** An RFI is never marked answered, an invoice never marked
  paid.
- **No document extraction.** Every input is text; there are no PDFs.
- **No free-text box on the demo.** Visitors pick from the committed fixtures.
- **No claim about any client.** There are none, and nothing here implies otherwise.
