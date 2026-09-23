import { describe, expect, it } from "vitest";
import {
  InMemoryAuditLog, InMemoryIdempotencyStore, PipelineInvariantError, runPipeline,
  type ActionResult, type Classified, type Decision, type Escalation, type Extracted, type Pipeline, type RawInput,
} from "@builds/shared";
import { firmById, messageById } from "../src/fixtures";
import { judgmentFromScores } from "../src/jev";
import { SiftPipeline } from "../src/pipeline";
import { SiftStore } from "../src/store";
import { asInput, runOne } from "./helpers";

const arch = firmById("arch");
const msg = (id: string) => {
  const m = messageById(arch, id);
  if (!m) throw new Error(`no fixture ${id}`);
  return m;
};

describe("routing and reasons (AC #3)", () => {
  it("assigns a route, a priority, a deadline and a non-empty reason", async () => {
    const { store, pipeline } = await runOne(arch, msg("a2"), { rfi: 0.92 }, 0.62);
    const record = store.forMessage("a2").find((r) => r.kind === "route");
    expect(record?.topic).toBe("rfi");
    expect(record?.who).toBeTruthy();
    expect(record?.detail["priority"]).toBeTruthy();
    expect(String(record?.detail["why"]).length).toBeGreaterThan(0);
    expect(pipeline.planFor("a2")?.reason.length).toBeGreaterThan(0);
  });
});

describe("two topics, two outcomes, not collapsed (AC #8)", () => {
  it("fans a two-topic message out to two distinct topic-qualified actions and two records", async () => {
    const { outcome, store } = await runOne(arch, msg("a1"), { client_status: 0.88, rfi: 0.74 }, 0.1);
    const routes = store.forMessage("a1").filter((r) => r.kind === "route");
    expect(routes.map((r) => r.topic).sort()).toEqual(["client_status", "rfi"]);
    const ids = new Set(routes.map((r) => r.id));
    expect(ids.size).toBe(2); // two distinct idempotency keys, never one collapsed act
    expect(outcome.results.filter((r) => r.action.startsWith("route:")).length).toBe(2);
  });
});

describe("the escalation band (AC #7)", () => {
  it("escalates the whole message when nothing clears the act line, acting on nothing", async () => {
    const { outcome, store } = await runOne(arch, msg("a9"), { agency_letter: 0.5 }, 0.1);
    expect(outcome.results.length).toBe(0);
    expect(outcome.escalation).toBeDefined();
    expect(store.forMessage("a9").length).toBe(0);
  });
});

describe("vendor pitch is labelled, not routed, not escalated (AC #10)", () => {
  it("labels noise, routes it to no one and does not escalate", async () => {
    const { outcome, store } = await runOne(arch, msg("a7"), { vendor_pitch: 0.87 }, 0.06);
    const records = store.forMessage("a7");
    expect(records.every((r) => r.kind === "label")).toBe(true);
    expect(records.every((r) => r.who === null)).toBe(true);
    expect(store.routedTo("Priya Nair").filter((r) => r.messageId === "a7").length).toBe(0);
    expect(outcome.escalation).toBeUndefined();
  });
});

describe("idempotency: a second run is a no-op (AC #11)", () => {
  it("records one action per topic across two runs and skips the second", async () => {
    const store = new SiftStore();
    const idempotency = new InMemoryIdempotencyStore();
    const pipeline = new SiftPipeline({ firm: arch, judge: async () => judgmentFromScores({ client_status: 0.88, rfi: 0.74 }, 0.1), store, idempotency });
    const input = asInput(msg("a1"));

    const first = await runPipeline(pipeline, input);
    const second = await runPipeline(pipeline, input);

    expect(first.results.every((r) => r.status === "done")).toBe(true);
    expect(second.results.every((r) => r.status === "skipped")).toBe(true);
    expect(store.forMessage("a1").filter((r) => r.kind === "route").length).toBe(2);
  });
});

describe("the audit log (AC #13)", () => {
  it("writes one row per stage that ran and one per action acted", async () => {
    const { audit } = await runOne(arch, msg("a1"), { client_status: 0.88, rfi: 0.74 }, 0.1);
    const stages = (await audit.list("a1")).map((e) => e.stage);
    expect(stages).toContain("extract");
    expect(stages).toContain("classify");
    expect(stages).toContain("decide");
    expect(stages.filter((s) => s === "act").length).toBe(2); // one per topic
    expect(stages).toContain("log");
  });
});

describe("the runPipeline invariant (AC #15)", () => {
  it("throws when an act reports work other than what it was scheduled to do", async () => {
    const broken: Pipeline<unknown, Record<string, never>, string, string> = {
      extract: async (input: RawInput<unknown>): Promise<Extracted<Record<string, never>>> => ({ inputId: input.id, fields: {}, confidence: 1 }),
      classify: async (e): Promise<Classified<string>> => ({ inputId: e.inputId, probabilities: [], asserted: ["x"], primary: "x" }),
      decide: async (c): Promise<Decision<string>> => ({ inputId: c.inputId, actions: ["route:x"], escalate: false, reason: "r" }),
      act: async (d): Promise<ActionResult> => ({ inputId: d.inputId, action: "route:WRONG", status: "done" }),
      escalate: async (d): Promise<Escalation> => ({ inputId: d.inputId, reason: "r", context: {} }),
    };
    const input: RawInput<unknown> = { id: "z", source: "test", receivedAt: new Date("2026-09-21"), payload: {} };
    await expect(runPipeline(broken, input, new InMemoryAuditLog())).rejects.toBeInstanceOf(PipelineInvariantError);
  });
});
