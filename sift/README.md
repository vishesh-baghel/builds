# sift · shared-inbox triage

> **Self-built experiment on synthetic data.** Every number below is measured from a synthetic
> shared inbox and hand-labelled synthetic systems of record, never from a client. No client
> data, names or results appear here.

Status: **building.** The headless pipeline and the measured number are done; the dashboard runs
locally on illustrative data; the live deploy is not up yet. Spec: `docs/prds/sift-v1-prd.md`.

## The workflow

A firm's shared mailbox (`info@`) holds everything overnight: a contractor RFI that blocks
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

Shared-inbox tools already ship AI triage. Missive lists three plans at $14/$24/$36 per user/mo
billed annually, with AI requiring your own API key (missiveapp.com/pricing, accessed
2026-09-21), and Front lists $25/$65/$105 per seat/mo billed annually, with AI add-ons at $10 to
$20/seat/mo (front.com/pricing, accessed 2026-09-21). In its only checkable form: Missive and
Front ship AI-assisted triage; reaching a firm's project, RFI/submittal and CRM context to judge
firm-specific urgency and draft with live data is not part of that, as of those pages on
2026-09-21. That is a statement about published pages on a date, and nothing more. Nothing here
asserts those tools cannot triage.

## The measurement instrument

`fixtures/` holds 91 hand-labelled messages for a synthetic architecture firm, Meridian
Architects, and four synthetic systems of record (projects with their next scheduled activity,
an RFI log, a submittal log, contacts). 30 messages carry a real clock, 9 of them disguised as
routine mail; 26 are deliberate boundary cases; vendor pitches are the plurality, as in a real
shared inbox. Every class holds at least six ordinary examples. The labelling rules, the
per-class counts and the known gaps are in `fixtures/README.md`.

A message may carry more than one topic, which is why the judgment is one yes/no question per
topic class rather than one pick-one question: a multi-topic thread routes to more than one
person. The instrument is frozen; any later label change goes in `docs/VARIANCE-LOG.md`.

## The other six firms

The dashboard's firm switcher shows seven trades. Each of the other six now carries an instrument
built the same way as Meridian's, and to the same bar, in `fixtures/<firm>/`: hand-labelled messages
in `inbox.jsonl`, synthetic systems of record (`projects.csv`, `log.csv`, `contacts.csv`), and a
README with that firm's labelling rules, per-class counts and known gaps. Each firm's routing,
priority rules and question criteria are in `src/trades/<firm>.ts`; the extract, route and decide
code is the same for all seven.

| firm | trade | messages | clocked | hard |
|---|---|---|---|---|
| Hale & Marrow LLP | law firm | 90 | 27 | 28 |
| Northgate Property Group | property management | 92 | 29 | 31 |
| Cedar Grove Dental | dental practice | 90 | 28 | 28 |
| Larkin & Voss CPAs | accounting firm | 90 | 25 | 27 |
| Brightwater Builders | general contractor | 90 | 27 | 25 |
| Fieldstone Talent | recruiting agency | 90 | 25 | 26 |

Each was scored on 2026-09-25, one recorded judgment per message from the same model as
Meridian's run, at the lines its own sweep chose on its ordinary subset. Full per-class tables,
the thresholds and the measured cost are in each firm's scorecard; every judgment is committed in
`runs/<firm>/run.json`, so any figure can be recomputed without spending again.

| firm | trade | clocked-item catch rate | false alarms | handled with no person asked | source |
|---|---|---|---|---|---|
| Hale & Marrow LLP | law firm | 89% (24/27) | 11% (7/63) | 77% (69/90) | `runs/law/SCORECARD.md` |
| Northgate Property Group | property management | 90% (26/29) | 10% (6/63) | 76% (70/92) | `runs/prop/SCORECARD.md` |
| Cedar Grove Dental | dental practice | 96% (27/28) | 15% (9/62) | 90% (81/90) | `runs/med/SCORECARD.md` |
| Larkin & Voss CPAs | accounting firm | 100% (25/25) | 15% (10/65) | 77% (69/90) | `runs/cpa/SCORECARD.md` |
| Brightwater Builders | general contractor | 100% (27/27) | 16% (10/63) | 69% (62/90) | `runs/gc/SCORECARD.md` |
| Fieldstone Talent | recruiting agency | 84% (21/25) | 6% (4/65) | 78% (70/90) | `runs/rec/SCORECARD.md` |

As with Meridian, these are measurements on invented inboxes, with no before/after comparison.
`test/firms.test.ts` also holds each instrument to Meridian's bar: both size floors, deadlines code
can reproduce, and, under a perfect judgment, every ordinary message landing where its labels say.
A firm is re-scored with:

```bash
pnpm --filter @builds/sift score --firm law
```

## The numbers

Run 2, 2026-09-23, on all 91 messages at the lines the sweep chose on the ordinary subset (act
0.55, review 0.50, clock 0.50). Full tables in `SCORECARD.md`; every judgment behind them is
committed in `runs/run.json`, so any figure can be recomputed without spending again.

| Measure | Value |
|---|---|
| **Clocked-item catch rate** (headline) | **100% (30/30)**: ordinary 21/21, hard 9/9 |
| False alarms on unclocked messages | 18% (11/61) |
| Handled with no person asked / reached a person | 69% (63/91) / 31% (28/91) |
| Per-class routing accuracy, ordinary | 100% for 6 of 8 classes; `rfi` 83% (10/12); `invoice` 17% (1/6) |
| Per-class priority accuracy, ordinary | 100% for 4 of 8 classes; `rfi` and `vendor_pitch` 92% (11/12); `agency_letter` 83% (5/6); `invoice` 17% (1/6) |
| Hard subset, routing and priority | per class in `SCORECARD.md`; `internal` 0% (0/2) on both |
| Errors the gate sent to a person | ordinary 80% (12/15); hard 36% (5/14) |
| Machine time per message, median | 465 ms |
| Cost per message | 0.0050 cents (input tokens only) |

What these say, plainly:

- **Every clock was caught, including the disguised ones**, at the price of 11 false alarms. The
  clock question is deliberately separate from the topic and sits on a low line, because a false
  alarm costs a glance and a miss costs a deadline. It did its job: on the ordinary set the model
  named only 2 of 6 agency letters as agency letters, yet every clocked one still raised an alert.
- **Invoices are the weak spot.** The model reads payment terms as a running clock: every invoice
  that states them ("Net 30", "Net 45", "due on receipt", a dated late fee) scored 0.86 to 0.97,
  while the statement and the card-charged subscription, which state none, scored under 0.2. The
  labels say a bill's date is accounting's calendar, not a response clock. That is 5 of the 11
  false alarms and almost every invoice routing and priority miss. The labels were kept as written
  rather than changed to agree with the model.
- **The gate is weaker on the hard cases.** Of the 14 hard messages it got wrong, 9 reached no
  person, mostly an extra topic asserted alongside the right one. That trade came with the higher
  automation of run 2 and is printed rather than hidden.

**Run 1 is kept, not replaced.** Its class questions carried generic criteria, not the boundaries
the labels were written to, as the PRD requires; `other` fired on 16 of 18 vendor pitches.
The criteria were rewritten from the labelling rules committed before run 1, nothing from its
results, and the inbox was run again. Run 1 caught 30 of 30 with 11 false alarms, like run 2, but
handled only 41% (37/91) without a person. Its artifact and scorecard are in `runs/`, and the
scorecard recomputes its headline from them. No label changed between runs.

**There is no before/after claim here, deliberately.** No baseline was measured before the
build, so no comparison would be honest. What is published is the system's own performance on a
frozen instrument. Any human-time figure that appears is a **declared estimate**, labelled as
an estimate, and is never set beside a machine figure.

## Stack

| Layer | Choice |
|---|---|
| Orchestration | the six-stage spine in `@builds/shared` |
| Judgment (`classify`) | TypeSafe Jev (`jev-1.13.0`): one Noul per topic class plus a separate clock judgment, in one request |
| Decision (`decide`) | plain TypeScript, never a model. Routes, priority and deadlines derived from the synthetic systems of record. |
| Drafting | code-templated from the matched project data; no generative model |
| Dashboard | Next.js, one pure decision function shared with the pipeline, so moving the autonomy dial never calls the model |
| Deploy target | Vercel, own project, sift.visheshbaghel.com (not deployed yet) |
| System of record | none written to. Synthetic project/RFI/submittal/CRM fixtures, read-only. |

## Reliability

- **Idempotency** on every routing record, alert and draft, keyed on message and topic-qualified
  action, so a two-topic message writes two records and a rerun writes none.
- **Retry with backoff** on every Jev call; an exhausted retry is a failed result in the audit
  log, never a silent success.
- **Audit log** of every decision: one row per stage that ran and one per action taken.
- **Spend cap**, hard and per run; `guard()` refuses a call before it spends. Both scored runs
  together cost under a cent against a 25-dollar cap.
- **Escalation is a normal outcome.** Below threshold, ambiguous, or nothing confident: a
  person gets it with the message, the matched project rows and every probability attached.

## Deliberately not doing

- **No auto-send.** No mail vendor, no send path, no destination-address field anywhere. Sift
  drafts; a person sends from the tool the firm already runs.
- **No generative model.** Drafts are templates filled from fixture data; nothing here writes
  free prose.
- **No system-of-record write path.** An RFI is never marked answered, an invoice never marked
  paid.
- **No document extraction.** Every input is text; there are no PDFs.
- **No free-text box on the demo.** Visitors pick from the committed fixtures.
- **No claim about any client.** There are none, and nothing here implies otherwise.
