/**
 * Does Drex use the agreement it is given? Drex reads unusually few tokens per request on its
 * own published playground, which could mean long state is truncated. This compares the same
 * items judged with the agreement and without it, both with the first run's questions:
 * `runs/v1-judgments.json` and `runs/v1-ablation.json` (written by
 * `pnpm run -- --orders 60 --no-agreement --out runs/v1-ablation.json`).
 *
 * Run: pnpm --filter @builds/tally exec tsx scripts/ablation.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import type { Judgment } from "../src/drex";
import type { KeyItem, WorkOrder } from "../src/fixtures";
import { itemsOf } from "../src/item";
import { topVerdict } from "../src/policy";

const root = new URL("../", import.meta.url);
const json = <T>(p: string): T => JSON.parse(readFileSync(new URL(p, root), "utf8")) as T;
const orders = json<WorkOrder[]>("fixtures/work-orders.json");
const key = json<KeyItem[]>("fixtures/answer-key.json");
const withA = json<{ judgments: Record<string, Judgment | null> }>("runs/v1-judgments.json").judgments;
const without = json<{ judgments: Record<string, Judgment | null>; orders: number }>("runs/v1-ablation.json");

const keyAt = new Map(key.map((k) => [`${k.orderId}@${k.start}`, k]));
const rows = orders.slice(0, without.orders).flatMap((o) => itemsOf(o).flatMap((item) => {
  const a = withA[item.id], b = without.judgments[item.id], k = keyAt.get(`${o.id}@${item.start}`)!;
  return a && b ? [{ a, b, k }] : [];
}));

// Coverage is the question only the agreement can answer: compare it on covered vs billable items.
const coverageAccuracy = (pick: (r: (typeof rows)[number]) => Judgment) => {
  const relevant = rows.filter((r) => r.k.truth === "covered" || r.k.truth === "missed_billable" || r.k.truth === "invoiced");
  const right = relevant.filter((r) => (pick(r).covered >= 0.5) === (r.k.truth === "covered")).length;
  return { right, of: relevant.length };
};
const verdictAccuracy = (pick: (r: (typeof rows)[number]) => Judgment) =>
  ({ right: rows.filter((r) => topVerdict(pick(r)) === r.k.truth).length, of: rows.length });
const tokens = (pick: (r: (typeof rows)[number]) => Judgment) =>
  Math.round(rows.reduce((s, r) => s + pick(r).inputTokens, 0) / rows.length);

const result = {
  items: rows.length,
  withAgreement: { coverage: coverageAccuracy((r) => r.a), verdict: verdictAccuracy((r) => r.a), meanInputTokens: tokens((r) => r.a) },
  withoutAgreement: { coverage: coverageAccuracy((r) => r.b), verdict: verdictAccuracy((r) => r.b), meanInputTokens: tokens((r) => r.b) },
};
writeFileSync(new URL("runs/v1-ablation-result.json", root), JSON.stringify(result, null, 1) + "\n");
console.log(JSON.stringify(result, null, 1));
