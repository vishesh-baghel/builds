import { afterEach, describe, expect, it, vi } from "vitest";
import { INBOX_AS_OF } from "../src/clock";
import { firmById } from "../src/fixtures";
import { checkFloors, classCounts } from "../src/fixtures/floors";
import { buildInstrument, parseCsv, parseInbox, toMessage } from "../src/fixtures/instrument";
import { loadInstrument } from "../src/fixtures/load";
import { FixtureError, PROJECT_COLUMNS } from "../src/fixtures/schema";
import { judgmentFromScores } from "../src/jev";
import { DEFAULT_THRESHOLDS } from "../src/policy";
import { factsFor } from "../src/stages/extract";
import { assess } from "../src/triage";

const firm = firmById("arch");
const classes = firm.classes.map((c) => c[0]);
const instrument = loadInstrument();

describe("the loader (AC #1)", () => {
  it("parses every inbox record and every system-of-record row against the typed schema", () => {
    expect(instrument.inbox.length).toBeGreaterThan(60);
    expect(instrument.projects.length).toBeGreaterThan(0);
    expect(instrument.rfis.length).toBeGreaterThan(0);
    expect(instrument.submittals.length).toBeGreaterThan(0);
    expect(instrument.contacts.length).toBeGreaterThan(0);
  });

  it("re-derives the committed deadline in code on every clocked row", () => {
    for (const m of instrument.inbox.filter((x) => x.clocked)) {
      expect(factsFor(toMessage(m), instrument).deadline?.date ?? null, m.id).toBe(m.deadline);
    }
  });

  describe("arithmetic is anchored to each message and INBOX_AS_OF, never the wall clock", () => {
    afterEach(() => vi.useRealTimers());
    it("derives the same deadlines when the machine clock says a different year", () => {
      const before = instrument.inbox.map((m) => factsFor(toMessage(m), instrument).deadline?.date ?? null);
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2031-03-03T12:00:00Z"));
      const after = instrument.inbox.map((m) => factsFor(toMessage(m), instrument).deadline?.date ?? null);
      expect(after).toEqual(before);
      expect(INBOX_AS_OF).toBe("2026-09-21");
    });
  });

  const one = (over: Record<string, unknown>) => JSON.stringify({
    id: "x1", from: "A", email: "a@x.example", subject: "RFI-042 question", body: "b", received_at: "2026-09-19 08:00",
    topics: ["rfi"], route: ["Priya Nair", "Tom Okafor"], priority: "urgent", deadline: "2026-09-25", clocked: true, project: "HP", hard: false, note: "",
    ...over,
  });
  const withInbox = (line: string) => buildInstrument({ ...instrument, inbox: parseInbox(line) }, firm);

  it("accepts a well-formed clocked row", () => expect(() => withInbox(one({}))).not.toThrow());
  it("rejects a clocked row whose deadline code cannot reproduce", () => expect(() => withInbox(one({ deadline: "2026-09-26" }))).toThrow(FixtureError));
  it("rejects a topic outside the taxonomy", () => expect(() => withInbox(one({ topics: ["billing"] }))).toThrow(FixtureError));
  it("rejects a route naming someone off the staff list", () => expect(() => withInbox(one({ route: ["Nobody"] }))).toThrow(FixtureError));
  it("rejects an unsorted route, which would not compare as a set", () => expect(() => withInbox(one({ route: ["Tom Okafor", "Priya Nair"] }))).toThrow(FixtureError));
  it("rejects a priority outside the levels", () => expect(() => withInbox(one({ priority: "asap" }))).toThrow(FixtureError));
  it("rejects a malformed received stamp", () => expect(() => parseInbox(one({ received_at: "yesterday" }))).toThrow(FixtureError));
  it("rejects a CSV row whose cell count shifted", () => {
    expect(() => parseCsv(`${PROJECT_COLUMNS.join(",")}\nHP,Harbor Point, Residences,x`, PROJECT_COLUMNS, "projects.csv")).toThrow(FixtureError);
  });
});

describe("the size floors (AC #16)", () => {
  it("holds for the committed instrument", () => {
    expect(checkFloors(instrument.inbox, classes, {})).toEqual([]);
    expect(instrument.inbox.filter((m) => m.clocked).length).toBeGreaterThanOrEqual(12);
    for (const c of classCounts(instrument.inbox, classes)) expect(c.ordinary, c.label).toBeGreaterThanOrEqual(6);
  });

  const thin = instrument.inbox.filter((m) => !(m.topics.includes("invoice") && !m.hard) || m.id === "m060");

  it("fails when a class falls under six ordinary examples with no declared threshold", () => {
    expect(checkFloors(thin, classes, {}).some((p) => p.startsWith("invoice"))).toBe(true);
  });

  it("passes that class once its threshold is declared with its true n", () => {
    expect(checkFloors(thin, classes, { invoice: { act: 0.7, n: 1, reason: "too few to sweep" } })).toEqual([]);
  });

  it("fails a declaration whose n does not match the instrument", () => {
    expect(checkFloors(thin, classes, { invoice: { act: 0.7, n: 4, reason: "stale" } }).length).toBeGreaterThan(0);
  });

  it("fails when the clocked subset is under twelve", () => {
    const fewClocks = instrument.inbox.filter((m) => !m.clocked).concat(instrument.inbox.filter((m) => m.clocked).slice(0, 11));
    expect(checkFloors(fewClocks, classes, {}).some((p) => p.includes("clocked"))).toBe(true);
  });
});

describe("labels and the stated rules agree", () => {
  /**
   * Under a perfect judgment (every labelled topic certain, the clock certain when labelled), the code
   * must land every ordinary message where its labels say. A disagreement there is a labelling slip or
   * a rule the code does not implement. The hard cases that disagree are the ones written to: a repeat
   * chase with none of the repeat words, and a client's lease date a parser takes for a clock.
   */
  const disagreements = instrument.inbox.filter((m) => {
    const scores = Object.fromEntries(classes.map((c) => [c, m.topics.includes(c) ? 0.95 : 0.05]));
    const message = toMessage(m);
    const plan = assess(firm, message, judgmentFromScores(scores, m.clocked ? 0.9 : 0.05), factsFor(message, instrument), instrument, DEFAULT_THRESHOLDS, INBOX_AS_OF);
    return [...plan.people].sort().join("|") !== m.route.join("|") || plan.priority !== m.priority || plan.clockFlagged !== m.clocked;
  });

  it("on every ordinary message", () => expect(disagreements.filter((m) => !m.hard).map((m) => m.id)).toEqual([]));
  it("and only on the hard cases written to disagree", () => expect(disagreements.map((m) => m.id)).toEqual(["m076", "m077"]));
});
