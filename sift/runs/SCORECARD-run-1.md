# sift, scorecard, run 1 (generic question criteria, superseded)

**Run date:** 2026-09-23
**Model:** `jev-1.13.0`
**Instrument:** the 91 committed messages in `fixtures/inbox.jsonl`, frozen: 30 carry a real clock, 26 are deliberate boundary cases.

All data is synthetic. This is a self-built experiment on invented data: no client, no client names,
no client results. There is no before/after comparison anywhere on this page: no pre-baseline was
taken, and inventing one afterwards would be worse than having none.

**There is deliberately no overall accuracy figure.** The inbox is imbalanced on purpose, pitches
the plurality, to look like a real shared mailbox. A system that labelled everything a pitch would
post a respectable overall number while missing every expensive message. Everything below is per
class, with its `n` beside it.

## The headline

| measure | value |
|---|---|
| **clocked-item catch rate**: clocked messages that raised an owner alert | **100% (30/30)** |
| false alarms: unclocked messages that raised one anyway | 18% (11/61) |
| automation: messages handled with no person asked | 41% (37/91) |

The three are printed together or not at all. Alerting on every message would read here as a full
catch rate beside a high false-alarm rate and low automation, not as a success.

Of the clocked messages, the ordinary ones were caught 21 of 21 and the hard ones 9 of 9.

## Thresholds

| line | value | how it was chosen |
|---|---|---|
| act | 0.50 | swept on the ordinary subset |
| review | 0.40 | swept on the ordinary subset |
| clock | 0.50 | swept on the ordinary subset |


The sweep ran over the **ordinary subset only**; the hard messages were never seen by it, so nothing
here was chosen on the subset it is reported against. The full sweep, 234 combinations, is
committed at `runs/sweep.json`. Every class met the six-example floor, so no threshold is declared.

## Results

### Ordinary subset, n = 65

The messages that are not deliberate boundary cases.

| class | n | precision | recall | routed correctly | priority correct |
|---|---|---|---|---|---|
| `rfi` | 12 | 92% (11/12) | 92% (11/12) | 92% (11/12) | 100% (12/12) |
| `submittal` | 8 | 100% (6/6) | 75% (6/8) | 75% (6/8) | 88% (7/8) |
| `agency_letter` | 6 | 75% (3/4) | 50% (3/6) | 100% (6/6) | 83% (5/6) |
| `invoice` | 6 | 100% (5/5) | 83% (5/6) | 17% (1/6) | 17% (1/6) |
| `client_status` | 6 | 100% (6/6) | 100% (6/6) | 83% (5/6) | 83% (5/6) |
| `other` | 7 | 20% (3/15) | 43% (3/7) | 100% (7/7) | 57% (4/7) |
| `vendor_pitch` | 12 | 100% (11/11) | 92% (11/12) | 92% (11/12) | 17% (2/12) |
| `internal` | 8 | 73% (8/11) | 100% (8/8) | 100% (8/8) | 88% (7/8) |

**Errors:** 30 of 65 messages were wrong on at least one count (topics, route, priority or clock).
Of those 30, the confidence gate sent 27 to a person: 90% (27/30).

**Automation:** 26 of 65 were handled with no person asked; 39 reached one.

### Hard subset, n = 26

The messages written to sit on a boundary: clocks disguised as routine mail, multi-topic threads, dates that are not clocks. Scored apart on purpose.

| class | n | precision | recall | routed correctly | priority correct |
|---|---|---|---|---|---|
| `rfi` | 5 | 71% (5/7) | 100% (5/5) | 40% (2/5) | 100% (5/5) |
| `submittal` | 4 | 100% (3/3) | 75% (3/4) | 25% (1/4) | 75% (3/4) |
| `agency_letter` | 5 | 100% (2/2) | 40% (2/5) | 100% (5/5) | 80% (4/5) |
| `invoice` | 2 | 100% (1/1) | 50% (1/2) | 0% (0/2) | 50% (1/2) |
| `client_status` | 3 | 33% (1/3) | 33% (1/3) | 0% (0/3) | 33% (1/3) |
| `other` | 2 | 13% (1/8) | 50% (1/2) | 100% (2/2) | 50% (1/2) |
| `vendor_pitch` | 6 | 100% (6/6) | 100% (6/6) | 83% (5/6) | 0% (0/6) |
| `internal` | 2 | 40% (2/5) | 100% (2/2) | 0% (0/2) | 0% (0/2) |

**Errors:** 21 of 26 messages were wrong on at least one count (topics, route, priority or clock).
Of those 21, the confidence gate sent 14 to a person: 67% (14/21).

**Automation:** 11 of 26 were handled with no person asked; 15 reached one.

## Measured cost and time

Both from this run's real token counts and wall-clock timings.

| figure | value |
|---|---|
| messages judged | 91 |
| input tokens, total | 90,719 |
| cost, total | 0.381 cents |
| **cost per message** | **0.0042 cents** |
| **machine time per message, median** | **471 ms** |
| machine time per message, mean | 496 ms |

Output tokens are not billed on this model, so the cost figure is input only. Every judgment behind
these figures is committed at `runs/run.json`, so the whole scorecard can be recomputed at
these thresholds or any others without spending again.

## What these numbers are not

The probabilities are the model's raw judgment, not calibrated frequencies: jev-1.13 is documented
as weakly numerically calibrated, which is why the lines were swept on this build's own data rather
than borrowed. No human-time figure appears on this page.
