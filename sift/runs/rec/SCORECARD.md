# sift, scorecard: Fieldstone Talent, recruiting agency

**Run date:** 2026-09-25
**Model:** `jev-1.13.0`
**Instrument:** the 90 committed messages in `fixtures/rec/inbox.jsonl`, frozen: 25 carry a real clock, 26 are deliberate boundary cases.

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
| **clocked-item catch rate**: clocked messages that raised an owner alert | **84% (21/25)** |
| false alarms: unclocked messages that raised one anyway | 6% (4/65) |
| automation: messages handled with no person asked | 78% (70/90) |

The three are printed together or not at all. Alerting on every message would read here as a full
catch rate beside a high false-alarm rate and low automation, not as a success.

Of the clocked messages, the ordinary ones were caught 14 of 16 and the hard ones 7 of 9.

## Thresholds

| line | value | how it was chosen |
|---|---|---|
| act | 0.60 | swept on the ordinary subset |
| review | 0.50 | swept on the ordinary subset |
| clock | 0.70 | swept on the ordinary subset |


The sweep ran over the **ordinary subset only**; the hard messages were never seen by it, so nothing
here was chosen on the subset it is reported against. The full sweep, 234 combinations, is
committed at `runs/rec/sweep.json`. Every class met the six-example floor, so no threshold is declared.

## Results

### Ordinary subset, n = 64

The messages that are not deliberate boundary cases.

| class | n | precision | recall | routed correctly | priority correct |
|---|---|---|---|---|---|
| `offer` | 9 | 82% (9/11) | 100% (9/9) | 78% (7/9) | 100% (9/9) |
| `candidate` | 16 | 100% (13/13) | 81% (13/16) | 81% (13/16) | 94% (15/16) |
| `client` | 19 | 86% (6/7) | 32% (6/19) | 42% (8/19) | 89% (17/19) |
| `scheduling` | 8 | 80% (8/10) | 100% (8/8) | 50% (4/8) | 100% (8/8) |
| `onboarding` | 9 | 64% (9/14) | 100% (9/9) | 100% (9/9) | 100% (9/9) |
| `billing` | 7 | 75% (6/8) | 86% (6/7) | 43% (3/7) | 86% (6/7) |
| `noise` | 11 | 100% (11/11) | 100% (11/11) | 91% (10/11) | 91% (10/11) |
| `internal` | 7 | 28% (7/25) | 100% (7/7) | 43% (3/7) | 43% (3/7) |

**Errors:** 32 of 64 messages were wrong on at least one count (topics, route, priority or clock).
Of those 32, the confidence gate sent 6 to a person: 19% (6/32).

**Automation:** 51 of 64 were handled with no person asked; 13 reached one.

### Hard subset, n = 26

The messages written to sit on a boundary: clocks disguised as routine mail, multi-topic threads, dates that are not clocks. Scored apart on purpose.

| class | n | precision | recall | routed correctly | priority correct |
|---|---|---|---|---|---|
| `offer` | 5 | 71% (5/7) | 100% (5/5) | 80% (4/5) | 100% (5/5) |
| `candidate` | 6 | 100% (5/5) | 83% (5/6) | 67% (4/6) | 100% (6/6) |
| `client` | 7 | 100% (3/3) | 43% (3/7) | 57% (4/7) | 57% (4/7) |
| `scheduling` | 3 | 75% (3/4) | 100% (3/3) | 33% (1/3) | 100% (3/3) |
| `onboarding` | 4 | 80% (4/5) | 100% (4/4) | 75% (3/4) | 75% (3/4) |
| `billing` | 4 | 100% (3/3) | 75% (3/4) | 50% (2/4) | 75% (3/4) |
| `noise` | 6 | 100% (6/6) | 100% (6/6) | 83% (5/6) | 83% (5/6) |
| `internal` | 2 | 22% (2/9) | 100% (2/2) | 0% (0/2) | 50% (1/2) |

**Errors:** 16 of 26 messages were wrong on at least one count (topics, route, priority or clock).
Of those 16, the confidence gate sent 5 to a person: 31% (5/16).

**Automation:** 19 of 26 were handled with no person asked; 7 reached one.

## Measured cost and time

Both from this run's real token counts and wall-clock timings.

| figure | value |
|---|---|
| messages judged | 90 |
| input tokens, total | 117,405 |
| cost, total | 0.493 cents |
| **cost per message** | **0.0055 cents** |
| **machine time per message, median** | **123 ms** |
| machine time per message, mean | 129 ms |

Output tokens are not billed on this model, so the cost figure is input only. Every judgment behind
these figures is committed at `runs/rec/run.json`, so the whole scorecard can be recomputed at
these thresholds or any others without spending again.

## What these numbers are not

The probabilities are the model's raw judgment, not calibrated frequencies: jev-1.13 is documented
as weakly numerically calibrated, which is why the lines were swept on this build's own data rather
than borrowed. No human-time figure appears on this page.
