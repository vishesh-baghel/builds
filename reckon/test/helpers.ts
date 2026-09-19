import { InMemoryIdempotencyStore, type IdempotencyStore } from "@builds/shared";
import { loadFixtures } from "../src/fixtures/load.js";
import type { Judgment } from "../src/jev.js";
import type { ClassScores, Thresholds } from "../src/policy.js";
import { judgmentFromScores } from "../src/pipeline.js";
import { createReckon, type Reckon } from "../src/run.js";
import { ChaseStore } from "../src/state.js";
import { REPLY_CLASSES, type Reply } from "../src/types.js";

/**
 * Test scaffolding for injected probabilities.
 *
 * Almost every test in this suite hands the pipeline a set of numbers and asserts what the
 * code does with them. That is deliberate: the vendor's accuracy is *reported* by the
 * scorecard, while code-deterministic behaviour is *asserted* here — so the suite runs with no
 * key, makes no network call, and never goes flaky because a model moved.
 */

export const fixtures = loadFixtures();

export const replyById = (id: string): Reply => {
  const reply = fixtures.replies.find((r) => r.id === id);
  if (!reply) throw new Error(`no fixture reply ${id}`);
  return reply;
};

/** Every class at a floor of 0.02, with the named ones raised. */
export function scores(overrides: Partial<ClassScores>): ClassScores {
  const base = Object.fromEntries(REPLY_CLASSES.map((label) => [label, 0.02])) as Record<string, number>;
  return { ...base, ...overrides } as ClassScores;
}

export interface Harness extends Reckon {
  readonly calls: string[];
}

/** A pipeline whose judgment is whatever the test says it is. */
export function harness(
  byId: Readonly<Record<string, Partial<Judgment> & { scores: ClassScores }>>,
  options: { thresholds?: Thresholds; store?: ChaseStore; idempotency?: IdempotencyStore; asOf?: string } = {},
): Harness {
  const calls: string[] = [];
  const reckon = createReckon({
    fixtures,
    judge: async (reply) => {
      calls.push(reply.id);
      const supplied = byId[reply.id];
      if (!supplied) throw new Error(`no injected judgment for ${reply.id}`);
      const { scores: s, ...rest } = supplied;
      return judgmentFromScores(s, rest);
    },
    store: options.store ?? new ChaseStore(),
    idempotency: options.idempotency ?? new InMemoryIdempotencyStore(),
    ...(options.thresholds ? { thresholds: options.thresholds } : {}),
    ...(options.asOf ? { asOf: options.asOf } : {}),
  });
  return { ...reckon, calls };
}

/** One reply, one set of scores, run end to end. */
export async function runOne(
  id: string,
  s: ClassScores,
  extra: Partial<Judgment> = {},
  options: Parameters<typeof harness>[1] = {},
) {
  const h = harness({ [id]: { scores: s, ...extra } }, options);
  const outcome = await h.run(replyById(id));
  return { ...outcome, store: h.store, harness: h };
}
