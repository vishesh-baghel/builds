import { factsFor } from "../stages/extract";
import type { Firm, Message } from "../types";
import { FixtureError, type Contact, type Instrument, type LabelledMessage, type Project, type RfiRow, type SubmittalRow } from "./schema";
import { parseLabelled } from "./schema";

/**
 * Parsing and joining the instrument. No filesystem access in this file, so the snapshot the app
 * imports and the files the scorecard reads go through the same checks.
 *
 * The CSVs and the JSONL are the human-authored source of truth, frozen once a number is published.
 * Anything the validators reject fails a test rather than reaching a scorecard.
 */

/**
 * Splits a CSV with no quoting. The committed files hold no quoted fields and no embedded commas,
 * and the per-row cell count keeps that assumption honest: the day a field gains a comma, that row
 * fails to parse and says so, rather than silently shifting every column after it.
 */
export function parseCsv<C extends readonly string[]>(text: string, columns: C, source: string): Readonly<Record<C[number], string>>[] {
  const lines = text.split("\n").map((l) => l.replace(/\r$/, "")).filter((l) => l !== "");
  const header = lines.shift();
  if (header === undefined) throw new FixtureError(source, "file", "is empty");
  if (header.split(",").map((c) => c.trim()).join("|") !== columns.join("|")) {
    throw new FixtureError(source, "header", `expected ${columns.join(",")}`);
  }
  return lines.map((line, i) => {
    const cells = line.split(",");
    if (cells.length !== columns.length) throw new FixtureError(source, `row ${i + 2}`, `expected ${columns.length} cells, got ${cells.length}`);
    return Object.fromEntries(columns.map((c, j) => [c, (cells[j] ?? "").trim()])) as Record<C[number], string>;
  });
}

export function parseInbox(text: string, source = "inbox.jsonl"): LabelledMessage[] {
  const out: LabelledMessage[] = [];
  text.split("\n").forEach((line, index) => {
    if (line.trim() === "") return;
    const where = `line ${index + 1}`;
    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch (error) {
      throw new FixtureError(source, where, `not valid JSON: ${(error as Error).message}`);
    }
    out.push(parseLabelled(raw, where, source));
  });
  return out;
}

/** The message as the system receives it: text and metadata only, no label reaches the pipeline. */
export const toMessage = (m: LabelledMessage): Message => ({
  id: m.id, from: m.from, email: m.email, subject: m.subject, body: m.body, received: m.receivedAt, p: {}, clock: 0,
});

const unique = (source: string, keys: readonly string[], what: string): void => {
  const seen = new Set<string>();
  for (const k of keys) {
    if (seen.has(k)) throw new FixtureError(source, k, `duplicate ${what}`);
    seen.add(k);
  }
};

export interface InstrumentParts {
  readonly projects: readonly Project[];
  readonly rfis: readonly RfiRow[];
  readonly submittals: readonly SubmittalRow[];
  readonly contacts: readonly Contact[];
  readonly inbox: readonly LabelledMessage[];
}

/**
 * Joins the five files and checks every reference: log rows name real projects, labels name real
 * classes and real staff, and on every clocked row the deadline code derives from the message and
 * the logs, counted from its own received date, equals the committed `deadline`. That last check is
 * what makes the instrument reproducible by a stranger rather than a set of dates to take on faith.
 */
export function buildInstrument(parts: InstrumentParts, firm: Firm): Instrument {
  const classes = new Set(firm.classes.map((c) => c[0]));
  const staff = new Set(firm.people.map((p) => p.name));
  const codes = new Set(parts.projects.map((p) => p.code));

  unique("projects.csv", parts.projects.map((p) => p.code), "project code");
  unique("rfi-log.csv", parts.rfis.map((r) => r.number), "RFI number");
  unique("submittal-log.csv", parts.submittals.map((s) => s.number), "submittal number");
  unique("contacts.csv", parts.contacts.map((c) => c.email), "contact email");
  unique("inbox.jsonl", parts.inbox.map((m) => m.id), "message id");

  for (const p of parts.projects) {
    for (const person of [p.coordinator, p.lead, p.reviewer]) {
      if (!staff.has(person)) throw new FixtureError("projects.csv", p.code, `${person} is not on the staff list`);
    }
    for (const t of p.next.blocks) if (!classes.has(t)) throw new FixtureError("projects.csv", p.code, `next_blocks names ${t}, which is not a class`);
  }
  for (const r of parts.rfis) if (!codes.has(r.project)) throw new FixtureError("rfi-log.csv", r.number, `names project ${r.project}, which is not in projects.csv`);
  for (const s of parts.submittals) if (!codes.has(s.project)) throw new FixtureError("submittal-log.csv", s.number, `names project ${s.project}, which is not in projects.csv`);
  for (const c of parts.contacts) if (c.project !== null && !codes.has(c.project)) throw new FixtureError("contacts.csv", c.email, `names project ${c.project}, which is not in projects.csv`);

  const sor = { projects: parts.projects, rfis: parts.rfis, submittals: parts.submittals, contacts: parts.contacts };
  for (const m of parts.inbox) {
    const where = m.id;
    if (new Set(m.topics).size !== m.topics.length) throw new FixtureError("inbox.jsonl", where, "topics repeats a class");
    for (const t of m.topics) if (!classes.has(t)) throw new FixtureError("inbox.jsonl", where, `topic ${t} is not a class`);
    for (const r of m.route) if (!staff.has(r)) throw new FixtureError("inbox.jsonl", where, `route names ${r}, who is not on the staff list`);
    if (m.project !== null && !codes.has(m.project)) throw new FixtureError("inbox.jsonl", where, `project ${m.project} is not in projects.csv`);
    if (m.clocked) {
      const derived = factsFor(toMessage(m), sor).deadline?.date ?? null;
      if (derived !== m.deadline) {
        throw new FixtureError("inbox.jsonl", where, `deadline is ${String(m.deadline)} but code derives ${String(derived)} from the message and the logs`);
      }
    }
  }

  return { ...sor, inbox: parts.inbox };
}
