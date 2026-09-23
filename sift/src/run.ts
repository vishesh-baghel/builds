import { InMemoryAuditLog, InMemoryIdempotencyStore, InMemorySpendCounter, SpendCap, runPipeline } from "@builds/shared";
import type { AuditEntry, AuditLog, IdempotencyStore, PipelineOutcome, SpendCounter } from "@builds/shared";
import { INBOX_AS_OF } from "./clock";
import { firmById } from "./fixtures";
import { toMessage } from "./fixtures/instrument";
import { MEASURED_FIRM_ID } from "./fixtures/load";
import type { Instrument, LabelledMessage } from "./fixtures/schema";
import { judge as callJev, jevClient, type Judgment } from "./jev";
import { MERIDIAN_THRESHOLDS, withDeclared, type Thresholds } from "./policy";
import { SiftPipeline, type Judge } from "./pipeline";
import type { Plan } from "./stages/decide";
import { SiftStore } from "./store";
import type { Firm } from "./types";

/**
 * The assembled build over the instrument. The scorecard harness and the smoke run both come
 * through here, so there is no second place the policy lives.
 */

/** The whole run's ceiling, in cents. */
export const SPEND_CAP_CENTS = 2_500;

export interface MessageOutcome {
  readonly message: LabelledMessage;
  readonly judgment: Judgment;
  readonly plan: Plan;
  readonly outcome: PipelineOutcome;
  readonly audit: readonly AuditEntry[];
  /** Wall-clock milliseconds for the whole pipeline, measured. */
  readonly elapsedMs: number;
}

export interface SiftRunOptions {
  readonly judge: Judge;
  readonly instrument: Instrument;
  readonly firm?: Firm;
  readonly thresholds?: Thresholds;
  readonly idempotency?: IdempotencyStore;
  readonly audit?: AuditLog;
}

export function createSift(options: SiftRunOptions) {
  const firm = options.firm ?? firmById(MEASURED_FIRM_ID);
  const store = new SiftStore();
  const audit = options.audit ?? new InMemoryAuditLog();
  const { instrument } = options;
  const pipeline = new SiftPipeline({
    firm, judge: options.judge, store,
    idempotency: options.idempotency ?? new InMemoryIdempotencyStore(),
    sor: { projects: instrument.projects, rfis: instrument.rfis, submittals: instrument.submittals, contacts: instrument.contacts },
    thresholds: options.thresholds ?? withDeclared(MERIDIAN_THRESHOLDS),
  });

  return {
    pipeline, store, audit, firm,
    async run(message: LabelledMessage): Promise<MessageOutcome> {
      const startedAt = performance.now();
      // The inbox date, not the wall clock: audit rows have to be reproducible.
      const input = { id: message.id, source: "fixture", receivedAt: new Date(`${INBOX_AS_OF}T00:00:00Z`), payload: toMessage(message) };
      let outcome: PipelineOutcome;
      try {
        outcome = await runPipeline(pipeline, input, audit);
      } catch (error) {
        // A vendor call that exhausted its retries must leave a mark rather than let the message
        // fall out of the run unnoticed.
        await audit.record({
          at: input.receivedAt, inputId: message.id, stage: "log",
          summary: `run failed: ${error instanceof Error ? error.message : String(error)}`, data: { failed: true },
        });
        throw error;
      }
      const elapsedMs = performance.now() - startedAt;
      const judgment = pipeline.judgmentFor(message.id);
      const plan = pipeline.planFor(message.id);
      if (!judgment || !plan) throw new Error(`pipeline produced no judgment for ${message.id}`);
      return { message, judgment, plan, outcome, audit: await audit.list(message.id), elapsedMs };
    },
  };
}

/** Buys a fresh judgment per message. The only path that spends. */
export function liveJudge(counter: SpendCounter = new InMemorySpendCounter(), capCents = SPEND_CAP_CENTS): Judge {
  const client = jevClient();
  const cap = new SpendCap(counter, capCents);
  return (message, firm, state) => callJev(message.id, firm, state, { client, cap, counter });
}

/** Replays judgments already bought and committed. Same code path as a live run, so it cannot rot. */
export function recordedJudge(byId: Readonly<Record<string, Judgment>>): Judge {
  return async (message) => {
    const j = byId[message.id];
    if (!j) throw new Error(`no recorded judgment for ${message.id}`);
    return j;
  };
}
