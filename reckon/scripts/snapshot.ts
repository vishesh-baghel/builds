/**
 * Regenerates `fixtures/fixtures.json` from the authored CSV and JSONL.
 *
 * The snapshot exists because the sandbox runs in a bundler and a serverless function, neither
 * of which should be reading authored files. It is generated, never hand-edited, and
 * `snapshot.test.ts` fails the gate if it stops matching its sources.
 *
 *   pnpm --filter @builds/reckon snapshot
 */
import { writeFileSync } from "node:fs";
import { loadFixtures } from "../src/fixtures/load";

const fixtures = loadFixtures();
writeFileSync(
  new URL("../fixtures/fixtures.json", import.meta.url),
  `${JSON.stringify({ invoices: fixtures.invoices, replies: fixtures.replies }, null, 2)}\n`,
);
console.log(`snapshot written: ${fixtures.invoices.length} invoices, ${fixtures.replies.length} replies`);
