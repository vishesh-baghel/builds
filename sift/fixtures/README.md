# Sift, labelled fixture set

The measurement instrument for this build. Built **before** the build, on purpose: a fixture set
authored afterwards gets unconsciously shaped by what the system already does, and the accuracy
number stops meaning anything.

**All data here is synthetic.** The firm (Meridian Architects), its projects, contacts, RFIs,
submittals and every inbox message are invented. No client, no real mailbox, no real
correspondence. Nothing here may be presented as evidence of client work.

Status: **not authored yet.** Files below are specified in `docs/prds/sift-v1-prd.md` and are
committed and frozen in Phase 1, before the system is built.

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
| `from`, `subject`, `body`, `received_at` | the message as it would arrive |
| `topics` | the topic class(es) that apply: one, or more for a multi-topic thread |
| `route` | the person/role(s) it should reach |
| `priority` | `urgent` \| `high` \| `normal` \| `low` |
| `deadline` | the response deadline where one exists, else null |
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
| `agency_letter` | is a permit, plan-review, city or regulatory letter | the principal and the coordinator |
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

## Tie-break rules

To be discovered and recorded during labelling (binding on both the labels here and any future
addition), following the fixture-first protocol. Expected shape includes: a clock detected on the
clock judgment even when the topic class is uncertain; an RFI or submittal matched to a project's
schedule outranks a generic priority; an actionable message with a clock outranks its noise-like
framing; internal FYI mail is not routed to a client lead.

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

Recorded here as they are found during labelling, per the protocol: a case the class list cannot
hold gets written down, not dropped, and resolved in code rather than by inventing a one-example
class.
