import { describe, expect, it, vi } from "vitest";
import type { TypeSafeClient } from "@typesafe-ai/sdk";
import { InMemorySpendCounter, SpendCap, SpendCapExceededError } from "@builds/shared";
import { CLOCK_QUESTION, questionsFor, stateFor } from "../src/questions";
import { estimateCents, judge, JudgmentError, readJudgment } from "../src/jev";
import { firmById } from "../src/fixtures";

const arch = firmById("arch");
const classes = arch.classes.map((c) => c[0]);

/** A stand-in for the SDK client. Only `systemOne` is called; the APIPromise extras are unused. */
type Client = Pick<TypeSafeClient, "systemOne">;
const asClient = (systemOne: () => Promise<unknown>): Client => ({ systemOne } as unknown as Client);

const noul = (n: number) => ({ type: "noul" as const, noul: n });
const recorded = (over: Record<string, number> = {}) => ({
  model: "jev-1.13",
  usage: { input_tokens: 900, output_tokens: 0 },
  answers: Object.fromEntries([
    ...classes.map((c) => [c, noul(over[c] ?? 0.1)]),
    [CLOCK_QUESTION, noul(over[CLOCK_QUESTION] ?? 0.2)],
  ]),
});

describe("the single Jev request (AC #2)", () => {
  it("asks one Noul per topic class plus the carries_clock Noul, and nothing else", () => {
    const q = questionsFor(arch);
    expect(Object.keys(q).sort()).toEqual([...classes, CLOCK_QUESTION].sort());
    for (const key of Object.keys(q)) expect(q[key]?.type).toBe("noul");
  });

  it("reads a recorded vendor response by shape, not by counting", () => {
    const j = readJudgment("a2", classes, recorded({ rfi: 0.92, [CLOCK_QUESTION]: 0.62 }) as never);
    expect(j.scores["rfi"]).toBe(0.92);
    expect(j.clock).toBe(0.62);
    expect(Object.keys(j.scores).sort()).toEqual([...classes].sort());
  });

  it("rejects a malformed envelope rather than trusting a partial result", () => {
    const bad = { model: "x", usage: { input_tokens: 1, output_tokens: 0 }, answers: {} };
    expect(() => readJudgment("a2", classes, bad as never)).toThrow(JudgmentError);
  });
});

describe("every vendor call is retried, and failure never reads as success (AC #12)", () => {
  it("retries a transient error the configured number of times, then surfaces it", async () => {
    let calls = 0;
    const client = asClient(async () => { calls++; const e = new Error("boom") as Error & { status: number }; e.status = 500; throw e; });
    const counter = new InMemorySpendCounter();
    await expect(judge("m1", arch, stateFor(arch, { subject: "s", body: "b" }), { client, cap: new SpendCap(counter, 10_000), counter, sleep: async () => {} })).rejects.toThrow("boom");
    expect(calls).toBe(4);
  });

  it("does not retry a malformed envelope: that is unfixable by trying again", async () => {
    let calls = 0;
    const client = asClient(async () => { calls++; return { model: "x", usage: { input_tokens: 1, output_tokens: 0 }, answers: {} }; });
    const counter = new InMemorySpendCounter();
    await expect(judge("m1", arch, stateFor(arch, { subject: "s", body: "b" }), { client, cap: new SpendCap(counter, 10_000), counter, sleep: async () => {} })).rejects.toBeInstanceOf(JudgmentError);
    expect(calls).toBe(1);
  });
});

describe("SpendCap refuses before spending (AC #30)", () => {
  it("throws and never calls the vendor when the estimate would cross the ceiling", async () => {
    const counter = new InMemorySpendCounter();
    const spy = vi.fn(async () => ({ model: "x", usage: { input_tokens: 1, output_tokens: 0 }, answers: {} }));
    const client = asClient(spy);
    const state = stateFor(arch, { subject: "s", body: "b" });
    const cap = new SpendCap(counter, estimateCents(state) / 2);
    await expect(judge("m1", arch, state, { client, cap, counter })).rejects.toBeInstanceOf(SpendCapExceededError);
    expect(spy).toHaveBeenCalledTimes(0);
  });
});
