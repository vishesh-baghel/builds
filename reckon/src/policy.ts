import { REPLY_CLASSES, type ReplyClass } from "./types.js";

/**
 * The policy, in one file, so it reads without reading the pipeline.
 *
 * Everything here is deterministic code over a set of probabilities. Nothing here calls a
 * model. That separation is what makes the sandbox's threshold control free — the judgment is
 * bought once and the policy re-runs over it as many times as a visitor likes — and what makes
 * the whole test suite runnable with no vendor key present.
 */

/** Probabilities for every class, keyed by class. Always complete. */
export type ClassScores = Readonly<Record<ReplyClass, number>>;

export interface Thresholds {
  /** Per class: at or above this, the class applies and its actions may run unattended. */
  readonly act: Readonly<Record<ReplyClass, number>>;
  /** Below `act` but at or above this, the class is ambiguous: it escalates, it does not act. */
  readonly review: number;
}

/**
 * Chosen on the 51 ordinary replies only, never on the 21 hard ones, and committed alongside
 * the full sweep. Nothing here is fitted to the figure it produces.
 *
 * `dispute` and `claimed_payment` sit higher than the rest because their errors cost the most:
 * acting wrongly means either ignoring someone who is arguing, or standing down a chase against
 * a customer who has not actually paid. TypeSafe's own guidance is to scale the threshold with
 * the cost of being wrong, and these are the two that carry it.
 *
 * `partial` is **declared, not swept**. The ordinary subset holds only n = 2 `partial` replies,
 * and a threshold fitted to two examples is a number with a decimal point rather than a
 * measurement. It takes the base value and the scorecard says so.
 */
export const DEFAULT_THRESHOLDS: Thresholds = {
  act: {
    dispute: 0.88,
    claimed_payment: 0.88,
    promise_to_pay: 0.80,
    partial: 0.80,
    question: 0.80,
    wrong_contact: 0.80,
    noise: 0.80,
  },
  review: 0.40,
};

/** `partial`'s threshold was not swept. Named so the scorecard can state it rather than imply it. */
export const DECLARED_THRESHOLDS: readonly ReplyClass[] = ["partial"];

export type Band = "act" | "review" | "ignore";

export function bandFor(label: ReplyClass, probability: number, thresholds: Thresholds): Band {
  if (probability >= thresholds.act[label]) return "act";
  if (probability >= thresholds.review) return "review";
  return "ignore";
}

export const assertedFrom = (scores: ClassScores, thresholds: Thresholds): ReplyClass[] =>
  REPLY_CLASSES.filter((label) => bandFor(label, scores[label], thresholds) === "act");

export const reviewBandFrom = (scores: ClassScores, thresholds: Thresholds): ReplyClass[] =>
  REPLY_CLASSES.filter((label) => bandFor(label, scores[label], thresholds) === "review");

/**
 * The five tie-break rules, discovered while labelling and binding on the labels themselves.
 * They resolve which class leads when two genuinely apply; they never remove a class from the
 * asserted set, because both effects still have to happen.
 *
 * Read as: when both are asserted, `winner` leads regardless of which scored higher.
 */
export const TIE_BREAKS = [
  {
    rule: 1,
    name: "money now beats money later",
    winner: "partial",
    loser: "promise_to_pay",
    because: "part of the balance is being paid now, so that is what leads even when the rest is promised",
  },
  {
    rule: 2,
    name: "a promise to reply is not a promise to pay",
    winner: "question",
    loser: "promise_to_pay",
    because: "coming back to you is not sending money",
  },
  {
    rule: 3,
    name: "an actionable redirect outranks an auto-reply",
    winner: "wrong_contact",
    loser: "noise",
    because: "an out-of-office naming a live alternate contact is something to act on",
  },
  {
    rule: 4,
    name: "acknowledging the email is not acknowledging the debt",
    winner: "noise",
    loser: "claimed_payment",
    because: "'received, thank you' says nothing about whether the invoice was paid",
  },
  {
    rule: 5,
    name: "disputing the terms is still a dispute",
    winner: "dispute",
    loser: "question",
    because: "'our contract says net 60' argues with the bill even though it asks nothing",
  },
] as const satisfies readonly {
  rule: number; name: string; winner: ReplyClass; loser: ReplyClass; because: string;
}[];

export type TieBreak = (typeof TIE_BREAKS)[number];

export interface PrimaryDerivation {
  /** Highest-probability asserted class after tie-breaks, or null when nothing cleared. */
  readonly primary: ReplyClass | null;
  /** The rule that moved it, when one did. */
  readonly tieBreak: TieBreak | null;
}

/**
 * The primary-class rule, stated once: the highest-probability asserted class, then the
 * tie-breaks applied in order. Null when no class cleared its threshold — which is a routing
 * signal, not a missing answer.
 */
export function derivePrimary(asserted: readonly ReplyClass[], scores: ClassScores): PrimaryDerivation {
  if (asserted.length === 0) return { primary: null, tieBreak: null };

  let primary = [...asserted].sort((a, b) => scores[b] - scores[a] || REPLY_CLASSES.indexOf(a) - REPLY_CLASSES.indexOf(b))[0] as ReplyClass;
  let tieBreak: TieBreak | null = null;

  const held = new Set(asserted);
  for (const candidate of TIE_BREAKS) {
    if (primary === candidate.loser && held.has(candidate.winner)) {
      primary = candidate.winner;
      tieBreak = candidate;
    }
  }
  return { primary, tieBreak };
}

/**
 * The unsubscribe guard.
 *
 * The fixture set records a known gap: "remove me from this distribution list" is labelled
 * `noise` because none of the seven classes holds it. The taxonomy stays at seven and the labels
 * stay frozen — a class with one example has no scoreable per-class number. Instead this runs on
 * every reply, in code, and raises a stop-contacting item regardless of what Jev returned. The
 * gap stays recorded; the system no longer ignores it.
 */
export const UNSUBSCRIBE_PATTERN =
  /\b(remove me|unsubscribe|stop (emailing|contacting|sending)|take me off|opt out of)\b/i;

export const wantsNoContact = (body: string): boolean => UNSUBSCRIBE_PATTERN.test(body);

/**
 * How long a person spends reading one reply.
 *
 * This is a **declared estimate**, not a measurement. No baseline was taken before the build,
 * and inventing one afterwards would be worse than having none. It lives here, alone, so that
 * every surface rendering it has to go through `renderHumanTimeEstimate` and therefore has to
 * carry the word "estimate". It never appears in the measured table and never sits beside a
 * measured figure.
 */
export const HUMAN_MINUTES_PER_REPLY = 4;

export function renderHumanTimeEstimate(minutes: number = HUMAN_MINUTES_PER_REPLY): string {
  return `${minutes} min per reply (estimate)`;
}

/**
 * `noise` earns no credit as a secondary class.
 *
 * Tie-break rule 3 says an actionable redirect outranks an auto-reply, so a system answering
 * `noise` on an out-of-office that names a live contact has not half-succeeded — it has missed
 * the only thing in the message worth acting on. Rewarding it for the `noise` it also asserted
 * would flatter exactly the failure the rule exists to name.
 */
export const SECONDARY_CREDIT_EXCLUDES: readonly ReplyClass[] = ["noise"];
