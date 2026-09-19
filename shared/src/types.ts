/**
 * The contracts every build plugs into.
 *
 * A build is a composition of the six stages below. Each stage is independently testable and
 * swappable: a build varies which implementations it supplies, not the shape of the pipeline.
 */

/** Anything that enters the system: an email, a PDF, a webhook payload, a call transcript. */
export interface RawInput<TPayload = unknown> {
  readonly id: string;
  readonly source: string;
  readonly receivedAt: Date;
  readonly payload: TPayload;
}

/** Structured facts pulled out of a RawInput. */
export interface Extracted<TFields = Record<string, unknown>> {
  readonly inputId: string;
  readonly fields: TFields;
  /** 0..1. Low confidence is a routing signal, not a failure. */
  readonly confidence: number;
}

/** One class and how strongly the judgment holds it, on 0..1. */
export interface ClassProbability<TLabel extends string = string> {
  readonly label: TLabel;
  readonly probability: number;
}

/**
 * What kind of thing this is, in the build's own vocabulary.
 *
 * Multi-label by construction. A single `label` plus a single `confidence` cannot express a
 * message that is genuinely two things at once — paying part of a bill *and* disputing the
 * rest — and collapsing it to one manufactures a wrong answer. So every class carries its own
 * probability, always, and `asserted` names the ones that cleared their threshold.
 */
export interface Classified<TLabel extends string = string> {
  readonly inputId: string;
  /** Every class in the build's taxonomy, whether or not it applies. */
  readonly probabilities: readonly ClassProbability<TLabel>[];
  /** Those clearing their own threshold. May be empty — that is a routing signal. */
  readonly asserted: readonly TLabel[];
  /** Highest asserted, or null when nothing cleared. */
  readonly primary: TLabel | null;
}

/**
 * The chosen course of action, before anything has happened.
 *
 * `actions` is auto-executable by construction: a decision only lists what may run unattended.
 * Anything a human must own travels on `escalate`, and the two are not exclusive — a dispute
 * stops the chase *and* goes to a person.
 */
export interface Decision<TAction extends string = string> {
  readonly inputId: string;
  /** Auto-executable by construction; may be empty. */
  readonly actions: readonly TAction[];
  readonly escalate: boolean;
  readonly reason: string;
}

/** The record of something that actually happened in the outside world. */
export interface ActionResult {
  readonly inputId: string;
  readonly action: string;
  readonly status: "done" | "skipped" | "failed";
  readonly detail?: string;
}

/** A handoff to a human, with enough context to act without re-reading the thread. */
export interface Escalation {
  readonly inputId: string;
  readonly reason: string;
  readonly context: Record<string, unknown>;
}

export interface Stage<TIn, TOut> {
  (input: TIn): Promise<TOut>;
}
