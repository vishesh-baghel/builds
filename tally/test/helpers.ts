import type { Judgment } from "../src/drex";
import type { Verdict } from "../src/fixtures";

export const judgment = (top: Verdict, over: Partial<Omit<Judgment, "verdict">> = {}, p = 0.9): Judgment => ({
  verdict: { invoiced: 0, missed_billable: 0, covered: 0, not_billable: 0, [top]: p } as Record<Verdict, number>,
  covered: 0.05, unsupported: 0.05, evidence: 3.5, inputTokens: 2_200, latencyMs: 500, ...over,
});
