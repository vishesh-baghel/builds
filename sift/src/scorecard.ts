import type { Judgment } from "./jev";
import type { DeclaredThreshold, Thresholds } from "./policy";
import type { Headline, Ratio, RunFigures, RunMeta, SubsetFigures, SweepPoint } from "./score";

/**
 * Rendering the scorecard. Every figure carries its `n`, and there is no overall accuracy line
 * anywhere: on an inbox this imbalanced one number would describe the distribution, not the system.
 */

const pct = (r: Ratio): string => (r.rate === null ? "n/a (n = 0)" : `${(r.rate * 100).toFixed(0)}% (${r.count}/${r.n})`);

/**
 * The headline, which cannot be printed alone (AC #19). A system that alerted on every message would
 * catch every clock; the false-alarm rate and the automation share beside it are what show that.
 */
export function renderHeadline(h: Headline): string {
  const parts = [h.caught, h.falseAlarms, h.automated] as const;
  if (parts.some((p) => p === undefined || p === null || typeof p.n !== "number")) {
    throw new Error("the catch rate is never printed without its false-alarm and automation counterparts");
  }
  return [
    "| measure | value |",
    "|---|---|",
    `| **clocked-item catch rate**: clocked messages that raised an owner alert | **${pct(h.caught)}** |`,
    `| false alarms: unclocked messages that raised one anyway | ${pct(h.falseAlarms)} |`,
    `| automation: messages handled with no person asked | ${pct(h.automated)} |`,
  ].join("\n");
}

function classTable(f: SubsetFigures): string {
  const rows = f.classes.map((c) =>
    `| \`${c.label}\` | ${c.n} | ${pct(c.precision)} | ${pct(c.recall)} | ${pct(c.route)} | ${pct(c.priority)} |`);
  return [
    "| class | n | precision | recall | routed correctly | priority correct |",
    "|---|---|---|---|---|---|",
    ...rows,
  ].join("\n");
}

function subsetSection(f: SubsetFigures, blurb: string): string {
  return [
    `### ${f.name === "ordinary" ? "Ordinary" : "Hard"} subset, n = ${f.n}`,
    "",
    blurb,
    "",
    classTable(f),
    "",
    `**Errors:** ${f.errors} of ${f.n} messages were wrong on at least one count (topics, route, priority or clock).`,
    `Of those ${f.errors}, the confidence gate sent ${f.gate.count} to a person: ${pct(f.gate)}.`,
    "",
    `**Automation:** ${f.automated} of ${f.n} were handled with no person asked; ${f.escalated} reached one.`,
  ].join("\n");
}

export interface ScorecardInput {
  readonly date: string;
  readonly thresholds: Thresholds;
  readonly declared: Readonly<Record<string, DeclaredThreshold>>;
  readonly figures: RunFigures;
  readonly meta: RunMeta;
  readonly sweep: readonly SweepPoint[];
  readonly counts: { readonly total: number; readonly clocked: number; readonly hard: number };
  readonly runArtifact: string;
  readonly sweepArtifact: string;
  /** Earlier runs on this same frozen instrument, recomputed from their committed artifacts. */
  readonly history?: readonly PriorRun[];
  /** The firm, named in the title. Meridian's scorecard predates it and leaves it out. */
  readonly firm?: string;
  /** Where the instrument's inbox is committed. Defaults to Meridian's. */
  readonly instrumentPath?: string;
}

export interface PriorRun {
  readonly label: string;
  readonly date: string;
  readonly change: string;
  readonly thresholds: Thresholds;
  readonly headline: Headline;
  readonly artifact: string;
}

function historySection(history: readonly PriorRun[]): string {
  if (history.length === 0) return "";
  return `## Revisions

This page reports the latest run. Earlier runs on the same frozen instrument are kept, not replaced:
their judgments are committed, and their headline below is recomputed from them, not transcribed.

| run | date | what changed after it | clocks caught | false alarms | automated | lines (act, review, clock) |
|---|---|---|---|---|---|---|
${history.map((h) => `| ${h.label} | ${h.date} | ${h.change} | ${pct(h.headline.caught)} | ${pct(h.headline.falseAlarms)} | ${pct(h.headline.automated)} | ${h.thresholds.act.toFixed(2)}, ${h.thresholds.review.toFixed(2)}, ${h.thresholds.clockAct.toFixed(2)} (\`${h.artifact}\`) |`).join("\n")}

No label was changed between runs.

`;
}

export function renderScorecard(input: ScorecardInput): string {
  const { figures, meta, thresholds, counts } = input;
  const perMessage = meta.messages === 0 ? 0 : meta.totalCents / meta.messages;
  const declared = Object.entries(input.declared);
  const clockedOrdinary = figures.results.filter((r) => r.clocked && !r.hard);
  const clockedHard = figures.results.filter((r) => r.clocked && r.hard);
  const caughtOf = (rs: readonly { clockFlagged: boolean }[]) => `${rs.filter((r) => r.clockFlagged).length} of ${rs.length}`;

  return `# sift, scorecard${input.firm ? `: ${input.firm}` : ""}

**Run date:** ${input.date}
**Model:** \`${meta.model}\`
**Instrument:** the ${counts.total} committed messages in \`${input.instrumentPath ?? "fixtures/inbox.jsonl"}\`, frozen: ${counts.clocked} carry a real clock, ${counts.hard} are deliberate boundary cases.

All data is synthetic. This is a self-built experiment on invented data: no client, no client names,
no client results. There is no before/after comparison anywhere on this page: no pre-baseline was
taken, and inventing one afterwards would be worse than having none.

**There is deliberately no overall accuracy figure.** The inbox is imbalanced on purpose, pitches
the plurality, to look like a real shared mailbox. A system that labelled everything a pitch would
post a respectable overall number while missing every expensive message. Everything below is per
class, with its \`n\` beside it.

## The headline

${renderHeadline(figures.headline)}

The three are printed together or not at all. Alerting on every message would read here as a full
catch rate beside a high false-alarm rate and low automation, not as a success.

Of the clocked messages, the ordinary ones were caught ${caughtOf(clockedOrdinary)} and the hard ones ${caughtOf(clockedHard)}.

## Thresholds

| line | value | how it was chosen |
|---|---|---|
| act | ${thresholds.act.toFixed(2)} | swept on the ordinary subset |
| review | ${thresholds.review.toFixed(2)} | swept on the ordinary subset |
| clock | ${thresholds.clockAct.toFixed(2)} | swept on the ordinary subset |
${declared.map(([c, d]) => `| act, \`${c}\` only | ${d.act.toFixed(2)} | declared, not swept: n = ${d.n} ordinary. ${d.reason} |`).join("\n")}

The sweep ran over the **ordinary subset only**; the hard messages were never seen by it, so nothing
here was chosen on the subset it is reported against. The full sweep, ${input.sweep.length} combinations, is
committed at \`${input.sweepArtifact}\`.${declared.length === 0 ? " Every class met the six-example floor, so no threshold is declared." : ""}

## Results

${subsetSection(figures.ordinary, "The messages that are not deliberate boundary cases.")}

${subsetSection(figures.hard, "The messages written to sit on a boundary: clocks disguised as routine mail, multi-topic threads, dates that are not clocks. Scored apart on purpose.")}

## Measured cost and time

Both from this run's real token counts and wall-clock timings.

| figure | value |
|---|---|
| messages judged | ${meta.messages} |
| input tokens, total | ${meta.totalInputTokens.toLocaleString("en-US")} |
| cost, total | ${meta.totalCents.toFixed(3)} cents |
| **cost per message** | **${perMessage.toFixed(4)} cents** |
| **machine time per message, median** | **${meta.medianMs.toFixed(0)} ms** |
| machine time per message, mean | ${meta.meanMs.toFixed(0)} ms |

Output tokens are not billed on this model, so the cost figure is input only. Every judgment behind
these figures is committed at \`${input.runArtifact}\`, so the whole scorecard can be recomputed at
these thresholds or any others without spending again.

${historySection(input.history ?? [])}## What these numbers are not

The probabilities are the model's raw judgment, not calibrated frequencies: jev-1.13 is documented
as weakly numerically calibrated, which is why the lines were swept on this build's own data rather
than borrowed. No human-time figure appears on this page.
`;
}

export function renderSweepArtifact(points: readonly SweepPoint[], chosen: SweepPoint | null): string {
  return `${JSON.stringify({
    note: "Swept on the ordinary subset only. `selection` is mean F1 over the topic classes with support plus the clock alert: a selection criterion for choosing thresholds, deliberately not published as a result.",
    chosen,
    points,
  }, null, 2)}\n`;
}

/**
 * One firm's entry in `runs/served.json`: what the deploy serves for it. The recorded scores and
 * clock per message, the model, and the lines its sweep chose. Never token counts or costs.
 */
export function servedEntry(
  date: string, judgments: Readonly<Record<string, Judgment>>, lines: Thresholds,
): { date: string; lines: Thresholds; judgments: Record<string, { scores: Readonly<Record<string, number>>; clock: number; model: string }> } {
  return {
    date,
    lines,
    judgments: Object.fromEntries(Object.entries(judgments).map(([id, j]) => [id, { scores: j.scores, clock: j.clock, model: j.model }])),
  };
}
