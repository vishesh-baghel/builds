import { describe, expect, it } from "vitest";
import {
  InMemoryAuditLog,
  PipelineInvariantError,
  runPipeline,
  type ActionResult,
  type Classified,
  type Decision,
  type Escalation,
  type Extracted,
  type Pipeline,
  type RawInput,
} from "@builds/shared";

/**
 * The spine's own contract, exercised from the build that forced it to change.
 *
 * These live here rather than in `shared` so the repo has exactly one `test` script, the
 * first one it has ever had, and so the invariant is tested by a real consumer rather than
 * in isolation.
 */

type Label = "alpha" | "beta";
type Action = "one" | "two";

interface Spy {
  readonly pipeline: Pipeline<string, { text: string }, Label, Action>;
  readonly actedWith: Action[];
  readonly escalated: Decision<Action>[];
}

function spyPipeline(decision: Omit<Decision<Action>, "inputId">, overrides: {
  act?: (decision: Decision<Action>, action: Action) => Promise<ActionResult>;
} = {}): Spy {
  const actedWith: Action[] = [];
  const escalated: Decision<Action>[] = [];

  const pipeline: Pipeline<string, { text: string }, Label, Action> = {
    async extract(input: RawInput<string>): Promise<Extracted<{ text: string }>> {
      return { inputId: input.id, fields: { text: input.payload }, confidence: 1 };
    },
    async classify(extracted): Promise<Classified<Label>> {
      return {
        inputId: extracted.inputId,
        probabilities: [
          { label: "alpha", probability: 0.9 },
          { label: "beta", probability: 0.2 },
        ],
        asserted: ["alpha"],
        primary: "alpha",
      };
    },
    async decide(classified): Promise<Decision<Action>> {
      return { inputId: classified.inputId, ...decision };
    },
    async act(d, action): Promise<ActionResult> {
      actedWith.push(action);
      if (overrides.act) return overrides.act(d, action);
      return { inputId: d.inputId, action, status: "done" };
    },
    async escalate(d): Promise<Escalation> {
      escalated.push(d);
      return { inputId: d.inputId, reason: d.reason, context: {} };
    },
  };

  return { pipeline, actedWith, escalated };
}

const input: RawInput<string> = {
  id: "i1",
  source: "test",
  receivedAt: new Date("2026-10-11T00:00:00Z"),
  payload: "hello",
};

describe("runPipeline invariant, AC #20", () => {
  it("never calls act when the decision lists no actions", async () => {
    const spy = spyPipeline({ actions: [], escalate: true, reason: "nothing cleared" });
    const outcome = await runPipeline(spy.pipeline, input);

    expect(spy.actedWith).toEqual([]);
    expect(outcome.results).toEqual([]);
    expect(outcome.escalation?.reason).toBe("nothing cleared");
  });

  it("calls act only with actions the decision listed, once per distinct action", async () => {
    const spy = spyPipeline({ actions: ["one", "two", "one"], escalate: false, reason: "both" });
    const outcome = await runPipeline(spy.pipeline, input);

    expect(spy.actedWith).toEqual(["one", "two"]);
    expect(outcome.results.map((r) => r.action)).toEqual(["one", "two"]);
    expect(spy.escalated).toEqual([]);
  });

  it("throws when act reports work other than what it was scheduled for", async () => {
    const spy = spyPipeline(
      { actions: ["one"], escalate: false, reason: "one" },
      { act: async (d) => ({ inputId: d.inputId, action: "two", status: "done" }) });
    await expect(runPipeline(spy.pipeline, input)).rejects.toThrow(PipelineInvariantError);
  });
});

describe("runPipeline outcome, acting and escalating are not exclusive", () => {
  it("returns both results and the escalation in one run", async () => {
    const spy = spyPipeline({ actions: ["one"], escalate: true, reason: "acted and handed over" });
    const outcome = await runPipeline(spy.pipeline, input);

    expect(outcome.results).toHaveLength(1);
    expect(outcome.results[0]?.action).toBe("one");
    expect(outcome.escalation).toBeDefined();
    expect(spy.escalated).toHaveLength(1);
  });

  it("omits the escalation when the decision does not ask for one", async () => {
    const spy = spyPipeline({ actions: ["one"], escalate: false, reason: "clean" });
    const outcome = await runPipeline(spy.pipeline, input);
    expect(outcome.escalation).toBeUndefined();
  });
});

describe("runPipeline writes the audit trail it documents", () => {
  it("records one row per stage that ran, including log", async () => {
    const audit = new InMemoryAuditLog();
    const spy = spyPipeline({ actions: ["one", "two"], escalate: true, reason: "because" });
    await runPipeline(spy.pipeline, input, audit);

    const stages = (await audit.list("i1")).map((entry) => entry.stage);
    expect(stages).toEqual(["extract", "classify", "decide", "act", "act", "escalate", "log"]);
  });

  it("carries the per-class probabilities on the classify row", async () => {
    const audit = new InMemoryAuditLog();
    const spy = spyPipeline({ actions: [], escalate: false, reason: "noop" });
    await runPipeline(spy.pipeline, input, audit);

    const classify = (await audit.list("i1")).find((entry) => entry.stage === "classify");
    expect(classify?.data?.["probabilities"]).toEqual({ alpha: 0.9, beta: 0.2 });
    expect(classify?.data?.["asserted"]).toEqual(["alpha"]);
  });

  it("runs without an audit log at all", async () => {
    const spy = spyPipeline({ actions: ["one"], escalate: false, reason: "quiet" });
    await expect(runPipeline(spy.pipeline, input)).resolves.toBeDefined();
  });
});
