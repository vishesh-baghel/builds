import { describe, expect, it } from "vitest";
import { loadInstrument } from "../src/fixtures/load";
import { firmById } from "../src/fixtures";
import { judgmentFromScores, type Judgment } from "../src/jev";
import { DEFAULT_THRESHOLDS } from "../src/policy";
import { createSift, recordedJudge } from "../src/run";
import { bestPoint, headlineFor, runMeta, scoreRun, sweep, type Headline } from "../src/score";
import { renderHeadline, renderScorecard } from "../src/scorecard";

const instrument = loadInstrument();
const firm = firmById("arch");
const classes = firm.classes.map((c) => c[0]);

/** A perfect judgment for every message: offline, no key, and a known answer to check the harness against. */
const oracle: Record<string, Judgment & { elapsedMs: number }> = Object.fromEntries(instrument.inbox.map((m) => [m.id, {
  ...judgmentFromScores(Object.fromEntries(classes.map((c) => [c, m.topics.includes(c) ? 0.95 : 0.05])), m.clocked ? 0.9 : 0.05,
    { usage: { input_tokens: 1000, output_tokens: 0 }, costCents: 0.0042, model: "oracle" }),
  elapsedMs: 100,
}]));

describe("the harness end to end, offline (AC #17)", () => {
  it("runs the pipeline over the committed inbox through the replay judge and scores it", async () => {
    const sift = createSift({ instrument, judge: recordedJudge(oracle) });
    for (const m of instrument.inbox) await sift.run(m);
    const figures = scoreRun(instrument.inbox, oracle, firm, instrument, DEFAULT_THRESHOLDS);
    expect(figures.ordinary.n + figures.hard.n).toBe(instrument.inbox.length);
    // A perfect judgment catches every clock; the one false alarm is m077's lease date, a hard case.
    expect(figures.headline.caught.count).toBe(figures.headline.caught.n);
    expect(figures.results.filter((r) => !r.clocked && r.clockFlagged).map((r) => r.id)).toEqual(["m077"]);
  });
});

describe("the headline never prints alone (AC #18, #19)", () => {
  const headline = headlineFor(scoreRun(instrument.inbox, oracle, firm, instrument, DEFAULT_THRESHOLDS).results);

  it("reports the catch rate with its n", () => {
    expect(renderHeadline(headline)).toMatch(/clocked-item catch rate.*\(\d+\/\d+\)/);
  });

  it("refuses to render the catch rate without both counterparts", () => {
    expect(() => renderHeadline({ caught: headline.caught } as unknown as Headline)).toThrow(/counterparts/);
    expect(() => renderHeadline({ caught: headline.caught, falseAlarms: headline.falseAlarms } as unknown as Headline)).toThrow();
  });

  it("prints the false-alarm rate and the automation share beside it", () => {
    const text = renderHeadline(headline);
    expect(text).toContain("false alarms");
    expect(text).toContain("automation");
  });
});

describe("the scorecard (AC #20, #21, #23)", () => {
  const figures = scoreRun(instrument.inbox, oracle, firm, instrument, DEFAULT_THRESHOLDS);
  const text = renderScorecard({
    date: "2026-09-21", thresholds: DEFAULT_THRESHOLDS, declared: {}, figures, meta: runMeta(Object.values(oracle)), sweep: [],
    counts: { total: instrument.inbox.length, clocked: instrument.inbox.filter((m) => m.clocked).length, hard: instrument.inbox.filter((m) => m.hard).length },
    runArtifact: "runs/run.json", sweepArtifact: "runs/sweep.json",
  });

  it("scores ordinary and hard separately, with n on every class row", () => {
    expect(text).toContain(`### Ordinary subset, n = ${figures.ordinary.n}`);
    expect(text).toContain(`### Hard subset, n = ${figures.hard.n}`);
    for (const c of classes) expect(text).toMatch(new RegExp(`\\| \`${c}\` \\| \\d+ \\|`));
  });

  it("produces no single overall accuracy figure", () => {
    expect(text).not.toMatch(/overall accuracy\s*[:|]\s*\d/i);
    expect(text).not.toMatch(/^\|\s*accuracy\s*\|/im);
  });

  it("prints the gate's catch with the error count as a count", () => {
    expect(text).toMatch(/\*\*Errors:\*\* \d+ of \d+ messages/);
    expect(text).toMatch(/the confidence gate sent \d+ to a person/);
  });

  it("prints measured cost and time per message", () => {
    expect(text).toContain("**cost per message**");
    expect(text).toContain("machine time per message, median");
  });

  it("carries the synthetic-data label and no before/after comparison", () => {
    expect(text).toContain("All data is synthetic");
    expect(text).not.toMatch(/\bbaseline\b.*\|/i);
  });
});

describe("the sweep sees only the ordinary subset (AC #22)", () => {
  it("never looks up a hard message's judgment", () => {
    const ordinaryOnly = Object.fromEntries(Object.entries(oracle).filter(([id]) => !instrument.inbox.find((m) => m.id === id)?.hard));
    const points = sweep(instrument.inbox, ordinaryOnly, firm, instrument, {});
    expect(points.length).toBeGreaterThan(100);
    expect(bestPoint(points)).not.toBeNull();
  });

  it("keeps review below act at every point", () => {
    for (const p of sweep(instrument.inbox, oracle, firm, instrument, {})) expect(p.review).toBeLessThan(p.act);
  });
});

describe("measured run metadata", () => {
  it("takes the median of real elapsed times", () => {
    const js = [{ ms: 10 }, { ms: 30 }, { ms: 20 }].map(({ ms }) => ({ ...judgmentFromScores({}, 0), elapsedMs: ms }));
    expect(runMeta(js).medianMs).toBe(20);
  });
});

describe("the committed lines match the committed sweep (AC #22)", () => {
  it("MERIDIAN_THRESHOLDS is exactly the point runs/sweep.json chose", async () => {
    const { MERIDIAN_THRESHOLDS } = await import("../src/policy");
    const { default: artifact } = await import("../runs/sweep.json", { with: { type: "json" } });
    const chosen = artifact.chosen as { act: number; review: number; clockAct: number };
    expect(MERIDIAN_THRESHOLDS).toEqual({ act: chosen.act, review: chosen.review, clockAct: chosen.clockAct });
  });
});
