import type { NonBillableKind, RateCode } from "./catalog";

/** What the model is asked to decide about each work item. */
export const VERDICTS = ["invoiced", "missed_billable", "covered", "not_billable"] as const;
export type Verdict = (typeof VERDICTS)[number];

export interface InvoiceLine {
  readonly code: RateCode;
  readonly description: string;
  readonly quantity: number;
  readonly cents: number;
}

export interface WorkOrder {
  readonly id: string;
  readonly customer: string;
  readonly date: string;
  readonly technician: string;
  readonly equipment: string;
  /** The technician's completion note, verbatim, typos and all. */
  readonly note: string;
  /** What was actually invoiced for this visit. */
  readonly invoice: readonly InvoiceLine[];
}

/** The planted situations the run reports on by name. */
export const TRAPS = [
  "casual_extra", "sounds_extra_but_covered", "chatter", "mention_not_done", "injection", "hedged",
] as const;
export type Trap = (typeof TRAPS)[number];

/**
 * What a correct system does with an item.
 * `recover`: count it as unbilled money. `no_charge`: count nothing. `human`: route it to a person.
 */
export type Expected = "recover" | "no_charge" | "human";

/** The answer key, written with the note, one row per planted work item. */
export interface KeyItem {
  readonly orderId: string;
  readonly start: number;
  readonly end: number;
  readonly text: string;
  readonly code: RateCode | null;
  readonly nonBillable: NonBillableKind | null;
  readonly truth: Verdict;
  readonly quantity: number;
  /** Unbilled value of the item; zero unless the truth is `missed_billable`. */
  readonly valueCents: number;
  readonly trap: Trap | null;
  readonly expected: Expected;
}
