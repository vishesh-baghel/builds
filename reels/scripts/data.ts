/**
 * Writes the figures each reel animates, computed by each build's own code from its committed run.
 *
 *   pnpm --filter @builds/reels data
 *
 * Nothing here judges or spends: tally's figures come from `tally/public/replay.json`, which its
 * `score` script writes; reckon and sift replay `runs/run.json` through their own `scoreRun` and
 * decide stages, at the lines their scorecards publish. A reel shows no number this file did not
 * compute, so every figure on screen traces back to a committed artifact.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { RATE_CARD } from "../../tally/src/catalog";
import { loadFixtures } from "../../reckon/src/fixtures/load";
import { DEFAULT_THRESHOLDS as RECKON_LINES } from "../../reckon/src/policy";
import { runMeta as reckonMeta, scoreRun as reckonScore } from "../../reckon/src/score";
import { decidePlan as reckonDecide } from "../../reckon/src/stages/decide";
import { LEDGER_AS_OF } from "../../reckon/src/clock";
import type { ClassScores } from "../../reckon/src/policy";
import type { Judgment as ReckonJudgment } from "../../reckon/src/jev";
import { INBOX_AS_OF } from "../../sift/src/clock";
import { loadInstrument } from "../../sift/src/fixtures/load";
import type { Judgment as SiftJudgment } from "../../sift/src/jev";
import { MERIDIAN_THRESHOLDS, withDeclared } from "../../sift/src/policy";
import { createSift, recordedJudge } from "../../sift/src/run";
import { runMeta as siftMeta, scoreRun as siftScore } from "../../sift/src/score";

const here = (p: string): string => fileURLToPath(new URL(p, import.meta.url));
const json = <T>(p: string): T => JSON.parse(readFileSync(here(p), "utf8")) as T;
const write = (name: string, data: unknown): void => {
  writeFileSync(here(`../src/data/${name}.json`), `${JSON.stringify(data)}\n`);
  console.log(`wrote src/data/${name}.json`);
};

/* ---------------------------------------------------------------- tally */

interface TallyItem {
  text: string; start: number; end: number; code: string | null; outcome: string; expected: string;
  priceCents: number; alreadyInvoiced: boolean; draftedLine: string | null;
  verdict: Record<string, number>; covered: number; unsupported: number; evidence: number;
}
interface TallyOrder {
  id: string; customer: string; technician: string; equipment: string; note: string;
  invoice: { code: string; description: string; quantity: number; cents: number }[]; items: TallyItem[];
}
interface Replay {
  thresholds: { unsupported: number; evidence: number; covered: number };
  full: { items: number; plantedCents: number; foundCents: number; wronglyCountedCents: number; wronglyCounted: number; humanRouted: number; guardrailBlocks: number };
  orders: TallyOrder[];
}

const replay = json<Replay>("../../tally/public/replay.json");
const FEATURED = "WO-24005";
const featured = replay.orders.find((o) => o.id === FEATURED);
if (!featured) throw new Error(`${FEATURED} is not in the replay`);

// One entry per order, in run order: its outcome and the money it adds to each running total,
// using the same rule as tally's own scorecard (found: counted and planted; wrong: counted, not).
// The outcome follows the replay's own grid: money found wins, then a blocked charge, then your call.
const grid = replay.orders.map((o) => {
  let found = 0, wrong = 0, person = false, blocked = false;
  for (const it of o.items) {
    if (it.outcome === "recovered") {
      if (it.expected === "recover") found += it.priceCents;
      else wrong += it.priceCents;
    }
    if (it.outcome === "human") person = true;
    if (it.outcome === "guardrail") blocked = true;
  }
  const kind = found + wrong > 0 ? 1 : blocked ? 3 : person ? 2 : 0;
  return [kind, found, wrong] as const;
});
const sum = (i: 1 | 2): number => grid.reduce((s, g) => s + g[i], 0);
if (sum(1) !== replay.full.foundCents || sum(2) !== replay.full.wronglyCountedCents) {
  throw new Error("per-order totals do not reproduce tally's scorecard");
}

write("tally", {
  source: "tally/public/replay.json, written by `pnpm --filter @builds/tally score`",
  thresholds: replay.thresholds,
  full: replay.full,
  featuredIndex: replay.orders.indexOf(featured),
  featured: {
    id: featured.id, customer: featured.customer, technician: featured.technician, equipment: featured.equipment,
    note: featured.note, invoice: featured.invoice,
    items: featured.items.map((it) => ({
      text: it.text, start: it.start, end: it.end, code: it.code, outcome: it.outcome, priceCents: it.priceCents,
      description: RATE_CARD.find((line) => line.code === it.code)?.description ?? null,
      alreadyInvoiced: it.alreadyInvoiced, draftedLine: it.draftedLine,
      verdict: it.verdict, covered: it.covered, unsupported: it.unsupported, evidence: it.evidence,
    })),
  },
  grid,
});

/* --------------------------------------------------------------- reckon */

const fixtures = loadFixtures();
const reckonRun = json<{ date: string; judgments: Record<string, ReckonJudgment & { elapsedMs: number }> }>("../../reckon/runs/run.json");
const scoresById = Object.fromEntries(Object.entries(reckonRun.judgments).map(([id, j]) => [id, j.scores as ClassScores]));
const reckonFigures = reckonScore(fixtures.replies, scoresById, RECKON_LINES);
const reckonPlan = (id: string) => {
  const reply = fixtures.replies.find((r) => r.id === id);
  const j = reckonRun.judgments[id];
  const invoice = reply && fixtures.invoices.find((i) => i.invoiceNo === reply.invoice);
  if (!reply || !j || !invoice) throw new Error(`reckon has no reply, judgment or invoice for ${id}`);
  const plan = reckonDecide({
    replyId: id, body: reply.body, invoice, scores: j.scores as ClassScores, date: j.date, amount: j.amount,
    thresholds: RECKON_LINES, asOf: LEDGER_AS_OF,
  });
  return { reply, j, invoice, plan };
};

const FEATURED_REPLY = "r043";
const r = reckonPlan(FEATURED_REPLY);
const meta = reckonMeta(Object.values(reckonRun.judgments));

write("reckon", {
  source: "reckon/runs/run.json, replayed through reckon's scoreRun and decide stage",
  date: reckonRun.date,
  lines: RECKON_LINES,
  featured: {
    id: r.reply.id, from: r.reply.from, subject: r.reply.subject, body: r.reply.body, hard: r.reply.hard,
    // right on the strict primary measure, by the same rule the scorecard counts with
    correct: reckonFigures.results.find((x) => x.id === r.reply.id)?.correct ?? false,
    invoice: { number: r.invoice.invoiceNo, customer: r.invoice.customer, openBalance: r.invoice.openBalance, daysPastDue: r.invoice.daysPastDue },
    scores: r.j.scores, elapsedMs: r.j.elapsedMs,
    asserted: r.plan.asserted, review: r.plan.review, primary: r.plan.primary,
    effects: r.plan.effects.map((e) => ({ action: e.action, summary: e.summary })),
    handoffs: r.plan.handoffs,
  },
  // The replies that fly in: their text and what reckon made of them.
  replies: ["r001", "r060", "r030", "r011", "r010", "r020", "r005", "r002"].map((id) => {
    const p = reckonPlan(id);
    return { id, from: p.reply.from, subject: p.reply.subject, body: p.reply.body, primary: p.plan.primary, asserted: p.plan.asserted };
  }),
  ordinary: { n: reckonFigures.ordinary.n, errors: reckonFigures.ordinary.errors, caught: reckonFigures.ordinary.errorsCaught, automated: reckonFigures.ordinary.automated },
  hard: { n: reckonFigures.hard.n, errors: reckonFigures.hard.errors, caught: reckonFigures.hard.errorsCaught, automated: reckonFigures.hard.automated },
  meta: { replies: meta.replies, totalCents: meta.totalCents, medianMs: meta.medianMs, model: meta.model },
});

/* ----------------------------------------------------------------- sift */

const instrument = loadInstrument();
const siftRun = json<{ date: string; judgments: Record<string, SiftJudgment & { elapsedMs: number }> }>("../../sift/runs/run.json");
const siftLines = withDeclared(MERIDIAN_THRESHOLDS);
const sift = createSift({ instrument, judge: recordedJudge(siftRun.judgments) });
const siftFigures = siftScore(instrument.inbox, siftRun.judgments, sift.firm, instrument, siftLines);
const siftMetaFigures = siftMeta(Object.values(siftRun.judgments));

const FEATURED_MESSAGE = "m040";
const message = instrument.inbox.find((m) => m.id === FEATURED_MESSAGE);
if (!message) throw new Error(`${FEATURED_MESSAGE} is not in the inbox`);
const outcome = await sift.run(message);

write("sift", {
  source: "sift/runs/run.json, replayed through sift's scoreRun and pipeline",
  date: siftRun.date,
  asOf: INBOX_AS_OF,
  lines: siftLines,
  headline: siftFigures.headline,
  featured: {
    id: message.id, from: message.from, subject: message.subject, body: message.body, received: message.receivedAt,
    scores: outcome.judgment.scores, clock: outcome.judgment.clock, elapsedMs: siftRun.judgments[message.id]?.elapsedMs ?? 0,
    asserted: outcome.plan.asserted, people: outcome.plan.people, priority: outcome.plan.priority,
    clockFlagged: outcome.plan.clockFlagged, alert: outcome.plan.alert, headline: outcome.plan.headline,
    outcomes: outcome.plan.outcomes, audit: outcome.audit.map((a) => ({ stage: a.stage, summary: a.summary })),
  },
  inbox: siftFigures.results.map((res) => {
    const m = instrument.inbox.find((x) => x.id === res.id);
    return {
      id: res.id, from: m?.from ?? "", subject: m?.subject ?? "", received: m?.receivedAt ?? "", hard: res.hard,
      clocked: res.clocked, asserted: res.asserted, people: res.people, priority: res.priority,
      clockFlagged: res.clockFlagged, escalated: res.escalated,
    };
  }),
  meta: { messages: siftMetaFigures.messages, totalCents: siftMetaFigures.totalCents, medianMs: siftMetaFigures.medianMs, model: siftMetaFigures.model },
});
