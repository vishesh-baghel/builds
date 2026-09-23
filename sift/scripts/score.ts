/**
 * Buys one judgment per message, commits every answer, sweeps the lines on the ordinary subset and
 * writes the dated scorecard.
 *
 *   pnpm --filter @builds/sift score           # live, needs SIFT_TYPESAFE_API_KEY or TYPESAFE_API_KEY
 *   pnpm --filter @builds/sift score --replay  # recompute from the committed run artifact
 *
 * This is **outside the CI gate** and always will be: it needs a vendor key, and a gate that cannot
 * run without one is a gate that will not run.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { InMemorySpendCounter } from "@builds/shared";
import { hasTypesafeKey } from "../src/env";
import { loadInstrument } from "../src/fixtures/load";
import type { Judgment } from "../src/jev";
import { DECLARED_THRESHOLDS, DEFAULT_THRESHOLDS, withDeclared } from "../src/policy";
import { createSift, liveJudge, SPEND_CAP_CENTS } from "../src/run";
import { bestPoint, runMeta, scoreRun, sweep } from "../src/score";
import { renderScorecard, renderSweepArtifact } from "../src/scorecard";

const replay = process.argv.includes("--replay");
const runsDir = fileURLToPath(new URL("../runs/", import.meta.url));
mkdirSync(runsDir, { recursive: true });
const RUN_PATH = `${runsDir}run.json`;

const instrument = loadInstrument();
type Recorded = Judgment & { elapsedMs: number };
let judgments: Record<string, Recorded>;
let runDate: string;

if (replay) {
  const artifact = JSON.parse(readFileSync(RUN_PATH, "utf8")) as { date: string; judgments: Record<string, Recorded> };
  judgments = artifact.judgments;
  runDate = artifact.date;
  console.log(`replaying ${Object.keys(judgments).length} judgments recorded on ${runDate}`);
} else {
  if (!hasTypesafeKey()) {
    console.error("No TypeSafe key found. `score` buys judgments; it cannot run without one.");
    console.error("Set SIFT_TYPESAFE_API_KEY or TYPESAFE_API_KEY in sift/.env.local, or run with --replay.");
    process.exit(1);
  }
  const counter = new InMemorySpendCounter();
  const sift = createSift({ instrument, judge: liveJudge(counter, SPEND_CAP_CENTS) });
  judgments = {};
  console.log(`judging ${instrument.inbox.length} messages...`);
  for (const message of instrument.inbox) {
    const { judgment, elapsedMs, plan } = await sift.run(message);
    judgments[message.id] = { ...judgment, elapsedMs };
    const mark = plan.clockFlagged === message.clocked ? " " : "x";
    console.log(`  ${mark} ${message.id}  clock ${message.clocked ? "yes" : "no "} flagged ${plan.clockFlagged ? "yes" : "no "}  ${elapsedMs.toFixed(0)}ms`);
  }
  runDate = new Date().toISOString().slice(0, 10);
  writeFileSync(RUN_PATH, `${JSON.stringify({ date: runDate, judgments }, null, 2)}\n`);
  console.log(`\nspent ${(await counter.spentCents()).toFixed(3)} cents of a ${SPEND_CAP_CENTS} cent cap`);
}

const { firm } = createSift({ instrument, judge: async () => { throw new Error("scoring never judges"); } });
const points = sweep(instrument.inbox, judgments, firm, instrument, DECLARED_THRESHOLDS);
const chosen = bestPoint(points);
const thresholds = chosen ? withDeclared({ act: chosen.act, review: chosen.review, clockAct: chosen.clockAct }) : DEFAULT_THRESHOLDS;
writeFileSync(`${runsDir}sweep.json`, renderSweepArtifact(points, chosen));

const figures = scoreRun(instrument.inbox, judgments, firm, instrument, thresholds);
const meta = runMeta(Object.values(judgments));
writeFileSync(fileURLToPath(new URL("../SCORECARD.md", import.meta.url)), renderScorecard({
  date: runDate, thresholds, declared: DECLARED_THRESHOLDS, figures, meta, sweep: points,
  counts: { total: instrument.inbox.length, clocked: instrument.inbox.filter((m) => m.clocked).length, hard: instrument.inbox.filter((m) => m.hard).length },
  runArtifact: "runs/run.json", sweepArtifact: "runs/sweep.json",
}));

const h = figures.headline;
console.log(`\nswept ${points.length} combinations on the ordinary subset`);
if (chosen) console.log(`chosen: act ${chosen.act}, review ${chosen.review}, clock ${chosen.clockAct}`);
console.log(`caught ${h.caught.count}/${h.caught.n} clocks; ${h.falseAlarms.count}/${h.falseAlarms.n} false alarms; ${h.automated.count}/${h.automated.n} automated`);
console.log("wrote SCORECARD.md, runs/run.json, runs/sweep.json");
