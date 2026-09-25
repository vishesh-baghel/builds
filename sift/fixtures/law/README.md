# Sift, labelled fixture set: Hale & Marrow LLP

The measurement instrument for the law firm scene, built the same way as Meridian Architects' in
`fixtures/README.md`: labelled against the firm's written rules before any model run, so the number
it produces is a measurement and not a description of what the system already does.

**All data here is synthetic.** The firm (Hale & Marrow LLP), its matters, case numbers, courts,
clients, opposing counsel, prospective clients, vendors and every inbox message are invented. No
client, no real mailbox, no real correspondence, no real court. Every sender uses an `.example`
domain. Nothing here may be presented as evidence of client work.

Status: **frozen at the first scored run, 2026-09-25 (`runs/law/SCORECARD.md`). Any label change
after that goes in `docs/VARIANCE-LOG.md`.**

The rules the labels were written against are in `src/trades/law.ts`. The inbox is read on Monday
2026-09-21 in the morning; every message arrived between 2026-09-14 and then.

## Files

- `inbox.jsonl`: 90 hand-labelled shared-inbox messages, in the record shape of Meridian's set
  (see "Message record shape" in `fixtures/README.md`), ids `l001` to `l090`.
- `projects.csv`: the matter list. One row per matter, with its case number and the firm's own
  matter number as references, and the next event on the matter's calendar.
- `log.csv`: the docket and the discovery tracker in one file. Each row is a docketed deadline, a
  discovery response owed, a deposition date or an offer expiry, keyed by the e-filing envelope or
  e-service transaction number that served it, because that number is what later mail quotes.
- `contacts.csv`: the firm's staff, its clients, opposing counsel and the outside parties who bill it.

## The matter list

A "project" here is a matter. `permits` holds the court case number and the firm's `HM-` matter
number; `aliases` holds the party names a message is likely to use.

| Column | Meaning at this firm |
|---|---|
| `coordinator` | the paralegal who keeps the docket for the matter. Recorded; no topic routes to it today |
| `lead` | the responsible attorney: discovery, opposing counsel and the client's own questions go here |
| `reviewer` | the supervising attorney who signs off on responses. Recorded; no topic routes to it today |
| `next_what`, `next_date`, `next_blocks` | the next event on the matter's calendar and the kinds of mail it waits on |

The four matters: Okonkwo v. Brightline Logistics (the firm for the plaintiff, the case management
conference waits on court filings), Vance Holdings v. Tillery Construction (for the plaintiff, the
mediation waits on discovery), Delgado v. Marlow Foods (for the defendant employer, the plaintiff's
deposition waits on discovery and on opposing counsel), and the Sunbury Orchards lease dispute
(pre-suit, the tolling agreement's expiry waits on opposing counsel).

## The topic classes

Fixed by the firm's block in `src/fixtures/firms.ts`.

| Class | The message | routes to |
|---|---|---|
| `court` | is a notice, order or e-filing message from a court or its clerk | the managing partner |
| `discovery` | is discovery served, or correspondence about it | the matter's responsible attorney |
| `opposing` | is opposing counsel asking for or telling the firm something | the matter's responsible attorney |
| `client` | is a current client asking about their matter | the matter's responsible attorney |
| `intake` | is a prospective client or a referral | the intake coordinator |
| `billing` | is a bill, a payment or a trust account item | billing |
| `noise` | is vendor marketing or unsolicited noise | no one |
| `internal` | is internal team correspondence | stays on its thread, low priority |

There is no catch-all class at this firm, so every message holds one of the eight.

## Labelling rules

**Class boundaries.**

- `court`: anything a court or its clerk sends about a case, automated or not: scheduling orders,
  minute orders, orders to show cause, returned or rejected filings (including a fee deficiency),
  reassignments, hearing notices, accepted filings. One a client or opposing counsel forwards is still
  a court notice, alongside whatever the forwarder adds.
- `discovery`: interrogatories, requests for production and admission, deposition notices and their
  logistics, records subpoenas, responses, productions and deficiency letters, whoever passes it
  along. A plain cover note that serves discovery and asks nothing else is discovery only. A court's
  order on a discovery motion is a court notice.
- `opposing`: opposing counsel asking the firm for something or telling it something about the case:
  meet and confer, stipulations, extensions, settlement and statutory offers, tolling agreements,
  courtesy copies of their filings. A deficiency letter that demands a meet and confer, or deposition
  logistics that ask for an answer, are both this and discovery.
- `client`: a current client, or someone writing for one, asking about their matter, first ask or
  repeat. A client's question about an invoice or a trust deposit is billing.
- `intake`: someone not a client on an open matter asking the firm to take a new one, including a
  referral from another lawyer, a message taken by the answering service, and a former client with a
  new problem.
- `billing`: bills and statements to the firm (experts, court reporters, mediators, e-discovery
  hosting), payments, and trust account items, including a bar or bank notice about the trust account.
- `noise`: unsolicited marketing, however official it sounds: research tools, CLE and conference
  promotions, directory listings (one formatted as an invoice), lead sellers, litigation funders, and a
  records service writing as if it were a court.
- `internal`: mail between the firm's own staff, including forwards and assignments among them.

**What is a clock.**

1. A court notice is clocked when it obliges a filing, a response, a payment or a cure by a date or
   within a window: a returned filing, a scheduling order, an order to show cause, a reassignment with
   a challenge window. A hearing notice, a continuance, a trial setting order or an accepted filing is
   a calendar entry, not a clock.
2. Discovery is clocked when a response, an objection or a production is owed: the tracker's due date
   when the message names a logged item, the stated window otherwise. Discovery received (responses,
   productions) and a third-party deposition the firm only attends are not clocks; an undated item the
   tracker has not seen is high because it still needs logging.
3. Opposing counsel's letter is clocked when it carries a statutory offer's expiry, a tolling
   agreement's end, a filed motion (the opposition clock), or an order's date quoted in passing.
4. A prospective client's matter is clocked when the facts point to a limitations or filing window
   that is plausibly weeks or months away, or a date to respond is stated. The date is usually not in
   the message, so the deadline is null and a person sets it.
5. A trust account inquiry from the bar is clocked. Any other date on a bill, in a pitch or in team
   mail is somebody's calendar: it raises no alert and does not raise priority.
6. A client's own business date (a refinance, a budget meeting) is not the firm's clock.
7. A clock whose date the parser cannot read has a null `deadline`: no date given, a date counted
   backwards from an event, or a date written as "will proceed on October 6". Code never guesses one.

**Where a deadline comes from**, in order: an open docket or tracker item the message names by its
envelope or transaction number; a "within N days" window counted from the day the message arrived
(court days skip weekends); a dated phrase such as "no later than October 2" or "before October 15".
The loader re-derives the deadline on every clocked row and fails if it disagrees with the label.

**Who it reaches.** A court notice goes to the managing partner. Discovery, opposing counsel and a
client's question go to the matter's responsible attorney, or to a person to decide when no matter
matches. A new-matter inquiry goes to the intake coordinator, a billing item to billing. Pitches and
internal mail reach no one. Every clock alert goes to the managing partner.

**Priority.** A dated item is urgent when the matter's next event waits on that kind of mail and
falls on or before the deadline, or when the deadline is three days out or less; high inside ten
days; normal after that. A dated court notice is never below high. Undated: discovery the tracker has
not logged is high, a repeat chase by a client or by opposing counsel (a threaded `Re: Re:` or the
sender saying they are asking again) is high, pitches and internal mail are low, everything else
normal. An undated clock is high. A message's priority is the most urgent of its topics and its clock.

## Size floors

The same floors as Meridian's, enforced by `test/firms.test.ts`: at least 12 clocked messages,
at least 6 ordinary examples per class, between 20% and 40% hard.

**As drafted:** 90 messages, 28 `hard` (31%), 27 `clocked` (9 of them disguised as routine mail, 7
with no date the parser can read), 7 multi-topic. Vendor pitches are the plurality at 16.

| class | ordinary | hard |
|---|---|---|
| `court` | 9 | 3 |
| `discovery` | 9 | 5 |
| `opposing` | 9 | 4 |
| `client` | 7 | 6 |
| `intake` | 7 | 3 |
| `billing` | 7 | 3 |
| `noise` | 10 | 6 |
| `internal` | 7 | 2 |

A multi-topic message counts under each of its classes.

The disguised clocks: an e-filing notice with the date in its second sentence (`l001`), a
prospective client with no date (`l004`), a reassignment notice with a challenge window (`l016`), a
courtesy copy of a filed motion (`l036`), a thank-you note quoting an order's date (`l037`), a client's
forward of a records subpoena (`l045`), a friendly referral with a limitations period running
(`l051`), a bar trust account "courtesy notice" (`l066`), and a lunch follow-up that mentions
requests for admission served by mail (`l089`).

## How to score against this set

```bash
pnpm --filter @builds/sift score --firm law
```

Report per class, ordinary and hard separately, with the clocked-item catch rate as the headline and
its false-alarm counterpart beside it, exactly as for Meridian's set.

## Known gaps

Recorded, not dropped, and left for the scorecard to show rather than engineered around. Under a
perfect judgment these three, and only these, land somewhere other than their labels:

- **A repeat chase with none of the repeat words** (`l048`): "it has been five weeks since anyone
  from your office called me". The label says high; code reads a first ask and says normal.
- **A client's own date read as a clock** (`l049`): the client's lender wants a settlement range
  "before October 2". That is the client's refinance, not the firm's deadline, but a dated phrase
  parses and client mail is not a kind whose dates are ignored. Expect a false alarm.
- **Team mail naming an open tracker item** (`l087`): a paralegal tells the associate the draft of
  the responses for tracker item 41812275 is ready. Nothing new arrived, but the docket join
  corroborates a clock on any message that names an open item, so code alerts the managing partner
  and raises priority where the label says team mail, low, no alert.
