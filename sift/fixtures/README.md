# Sift, labelled fixture set

The measurement instrument for this build. Built **before** the build, on purpose: a fixture set
authored afterwards gets unconsciously shaped by what the system already does, and the accuracy
number stops meaning anything.

**All data here is synthetic.** The firm (Meridian Architects), its projects, contacts, RFIs,
submittals and every inbox message are invented. No client, no real mailbox, no real
correspondence. Nothing here may be presented as evidence of client work.

Status: **frozen at the first scored run, 2026-09-23.** Any label change from here is recorded in
`docs/VARIANCE-LOG.md`, never made silently. 91 messages and four systems of record,
authored to the distribution in `docs/prds/sift-v1-prd.md`.
`fixtures.json` is the generated snapshot the app reads; regenerate it with
`pnpm --filter @builds/sift snapshot` after any edit, or the gate fails.

## Files

- `inbox.jsonl`: hand-labelled shared-inbox messages at a deliberately imbalanced real-inbox
  distribution (mostly noise).
- `projects.csv`: the project list, with schedule milestones (for example the next pour date).
  This is what makes firm-specific priority computable rather than guessed from message words.
- `rfi-log.csv`: open RFIs and their contractual response windows.
- `submittal-log.csv`: open submittals and their review status.
- `contacts.csv`: the CRM, who holds which role on which project.

## Message record shape

| Field | Meaning |
|---|---|
| `id` | stable identifier, `m001` onward |
| `from`, `email`, `subject`, `body`, `received_at` | the message as it would arrive; `received_at` is `YYYY-MM-DD HH:MM` |
| `topics` | the topic class(es) that apply: one, or more for a multi-topic thread |
| `route` | everyone it should reach, sorted: the owner of each topic, plus the principal when a clock alert is due |
| `priority` | `urgent` \| `high` \| `normal` \| `low` |
| `deadline` | on a clocked message, the response deadline, or null when a clock runs with no date; null otherwise |
| `clocked` | whether it carries a contractual or regulatory clock |
| `project` | the matched project key in `projects.csv`, else null |
| `hard` | boundary case, deliberately included |
| `note` | why these labels, and what makes it hard |

## The topic classes

Classes come from what the code must do *differently*: if two triggered the same route, priority
and action, they would be one class. Each is a yes/no judgment; a message may assert more than
one.

| Class | The message | routes to |
|---|---|---|
| `rfi` | is a contractor request for information (blocks work, has a response window) | the project's coordinator |
| `submittal` | is a product/material submittal to review or approve | the reviewing architect |
| `agency_letter` | is a permit, plan-review, city or regulatory letter | the principal (see the variance log) |
| `invoice` | is a consultant or vendor bill | accounting |
| `client_status` | is a client asking about progress, or chasing one | the client's project lead |
| `vendor_pitch` | is vendor marketing or unsolicited noise | no one |
| `internal` | is internal team correspondence | stays on its thread, low priority |
| `other` | is actionable but outside the taxonomy | escalates |

**The clock is a separate judgment.** A ninth question, `carries_clock`, asks only whether the
message starts a contractual or regulatory clock, independent of topic, because the hardest case
is a clocked item whose surface form looks routine. Its threshold is set low: on a clock, a false
alarm costs a glance, a miss costs a deadline.

## Size floors, binding before the freeze

The set must be large enough that its numbers are measurements rather than anecdotes:

- the `clocked` subset (the headline's denominator) holds at least 12 messages, split across
  routine-looking and overt clocks;
- every topic class holds at least 6 ordinary examples, or its threshold is declared rather than
  swept with its `n` and reason recorded in `policy.ts`.

The total is whatever meets both floors, expected to land above 60 (likely 80 to 100), with noise
the plurality and roughly a third flagged `hard`.

**As drafted:** 91 messages, 26 `hard` (29%), 30 `clocked` (9 of them disguised as routine mail, one
with no date at all), 3 multi-topic. Both floors hold, so no threshold is declared. A test fails the
gate if either floor is ever broken.

| class | ordinary | hard |
|---|---|---|
| `rfi` | 12 | 5 |
| `submittal` | 8 | 4 |
| `agency_letter` | 6 | 5 |
| `invoice` | 6 | 2 |
| `client_status` | 6 | 3 |
| `other` | 7 | 2 |
| `vendor_pitch` | 12 | 6 |
| `internal` | 8 | 2 |

A multi-topic message counts under each of its classes.

## Labelling rules

Discovered while labelling and binding on both the labels here and the code in `src/stages/`. The
code states each once; a test asserts that, given a perfect judgment, every ordinary message lands
exactly where its labels say.

**Class boundaries.** Each is the class table above, plus the labelling notes on the messages that
sit on its edge. These were written before the first scored run; the question criteria in
`src/questions.ts` state them to the model, and nothing was added to them from a run's results.

- `rfi`: a question about the drawings or specifications that construction is waiting on, numbered
  or not, whoever passes it along. A request to approve product data is a submittal even when it is
  titled RFI; closing out an RFI already answered asks nothing new, but is still RFI correspondence.
- `submittal`: product data, samples, shop drawings, mix designs or cut sheets sent for review or
  approval, including resubmittals, reminders about a pending review and confirmations of one done.
- `agency_letter`: a letter or automated notice from a city, county, state or other authority about
  a permit, plan review, inspection, hearing, licence or compliance, including one someone forwards.
- `invoice`: a bill or statement asking the firm to pay for something it bought. A solicitation that
  says it is not a bill is a pitch.
- `client_status`: a client asking about progress, schedule or an outstanding item, first ask or
  repeat. A client relaying a contractor's question carries an RFI; a client forwarding an
  authority's letter carries an agency letter.
- `vendor_pitch`: unsolicited marketing, however urgent or official it sounds: offers, trials, demos,
  directory listings, recruiting, event invitations.
- `internal`: mail between the firm's own staff, including forwards and assignments among them.
- `other`: actionable mail none of the seven kinds above holds: insurance, legal, press, employment,
  new-business requests. If any of the seven fits, it is not `other`.

**What is a clock.**

1. An RFI's clock is the window in the RFI log. An RFI the log has not seen yet has no clock; it is
   high priority because it still needs logging. An answered RFI has none.
2. A submittal's clock is its review date in the submittal log, until it is approved.
3. An agency letter is clocked when it obliges a response, correction, filing or readiness by a
   date or within a window. A notice of a hearing, or a passed inspection, is not.
4. A date in a vendor pitch, in internal mail or on a bill is somebody's calendar, not a response
   clock. It raises no alert and does not raise priority.
5. A client's own contractual date (a lease, a board meeting) is not the firm's clock.
6. A clock whose date the message does not give has a null `deadline`. The right outcome is a
   person setting it; code never guesses one.

**Where a deadline comes from**, in order: an open RFI or submittal the message names; a "within N
days" window counted from the day the message arrived (calendar days unless it says business,
working or court days); a dated phrase such as "by October 2" or "no later than Friday". The loader
re-derives the deadline on every clocked row from the text and the logs and fails if it disagrees
with the committed field.

**Who it reaches.** An RFI goes to the project's coordinator, a submittal to its reviewer, an agency
letter to the principal, an invoice to accounting, a client chasing status to the project lead.
Pitches and internal mail reach no one. `other`, and any topic whose project cannot be matched, goes
to a person to decide, so it reaches no named person. Every clock alert goes to the principal.

**Priority.** A dated item is urgent when the project's next scheduled activity waits on that kind
of item (`next_blocks` in `projects.csv`) and falls on or before the deadline, or when the deadline
is three days out or less; high inside ten days; normal after that. A dated agency letter is never
below high. Undated: an unlogged RFI is high, a repeat status chase (a threaded reply, or the sender
saying they are asking again) is high, pitches and internal mail are low, everything else normal. A
message's priority is the most urgent of its topics and its clock.

## How to score against this set

**Report per-class, not overall.** The distribution is deliberately imbalanced to look like a
real inbox, so a system that answered `vendor_pitch`/noise every time would post a
respectable-looking overall accuracy while missing the rare, expensive items.

Report, at minimum:

- the **clocked-item catch rate** as the headline: of all `clocked` messages, the share flagged
  with an owner alert, with its false-alarm counterpart on the unclocked subset printed beside it
  so alerting on everything does not read as success;
- per-class routing accuracy and priority accuracy, ordinary and `hard` cases **separately**,
  with `n` beside each;
- the share of its own errors the confidence gate caught, on which the reliability claim rests,
  not on raw accuracy.

## Known gaps

Recorded, not dropped, and left for the scorecard to show rather than engineered around:

- **A repeat chase with none of the repeat words** (`m076`): "it has been three weeks since our last
  update". The labels say high; code reads a first ask and says normal.
- **A client's contractual date read as a clock** (`m077`): "our lease requires the clinic to open by
  December 1" is not the firm's deadline, but a dated phrase parses. Expect a false alarm here.
- **An empty forward** (`m117`): "fyi" and nothing else. Labelled `other`; there is nothing for any
  class to hold.
- **A permit correction forwarded internally** (`m109`): internal mail carrying a window. Counting from
  the forward would give the wrong date; the original arrived as `m040`.
