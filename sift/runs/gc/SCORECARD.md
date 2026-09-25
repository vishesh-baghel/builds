# sift, scorecard: Brightwater Builders, general contractor

**Run date:** 2026-09-25
**Model:** `jev-1.13.0`
**Instrument:** the 90 committed messages in `fixtures/gc/inbox.jsonl`, frozen: 27 carry a real clock, 25 are deliberate boundary cases.

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
| **clocked-item catch rate**: clocked messages that raised an owner alert | **100% (27/27)** |
| false alarms: unclocked messages that raised one anyway | 16% (10/63) |
| automation: messages handled with no person asked | 69% (62/90) |

The three are printed together or not at all. Alerting on every message would read here as a full
catch rate beside a high false-alarm rate and low automation, not as a success.

Of the clocked messages, the ordinary ones were caught 15 of 15 and the hard ones 12 of 12.

## Thresholds

| line | value | how it was chosen |
|---|---|---|
| act | 0.50 | swept on the ordinary subset |
| review | 0.40 | swept on the ordinary subset |
| clock | 0.70 | swept on the ordinary subset |


The sweep ran over the **ordinary subset only**; the hard messages were never seen by it, so nothing
here was chosen on the subset it is reported against. The full sweep, 234 combinations, is
committed at `runs/gc/sweep.json`. Every class met the six-example floor, so no threshold is declared.

## Results

### Ordinary subset, n = 65

The messages that are not deliberate boundary cases.

| class | n | precision | recall | routed correctly | priority correct |
|---|---|---|---|---|---|
| `co` | 9 | 90% (9/10) | 100% (9/9) | 100% (9/9) | 100% (9/9) |
| `bid` | 9 | 90% (9/10) | 100% (9/9) | 89% (8/9) | 100% (9/9) |
| `inspection` | 7 | 100% (6/6) | 86% (6/7) | 86% (6/7) | 86% (6/7) |
| `sub` | 9 | 47% (8/17) | 89% (8/9) | 89% (8/9) | 89% (8/9) |
| `owner` | 8 | 75% (3/4) | 38% (3/8) | 38% (3/8) | 50% (4/8) |
| `invoice` | 7 | 100% (6/6) | 86% (6/7) | 0% (0/7) | 71% (5/7) |
| `noise` | 10 | 100% (10/10) | 100% (10/10) | 100% (10/10) | 90% (9/10) |
| `internal` | 6 | 26% (6/23) | 100% (6/6) | 67% (4/6) | 67% (4/6) |

**Errors:** 30 of 65 messages were wrong on at least one count (topics, route, priority or clock).
Of those 30, the confidence gate sent 14 to a person: 47% (14/30).

**Automation:** 44 of 65 were handled with no person asked; 21 reached one.

### Hard subset, n = 25

The messages written to sit on a boundary: clocks disguised as routine mail, multi-topic threads, dates that are not clocks. Scored apart on purpose.

| class | n | precision | recall | routed correctly | priority correct |
|---|---|---|---|---|---|
| `co` | 3 | 75% (3/4) | 100% (3/3) | 100% (3/3) | 100% (3/3) |
| `bid` | 2 | 100% (2/2) | 100% (2/2) | 100% (2/2) | 100% (2/2) |
| `inspection` | 4 | 80% (4/5) | 100% (4/4) | 100% (4/4) | 100% (4/4) |
| `sub` | 4 | 100% (3/3) | 75% (3/4) | 50% (2/4) | 50% (2/4) |
| `owner` | 4 | 80% (4/5) | 100% (4/4) | 50% (2/4) | 75% (3/4) |
| `invoice` | 2 | 50% (1/2) | 50% (1/2) | 0% (0/2) | 0% (0/2) |
| `noise` | 5 | 100% (5/5) | 100% (5/5) | 60% (3/5) | 60% (3/5) |
| `internal` | 3 | 38% (3/8) | 100% (3/3) | 33% (1/3) | 33% (1/3) |

**Errors:** 13 of 25 messages were wrong on at least one count (topics, route, priority or clock).
Of those 13, the confidence gate sent 5 to a person: 38% (5/13).

**Automation:** 18 of 25 were handled with no person asked; 7 reached one.

## Measured cost and time

Both from this run's real token counts and wall-clock timings.

| figure | value |
|---|---|
| messages judged | 90 |
| input tokens, total | 129,700 |
| cost, total | 0.545 cents |
| **cost per message** | **0.0061 cents** |
| **machine time per message, median** | **110 ms** |
| machine time per message, mean | 120 ms |

Output tokens are not billed on this model, so the cost figure is input only. Every judgment behind
these figures is committed at `runs/gc/run.json`, so the whole scorecard can be recomputed at
these thresholds or any others without spending again.

## What these numbers are not

The probabilities are the model's raw judgment, not calibrated frequencies: jev-1.13 is documented
as weakly numerically calibrated, which is why the lines were swept on this build's own data rather
than borrowed. No human-time figure appears on this page.
