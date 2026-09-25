import type { Judgment } from "./drex";
import { VERDICTS, type Verdict } from "./fixtures";
import type { WorkItem } from "./item";

/** Set by measurement on the calibration orders, never assumed. See `chooseThresholds`. */
export interface Thresholds {
  /** Guardrail: at or above this, the drafted line claims something the note does not say. */
  readonly unsupported: number;
  /** Below this evidence score (0..4), a person confirms the work happened. */
  readonly evidence: number;
  /** At or above this, the agreement probably covers it, contradicting the verdict: a person decides. */
  readonly covered: number;
  /** Below this probability on `missed_billable`, the call is too close: a person decides. */
  readonly margin: number;
}

export type Outcome = "recovered" | "guardrail" | "human" | "no_charge";

export interface ItemDecision {
  readonly outcome: Outcome;
  readonly verdict: Verdict;
  readonly reason: string;
}

export const topVerdict = (j: Judgment): Verdict =>
  VERDICTS.reduce((best, v) => (j.verdict[v] > j.verdict[best] ? v : best));

/**
 * Pure code over Drex's numbers. Only `recovered` counts toward unbilled money; a human-routed
 * item is a normal outcome, not a failure.
 */
export function decideItem(item: WorkItem, j: Judgment, t: Thresholds, alreadyInvoiced: boolean): ItemDecision {
  const verdict = topVerdict(j);
  const p = (n: number) => n.toFixed(2);
  if (verdict !== "missed_billable") return { outcome: "no_charge", verdict, reason: `Drex: ${verdict} (${p(j.verdict[verdict])})` };
  // The two code-owned vetoes. Neither needs a model: the catalog has no line to draft, or the
  // invoice already carries this rate code, and billing it again would double-bill.
  if (item.code === null) return { outcome: "no_charge", verdict, reason: `no rate line; clause ${item.clause} work is never billed` };
  if (alreadyInvoiced) return { outcome: "no_charge", verdict, reason: `${item.code} is already on the invoice` };
  // Uncertainty first: when the technician is unsure, a person resolves it. The guardrail is for
  // lines that sound certain but that the note does not support.
  if (j.evidence < t.evidence) return { outcome: "human", verdict, reason: `weak evidence the work happened (${j.evidence.toFixed(1)} of 4)` };
  if (j.unsupported >= t.unsupported) return { outcome: "guardrail", verdict, reason: `guardrail: the note does not support the drafted line (${p(j.unsupported)})` };
  if (j.covered >= t.covered) return { outcome: "human", verdict, reason: `verdict says billable, coverage check says covered (${p(j.covered)})` };
  if (j.verdict.missed_billable < t.margin) return { outcome: "human", verdict, reason: `close call (${p(j.verdict.missed_billable)} missed billable)` };
  return { outcome: "recovered", verdict, reason: `missed billable (${p(j.verdict.missed_billable)}), clause ${item.clause}` };
}
