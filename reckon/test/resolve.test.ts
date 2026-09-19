import { describe, expect, it } from "vitest";
import { LEDGER_AS_OF } from "../src/clock";
import { parseStatedFigure, resolvePartialAmount } from "../src/resolve/amount";
import { resolvePromiseDate, type DateComponents } from "../src/resolve/date";

/**
 * The ledger date, 2026-10-11, is a Sunday. That is load-bearing for several of these: a
 * promise landing on a weekend moves to the next working day, and the test says so rather than
 * quietly expecting the rolled date.
 */

const components = (over: Partial<DateComponents>): DateComponents =>
  ({ anchor: "none", weekday: "none", period: "none", ...over });

describe("promise dates are assembled in code — AC #6", () => {
  it("resolves an explicit day of the month, rolling to next month when it has passed", () => {
    // The 15th has not happened yet in October.
    expect(resolvePromiseDate(components({ anchor: "day_of_month" }), "we'll pay on the 15th").date)
      .toBe("2026-10-15");
    // The 3rd already has, so the promise means November.
    expect(resolvePromiseDate(components({ anchor: "day_of_month" }), "settled by the 3rd").date)
      .toBe("2026-11-03");
  });

  it("resolves an M/D date in the message", () => {
    const resolved = resolvePromiseDate(components({ anchor: "day_of_month" }), "Scheduled for 10/23.");
    expect(resolved.date).toBe("2026-10-23");
    expect(resolved.how).toContain("10/23");
  });

  it("resolves a named weekday forward from the ledger date", () => {
    expect(resolvePromiseDate(components({ anchor: "weekday", weekday: "friday" }), "by Friday").date)
      .toBe("2026-10-16");
    expect(resolvePromiseDate(components({ anchor: "weekday", weekday: "monday" }), "give me until Monday").date)
      .toBe("2026-10-12");
  });

  it("moves a weekend promise to the next working day, and says that it did", () => {
    const saturday = resolvePromiseDate(components({ anchor: "weekday", weekday: "saturday" }), "Saturday");
    expect(saturday.date).toBe("2026-10-19");
    expect(saturday.how).toContain("next working day");
  });

  it("resolves a relative period", () => {
    expect(resolvePromiseDate(components({ anchor: "relative_period", period: "tomorrow" }), "tomorrow").date)
      .toBe("2026-10-12");
    expect(resolvePromiseDate(components({ anchor: "relative_period", period: "this_week" }), "this week").date)
      .toBe("2026-10-16");
    // 2026-10-31 is a Saturday.
    expect(resolvePromiseDate(components({ anchor: "relative_period", period: "end_of_this_month" }), "month end").date)
      .toBe("2026-11-02");
    expect(resolvePromiseDate(components({ anchor: "relative_period", period: "end_of_next_month" }), "end of next month").date)
      .toBe("2026-11-30");
    expect(resolvePromiseDate(components({ anchor: "relative_period", period: "next_payment_run" }), "next cycle").date)
      .toBe("2026-11-02");
  });

  it("invents nothing when the anchor is none", () => {
    const resolved = resolvePromiseDate(components({ anchor: "none" }), "we will pay you as soon as we can");
    expect(resolved.date).toBeNull();
    expect(resolved.how).toBe("no date was given");
  });

  it("invents nothing when the anchor names a component the message does not carry", () => {
    expect(resolvePromiseDate(components({ anchor: "day_of_month" }), "soon, I promise").date).toBeNull();
    expect(resolvePromiseDate(components({ anchor: "weekday", weekday: "none" }), "shortly").date).toBeNull();
    expect(resolvePromiseDate(components({ anchor: "relative_period", period: "none" }), "shortly").date).toBeNull();
  });

  it("does not read the wall clock — the same components resolve the same in any year", () => {
    const a = resolvePromiseDate(components({ anchor: "weekday", weekday: "friday" }), "Friday", LEDGER_AS_OF);
    const b = resolvePromiseDate(components({ anchor: "weekday", weekday: "friday" }), "Friday", "2030-01-01");
    expect(a.date).toBe("2026-10-16");
    expect(b.date).toBe("2030-01-04");
  });
});

describe("partial amounts are worked out in code — AC #8", () => {
  const balance = 41_250;

  it("takes a stated figure from the message", () => {
    const resolved = resolvePartialAmount(
      { shape: "stated_figure", fraction: "none" },
      "Paying the undisputed portion now - 21,000 - and holding the rest.",
      balance,
    );
    expect(resolved.amount).toBe(21_000);
    expect(resolved.how).toContain("stated");
  });

  it("reads a rounded figure written with k", () => {
    expect(resolvePartialAmount({ shape: "stated_figure", fraction: "none" }, "20k went out today", balance).amount)
      .toBe(20_000);
  });

  it("computes a fraction against the open balance rather than asking the model to multiply", () => {
    const resolved = resolvePartialAmount({ shape: "fraction_of_balance", fraction: "half" }, "half now", balance);
    expect(resolved.amount).toBe(balance / 2);
    expect(resolved.how).toContain("half");
    expect(resolved.how).toContain(String(balance));
  });

  it("records nothing when no size can be fixed", () => {
    expect(resolvePartialAmount({ shape: "none", fraction: "none" }, "sending something over", balance).amount)
      .toBeNull();
    expect(resolvePartialAmount({ shape: "fraction_of_balance", fraction: "most" }, "most of it", balance).amount)
      .toBeNull();
    expect(resolvePartialAmount({ shape: "stated_figure", fraction: "none" }, "a payment is going out", balance).amount)
      .toBeNull();
  });

  it("refuses a figure larger than what is outstanding", () => {
    const resolved = resolvePartialAmount({ shape: "stated_figure", fraction: "none" }, "sending 90,000", balance);
    expect(resolved.amount).toBeNull();
    expect(resolved.how).toContain("larger than");
  });

  it("ignores small bare numbers that are terms and invoice numbers, not money", () => {
    expect(parseStatedFigure("our contract says net 60")).toBeNull();
    expect(parseStatedFigure("re: invoice 4417")).toBeNull();
    expect(parseStatedFigure("$10,000 is on its way")).toBe(10_000);
  });
});
