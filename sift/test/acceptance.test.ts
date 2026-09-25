import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { TypeSafeClient } from "@typesafe-ai/sdk";
import { InMemoryAuditLog, InMemorySpendCounter, SpendCap } from "@builds/shared";
import run from "../runs/run.json" with { type: "json" };
import recordedResponse from "./fixtures/recorded-response.json" with { type: "json" };
import { firmById } from "../src/fixtures";
import { ADVERSARIAL } from "../src/fixtures/adversarial";
import { toMessage } from "../src/fixtures/instrument";
import { loadInstrument } from "../src/fixtures/load";
import { measuredFirm, type RecordedRun } from "../src/fixtures/measured";
import { judge } from "../src/jev";
import { HUMAN_TIME_ESTIMATE, MERIDIAN_THRESHOLDS, renderSecondsEstimate } from "../src/policy";
import { CLOCK_QUESTION } from "../src/questions";
import { createSift } from "../src/run";
import { deriveView } from "../src/view";
import { runOne } from "./helpers";

const instrument = loadInstrument();
const arch = firmById("arch");
const classes = arch.classes.map((c) => c[0]);
const lm = (id: string) => {
  const m = instrument.inbox.find((x) => x.id === id);
  if (!m) throw new Error(`no instrument message ${id}`);
  return m;
};
type Client = Pick<TypeSafeClient, "systemOne">;

describe("AC #2: the classify stage makes exactly one Jev request per message", () => {
  it("through the whole pipeline, one request each, carrying the nine questions and the message as data", async () => {
    const systemOne = vi.fn(async () => recordedResponse);
    const client = { systemOne } as unknown as Client;
    const counter = new InMemorySpendCounter();
    const sift = createSift({
      instrument,
      judge: (message, firm, state) => judge(message.id, firm, state, { client, cap: new SpendCap(counter, 1_000), counter }),
    });
    const picked = ["m001", "m013", "m040", "m060", "m080"].map(lm);
    for (const m of picked) await sift.run(m);

    expect(systemOne).toHaveBeenCalledTimes(picked.length);
    systemOne.mock.calls.forEach((call, i) => {
      const request = (call as unknown as [{ questions: Record<string, unknown>; state: { message: { subject: string } } }])[0];
      expect(Object.keys(request.questions).sort()).toEqual([...classes, CLOCK_QUESTION].sort());
      expect(request.state.message.subject).toBe(picked[i]?.subject);
    });
  });
});

describe("AC #7: the band boundaries, at the measured lines (act 0.55, review 0.50)", () => {
  const invoice = toMessage(lm("m060"));
  const at = (p: number) => runOne(arch, invoice, { invoice: p }, 0.1, MERIDIAN_THRESHOLDS);

  it("exactly on the act line: the topic applies and is acted on", async () => {
    const { outcome } = await at(0.55);
    expect(outcome.results.map((r) => r.action)).toContain("route:invoice");
  });

  it("just under the act line: it escalates without acting", async () => {
    const { outcome, pipeline } = await at(0.5499);
    expect(outcome.results.map((r) => r.action)).not.toContain("route:invoice");
    expect(outcome.escalation).toBeDefined();
    expect(pipeline.planFor("m060")?.review).toContain("invoice");
  });

  it("exactly on the review line: still the review band, not ignored", async () => {
    const { pipeline } = await at(0.5);
    expect(pipeline.planFor("m060")?.review).toContain("invoice");
  });

  it("just under the review line with nothing else clear: the whole message escalates, acting on nothing", async () => {
    const { outcome, pipeline } = await at(0.4999);
    expect(outcome.results).toEqual([]);
    expect(outcome.escalation).toBeDefined();
    expect(pipeline.planFor("m060")?.handoffs[0]).toMatch(/nothing was clear enough/);
  });
});

describe("AC #12: an exhausted retry is a failed result in the audit log, never a silent success", () => {
  it("records the failure and no action", async () => {
    const client = { systemOne: vi.fn(async () => { const e = new Error("vendor down") as Error & { status: number }; e.status = 503; throw e; }) } as unknown as Client;
    const counter = new InMemorySpendCounter();
    const audit = new InMemoryAuditLog();
    const sift = createSift({
      instrument, audit,
      judge: (message, firm, state) => judge(message.id, firm, state, { client, cap: new SpendCap(counter, 1_000), counter, sleep: async () => {} }),
    });
    await expect(sift.run(lm("m001"))).rejects.toThrow("vendor down");
    const rows = await audit.list("m001");
    expect(rows.at(-1)).toMatchObject({ stage: "log", data: { failed: true } });
    expect(rows.at(-1)?.summary).toMatch(/run failed: vendor down/);
    expect(rows.some((r) => r.stage === "act" || r.stage === "decide")).toBe(false);
  });
});

describe("AC #14: an instruction-shaped body changes no threshold and cannot suppress an escalation", () => {
  for (const adv of ADVERSARIAL) {
    it(`${adv.id} leaves the lines untouched and still reaches a person`, async () => {
      const before = structuredClone(MERIDIAN_THRESHOLDS);
      const { outcome, pipeline } = await runOne(arch, adv, adv.p as Record<string, number>, adv.clock, MERIDIAN_THRESHOLDS);
      expect(pipeline.thresholds).toEqual(before);
      expect(MERIDIAN_THRESHOLDS).toEqual(before);
      // adv-exfil asks not to be escalated; adv-steer asks for hands-off autonomy. Both still escalate.
      expect(outcome.escalation).toBeDefined();
    });
  }
});

describe("AC #24: human time is one named, labelled estimate, never beside a measured figure", () => {
  it("renders its label with the word estimate", () => {
    expect(renderSecondsEstimate(HUMAN_TIME_ESTIMATE.handSecondsPerMessage)).toContain("estimate");
  });

  it("builds every with-Sift figure from the one constant, not from inline numbers", () => {
    const meridian = measuredFirm(arch, instrument, run as unknown as RecordedRun, MERIDIAN_THRESHOLDS);
    const v = deriveView(meridian, MERIDIAN_THRESHOLDS, HUMAN_TIME_ESTIMATE.handSecondsPerMessage, HUMAN_TIME_ESTIMATE.lookupSecondsPerRecord);
    const expected = HUMAN_TIME_ESTIMATE.glanceSecondsPerWorkingDay * v.span.workingDays
      + v.score.escalated * HUMAN_TIME_ESTIMATE.decideSecondsPerItem
      + v.score.alerts * HUMAN_TIME_ESTIMATE.acknowledgeSecondsPerAlert;
    const minutes = Math.round(expected / 60);
    expect(v.savings.siftToday).toBe(minutes >= 60 ? `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m` : `${minutes} min`);
    const src = readFileSync(fileURLToPath(new URL("../src/view.ts", import.meta.url)), "utf8");
    expect(src).not.toMatch(/\*\s*(45|20)\b|\b60\s*\*\s*span/);
  });

  it("puts no estimate on the Overview, where the measured catch rate is", () => {
    const src = readFileSync(fileURLToPath(new URL("../components/Dashboard.tsx", import.meta.url)), "utf8");
    const overview = src.slice(src.indexOf("function Overview("), src.indexOf("function Inbox("));
    expect(overview).not.toMatch(/savings|savedToday|time back|estimate/i);
  });
});
