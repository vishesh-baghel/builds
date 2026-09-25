# sift, scorecard: Hale & Marrow LLP, law firm

**Run date:** 2026-09-25
**Model:** `jev-1.13.0`
**Instrument:** the 90 committed messages in `fixtures/law/inbox.jsonl`, frozen: 27 carry a real clock, 28 are deliberate boundary cases.

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
| **clocked-item catch rate**: clocked messages that raised an owner alert | **89% (24/27)** |
| false alarms: unclocked messages that raised one anyway | 11% (7/63) |
| automation: messages handled with no person asked | 77% (69/90) |

The three are printed together or not at all. Alerting on every message would read here as a full
catch rate beside a high false-alarm rate and low automation, not as a success.

Of the clocked messages, the ordinary ones were caught 18 of 18 and the hard ones 6 of 9.

## Thresholds

| line | value | how it was chosen |
|---|---|---|
| act | 0.65 | swept on the ordinary subset |
| review | 0.50 | swept on the ordinary subset |
| clock | 0.60 | swept on the ordinary subset |


The sweep ran over the **ordinary subset only**; the hard messages were never seen by it, so nothing
here was chosen on the subset it is reported against. The full sweep, 234 combinations, is
committed at `runs/law/sweep.json`. Every class met the six-example floor, so no threshold is declared.

## Results

### Ordinary subset, n = 62

The messages that are not deliberate boundary cases.

| class | n | precision | recall | routed correctly | priority correct |
|---|---|---|---|---|---|
| `court` | 9 | 100% (8/8) | 89% (8/9) | 100% (9/9) | 100% (9/9) |
| `discovery` | 9 | 90% (9/10) | 100% (9/9) | 100% (9/9) | 100% (9/9) |
| `opposing` | 9 | 100% (8/8) | 89% (8/9) | 100% (9/9) | 89% (8/9) |
| `client` | 7 | 80% (4/5) | 57% (4/7) | 57% (4/7) | 57% (4/7) |
| `intake` | 7 | 78% (7/9) | 100% (7/7) | 100% (7/7) | 100% (7/7) |
| `billing` | 7 | 88% (7/8) | 100% (7/7) | 86% (6/7) | 86% (6/7) |
| `noise` | 10 | 100% (9/9) | 90% (9/10) | 100% (10/10) | 100% (10/10) |
| `internal` | 7 | 58% (7/12) | 100% (7/7) | 57% (4/7) | 43% (3/7) |

**Errors:** 13 of 62 messages were wrong on at least one count (topics, route, priority or clock).
Of those 13, the confidence gate sent 8 to a person: 62% (8/13).

**Automation:** 48 of 62 were handled with no person asked; 14 reached one.

### Hard subset, n = 28

The messages written to sit on a boundary: clocks disguised as routine mail, multi-topic threads, dates that are not clocks. Scored apart on purpose.

| class | n | precision | recall | routed correctly | priority correct |
|---|---|---|---|---|---|
| `court` | 3 | 100% (3/3) | 100% (3/3) | 100% (3/3) | 100% (3/3) |
| `discovery` | 5 | 83% (5/6) | 100% (5/5) | 100% (5/5) | 100% (5/5) |
| `opposing` | 4 | 100% (4/4) | 100% (4/4) | 75% (3/4) | 75% (3/4) |
| `client` | 6 | 100% (4/4) | 67% (4/6) | 100% (6/6) | 83% (5/6) |
| `intake` | 3 | 100% (3/3) | 100% (3/3) | 67% (2/3) | 67% (2/3) |
| `billing` | 3 | 100% (3/3) | 100% (3/3) | 67% (2/3) | 67% (2/3) |
| `noise` | 6 | 100% (6/6) | 100% (6/6) | 67% (4/6) | 67% (4/6) |
| `internal` | 2 | 67% (2/3) | 100% (2/2) | 0% (0/2) | 0% (0/2) |

**Errors:** 12 of 28 messages were wrong on at least one count (topics, route, priority or clock).
Of those 12, the confidence gate sent 5 to a person: 42% (5/12).

**Automation:** 21 of 28 were handled with no person asked; 7 reached one.

## Measured cost and time

Both from this run's real token counts and wall-clock timings.

| figure | value |
|---|---|
| messages judged | 90 |
| input tokens, total | 120,534 |
| cost, total | 0.506 cents |
| **cost per message** | **0.0056 cents** |
| **machine time per message, median** | **114 ms** |
| machine time per message, mean | 123 ms |

Output tokens are not billed on this model, so the cost figure is input only. Every judgment behind
these figures is committed at `runs/law/run.json`, so the whole scorecard can be recomputed at
these thresholds or any others without spending again.

## What these numbers are not

The probabilities are the model's raw judgment, not calibrated frequencies: jev-1.13 is documented
as weakly numerically calibrated, which is why the lines were swept on this build's own data rather
than borrowed. No human-time figure appears on this page.
