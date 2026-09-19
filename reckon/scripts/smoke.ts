/**
 * One live call per named reply, recorded to `fixtures/recorded-answers.json`.
 *
 * This exists so the classify test can assert the request shape and the answer envelope
 * against something the vendor actually returned, rather than against a hand-written mock that
 * agrees with the parser by construction. Run it when the question set changes.
 *
 *   pnpm --filter @builds/reckon smoke
 */
import { writeFileSync } from "node:fs";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import { loadFixtures } from "../src/fixtures/load";
import { MODEL, costCents } from "../src/jev";
import { QUESTIONS } from "../src/questions";

const RECORD = ["r043", "r011", "r072"];

const fixtures = loadFixtures();
const client = new TypeSafeClient({ defaultModel: MODEL });
const recorded: Record<string, unknown> = {};
let cents = 0;

for (const id of RECORD) {
  const reply = fixtures.replies.find((r) => r.id === id);
  if (!reply) throw new Error(`no fixture ${id}`);
  const invoice = fixtures.byInvoice.get(reply.invoice);
  if (!invoice) throw new Error(`no invoice for ${id}`);

  const state = {
    invoice: {
      number: invoice.invoiceNo, customer: invoice.customer, amount: invoice.amount,
      open_balance: invoice.openBalance, days_past_due: invoice.daysPastDue, terms: invoice.terms,
    },
    reply: { subject: reply.subject, body: reply.body },
  };

  const result = await client.systemOne({ model: MODEL, state, questions: QUESTIONS });
  cents += costCents(result.usage);
  recorded[id] = { model: result.model, answers: result.answers, usage: result.usage };

  const scores = Object.entries(result.answers)
    .filter(([, a]) => (a as { type: string }).type === "noul")
    .map(([k, a]) => `${k} ${(a as { noul: number }).noul.toFixed(2)}`);
  console.log(`${id}  ${reply.label}${reply.also.length ? ` + ${reply.also.join(",")}` : ""}`);
  console.log(`      ${scores.join("  ")}`);
  console.log(`      ${result.usage.input_tokens} in / ${result.usage.output_tokens} out`);
}

writeFileSync(
  new URL("../fixtures/recorded-answers.json", import.meta.url),
  `${JSON.stringify(recorded, null, 2)}\n`,
);
console.log(`\nrecorded ${RECORD.length} replies, ${cents.toFixed(4)} cents`);
