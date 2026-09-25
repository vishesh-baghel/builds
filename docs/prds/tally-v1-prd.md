# tally · billing leakage from technician notes · PRD v1

> **Scope note.** This is the spec for one build in a public repo: functional and technical
> only. The business reasoning behind it lives in the private research and is not restated here.

Tally compares what a field technician wrote in a completion note with what was actually
invoiced for the visit, and finds billable work that never reached the invoice. It judges each
work item against a service agreement and a rate card, drafts the missing invoice line, and
prices it in code. It issues nothing and writes to no system of record.

The scene firm is Brightline Mechanical, an invented HVAC contractor. A technician's note reads
"swapped the compressor, had to pull the old line set, 2 extra guys thursday"; the invoice says
one line, the service call. The line set and the extra labour are never billed, because nobody
compares two documents that were written for different purposes.

## Inputs

All text, all committed under `tally/fixtures/`:

- `work-orders.json`: 1,000 work orders, each with a technician's completion note and the
  invoice lines actually issued.
- `agreement.md`: one service agreement, stating what is covered, what is billed, and what is
  never billed.
- `rate-card.json`: the price and governing clause of every billable line.
- `answer-key.json`: one row per work item: its verdict, whether it was planted as unbilled,
  its value, and which trap (if any) it was planted as.

The work orders are generated. A seeded script composes each note from hand-written phrases and
writes the answer key at the same moment, so the unbilled work is planted and its value is known
without labelling. No model is called to produce them. Planted traps: extra work mentioned in
passing; covered work described as if it were extra; non-billable chatter; a component that was
inspected or quoted but not replaced; text that tries to instruct a billing system to add a
line; and notes where the technician is unsure.

## Division of labour

Code owns: splitting the note into candidate work items (rules over a closed lexicon), the rate
line and clause each item maps to, the quantity, the price, every sum, the drafted line's text,
the check that a rate code is already on the invoice, and every side effect.

Drex (Nace.AI's decision model, reached through `@typesafe-ai/sdk`, which it is wire compatible
with) owns four judgments per work item, asked together in one request:

| Name | Type | Question |
|---|---|---|
| `verdict` | choice | already invoiced / missed and billable / covered by the agreement / not billable |
| `covered` | noul | does the agreement cover this work at no charge? |
| `unsupported` | noul | guardrail: does the drafted line bill anything the note does not record as done? |
| `evidence` | score 0..4 | how plainly does the note say the work happened? |

Drex writes no text, extracts no values and does no arithmetic.

## Decision

Pure code over the four numbers, in `src/policy.ts`. An item is counted as recovered only when
the verdict is `missed_billable`, the catalog has a rate line for it, its rate code is not
already invoiced, the guardrail passes, the evidence clears its threshold, the coverage check
does not contradict the verdict, and the verdict is not a close call. A guardrail failure is
never counted. Weak evidence, a coverage contradiction or a close call routes to a person, which
is a normal outcome.

Thresholds are measured, not assumed: they are chosen on the first 200 orders by a grid search
that maximises money found minus twice the money wrongly counted, and the scorecard reports the
remaining 800 orders separately as a held-out set.

## Spine and reliability

Each work item runs through `runPipeline` from `@builds/shared`: extract (code prepares the
item), classify (Drex's verdict probabilities), decide (`decideItem`), act (`draft_line`,
through `once` so one order never gets the same rate code drafted twice), escalate (the human
queue), log (the shared audit trail). Every Drex call goes through `withRetry` and a hard
`SpendCap` per run, denominated in input tokens because the vendor publishes no per-token price.

The run is two phases so the expensive one happens once: `pnpm run` collects Drex's judgments
into `runs/judgments.json` (resumable, checkpointed); `pnpm score` does everything else with no
key and no calls.

## Recording view

A Next.js page that replays the committed run from `public/replay.json`: the note on the left
with each work item underlined, the four judgments as probability bars per item, a running
"unbilled $ found" counter, and an automatic pause on one caught trap. Hosted at
tally.visheshbaghel.com. The hosted page makes no model calls.

## Acceptance criteria

<!-- AC:BEGIN -->
- [x] #1 `fixtures/` holds 1,000 work orders, the agreement, the rate card and the answer key, committed before any engine code, and `pnpm --filter @builds/tally test` asserts the splitter finds exactly the keyed items in every order
- [x] #2 Every work item in `public/replay.json` carries a verdict and the clause or rate line it rests on
- [x] #3 Every drafted line's price is `rate × quantity` computed in `src/item.ts`; the test suite asserts it equals the key's value for every planted item
- [x] #4 `decideItem` never returns `recovered` when `unsupported` is at or above the guardrail threshold (unit test)
- [x] #5 Items below the measured evidence threshold return `human` (unit test), and `SCORECARD.md` reports the count routed
- [x] #6 `judge()` sends one request per item carrying `verdict`, `covered`, `unsupported` and `evidence` (unit test)
- [x] #7 `SCORECARD.md` reports unbilled $ planted and found, traps caught by type, items routed to a human, p50 latency, throughput, and tokens per decision and per 1,000 decisions, for all 1,000 orders and the held-out 800
- [x] #8 `pnpm --filter @builds/tally build` succeeds and the page replays the run with probability bars, a running counter and a pause on a caught trap
- [x] #9 The README says once that the work orders are generated
- [x] #10 Every number in the README appears in `SCORECARD.md` or a committed file under `tally/runs/`
<!-- AC:END -->
