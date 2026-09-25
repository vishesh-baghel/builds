import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { KeyItem, WorkOrder } from "../src/fixtures";
import { itemsOf } from "../src/item";
import { quantityOf, splitNote } from "../src/split";

const load = <T>(p: string): T => JSON.parse(readFileSync(new URL(`../fixtures/${p}`, import.meta.url), "utf8")) as T;
const orders = load<WorkOrder[]>("work-orders.json");
const key = load<KeyItem[]>("answer-key.json");

describe("fixtures", () => {
  it("are 1,000 orders with a key row for every item the splitter finds, and no others", () => {
    expect(orders).toHaveLength(1_000);
    const found = orders.flatMap((o) => itemsOf(o).map((i) => `${o.id}@${i.start}:${i.code ?? i.nonBillable}`));
    const keyed = key.map((k) => `${k.orderId}@${k.start}:${k.code ?? k.nonBillable}`);
    expect(found).toEqual(keyed);
  });

  it("plant every trap type", () => {
    const traps = new Set(key.map((k) => k.trap).filter(Boolean));
    expect([...traps].sort()).toEqual(["casual_extra", "chatter", "hedged", "injection", "mention_not_done", "sounds_extra_but_covered"]);
  });

  it("price every planted unbilled item from the rate card, as code would", () => {
    for (const o of orders) for (const item of itemsOf(o)) {
      const k = key.find((r) => r.orderId === o.id && r.start === item.start)!;
      if (k.truth === "missed_billable") expect(item.priceCents).toBe(k.valueCents);
    }
  });
});

describe("splitNote", () => {
  it("cuts the scene note into its three items and drops filler", () => {
    const items = splitNote("swapped the compressor, had to pull the old line set, 2 extra guys thursday. all good");
    expect(items.map((c) => c.code)).toEqual(["COMP", "LINESET", "TECH-ADD"]);
  });

  it("reads quantities from the item's own words", () => {
    expect(quantityOf("REFRIG", "topped off 3 lbs freon")).toBe(3);
    expect(quantityOf("TECH-ADD", "2 extra guys thursday")).toBe(2);
    expect(quantityOf("LABOR-HR", "ran over 2 hours")).toBe(2);
    expect(quantityOf("COMP", "replaced compressor")).toBe(1);
  });
});
