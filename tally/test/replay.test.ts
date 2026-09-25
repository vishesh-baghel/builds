import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Judgment } from "../src/drex";
import type { WorkItem } from "../src/item";
import { decideItem, type Thresholds } from "../src/policy";

type Item = WorkItem & { alreadyInvoiced: boolean; verdict: Judgment["verdict"]; covered: number; unsupported: number; evidence: number; expected: string; outcome: string };
const load = <T>(p: string): T => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), "utf8")) as T;
const replay = load<{ thresholds: Thresholds; samples: string[]; orders: { id: string; items: Item[] }[] }>("public/replay.json");
const scorecard = load<{ full: { recovered: number; guardrailBlocks: number; humanRouted: number; foundCents: number } }>("runs/scorecard.json");

describe("the site's data file", () => {
  // The sandbox re-runs `decideItem` in the browser; at the recommended setting it must say
  // exactly what the scorecard says, or the site and the README disagree.
  it("reproduces the scorecard at the recommended thresholds", () => {
    let recovered = 0, guardrail = 0, human = 0, found = 0;
    for (const o of replay.orders) for (const it of o.items) {
      const d = decideItem(it, { ...it, inputTokens: 0, latencyMs: 0 }, replay.thresholds, it.alreadyInvoiced);
      expect(d.outcome).toBe(it.outcome);
      if (d.outcome === "recovered") { recovered++; if (it.expected === "recover") found += it.priceCents; }
      if (d.outcome === "guardrail") guardrail++;
      if (d.outcome === "human") human++;
    }
    expect({ recovered, guardrail, human, found }).toEqual({
      recovered: scorecard.full.recovered, guardrail: scorecard.full.guardrailBlocks,
      human: scorecard.full.humanRouted, found: scorecard.full.foundCents,
    });
  });

  it("names 14 start-here examples, all real orders", () => {
    expect(replay.samples).toHaveLength(14);
    const ids = new Set(replay.orders.map((o) => o.id));
    expect(replay.samples.every((s) => ids.has(s))).toBe(true);
  });
});
