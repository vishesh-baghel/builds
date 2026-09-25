# sift, scorecard: Northgate Property Group, property management

**Run date:** 2026-09-25
**Model:** `jev-1.13.0`
**Instrument:** the 92 committed messages in `fixtures/prop/inbox.jsonl`, frozen: 29 carry a real clock, 31 are deliberate boundary cases.

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
| **clocked-item catch rate**: clocked messages that raised an owner alert | **90% (26/29)** |
| false alarms: unclocked messages that raised one anyway | 10% (6/63) |
| automation: messages handled with no person asked | 76% (70/92) |

The three are printed together or not at all. Alerting on every message would read here as a full
catch rate beside a high false-alarm rate and low automation, not as a success.

Of the clocked messages, the ordinary ones were caught 16 of 16 and the hard ones 10 of 13.

## Thresholds

| line | value | how it was chosen |
|---|---|---|
| act | 0.65 | swept on the ordinary subset |
| review | 0.50 | swept on the ordinary subset |
| clock | 0.70 | swept on the ordinary subset |


The sweep ran over the **ordinary subset only**; the hard messages were never seen by it, so nothing
here was chosen on the subset it is reported against. The full sweep, 234 combinations, is
committed at `runs/prop/sweep.json`. Every class met the six-example floor, so no threshold is declared.

## Results

### Ordinary subset, n = 61

The messages that are not deliberate boundary cases.

| class | n | precision | recall | routed correctly | priority correct |
|---|---|---|---|---|---|
| `maint` | 10 | 91% (10/11) | 100% (10/10) | 70% (7/10) | 100% (10/10) |
| `code` | 8 | 100% (3/3) | 38% (3/8) | 75% (6/8) | 50% (4/8) |
| `lease` | 7 | 78% (7/9) | 100% (7/7) | 86% (6/7) | 100% (7/7) |
| `complaint` | 7 | 58% (7/12) | 100% (7/7) | 100% (7/7) | 100% (7/7) |
| `payment` | 7 | 70% (7/10) | 100% (7/7) | 71% (5/7) | 86% (6/7) |
| `vendor` | 6 | 100% (4/4) | 67% (4/6) | 33% (2/6) | 50% (3/6) |
| `noise` | 13 | 100% (13/13) | 100% (13/13) | 85% (11/13) | 85% (11/13) |
| `internal` | 7 | 64% (7/11) | 100% (7/7) | 43% (3/7) | 43% (3/7) |

**Errors:** 23 of 61 messages were wrong on at least one count (topics, route, priority or clock).
Of those 23, the confidence gate sent 10 to a person: 43% (10/23).

**Automation:** 45 of 61 were handled with no person asked; 16 reached one.

### Hard subset, n = 31

The messages written to sit on a boundary: clocks disguised as routine mail, multi-topic threads, dates that are not clocks. Scored apart on purpose.

| class | n | precision | recall | routed correctly | priority correct |
|---|---|---|---|---|---|
| `maint` | 10 | 89% (8/9) | 80% (8/10) | 40% (4/10) | 80% (8/10) |
| `code` | 5 | 100% (5/5) | 100% (5/5) | 60% (3/5) | 100% (5/5) |
| `lease` | 4 | 80% (4/5) | 100% (4/4) | 50% (2/4) | 75% (3/4) |
| `complaint` | 5 | 71% (5/7) | 100% (5/5) | 60% (3/5) | 80% (4/5) |
| `payment` | 5 | 63% (5/8) | 100% (5/5) | 80% (4/5) | 100% (5/5) |
| `vendor` | 3 | 100% (3/3) | 100% (3/3) | 67% (2/3) | 67% (2/3) |
| `noise` | 5 | 100% (5/5) | 100% (5/5) | 60% (3/5) | 60% (3/5) |
| `internal` | 3 | 75% (3/4) | 100% (3/3) | 33% (1/3) | 100% (3/3) |

**Errors:** 13 of 31 messages were wrong on at least one count (topics, route, priority or clock).
Of those 13, the confidence gate sent 2 to a person: 15% (2/13).

**Automation:** 25 of 31 were handled with no person asked; 6 reached one.

## Measured cost and time

Both from this run's real token counts and wall-clock timings.

| figure | value |
|---|---|
| messages judged | 92 |
| input tokens, total | 120,001 |
| cost, total | 0.504 cents |
| **cost per message** | **0.0055 cents** |
| **machine time per message, median** | **116 ms** |
| machine time per message, mean | 126 ms |

Output tokens are not billed on this model, so the cost figure is input only. Every judgment behind
these figures is committed at `runs/prop/run.json`, so the whole scorecard can be recomputed at
these thresholds or any others without spending again.

## What these numbers are not

The probabilities are the model's raw judgment, not calibrated frequencies: jev-1.13 is documented
as weakly numerically calibrated, which is why the lines were swept on this build's own data rather
than borrowed. No human-time figure appears on this page.
