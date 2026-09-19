import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Invoice, Reply } from "../types.js";
import { FixtureError, INVOICE_COLUMNS, parseInvoiceRow, parseReplyRecord } from "./schema.js";

/**
 * The committed fixture set, loaded and validated.
 *
 * The CSV and the JSONL are the human-authored source of truth — they are the measurement
 * instrument, frozen once a number is published. Parsing is deliberately strict: anything the
 * validators reject fails a test rather than reaching a demo.
 */

/**
 * Splits a CSV with no quoting.
 *
 * The committed export has no quoted fields and no embedded commas, and the field-count check
 * in `parseInvoiceRow` is what keeps that assumption honest: the day a customer name contains
 * a comma, the row fails to parse and says so, rather than silently shifting every column.
 */
export function parseAgingCsv(text: string): Invoice[] {
  const lines = text.split("\n").map((line) => line.replace(/\r$/, "")).filter((line) => line !== "");
  const header = lines.shift();
  if (header === undefined) throw new FixtureError("ar-aging.csv", "file", "is empty");

  const columns = header.split(",").map((c) => c.trim());
  if (columns.join("|") !== INVOICE_COLUMNS.join("|")) {
    throw new FixtureError("ar-aging.csv", "header", `expected ${INVOICE_COLUMNS.join(",")}`);
  }

  const invoices = lines.map((line, index) => parseInvoiceRow(line.split(","), `row ${index + 2}`));

  const seen = new Set<string>();
  for (const invoice of invoices) {
    if (seen.has(invoice.invoiceNo)) {
      throw new FixtureError("ar-aging.csv", invoice.invoiceNo, "duplicate invoice number");
    }
    seen.add(invoice.invoiceNo);
  }
  return invoices;
}

export function parseRepliesJsonl(text: string, source = "replies.jsonl"): Reply[] {
  const replies: Reply[] = [];
  const seen = new Set<string>();

  text.split("\n").forEach((line, index) => {
    if (line.trim() === "") return;
    const where = `line ${index + 1}`;

    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch (error) {
      throw new FixtureError(source, where, `not valid JSON: ${(error as Error).message}`);
    }

    const reply = parseReplyRecord(raw, where, source);
    if (seen.has(reply.id)) throw new FixtureError(source, where, `duplicate reply id ${reply.id}`);
    seen.add(reply.id);
    replies.push(reply);
  });

  return replies;
}

export interface FixtureSet {
  readonly invoices: readonly Invoice[];
  readonly replies: readonly Reply[];
  /** Invoice number to row. Every reply is guaranteed to resolve. */
  readonly byInvoice: ReadonlyMap<string, Invoice>;
}

/** Joins the two files and fails if any reply names an invoice the ledger does not carry. */
export function buildFixtureSet(invoices: readonly Invoice[], replies: readonly Reply[]): FixtureSet {
  const byInvoice = new Map(invoices.map((invoice) => [invoice.invoiceNo, invoice]));
  for (const reply of replies) {
    if (!byInvoice.has(reply.invoice)) {
      throw new FixtureError("replies.jsonl", reply.id, `names invoice ${reply.invoice}, which is not in the ledger`);
    }
  }
  return { invoices, replies, byInvoice };
}

const fixturePath = (name: string): string =>
  fileURLToPath(new URL(`../../fixtures/${name}`, import.meta.url));

const read = (name: string): string => readFileSync(fixturePath(name), "utf8");

/** Tests and scripts read from disk. The app imports the generated snapshot instead. */
export function loadFixtures(): FixtureSet {
  return buildFixtureSet(parseAgingCsv(read("ar-aging.csv")), parseRepliesJsonl(read("replies.jsonl")));
}

/**
 * The adversarial inputs, deliberately outside the scored 72. They share the reply shape so
 * they can run through the same pipeline, but they never enter `replies.jsonl` — mixing them
 * into the frozen set would change what the published number measures.
 */
export function loadAdversarial(): Reply[] {
  return parseRepliesJsonl(read("adversarial.jsonl"), "adversarial.jsonl");
}
