import type {
  ActionResult, Classified, Decision, Escalation, Extracted, RawInput,
} from "../types";
import type { AuditLog } from "../reliability/audit-log";

/**
 * The six stages. A build supplies an implementation of the five that do work; `runPipeline`
 * wires them together, performs the sixth by writing the audit trail, and enforces the one
 * invariant that matters: only actions the decision listed as auto-executable reach `act`.
 */
export interface Pipeline<TPayload, TFields, TLabel extends string, TAction extends string> {
  extract(input: RawInput<TPayload>): Promise<Extracted<TFields>>;
  classify(extracted: Extracted<TFields>): Promise<Classified<TLabel>>;
  decide(classified: Classified<TLabel>, extracted: Extracted<TFields>): Promise<Decision<TAction>>;
  /** Called once per action, so a two-action decision cannot half-apply on a retry. */
  act(decision: Decision<TAction>, action: TAction): Promise<ActionResult>;
  escalate(
    decision: Decision<TAction>,
    extracted: Extracted<TFields>,
    classified: Classified<TLabel>,
  ): Promise<Escalation>;
}

/**
 * Both halves of the outcome. Acting and escalating are not exclusive: a decision can stop a
 * chase *and* hand the reason to a person, and a pipeline that forces a choice between them
 * throws one of the two away.
 */
export type PipelineOutcome = {
  readonly results: readonly ActionResult[];
  readonly escalation?: Escalation;
};

/** Thrown when an `act` implementation reports work other than what it was scheduled to do. */
export class PipelineInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PipelineInvariantError";
  }
}

export async function runPipeline<TPayload, TFields, TLabel extends string, TAction extends string>(
  pipeline: Pipeline<TPayload, TFields, TLabel, TAction>,
  input: RawInput<TPayload>,
  audit?: AuditLog,
): Promise<PipelineOutcome> {
  const at = input.receivedAt;
  const row = async (
    stage: "extract" | "classify" | "decide" | "act" | "escalate" | "log",
    summary: string,
    data?: Record<string, unknown>,
  ) => {
    if (!audit) return;
    await audit.record(data === undefined
      ? { at, inputId: input.id, stage, summary }
      : { at, inputId: input.id, stage, summary, data });
  };

  const extracted = await pipeline.extract(input);
  await row("extract", `extracted ${Object.keys(extracted.fields as object).length} fields`, {
    confidence: extracted.confidence,
  });

  const classified = await pipeline.classify(extracted);
  await row("classify", classified.primary ?? "nothing asserted", {
    asserted: classified.asserted,
    probabilities: Object.fromEntries(classified.probabilities.map((p) => [p.label, p.probability])),
  });

  const decision = await pipeline.decide(classified, extracted);
  await row("decide", decision.reason, {
    actions: decision.actions,
    escalate: decision.escalate,
  });

  // The invariant. The only source of work is the decision's own action list — nothing else
  // in this function can add to it — and each result must name the action it was scheduled
  // for, so an `act` that quietly does something else fails loudly rather than silently.
  const results: ActionResult[] = [];
  for (const action of new Set(decision.actions)) {
    const result = await pipeline.act(decision, action);
    if (result.action !== action) {
      throw new PipelineInvariantError(
        `act reported "${result.action}" for scheduled action "${action}" on ${input.id}`,
      );
    }
    results.push(result);
    await row("act", `${action}: ${result.status}`, result.detail === undefined ? undefined : { detail: result.detail });
  }

  if (!decision.escalate) {
    await row("log", `${results.length} action(s), no escalation`);
    return { results };
  }

  const escalation = await pipeline.escalate(decision, extracted, classified);
  await row("escalate", escalation.reason, escalation.context);
  await row("log", `${results.length} action(s), escalated`);
  return { results, escalation };
}
