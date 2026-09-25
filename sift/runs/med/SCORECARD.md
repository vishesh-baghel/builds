# sift, scorecard: Cedar Grove Dental, dental practice

**Run date:** 2026-09-25
**Model:** `jev-1.13.0`
**Instrument:** the 90 committed messages in `fixtures/med/inbox.jsonl`, frozen: 28 carry a real clock, 28 are deliberate boundary cases.

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
| **clocked-item catch rate**: clocked messages that raised an owner alert | **96% (27/28)** |
| false alarms: unclocked messages that raised one anyway | 15% (9/62) |
| automation: messages handled with no person asked | 90% (81/90) |

The three are printed together or not at all. Alerting on every message would read here as a full
catch rate beside a high false-alarm rate and low automation, not as a success.

Of the clocked messages, the ordinary ones were caught 16 of 16 and the hard ones 11 of 12.

## Thresholds

| line | value | how it was chosen |
|---|---|---|
| act | 0.55 | swept on the ordinary subset |
| review | 0.50 | swept on the ordinary subset |
| clock | 0.40 | swept on the ordinary subset |


The sweep ran over the **ordinary subset only**; the hard messages were never seen by it, so nothing
here was chosen on the subset it is reported against. The full sweep, 234 combinations, is
committed at `runs/med/sweep.json`. Every class met the six-example floor, so no threshold is declared.

## Results

### Ordinary subset, n = 62

The messages that are not deliberate boundary cases.

| class | n | precision | recall | routed correctly | priority correct |
|---|---|---|---|---|---|
| `claim` | 9 | 100% (9/9) | 100% (9/9) | 100% (9/9) | 100% (9/9) |
| `lab` | 7 | 100% (6/6) | 86% (6/7) | 100% (7/7) | 100% (7/7) |
| `appt` | 7 | 100% (6/6) | 86% (6/7) | 86% (6/7) | 86% (6/7) |
| `records` | 8 | 100% (8/8) | 100% (8/8) | 100% (8/8) | 100% (8/8) |
| `patient` | 8 | 100% (8/8) | 100% (8/8) | 100% (8/8) | 100% (8/8) |
| `vendor` | 6 | 100% (5/5) | 83% (5/6) | 67% (4/6) | 67% (4/6) |
| `noise` | 12 | 100% (12/12) | 100% (12/12) | 100% (12/12) | 100% (12/12) |
| `internal` | 7 | 78% (7/9) | 100% (7/7) | 100% (7/7) | 100% (7/7) |

**Errors:** 5 of 62 messages were wrong on at least one count (topics, route, priority or clock).
Of those 5, the confidence gate sent 3 to a person: 60% (3/5).

**Automation:** 57 of 62 were handled with no person asked; 5 reached one.

### Hard subset, n = 28

The messages written to sit on a boundary: clocks disguised as routine mail, multi-topic threads, dates that are not clocks. Scored apart on purpose.

| class | n | precision | recall | routed correctly | priority correct |
|---|---|---|---|---|---|
| `claim` | 7 | 88% (7/8) | 100% (7/7) | 100% (7/7) | 100% (7/7) |
| `lab` | 5 | 100% (3/3) | 60% (3/5) | 80% (4/5) | 60% (3/5) |
| `appt` | 3 | 100% (3/3) | 100% (3/3) | 100% (3/3) | 67% (2/3) |
| `records` | 2 | 100% (2/2) | 100% (2/2) | 50% (1/2) | 100% (2/2) |
| `patient` | 3 | 100% (3/3) | 100% (3/3) | 67% (2/3) | 67% (2/3) |
| `vendor` | 2 | 100% (2/2) | 100% (2/2) | 0% (0/2) | 50% (1/2) |
| `noise` | 5 | 100% (5/5) | 100% (5/5) | 40% (2/5) | 40% (2/5) |
| `internal` | 3 | 50% (3/6) | 100% (3/3) | 0% (0/3) | 0% (0/3) |

**Errors:** 15 of 28 messages were wrong on at least one count (topics, route, priority or clock).
Of those 15, the confidence gate sent 3 to a person: 20% (3/15).

**Automation:** 24 of 28 were handled with no person asked; 4 reached one.

## Measured cost and time

Both from this run's real token counts and wall-clock timings.

| figure | value |
|---|---|
| messages judged | 90 |
| input tokens, total | 125,809 |
| cost, total | 0.528 cents |
| **cost per message** | **0.0059 cents** |
| **machine time per message, median** | **117 ms** |
| machine time per message, mean | 124 ms |

Output tokens are not billed on this model, so the cost figure is input only. Every judgment behind
these figures is committed at `runs/med/run.json`, so the whole scorecard can be recomputed at
these thresholds or any others without spending again.

## What these numbers are not

The probabilities are the model's raw judgment, not calibrated frequencies: jev-1.13 is documented
as weakly numerically calibrated, which is why the lines were swept on this build's own data rather
than borrowed. No human-time figure appears on this page.
