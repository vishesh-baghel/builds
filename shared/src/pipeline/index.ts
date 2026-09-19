import type {
  ActionResult, Classified, Decision, Escalation, Extracted, RawInput,
} from "../types.js";

/**
 * The six stages. A build supplies an implementation of each; `runPipeline` wires them
 * together and enforces the one invariant that matters: a decision that is not
 * auto-executable never reaches `act`.
 */
export interface Pipeline<TPayload, TFields, TLabel extends string, TAction extends string> {
  extract(input: RawInput<TPayload>): Promise<Extracted<TFields>>;
  classify(extracted: Extracted<TFields>): Promise<Classified<TLabel>>;
  decide(classified: Classified<TLabel>, extracted: Extracted<TFields>): Promise<Decision<TAction>>;
  act(decision: Decision<TAction>): Promise<ActionResult>;
  escalate(decision: Decision<TAction>, extracted: Extracted<TFields>): Promise<Escalation>;
}

export type PipelineOutcome =
  | { kind: "acted"; result: ActionResult }
  | { kind: "escalated"; escalation: Escalation };

export async function runPipeline<TPayload, TFields, TLabel extends string, TAction extends string>(
  pipeline: Pipeline<TPayload, TFields, TLabel, TAction>,
  input: RawInput<TPayload>,
): Promise<PipelineOutcome> {
  const extracted = await pipeline.extract(input);
  const classified = await pipeline.classify(extracted);
  const decision = await pipeline.decide(classified, extracted);

  if (!decision.autoExecutable) {
    return { kind: "escalated", escalation: await pipeline.escalate(decision, extracted) };
  }
  return { kind: "acted", result: await pipeline.act(decision) };
}
