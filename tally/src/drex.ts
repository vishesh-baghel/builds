import { TypeSafeClient, type SystemOneResult } from "@typesafe-ai/sdk";
import { withRetry, type SpendCap, type SpendCounter } from "@builds/shared";
import { apiKey, baseURL, model } from "./env";
import { VERDICTS, type Verdict } from "./fixtures";
import type { ItemState } from "./item";
import { QUESTIONS } from "./questions";

/**
 * The one vendor call this build makes, one request per work item carrying all four questions.
 * Everything after it is code over the returned numbers, so the committed judgments can be
 * re-scored at any threshold without calling Drex again.
 */
export interface Judgment {
  readonly verdict: Record<Verdict, number>;
  readonly covered: number;
  readonly unsupported: number;
  /** Expected score on the 0..4 rubric. */
  readonly evidence: number;
  readonly inputTokens: number;
  readonly latencyMs: number;
}

export class JudgmentError extends Error {
  constructor(readonly itemId: string, message: string) {
    super(`item ${itemId}: ${message}`);
    this.name = "JudgmentError";
  }
}

const unit = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1;

/** A malformed envelope is a failed call, never a partial result. */
export function readJudgment(itemId: string, result: SystemOneResult<typeof QUESTIONS>, latencyMs: number): Judgment {
  const { verdict, covered, unsupported, evidence } = result.answers;
  const probabilities = verdict?.probabilities as Record<string, unknown> | undefined;
  if (!probabilities || !VERDICTS.every((v) => unit(probabilities[v]))) throw new JudgmentError(itemId, "malformed verdict");
  if (!unit(covered?.noul)) throw new JudgmentError(itemId, "malformed covered noul");
  if (!unit(unsupported?.noul)) throw new JudgmentError(itemId, "malformed unsupported noul");
  if (typeof evidence?.score !== "number" || evidence.score < 0 || evidence.score > 4) throw new JudgmentError(itemId, "malformed evidence score");
  return {
    verdict: Object.fromEntries(VERDICTS.map((v) => [v, probabilities[v] as number])) as Record<Verdict, number>,
    covered: covered.noul,
    unsupported: unsupported.noul,
    evidence: evidence.score,
    inputTokens: result.usage.input_tokens,
    latencyMs,
  };
}

export function drexClient(): TypeSafeClient {
  const key = apiKey();
  // The shared `withRetry` is this repo's retry; the SDK's own is off so the two do not stack.
  return new TypeSafeClient({ baseURL: baseURL(), defaultModel: model(), retry: { maxRetries: 0 }, ...(key ? { apiKey: key } : {}) });
}

/** Roughly four characters per token; only used to check the cap before spending. */
export const estimateTokens = (state: ItemState): number => Math.ceil(JSON.stringify(state).length / 4) + 600;

export interface JudgeDeps {
  readonly client: Pick<TypeSafeClient, "systemOne">;
  /** Denominated in input tokens, not cents: Drex has no published per-token price. */
  readonly cap: SpendCap;
  readonly counter: SpendCounter;
  readonly sleep?: (ms: number) => Promise<void>;
}

export async function judge(itemId: string, state: ItemState, deps: JudgeDeps): Promise<Judgment> {
  const estimate = estimateTokens(state);
  const judgment = await deps.cap.guard(estimate, () =>
    withRetry(async () => {
      const started = performance.now();
      const result = await deps.client.systemOne({ model: model(), state, questions: QUESTIONS });
      return readJudgment(itemId, result, performance.now() - started);
    }, {
      // The account caps concurrent requests and requests per minute; 429s are waited out.
      attempts: 30,
      baseDelayMs: 2_000,
      maxDelayMs: 15_000,
      isRetryable: (error) => !(error instanceof JudgmentError) && !isClientError(error),
      ...(deps.sleep ? { sleep: deps.sleep } : {}),
    }));
  // Reconcile the estimate against real usage so the ceiling tracks what was actually read.
  const correction = judgment.inputTokens - estimate;
  if (correction > 0) await deps.counter.add(correction);
  return judgment;
}

function isClientError(error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === "number" && status >= 400 && status < 500 && status !== 408 && status !== 429;
}
