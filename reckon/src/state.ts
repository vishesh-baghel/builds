import type { ChaseAction } from "./types";

/**
 * Chase state and the work a person is left with.
 *
 * Deliberately small. This build has no ledger write path in either direction: an invoice is
 * never marked paid, and nothing here talks to an accounting system. What it records is whether
 * *chasing* continues, and what a human has been handed.
 */

export type ChaseStatus =
  /** The default. Whatever tool the firm already runs keeps sending. */
  | "chasing"
  /** Chasing is held, until a promised date, or until a person resolves something. */
  | "paused"
  /** Chasing this invoice has stopped. */
  | "stopped"
  /** This contact asked not to be contacted. Stronger than stopped, and never auto-reversed. */
  | "suppressed";

export const STATUS_RANK: Readonly<Record<ChaseStatus, number>> = {
  chasing: 0, paused: 1, stopped: 2, suppressed: 3,
};

export interface ChaseState {
  readonly invoice: string;
  readonly status: ChaseStatus;
  /** Set when a promise fixes a date. Null when paused without one. */
  readonly resumeOn: string | null;
  readonly because: string;
  /** The reply that put the invoice here, so a handoff can carry it. */
  readonly replyId: string | null;
}

export const WORK_ITEM_KINDS = [
  "reconciliation",
  "partial_payment",
  "promise",
  "overdue_promise",
  "contact_correction",
  "stop_contacting",
] as const;

export type WorkItemKind = (typeof WORK_ITEM_KINDS)[number];

export interface WorkItem {
  /** `<replyId>:<kind>`. Stable, so a repeat run recognises its own work. */
  readonly id: string;
  readonly kind: WorkItemKind;
  readonly invoice: string;
  readonly replyId: string;
  /** Composed in code from the class set and the rule that fired. Never model-written. */
  readonly summary: string;
  readonly detail: Readonly<Record<string, unknown>>;
}

/**
 * Per-run store. In-memory here because that is what the tests and the scorecard need; the
 * deploy supplies a persistent `IdempotencyStore` alongside it so a retry across instances
 * cannot double-apply.
 */
export class ChaseStore {
  private readonly states = new Map<string, ChaseState>();
  private readonly items: WorkItem[] = [];

  chaseState(invoice: string): ChaseState {
    return this.states.get(invoice) ?? {
      invoice, status: "chasing", resumeOn: null, because: "no reply has changed this", replyId: null,
    };
  }

  /**
   * Chase state only ever gets stronger within a run, so a decision carrying two actions lands
   * the same way whatever order they run in, a dispute that stops the chase is not quietly
   * downgraded to a pause because the same reply also asked a question. Asking not to be
   * contacted is the strongest state and is never walked back automatically.
   */
  setStatus(next: Omit<ChaseState, "resumeOn"> & { resumeOn?: string | null }): void {
    const current = this.chaseState(next.invoice);
    if (STATUS_RANK[next.status] < STATUS_RANK[current.status]) return;
    this.states.set(next.invoice, { ...next, resumeOn: next.resumeOn ?? null });
  }

  /**
   * The one deliberate downgrade: a promise whose date arrived without payment goes back to
   * chasing. Separate from `setStatus` so it cannot happen by accident.
   */
  resumeChasing(invoice: string, because: string): void {
    const current = this.chaseState(invoice);
    if (current.status !== "paused") return;
    this.states.set(invoice, { ...current, status: "chasing", resumeOn: null, because });
  }

  addWorkItem(item: WorkItem): void {
    if (this.items.some((existing) => existing.id === item.id)) return;
    this.items.push(item);
  }

  workItems(): readonly WorkItem[] {
    return this.items;
  }

  itemsFor(replyId: string): readonly WorkItem[] {
    return this.items.filter((item) => item.replyId === replyId);
  }

  /** Every invoice paused with a date, for the promise watchdog to sweep. */
  paused(): readonly ChaseState[] {
    return [...this.states.values()].filter((s) => s.status === "paused" && s.resumeOn !== null);
  }
}

/** Which work item, if any, an action creates. Actions not listed here only move chase state. */
export const ITEM_FOR_ACTION: Partial<Record<ChaseAction, WorkItemKind>> = {
  open_reconciliation: "reconciliation",
  record_partial: "partial_payment",
  record_promise: "promise",
  flag_broken_promise: "overdue_promise",
  open_contact_correction: "contact_correction",
  stop_contacting: "stop_contacting",
};
