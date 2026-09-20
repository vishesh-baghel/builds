/**
 * Buys one judgment per reply, commits every answer, sweeps thresholds on the ordinary subset
 * and writes the dated scorecard.
 *
 *   pnpm --filter @builds/reckon score          # live, needs TYPESAFE_API_KEY
 *   pnpm --filter @builds/reckon score --replay # recompute from the committed run artifact
 *
 * This is **outside the CI gate** and always will be: it needs a vendor key, and a gate that
 * cannot run without one is a gate that will not run.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { InMemorySpendCounter } from "@builds/shared";
import { hasTypesafeKey } from "../src/env";
import { loadFixtures } from "../src/fixtures/load";
import type { Judgment } from "../src/jev";
import { DEFAULT_THRESHOLDS } from "../src/policy";
import { bestPoint, runMeta, scoreRun, sweep, thresholdsAt } from "../src/score";
import { renderScorecard, renderSweepArtifact } from "../src/scorecard";
import { createReckon, liveJudge, recordedJudge, SPEND_CAP_CENTS } from "../src/run";
import type { ClassScores } from "../src/policy";

const replay = process.argv.includes("--replay");
const runsDir = fileURLToPath(new URL("../runs/", import.meta.url));
mkdirSync(runsDir, { recursive: true });

const fixtures = loadFixtures();
const today = new Date().toISOString().slice(0, 10);

type Recorded = Judgment & { elapsedMs: number };

/**
 * One artifact at a stable path, carrying its own run date.
 *
 * A dated filename would force the sandbox to import a moving target, and a copy at a fixed
 * path beside it would be a second source of truth for the same numbers. The scorecard is what
 * carries the date in its title; this file carries it in a field.
 */
const RUN_PATH = `${runsDir}run.json`;
const runArtifact = "runs/run.json";

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
    console.error("Set RECKON_TYPESAFE_API_KEY or TYPESAFE_API_KEY in reckon/.env.local, or run with --replay.");
    process.exit(1);
  }

  const counter = new InMemorySpendCounter();
  const reckon = createReckon({ fixtures, judge: liveJudge(counter, SPEND_CAP_CENTS) });
  judgments = {};

  console.log(`judging ${fixtures.replies.length} replies…`);
  for (const reply of fixtures.replies) {
    const { judgment, elapsedMs, plan } = await reckon.run(reply);
    judgments[reply.id] = { ...judgment, elapsedMs };
    const mark = plan.primary === reply.label ? " " : "x";
    console.log(`  ${mark} ${reply.id}  want ${reply.label.padEnd(15)} got ${(plan.primary ?? "-").padEnd(15)} ${elapsedMs.toFixed(0)}ms`);
  }

  runDate = today;
  writeFileSync(RUN_PATH, `${JSON.stringify({ date: today, judgments }, null, 2)}\n`);
  console.log(`\nspent ${(await counter.spentCents()).toFixed(3)}¢ of a ${SPEND_CAP_CENTS}¢ cap`);
}

const scoresById = Object.fromEntries(
  Object.entries(judgments).map(([id, j]) => [id, j.scores as ClassScores]));

// The sweep only ever sees the ordinary subset; `sweep()` filters `hard` out itself.
const points = sweep(fixtures.replies, scoresById, DEFAULT_THRESHOLDS);
const chosen = bestPoint(points);
const thresholds = chosen
  ? thresholdsAt(chosen.base, chosen.risky, chosen.review, DEFAULT_THRESHOLDS)
  : DEFAULT_THRESHOLDS;

const sweepArtifact = "runs/sweep.json";
writeFileSync(`${runsDir}sweep.json`, renderSweepArtifact(points, chosen));

const figures = scoreRun(fixtures.replies, scoresById, thresholds);
const meta = runMeta(Object.values(judgments));

writeFileSync(
  fileURLToPath(new URL("../SCORECARD.md", import.meta.url)),
  renderScorecard({
    date: runDate, thresholds, figures, meta, sweep: points, chosen,
    replies: fixtures.replies, runArtifact, sweepArtifact,
  }));

console.log(`\nswept ${points.length} threshold combinations on the ordinary 51`);
if (chosen) console.log(`chosen: base ${chosen.base}, risky ${chosen.risky}, review ${chosen.review}`);
console.log(`\nordinary  ${figures.ordinary.n - figures.ordinary.errors}/${figures.ordinary.n} primary correct, ${figures.ordinary.escalated} reached a person`);
console.log(`hard      ${figures.hard.n - figures.hard.errors}/${figures.hard.n} primary correct, ${figures.hard.escalated} reached a person`);
console.log(`multi     ${figures.multiLabel.bothAsserted}/${figures.multiLabel.n} had both classes asserted`);
console.log(`\nwrote SCORECARD.md, ${runArtifact}, ${sweepArtifact}`);
