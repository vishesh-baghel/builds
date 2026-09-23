/**
 * Regenerates `fixtures/fixtures.json` from the authored CSVs and JSONL.
 *
 * The snapshot exists because the app runs in a bundler and a serverless function, neither of which
 * should read authored files. It is generated, never hand-edited, and `snapshot.test.ts` fails the
 * gate if it stops matching its sources.
 *
 *   pnpm --filter @builds/sift snapshot
 */
import { writeFileSync } from "node:fs";
import { loadInstrument } from "../src/fixtures/load";

const instrument = loadInstrument();
writeFileSync(new URL("../fixtures/fixtures.json", import.meta.url), `${JSON.stringify(instrument, null, 2)}\n`);
console.log(`snapshot written: ${instrument.projects.length} projects, ${instrument.rfis.length} RFIs, ${instrument.submittals.length} submittals, ${instrument.contacts.length} contacts, ${instrument.inbox.length} messages`);
