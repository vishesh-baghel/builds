/** The workflow's own vocabulary. Both enums are closed, and that is load-bearing. */

/**
 * The seven classes, fixed by the committed fixture set. The set is the measurement
 * instrument: adding a class here without re-labelling all 72 replies invalidates the number.
 */
export const REPLY_CLASSES = [
  "claimed_payment",
  "promise_to_pay",
  "partial",
  "dispute",
  "question",
  "wrong_contact",
  "noise",
] as const;

export type ReplyClass = (typeof REPLY_CLASSES)[number];

const CLASS_SET: ReadonlySet<string> = new Set(REPLY_CLASSES);
export const isReplyClass = (value: unknown): value is ReplyClass =>
  typeof value === "string" && CLASS_SET.has(value);

/**
 * Every side effect this build can have. Closed by construction, which is the point: reply
 * text is untrusted, and adversarial steering is a documented weakness of the model. Nothing a
 * reply says can widen this list, because widening it means editing this file.
 *
 * Note what is absent and stays absent: there is no action that marks an invoice paid, and no
 * action that sends anything. A claimed payment opens a reconciliation item for a human; it
 * never closes the invoice.
 */
export const CHASE_ACTIONS = [
  "pause_chase",
  "stop_chase",
  "stop_contacting",
  "open_reconciliation",
  "record_partial",
  "record_promise",
  "flag_broken_promise",
  "open_contact_correction",
] as const;

export type ChaseAction = (typeof CHASE_ACTIONS)[number];

/** One row of the A/R Aging Detail export. */
export interface Invoice {
  readonly invoiceNo: string;
  readonly customer: string;
  readonly contactEmail: string;
  readonly invoiceDate: string;
  readonly dueDate: string;
  readonly terms: string;
  readonly amount: number;
  readonly openBalance: number;
  readonly daysPastDue: number;
  readonly agingBucket: string;
}

/** One hand-labelled debtor reply. */
export interface Reply {
  readonly id: string;
  readonly invoice: string;
  readonly from: string;
  readonly subject: string;
  readonly body: string;
  /** The primary class — what the system is scored against. */
  readonly label: ReplyClass;
  /** Secondary classes that genuinely also apply. */
  readonly also: readonly ReplyClass[];
  /** A deliberate boundary case. Scored separately from the ordinary subset. */
  readonly hard: boolean;
  readonly note: string;
}
