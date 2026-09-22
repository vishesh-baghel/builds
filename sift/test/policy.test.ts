import { describe, expect, it } from "vitest";
import { DEFAULT_THRESHOLDS, linesFor, probOf, renderSecondsEstimate, SHIPPED_DIAL } from "../src/policy";
import type { Message } from "../src/types";

describe("linesFor: the dial maps to three lines", () => {
  it("pins the cautious end (dial 0)", () => {
    expect(linesFor(0)).toEqual({ act: 0.99, review: 0.1, clockAct: 0.2 });
  });
  it("pins the hands-off end (dial 1)", () => {
    expect(linesFor(1)).toEqual({ act: 0.6, review: 0.6, clockAct: 0.8 });
  });
  it("pins the shipped midpoint", () => {
    expect(linesFor(SHIPPED_DIAL)).toEqual({ act: 0.65, review: 0.35, clockAct: 0.56 });
    expect(DEFAULT_THRESHOLDS).toEqual(linesFor(SHIPPED_DIAL));
  });
  it("moves the act line down and the clock line up as trust rises", () => {
    // More autonomy: a lower act line (acts more readily) and a higher clock line (flags fainter clocks less).
    expect(linesFor(0.9).act).toBeLessThan(linesFor(0.2).act);
    expect(linesFor(0.9).clockAct).toBeGreaterThan(linesFor(0.2).clockAct);
  });
});

describe("probOf: absent is faint, not impossible", () => {
  const m = { id: "x", from: "", email: "", subject: "", body: "", received: "2026-09-20 09:00", p: { rfi: 0.9 }, clock: 0.1 } satisfies Message;
  it("reads a present probability", () => expect(probOf(m, "rfi")).toBe(0.9));
  it("gives an absent class a small deterministic non-zero", () => {
    expect(probOf(m, "invoice")).toBeGreaterThan(0);
    expect(probOf(m, "invoice")).toBeLessThan(0.1);
    expect(probOf(m, "invoice")).toBe(probOf(m, "invoice")); // deterministic
  });
});

describe("renderSecondsEstimate carries the word estimate (AC #24)", () => {
  it("labels a declared human-time figure as an estimate", () => {
    expect(renderSecondsEstimate(90)).toContain("estimate");
  });
});
