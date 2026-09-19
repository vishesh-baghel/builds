# Reckon · AR invoice chasing

> **Self-built experiment on synthetic data.** Numbers below are measured from a synthetic
> ledger, not from any client. No client data, consented or otherwise, is used here.

Status: **not started** — scaffold only.

## The workflow

Chasing unpaid invoices: sending the reminder, reading the reply, telling a promise-to-pay apart
from a dispute, escalating what a human should handle, and recording what happened.

## Why this one first

Of the workflows surveyed, this had the strongest independent evidence: the 2025 Intuit
QuickBooks Small Business Late Payments Report found 56% of US small businesses were owed money
on unpaid invoices, averaging $17.5K each, with 47% carrying invoices more than 30 days overdue.

## Baseline (to be measured before the build, not after)

| Metric | Baseline | After |
|---|---|---|
| Hours/week spent chasing | _unmeasured_ | — |
| Average days to payment | _unmeasured_ | — |
| Overdue invoices contacted | _unmeasured_ | — |

## Planned stack

| Layer | Choice |
|---|---|
| Orchestration | _tbd_ |
| Deploy target | _tbd_ |
| Document extraction | _tbd_ |
| Email surface | _tbd_ |
| System of record | _tbd_ (synthetic ledger for the demo) |

## Deliberately not doing

- No write access to a real accounting system. The demo runs against a synthetic ledger.
- No autonomous escalation to collections. Disputes route to a human, always.
