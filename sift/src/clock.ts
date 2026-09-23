/**
 * The clock, fixed.
 *
 * Every deadline distance on the dashboard is measured from `INBOX_AS_OF`, not from the wall
 * clock, so the committed fixtures read the same today as the day they were frozen. A build that
 * measured "days left" against the real date would drift the moment it was left alone.
 */
export const INBOX_AS_OF = "2026-09-21";

/** Whole days from `a` to `b`, both `YYYY-MM-DD`. */
export const days = (a: string, b: string): number =>
  Math.round((Date.parse(b) - Date.parse(a)) / 864e5);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** `2026-10-02` to `Oct 2`. */
export const nice = (d: string): string => `${MONTHS[+d.slice(5, 7) - 1]} ${+d.slice(8, 10)}`;

/** A received stamp to a relative phrase, measured from `INBOX_AS_OF`. */
export const when = (received: string, asOf: string = INBOX_AS_OF): string => {
  const d = days(received.slice(0, 10), asOf);
  return d === 0 ? `today ${received.slice(11)}` : d === 1 ? `yesterday ${received.slice(11)}` : `${d}d ago`;
};

/** First name from a "Name, Company" or "Name" string. */
export const first = (s: string): string => (s.split(",")[0] ?? s).split(" ")[0] ?? s;
