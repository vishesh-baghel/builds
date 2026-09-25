/**
 * Buys one judgment per message, commits every answer, sweeps the lines on the ordinary subset and
 * writes the dated scorecard.
 *
 *   pnpm --filter @builds/sift score                   # Meridian, live: needs SIFT_TYPESAFE_API_KEY or TYPESAFE_API_KEY
 *   pnpm --filter @builds/sift score --replay          # Meridian, recomputed from the committed run artifact
 *   pnpm --filter @builds/sift score --firm law        # another firm, live
 *   pnpm --filter @builds/sift score --firm law --replay
 *
 * Meridian writes `SCORECARD.md` and `runs/run.json` and `runs/sweep.json`, as it always has. Every
 * other firm writes `runs/<firm>/SCORECARD.md`, `run.json` and `sweep.json`, and its entry in
 * `runs/served.json`, which is what the deploy serves: the recorded scores and clocks only, and the
 * lines the sweep chose.
 *
 * This is **outside the CI gate** and always will be: it needs a vendor key, and a gate that cannot
 * run without one is a gate that will not run.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { InMemorySpendCounter } from "@builds/shared";
import { hasTypesafeKey } from "../src/env";
import { firmById } from "../src/fixtures";
import { loadInstrument, MEASURED_FIRM_ID } from "../src/fixtures/load";
import type { Judgment } from "../src/jev";
import { DECLARED_THRESHOLDS, DEFAULT_THRESHOLDS, withDeclared, type Thresholds } from "../src/policy";
import { createSift, liveJudge, SPEND_CAP_CENTS } from "../src/run";
import { bestPoint, runMeta, scoreRun, sweep } from "../src/score";
import { renderScorecard, renderSweepArtifact, servedEntry, type PriorRun } from "../src/scorecard";

const replay = process.argv.includes("--replay");
const flag = process.argv.indexOf("--firm");
const firmId = flag >= 0 ? process.argv[flag + 1] ?? "" : MEASURED_FIRM_ID;
const meridian = firmId === MEASURED_FIRM_ID;
const baseFirm = firmById(firmId);
if (baseFirm.id !== firmId) {
  console.error(`no firm ${firmId}`);
  process.exit(1);
}
const rootDir = fileURLToPath(new URL("../", import.meta.url));
const runsDir = fileURLToPath(new URL(meridian ? "../runs/" : `../runs/${firmId}/`, import.meta.url));
const rel = meridian ? "runs/" : `runs/${firmId}/`;
mkdirSync(runsDir, { recursive: true });
const RUN_PATH = `${runsDir}run.json`;

const instrument = loadInstrument(firmId);
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
  const sift = createSift({ instrument, firm: baseFirm, judge: liveJudge(counter, SPEND_CAP_CENTS) });
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

const { firm } = createSift({ instrument, firm: baseFirm, judge: async () => { throw new Error("scoring never judges"); } });
const points = sweep(instrument.inbox, judgments, firm, instrument, DECLARED_THRESHOLDS);
const chosen = bestPoint(points);
const thresholds: Thresholds = chosen ? withDeclared({ act: chosen.act, review: chosen.review, clockAct: chosen.clockAct }) : DEFAULT_THRESHOLDS;
writeFileSync(`${runsDir}sweep.json`, renderSweepArtifact(points, chosen));

const figures = scoreRun(instrument.inbox, judgments, firm, instrument, thresholds);

/**
 * Earlier runs on the same instrument, kept and recomputed: each is replayed and re-swept exactly as
 * the current one is, so its headline cannot drift from its own judgments.
 */
const PRIOR: readonly { file: string; label: string; change: string }[] = !meridian ? [] : [
  { file: "run-1.json", label: "run 1", change: "Class question criteria were generic, not written from the labelling rules as the PRD requires. Rewritten from the rules committed before run 1, then rerun." },
];
const history: PriorRun[] = PRIOR.filter((p) => existsSync(`${runsDir}${p.file}`)).map((p) => {
  const prior = JSON.parse(readFileSync(`${runsDir}${p.file}`, "utf8")) as { date: string; judgments: Record<string, Recorded> };
  const best = bestPoint(sweep(instrument.inbox, prior.judgments, firm, instrument, DECLARED_THRESHOLDS));
  const lines = best ? withDeclared({ act: best.act, review: best.review, clockAct: best.clockAct }) : DEFAULT_THRESHOLDS;
  return { label: p.label, date: prior.date, change: p.change, thresholds: lines, artifact: `runs/${p.file}`, headline: scoreRun(instrument.inbox, prior.judgments, firm, instrument, lines).headline };
});
const meta = runMeta(Object.values(judgments));
writeFileSync(meridian ? `${rootDir}SCORECARD.md` : `${runsDir}SCORECARD.md`, renderScorecard({
  date: runDate, thresholds, declared: DECLARED_THRESHOLDS, figures, meta, sweep: points,
  counts: { total: instrument.inbox.length, clocked: instrument.inbox.filter((m) => m.clocked).length, hard: instrument.inbox.filter((m) => m.hard).length },
  runArtifact: `${rel}run.json`, sweepArtifact: `${rel}sweep.json`, history,
  ...(meridian ? {} : { firm: `${firm.firm}, ${firm.label.toLowerCase()}`, instrumentPath: `fixtures/${firmId}/inbox.jsonl` }),
}));

if (!meridian) {
  // What the deploy serves: scores, clocks and the model name only. Token counts and costs stay here.
  const servedPath = `${rootDir}runs/served.json`;
  const served = JSON.parse(readFileSync(servedPath, "utf8")) as Record<string, unknown>;
  served[firmId] = servedEntry(runDate, judgments, thresholds);
  const ordered = Object.fromEntries(Object.keys(served).sort().map((k) => [k, served[k]]));
  writeFileSync(servedPath, `${JSON.stringify(ordered, null, 2)}\n`);
}

const h = figures.headline;
console.log(`\nswept ${points.length} combinations on the ordinary subset`);
if (chosen) console.log(`chosen: act ${chosen.act}, review ${chosen.review}, clock ${chosen.clockAct}`);
console.log(`caught ${h.caught.count}/${h.caught.n} clocks; ${h.falseAlarms.count}/${h.falseAlarms.n} false alarms; ${h.automated.count}/${h.automated.n} automated`);
console.log(meridian ? "wrote SCORECARD.md, runs/run.json, runs/sweep.json" : `wrote ${rel}SCORECARD.md, ${rel}run.json, ${rel}sweep.json and runs/served.json`);
