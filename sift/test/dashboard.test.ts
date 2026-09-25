import { describe, expect, it } from "vitest";
import run from "../runs/run.json" with { type: "json" };
import { firmById } from "../src/fixtures";
import { loadInstrument } from "../src/fixtures/load";
import { measuredFirm, type RecordedRun } from "../src/fixtures/measured";
import type { Judgment } from "../src/jev";
import { HUMAN_TIME_ESTIMATE, linesFor, MERIDIAN_THRESHOLDS } from "../src/policy";
const HAND = HUMAN_TIME_ESTIMATE.handSecondsPerMessage;
const LOOKUP = HUMAN_TIME_ESTIMATE.lookupSecondsPerRecord;
import { scoreRun } from "../src/score";
import { deriveView } from "../src/view";

const instrument = loadInstrument();
const base = firmById("arch");
const recorded = run as unknown as RecordedRun & { judgments: Record<string, Judgment> };
const meridian = measuredFirm(base, instrument, recorded, MERIDIAN_THRESHOLDS);
const view = deriveView(meridian, MERIDIAN_THRESHOLDS, HAND, LOOKUP);
const scored = scoreRun(instrument.inbox, recorded.judgments, base, instrument, MERIDIAN_THRESHOLDS);

describe("the dashboard's Meridian is the measured instrument", () => {
  it("shows every instrument message, each with the judgment recorded for it", () => {
    expect(meridian.messages.length).toBe(instrument.inbox.length);
    for (const m of meridian.messages) {
      expect(m.p).toEqual(recorded.judgments[m.id]?.scores);
      expect(m.clock).toBe(recorded.judgments[m.id]?.clock);
    }
    expect(meridian.measured?.runDate).toBe(recorded.date);
  });

  it("carries no hand-written route into a decision", () => {
    for (const m of meridian.messages) expect(m.routes).toBeUndefined();
  });

  it("derives every deadline in code, and it equals the label on every clocked message", () => {
    for (const lm of instrument.inbox.filter((x) => x.clocked)) {
      expect(meridian.messages.find((m) => m.id === lm.id)?.deadline ?? null, lm.id).toBe(lm.deadline);
    }
  });
});

describe("at the measured setting the dashboard equals the published scorecard", () => {
  it("in the headline and its counterparts", () => {
    const h = scored.headline;
    expect(view.score.caught).toBe(h.caught.count);
    expect(view.score.clockedN).toBe(h.caught.n);
    expect(view.score.falseAlarms).toBe(h.falseAlarms.count);
    expect(view.score.unclockedN).toBe(h.falseAlarms.n);
    expect(view.score.automated).toBe(h.automated.count);
    expect(view.score.total).toBe(h.automated.n);
  });

  it("on every message's answer-key check", () => {
    for (const r of scored.results) {
      const row = view.inboxRows.find((x) => x.id === r.id);
      expect(row?.check, r.id).toMatchObject({ topics: r.topicsCorrect, route: r.routeCorrect, priority: r.priorityCorrect, clock: r.clockFlagged === r.clocked });
    }
  });
});

describe("the deadline screen hides nothing", () => {
  it("lists every clocked message, caught or missed, at any setting", () => {
    for (const th of [MERIDIAN_THRESHOLDS, linesFor(0.95), linesFor(0.15)]) {
      const v = deriveView(meridian, th, HAND, LOOKUP);
      const listed = new Set(v.deadlines.map((d) => d.id));
      for (const lm of instrument.inbox.filter((x) => x.clocked)) expect(listed.has(lm.id), lm.id).toBe(true);
    }
  });

  it("marks a clock the setting misses as missed, never drops it", () => {
    // At a high clock line some clocks go unflagged; each still appears, marked missed.
    const v = deriveView(meridian, { ...MERIDIAN_THRESHOLDS, clockAct: 0.99 }, HAND, LOOKUP);
    const unflagged = instrument.inbox.filter((m) => m.clocked).filter((m) => !v.inboxRows.find((r) => r.id === m.id)?.clockFlagged);
    for (const m of unflagged) expect(v.deadlines.find((d) => d.id === m.id)?.state, m.id).toBe("missed");
  });
});

describe("the inbox reads newest first", () => {
  it("orders rows by received time, latest at the top", () => {
    const received = view.inboxRows.map((r) => r.received);
    expect(received).toEqual([...received].sort().reverse());
  });
});

describe("dates and estimates read truthfully", () => {
  it("never prints a negative day count: a date behind the inbox reads as overdue", () => {
    for (const d of view.deadlines) expect(d.days).not.toMatch(/-\d/);
    for (const a of view.attention) expect(a.due).not.toMatch(/-\d/);
    for (const d of view.deadlines) expect(d.widthPct).toBeGreaterThanOrEqual(0);
    const overdue = view.deadlines.filter((d) => d.days.includes("overdue"));
    for (const d of overdue) expect(d.days).toMatch(/^\d+ days? overdue$/);
  });

  it("counts the working days the measured inbox spans, Monday Sep 14 to Monday Sep 21", () => {
    expect(view.span).toEqual({ workingDays: 6, from: "2026-09-14", to: "2026-09-21" });
  });

  it("projects a week from the per-working-day rate, not from the whole set", () => {
    const minutes = (s: string) => { const h = /(\d+)h (\d+)m/.exec(s); return h ? Number(h[1]) * 60 + Number(h[2]) : Number(/(\d+) min/.exec(s)?.[1]); };
    const whole = minutes(view.savings.savedToday);
    const week = minutes(view.savings.savedWeek);
    // Six working days of mail: a five-day week is five sixths of it, give or take rounding.
    expect(Math.abs(week - (whole / 6) * 5)).toBeLessThanOrEqual(1);
  });
});
