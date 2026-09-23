import type { Message, Priority } from "./types";

/**
 * The policy, in one file, so it reads without reading the pipeline.
 *
 * Everything here is deterministic code over a set of probabilities. Nothing here calls a model.
 * That separation is what makes the autonomy dial free: the judgment is bought once per message and
 * this policy re-runs over it as many times as a visitor likes, and it is what makes the whole test
 * suite runnable with no vendor key present.
 */

/**
 * The three lines, all derived from one dial.
 *
 * `act`: at or above this a topic applies and its route may run unattended.
 * `review`: below `act` but at or above this a topic is ambiguous, so it escalates rather than acts.
 * `clockAct`: the separate, deliberately low line the clock judgment must clear to raise an alert. A
 * false clock alarm costs a glance; a missed clock costs a deadline, so this line moves the other
 * way from trust: the more the dial hands to Sift, the fainter a clock it will still flag.
 */
export interface Thresholds {
  readonly act: number;
  readonly review: number;
  readonly clockAct: number;
  /** Per-class act lines that override `act`: only for classes too sparse to sweep, declared below. */
  readonly actByClass?: Readonly<Record<string, number>>;
}

/** The dial position the build ships at: the midpoint of the slider. */
export const SHIPPED_DIAL = 0.6;

const SHIPPED = { act: 0.65, review: 0.35 };
const CAUTIOUS = { act: 0.99, review: 0.10 };
const AUTONOMOUS = { act: 0.6, review: 0.6 };

const r2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Map the dial (0 to 1) to the three lines. Left of the shipped point the act line falls from
 * near-total review toward the shipped setting; right of it, it eases toward hands-off. The clock
 * line rises steadily with the dial so trust and clock-sensitivity move in opposite directions.
 */
export function linesFor(dial: number): Thresholds {
  const below = dial <= SHIPPED_DIAL;
  const from = below ? CAUTIOUS : SHIPPED;
  const to = below ? SHIPPED : AUTONOMOUS;
  const t = below ? dial / SHIPPED_DIAL : (dial - SHIPPED_DIAL) / (1 - SHIPPED_DIAL);
  return {
    act: r2(from.act + (to.act - from.act) * t),
    review: r2(from.review + (to.review - from.review) * t),
    clockAct: r2(0.2 + 0.6 * dial),
  };
}

export const DEFAULT_THRESHOLDS: Thresholds = linesFor(SHIPPED_DIAL);

/**
 * A class whose ordinary subset is too small to sweep gets its act line **declared** here, with its
 * `n` and the reason, rather than fitted to a handful of examples. The instrument's floor test fails
 * when a class falls under six ordinary examples without an entry here. Empty while every Meridian
 * class meets the floor.
 */
export interface DeclaredThreshold {
  readonly act: number;
  readonly n: number;
  readonly reason: string;
}

export const DECLARED_THRESHOLDS: Readonly<Record<string, DeclaredThreshold>> = {};

/** Folds the declared per-class lines into a set of swept lines. */
export function withDeclared(thresholds: Thresholds, declared: Readonly<Record<string, DeclaredThreshold>> = DECLARED_THRESHOLDS): Thresholds {
  const entries = Object.entries(declared);
  return entries.length === 0 ? thresholds : { ...thresholds, actByClass: Object.fromEntries(entries.map(([c, d]) => [c, d.act])) };
}

/**
 * The probability of a topic on a message. Where a firm's fixture omits a class it is treated as a
 * faint, deterministic non-zero: absent is not the same as impossible, and a hard zero would read
 * as certainty the model never expressed.
 */
export const probOf = (message: Message, topic: string): number =>
  message.p[topic] ?? 0.03 + ((topic.length * 7) % 5) / 100;

export type Band = "act" | "review" | "ignore";

export function bandFor(probability: number, thresholds: Thresholds): Band {
  if (probability >= thresholds.act) return "act";
  if (probability >= thresholds.review) return "review";
  return "ignore";
}

export const PRI_LABEL: Readonly<Record<Priority, string>> = {
  urgent: "Urgent",
  high: "Soon",
  normal: "Normal",
  low: "Low",
};

/**
 * How long a person spends on the morning sort, and on one record lookup.
 *
 * These are **declared estimates**, not measurements. No before/after baseline was taken, and
 * inventing one afterwards would be worse than having none. They live here, alone, so every surface
 * that renders one goes through `renderSecondsEstimate` and therefore carries the word "estimate".
 * They never sit in a measured table or beside a measured figure.
 */
export const HAND_SECONDS_PER_MESSAGE = 90;
export const LOOKUP_SECONDS_PER_MESSAGE = 120;

export function renderSecondsEstimate(seconds: number): string {
  return `${seconds}s per message (estimate)`;
}
