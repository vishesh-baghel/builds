/**
 * Phase one of the run: ask Drex about every work item and commit the raw judgments.
 * Scoring, thresholds and the pipeline run over this file afterwards, with no further calls.
 *
 * Run: pnpm --filter @builds/tally run -- [--orders N] [--out runs/judgments.json] [--no-agreement]
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { InMemorySpendCounter, SpendCap } from "@builds/shared";
import { apiKey, model, tokenCap } from "../src/env";
import { drexClient, judge, type Judgment } from "../src/drex";
import type { WorkOrder } from "../src/fixtures";
import { itemsOf, stateFor } from "../src/item";

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
};
const limit = Number(arg("orders") ?? 1_000);
const out = arg("out") ?? "runs/judgments.json";
// Ablation for the long-state check: the same items with the agreement withheld.
const withoutAgreement = process.argv.includes("--no-agreement");
const CONCURRENCY = Number(arg("concurrency") ?? 4);

if (!apiKey()) throw new Error("TYPESAFE_API_KEY is not set; see .env.example");

const root = new URL("../", import.meta.url);
const orders = (JSON.parse(readFileSync(new URL("fixtures/work-orders.json", root), "utf8")) as WorkOrder[]).slice(0, limit);
const agreement = withoutAgreement ? "Not provided." : readFileSync(new URL("fixtures/agreement.md", root), "utf8");

const jobs = orders.flatMap((order) => itemsOf(order).map((item) => ({ order, item })));
const counter = new InMemorySpendCounter();
const deps = { client: drexClient(), cap: new SpendCap(counter, tokenCap()), counter };

// Resumable: a rate-limited or interrupted run picks up where its checkpoint left off.
const checkpoint = existsSync(new URL(out, root)) && process.argv.includes("--resume")
  ? JSON.parse(readFileSync(new URL(out, root), "utf8")) as { wallMs: number; judgments: Record<string, Judgment | null> }
  : { wallMs: 0, judgments: {} };
const previous = checkpoint.judgments;
const previousWallMs = checkpoint.wallMs;
const judgments: Record<string, Judgment> = Object.fromEntries(Object.entries(previous).filter((e): e is [string, Judgment] => e[1] != null));
const pending = jobs.filter(({ item }) => !judgments[item.id]);
let next = 0;
let done = 0;
const started = performance.now();

async function worker(): Promise<void> {
  while (next < pending.length) {
    const { order, item } = pending[next++]!;
    judgments[item.id] = await judge(item.id, stateFor(order, item, agreement), deps);
    if (++done % 100 === 0) { console.log(`${done}/${pending.length}`); save(); }
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
const wallMs = performance.now() - started;

save();
console.log(`${jobs.length} items from ${orders.length} orders in ${(wallMs / 1000).toFixed(1)}s -> ${out}`);

function save(): void {
  const run = {
    model: model(),
    orders: orders.length,
    items: jobs.length,
    concurrency: CONCURRENCY,
    agreement: !withoutAgreement,
    // Wall time across every session that contributed, so throughput survives a resume.
    wallMs: previousWallMs + Math.round(performance.now() - started),
    // Keyed in item order so the file diffs cleanly between runs.
    judgments: Object.fromEntries(jobs.map(({ item }) => [item.id, judgments[item.id] ?? null])),
  };
  writeFileSync(new URL(out, root), JSON.stringify(run) + "\n");
}
