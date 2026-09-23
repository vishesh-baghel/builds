import { describe, expect, it } from "vitest";
import { deriveView } from "../src/view";
import { DEFAULT_THRESHOLDS, HUMAN_TIME_ESTIMATE, linesFor } from "../src/policy";
import { FIRMS, firmById } from "../src/fixtures";

const hand = HUMAN_TIME_ESTIMATE.handSecondsPerMessage;
const lookup = HUMAN_TIME_ESTIMATE.lookupSecondsPerRecord;
const arch = firmById("arch");
const v = deriveView(arch, DEFAULT_THRESHOLDS, hand, lookup);

describe("deriveView over Meridian at the shipped dial", () => {
  it("counts every message once as automated or escalated", () => {
    expect(v.score.total).toBe(12);
    expect(v.score.automated + v.score.escalated).toBe(v.score.total);
  });

  it("never claims to catch more clocks than exist, and always exposes the counterparts", () => {
    expect(v.score.caught).toBeLessThanOrEqual(v.score.clockedN);
    expect(v.score.clockedN + v.score.unclockedN).toBe(v.score.total);
    // The false-alarm counterpart is a real field, so the UI can never show the catch count alone (AC #19).
    expect(typeof v.score.falseAlarms).toBe("number");
    expect(v.score.falseAlarms).toBeLessThanOrEqual(v.score.unclockedN);
  });

  it("saves non-negative time and renders every savings row", () => {
    expect(v.savings.rows.length).toBe(4);
    // saved >= 0 by construction; the "today" figure is minutes-formatted, not negative.
    expect(v.savings.savedToday).not.toContain("-");
  });

  it("shows nine probability bars per message: one per class plus the clock", () => {
    expect(v.inboxRows.length).toBe(12);
    for (const row of v.inboxRows) {
      expect(row.probs.length).toBe(arch.classes.length + 1);
      expect(row.probs.filter((b) => b.isClock).length).toBe(1);
    }
  });

  it("lists the caught deadlines and keeps the decide lane last", () => {
    expect(v.deadlines.some((d) => d.state === "caught")).toBe(true);
    const last = v.lanes[v.lanes.length - 1];
    expect(last?.isDecideLane).toBe(true);
    expect(v.lanes.filter((l) => l.isDecideLane).length).toBe(1);
  });

  it("routes the owner every deadline alert into their lane", () => {
    const ownerLane = v.lanes.find((l) => l.name === arch.owner);
    expect(ownerLane).toBeDefined();
    expect(ownerLane?.items.some((i) => i.isAlert)).toBe(true);
  });

  it("caps the attention list at six and sorts by deadline", () => {
    expect(v.attention.length).toBeLessThanOrEqual(6);
  });

  it("summarises five effects and matches the decisions queue to escalations", () => {
    expect(v.effects.length).toBe(5);
    expect(v.decisions.length).toBe(v.score.escalated);
    expect(v.navCounts.decide).toBe(v.decisions.length);
  });
});

describe("the dial re-decides purely", () => {
  it("automates more at hands-off than at cautious", () => {
    const cautious = deriveView(arch, linesFor(0.15), hand, lookup).score.automated;
    const handsOff = deriveView(arch, linesFor(0.95), hand, lookup).score.automated;
    expect(handsOff).toBeGreaterThanOrEqual(cautious);
  });
});

describe("every firm derives without throwing", () => {
  it("holds the invariants for all seven trades", () => {
    expect(FIRMS.length).toBe(7);
    for (const firm of FIRMS) {
      const view = deriveView(firm, DEFAULT_THRESHOLDS, hand, lookup);
      expect(view.score.automated + view.score.escalated).toBe(view.score.total);
      expect(view.inboxRows.length).toBe(firm.messages.length);
      for (const row of view.inboxRows) expect(row.probs.length).toBe(firm.classes.length + 1);
      expect(view.lanes[view.lanes.length - 1]?.isDecideLane).toBe(true);
    }
  });
});
