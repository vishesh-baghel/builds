# reckon — scorecard

**Run date:** 2026-09-19
**Model:** `jev-1.13.0`
**Instrument:** the 72 committed replies in `fixtures/replies.jsonl`, frozen.

All data is synthetic. This is a self-built experiment on invented data: no client, no client
names, no client results. There is no before/after comparison anywhere on this page — no
pre-baseline was taken, and inventing one afterwards would be worse than having none.

**There is deliberately no overall accuracy figure.** The class distribution is imbalanced on
purpose, to look like a real chasing inbox. A system answering `noise` every time would score
25% here, and one headline number would flatter it on exactly the rare, expensive classes that
matter. Everything below is per class, with its `n` beside it.

## How the primary class is derived

The highest-probability class that cleared its own act threshold, after the five tie-break
rules are applied in order. When nothing clears, there is no primary and the reply goes to a
person — that is a routing signal, not a missing answer. The rule lives in `src/policy.ts`.

## Thresholds

| class | act threshold | how it was chosen |
|---|---|---|
| `dispute` | 0.80 | swept on the ordinary subset |
| `claimed_payment` | 0.80 | swept on the ordinary subset |
| `partial` | 0.65 | declared, not swept — n = 2 ordinary |
| `promise_to_pay` | 0.65 | swept on the ordinary subset |
| `question` | 0.65 | swept on the ordinary subset |
| `wrong_contact` | 0.65 | swept on the ordinary subset |
| `noise` | 0.65 | swept on the ordinary subset |
| *review band* | 0.50 | swept on the ordinary subset |

The sweep ran over the **51 ordinary replies only**. The 21 hard replies were never seen by it,
so nothing here was chosen on the subset it is reported against. The full sweep is committed at
`runs/sweep.json` — 150 threshold combinations.

`partial` is **declared rather than swept**: the ordinary subset holds 2 `partial` replies,
and a threshold fitted to 2 examples is a number with a decimal point rather than a measurement.

## Results

### Ordinary subset — n = 51

The 51 replies that are not deliberate boundary cases.

| class | n | precision | recall | acted automatically | reached a person |
|---|---|---|---|---|---|
| `dispute` | 5 | 100% (5/5) | 100% (5/5) | 0% | 100% |
| `claimed_payment` | 6 | 100% (6/6) | 100% (6/6) | 83% | 17% |
| `promise_to_pay` | 10 | 100% (10/10) | 100% (10/10) | 90% | 10% |
| `partial` | 2 | 100% (2/2) | 100% (2/2) | 50% | 50% |
| `question` | 10 | 100% (10/10) | 100% (10/10) | 0% | 100% |
| `wrong_contact` | 5 | 100% (4/4) | 80% (4/5) | 20% | 80% |
| `noise` | 13 | 93% (13/14) | 100% (13/13) | 100% | 0% |

**Errors:** 1 of 51 replies got the primary class wrong.
Of those 1, the gate caught 0 — 0%.

**Automation:** 29 of 51 closed without a person; 22 reached one.
A system that escalated everything would read as 100% caught and 0% automated, which is why
these two are printed beside the catch rate rather than behind it.

### Hard subset — n = 21

The 21 replies written specifically to sit on a boundary. Scored apart, on purpose: averaging them into the rest hides the thing they were included to show.

| class | n | precision | recall | acted automatically | reached a person |
|---|---|---|---|---|---|
| `dispute` | 1 | 50% (1/2) | 100% (1/1) | 0% | 100% |
| `claimed_payment` | 4 | 100% (2/2) | 50% (2/4) | 25% | 75% |
| `promise_to_pay` | 2 | 100% (1/1) | 50% (1/2) | 0% | 100% |
| `partial` | 4 | 100% (4/4) | 100% (4/4) | 50% | 50% |
| `question` | 2 | 100% (1/1) | 50% (1/2) | 0% | 100% |
| `wrong_contact` | 3 | 100% (2/2) | 67% (2/3) | 0% | 100% |
| `noise` | 5 | 100% (4/4) | 80% (4/5) | 60% | 40% |

**Errors:** 6 of 21 replies got the primary class wrong.
Of those 6, the gate caught 6 — 100%.

**Automation:** 6 of 21 closed without a person; 15 reached one.
A system that escalated everything would read as 100% caught and 0% automated, which is why
these two are printed beside the catch rate rather than behind it.

### Multi-label replies — n = 5

Scored apart from the strict primary figure. These are the replies that genuinely carry two
classes at once, which is the case a pick-one classifier cannot represent at all.

| reply | expected | asserted | primary |
|---|---|---|---|
| `r010` | `claimed_payment` + `promise_to_pay` | `claimed_payment` | `claimed_payment` |
| `r011` | `partial` + `promise_to_pay` | `promise_to_pay` + `partial` | `partial` |
| `r043` | `partial` + `dispute` | `partial` + `dispute` | `partial` |
| `r044` | `partial` + `promise_to_pay` | `promise_to_pay` + `partial` | `partial` |
| `r046` | `partial` + `promise_to_pay` | `promise_to_pay` + `partial` | `partial` |

Both classes asserted on **4 of 5**.
Primary correct on **5 of 5**.

`noise` earns no secondary credit, so asserting `noise` alongside `wrong_contact` on an
out-of-office that names a live contact is not rewarded — tie-break rule 3 requires the
actionable redirect to outrank the auto-reply.

## Measured cost and time

Both from this run's real token counts and wall-clock timings.

| figure | value |
|---|---|
| replies judged | 72 |
| input tokens, total | 143,595 |
| cost, total | 0.603¢ |
| **cost per reply** | **0.0084¢** |
| **machine time per reply, median** | **685 ms** |
| machine time per reply, mean | 775 ms |

Output tokens are not billed on this model, so the cost figure is input-only.

Every judgment behind these figures is committed at `runs/run.json`, so the whole
scorecard can be recomputed — at these thresholds or any others — without spending again.

## What these numbers are not

The probabilities are the model's raw judgment, not calibrated frequencies: jev-1.13 is
documented as weakly numerically calibrated, and thresholds do not transfer between question
types. That is why they were swept on this build's own data rather than borrowed.

No human-time figure appears on this page. The one the sandbox shows is a declared estimate,
held in a single named constant, and it never sits beside a measured figure.
