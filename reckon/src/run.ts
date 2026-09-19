import {
  InMemoryAuditLog, InMemoryIdempotencyStore, InMemorySpendCounter, SpendCap, runPipeline,
  type AuditEntry, type AuditLog, type IdempotencyStore, type PipelineOutcome, type SpendCounter,
} from "@builds/shared";
import { LEDGER_AS_OF, parseDay } from "./clock";
import { loadFixtures, type FixtureSet } from "./fixtures/load";
import { judge as callJev, jevClient, type Judgment } from "./jev";
import type { Thresholds } from "./policy";
import type { JudgmentState } from "./questions";
import { ReckonPipeline, type Judge } from "./pipeline";
import type { Plan } from "./stages/decide";
import { ChaseStore } from "./state";
import type { Reply } from "./types";

/**
 * The assembled build. One entry point, two callers: the scorecard harness and the sandbox's
 * route handler both come through here, so there is no second place where the policy lives and
 * nothing to drift.
 */

/** The whole demo's ceiling, in cents. A stranger cannot make this expensive. */
export const SPEND_CAP_CENTS = 2_500;

export interface ReckonRunOptions {
  readonly judge: Judge;
  readonly fixtures?: FixtureSet;
  readonly thresholds?: Thresholds;
  readonly asOf?: string;
  readonly store?: ChaseStore;
  readonly idempotency?: IdempotencyStore;
  readonly audit?: AuditLog;
}

export interface ReplyOutcome {
  readonly reply: Reply;
  readonly judgment: Judgment;
  readonly plan: Plan;
  readonly outcome: PipelineOutcome;
  readonly audit: readonly AuditEntry[];
  /** Wall-clock milliseconds for the whole pipeline, measured. */
  readonly elapsedMs: number;
}

export interface Reckon {
  readonly pipeline: ReckonPipeline;
  readonly store: ChaseStore;
  readonly audit: AuditLog;
  readonly fixtures: FixtureSet;
  run(reply: Reply): Promise<ReplyOutcome>;
}

export function createReckon(options: ReckonRunOptions): Reckon {
  const fixtures = options.fixtures ?? loadFixtures();
  const store = options.store ?? new ChaseStore();
  const audit = options.audit ?? new InMemoryAuditLog();
  const asOf = options.asOf ?? LEDGER_AS_OF;

  const pipeline = new ReckonPipeline({
    fixtures,
    judge: options.judge,
    store,
    idempotency: options.idempotency ?? new InMemoryIdempotencyStore(),
    ...(options.thresholds ? { thresholds: options.thresholds } : {}),
    asOf,
  });

  return {
    pipeline,
    store,
    audit,
    fixtures,
    async run(reply: Reply): Promise<ReplyOutcome> {
      const startedAt = performance.now();
      // `receivedAt` is the ledger date, not the wall clock: audit rows have to be
      // reproducible, and a fixture run that stamps a different time on every execution
      // cannot be diffed against a committed artifact.
      const input = { id: reply.id, source: "fixture", receivedAt: parseDay(asOf), payload: reply };

      let outcome: PipelineOutcome;
      try {
        outcome = await runPipeline(pipeline, input, audit);
      } catch (error) {
        // A vendor call that exhausted its retries must leave a mark. Failing silently and
        // letting the reply fall out of the run is the one outcome an audit log exists to
        // prevent — a reply nobody acted on and nobody knows about.
        await audit.record({
          at: input.receivedAt,
          inputId: reply.id,
          stage: "log",
          summary: `run failed: ${error instanceof Error ? error.message : String(error)}`,
          data: { failed: true },
        });
        throw error;
      }
      const elapsedMs = performance.now() - startedAt;

      const judgment = pipeline.judgmentFor(reply.id);
      const plan = pipeline.planFor(reply.id);
      if (!judgment || !plan) throw new Error(`pipeline produced no judgment for ${reply.id}`);

      return { reply, judgment, plan, outcome, audit: await audit.list(reply.id), elapsedMs };
    },
  };
}

/** Buys a fresh judgment per reply. The only path that spends. */
export function liveJudge(counter: SpendCounter = new InMemorySpendCounter(), capCents = SPEND_CAP_CENTS): Judge {
  const client = jevClient();
  const cap = new SpendCap(counter, capCents);
  return (reply: Reply, state: JudgmentState) => callJev(reply.id, state, { client, cap, counter });
}

/**
 * Replays judgments already bought and committed.
 *
 * This is what the sandbox falls back to when the cap is reached, what a clone with no vendor
 * key runs on, and what lets the scorecard be recomputed at different thresholds without
 * spending again. The same code path serves all three, so it cannot rot unnoticed.
 */
export function recordedJudge(byReplyId: Readonly<Record<string, Judgment>>): Judge {
  return async (reply: Reply) => {
    const judgment = byReplyId[reply.id];
    if (!judgment) throw new Error(`no recorded judgment for ${reply.id}`);
    return judgment;
  };
}
