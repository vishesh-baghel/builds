# reckon · AR inbound reply handling

> **Self-built experiment on synthetic data.** Every number below is measured from a synthetic
> ledger and a hand-labelled synthetic inbox, never from a client. No client data, names or
> results appear here.

Status: **not started** — spec written (`docs/prds/reckon-v1-prd.md`), no implementation yet.

## The workflow

Chasing unpaid invoices splits in two. Sending the reminder is a commodity — QuickBooks
Payments AI ships inside an $85/mo plan, Chaser lists $180/mo for firms under $5M revenue.
Reading the reply is the half that still lands on a person: telling a promise to pay from a
dispute, noticing someone says they already paid, spotting that the message reached the wrong
person entirely.

Reckon does the second half only. Whatever the firm already runs keeps running and keeps
sending; Reckon reads what comes back and updates the chase state. **It sends nothing.**

## Why this one

The 2025 Intuit QuickBooks Small Business Late Payments Report (2,000+ US small businesses)
found 56% were owed money on unpaid invoices, averaging $17.5K, and 47% carried invoices more
than 30 days overdue.

On the gap, in its only checkable form: Chaser's features page describes outbound reminders;
inbound reply handling is not listed there as of 2026-09-19. That is a statement about a
published page on a date, and nothing more.

## The measurement instrument

`fixtures/` was built **before** the system, on purpose — a fixture set authored afterwards
gets shaped by what the system already handles and the number stops meaning anything.

- `ar-aging.csv` — 15 open invoices, $245,960 total, in the shape of a QuickBooks A/R Aging
  Detail export.
- `replies.jsonl` — 72 hand-labelled debtor replies at a deliberately imbalanced real-inbox
  distribution. 21 flagged as boundary cases. Five tie-break rules recorded.

6 of the 72 replies carry two classes at once, which is why the judgment is one yes/no question
per class rather than one pick-one question across seven.

Frozen once a number is published. Extending it later means republishing the number, not
quietly improving it.

## The numbers

Measured on the 72 committed replies, per class, ordinary and hard cases scored separately.

| Measure | Value |
|---|---|
| Per-class precision and recall (with n) | _unmeasured_ |
| Accuracy, 51 ordinary replies | _unmeasured_ |
| Accuracy, 21 hard replies | _unmeasured_ |
| Share of its own errors the gate caught | _unmeasured_ |
| Share acted on automatically / escalated | _unmeasured_ |
| Machine time per reply | _unmeasured_ |
| Cost per reply | _unmeasured_ |

Filled by `pnpm --filter @builds/reckon score` in Phase 3, from a committed run artifact.

**There is no before/after claim here, deliberately.** No baseline was measured before the
build, so no comparison would be honest. What is published is the system's own accuracy on a
frozen instrument — a measurement that needs no counterpart. Any human-time figure that
appears is a **declared estimate**, labelled as an estimate, and is never set beside a machine
figure.

## Stack

| Layer | Choice |
|---|---|
| Orchestration | the six-stage spine in `@builds/shared` |
| Judgment (`classify`) | TypeSafe Jev — seven Nouls and two Choices in one request |
| Decision (`decide`) | plain TypeScript. Never a model. |
| Deploy target | Vercel, own project |
| Generative model | none — every reason string is composed by code |
| System of record | none. Synthetic ledger, no write path in either direction. |

## Reliability

- **Idempotency** on every work item and state transition, keyed on reply, invoice and action.
- **Retry with backoff** on every Jev call; an exhausted retry is a failed result in the audit
  log, never a silent success.
- **Audit log** of every decision: the seven probabilities, the asserted classes, the action,
  the rule that fired, and the reason.
- **Spend cap**, hard and per month, below the shelf-wide budget. Exhaustion serves a committed
  recorded run behind a visible notice, not an error page.
- **Escalation is a normal outcome.** Below threshold, ambiguous, or nothing confident — a
  human gets it with the invoice, the full reply and every probability attached.

## Deliberately not doing

- **No outbound email.** No mail vendor, no send path, no email address field anywhere.
- **No generative model.** Nothing here writes prose.
- **No document extraction.** The ledger is a CSV; there are no PDFs.
- **No ledger write path.** An invoice is never marked paid — there is no such action in the
  enum to call.
- **No free-text box on the demo.** Visitors pick from the committed fixtures.
- **No claim about any client.** There are none, and nothing here implies otherwise.
