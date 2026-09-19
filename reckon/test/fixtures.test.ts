import { describe, expect, it, vi } from "vitest";
import { daysBetween, LEDGER_AS_OF } from "../src/clock.js";
import { buildFixtureSet, loadFixtures, parseAgingCsv, parseRepliesJsonl } from "../src/fixtures/load.js";
import { FixtureError } from "../src/fixtures/schema.js";
import { REPLY_CLASSES } from "../src/types.js";

const fixtures = loadFixtures();

/** The distribution the fixtures README publishes. A drift here changes what the number means. */
const EXPECTED_CLASS_COUNTS: Record<string, number> = {
  claimed_payment: 10,
  promise_to_pay: 12,
  partial: 6,
  dispute: 6,
  question: 12,
  wrong_contact: 8,
  noise: 18,
};

describe("the committed fixture set — AC #1", () => {
  it("parses all 15 invoice rows against the typed schema", () => {
    expect(fixtures.invoices).toHaveLength(15);
    for (const invoice of fixtures.invoices) {
      expect(invoice.invoiceNo).toMatch(/^\d{4}$/);
      expect(invoice.amount).toBeGreaterThan(0);
      expect(invoice.openBalance).toBeGreaterThan(0);
      expect(invoice.openBalance).toBeLessThanOrEqual(invoice.amount);
    }
  });

  it("parses all 72 reply records against the typed schema", () => {
    expect(fixtures.replies).toHaveLength(72);
    for (const reply of fixtures.replies) {
      expect(REPLY_CLASSES).toContain(reply.label);
      expect(reply.body.length).toBeGreaterThan(0);
      expect(fixtures.byInvoice.has(reply.invoice)).toBe(true);
    }
  });

  it("holds the published class distribution, 21 hard and 51 ordinary", () => {
    const counts: Record<string, number> = {};
    for (const reply of fixtures.replies) counts[reply.label] = (counts[reply.label] ?? 0) + 1;
    expect(counts).toEqual(EXPECTED_CLASS_COUNTS);

    const hard = fixtures.replies.filter((r) => r.hard);
    expect(hard).toHaveLength(21);
    expect(fixtures.replies.length - hard.length).toBe(51);
  });

  it("carries exactly 6 multi-label replies, none repeating its primary", () => {
    const multi = fixtures.replies.filter((r) => r.also.length > 0);
    expect(multi).toHaveLength(6);
    for (const reply of multi) expect(reply.also).not.toContain(reply.label);
  });

  it("recomputes Days Past Due from LEDGER_AS_OF and matches the committed column on every row", () => {
    expect(LEDGER_AS_OF).toBe("2026-10-11");
    for (const invoice of fixtures.invoices) {
      expect(invoice.daysPastDue).toBe(daysBetween(invoice.dueDate, LEDGER_AS_OF));
      expect(invoice.daysPastDue).toBeGreaterThan(0);
    }
    // Two rows the aging buckets hinge on, spelled out so a regression names itself.
    expect(fixtures.byInvoice.get("4417")?.daysPastDue).toBe(52);
    expect(fixtures.byInvoice.get("4461")?.daysPastDue).toBe(22);
  });

  it("computes aging from the ledger date, not from the wall clock", () => {
    const baseline = fixtures.invoices.map((i) => i.daysPastDue);
    for (const pretend of ["2020-01-01T00:00:00Z", "2099-12-31T23:59:59Z"]) {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(pretend));
      try {
        expect(loadFixtures().invoices.map((i) => i.daysPastDue)).toEqual(baseline);
      } finally {
        vi.useRealTimers();
      }
    }
  });
});

describe("the loader refuses malformed fixtures", () => {
  const header = "Invoice No,Customer,Contact Email,Invoice Date,Due Date,Terms,Amount,Open Balance,Days Past Due,Aging Bucket";
  const good = "4417,Mercer,ap@mercer.com,2026-07-21,2026-08-20,Net 30,18400.00,18400.00,52,31-60";

  it("accepts the known-good row", () => {
    expect(parseAgingCsv(`${header}\n${good}`)).toHaveLength(1);
  });

  it("rejects a Days Past Due that disagrees with the ledger date", () => {
    const wrong = good.replace(",52,", ",51,");
    expect(() => parseAgingCsv(`${header}\n${wrong}`)).toThrow(FixtureError);
  });

  it("rejects a row with the wrong number of cells rather than shifting columns", () => {
    const extra = `${good},surprise`;
    expect(() => parseAgingCsv(`${header}\n${extra}`)).toThrow(/expected 10 cells, got 11/);
  });

  it("rejects an unknown class", () => {
    const line = JSON.stringify({
      id: "x1", invoice: "4417", from: "a@b.com", subject: "s", body: "b",
      label: "escalation", also: [], hard: false, note: "",
    });
    expect(() => parseRepliesJsonl(line)).toThrow(/not.*one of the seven classes|label must be one/);
  });

  it("rejects a reply naming an invoice the ledger does not carry", () => {
    const line = JSON.stringify({
      id: "x1", invoice: "9999", from: "a@b.com", subject: "s", body: "b",
      label: "noise", also: [], hard: false, note: "",
    });
    expect(() => buildFixtureSet(fixtures.invoices, parseRepliesJsonl(line))).toThrow(/not in the ledger/);
  });
});
