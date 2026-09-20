import { addDays, formatDay, LEDGER_AS_OF, parseDay } from "../clock";

/**
 * Turning what the model saw into a date, in code.
 *
 * Jev answers what *kind* of time reference the message carries. This file does the calendar
 * arithmetic. The division matters: a model asked to compute "the Friday after the 11th of
 * October 2026" is being asked to do something it is bad at and cannot be audited on, whereas
 * a model asked "does this name a weekday, and which one" is being asked what it is good at.
 *
 * When the anchor is `none`, nothing is invented. The promise is recorded without a date and a
 * person sets one. A guessed date is worse than no date: it silently resumes a chase.
 */

export type PromiseAnchor = "none" | "day_of_month" | "weekday" | "relative_period";

export const WEEKDAYS = [
  "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
] as const;
export type Weekday = (typeof WEEKDAYS)[number] | "none";

export type PromisePeriod =
  | "none" | "tomorrow" | "this_week" | "next_week"
  | "end_of_this_month" | "end_of_next_month" | "next_payment_run";

export interface DateComponents {
  readonly anchor: PromiseAnchor;
  readonly weekday: Weekday;
  readonly period: PromisePeriod;
}

export interface ResolvedDate {
  /** `YYYY-MM-DD`, or null when the message fixes no date. */
  readonly date: string | null;
  /** How it was worked out. Composed from the components, never written by a model. */
  readonly how: string;
  /** True when the date the message named has already gone by. */
  readonly alreadyPast: boolean;
}

const NONE: ResolvedDate = { date: null, how: "no date was given", alreadyPast: false };

const isWeekend = (at: Date): boolean => at.getUTCDay() === 0 || at.getUTCDay() === 6;

/** A payment promised on a weekend lands on the next working day. Recorded when it happens. */
function toBusinessDay(at: Date): { at: Date; rolled: boolean } {
  if (!isWeekend(at)) return { at, rolled: false };
  let moved = at;
  while (isWeekend(moved)) moved = addDays(moved, 1);
  return { at: moved, rolled: true };
}

const endOfMonth = (at: Date, monthsAhead: number): Date =>
  new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + monthsAhead + 1, 0));

/**
 * Finds an explicit calendar day in the text.
 *
 * Two forms appear in the fixture set: `M/D` and an ordinal such as "the 15th". Parsing rather
 * than asking the model, because this is character matching and arithmetic, exactly the work
 * that belongs in code. Jev's job was only to say that a calendar day is what the message used.
 */
function parseDayOfMonth(body: string, asOf: Date): { at: Date; how: string } | null {
  const slash = /\b(\d{1,2})\/(\d{1,2})\b/.exec(body);
  if (slash) {
    const month = Number(slash[1]);
    const day = Number(slash[2]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      let at = new Date(Date.UTC(asOf.getUTCFullYear(), month - 1, day));
      // A date earlier in the year than the ledger date means next year, not a past promise, // unless it is only just past, which is a broken promise and must stay in the past.
      if (at.getUTCMonth() < asOf.getUTCMonth() - 6) {
        at = new Date(Date.UTC(asOf.getUTCFullYear() + 1, month - 1, day));
      }
      return { at, how: `the date ${month}/${day} in the message` };
    }
  }

  const ordinal = /\b(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)\b/.exec(body);
  if (ordinal) {
    const day = Number(ordinal[1]);
    if (day >= 1 && day <= 31) {
      let at = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), day));
      if (at.getTime() <= asOf.getTime()) {
        at = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() + 1, day));
      }
      return { at, how: `the ${day}${ordinalSuffix(day)} named in the message` };
    }
  }
  return null;
}

function ordinalSuffix(day: number): string {
  if (day % 100 >= 11 && day % 100 <= 13) return "th";
  if (day % 10 === 1) return "st";
  if (day % 10 === 2) return "nd";
  if (day % 10 === 3) return "rd";
  return "th";
}

function nextWeekday(asOf: Date, weekday: Weekday): Date | null {
  const index = WEEKDAYS.indexOf(weekday as (typeof WEEKDAYS)[number]);
  if (index < 0) return null;
  const ahead = (index - asOf.getUTCDay() + 7) % 7 || 7;
  return addDays(asOf, ahead);
}

function fromPeriod(asOf: Date, period: PromisePeriod): { at: Date; how: string } | null {
  switch (period) {
    case "tomorrow": return { at: addDays(asOf, 1), how: "'tomorrow', counted from the ledger date" };
    case "this_week": {
      const friday = nextWeekday(asOf, "friday");
      return friday ? { at: friday, how: "the end of this week" } : null;
    }
    case "next_week": {
      const friday = nextWeekday(asOf, "friday");
      return friday ? { at: addDays(friday, 7), how: "the end of next week" } : null;
    }
    case "end_of_this_month": return { at: endOfMonth(asOf, 0), how: "the end of this month" };
    case "end_of_next_month": return { at: endOfMonth(asOf, 1), how: "the end of next month" };
    case "next_payment_run": return { at: endOfMonth(asOf, 0), how: "their next payment run, taken as this month's end" };
    case "none": return null;
  }
}

/**
 * Assembles the promised date from the component answers.
 *
 * `asOf` is the ledger date, injected. Nothing here reads the wall clock, so the same reply
 * resolves to the same date on every machine and in every year.
 */
export function resolvePromiseDate(
  components: DateComponents,
  body: string,
  asOf: string = LEDGER_AS_OF): ResolvedDate {
  const from = parseDay(asOf);

  let found: { at: Date; how: string } | null = null;
  switch (components.anchor) {
    case "day_of_month":
      found = parseDayOfMonth(body, from);
      break;
    case "weekday": {
      const at = nextWeekday(from, components.weekday);
      if (at) found = { at, how: `the next ${components.weekday}` };
      break;
    }
    case "relative_period":
      found = fromPeriod(from, components.period);
      break;
    case "none":
      break;
  }

  if (!found) return NONE;

  const { at, rolled } = toBusinessDay(found.at);
  const date = formatDay(at);
  const how = rolled ? `${found.how}, moved to the next working day` : found.how;
  return { date, how, alreadyPast: at.getTime() <= from.getTime() };
}
