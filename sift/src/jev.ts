import { TypeSafeClient, type SystemOneResult, type Usage } from "@typesafe-ai/sdk";
import { SpendCap, withRetry, type SpendCounter } from "@builds/shared";
import { typesafeApiKey } from "./env";
import { CLOCK_QUESTION, questionsFor, type JudgmentState, type SiftQuestions } from "./questions";
import type { Firm } from "./types";

/**
 * The one vendor call this build makes.
 *
 * Everything downstream of `judge()` is pure code over the returned numbers. That is why the dial
 * costs nothing, why the scorecard recomputes from a committed run artifact without spending again,
 * and why the test suite runs with no key. The call is wrapped in the two primitives every outside
 * call in this repo uses: the cap is checked against an estimate before spending and reconciled
 * against real usage after, and the retry is the shared one, with the SDK's own retry turned off.
 */

export const MODEL = "jev-latest";

/** $0.042 per million input tokens, output free. Held here so cost per message is derived, not guessed. */
export const INPUT_CENTS_PER_MTOK = 4.2;

export const costCents = (usage: Usage): number => (usage.input_tokens / 1_000_000) * INPUT_CENTS_PER_MTOK;

export interface Judgment {
  /** One probability per topic class, keyed by class. Always complete for the firm. */
  readonly scores: Readonly<Record<string, number>>;
  /** The separate clock judgment. */
  readonly clock: number;
  readonly usage: Usage;
  readonly model: string;
  readonly costCents: number;
}

export class JudgmentError extends Error {
  constructor(readonly messageId: string, message: string) {
    super(`message ${messageId}: ${message}`);
    this.name = "JudgmentError";
  }
}

const isNoul = (value: unknown): value is { type: "noul"; noul: number } =>
  typeof value === "object" && value !== null &&
  (value as { type?: unknown }).type === "noul" &&
  Number.isFinite((value as { noul?: unknown }).noul) &&
  (value as { noul: number }).noul >= 0 && (value as { noul: number }).noul <= 1;

/**
 * A response that fails any of these is a failed call, not a partial result. Typed output guarantees
 * the shape of the interface, not that it was honoured, so every Noul is checked before a single
 * number is trusted: a value outside 0..1 or a missing class would become a silently wrong decision.
 */
export function readJudgment(messageId: string, classes: readonly string[], result: SystemOneResult<SiftQuestions>): Judgment {
  const answers = result.answers as unknown as Record<string, unknown>;
  const scores: Record<string, number> = {};
  for (const c of classes) {
    const answer = answers[c];
    if (!isNoul(answer)) throw new JudgmentError(messageId, `missing or malformed noul for ${c}`);
    scores[c] = answer.noul;
  }
  const clock = answers[CLOCK_QUESTION];
  if (!isNoul(clock)) throw new JudgmentError(messageId, `missing or malformed noul for ${CLOCK_QUESTION}`);
  return { scores, clock: clock.noul, usage: result.usage, model: result.model, costCents: costCents(result.usage) };
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
  // The SDK retries internally by default. Turned off here because `withRetry` from the shared spine
  // is the retry this repo requires on every vendor call; two retry loops stacked multiply the worst
  // case rather than improving it.
  const apiKey = typesafeApiKey();
  return new TypeSafeClient({ defaultModel: MODEL, retry: { maxRetries: 0 }, ...(apiKey ? { apiKey } : {}) });
}

function isClientError(error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === "number" && status >= 400 && status < 500 && status !== 408 && status !== 429;
}

/** One request per message, capped and retried. */
export async function judge(messageId: string, firm: Firm, state: JudgmentState, deps: JudgeDeps): Promise<Judgment> {
  const estimate = estimateCents(state);
  const questions = questionsFor(firm);
  const classes = firm.classes.map((c) => c[0]);

  const judgment = await deps.cap.guard(estimate, async () =>
    withRetry(
      async () => {
        const result = await deps.client.systemOne({ model: MODEL, state, questions });
        return readJudgment(messageId, classes, result);
      },
      {
        attempts: 4,
        isRetryable: (error) => !(error instanceof JudgmentError) && !isClientError(error),
        ...(deps.sleep ? { sleep: deps.sleep } : {}),
      }));

  const correction = judgment.costCents - estimate;
  if (correction > 0) await deps.counter.add(correction);
  return judgment;
}

/** A Judgment from injected scores, no vendor call. For tests and the committed-artifact path. */
export const judgmentFromScores = (
  scores: Record<string, number>,
  clock: number,
  overrides: Partial<Omit<Judgment, "scores" | "clock">> = {}): Judgment => ({
  scores, clock, usage: { input_tokens: 0, output_tokens: 0 }, model: "injected", costCents: 0, ...overrides,
});
