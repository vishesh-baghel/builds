# sift, scorecard: Larkin & Voss CPAs, accounting firm

**Run date:** 2026-09-25
**Model:** `jev-1.13.0`
**Instrument:** the 90 committed messages in `fixtures/cpa/inbox.jsonl`, frozen: 25 carry a real clock, 27 are deliberate boundary cases.

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
| **clocked-item catch rate**: clocked messages that raised an owner alert | **100% (25/25)** |
| false alarms: unclocked messages that raised one anyway | 15% (10/65) |
| automation: messages handled with no person asked | 77% (69/90) |

The three are printed together or not at all. Alerting on every message would read here as a full
catch rate beside a high false-alarm rate and low automation, not as a success.

Of the clocked messages, the ordinary ones were caught 15 of 15 and the hard ones 10 of 10.

## Thresholds

| line | value | how it was chosen |
|---|---|---|
| act | 0.60 | swept on the ordinary subset |
| review | 0.50 | swept on the ordinary subset |
| clock | 0.50 | swept on the ordinary subset |


The sweep ran over the **ordinary subset only**; the hard messages were never seen by it, so nothing
here was chosen on the subset it is reported against. The full sweep, 234 combinations, is
committed at `runs/cpa/sweep.json`. Every class met the six-example floor, so no threshold is declared.

## Results

### Ordinary subset, n = 63

The messages that are not deliberate boundary cases.

| class | n | precision | recall | routed correctly | priority correct |
|---|---|---|---|---|---|
| `notice` | 8 | 100% (6/6) | 75% (6/8) | 75% (6/8) | 75% (6/8) |
| `docs` | 7 | 88% (7/8) | 100% (7/7) | 100% (7/7) | 100% (7/7) |
| `question` | 9 | 89% (8/9) | 89% (8/9) | 89% (8/9) | 100% (9/9) |
| `payroll` | 7 | 88% (7/8) | 100% (7/7) | 86% (6/7) | 86% (6/7) |
| `prospect` | 7 | 100% (7/7) | 100% (7/7) | 86% (6/7) | 100% (7/7) |
| `billing` | 7 | 100% (7/7) | 100% (7/7) | 86% (6/7) | 86% (6/7) |
| `noise` | 14 | 100% (14/14) | 100% (14/14) | 100% (14/14) | 100% (14/14) |
| `internal` | 6 | 30% (6/20) | 100% (6/6) | 83% (5/6) | 83% (5/6) |

**Errors:** 21 of 63 messages were wrong on at least one count (topics, route, priority or clock).
Of those 21, the confidence gate sent 3 to a person: 14% (3/21).

**Automation:** 54 of 63 were handled with no person asked; 9 reached one.

### Hard subset, n = 27

The messages written to sit on a boundary: clocks disguised as routine mail, multi-topic threads, dates that are not clocks. Scored apart on purpose.

| class | n | precision | recall | routed correctly | priority correct |
|---|---|---|---|---|---|
| `notice` | 10 | 70% (7/10) | 70% (7/10) | 30% (3/10) | 80% (8/10) |
| `docs` | 4 | 67% (4/6) | 100% (4/4) | 100% (4/4) | 75% (3/4) |
| `question` | 5 | 50% (3/6) | 60% (3/5) | 40% (2/5) | 80% (4/5) |
| `payroll` | 4 | 57% (4/7) | 100% (4/4) | 50% (2/4) | 100% (4/4) |
| `prospect` | 2 | 100% (2/2) | 100% (2/2) | 0% (0/2) | 50% (1/2) |
| `billing` | 1 | 100% (1/1) | 100% (1/1) | 0% (0/1) | 100% (1/1) |
| `noise` | 5 | 100% (4/4) | 80% (4/5) | 60% (3/5) | 60% (3/5) |
| `internal` | 3 | 43% (3/7) | 100% (3/3) | 0% (0/3) | 33% (1/3) |

**Errors:** 21 of 27 messages were wrong on at least one count (topics, route, priority or clock).
Of those 21, the confidence gate sent 10 to a person: 48% (10/21).

**Automation:** 15 of 27 were handled with no person asked; 12 reached one.

## Measured cost and time

Both from this run's real token counts and wall-clock timings.

| figure | value |
|---|---|
| messages judged | 90 |
| input tokens, total | 113,021 |
| cost, total | 0.475 cents |
| **cost per message** | **0.0053 cents** |
| **machine time per message, median** | **110 ms** |
| machine time per message, mean | 116 ms |

Output tokens are not billed on this model, so the cost figure is input only. Every judgment behind
these figures is committed at `runs/cpa/run.json`, so the whole scorecard can be recomputed at
these thresholds or any others without spending again.

## What these numbers are not

The probabilities are the model's raw judgment, not calibrated frequencies: jev-1.13 is documented
as weakly numerically calibrated, which is why the lines were swept on this build's own data rather
than borrowed. No human-time figure appears on this page.
