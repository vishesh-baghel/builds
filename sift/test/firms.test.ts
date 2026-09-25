import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import served from "../runs/served.json" with { type: "json" };
import { INBOX_AS_OF } from "../src/clock";
import { firmById } from "../src/fixtures";
import { checkFloors } from "../src/fixtures/floors";
import { toMessage } from "../src/fixtures/instrument";
import { instrumentFirmIds, loadInstrument, MEASURED_FIRM_ID } from "../src/fixtures/load";
import { judgmentFromScores, type Judgment } from "../src/jev";
import { DECLARED_THRESHOLDS, DEFAULT_THRESHOLDS } from "../src/policy";
import { bestPoint, sweep } from "../src/score";
import { servedEntry } from "../src/scorecard";
import { factsFor } from "../src/stages/extract";
import { RULES } from "../src/trades";
import { assess } from "../src/triage";

/**
 * Every firm's instrument holds to the same bar Meridian's does: the floors, deadlines code can
 * reproduce, labels the firm's own rules agree with, and rules that cover every class. Meridian's own
 * copies of these checks live in `instrument.test.ts`; this runs them for everyone else.
 */
// `SIFT_FIRM=law` narrows the run to one firm while its instrument is being written.
const only = process.env["SIFT_FIRM"];
const others = instrumentFirmIds().filter((id) => id !== MEASURED_FIRM_ID && (!only || id === only));

describe.each(others)("the %s instrument", (id) => {
  const firm = firmById(id);
  const classes = firm.classes.map((c) => c[0]);
  const rules = RULES[id]!;
  const instrument = loadInstrument(id);
  const staff = new Set(firm.people.map((p) => p.name));

  it("has rules for every class, with criteria, and fixed routes only to real staff", () => {
    expect(Object.keys(rules.topics).sort()).toEqual([...classes].sort());
    for (const [topic, rule] of Object.entries(rules.topics)) {
      expect(rule.criteria.true.length, topic).toBeGreaterThan(20);
      expect(rule.criteria.false.length, topic).toBeGreaterThan(20);
      if (rule.owner.to === "person") expect(staff.has(rule.owner.name), `${topic} -> ${rule.owner.name}`).toBe(true);
    }
    for (const p of instrument.projects) for (const who of [p.coordinator, p.lead, p.reviewer]) expect(staff.has(who), `${p.code}: ${who}`).toBe(true);
  });

  it("is about ninety messages, meets both floors, and is roughly a third hard", () => {
    expect(instrument.inbox.length).toBeGreaterThanOrEqual(85);
    expect(checkFloors(instrument.inbox, classes, DECLARED_THRESHOLDS)).toEqual([]);
    const hard = instrument.inbox.filter((m) => m.hard).length / instrument.inbox.length;
    expect(hard).toBeGreaterThan(0.2);
    expect(hard).toBeLessThan(0.4);
  });

  it("re-derives the committed deadline in code on every clocked row", () => {
    for (const m of instrument.inbox.filter((x) => x.clocked)) {
      expect(factsFor(toMessage(m), instrument).deadline?.date ?? null, m.id).toBe(m.deadline);
    }
  });

  /**
   * Under a perfect judgment the code must land every ordinary message where its labels say, and
   * only the hard cases recorded as known gaps may disagree.
   */
  const disagreements = instrument.inbox.filter((m) => {
    const scores = Object.fromEntries(classes.map((c) => [c, m.topics.includes(c) ? 0.95 : 0.05]));
    const message = toMessage(m);
    const plan = assess(firm, message, judgmentFromScores(scores, m.clocked ? 0.9 : 0.05), factsFor(message, instrument), instrument, DEFAULT_THRESHOLDS, INBOX_AS_OF);
    return [...plan.people].sort().join("|") !== m.route.join("|") || plan.priority !== m.priority || plan.clockFlagged !== m.clocked;
  });
  it("agrees with its rules on every ordinary message", () => expect(disagreements.filter((m) => !m.hard).map((m) => m.id)).toEqual([]));
  it("disagrees only on the hard cases recorded as known gaps", () => expect(disagreements.map((m) => m.id)).toEqual([...rules.knownGaps]));

  const runPath = new URL(`../runs/${id}/run.json`, import.meta.url);
  it.runIf(existsSync(runPath))("serves exactly its committed run at the lines its sweep chose", () => {
    const run = JSON.parse(readFileSync(runPath, "utf8")) as { date: string; judgments: Record<string, Judgment> };
    const chosen = bestPoint(sweep(instrument.inbox, run.judgments, firm, instrument, DECLARED_THRESHOLDS))!;
    const lines = { act: chosen.act, review: chosen.review, clockAct: chosen.clockAct };
    expect((served as Record<string, unknown>)[id]).toEqual(JSON.parse(JSON.stringify(servedEntry(run.date, run.judgments, lines))));
  });
});

describe("runs/served.json", () => {
  it("serves only firms with a committed run of their own", () => {
    for (const id of Object.keys(served)) expect(existsSync(new URL(`../runs/${id}/run.json`, import.meta.url)), id).toBe(true);
  });
});
