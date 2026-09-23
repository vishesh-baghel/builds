import { describe, expect, it, vi } from "vitest";
import type { TypeSafeClient } from "@typesafe-ai/sdk";
import { SpendCap, SpendCapExceededError } from "@builds/shared";
import { classifyFixture, NOTICES, parseRequest, type ClassifyDeps, type ClassifyOk } from "../lib/classify";
import { servedMessage } from "../lib/firms";
import { estimateCents, judge } from "../src/jev";
import { stateFor } from "../src/questions";
import { memoryStore } from "../src/store/turso";

const fresh = { scores: { rfi: 0.99 }, clock: 0.42, model: "jev-test" };

const deps = (over: Partial<ClassifyDeps> = {}): ClassifyDeps => ({
  hasKey: true, store: memoryStore(), visitor: "v1", capCents: 2500, lookup: servedMessage,
  judge: vi.fn(async () => fresh), ...over,
});
const pick = { firmId: "arch", messageId: "m001" };
const ok = (r: Awaited<ReturnType<typeof classifyFixture>>): ClassifyOk => {
  if (r.status !== 200) throw new Error(`expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
  return r.body;
};

describe("the request names a committed message and nothing else (AC #29, #32)", () => {
  it("accepts exactly firmId and messageId", () => expect(parseRequest(pick)).toEqual(pick));
  for (const extra of ["text", "body", "to", "address", "subject"]) {
    it(`refuses a request that also carries ${extra}`, () => expect(parseRequest({ ...pick, [extra]: "x" })).toHaveProperty("error"));
  }
  it("refuses a message outside the committed inbox", async () => {
    expect((await classifyFixture({ firmId: "arch", messageId: "m999" }, deps())).status).toBe(400);
  });
  it("refuses ids that are not plain identifiers", async () => {
    expect((await classifyFixture({ firmId: "arch", messageId: "../etc" }, deps())).status).toBe(400);
  });
});

describe("a pick buys one live judgment (AC #33)", () => {
  it("calls the vendor exactly once and returns what it said", async () => {
    const d = deps();
    const body = ok(await classifyFixture(pick, d));
    expect(body.live).toBe(true);
    expect(body.judgment).toEqual(fresh);
    expect(body.notice).toBeNull();
    expect(d.judge).toHaveBeenCalledTimes(1);
  });
});

describe("every reason not to spend serves the recorded judgment, never an error", () => {
  const recorded = servedMessage("arch", "m001")!.message;

  it("with no vendor key", async () => {
    const d = deps({ hasKey: false });
    const body = ok(await classifyFixture(pick, d));
    expect(body).toMatchObject({ live: false, notice: NOTICES.noKey });
    expect(body.judgment.scores).toEqual(recorded.p);
    expect(d.judge).not.toHaveBeenCalled();
  });

  it("once a visitor has used their allowance (AC #37)", async () => {
    const d = deps({ store: memoryStore(Date.now, { visitor: 1, ceiling: 500 }) });
    expect(ok(await classifyFixture(pick, d)).live).toBe(true);
    expect(ok(await classifyFixture(pick, d))).toMatchObject({ live: false, notice: NOTICES.visitor });
    expect(ok(await classifyFixture(pick, { ...d, visitor: "v2" })).live).toBe(true); // another visitor is unaffected
  });

  it("at the deploy's rolling 24-hour ceiling, and again once the window rolls on (AC #36)", async () => {
    let now = Date.parse("2026-09-23T09:00:00Z");
    const store = memoryStore(() => now, { visitor: 100, ceiling: 2 });
    const d = deps({ store });
    expect(ok(await classifyFixture(pick, d)).live).toBe(true);
    expect(ok(await classifyFixture(pick, d)).live).toBe(true);
    expect(ok(await classifyFixture(pick, d))).toMatchObject({ live: false, notice: NOTICES.ceiling });
    expect(d.judge).toHaveBeenCalledTimes(2);
    now += 24 * 60 * 60 * 1000 + 1;
    expect(ok(await classifyFixture(pick, d)).live).toBe(true);
  });

  it("when the spend cap is exhausted (AC #35)", async () => {
    const body = ok(await classifyFixture(pick, deps({ judge: async () => { throw new SpendCapExceededError(2500); } })));
    expect(body).toMatchObject({ live: false, notice: NOTICES.cap });
  });

  it("when the vendor fails", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    const body = ok(await classifyFixture(pick, deps({ judge: async () => { throw new Error("503"); } })));
    expect(body).toMatchObject({ live: false, notice: NOTICES.vendor });
    quiet.mockRestore();
  });

  it("with the real cap: it refuses before spending and the vendor is never called", async () => {
    const store = memoryStore();
    const spy = vi.fn();
    const client = { systemOne: spy } as unknown as Pick<TypeSafeClient, "systemOne">;
    const d = deps({
      store,
      judge: async (message, firm) => {
        const state = stateFor(firm, message);
        const j = await judge(message.id, firm, state, { client, cap: new SpendCap(store.counter, estimateCents(state) / 2), counter: store.counter });
        return { scores: j.scores, clock: j.clock, model: j.model };
      },
    });
    expect(ok(await classifyFixture(pick, d))).toMatchObject({ live: false, notice: NOTICES.cap });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("the spend counter is visible on every response (AC #33)", () => {
  it("reports what has been spent and the cap", async () => {
    const store = memoryStore();
    await store.counter.add(0.0123);
    const body = ok(await classifyFixture(pick, deps({ store })));
    expect(body.spend).toEqual({ spentCents: 0.0123, capCents: 2500 });
  });
});
