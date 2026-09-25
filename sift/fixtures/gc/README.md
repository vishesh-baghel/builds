# Sift, labelled fixture set: Brightwater Builders

The measurement instrument for Sift on a general contractor's shared inbox, built the same way as
Meridian's (`fixtures/README.md`): labels first, against rules stated before any run, so the number a
run produces measures the system rather than echoing it.

**All data here is synthetic.** The firm (Brightwater Builders), its jobs, owners, subcontractors,
suppliers, authorities, change orders, bids and every inbox message are invented. No client, no real
mailbox, no real correspondence. Every sender uses an `.example` domain. Nothing here may be
presented as evidence of client work.

Status: **frozen at the first scored run, 2026-09-25 (`runs/gc/SCORECARD.md`). Any label change
after that goes in `docs/VARIANCE-LOG.md`.**

## Files

- `inbox.jsonl`: 90 hand-labelled shared-inbox messages, received 2026-09-14 to 2026-09-21 and read
  on Monday 2026-09-21. Same record shape as Meridian's (see its "Message record shape").
- `projects.csv`: the jobs and pursuits, each with its job number, permit numbers and the next thing
  on its schedule. Three are awarded jobs (Cedar Ridge Townhomes, 5th Street Medical Office,
  Lakeshore Credit Union Branch); two are bids being priced (Harbor View Mixed-Use, Pine Hollow
  Elementary Modernization).
- `log.csv`: the change-order register (`CO-<job>-<nn>`, with an owner approval or pricing date) and
  the bid log (`BID-26-<nnn>`, with the bid due date). Closed rows are executed change orders and a
  bid already decided.
- `contacts.csv`: staff, owners, the architects, subcontractors, suppliers, the testing lab and the
  two building authorities, with the job each belongs to.

### The three project slots

| slot | on an awarded job | on a pursuit |
|---|---|---|
| `coordinator` | the superintendent (Dave Nunez) | the superintendent who would run it |
| `lead` | the project manager (Erin Walsh; Mike Callahan runs Lakeshore himself) | the estimator (Ken Ito) |
| `reviewer` | who signs off pricing (the estimator) | who signs off the bid (Mike Callahan) |

No class routes to the reviewer in this version; the slot is recorded so the register has someone
named against pricing.

## The topic classes

| Class | The message | routes to |
|---|---|---|
| `co` | is a change order, change directive or pricing request on an awarded job | the job's project manager |
| `bid` | is bid work on a project still being pursued | the estimator |
| `inspection` | is an authority's or special inspector's inspection or compliance notice | the job's superintendent |
| `sub` | is a subcontractor or supplier writing about work on an awarded job | the job's project manager |
| `owner` | is the project owner, its representative or its lender's inspector | the job's project manager |
| `invoice` | is a bill, statement or pay application to be paid | accounts payable |
| `noise` | is vendor marketing or unsolicited noise | no one |
| `internal` | is mail between Brightwater's own staff | stays on its thread, low priority |

There is no `other` class for this firm: its eight classes are fixed in `src/fixtures/firms.ts`. A
safety regulator's letter sits in `inspection`, as an authority's compliance notice about the site.

**The clock is a separate judgment**, as for Meridian: whether the message starts or carries a
contractual, statutory or regulatory clock, independent of topic.

## Labelling rules

Written before any run and stated to the model in `src/trades/gc.ts`.

**Class boundaries.**

- `co`: a change to a signed job's scope, price or time, from the owner, the architect or a
  subcontractor, and correspondence about any change order in the register, pending or executed.
  Pricing on a job still being bid is `bid`; a sub's own change request is `co`, not `sub`.
- `bid`: invitations, addenda, planholder notes, bid dates and question cutoffs, sub and supplier
  quotes for a bid, and a prospective owner's questions about the bid. A bid-lead service is a pitch
  even when it names a real pursuit.
- `inspection`: building department, fire marshal, safety regulator and special inspector notices:
  scheduling, readiness, pass, fail, corrections, violations, complaints, including one an owner
  forwards. A lender's draw inspector works for the owner, so that is `owner`.
- `sub`: a subcontractor or supplier on an awarded job about that work: scheduling, deliveries,
  delays, lien notices, insurance, waivers, backcharges, price holds, chasing payment. Its quote on a
  bid is `bid`, its change request `co`, its bill or pay application `invoice`, its promotion a pitch.
- `owner`: the owner of an awarded job about the job: progress, schedule, pay application
  questions, retainage, punch lists, complaints and notices to cure. An owner's change request is
  `co`; an owner forwarding an authority's notice carries `inspection`.
- `invoice`: a bill, statement, credit memo, past-due notice or sub pay application. A solicitation
  that says it is not a bill is a pitch.
- `noise`: unsolicited marketing, however official it looks, including a promotion from a supplier
  the firm already uses.
- `internal`: mail between staff, including forwards of outside mail among them.

**What is a clock.**

1. A change order's clock is its date in the change-order register (owner approval or pricing due),
   while the row is open. An executed change order has none.
2. A bid's clock is its due date in the bid log, or the bid date or question cutoff a new invitation
   or addendum states.
3. An inspection notice is clocked when it obliges readiness, correction, reinspection or a written
   response by a date or within a window. A pass or a request received is not.
4. A lien notice, a notice of intent to lien, an owner's notice to cure, a supplier's release date or
   price hold, and a returned pay application's resubmission date are clocks, however friendly the
   mail around them.
5. A date in a pitch, in internal mail or on a bill is somebody's calendar, not a response clock.
6. An owner's own business date (a tenant's lease, a buyer's walk) is not the firm's clock.
7. A clock whose date the message does not give, or gives in hours, has a null `deadline`: a person
   sets it.

**Where a deadline comes from**, in order: an open register or bid log row the message names; a
"within N days" window from the day the message arrived (calendar days unless it says business,
working or court days); a dated phrase such as "by October 8" or "no later than September 25".

**Who it reaches.** Each topic to its owner in the class table, the slot resolved on the matched job;
a slot topic with no matched job goes to a person to decide. Every clock alert also reaches Mike
Callahan, the owner.

**Priority.** A dated item is urgent when its job's next scheduled activity waits on that kind of item
(`next_blocks`) and falls on or before the deadline, or when the deadline is three days out or less;
high inside ten days; normal after. A dated inspection matter is never below high. Undated: a change
order or bid item not yet in the log is high (it needs logging); an owner or sub asking again is high;
pitches and internal mail are low; everything else normal. A message's priority is the most urgent of
its topics and its clock.

## Size floors

The clocked subset holds at least 12 messages, and every class at least 6 ordinary examples. A test
fails the gate if either floor breaks.

**As drafted:** 90 messages, 25 `hard` (28%), 27 `clocked` (8 of them disguised as routine mail, one
with no date at all), 2 multi-topic. Pitches are the plurality at 15.

| class | ordinary | hard |
|---|---|---|
| `co` | 9 | 3 |
| `bid` | 9 | 2 |
| `inspection` | 7 | 4 |
| `sub` | 9 | 4 |
| `owner` | 8 | 4 |
| `invoice` | 7 | 2 |
| `noise` | 10 | 5 |
| `internal` | 6 | 3 |

A multi-topic message counts under each of its classes.

## How to score against this set

```bash
pnpm --filter @builds/sift score --firm gc
```

Report per class, ordinary and hard separately with `n` beside each, and lead with the clocked-item
catch rate beside its false-alarm counterpart, as for Meridian.

## Known gaps

Recorded, not engineered around, and left for the scorecard to show:

- **A supplier's delivery slot read as a clock** (`g051`): "we can drop the siding any morning before
  Friday". Sub correspondence can carry real clocks (a release date, a price hold), so a date in it
  is not ignored; the dated phrase parses and code raises an alert and high priority. The labels say
  normal, no clock.
- **An owner's own lease date read as a clock** (`g058`): the imaging tenant "cannot move in by
  November 20" is the owner's business date, and she says it is not in the contract, but a dated
  phrase parses. Expect a false alarm to Mike.
