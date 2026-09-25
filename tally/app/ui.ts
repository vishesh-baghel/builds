import type { CSSProperties } from "react";
import { CLAUSE_TITLES, NON_BILLABLE_LABEL, RATE_CARD, type NonBillableKind, type RateCode } from "../src/catalog";
import type { Judgment } from "../src/drex";
import type { Expected, Trap, Verdict } from "../src/fixtures";
import type { WorkItem } from "../src/item";
import { decideItem, type Thresholds } from "../src/policy";

/**
 * What both pages share: the shape of `public/replay.json`, the design tokens, and how an item's
 * status and labels are derived. The status is always the build's own `decideItem`, so the
 * sandbox and the replay can never disagree with each other or with the scorecard.
 */

export type Item = WorkItem & {
  alreadyInvoiced: boolean;
  verdict: Record<Verdict, number>; covered: number; unsupported: number; evidence: number;
  truth: Verdict; trap: Trap | null; expected: Expected; valueCents: number;
};
export interface Order {
  id: string; customer: string; date: string; technician: string; equipment: string; note: string;
  invoice: { code: RateCode; description: string; quantity: number; cents: number }[];
  items: Item[];
}
export interface Data { thresholds: Thresholds; samples: string[]; orders: Order[] }

export type Status = "counted" | "person" | "rejected" | "invoiced" | "covered" | "notbill";

export const K = {
  ink: "oklch(24% .02 258)", ink2: "oklch(36% .018 257)", ink3: "oklch(54% .015 256)", rule: "oklch(91% .006 255)", rule2: "oklch(84% .009 255)",
  paper: "oklch(98.5% .004 250)", side: "oklch(96.4% .005 252)", track: "oklch(94% .006 253)",
  accent: "oklch(52% .20 256)", accentSoft: "oklch(94.5% .028 256)", accentInk: "oklch(99% .005 256)",
  g: "oklch(22% .016 260)", gAccent: "oklch(72% .17 254)", onG: "oklch(92% .006 256)", onG2: "oklch(70% .012 256)", onG3: "oklch(56% .012 256)",
  neg: "oklch(54% .18 27)", negSoft: "oklch(95% .025 27)", warn: "oklch(62% .13 75)", warnSoft: "oklch(95% .03 80)",
};
export const F = { display: "var(--font-display), ui-sans-serif, system-ui, sans-serif", sans: "var(--font-sans), ui-sans-serif, system-ui, sans-serif", mono: "var(--font-mono), ui-monospace, monospace" };
export const eyebrow: CSSProperties = { fontFamily: F.mono, fontSize: ".6875rem", letterSpacing: ".07em", textTransform: "uppercase", fontWeight: 500, color: K.ink3 };
export const bigNum: CSSProperties = { fontFamily: F.display, fontWeight: 600, fontSize: "1.625rem", letterSpacing: "-.02em", lineHeight: 1.05, fontVariantNumeric: "tabular-nums" };
export const dots: CSSProperties = { flex: 1, borderBottom: `1px dotted ${K.onG3}`, transform: "translateY(-3px)", minWidth: "1rem" };
export const smallBtn = (enabled: boolean): CSSProperties => ({ minHeight: 30, padding: "0 .625rem", borderRadius: 4, background: K.paper, fontFamily: F.mono, fontSize: ".6875rem", letterSpacing: ".04em", whiteSpace: "nowrap", flex: "none", border: `1px solid ${K.rule2}`, color: enabled ? K.ink2 : K.rule2, cursor: enabled ? "pointer" : "default" });

export const VN: Record<Verdict, string> = { invoiced: "Already billed", missed_billable: "Done, not billed", covered: "Covered, no charge", not_billable: "No charge" };
export const ST: Record<Status, [string, string]> = {
  counted: ["add to invoice", K.accent], person: ["your call", K.warn], rejected: ["blocked", K.neg],
  invoiced: ["already billed", K.ink3], covered: ["in the plan", K.ink3], notbill: ["no charge", K.ink3],
};
export const RATE = Object.fromEntries(RATE_CARD.map((l) => [l.code, l]));

export const pct = (v: number) => `${Math.round(v * 100)}%`;
export const money = (cents: number) => `$${Math.round(cents / 100).toLocaleString("en-US")}`;
export const day = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "2-digit", timeZone: "UTC" });
export const UNIT: Record<string, [string, string]> = { lb: ["lb", "lb"], hour: ["hour", "hours"], "technician per visit": ["technician", "technicians"] };
/** The line Tally would add, as a person would write it: "Refrigerant R-410A, 3 lb". */
export const draftText = (it: Item) => {
  if (!it.code) return "";
  const line = RATE[it.code]!;
  const unit = UNIT[line.unit];
  return unit && (it.quantity > 1 || line.unit === "lb") ? `${line.description}, ${it.quantity} ${unit[it.quantity > 1 ? 1 : 0]}` : line.description;
};
export const labelOf = (it: Item) => (it.code ? RATE[it.code]!.description : NON_BILLABLE_LABEL[it.nonBillable as NonBillableKind]);
export const clauseText = (c: string) => `Agreement §${c} · ${CLAUSE_TITLES[c] ?? ""}`;

export function statusOf(it: Item, t: Thresholds): Status {
  const d = decideItem(it, judgmentOf(it), t, it.alreadyInvoiced);
  if (d.outcome === "recovered") return "counted";
  if (d.outcome === "human") return "person";
  if (d.outcome === "guardrail") return "rejected";
  if (d.verdict === "invoiced" || (d.verdict === "missed_billable" && it.alreadyInvoiced)) return "invoiced";
  if (d.verdict === "covered") return "covered";
  return "notbill";
}
export const judgmentOf = (it: Item): Judgment => ({ verdict: it.verdict, covered: it.covered, unsupported: it.unsupported, evidence: it.evidence, inputTokens: 0, latencyMs: 0 });
