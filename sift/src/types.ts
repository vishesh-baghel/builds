/**
 * Sift's own domain vocabulary.
 *
 * The shared spine (`@builds/shared`) owns `Classified`, `Decision`, `ActionResult` and
 * `PipelineOutcome`; this file must not redeclare them (checked by a grep in the test suite). What
 * lives here is the firm-specific vocabulary the spine has no opinion about: topic classes, routes,
 * priority levels and the per-topic plan. The plan is keyed by a topic-qualified action string so
 * two topics on one message survive `runPipeline`'s `new Set(decision.actions)` dedupe.
 */

import type { Sor } from "./fixtures/schema";
import type { Thresholds } from "./policy";

export type Priority = "urgent" | "high" | "normal" | "low";

/** Most urgent first, so a lower index wins a tie. */
export const PRIORITY_RANK: readonly Priority[] = ["urgent", "high", "normal", "low"];

export interface Person {
  readonly name: string;
  readonly role: string;
  readonly initials: string;
}

/**
 * One routing decision for one topic: who owns it, how urgent, and why.
 *
 * `who` is `null` when the message is labelled and left with nobody (a pitch, internal mail), and
 * `"?"` when a person must read it because none of the usual kinds fit.
 */
export interface Route {
  readonly who: string | null;
  readonly priority: Priority;
  readonly why: string;
}

/**
 * A topic class definition: its key, the yes/no question Jev is asked, a plain description used to
 * compose reason strings, and a short kind label shown on the deadline list.
 */
export type TopicClassDef = readonly [key: string, question: string, plain: string, kind: string];

export interface Message {
  readonly id: string;
  readonly from: string;
  readonly email: string;
  readonly subject: string;
  readonly body: string;
  readonly received: string;
  /**
   * Per-topic probabilities. For the six illustrative firms these are baked and captioned as
   * illustrative; on the deploy a live judgment replaces them for the message a visitor picks. The
   * key set matches the firm's `classes`.
   */
  readonly p: Readonly<Record<string, number>>;
  /** The separate clock judgment: how confident that a contractual or regulatory deadline is running. */
  readonly clock: number;
  readonly deadline?: string;
  /** The clock was confirmed in code (deadline parse or system-of-record cross-reference). */
  readonly corroborated?: boolean;
  /** This message genuinely carries a clock: the denominator for the catch rate. */
  readonly clocked?: boolean;
  /** This message matched a system-of-record row, so a person would have had to look it up. */
  readonly record?: boolean;
  readonly kind?: string;
  /** Per-topic routing overrides; where absent the firm's `defaults[topic]` is used. */
  readonly routes?: Readonly<Record<string, Route>>;
  readonly note?: string;
  /**
   * The answer key, on the measured firm only. Shown beside what Sift did so a reader can check it;
   * never an input to a decision (`assess` drops it before deciding).
   */
  readonly label?: { readonly topics: readonly string[]; readonly route: readonly string[]; readonly priority: Priority };
}

export interface Firm {
  readonly id: string;
  readonly label: string;
  readonly firm: string;
  readonly owner: string;
  readonly sourcesShort: string;
  readonly sourcesLong: string;
  readonly clockExample: string;
  readonly people: readonly Person[];
  readonly classes: readonly TopicClassDef[];
  readonly defaults: Readonly<Record<string, Route>>;
  readonly messages: readonly Message[];
  /**
   * The firm's systems of record. Present only on the measured firm: its routing, priority and
   * deadlines are then code over these, exactly as in the scored pipeline, and its probabilities are
   * recorded model judgments rather than illustrative ones.
   */
  readonly sor?: Sor;
  /** On a measured firm: its recorded run, and the lines its sweep chose, which the page opens at. */
  readonly measured?: { readonly runDate: string; readonly model: string; readonly lines: Thresholds };
}

/**
 * The closed action space. Topic-qualified so a two-topic message produces two distinct actions and
 * two distinct idempotency keys, never one collapsed `act` call.
 */
export type SiftAction =
  | `route:${string}`
  | "alert:owner"
  | "set_deadline"
  | `label:${string}`;
