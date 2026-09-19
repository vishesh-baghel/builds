import { daysBetween, LEDGER_AS_OF, parseDay } from "../clock.js";
import { isReplyClass, type Invoice, type Reply, type ReplyClass } from "../types.js";

/**
 * Validation at the trust boundary between the committed fixtures and everything downstream.
 *
 * Hand-rolled rather than a schema library: two shapes, nineteen fields between them, and the
 * repo rule is stdlib before a dependency. What matters is that a malformed fixture fails a
 * test, loudly and with the offending row named, rather than reaching a demo.
 */
export class FixtureError extends Error {
  constructor(source: string, where: string, problem: string) {
    super(`${source} ${where}: ${problem}`);
    this.name = "FixtureError";
  }
}

export const INVOICE_COLUMNS = [
  "Invoice No", "Customer", "Contact Email", "Invoice Date", "Due Date",
  "Terms", "Amount", "Open Balance", "Days Past Due", "Aging Bucket",
] as const;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function requireText(source: string, where: string, field: string, value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new FixtureError(source, where, `${field} must be a non-empty string`);
  }
  return value;
}

function requireMoney(source: string, where: string, field: string, raw: string): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new FixtureError(source, where, `${field} must be a non-negative number, got ${raw}`);
  }
  return value;
}

function requireDay(source: string, where: string, field: string, raw: string): string {
  if (!DAY.test(raw)) throw new FixtureError(source, where, `${field} must be YYYY-MM-DD, got ${raw}`);
  parseDay(raw);
  return raw;
}

/**
 * Builds one invoice from its cells, and re-derives `Days Past Due` from `LEDGER_AS_OF` rather
 * than trusting the column. The committed figure and the computed one must agree: that is what
 * makes the fixture set reproducible by a stranger instead of a set of numbers to take on faith.
 */
export function parseInvoiceRow(cells: readonly string[], where: string): Invoice {
  const source = "ar-aging.csv";
  if (cells.length !== INVOICE_COLUMNS.length) {
    throw new FixtureError(source, where, `expected ${INVOICE_COLUMNS.length} cells, got ${cells.length}`);
  }
  const cell = (index: number): string => {
    const value = cells[index];
    if (value === undefined) throw new FixtureError(source, where, `missing cell ${index}`);
    return value.trim();
  };

  const dueDate = requireDay(source, where, "Due Date", cell(4));
  const stated = Number(cell(8));
  const computed = daysBetween(dueDate, LEDGER_AS_OF);
  if (stated !== computed) {
    throw new FixtureError(
      source, where,
      `Days Past Due is ${stated} but ${dueDate} is ${computed} days before ${LEDGER_AS_OF}`,
    );
  }

  const amount = requireMoney(source, where, "Amount", cell(6));
  const openBalance = requireMoney(source, where, "Open Balance", cell(7));
  if (openBalance > amount) {
    throw new FixtureError(source, where, `Open Balance ${openBalance} exceeds Amount ${amount}`);
  }

  return {
    invoiceNo: requireText(source, where, "Invoice No", cell(0)),
    customer: requireText(source, where, "Customer", cell(1)),
    contactEmail: requireText(source, where, "Contact Email", cell(2)),
    invoiceDate: requireDay(source, where, "Invoice Date", cell(3)),
    dueDate,
    terms: requireText(source, where, "Terms", cell(5)),
    amount,
    openBalance,
    daysPastDue: computed,
    agingBucket: requireText(source, where, "Aging Bucket", cell(9)),
  };
}

export function parseReplyRecord(raw: unknown, where: string, source = "replies.jsonl"): Reply {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new FixtureError(source, where, "must be a JSON object");
  }
  const record = raw as Record<string, unknown>;

  const label = record["label"];
  if (!isReplyClass(label)) {
    throw new FixtureError(source, where, `label must be one of the seven classes, got ${String(label)}`);
  }

  const alsoRaw = record["also"];
  if (!Array.isArray(alsoRaw)) throw new FixtureError(source, where, "also must be an array");
  const also: ReplyClass[] = [];
  for (const entry of alsoRaw) {
    if (!isReplyClass(entry)) {
      throw new FixtureError(source, where, `also contains ${String(entry)}, which is not a class`);
    }
    if (entry === label) throw new FixtureError(source, where, `also repeats the primary label ${label}`);
    also.push(entry);
  }

  const hard = record["hard"];
  if (typeof hard !== "boolean") throw new FixtureError(source, where, "hard must be a boolean");

  const note = record["note"];
  if (typeof note !== "string") throw new FixtureError(source, where, "note must be a string");

  return {
    id: requireText(source, where, "id", record["id"]),
    invoice: requireText(source, where, "invoice", record["invoice"]),
    from: requireText(source, where, "from", record["from"]),
    subject: requireText(source, where, "subject", record["subject"]),
    body: requireText(source, where, "body", record["body"]),
    label,
    also,
    hard,
    note,
  };
}
