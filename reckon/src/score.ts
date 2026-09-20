import { assertedFrom, derivePrimary, reviewBandFrom, SECONDARY_CREDIT_EXCLUDES, type ClassScores, type Thresholds } from "./policy";
import type { Judgment } from "./jev";
import { REPLY_CLASSES, type Reply, type ReplyClass } from "./types";

/**
 * The scorecard.
 *
 * Everything here is pure computation over judgments already bought, which is what lets the
 * threshold sweep explore a whole grid without spending again, and lets anyone recompute the
 * published figures from the committed run artifact.
 *
 * Two rules this file exists to enforce. **Per-class only**, the fixture distribution is
 * deliberately imbalanced to look like a real inbox, so a system answering `noise` every time
 * would score 25% and a single headline number would flatter exactly the rare, expensive
 * classes that matter. And **ordinary and hard scored separately**, the 21 boundary cases were
 * included on purpose and averaging them away hides the thing they were included to show.
 */

export interface ReplyResult {
  readonly id: string;
  readonly label: ReplyClass;
  readonly also: readonly ReplyClass[];
  readonly hard: boolean;
  readonly asserted: readonly ReplyClass[];
  readonly review: readonly ReplyClass[];
  readonly primary: ReplyClass | null;
  readonly escalated: boolean;
  readonly correct: boolean;
}

/** Everything expected of the system on one reply. `noise` earns no secondary credit. */
export const expectedSet = (reply: Pick<Reply, "label" | "also">): ReplyClass[] => [
  reply.label,
  ...reply.also.filter((label) => !SECONDARY_CREDIT_EXCLUDES.includes(label)),
];

/**
 * Re-derives the outcome for one reply at a given set of thresholds.
 *
 * Deliberately mirrors what the pipeline does rather than reusing it: the pipeline applies side
 * effects, and a sweep that walked 300 threshold combinations through it would be applying
 * 300 rounds of chase-state changes for nothing.
 */
export function resultFor(reply: Reply, scores: ClassScores, thresholds: Thresholds): ReplyResult {
  const asserted = assertedFrom(scores, thresholds);
  const review = reviewBandFrom(scores, thresholds);
  const { primary } = derivePrimary(asserted, scores);

  // A reply escalates when nothing cleared, when a class sits in the review band, or when an
  // asserted class hands over by design. The last is not an error, disputes, questions and
  // wrong contacts always reach a person.
  const handsOver = asserted.some((label) => HANDS_OVER.includes(label));
  const escalated = asserted.length === 0 || review.length > 0 || handsOver;

  return {
    id: reply.id, label: reply.label, also: reply.also, hard: reply.hard,
    asserted, review, primary, escalated, correct: primary === reply.label,
  };
}

/** Classes whose outcome always includes a person, by design rather than by uncertainty. */
export const HANDS_OVER: readonly ReplyClass[] = ["dispute", "question", "wrong_contact"];

export interface ClassFigures {
  readonly label: ReplyClass;
  /** Support: how many replies actually carry this label. */
  readonly n: number;
  readonly predicted: number;
  readonly hits: number;
  readonly precision: number | null;
  readonly recall: number | null;
  readonly automatedShare: number | null;
  readonly escalatedShare: number | null;
}

export interface SubsetFigures {
  readonly name: string;
  readonly n: number;
  readonly classes: readonly ClassFigures[];
  /** Replies the system got wrong on the strict primary measure. A count, not only a share. */
  readonly errors: number;
  readonly errorsCaught: number;
  readonly catchRate: number | null;
  readonly automated: number;
  readonly escalated: number;
}

const ratio = (top: number, bottom: number): number | null => (bottom === 0 ? null : top / bottom);

export function figuresFor(name: string, results: readonly ReplyResult[]): SubsetFigures {
  const classes = ORDERED_CLASSES.map((label): ClassFigures => {
    const actual = results.filter((r) => r.label === label);
    const predicted = results.filter((r) => r.primary === label);
    const hits = predicted.filter((r) => r.label === label).length;

    return {
      label,
      n: actual.length,
      predicted: predicted.length,
      hits,
      precision: ratio(hits, predicted.length),
      recall: ratio(hits, actual.length),
      automatedShare: ratio(actual.filter((r) => !r.escalated).length, actual.length),
      escalatedShare: ratio(actual.filter((r) => r.escalated).length, actual.length),
    };
  });

  const wrong = results.filter((r) => !r.correct);
  return {
    name,
    n: results.length,
    classes,
    errors: wrong.length,
    errorsCaught: wrong.filter((r) => r.escalated).length,
    catchRate: ratio(wrong.filter((r) => r.escalated).length, wrong.length),
    automated: results.filter((r) => !r.escalated).length,
    escalated: results.filter((r) => r.escalated).length,
  };
}

/** `dispute` and `claimed_payment` first: they drive the wrong action when missed. */
export const ORDERED_CLASSES: readonly ReplyClass[] = [
  "dispute", "claimed_payment",
  ...REPLY_CLASSES.filter((label) => label !== "dispute" && label !== "claimed_payment"),
];

export interface MultiLabelFigures {
  readonly n: number;
  readonly bothAsserted: number;
  readonly primaryCorrect: number;
  readonly detail: readonly { id: string; expected: ReplyClass[]; asserted: readonly ReplyClass[]; primary: ReplyClass | null }[];
}

/** Scored apart from the strict primary figure, because asserting one of two is a partial answer. */
export function multiLabelFigures(
  replies: readonly Reply[],
  results: readonly ReplyResult[]): MultiLabelFigures {
  const byId = new Map(results.map((r) => [r.id, r]));
  const multi = replies.filter((reply) => expectedSet(reply).length > 1);

  const detail = multi.map((reply) => {
    const result = byId.get(reply.id);
    return {
      id: reply.id,
      expected: expectedSet(reply),
      asserted: result?.asserted ?? [],
      primary: result?.primary ?? null,
    };
  });

  return {
    n: multi.length,
    bothAsserted: detail.filter((d) => d.expected.every((label) => d.asserted.includes(label))).length,
    primaryCorrect: detail.filter((d) => d.primary === d.expected[0]).length,
    detail,
  };
}

export interface RunFigures {
  readonly ordinary: SubsetFigures;
  readonly hard: SubsetFigures;
  readonly multiLabel: MultiLabelFigures;
  readonly results: readonly ReplyResult[];
}

export function scoreRun(
  replies: readonly Reply[],
  scoresById: Readonly<Record<string, ClassScores>>,
  thresholds: Thresholds): RunFigures {
  const results = replies.map((reply) => {
    const scores = scoresById[reply.id];
    if (!scores) throw new Error(`no judgment recorded for ${reply.id}`);
    return resultFor(reply, scores, thresholds);
  });

  return {
    ordinary: figuresFor("ordinary", results.filter((r) => !r.hard)),
    hard: figuresFor("hard", results.filter((r) => r.hard)),
    multiLabel: multiLabelFigures(replies, results),
    results,
  };
}

export interface SweepPoint {
  readonly base: number;
  readonly risky: number;
  readonly review: number;
  /**
   * Macro-F1 over the classes with support on the ordinary subset.
   *
   * A **selection criterion, not a result.** It exists so the choice of thresholds is made by a
   * stated rule rather than by eye, and it is deliberately absent from the published scorecard:
   * a single number over an imbalanced set is exactly what the per-class reporting exists to
   * avoid quoting.
   */
  readonly selection: number;
  readonly escalatedShare: number;
  readonly perClassRecall: Readonly<Record<string, number | null>>;
}

export const SWEEP_BASE = [0.50, 0.55, 0.60, 0.65, 0.70, 0.75, 0.80, 0.85, 0.90, 0.95];
export const SWEEP_RISKY = [0.80, 0.85, 0.88, 0.90, 0.95, 0.99];
export const SWEEP_REVIEW = [0.30, 0.40, 0.50];

export function thresholdsAt(base: number, risky: number, review: number, declared: Thresholds): Thresholds {
  return {
    review,
    act: {
      dispute: risky,
      claimed_payment: risky,
      // Declared rather than swept: the ordinary subset holds too few examples to fit it on.
      partial: declared.act.partial,
      promise_to_pay: base,
      question: base,
      wrong_contact: base,
      noise: base,
    },
  };
}

/**
 * Sweeps the **ordinary 51 only**. The 21 hard replies are never seen by this function, so
 * nothing is chosen on the subset it is later reported against.
 */
export function sweep(
  replies: readonly Reply[],
  scoresById: Readonly<Record<string, ClassScores>>,
  declared: Thresholds): SweepPoint[] {
  const ordinary = replies.filter((reply) => !reply.hard);
  const points: SweepPoint[] = [];

  for (const base of SWEEP_BASE) {
    for (const risky of SWEEP_RISKY) {
      if (risky < base) continue;
      for (const review of SWEEP_REVIEW) {
        if (review >= base) continue;
        const thresholds = thresholdsAt(base, risky, review, declared);
        const figures = figuresFor("ordinary", ordinary.map((reply) => {
          const scores = scoresById[reply.id];
          if (!scores) throw new Error(`no judgment recorded for ${reply.id}`);
          return resultFor(reply, scores, thresholds);
        }));

        const withSupport = figures.classes.filter((c) => c.n > 0);
        const f1s = withSupport.map((c) => {
          const p = c.precision ?? 0;
          const r = c.recall ?? 0;
          return p + r === 0 ? 0 : (2 * p * r) / (p + r);
        });

        points.push({
          base, risky, review,
          selection: f1s.reduce((sum, f) => sum + f, 0) / (f1s.length || 1),
          escalatedShare: figures.escalated / (figures.n || 1),
          perClassRecall: Object.fromEntries(withSupport.map((c) => [c.label, c.recall])),
        });
      }
    }
  }

  return points;
}

/** Highest selection score; ties broken toward fewer escalations, then toward a lower bar. */
export function bestPoint(points: readonly SweepPoint[]): SweepPoint | null {
  return [...points].sort((a, b) =>
    b.selection - a.selection ||
    a.escalatedShare - b.escalatedShare ||
    a.base - b.base)[0] ?? null;
}

export interface RunMeta {
  readonly model: string;
  readonly replies: number;
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
    replies: judgments.length,
    totalInputTokens: judgments.reduce((sum, j) => sum + j.usage.input_tokens, 0),
    totalCents: judgments.reduce((sum, j) => sum + j.costCents, 0),
    medianMs: times.length === 0 ? 0 : (times.length % 2 === 1 ? (times[mid] ?? 0) : ((times[mid - 1] ?? 0) + (times[mid] ?? 0)) / 2),
    meanMs: times.length === 0 ? 0 : times.reduce((sum, t) => sum + t, 0) / times.length,
  };
}
