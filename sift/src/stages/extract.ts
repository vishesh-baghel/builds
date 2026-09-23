import { days } from "../clock";
import type { Project, Sor } from "../fixtures/schema";
import type { Message } from "../types";

/**
 * The extract stage's code: the joins, the date arithmetic and the lookups. No model here.
 *
 * A deadline is only ever read, never guessed. It comes from, in order: an open RFI or submittal the
 * message names (the log carries the contractual window); a "within N days" window counted from the
 * day the message arrived; or an explicit dated phrase such as "by October 2" or "no later than
 * Friday". Anything else, including "promptly", yields no date, and a clock with no date is handed
 * to a person to set.
 */

export interface Deadline {
  readonly date: string;
  readonly how: string;
  /** Where it came from: an RFI or submittal log, a "within N days" window, or a dated phrase. */
  readonly source: "rfi" | "submittal" | "window" | "dated";
}

export interface Facts {
  readonly project: Project | null;
  readonly deadline: Deadline | null;
  /** The message names an open RFI or submittal, so the log itself corroborates a clock. */
  readonly inLog: boolean;
  /** The message names an RFI or submittal the logs hold, open or closed. */
  readonly logged: boolean;
  /** A repeat ask: a threaded reply, or a sender saying they are asking again. */
  readonly repeat: boolean;
}

const MONTHS: Readonly<Record<string, number>> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;

const iso = (t: number): string => new Date(t).toISOString().slice(0, 10);
const addDays = (day: string, n: number): string => iso(Date.parse(day) + n * 864e5);
const weekday = (day: string): number => new Date(Date.parse(day)).getUTCDay();

function addBusinessDays(day: string, n: number): string {
  let current = day;
  let left = n;
  while (left > 0) {
    current = addDays(current, 1);
    const wd = weekday(current);
    if (wd !== 0 && wd !== 6) left--;
  }
  return current;
}

const WITHIN = /\bwithin\s+(?:[a-z-]+\s+)?\(?(\d{1,3})\)?\s+(calendar\s+|business\s+|working\s+|court\s+)?days?\b/i;
const KEY = String.raw`(?:by|due(?:\s+(?:on|by))?|no later than|on or before|before|deadline(?:\s+(?:is|of))?)`;
const DATED = new RegExp(
  String.raw`\b${KEY}\s+(?:(?:mon|tues|wednes|thurs|fri|satur|sun)day,?\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sept|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b`,
  "i");
const WEEKDAY = new RegExp(String.raw`\b${KEY}\s+(?:this\s+|next\s+)?(${WEEKDAYS.join("|")})\b`, "i");

/** The one deadline a message carries, or null. `receivedAt` is `YYYY-MM-DD HH:MM`. */
export function parseDeadline(text: string, receivedAt: string, sor: Sor): Deadline | null {
  const received = receivedAt.slice(0, 10);

  for (const r of sor.rfis) {
    if (r.status === "open" && text.includes(r.number)) return { date: r.due, how: `${r.number} response window in the RFI log`, source: "rfi" };
  }
  for (const s of sor.submittals) {
    if (s.status !== "approved" && text.includes(s.number)) return { date: s.reviewDue, how: `submittal ${s.number} review due in the log`, source: "submittal" };
  }

  const within = WITHIN.exec(text);
  if (within?.[1]) {
    const n = Number(within[1]);
    const business = (within[2] ?? "").trim() !== "" && !/calendar/i.test(within[2] ?? "");
    return business
      ? { date: addBusinessDays(received, n), how: `${n} business days from ${received}`, source: "window" }
      : { date: addDays(received, n), how: `${n} days from ${received}`, source: "window" };
  }

  const dated = DATED.exec(text);
  if (dated?.[1] && dated[2]) {
    const month = MONTHS[dated[1].toLowerCase()];
    if (month !== undefined) {
      let year = Number(received.slice(0, 4));
      let date = `${year}-${String(month).padStart(2, "0")}-${String(Number(dated[2])).padStart(2, "0")}`;
      // A date well behind the message is next year's: "by January 31" written in September.
      if (days(date, received) > 30) {
        year += 1;
        date = `${year}${date.slice(4)}`;
      }
      if (!Number.isNaN(Date.parse(date))) return { date, how: `stated as "${dated[0].trim()}"`, source: "dated" };
    }
  }

  const named = WEEKDAY.exec(text);
  if (named?.[1]) {
    const target = WEEKDAYS.indexOf(named[1].toLowerCase() as (typeof WEEKDAYS)[number]);
    let date = addDays(received, 1);
    while (weekday(date) !== target) date = addDays(date, 1);
    return { date, how: `stated as "${named[0].trim()}", the next ${named[1]} after ${received}`, source: "dated" };
  }

  return null;
}

/**
 * The project a message is about: a logged RFI, submittal or permit number first, then the
 * project's name as written, then the sender's own project in the contact list.
 */
export function matchProject(sor: Sor, text: string, email = ""): Project | null {
  const byCode = (code: string): Project | null => sor.projects.find((p) => p.code === code) ?? null;
  for (const r of sor.rfis) if (text.includes(r.number)) return byCode(r.project);
  for (const s of sor.submittals) if (text.includes(s.number)) return byCode(s.project);
  for (const p of sor.projects) if (p.permits.some((n) => text.includes(n))) return p;

  const lower = text.toLowerCase();
  let best: { project: Project; at: number } | null = null;
  for (const p of sor.projects) {
    for (const name of [p.name, ...p.aliases]) {
      const at = lower.indexOf(name.toLowerCase());
      if (at >= 0 && (best === null || at < best.at)) best = { project: p, at };
    }
  }
  if (best) return best.project;

  const contact = sor.contacts.find((c) => c.email.toLowerCase() === email.toLowerCase());
  return contact?.project ? byCode(contact.project) : null;
}

const REPEAT = /\b(again|following up|second time|still (?:have not|haven't|waiting)|chasing)\b/i;

export function factsFor(message: Pick<Message, "subject" | "body" | "email" | "received">, sor: Sor): Facts {
  const text = `${message.subject}\n${message.body}`;
  return {
    project: matchProject(sor, text, message.email),
    deadline: parseDeadline(text, message.received, sor),
    inLog: sor.rfis.some((r) => r.status === "open" && text.includes(r.number))
      || sor.submittals.some((s) => s.status !== "approved" && text.includes(s.number)),
    logged: sor.rfis.some((r) => text.includes(r.number)) || sor.submittals.some((s) => text.includes(s.number)),
    repeat: /^re:\s*re:/i.test(message.subject) || REPEAT.test(message.body),
  };
}
