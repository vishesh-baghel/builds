/**
 * Time, injected.
 *
 * Aging is evaluated against a fixed ledger date, never against the wall clock. A fixture set
 * whose overdue counts drift with the calendar is not a measurement instrument, and a promise
 * watchdog tested by waiting is not a test. Everything that needs "now" takes a `Clock`.
 */

/** The date the committed A/R aging export was taken. Frozen with the fixture set. */
export const LEDGER_AS_OF = "2026-10-11";

export interface Clock {
  now(): Date;
}

/** Parses a `YYYY-MM-DD` date as UTC midnight. Local-time parsing would shift by timezone. */
export function parseDay(iso: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new RangeError(`not a YYYY-MM-DD date: ${iso}`);
  const at = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(at.getTime())) throw new RangeError(`not a real date: ${iso}`);
  return at;
}

export const formatDay = (at: Date): string => at.toISOString().slice(0, 10);

/** A clock pinned to one day. The only clock the tests and the scorecard ever use. */
export function fixedClock(iso: string = LEDGER_AS_OF): Clock {
  const at = parseDay(iso);
  return { now: () => new Date(at.getTime()) };
}

export const MS_PER_DAY = 86_400_000;

/** Whole days from `from` to `to`. Negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((parseDay(to).getTime() - parseDay(from).getTime()) / MS_PER_DAY);
}

export function addDays(at: Date, days: number): Date {
  return new Date(at.getTime() + days * MS_PER_DAY);
}
