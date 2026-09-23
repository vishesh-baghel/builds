import { InMemoryAuditLog, InMemoryIdempotencyStore, runPipeline } from "@builds/shared";
import { INBOX_AS_OF } from "../src/clock";
import { judgmentFromScores } from "../src/jev";
import type { Thresholds } from "../src/policy";
import { SiftPipeline, type Judge } from "../src/pipeline";
import { SiftStore } from "../src/store";
import type { Firm, Message } from "../src/types";

export const asInput = (message: Message) => ({
  id: message.id, source: "test", receivedAt: new Date(INBOX_AS_OF), payload: message,
});

/** A judge that returns the same injected scores for any message. No network. */
export const fixedJudge = (scores: Record<string, number>, clock: number): Judge =>
  async () => judgmentFromScores(scores, clock);

export async function runOne(
  firm: Firm, message: Message, scores: Record<string, number>, clock: number, thresholds?: Thresholds,
) {
  const store = new SiftStore();
  const idempotency = new InMemoryIdempotencyStore();
  const audit = new InMemoryAuditLog();
  const pipeline = new SiftPipeline({ firm, judge: fixedJudge(scores, clock), store, idempotency, ...(thresholds ? { thresholds } : {}) });
  const outcome = await runPipeline(pipeline, asInput(message), audit);
  return { outcome, store, audit, pipeline, idempotency };
}
