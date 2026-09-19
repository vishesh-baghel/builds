import { DECLARED_THRESHOLDS, type Thresholds } from "./policy";
import type { RunFigures, RunMeta, SubsetFigures, SweepPoint } from "./score";
import type { Reply } from "./types";

/**
 * Rendering the scorecard.
 *
 * Every figure carries its `n`. There is no overall accuracy line anywhere, deliberately: on a
 * set this imbalanced one number would say more about the distribution than about the system.
 */

const pct = (value: number | null): string => (value === null ? "—" : `${(value * 100).toFixed(0)}%`);
const ms = (value: number): string => `${value.toFixed(0)} ms`;

function classTable(figures: SubsetFigures): string {
  const rows = figures.classes.map((c) => {
    const support = `${c.n}`;
    return `| \`${c.label}\` | ${support} | ${pct(c.precision)} (${c.hits}/${c.predicted || 0}) | ${pct(c.recall)} (${c.hits}/${c.n}) | ${pct(c.automatedShare)} | ${pct(c.escalatedShare)} |`;
  });

  return [
    "| class | n | precision | recall | acted automatically | reached a person |",
    "|---|---|---|---|---|---|",
    ...rows,
  ].join("\n");
}

function subsetSection(figures: SubsetFigures, blurb: string): string {
  return [
    `### ${figures.name === "ordinary" ? "Ordinary" : "Hard"} subset — n = ${figures.n}`,
    "",
    blurb,
    "",
    classTable(figures),
    "",
    `**Errors:** ${figures.errors} of ${figures.n} replies got the primary class wrong.`,
    `Of those ${figures.errors}, the gate caught ${figures.errorsCaught} — ${pct(figures.catchRate)}.`,
    "",
    `**Automation:** ${figures.automated} of ${figures.n} closed without a person; ${figures.escalated} reached one.`,
    "A system that escalated everything would read as 100% caught and 0% automated, which is why",
    "these two are printed beside the catch rate rather than behind it.",
  ].join("\n");
}

export interface ScorecardInput {
  readonly date: string;
  readonly thresholds: Thresholds;
  readonly figures: RunFigures;
  readonly meta: RunMeta;
  readonly sweep: readonly SweepPoint[];
  readonly chosen: SweepPoint | null;
  readonly replies: readonly Reply[];
  readonly runArtifact: string;
  readonly sweepArtifact: string;
}

export function renderScorecard(input: ScorecardInput): string {
  const { figures, meta, thresholds } = input;
  const ordinaryPartial = input.replies.filter((r) => !r.hard && r.label === "partial").length;
  const perReplyCents = meta.replies === 0 ? 0 : meta.totalCents / meta.replies;

  return `# reckon — scorecard

**Run date:** ${input.date}
**Model:** \`${meta.model}\`
**Instrument:** the 72 committed replies in \`fixtures/replies.jsonl\`, frozen.

All data is synthetic. This is a self-built experiment on invented data: no client, no client
names, no client results. There is no before/after comparison anywhere on this page — no
pre-baseline was taken, and inventing one afterwards would be worse than having none.

**There is deliberately no overall accuracy figure.** The class distribution is imbalanced on
purpose, to look like a real chasing inbox. A system answering \`noise\` every time would score
25% here, and one headline number would flatter it on exactly the rare, expensive classes that
matter. Everything below is per class, with its \`n\` beside it.

## How the primary class is derived

The highest-probability class that cleared its own act threshold, after the five tie-break
rules are applied in order. When nothing clears, there is no primary and the reply goes to a
person — that is a routing signal, not a missing answer. The rule lives in \`src/policy.ts\`.

## Thresholds

| class | act threshold | how it was chosen |
|---|---|---|
${(Object.keys(thresholds.act) as (keyof typeof thresholds.act)[]).map((label) =>
  `| \`${label}\` | ${thresholds.act[label].toFixed(2)} | ${DECLARED_THRESHOLDS.includes(label) ? `declared, not swept — n = ${ordinaryPartial} ordinary` : "swept on the ordinary subset"} |`,
).join("\n")}
| *review band* | ${thresholds.review.toFixed(2)} | swept on the ordinary subset |

The sweep ran over the **51 ordinary replies only**. The 21 hard replies were never seen by it,
so nothing here was chosen on the subset it is reported against. The full sweep is committed at
\`${input.sweepArtifact}\` — ${input.sweep.length} threshold combinations.

\`partial\` is **declared rather than swept**: the ordinary subset holds ${ordinaryPartial} \`partial\` replies,
and a threshold fitted to ${ordinaryPartial} examples is a number with a decimal point rather than a measurement.

## Results

${subsetSection(figures.ordinary, "The 51 replies that are not deliberate boundary cases.")}

${subsetSection(figures.hard, "The 21 replies written specifically to sit on a boundary. Scored apart, on purpose: averaging them into the rest hides the thing they were included to show.")}

### Multi-label replies — n = ${figures.multiLabel.n}

Scored apart from the strict primary figure. These are the replies that genuinely carry two
classes at once, which is the case a pick-one classifier cannot represent at all.

| reply | expected | asserted | primary |
|---|---|---|---|
${figures.multiLabel.detail.map((d) =>
  `| \`${d.id}\` | ${d.expected.map((l) => `\`${l}\``).join(" + ")} | ${d.asserted.length ? d.asserted.map((l) => `\`${l}\``).join(" + ") : "—"} | ${d.primary ? `\`${d.primary}\`` : "—"} |`,
).join("\n")}

Both classes asserted on **${figures.multiLabel.bothAsserted} of ${figures.multiLabel.n}**.
Primary correct on **${figures.multiLabel.primaryCorrect} of ${figures.multiLabel.n}**.

\`noise\` earns no secondary credit, so asserting \`noise\` alongside \`wrong_contact\` on an
out-of-office that names a live contact is not rewarded — tie-break rule 3 requires the
actionable redirect to outrank the auto-reply.

## Measured cost and time

Both from this run's real token counts and wall-clock timings.

| figure | value |
|---|---|
| replies judged | ${meta.replies} |
| input tokens, total | ${meta.totalInputTokens.toLocaleString("en-US")} |
| cost, total | ${meta.totalCents.toFixed(3)}¢ |
| **cost per reply** | **${perReplyCents.toFixed(4)}¢** |
| **machine time per reply, median** | **${ms(meta.medianMs)}** |
| machine time per reply, mean | ${ms(meta.meanMs)} |

Output tokens are not billed on this model, so the cost figure is input-only.

Every judgment behind these figures is committed at \`${input.runArtifact}\`, so the whole
scorecard can be recomputed — at these thresholds or any others — without spending again.

## What these numbers are not

The probabilities are the model's raw judgment, not calibrated frequencies: jev-1.13 is
documented as weakly numerically calibrated, and thresholds do not transfer between question
types. That is why they were swept on this build's own data rather than borrowed.

No human-time figure appears on this page. The one the sandbox shows is a declared estimate,
held in a single named constant, and it never sits beside a measured figure.
`;
}

export function renderSweepArtifact(points: readonly SweepPoint[], chosen: SweepPoint | null): string {
  return `${JSON.stringify({
    note: "Swept on the 51 ordinary replies only. `selection` is macro-F1 over classes with support — a selection criterion for choosing thresholds, deliberately not published as a result.",
    chosen,
    points,
  }, null, 2)}\n`;
}
