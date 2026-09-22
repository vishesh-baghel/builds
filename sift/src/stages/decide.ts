import { days, first, INBOX_AS_OF, nice } from "../clock";
import { probOf, type Thresholds } from "../policy";
import { PRIORITY_RANK, type Firm, type Message, type Priority, type Route, type SiftAction } from "../types";

/**
 * The decision: plain TypeScript over the probabilities, the clock judgment and the three lines.
 *
 * No model runs here, and that is the point. A model that can be steered by the text it is reading
 * must not also choose what happens next, so every route sits behind both the probability gate and a
 * closed, topic-qualified action set. This is the one function the headless pipeline and the browser
 * dial both call, which is why moving the dial spends nothing and why the tests need no vendor key.
 *
 * Colours live in the components, not here: this returns the priority level and the band, and the
 * UI maps those to the design tokens.
 */

export interface Outcome {
  readonly topic: string;
  readonly kind: string;
  /** `null` when labelled and left with nobody; `"?"` when a person must read it. */
  readonly who: string | null;
  readonly priority: Priority;
  readonly why: string;
  /** Person initials, or `"?"` for read-it, or `""` for no-one. */
  readonly initials: string;
}

export interface OwnerAlert {
  readonly who: string;
  readonly why: string;
  /** True when a clock is running but no date is given, so a person must set it. */
  readonly needsDate: boolean;
}

export interface Plan {
  readonly asserted: readonly string[];
  readonly review: readonly string[];
  readonly outcomes: readonly Outcome[];
  readonly alert: OwnerAlert | null;
  readonly clockFlagged: boolean;
  readonly handoffs: readonly string[];
  readonly routed: readonly Outcome[];
  readonly people: readonly string[];
  readonly headline: string;
  readonly foot: string;
  readonly quiet: boolean;
  readonly routeShort: string;
  readonly priority: Priority | null;
  /** The closed, topic-qualified action set this plan schedules. */
  readonly actions: readonly SiftAction[];
  readonly reason: string;
}

const topOf = (outcomes: readonly Outcome[]): Priority | null =>
  outcomes.length
    ? outcomes.reduce<Priority>(
        (a, o) => (PRIORITY_RANK.indexOf(o.priority) < PRIORITY_RANK.indexOf(a) ? o.priority : a),
        "low",
      )
    : null;

/**
 * How the headless pipeline overrides the fixture defaults with code.
 *
 * The browser passes nothing and the illustrative fixture routes apply. The pipeline passes a
 * priority derived from the systems of record (AC #6) and a corroboration flag from the deterministic
 * deadline parse and log cross-reference (AC #5), so priority is code, not fixture text, and a clock
 * the model scored low still raises an alert when a record confirms it.
 */
export interface DecideOpts {
  readonly priorityOf?: (topic: string) => Priority | undefined;
  readonly corroborated?: boolean;
}

export function decidePlan(
  message: Message,
  firm: Firm,
  thresholds: Thresholds,
  asOf: string = INBOX_AS_OF,
  opts: DecideOpts = {},
): Plan {
  const corroborated = message.corroborated === true || opts.corroborated === true;
  const classes = firm.classes.map((c) => c[0]);
  const plain = new Map(firm.classes.map((c) => [c[0], c[2]] as const));
  const kind = new Map(firm.classes.map((c) => [c[0], c[3]] as const));
  const initials = new Map(firm.people.map((p) => [p.name, p.initials] as const));

  const asserted = classes.filter((c) => probOf(message, c) >= thresholds.act);
  const review = classes.filter((c) => {
    const p = probOf(message, c);
    return p >= thresholds.review && p < thresholds.act;
  });

  const fallback: Route = { who: "?", priority: "normal", why: "Real, but none of the usual kinds." };
  const outcomes: Outcome[] = asserted.map((c) => {
    const r = message.routes?.[c] ?? firm.defaults[c] ?? fallback;
    const who = r.who;
    const init = who && who !== "?" ? (initials.get(who) ?? "") : who === "?" ? "?" : "";
    const priority = opts.priorityOf?.(c) ?? r.priority;
    return { topic: c, kind: kind.get(c) ?? "Other", who, priority, why: r.why, initials: init };
  });

  const handoffs: string[] = [];
  let alert: OwnerAlert | null = null;
  let clockFlagged = false;
  if (message.clock >= thresholds.clockAct || corroborated) {
    clockFlagged = true;
    const how = corroborated
      ? "Confirmed against the records."
      : `The deadline question alone was confident (${message.clock.toFixed(2)}).`;
    if (message.deadline) {
      alert = {
        who: `${firm.owner}: deadline alert`,
        why: `${how} ${message.kind ?? "Response"} by ${nice(message.deadline)}, ${days(asOf, message.deadline)} days.`,
        needsDate: false,
      };
    } else {
      alert = {
        who: `${firm.owner}: set the deadline`,
        why: "A clock is running but the message gives no date, and Sift never guesses one.",
        needsDate: true,
      };
      handoffs.push("set the deadline by hand");
    }
  }
  for (const o of outcomes) if (o.who === "?") handoffs.push("read it; none of the usual kinds fit");
  for (const c of review) handoffs.push(`decide whether it is ${plain.get(c) ?? c} (Sift was ${Math.round(probOf(message, c) * 100)}% sure)`);
  if (asserted.length === 0) handoffs.unshift("read it; nothing was clear enough to act on");

  const routed = outcomes.filter((o): o is Outcome & { who: string } => o.who !== null && o.who !== "?");
  const people = [...new Set([...(alert ? [firm.owner] : []), ...routed.map((o) => o.who)])];
  const top = topOf(outcomes);

  let headline: string;
  if (asserted.length === 0) {
    headline = "Not sure what this is. A person should read it.";
  } else {
    const what = asserted.map((c) => plain.get(c) ?? c).join(" and ");
    const tail = alert && message.deadline ? ", and a deadline is running" : top === "urgent" ? ", urgently" : top === "high" ? ", soon" : "";
    const seer = people.length === 1 ? `${first(people[0] ?? "")} should see it` : `${people.length} people should see it`;
    headline = people.length === 0 ? `This is ${what}. Nobody needs to be interrupted.` : `This is ${what}. ${seer}${tail}.`;
  }

  const foot = handoffs.length ? `Someone still has to ${handoffs.join("; ")}.` : "";
  const quiet = outcomes.length > 0 && people.length === 0 && handoffs.length === 0;
  const routeShort = people.length ? people.map(first).join(" + ") : handoffs.length ? "a person decides" : "no one";
  const priority: Priority | null = alert && message.deadline ? (days(asOf, message.deadline) <= 7 ? "urgent" : top ?? "high") : top;

  const actions: SiftAction[] = [
    ...(alert ? [alert.needsDate ? ("set_deadline" as const) : ("alert:owner" as const)] : []),
    ...outcomes.map((o): SiftAction => (o.who === null ? `label:${o.topic}` : `route:${o.topic}`)),
  ];

  const reason = foot ? `${headline} ${foot}` : headline;

  return {
    asserted, review, outcomes, alert, clockFlagged, handoffs, routed, people,
    headline, foot, quiet, routeShort, priority, actions, reason,
  };
}
