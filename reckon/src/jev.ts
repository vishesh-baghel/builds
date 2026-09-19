import { TypeSafeClient, type SystemOneResult, type Usage } from "@typesafe-ai/sdk";
import { SpendCap, withRetry, type SpendCounter } from "@builds/shared";
import { QUESTIONS, type JudgmentState } from "./questions.js";
import type { ClassScores } from "./policy.js";
import { REPLY_CLASSES } from "./types.js";
import type { AmountComponents, AmountFraction, AmountShape } from "./resolve/amount.js";
import type { DateComponents, PromiseAnchor, PromisePeriod, Weekday } from "./resolve/date.js";

/**
 * The one vendor call this build makes.
 *
 * Everything downstream of `judge()` is pure code over the returned numbers. That is why the
 * sandbox's threshold control costs nothing, why the scorecard can be recomputed from a
 * committed run artifact without spending again, and why the test suite runs with no key.
 */

export const MODEL = "jev-latest";

/**
 * $0.042 per million input tokens, output free. Held here so the scorecard's cost-per-reply is
 * derived from published pricing and real token counts rather than estimated.
 */
export const INPUT_CENTS_PER_MTOK = 4.2;

export const costCents = (usage: Usage): number =>
  (usage.input_tokens / 1_000_000) * INPUT_CENTS_PER_MTOK;

export interface Judgment {
  readonly scores: ClassScores;
  readonly date: DateComponents;
  readonly amount: AmountComponents;
  readonly usage: Usage;
  readonly model: string;
  readonly costCents: number;
}

export class JudgmentError extends Error {
  constructor(readonly replyId: string, message: string) {
    super(`reply ${replyId}: ${message}`);
    this.name = "JudgmentError";
  }
}

type Answers = Record<string, unknown>;

const isNoul = (value: unknown): value is { type: "noul"; noul: number } =>
  typeof value === "object" && value !== null &&
  (value as { type?: unknown }).type === "noul" &&
  Number.isFinite((value as { noul?: unknown }).noul) &&
  (value as { noul: number }).noul >= 0 && (value as { noul: number }).noul <= 1;

const choiceOf = (value: unknown): string | null =>
  typeof value === "object" && value !== null &&
  (value as { type?: unknown }).type === "choice" &&
  typeof (value as { choice?: unknown }).choice === "string"
    ? (value as { choice: string }).choice
    : null;

/**
 * A response that fails any of these is a failed call, not a partial result.
 *
 * Typed output guarantees the shape of the interface, not that the interface was honoured — so
 * the envelope is checked before a single number is trusted. A `noul` outside 0..1 or a missing
 * class would otherwise become a silently wrong decision.
 */
export function readJudgment(replyId: string, result: SystemOneResult<typeof QUESTIONS>): Judgment {
  const answers = result.answers as unknown as Answers;

  const scores = {} as Record<(typeof REPLY_CLASSES)[number], number>;
  for (const label of REPLY_CLASSES) {
    const answer = answers[label];
    if (!isNoul(answer)) throw new JudgmentError(replyId, `missing or malformed noul for ${label}`);
    scores[label] = answer.noul;
  }

  const need = (name: string): string => {
    const value = choiceOf(answers[name]);
    if (value === null) throw new JudgmentError(replyId, `missing or malformed choice for ${name}`);
    return value;
  };

  return {
    scores,
    date: {
      anchor: need("promise_anchor") as PromiseAnchor,
      weekday: need("promise_weekday") as Weekday,
      period: need("promise_period") as PromisePeriod,
    },
    amount: {
      shape: need("partial_amount_shape") as AmountShape,
      fraction: need("partial_fraction") as AmountFraction,
    },
    usage: result.usage,
    model: result.model,
    costCents: costCents(result.usage),
  };
}

/** Roughly four characters per token. Only used to pre-check the cap before spending. */
export const estimateCents = (state: JudgmentState): number =>
  costCents({ input_tokens: Math.ceil(JSON.stringify(state).length / 4) + 1_200, output_tokens: 0 });

export interface JudgeDeps {
  readonly client: Pick<TypeSafeClient, "systemOne">;
  readonly cap: SpendCap;
  readonly counter: SpendCounter;
  /** Injected so the retry test does not wait on a real clock. */
  readonly sleep?: (ms: number) => Promise<void>;
}

export function jevClient(): TypeSafeClient {
  // The SDK retries internally by default. Turned off here because `withRetry` from the shared
  // spine is the retry this repo requires on every vendor call, and two retry loops stacked on
  // each other multiply the worst case rather than improving it.
  return new TypeSafeClient({ defaultModel: MODEL, retry: { maxRetries: 0 } });
}

/**
 * One request per reply, wrapped in the two primitives every outside call in this repo uses.
 *
 * The cap is checked against an estimate before spending, then reconciled against real token
 * usage afterwards — a ceiling enforced on a guess and never corrected would drift away from
 * what was actually spent.
 */
export async function judge(
  replyId: string,
  state: JudgmentState,
  deps: JudgeDeps,
): Promise<Judgment> {
  const estimate = estimateCents(state);

  const judgment = await deps.cap.guard(estimate, async () =>
    withRetry(
      async () => {
        const result = await deps.client.systemOne({ model: MODEL, state, questions: QUESTIONS });
        return readJudgment(replyId, result);
      },
      {
        attempts: 4,
        // A malformed envelope and a 4xx are both unfixable by trying again.
        isRetryable: (error) => !(error instanceof JudgmentError) && !isClientError(error),
        ...(deps.sleep ? { sleep: deps.sleep } : {}),
      },
    ));

  const correction = judgment.costCents - estimate;
  if (correction > 0) await deps.counter.add(correction);
  return judgment;
}

function isClientError(error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === "number" && status >= 400 && status < 500 && status !== 408 && status !== 429;
}
