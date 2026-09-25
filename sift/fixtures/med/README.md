# Sift, labelled fixture set: Cedar Grove Dental

The measurement instrument for the dental practice firm. Built before any model run against it, on
purpose: a fixture set authored afterwards gets unconsciously shaped by what the system already
does, and the accuracy number stops meaning anything.

**All data here is synthetic.** The practice (Cedar Grove Dental), its staff, patients, payers,
labs, suppliers, claim numbers, lab cases, chart numbers and every inbox message are invented.
Patients appear by first name and an invented chart number only, and no message carries real
clinical data. No client, no real mailbox, no real correspondence. Nothing here may be presented as
evidence of client work.

Status: **frozen at the first scored run, 2026-09-25 (`runs/med/SCORECARD.md`). Any label change
after that goes in `docs/VARIANCE-LOG.md`.** 90 messages and three systems of record (the claims
ledger, the lab tracker and the records log, held together in one `log.csv`), labelled against the
rules in `src/trades/med.ts`. `fixtures.json` is the generated snapshot the app reads; regenerate it
with `pnpm --filter @builds/sift snapshot` after any edit, or the gate fails.

## Files

- `inbox.jsonl`: hand-labelled shared-inbox messages at a deliberately imbalanced real-inbox
  distribution (mostly pitches, bills and routine payer mail).
- `projects.csv`: the four active patient cases the mail keys on, each with its next scheduled
  visit and the kinds of item that visit waits on. This is what makes priority computable rather
  than guessed from message words.
- `log.csv`: the claims ledger (claim appeals, payer information requests, pre-authorizations), the
  lab tracker (cases and the date each is due in the office) and the records log (release requests
  and their response dates). Closed rows stay, so a message that names a closed item can be told
  apart from one that names an open one.
- `contacts.csv`: staff, the four case patients, the labs, payers, the referring surgeon and a
  supplier. Unmatched mail falls back to the sender's case here.

The message record shape is Meridian's, unchanged; see `fixtures/README.md`. Ids run `d001` to
`d090`.

## What a project is here

A project is an active patient case: a course of treatment with a next dated visit that mail about
claims, lab work or records can hold up. The four cases are Tomas (anterior crowns, `TOM`), Helen
(implant, `HEL`), Rania (extraction referral, `RAN`) and Denise (crown and bridge, `DEN`). A message
matches a case by, in order, a ledger, tracker or records log number; the chart number (`CG-18832`
and so on); the patient's first name; or the sender's own case in the contacts list. Mail about any
other patient matches no case, which is normal: most patient mail is not about an open case.

`next_blocks` names the kinds each case's next visit waits on: the crown seat and the bridge try-in
wait on the lab; the implant placement waits on the lab's surgical guide and the payer's
pre-authorization; the oral surgery consult waits on the films.

The three role slots on each case:

| slot | means at this practice | who |
|---|---|---|
| `coordinator` | runs the payer side of the case | Carlos Mena on all four |
| `lead` | runs the case chairside and owns its lab work | Jen Park, except Helen's implant case, which Dr. Rao leads herself |
| `reviewer` | signs off records releases for the case | Beth Lawson on all four |

Only `lead` routes anything today: a lab case goes to its case's lead. The other two slots record
who holds the case's payer and records side; the rules route those kinds to fixed people.

## The topic classes

Fixed by the firm definition in `src/fixtures/firms.ts`. Each is a yes/no judgment; a message may
assert more than one.

| Class | The message | routes to |
|---|---|---|
| `claim` | is about an insurance claim or pre-authorization | Carlos Mena, insurance coordinator |
| `lab` | is from a dental lab about a case or its service | the case's lead (Jen Park, or Dr. Rao on the implant case) |
| `appt` | asks to book, move, confirm or cancel a visit | Sofia Duarte, front desk |
| `records` | asks for records, films or a referral letter to be released | Beth Lawson, office manager |
| `patient` | is a patient's question about care, a bill, coverage or a visit | Beth Lawson |
| `vendor` | is a supplier invoice | Beth Lawson |
| `noise` | is a vendor pitch or unsolicited marketing | no one |
| `internal` | is team mail or practice housekeeping | stays on its thread, low priority |

**The clock is a separate judgment.** A ninth question asks only whether the message starts or
carries a response clock: an appeal window, a payer's information request, a pre-authorization's
expiry, a records request's response window, a lab case's due date.

## Labelling rules

Binding on both the labels here and the code in `src/stages/`. A test asserts that, given a perfect
judgment, every ordinary message lands exactly where its labels say.

**Class boundaries.** The criteria in `src/trades/med.ts` state these to the model; they were
written before any run.

- `claim`: payer mail on a specific claim or pre-authorization: an EOB, a denial, a remittance
  line, a request for additional information, a pre-authorization decision, an overpayment
  recovery, a status notice. A patient forwarding or retelling a payer's letter carries it too. A
  payer asking for radiographs to adjudicate a claim is a claim, not a records request (`d024`). A
  patient asking in general what the plan covers is a patient question (`d060`).
- `lab`: a lab writing about a case or its own service: receipt, Rx or shade question, design
  approval, remake, delay, shipment, adjustment, pickup changes. A lab's monthly statement is a
  supplier invoice (`d037`).
- `appt`: booking, moving, confirming or cancelling a visit, including a provider referring a
  patient to be seen (`d041`).
- `records`: a request to release or transfer records, films or charting, from the patient, a
  representative, another provider, an underwriter or an attorney, including a chase on one
  already made and a request for a referral letter.
- `patient`: a patient, or family writing for one, asking about care, a bill, a refund, a receipt,
  a payment plan or coverage, or complaining.
- `vendor`: a bill or statement for goods or services the practice bought. A solicitation that says
  it is not a bill is a pitch (`d066`).
- `noise`: unsolicited marketing, however urgent or official it sounds, including denial recovery
  services and records retrieval services that quote the real rules (`d022`, `d054`).
- `internal`: mail between staff, and practice housekeeping addressed to the practice as a whole.
  The dental board's broadcast that a licence renewal period is open (`d008`) is labelled here:
  none of the eight classes names a regulator, and it asks nothing of a case.

**What is a clock.**

1. A claim is clocked when a denial, an information request, a recoupment or an authorization's
   expiry obliges the practice to act by a date or within a window. A denial always carries an
   appeal window; when the notice does not state it (`d023`), the clock runs with no date.
2. A lab case open on the tracker is on its due-in date until it arrives, so any mail naming it
   carries that clock, including a routine shipping notice (`d026`) and a friendly "no rush" note
   (`d035`). A case the tracker has closed, or not yet logged, carries none.
3. A records request is clocked when it comes from the patient (the right of access runs 30 days
   whether or not the message says so), from an attorney's subpoena, or with a stated date or
   window. A provider's undated courtesy request is not clocked (`d050`), and nor is a request from
   someone who is not the patient and sends no authorization (`d090`).
4. A date in a pitch, in team mail, on a bill or in an appointment request is somebody's calendar,
   not a response clock. It raises no alert and does not raise priority.
5. A patient's own date (a benefits account deadline) is not the practice's clock.
6. A clock whose date the message does not give has a null `deadline`; a person sets it.

**Where a deadline comes from**, in order: an open ledger, tracker or records log item the message
names; a "within N days" window counted from the day the message arrived (calendar days unless it
says business, working or court days); a dated phrase such as "by October 2" or "by Friday". The
loader re-derives the deadline on every clocked row and fails if it disagrees with the committed
field.

**Who it reaches.** A claim goes to Carlos Mena; a lab case to the case's lead; an appointment
request to Sofia Duarte; records requests, patient questions and supplier invoices to Beth Lawson.
Pitches and team mail reach no one. A lab message that matches no case goes to a person to decide,
so it reaches no named person (`d031`). Every clock alert goes to Dr. Anita Rao.

**Priority.** A dated item is urgent when its case's next visit waits on that kind of item and falls
on or before the deadline (the implant placement on Oct 1 waits on a pre-authorization due Oct 2,
`d012`), or when the deadline is three days out or less; high inside ten days; normal after that.
A dated claim or records request is never below high. Undated: a records request the log has not
seen is high, a repeat patient question or lab chase (a `Re: Re:` thread, or the sender saying they
are following up or still waiting) is high, pitches and team mail are low, everything else normal.
An appointment request is normal whatever date it names. A message's priority is the most urgent of
its topics and its clock.

## Size floors, binding before the freeze

- the `clocked` subset holds at least 12 messages;
- every topic class holds at least 6 ordinary examples.

**As drafted:** 90 messages, 28 `hard` (31%), 28 `clocked` (8 of them disguised as routine mail:
`d001`, `d015`, `d016`, `d018`, `d025`, `d026`, `d035`, `d046`; two with no date at all, `d023`
and `d046`), 4 multi-topic. Pitches are the plurality. Both floors hold, so no threshold is
declared.

| class | ordinary | hard |
|---|---|---|
| `claim` | 9 | 7 |
| `lab` | 7 | 5 |
| `appt` | 7 | 3 |
| `records` | 8 | 2 |
| `patient` | 8 | 3 |
| `vendor` | 6 | 2 |
| `noise` | 12 | 5 |
| `internal` | 7 | 3 |

A multi-topic message counts under each of its classes.

## How to score against this set

```bash
pnpm --filter @builds/sift score --firm med
```

Report per class, not overall, exactly as Meridian's README sets out: the clocked-item catch rate as
the headline with its false-alarm counterpart beside it, per-class routing and priority accuracy
with ordinary and `hard` cases separate and `n` beside each, and the share of its own errors the
confidence gate caught.

## Known gaps

Recorded, not dropped, and left for the scorecard to show rather than engineered around. These are
the ids in `knownGaps` in `src/trades/med.ts`:

- **Clinical urgency in an appointment request** (`d010`): a new patient in pain asking for a slot
  this week. The labels say high; the rules give appointment requests no urgency of their own, so
  code says normal.
- **A remake the tracker has not caught up with** (`d027`): the lab needs a new impression and the
  bridge framework will now miss the Oct 6 try-in, so the try-in must move today. The labels say
  urgent. Code takes the deadline from the tracker, which still says Oct 5, before the try-in and
  two weeks out, and says normal.
- **A patient's own date read as a clock** (`d059`): "I need the receipt by September 30 or my FSA
  will reject it" is the patient's benefits deadline, not the practice's, but a dated phrase parses
  on a patient question. Expect a false alarm to Dr. Rao and high where the label says normal.
