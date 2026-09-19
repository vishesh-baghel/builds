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

/** What kind of thing this is, in the build's own vocabulary. */
export interface Classified<TLabel extends string = string> {
  readonly inputId: string;
  readonly label: TLabel;
  readonly confidence: number;
}

/** The chosen course of action, before anything has happened. */
export interface Decision<TAction extends string = string> {
  readonly inputId: string;
  readonly action: TAction;
  readonly reason: string;
  /** When false, `act` must not run; `escalate` handles it instead. */
  readonly autoExecutable: boolean;
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
