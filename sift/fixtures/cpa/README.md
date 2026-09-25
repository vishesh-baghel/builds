# Sift, labelled fixture set: Larkin & Voss CPAs

The measurement instrument for the accounting firm, built to the same bar as Meridian's
(`../README.md`) so the two can be scored the same way.

**All data here is synthetic.** The firm (Larkin & Voss CPAs), its client engagements, contacts,
notice log, filing calendar and every inbox message are invented. Notice numbers, reference numbers,
client ids, agencies and payroll providers are made up, and every sender sits on an `.example`
domain. No client, no real mailbox, no real correspondence. Nothing here may be presented as
evidence of client work.

Status: **authored 2026-09-25, not yet scored. It freezes at its first scored run; any label change
after that goes in `docs/VARIANCE-LOG.md`.** 90 messages and three systems of record.
`fixtures.json` is the generated snapshot the app reads; regenerate it with
`pnpm --filter @builds/sift snapshot` after any edit, or the gate fails.

## Files

- `inbox.jsonl`: hand-labelled shared-inbox messages, read on Monday 2026-09-21 and received from
  2026-09-14 onward. The record shape is Meridian's; see `../README.md`, "Message record shape".
- `projects.csv`: the client list. A "project" here is a client engagement, keyed by a short code, with
  the firm's client id (`LV-10nn`) and any authority account number that identifies the client in mail
  (a withholding id, a sales tax permit) as its references. Each row carries the next item on that
  client's calendar and which kinds of mail it waits on.
- `log.csv`: one file holding two logs. The **notice log** (`NR-` numbers, the control number printed
  on the notice) holds every authority notice the firm is answering, with its response date. The
  **filing calendar** holds the extended returns (`EXT-` numbers, the extension confirmation the client
  also receives), payroll tax deposits (`DEP-`) and quarterly payroll returns (`941-Q3-`), each with its
  due date. Closed rows are items already filed, paid or resolved.
- `contacts.csv`: staff, clients and their people, and the payroll provider.

## What the three project slots mean here

| Slot | For this firm | Receives |
|---|---|---|
| `coordinator` | whoever takes in the client's documents: Mia Chen on most engagements, Owen Hart where he runs the portal intake | client documents |
| `lead` | the preparer who owns the client relationship and answers their tax questions | client questions |
| `reviewer` | the second signer on the return | nothing routes here today; recorded for the review step |

Payroll, prospects and billing go to one fixed person each (Sofia Blanco, Owen Hart, Owen Hart),
whatever the client. Every notice, and every clock alert, goes to the partner, Ruth Larkin.

## The topic classes

| Class | The message | routes to |
|---|---|---|
| `notice` | is a notice from a tax authority, sent direct or forwarded by a client | the partner |
| `docs` | is a client sending documents | the engagement's coordinator |
| `question` | is an existing client's tax or filing question, or asking where their return stands | the engagement's lead |
| `payroll` | is about running a client's payroll, its deposits and payroll returns | payroll (Sofia Blanco) |
| `prospect` | is someone who is not yet a client asking to become one | admin (Owen Hart) |
| `billing` | is about the firm's own invoices and fees | billing (Owen Hart) |
| `noise` | is vendor marketing or unsolicited noise | no one |
| `internal` | is internal team correspondence | stays on its thread, low priority |

There is no catch-all class for this firm. Mail none of the eight holds is rare in this inbox, and
where a message is unclear the review band already hands it to a person.

**The clock is a separate judgment**, as for Meridian: a ninth question asks only whether the message
starts a regulatory or filing clock, independent of topic.

## Labelling rules

Written while labelling, before any run, and binding on both the labels here and the rules in
`src/trades/cpa.ts`. A test asserts that, given a perfect judgment, every ordinary message lands
exactly where its labels say.

**Class boundaries.**

- `notice`: a notice or letter from the IRS, a state revenue or labor department, a county assessor
  or a city tax office about a client's account, return, balance, penalty, deposit or registration,
  including one a client forwards, photographs or paraphrases in passing. The practitioner account
  messages the firm itself receives from an authority count. A vendor, webinar host or "tax relief"
  firm writing in official language does not.
- `docs`: a client, or someone sending for one (their bookkeeper, their spouse), sending or uploading
  documents, or saying they are on the way. A notice sent as an attachment is a notice.
- `question`: an existing client asking a tax or filing question, or where their return, extension or
  refund stands, first ask or repeat. An existing client asking to add a service is a question, not a
  prospect.
- `payroll`: new hires, terminations, pay changes, deductions, deposits, payroll returns, withholding
  orders and the payroll provider's notices. A withholding order from a support agency is payroll,
  not a notice: it is not a tax authority.
- `prospect`: someone not yet a client asking to be taken on, or a referral introducing one. A
  prospect holding an IRS letter is still a prospect: the firm is not yet answering for them.
- `billing`: the firm's own invoices: queries, disputes, payments, returned payments, copies.
- `noise`: unsolicited marketing, however urgent or official it sounds: software offers, trials,
  "IRS update" and CPE webinars, directory renewals that say they are not a bill, security
  lookalikes, recruiting, lead lists, awards.
- `internal`: mail between the firm's own staff, including forwards among them.

**What is a clock.**

1. A notice is clocked when it obliges a response, payment, filing or registration by a date or within
   a window. A notice that informs (an abatement granted, a rate for the records, a changed account)
   is not.
2. An item on the notice log or the filing calendar is clocked while it is open: an open notice, an
   extended return (October 15 for the extended 1040s and corporate returns in this set), a payroll
   deposit, a quarterly 941. A closed one is not.
3. A payroll deadline set by an authority or a provider funding a deposit is clocked: a rejected
   filing to resubmit, a deposit to fund, a withholding order with a start window.
4. A date in a pitch, in internal mail, on the firm's invoice, in a client's note about sending
   documents or in a prospect's own situation is somebody's calendar, not a response clock. It raises
   no alert and does not raise priority.
5. A client's own business date (a bank's request for financials) is not the firm's clock.
6. A clock whose date the message does not give, or gives in a form the parser does not read, has a
   null `deadline`. The right outcome is a person setting it; code never guesses one.

**Where a deadline comes from**, in order: an open notice-log or filing-calendar item the message
names; a "within N days" window counted from the day the message arrived (calendar days unless it says
business or working days); a dated phrase such as "by October 14" or "no later than October 30". A
window printed on a notice counts from the day the notice reached the inbox, never from a notice date
the message does not carry.

**Who it reaches.** A notice goes to the partner; client documents to the engagement's coordinator; a
client question to its lead; payroll to Sofia Blanco; prospects and billing to Owen Hart. Pitches and
internal mail reach no one. A slot topic whose client cannot be matched reaches no named person.
Every clock alert goes to the partner.

**Priority.** A dated item is urgent when the client's next calendar item waits on that kind of mail
(`next_blocks` in `projects.csv`) and falls on or before the deadline, or when the deadline is three
days out or less; high inside ten days; normal after that. A dated notice is never below high. An
undated notice is high until the notice log has it, and normal once it names a logged item. A repeat
client question (a threaded reply, or the client saying they are asking again) is high. Pitches and
internal mail are low; everything else normal. A message's priority is the most urgent of its topics
and its clock.

The calendar makes urgency firm-specific. A CP2000 for the Aldanas due October 17 is urgent because
their extended 1040, filed on October 15, waits on it; Tom Brennan's CP2000 due October 14 is only
high, because it lands a day before his filing.

## Size floors, as drafted

90 messages, 27 `hard` (30%), 25 `clocked` (9 of them disguised as routine mail, two with no date the
parser can read), 9 multi-topic. Both floors hold: the clocked subset is above 12 and every class has
at least 6 ordinary examples.

| class | ordinary | hard |
|---|---|---|
| `notice` | 8 | 10 |
| `docs` | 7 | 4 |
| `question` | 9 | 5 |
| `payroll` | 7 | 4 |
| `prospect` | 7 | 2 |
| `billing` | 7 | 1 |
| `noise` | 14 | 5 |
| `internal` | 6 | 3 |

A multi-topic message counts under each of its classes. Notices carry most of the hard cases on
purpose: the disguised clocks live there.

## How to score against this set

```bash
pnpm --filter @builds/sift score --firm cpa
```

Report it as Meridian's is reported: the clocked-item catch rate as the headline with its false-alarm
counterpart beside it, per-class routing and priority accuracy with ordinary and `hard` cases apart and
`n` beside each, and the share of its own errors the confidence gate caught.

## Known gaps

Recorded, not dropped, and left for the scorecard to show rather than engineered around:

- **A client's own date read as a clock** (`c049`): "our bank wants reviewed financials by October 2"
  is the client's lender's date, not a filing or response window. The labels say no alert; a dated
  phrase on a client question parses, so code raises one for the partner.
- **A repeat chase with none of the repeat words** (`c050`): "it has been three weeks since I sent the
  last of the brokerage forms". The labels say high; code reads a first ask and says normal.
