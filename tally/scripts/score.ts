/**
 * Phase two: score the committed judgments. No vendor calls; runs with no key.
 *
 * Picks thresholds on the first 200 orders, runs every item through the shared pipeline with
 * them, and writes the scorecard, the audit trail and the replay the recording view plays.
 *
 * Run: pnpm --filter @builds/tally score
 */
import { readFileSync, writeFileSync } from "node:fs";
import { InMemoryAuditLog, InMemoryIdempotencyStore, type Escalation } from "@builds/shared";
import type { Judgment } from "../src/drex";
import type { KeyItem, WorkOrder } from "../src/fixtures";
import { dollars, itemsOf } from "../src/item";
import { itemPipeline, type DraftedLine } from "../src/pipeline";
import { chooseThresholds, tally, type Scored, type Tally } from "../src/scorecard";

const CALIBRATION_ORDERS = 200;
const root = new URL("../", import.meta.url);
const json = <T>(path: string): T => JSON.parse(readFileSync(new URL(path, root), "utf8")) as T;

const orders = json<WorkOrder[]>("fixtures/work-orders.json");
const key = json<KeyItem[]>("fixtures/answer-key.json");
const run = json<{ model: string; wallMs: number; concurrency: number; judgments: Record<string, Judgment | null> }>("runs/judgments.json");

const keyAt = new Map(key.map((k) => [`${k.orderId}@${k.start}`, k]));
const scoredByOrder = orders.map((order) => itemsOf(order).flatMap((item): Scored[] => {
  const judgment = run.judgments[item.id];
  const k = keyAt.get(`${order.id}@${item.start}`);
  if (!k) throw new Error(`no key row for ${item.id}`);
  if (!judgment) return [];
  return [{ item, judgment, key: k, alreadyInvoiced: item.code !== null && order.invoice.some((l) => l.code === item.code) }];
}));
const judgedOrders = scoredByOrder.filter((items, i) => items.length === itemsOf(orders[i]!).length).length;

const calibration = scoredByOrder.slice(0, CALIBRATION_ORDERS).flat();
const heldOut = scoredByOrder.slice(CALIBRATION_ORDERS).flat();
const thresholds = chooseThresholds(calibration);

// Every item through the six stages with the chosen thresholds, replaying committed judgments.
const audit = new InMemoryAuditLog();
const drafts: DraftedLine[] = [];
const humanQueue: Escalation[] = [];
const byId = new Map(Object.entries(run.judgments));
const pipeline = itemPipeline({
  judge: async (item) => byId.get(item.id)!,
  thresholds, idempotency: new InMemoryIdempotencyStore(), drafts, humanQueue,
});

const replay = [];
let auditRows = 0;
const auditLines: string[] = [];
for (const [i, order] of orders.entries()) {
  const scored = scoredByOrder[i]!;
  if (scored.length === 0) continue;
  const at = new Date(`${order.date}T17:00:00Z`);
  const items = [];
  for (const s of scored) {
    const out = await pipeline.run(order, s.item, at, audit);
    const rows = await audit.list(s.item.id);
    auditRows += rows.length;
    for (const row of rows) auditLines.push(JSON.stringify(row));
    items.push({
      id: s.item.id, start: s.item.start, end: s.item.end, text: s.item.text, code: s.item.code,
      clause: s.item.clause, draftedLine: s.item.draftedLine, cents: s.item.priceCents,
      verdict: s.judgment.verdict, covered: s.judgment.covered, unsupported: s.judgment.unsupported, evidence: s.judgment.evidence,
      outcome: out.decision.outcome, reason: out.decision.reason,
      truth: s.key.truth, trap: s.key.trap, expected: s.key.expected,
    });
  }
  replay.push({ id: order.id, customer: order.customer, date: order.date, technician: order.technician, equipment: order.equipment, note: order.note, invoice: order.invoice, items });
}

const all = scoredByOrder.flat();
const judgments = all.map((s) => s.judgment);
const sorted = (xs: number[]) => [...xs].sort((a, b) => a - b);
const median = (xs: number[]) => sorted(xs)[Math.floor(xs.length / 2)] ?? 0;
const tokens = judgments.map((j) => j.inputTokens);
const performance = {
  model: run.model,
  decisions: judgments.length,
  questionsPerDecision: 4,
  p50LatencyMs: Math.round(median(judgments.map((j) => j.latencyMs))),
  p95LatencyMs: Math.round(sorted(judgments.map((j) => j.latencyMs))[Math.floor(judgments.length * 0.95)] ?? 0),
  concurrency: run.concurrency,
  wallSeconds: Math.round(run.wallMs / 1000),
  decisionsPerMinute: Math.round(judgments.length / (run.wallMs / 60_000)),
  medianInputTokensPerDecision: median(tokens),
  inputTokensPer1000Decisions: Math.round((tokens.reduce((a, b) => a + b, 0) / judgments.length) * 1000),
};

const full = tally(all, thresholds);
const held = tally(heldOut, thresholds);
const scorecard = {
  orders: orders.length, judgedOrders, calibrationOrders: CALIBRATION_ORDERS, thresholds,
  full, heldOut: held, performance, auditRows, draftedLines: drafts.length, humanQueue: humanQueue.length,
};

writeFileSync(new URL("runs/scorecard.json", root), JSON.stringify(scorecard, null, 1) + "\n");
writeFileSync(new URL("runs/audit.jsonl", root), auditLines.join("\n") + "\n");
writeFileSync(new URL("public/replay.json", root), JSON.stringify({ thresholds, performance, full, orders: replay }) + "\n");
writeFileSync(new URL("SCORECARD.md", root), markdown());
console.log(markdown());

function section(title: string, r: Tally): string {
  const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(1)}%` : "n/a");
  return [
    `### ${title}`, "",
    "| Measure | Value |", "|---|--:|",
    `| Work items judged | ${r.items} |`,
    `| Unbilled $ planted | ${dollars(r.plantedCents)} |`,
    `| Unbilled $ found | ${dollars(r.foundCents)} (${pct(r.foundCents, r.plantedCents)}) |`,
    `| $ counted that should not have been | ${dollars(r.wronglyCountedCents)} across ${r.wronglyCounted} items |`,
    `| Items counted as recovered | ${r.recovered} |`,
    `| Drafted lines stopped by the guardrail | ${r.guardrailBlocks} |`,
    `| Items routed to a human | ${r.humanRouted} |`,
    `| Drex verdict matches the key | ${pct(r.verdictAccuracy, 1)} |`,
    "", "| Planted trap | Planted | Handled correctly |", "|---|--:|--:|",
    ...Object.entries(r.traps).map(([trap, v]) => `| ${trap} | ${v.planted} | ${v.caught} (${pct(v.caught, v.planted)}) |`),
    "",
  ].join("\n");
}

function markdown(): string {
  const p = performance;
  return [
    "# Tally scorecard", "",
    `Generated by \`pnpm --filter @builds/tally score\` from \`runs/judgments.json\`. ${judgedOrders} of ${orders.length} orders fully judged.`, "",
    `Thresholds were chosen on the first ${CALIBRATION_ORDERS} orders only: guardrail at ${thresholds.unsupported}, evidence below ${thresholds.evidence} of 4 routes to a human, coverage conflict at ${thresholds.covered}, close call below ${thresholds.margin}.`, "",
    section(`All ${orders.length} orders`, full),
    section(`Held out: orders ${CALIBRATION_ORDERS + 1} to ${orders.length}, not used to pick thresholds`, held),
    "### Performance", "",
    "| Measure | Value |", "|---|--:|",
    `| Model | ${p.model} |`,
    `| Decisions (one request, four questions, per work item) | ${p.decisions} |`,
    `| p50 / p95 request latency | ${p.p50LatencyMs} ms / ${p.p95LatencyMs} ms |`,
    `| Throughput at concurrency ${p.concurrency} | ${p.decisionsPerMinute} decisions per minute |`,
    `| Median input tokens per decision | ${p.medianInputTokensPerDecision} |`,
    `| Input tokens per 1,000 decisions | ${p.inputTokensPer1000Decisions.toLocaleString("en-US")} |`,
    "", "Throughput is bounded by the account's request rate limit, not by model latency.",
    `Audit trail: ${auditRows} rows in \`runs/audit.jsonl\`, one decide row per work item.`, "",
  ].join("\n");
}
