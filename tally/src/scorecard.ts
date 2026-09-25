import type { Judgment } from "./drex";
import { TRAPS, type KeyItem, type Trap } from "./fixtures";
import type { WorkItem } from "./item";
import { decideItem, topVerdict, type Outcome, type Thresholds } from "./policy";

/** One scored item: what code prepared, what Drex said, what the key says. */
export interface Scored {
  readonly item: WorkItem;
  readonly judgment: Judgment;
  readonly key: KeyItem;
  readonly alreadyInvoiced: boolean;
}

/** Did the system do the right thing with this planted trap? */
export function trapCaught(trap: Trap, outcome: Outcome): boolean {
  switch (trap) {
    case "casual_extra": return outcome === "recovered";
    case "hedged": return outcome === "human";
    default: return outcome !== "recovered";
  }
}

export interface Tally {
  readonly items: number;
  readonly plantedCents: number;
  readonly foundCents: number;
  readonly wronglyCountedCents: number;
  readonly recovered: number;
  readonly wronglyCounted: number;
  readonly guardrailBlocks: number;
  readonly humanRouted: number;
  readonly verdictAccuracy: number;
  readonly traps: Record<Trap, { planted: number; caught: number }>;
}

export function tally(scored: readonly Scored[], t: Thresholds): Tally {
  let plantedCents = 0, foundCents = 0, wronglyCountedCents = 0, recovered = 0, wronglyCounted = 0;
  let guardrailBlocks = 0, humanRouted = 0, correctVerdicts = 0;
  const traps = Object.fromEntries(TRAPS.map((trap) => [trap, { planted: 0, caught: 0 }])) as Tally["traps"];

  for (const s of scored) {
    const { outcome } = decideItem(s.item, s.judgment, t, s.alreadyInvoiced);
    if (topVerdict(s.judgment) === s.key.truth) correctVerdicts++;
    if (s.key.expected === "recover") plantedCents += s.key.valueCents;
    if (outcome === "recovered") {
      recovered++;
      if (s.key.expected === "recover") foundCents += s.item.priceCents;
      else { wronglyCounted++; wronglyCountedCents += s.item.priceCents; }
    }
    if (outcome === "guardrail") guardrailBlocks++;
    if (outcome === "human") humanRouted++;
    if (s.key.trap) {
      traps[s.key.trap].planted++;
      if (trapCaught(s.key.trap, outcome)) traps[s.key.trap].caught++;
    }
  }
  return {
    items: scored.length, plantedCents, foundCents, wronglyCountedCents, recovered, wronglyCounted,
    guardrailBlocks, humanRouted, verdictAccuracy: scored.length ? correctVerdicts / scored.length : 0, traps,
  };
}

const range = (from: number, to: number, step: number): number[] =>
  Array.from({ length: Math.round((to - from) / step) + 1 }, (_, i) => +(from + i * step).toFixed(4));

/**
 * Thresholds are measured, not assumed: Drex's published calibration is its weakest row. The
 * grid is searched on the calibration orders only, maximising money found minus twice the money
 * wrongly counted, because a line billed for work that did not happen costs more than one missed.
 */
export function chooseThresholds(calibration: readonly Scored[]): Thresholds {
  let best: Thresholds = { unsupported: 0.5, evidence: 2, covered: 0.5, margin: 0 };
  let bestScore = -Infinity;
  for (const unsupported of range(0.1, 0.9, 0.05))
    for (const evidence of range(0, 3.5, 0.25))
      for (const covered of [0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.01])
        for (const margin of [0, 0.3, 0.4, 0.5, 0.6, 0.7]) {
          const t = { unsupported, evidence, covered, margin };
          const r = tally(calibration, t);
          const score = r.foundCents - 2 * r.wronglyCountedCents;
          if (score > bestScore) { bestScore = score; best = t; }
        }
  return best;
}
