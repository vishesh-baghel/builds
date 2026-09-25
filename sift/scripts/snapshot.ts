/**
 * Regenerates `fixtures/fixtures.json` from the authored CSVs and JSONL, every firm's instrument keyed
 * by firm id.
 *
 * The snapshot exists because the app runs in a bundler and a serverless function, neither of which
 * should read authored files. It is generated, never hand-edited, and `snapshot.test.ts` fails the
 * gate if it stops matching its sources.
 *
 *   pnpm --filter @builds/sift snapshot
 */
import { writeFileSync } from "node:fs";
import { loadInstruments } from "../src/fixtures/load";

const instruments = loadInstruments();
writeFileSync(new URL("../fixtures/fixtures.json", import.meta.url), `${JSON.stringify(instruments, null, 2)}\n`);
for (const [id, i] of Object.entries(instruments)) {
  console.log(`${id}: ${i.projects.length} projects, ${i.logs.length} log rows, ${i.contacts.length} contacts, ${i.inbox.length} messages`);
}
