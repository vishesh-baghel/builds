import { describe, expect, it } from "vitest";
import { InMemoryAuditLog, InMemoryIdempotencyStore, type Escalation } from "@builds/shared";
import type { WorkOrder } from "../src/fixtures";
import { itemsOf } from "../src/item";
import { itemPipeline, type DraftedLine } from "../src/pipeline";
import { decideItem } from "../src/policy";
import { judgment } from "./helpers";

const order: WorkOrder = {
  id: "WO-1", customer: "Test", date: "2026-09-01", technician: "T", equipment: "E",
  note: "swapped the compressor, had to pull the old line set, 2 extra guys thursday",
  invoice: [{ code: "SVC-CALL", description: "Service call", quantity: 1, cents: 45_000 }, { code: "COMP", description: "Compressor replacement", quantity: 1, cents: 185_000 }],
};
const [comp, lineset, techs] = itemsOf(order);
const t = { unsupported: 0.5, evidence: 2, covered: 0.6, margin: 0.4 };

describe("decideItem", () => {
  it("recovers a missed billable item with plain evidence", () => {
    expect(decideItem(lineset!, judgment("missed_billable"), t, false).outcome).toBe("recovered");
  });
  it("never counts a line the guardrail says the note does not support", () => {
    expect(decideItem(lineset!, judgment("missed_billable", { unsupported: 0.7 }), t, false).outcome).toBe("guardrail");
  });
  it("routes weak evidence and close calls to a human", () => {
    expect(decideItem(lineset!, judgment("missed_billable", { evidence: 1 }), t, false).outcome).toBe("human");
    expect(decideItem(lineset!, judgment("missed_billable", {}, 0.35), t, false).outcome).toBe("human");
    expect(decideItem(lineset!, judgment("missed_billable", { covered: 0.8 }), t, false).outcome).toBe("human");
  });
  it("never bills a rate code already on the invoice, whatever Drex says", () => {
    expect(decideItem(comp!, judgment("missed_billable"), t, true).outcome).toBe("no_charge");
  });
});

describe("item pipeline", () => {
  it("drafts once per order and rate code, writes a decide row per item, and queues humans", async () => {
    const drafts: DraftedLine[] = [];
    const humanQueue: Escalation[] = [];
    const audit = new InMemoryAuditLog();
    const verdicts = new Map([[comp!.id, judgment("invoiced")], [lineset!.id, judgment("missed_billable")], [techs!.id, judgment("missed_billable", { evidence: 1 })]]);
    const p = itemPipeline({ judge: async (i) => verdicts.get(i.id)!, thresholds: t, idempotency: new InMemoryIdempotencyStore(), drafts, humanQueue });
    for (const item of [comp!, lineset!, techs!, lineset!]) await p.run(order, item, new Date(), audit);

    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.cents).toBe(64_000);
    expect(humanQueue.map((e) => e.inputId)).toEqual([techs!.id]);
    for (const item of [comp!, lineset!, techs!]) {
      expect((await audit.list(item.id)).filter((r) => r.stage === "decide").length).toBeGreaterThanOrEqual(1);
    }
  });
});
