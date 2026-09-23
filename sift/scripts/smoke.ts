/**
 * One live call, recorded. Judges a single committed message and writes the raw vendor response to
 * `test/fixtures/recorded-response.json`, so the classify test can assert the one-request shape
 * against what the vendor actually returned (AC #2). Capped and retried like every vendor call.
 *
 *   pnpm --filter @builds/sift smoke
 *
 * Outside the CI gate: it needs a key.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { InMemorySpendCounter, SpendCap, withRetry } from "@builds/shared";
import { hasTypesafeKey } from "../src/env";
import { firmById } from "../src/fixtures";
import { toMessage } from "../src/fixtures/instrument";
import { loadInstrument, MEASURED_FIRM_ID } from "../src/fixtures/load";
import { estimateCents, jevClient, MODEL, readJudgment } from "../src/jev";
import { questionsFor, stateFor } from "../src/questions";

if (!hasTypesafeKey()) {
  console.error("No TypeSafe key found. Set SIFT_TYPESAFE_API_KEY or TYPESAFE_API_KEY in sift/.env.local.");
  process.exit(1);
}

const firm = firmById(MEASURED_FIRM_ID);
const message = loadInstrument().inbox.find((m) => m.id === "m001");
if (!message) throw new Error("m001 is missing from the instrument");

const state = stateFor(firm, toMessage(message));
const questions = questionsFor(firm);
const counter = new InMemorySpendCounter();
const cap = new SpendCap(counter, 50);
const client = jevClient();

const result = await cap.guard(estimateCents(state), () => withRetry(() => client.systemOne({ model: MODEL, state, questions })));
const judgment = readJudgment(message.id, firm.classes.map((c) => c[0]), result);

const dir = new URL("../test/fixtures/", import.meta.url);
mkdirSync(dir, { recursive: true });
writeFileSync(new URL("recorded-response.json", dir), `${JSON.stringify({ messageId: message.id, model: result.model, usage: result.usage, answers: result.answers }, null, 2)}\n`);
console.log(`recorded ${Object.keys(result.answers).length} answers for ${message.id}; clock ${judgment.clock.toFixed(2)}; ${judgment.costCents.toFixed(4)} cents`);
