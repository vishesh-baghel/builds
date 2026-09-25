import { TRIGGERS, type NonBillableKind, type RateCode } from "./catalog";

/**
 * Rule-based item splitting. Code, not the model, decides where the work items in a note are.
 *
 * A note is cut into clauses on sentence punctuation, line breaks, commas, `+`, `&`, "and",
 * "also" and "then". A clause becomes a candidate item when one of the catalog's triggers
 * matches it; clauses that match nothing ("all good", "cust happy") are dropped as filler.
 */
export interface Candidate {
  /** Character offsets into the note, end exclusive. */
  readonly start: number;
  readonly end: number;
  readonly text: string;
  readonly code: RateCode | null;
  readonly nonBillable: NonBillableKind | null;
}

const SEPARATOR = /[.;!?\n]+|,\s*|\s\+\s|\s&\s|\s(?:and|also|then)\s/gi;

export function splitNote(note: string): Candidate[] {
  const clauses: { start: number; end: number }[] = [];
  let cursor = 0;
  for (const match of note.matchAll(SEPARATOR)) {
    clauses.push({ start: cursor, end: match.index });
    cursor = match.index + match[0].length;
  }
  clauses.push({ start: cursor, end: note.length });

  const candidates: Candidate[] = [];
  for (const { start, end } of clauses) {
    const raw = note.slice(start, end);
    const text = raw.trim();
    if (text === "") continue;
    const trigger = TRIGGERS.find((t) => t.pattern.test(text));
    if (!trigger) continue;
    const offset = start + raw.indexOf(text);
    candidates.push({
      start: offset,
      end: offset + text.length,
      text,
      code: trigger.kind === "rate" ? trigger.code : null,
      nonBillable: trigger.kind === "non_billable" ? trigger.what : null,
    });
  }
  return candidates;
}

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, couple: 2, "couple of": 2, three: 3, four: 4, five: 5,
};

const toNumber = (token: string | undefined): number | null => {
  if (token === undefined) return null;
  const n = Number(token);
  if (Number.isInteger(n) && n > 0) return n;
  return NUMBER_WORDS[token.toLowerCase()] ?? null;
};

const NUM = String.raw`(\d+|an?|one|two|three|four|five|couple(?: of)?)`;
const QUANTITY: Partial<Record<RateCode, RegExp>> = {
  REFRIG: new RegExp(String.raw`\b${NUM}\s*(?:lbs?|pounds?)\b`, "i"),
  "TECH-ADD": new RegExp(String.raw`\b${NUM}\s+(?:extra\s+)?(?:guys?|techs?|hands|men)\b`, "i"),
  "LABOR-HR": new RegExp(String.raw`\b${NUM}\s*(?:extra\s+|more\s+)?(?:hrs?|hours?)\b`, "i"),
};

/** How many units of the rate line the item's text states. One when it states none. */
export function quantityOf(code: RateCode, text: string): number {
  const pattern = QUANTITY[code];
  if (!pattern) return 1;
  return toNumber(pattern.exec(text)?.[1]) ?? 1;
}
