import { INBOX_AS_OF } from "./clock";
import { toMessage } from "./fixtures/instrument";
import type { LabelledMessage, Sor } from "./fixtures/schema";
import type { Judgment } from "./jev";
import { withDeclared, type DeclaredThreshold, type Thresholds } from "./policy";
import { factsFor } from "./stages/extract";
import { assess } from "./triage";
import type { Firm, Priority } from "./types";

/**
 * The scorecard's arithmetic.
 *
 * Pure computation over judgments already bought, so the sweep can explore a grid without spending
 * again and anyone can recompute the published figures from the committed run artifact. It goes
 * through `assess`, the same code the pipeline runs, so there is no second place the policy lives.
 *
 * Two rules this file exists to enforce. **Per class only**: the inbox is imbalanced on purpose, so
 * one overall number would flatter a system that labels everything as noise. And **ordinary and hard
 * scored separately**: the hard cases were written to sit on a boundary, and averaging them away
 * hides what they were included to show.
 */

export interface MessageResult {
  readonly id: string;
  readonly hard: boolean;
  readonly topics: readonly string[];
  readonly clocked: boolean;
  readonly asserted: readonly string[];
  readonly people: readonly string[];
  readonly priority: Priority | null;
  readonly clockFlagged: boolean;
  readonly escalated: boolean;
  readonly topicsCorrect: boolean;
  readonly routeCorrect: boolean;
  readonly priorityCorrect: boolean;
  /** Wrong on any count: topics, route, priority or the clock. */
  readonly error: boolean;
}

const sameSet = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && [...a].sort().join("|") === [...b].sort().join("|");

export function resultFor(
  m: LabelledMessage, judgment: Judgment, firm: Firm, sor: Sor, thresholds: Thresholds, asOf = INBOX_AS_OF,
): MessageResult {
  const message = toMessage(m);
  const plan = assess(firm, message, judgment, factsFor(message, sor), sor, thresholds, asOf);
  const topicsCorrect = sameSet(plan.asserted, m.topics);
  const routeCorrect = sameSet(plan.people, m.route);
  const priorityCorrect = plan.priority === m.priority;
  return {
    id: m.id, hard: m.hard, topics: m.topics, clocked: m.clocked,
    asserted: plan.asserted, people: plan.people, priority: plan.priority,
    clockFlagged: plan.clockFlagged, escalated: plan.handoffs.length > 0,
    topicsCorrect, routeCorrect, priorityCorrect,
    error: !topicsCorrect || !routeCorrect || !priorityCorrect || plan.clockFlagged !== m.clocked,
  };
}

export interface Ratio {
  readonly count: number;
  readonly n: number;
  /** Null when `n` is zero: an empty denominator is not a zero rate. */
  readonly rate: number | null;
}

const ratio = (count: number, n: number): Ratio => ({ count, n, rate: n === 0 ? null : count / n });

/**
 * The headline and its two counterparts, as one value. There is no way to build the catch rate
 * without the false-alarm rate and the automation share beside it.
 */
export interface Headline {
  /** Of every clocked message, the share that raised an owner alert. */
  readonly caught: Ratio;
  /** Of every unclocked message, the share that raised one anyway. */
  readonly falseAlarms: Ratio;
  /** Of every message, the share handled with no person asked. */
  readonly automated: Ratio;
}

export function headlineFor(results: readonly MessageResult[]): Headline {
  const clocked = results.filter((r) => r.clocked);
  const unclocked = results.filter((r) => !r.clocked);
  return {
    caught: ratio(clocked.filter((r) => r.clockFlagged).length, clocked.length),
    falseAlarms: ratio(unclocked.filter((r) => r.clockFlagged).length, unclocked.length),
    automated: ratio(results.filter((r) => !r.escalated).length, results.length),
  };
}

export interface ClassFigures {
  readonly label: string;
  /** Support: messages whose labels carry this class. */
  readonly n: number;
  readonly precision: Ratio;
  readonly recall: Ratio;
  readonly route: Ratio;
  readonly priority: Ratio;
}

export interface SubsetFigures {
  readonly name: "ordinary" | "hard";
  readonly n: number;
  readonly classes: readonly ClassFigures[];
  /** Messages wrong on any count, as a count. */
  readonly errors: number;
  /** Of those, the share the gate sent to a person: the reliability claim rests here. */
  readonly gate: Ratio;
  readonly automated: number;
  readonly escalated: number;
}

export function figuresFor(name: "ordinary" | "hard", results: readonly MessageResult[], classes: readonly string[]): SubsetFigures {
  const errors = results.filter((r) => r.error);
  return {
    name,
    n: results.length,
    classes: classes.map((label): ClassFigures => {
      const actual = results.filter((r) => r.topics.includes(label));
      const predicted = results.filter((r) => r.asserted.includes(label));
      const hits = predicted.filter((r) => r.topics.includes(label)).length;
      return {
        label, n: actual.length,
        precision: ratio(hits, predicted.length),
        recall: ratio(hits, actual.length),
        route: ratio(actual.filter((r) => r.routeCorrect).length, actual.length),
        priority: ratio(actual.filter((r) => r.priorityCorrect).length, actual.length),
      };
    }),
    errors: errors.length,
    gate: ratio(errors.filter((r) => r.escalated).length, errors.length),
    automated: results.filter((r) => !r.escalated).length,
    escalated: results.filter((r) => r.escalated).length,
  };
}

export interface RunFigures {
  readonly headline: Headline;
  readonly ordinary: SubsetFigures;
  readonly hard: SubsetFigures;
  readonly results: readonly MessageResult[];
}

export function scoreRun(
  inbox: readonly LabelledMessage[], judgments: Readonly<Record<string, Judgment>>,
  firm: Firm, sor: Sor, thresholds: Thresholds,
): RunFigures {
  const classes = firm.classes.map((c) => c[0]);
  const results = inbox.map((m) => {
    const j = judgments[m.id];
    if (!j) throw new Error(`no judgment recorded for ${m.id}`);
    return resultFor(m, j, firm, sor, thresholds);
  });
  return {
    headline: headlineFor(results),
    ordinary: figuresFor("ordinary", results.filter((r) => !r.hard), classes),
    hard: figuresFor("hard", results.filter((r) => r.hard), classes),
    results,
  };
}

export interface SweepPoint {
  readonly act: number;
  readonly review: number;
  readonly clockAct: number;
  /**
   * Mean F1 over the topic classes with support, plus the clock alert as one more class. A
   * **selection criterion, not a result**: it picks thresholds by a stated rule rather than by eye,
   * and it is deliberately absent from the published scorecard.
   */
  readonly selection: number;
  readonly escalatedShare: number;
}

export const SWEEP_ACT = [0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95];
export const SWEEP_REVIEW = [0.2, 0.3, 0.4, 0.5];
export const SWEEP_CLOCK = [0.2, 0.3, 0.4, 0.5, 0.6, 0.7];

const f1 = (p: Ratio, r: Ratio): number => {
  const a = p.rate ?? 0;
  const b = r.rate ?? 0;
  return a + b === 0 ? 0 : (2 * a * b) / (a + b);
};

/**
 * Sweeps the **ordinary subset only**. The hard messages are filtered out here, so nothing is chosen
 * on the subset it is later reported against. Declared per-class lines are held fixed.
 */
export function sweep(
  inbox: readonly LabelledMessage[], judgments: Readonly<Record<string, Judgment>>, firm: Firm, sor: Sor,
  declared: Readonly<Record<string, DeclaredThreshold>>,
): SweepPoint[] {
  const ordinary = inbox.filter((m) => !m.hard);
  const classes = firm.classes.map((c) => c[0]);
  const points: SweepPoint[] = [];
  for (const act of SWEEP_ACT) {
    for (const review of SWEEP_REVIEW) {
      if (review >= act) continue;
      for (const clockAct of SWEEP_CLOCK) {
        const thresholds = withDeclared({ act, review, clockAct }, declared);
        const results = ordinary.map((m) => {
          const j = judgments[m.id];
          if (!j) throw new Error(`no judgment recorded for ${m.id}`);
          return resultFor(m, j, firm, sor, thresholds);
        });
        const figures = figuresFor("ordinary", results, classes);
        const scored = figures.classes.filter((c) => c.n > 0).map((c) => f1(c.precision, c.recall));
        const flagged = results.filter((r) => r.clockFlagged);
        const clockF1 = f1(ratio(flagged.filter((r) => r.clocked).length, flagged.length), ratio(results.filter((r) => r.clocked && r.clockFlagged).length, results.filter((r) => r.clocked).length));
        const all = [...scored, clockF1];
        points.push({
          act, review, clockAct,
          selection: all.reduce((s, x) => s + x, 0) / (all.length || 1),
          escalatedShare: figures.escalated / (figures.n || 1),
        });
      }
    }
  }
  return points;
}

/** Highest selection score; ties toward fewer escalations, then toward a lower clock line. */
export function bestPoint(points: readonly SweepPoint[]): SweepPoint | null {
  return [...points].sort((a, b) =>
    b.selection - a.selection || a.escalatedShare - b.escalatedShare || a.clockAct - b.clockAct || a.act - b.act)[0] ?? null;
}

export interface RunMeta {
  readonly model: string;
  readonly messages: number;
  readonly totalInputTokens: number;
  readonly totalCents: number;
  readonly medianMs: number;
  readonly meanMs: number;
}

export function runMeta(judgments: readonly (Judgment & { elapsedMs: number })[]): RunMeta {
  const times = judgments.map((j) => j.elapsedMs).sort((a, b) => a - b);
  const mid = Math.floor(times.length / 2);
  return {
    model: judgments[0]?.model ?? "unknown",
    messages: judgments.length,
    totalInputTokens: judgments.reduce((s, j) => s + j.usage.input_tokens, 0),
    totalCents: judgments.reduce((s, j) => s + j.costCents, 0),
    medianMs: times.length === 0 ? 0 : times.length % 2 === 1 ? (times[mid] ?? 0) : ((times[mid - 1] ?? 0) + (times[mid] ?? 0)) / 2,
    meanMs: times.length === 0 ? 0 : times.reduce((s, t) => s + t, 0) / times.length,
  };
}
