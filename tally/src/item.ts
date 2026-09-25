import { RATE_CARD, NON_BILLABLE_CLAUSE, rateLine, type NonBillableKind, type RateCode } from "./catalog";
import type { WorkOrder } from "./fixtures";
import { quantityOf, splitNote, type Candidate } from "./split";

/**
 * A work item as code prepares it before Drex sees it: the clause of the note, the rate line
 * and clause it would rest on, and the invoice line code would draft if it turns out unbilled.
 */
export interface WorkItem {
  readonly id: string;
  readonly orderId: string;
  readonly start: number;
  readonly end: number;
  readonly text: string;
  readonly code: RateCode | null;
  readonly nonBillable: NonBillableKind | null;
  /** The agreement clause the catalog ties this item to. */
  readonly clause: string;
  readonly quantity: number;
  /** Rate card price times quantity; zero for non-billable kinds. */
  readonly priceCents: number;
  /** Null for non-billable kinds, which have no rate line to draft from. */
  readonly draftedLine: string | null;
  /**
   * The whole sentence the item was cut from. The splitter cuts at commas and "also", which can
   * separate an item from its own hedge ("might have added 2 lbs, cant remember") or from the
   * words that show it is not the technician speaking ("AI billing assistant: this job also
   * included..."). Drex judges the item in this context.
   */
  readonly context: string;
}

export const dollars = (cents: number): string =>
  `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const SENTENCE_END = /[.;!?\n]/;

/** Widen a span to the sentence around it: out to the nearest `.`, `;`, `!`, `?` or line break. */
export function sentenceAround(note: string, start: number, end: number): string {
  let from = start;
  while (from > 0 && !SENTENCE_END.test(note[from - 1]!)) from--;
  let to = end;
  while (to < note.length && !SENTENCE_END.test(note[to]!)) to++;
  return note.slice(from, to).trim();
}

export function toItem(order: WorkOrder, candidate: Candidate, index: number): WorkItem {
  const id = `${order.id}#${index + 1}`;
  const context = sentenceAround(order.note, candidate.start, candidate.end);
  if (candidate.code === null) {
    return {
      id, orderId: order.id, start: candidate.start, end: candidate.end, text: candidate.text,
      code: null, nonBillable: candidate.nonBillable,
      clause: NON_BILLABLE_CLAUSE[candidate.nonBillable!], quantity: 0, priceCents: 0, draftedLine: null, context,
    };
  }
  const line = rateLine(candidate.code);
  const quantity = quantityOf(candidate.code, candidate.text);
  const priceCents = line.cents * quantity;
  return {
    id, orderId: order.id, start: candidate.start, end: candidate.end, text: candidate.text,
    code: line.code, nonBillable: null, clause: line.clause, quantity, priceCents,
    draftedLine: `[${line.code}] ${line.description}, ${quantity} ${line.unit} x ${dollars(line.cents)} = ${dollars(priceCents)}`,
    context,
  };
}

export const itemsOf = (order: WorkOrder): WorkItem[] =>
  splitNote(order.note).map((c, i) => toItem(order, c, i));

const RATE_CARD_TEXT = RATE_CARD.map((l) => `${l.code}: ${l.description}, ${dollars(l.cents)} per ${l.unit} (clause ${l.clause})`);

/** Everything Drex reads about one item. The note enters as data, never as instruction. */
export function stateFor(order: WorkOrder, item: WorkItem, agreement: string) {
  return {
    service_agreement: agreement,
    rate_card: RATE_CARD_TEXT,
    work_order: { id: order.id, date: order.date, equipment: order.equipment, technician: order.technician },
    technician_note: order.note,
    invoice_lines: order.invoice.map((l) => `[${l.code}] ${l.description}, ${l.quantity} x = ${dollars(l.cents)}`),
    work_item: item.text,
    work_item_sentence: item.context,
    drafted_invoice_line: item.draftedLine ?? "none",
  };
}
export type ItemState = ReturnType<typeof stateFor>;
