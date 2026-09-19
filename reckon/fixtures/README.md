# Reckon — labelled fixture set

The measurement instrument for build 01. Built **before** the build, on purpose: a fixture set
authored afterwards gets unconsciously shaped by what the system already does, and the accuracy
number stops meaning anything.

**All data here is synthetic.** The firm (Brightline Mechanical), the customers, the invoices and
every reply are invented. No client, no real ledger, no real correspondence. Nothing here may be
presented as evidence of client work.

## Files

- `ar-aging.csv` — 15 open invoices, $245,960 total, in the column shape of a QuickBooks Online
  **A/R Aging Detail** export. HVAC contractor flavour, matching the scene written up in
  `wiki/research/build-catalog-52-worked-examples.md` (build #1).
- `replies.jsonl` — 72 hand-labelled debtor replies, each keyed to an invoice in the CSV.

## Reply record shape

| Field | Meaning |
|---|---|
| `id` | stable identifier, `r001`… |
| `invoice` | invoice number in `ar-aging.csv` |
| `from`, `subject`, `body` | the message as it would arrive |
| `label` | the **primary** class — the one the system is scored against |
| `also` | secondary classes that genuinely also apply (6 messages) |
| `hard` | boundary case, deliberately included (21 messages) |
| `note` | why this label, and what makes it hard |

## The seven classes

| Class | The message… | n |
|---|---|---|
| `claimed_payment` | asserts the invoice is already paid | 10 |
| `promise_to_pay` | commits to paying in future, dated or not | 12 |
| `partial` | pays or is paying part of the balance now | 6 |
| `dispute` | contests the amount, scope, validity or terms | 6 |
| `question` | needs information before it can proceed | 12 |
| `wrong_contact` | is not the right recipient, or redirects | 8 |
| `noise` | carries nothing actionable | 18 |

## Tie-break rules

Discovered while labelling, and binding on both the labels here and any future addition:

1. **Money now beats money later.** Any part of the balance stated as paid or being paid now is
   `partial`, even when the message also promises the remainder.
2. **A promise to reply is not a promise to pay.** *"Let me talk to the owner and come back to you
   Thursday"* is `question`, not `promise_to_pay`.
3. **An actionable redirect outranks an auto-reply.** An out-of-office naming a live alternate
   contact is `wrong_contact`, not `noise`.
4. **Acknowledging the email is not acknowledging the debt.** *"Received, thank you"* is `noise`,
   not `claimed_payment`.
5. **Disputing the terms is still a dispute.** *"Our contract says net 60"* is `dispute` even
   though no amount is contested.

## How to score against this set

**Report per-class, not overall.** The distribution is deliberately imbalanced to look like a
real inbox, which means a system that answered `noise` every time would score 25% and a single
headline accuracy number would flatter performance on the rare, expensive classes. `dispute` and
`partial` have 6 examples each and are the two where a wrong answer costs the most.

Report, at minimum:

- per-class precision and recall, `dispute` and `claimed_payment` first — those two drive the
  wrong action if missed (chasing someone who paid; ignoring someone who is arguing);
- overall accuracy on the 51 non-hard cases and on the 21 `hard` cases **separately**;
- the share of its own errors the confidence gate caught — the reliability claim rests on this,
  not on raw accuracy.

## Known gap

One `noise` message is an unsubscribe request (*"Please remove me from this distribution list"*).
It carries no payment signal but is operationally actionable and legally awkward to ignore. The
seven classes have nowhere to put it. Recorded rather than papered over; resolve when the Jev
question set is specified.
