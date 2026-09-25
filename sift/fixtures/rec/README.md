# Sift, labelled fixture set: Fieldstone Talent

The measurement instrument for the recruiting agency, built the same way as Meridian's
(`fixtures/README.md`): labels written against the firm's rules before any run was scored, so the
number measures the system rather than being shaped by it.

**All data here is synthetic.** The firm (Fieldstone Talent), its clients, candidates, requisitions,
offers, invoices, vendors and every inbox message are invented. No client, no real mailbox, no real
correspondence, no real company or product. Nothing here may be presented as evidence of client work.

Status: **authored 2026-09-25, not yet scored. It freezes at its first scored run; any label change
after that goes in `docs/VARIANCE-LOG.md`.**

## Files

- `inbox.jsonl`: 90 hand-labelled shared-inbox messages, `r001` to `r090`, received between Monday
  2026-09-14 and Monday 2026-09-21 morning, read as of 2026-09-21. The shape of each record is
  Meridian's; see "Message record shape" in `fixtures/README.md`.
- `projects.csv`: the open requisitions (client plus role), each with its requisition id and the next
  dated thing on it, and which kinds of message that thing waits on.
- `log.csv`: three tracked logs in one file: the **offer log** (offer expiries), the **client SLA
  tracker** (shortlists, slates and reference reports owed to clients) and the **onboarding tracker**
  (background check consent cutoffs, I-9 windows).
- `contacts.csv`: staff, client hiring managers and HR, client accounts payable, candidates on each
  requisition, and the vendors the firm buys from.

## What the project columns mean here

A project is a requisition. `permits` holds its requisition id (`REQ-1041`); `aliases` holds the
client's short name, since each client has one open requisition in this set.

| Slot | Meaning at Fieldstone | Holds |
|---|---|---|
| `coordinator` | the coordinator who runs interviews and starts | Ben Osei on every requisition |
| `lead` | the recruiter working the requisition: its candidates and its offers | Tom Ferris (engineering) or Nadia Kowalski (finance) |
| `reviewer` | the account owner: whoever holds the client relationship and its fee terms | usually the recruiter; Nadia Kowalski on Brightwater, Aisha Bello on Kestrel |

Scheduling and onboarding route to Ben Osei by name rather than through the slot, so they reach him
even when no requisition matches. The coordinator slot records him on each row for completeness.

## The topic classes

| Class | The message | routes to |
|---|---|---|
| `offer` | is about a job offer: terms, counteroffers, competing offers, acceptance, decline, expiry, extensions | the requisition's recruiter |
| `candidate` | is from a candidate about their own candidacy | the requisition's recruiter |
| `client` | is from a client's hiring manager, talent partner or HR about their searches | the requisition's account owner |
| `scheduling` | arranges, moves, holds or cancels an interview | Ben Osei |
| `onboarding` | is about a start: background checks, drug screens, I-9, payroll forms, first day | Ben Osei |
| `billing` | is about a placement fee, a guarantee, or a bill from a vendor the firm uses | Chloe Grant |
| `noise` | is a vendor pitch or unsolicited marketing | no one |
| `internal` | is mail between Fieldstone's own staff | stays on its thread, low priority |

There is no `other` class for this firm: every message in the set fits at least one of the eight.
**The clock is a separate judgment**, asked independently of topic, exactly as for Meridian.

## Labelling rules

The same rules are stated to the model in `src/trades/rec.ts` and applied by the code in
`src/stages/`. A test asserts that, given a perfect judgment, every ordinary message lands exactly
where its labels say.

**Class boundaries.**

- `offer`: anything about a job offer, including a counteroffer from a candidate's current employer
  before any offer of ours exists, a competing offer, a request for more time, an acceptance, and
  closing out an offer already decided. A withdrawal with no offer involved is candidate mail only;
  start dates and paperwork after acceptance are onboarding; a vendor webinar about counteroffers is
  a pitch.
- `candidate`: yes whenever a candidate, or someone applying to be one, is the sender, alongside any
  other class that also fits. Mail about a candidate from a client, a screening vendor or staff is
  not candidate mail, even when it quotes the candidate.
- `client`: a client's hiring manager, talent partner or HR writing about a search: feedback, new
  requisitions, shortlist chases, offer approvals, fee terms, or a candidate's question passed along.
  Accounts payable writing only about an invoice is billing. Client HR writing only about a placed
  hire's start is onboarding. An automated calendar notice is scheduling only.
- `scheduling`: arranging, confirming, holding, moving or cancelling interviews, from anyone. A
  kickoff call for a new requisition is client mail; the firm's own meetings are internal.
- `onboarding`: from acceptance to the first days: start dates, background check orders and consent,
  drug screens, I-9 and payroll forms, first-day logistics, including automated screening notices.
- `billing`: placement fee invoices, disputes, remittances, fee terms, guarantee claims, and bills
  from vendors the firm actually buys from. A solicitation that says it is not a bill is a pitch.
- `noise`: unsolicited marketing, however urgent or official it sounds: job boards, sourcing tools,
  screening vendors selling, events, webinars, directory listings, other agencies proposing splits.
- `internal`: mail among Fieldstone's staff, including forwards and hand-offs.

**What is a clock.**

1. An offer's clock is its expiry in the offer log while the offer is open. A candidate's competing
   offer deadline is also a clock: miss it and the candidate is gone. An acceptance stops the clock;
   a question about a live offer that raises nothing about its expiry is not one.
2. A client SLA item (a shortlist, a slate, reference reports) is clocked while it is open in the
   SLA tracker.
3. Onboarding windows are clocks: background check consent cutoffs, drug screen windows, I-9
   deadlines, payroll form cutoffs for the first pay run.
4. A panel or interview slot that lapses unless confirmed by a date is a clock.
5. A guarantee claim that obliges a replacement search inside a window is a clock.
6. A date in a pitch, in internal mail or on a bill (payment terms, a renewal notice) is somebody's
   calendar, not a response clock. It raises no alert and does not raise priority.
7. A client's own business target ("someone in seat by November 16") is not the firm's clock.
8. A clock whose date the message does not give has a null `deadline`: a person sets it.

**Where a deadline comes from**, in order: an open item in the offer log, the SLA tracker or the
onboarding tracker that the message names; a "within N days" window counted from the day the message
arrived (business days when it says so); a dated phrase such as "no later than September 28" or "by
Friday". The loader re-derives the deadline on every clocked row and fails if it disagrees.

**Who it reaches.** Offers and candidate mail go to the requisition's recruiter, client mail to its
account owner, scheduling and onboarding to Ben Osei, billing to Chloe Grant. Pitches and internal
mail reach no one. A slot-routed kind whose requisition cannot be matched goes to a person to decide,
so it reaches no named person. Every clock alert goes to Aisha Bello, the director.

**Priority.** A dated item is urgent when the requisition's next scheduled thing waits on that kind
of item (`next_blocks`) and falls on or before the deadline, or when the deadline is three days out
or less; high inside ten days; normal after that. A dated offer or onboarding item is never below
high. Undated: an offer the offer log does not name is high, because it needs logging; a repeat from
a client or a candidate (a `Re: Re:` thread, or the sender saying they are asking again) is high;
pitches and internal mail are low; everything else normal. A message's priority is the most urgent
of its topics and its clock.

## Size floors

The same floors as Meridian's: at least 12 clocked messages, and at least 6 ordinary examples of
every class, or a declared threshold.

**As drafted:** 90 messages, 26 `hard` (29%), 25 `clocked` (8 of them disguised as routine mail:
`r010`, `r022`, `r027`, `r037`, `r047`, `r053`, `r055`, `r066`; 2 with no date at all), 31
multi-topic. Both floors hold, so no threshold is declared.

| class | ordinary | hard |
|---|---|---|
| `offer` | 9 | 5 |
| `candidate` | 16 | 6 |
| `client` | 19 | 7 |
| `scheduling` | 8 | 3 |
| `onboarding` | 9 | 4 |
| `billing` | 7 | 4 |
| `noise` | 11 | 6 |
| `internal` | 7 | 2 |

A multi-topic message counts under each of its classes. `candidate` and `client` run high because
they are sender classes: most offer, scheduling and onboarding mail also carries one of them.

## How to score against this set

```bash
pnpm --filter @builds/sift score --firm rec
```

Report it the way Meridian's is reported: the clocked-item catch rate as the headline with its
false-alarm counterpart beside it, per-class routing and priority accuracy with ordinary and hard
cases separately and `n` beside each, and the share of its own errors the confidence gate caught.

## Known gaps

Recorded, not dropped, and left for the scorecard to show rather than engineered around:

- **A repeat chase with none of the repeat words** (`r033`): "it has been two weeks since we asked
  ... and we haven't seen a single profile". The labels say high; code reads a first ask and says
  normal.
- **A client's own target read as a clock** (`r034`): "we need someone in seat by November 16" is
  Brightwater's business date, not a deadline the firm owes. A dated phrase parses, and because the
  shortlist presentation waits on client items, code raises an urgent alert. Expect a false alarm.
