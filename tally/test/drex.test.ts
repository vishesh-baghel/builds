import { describe, expect, it } from "vitest";
import { InMemorySpendCounter, SpendCap, SpendCapExceededError } from "@builds/shared";
import { judge, JudgmentError } from "../src/drex";
import { QUESTIONS } from "../src/questions";

const good = {
  model: "drex-latest", usage: { input_tokens: 2_000, output_tokens: 0 },
  answers: {
    verdict: { type: "choice", choice: "missed_billable", confidence: 0.8, probabilities: { invoiced: 0.1, missed_billable: 0.8, covered: 0.05, not_billable: 0.05 } },
    covered: { type: "noul", noul: 0.1 }, unsupported: { type: "noul", noul: 0.2 },
    evidence: { type: "score", score: 3.2, confidence: 0.7, legend: [], probabilities: {} },
  },
};
const state = { work_item: "x" } as never;
const deps = (systemOne: () => Promise<unknown>, cap = 1_000_000) => {
  const counter = new InMemorySpendCounter();
  return { client: { systemOne } as never, cap: new SpendCap(counter, cap), counter, sleep: async () => {} };
};

describe("judge", () => {
  it("asks all four questions in one request", async () => {
    let calls = 0;
    let asked: string[] = [];
    await judge("i", state, deps(async (req?: unknown) => { calls++; asked = Object.keys((req as { questions: object }).questions); return good; }) as never);
    expect(calls).toBe(1);
    expect(asked).toEqual(Object.keys(QUESTIONS));
  });

  it("retries a rate limit, then succeeds", async () => {
    let calls = 0;
    const j = await judge("i", state, deps(async () => { if (++calls < 3) throw Object.assign(new Error("429"), { status: 429 }); return good; }));
    expect(calls).toBe(3);
    expect(j.evidence).toBe(3.2);
  });

  it("rejects a malformed envelope without retrying", async () => {
    let calls = 0;
    const bad = { ...good, answers: { ...good.answers, unsupported: { type: "noul", noul: 1.7 } } };
    await expect(judge("i", state, deps(async () => { calls++; return bad; }))).rejects.toBeInstanceOf(JudgmentError);
    expect(calls).toBe(1);
  });

  it("refuses to spend past the token cap", async () => {
    await expect(judge("i", state, deps(async () => good, 10))).rejects.toBeInstanceOf(SpendCapExceededError);
  });
});
