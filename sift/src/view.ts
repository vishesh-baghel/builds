import { days, first, INBOX_AS_OF, nice, when } from "./clock";
import { probOf, type Thresholds } from "./policy";
import { decidePlan, type Plan } from "./stages/decide";
import type { Firm, Message, Priority } from "./types";

/**
 * The dashboard's derived state, in one pure function.
 *
 * `deriveView` runs `decidePlan` over every message in a firm at the current lines and folds the
 * results into the eight screens: the scorecard tiles, the savings arithmetic, the inbox rows with
 * their probability bars, the deadline list, the per-person lanes, the decisions queue, the
 * attention list and the effects summary. It calls no model and touches no network, so the browser
 * can re-run it on every dial move for free, and a test can assert every screen with no vendor key.
 *
 * Colours are not decided here. Each row carries the priority level, the band or the state, and the
 * component maps those to the design tokens.
 */

export interface Score {
  readonly caught: number;
  readonly clockedN: number;
  readonly falseAlarms: number;
  readonly unclockedN: number;
  readonly automated: number;
  readonly escalated: number;
  readonly total: number;
  readonly disguised: number;
  readonly alerts: number;
}

export interface SavingsRow {
  readonly label: string;
  readonly sub: string;
  readonly hand: string;
  readonly sift: string;
}

export interface Savings {
  readonly handToday: string;
  readonly siftToday: string;
  readonly savedToday: string;
  readonly savedWeek: string;
  readonly savedMonth: string;
  readonly rows: readonly SavingsRow[];
}

export interface ProbBar {
  readonly question: string;
  readonly value: number;
  readonly band: "act" | "review" | "off";
  readonly markPct: number;
  readonly isClock: boolean;
}

/** One row of the graphite verdict card: who Sift handed the message to, and why. */
export interface VerdictLine {
  readonly initials: string;
  readonly who: string;
  readonly why: string;
  readonly kind: "alert" | "person" | "none";
}

export interface InboxRow {
  readonly id: string;
  readonly fromName: string;
  readonly fromEmail: string;
  readonly subject: string;
  readonly body: string;
  readonly received: string;
  readonly when: string;
  readonly routeShort: string;
  readonly priority: Priority | null;
  readonly clockFlagged: boolean;
  readonly headline: string;
  readonly verdictLines: readonly VerdictLine[];
  readonly foot: string;
  readonly note: string | null;
  readonly probs: readonly ProbBar[];
}

export interface DeadlineRow {
  readonly id: string;
  readonly date: string;
  readonly days: string;
  readonly subject: string;
  readonly kind: string;
  readonly owner: string;
  readonly widthPct: number;
  readonly state: "caught" | "missed" | "false alarm" | "needs a person";
  readonly urgency: "urgent" | "soon" | "later" | "none";
  readonly hasDate: boolean;
}

export interface LaneItem {
  readonly id: string;
  readonly subject: string;
  readonly priority: Priority | null;
  readonly isAlert: boolean;
  readonly unclear: boolean;
}

export interface Lane {
  readonly name: string;
  readonly role: string;
  readonly initials: string;
  readonly count: number;
  readonly items: readonly LaneItem[];
  readonly empty: boolean;
  readonly isDecideLane: boolean;
}

export interface DecisionCard {
  readonly id: string;
  readonly subject: string;
  readonly fromName: string;
  readonly items: readonly string[];
  readonly doneLine: string;
}

export interface AttentionItem {
  readonly id: string;
  readonly subject: string;
  readonly isAlert: boolean;
  readonly priority: Priority | null;
  readonly line: string;
  readonly due: string;
  readonly dueSoon: boolean;
}

export interface EffectRow {
  readonly n: number;
  readonly label: string;
  readonly sub: string;
  readonly tone: "accent" | "warn" | "neg" | "ink";
}

export interface NavCounts {
  readonly inbox: number;
  readonly deadlines: number;
  readonly decide: number;
}

export interface View {
  readonly thresholds: Thresholds;
  readonly score: Score;
  readonly savings: Savings;
  readonly inboxRows: readonly InboxRow[];
  readonly deadlines: readonly DeadlineRow[];
  readonly lanes: readonly Lane[];
  readonly decisions: readonly DecisionCard[];
  readonly attention: readonly AttentionItem[];
  readonly effects: readonly EffectRow[];
  readonly quietLine: string;
  readonly navCounts: NavCounts;
}

const fmtMin = (seconds: number): string => {
  const m = Math.round(seconds / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m` : `${m} min`;
};

const cap = (s: string): string => (s.length ? s.charAt(0).toUpperCase() + s.slice(1) : s);

const PRIORITY_ORDER: readonly Priority[] = ["urgent", "high", "normal", "low"];
const worst = (a: Priority, b: Priority): Priority =>
  PRIORITY_ORDER.indexOf(a) < PRIORITY_ORDER.indexOf(b) ? a : b;

export function deriveView(
  firm: Firm,
  thresholds: Thresholds,
  handSecs: number,
  lookupSecs: number,
  asOf: string = INBOX_AS_OF,
): View {
  const messages = firm.messages;
  const classes = firm.classes.map((c) => c[0]);
  const initials = new Map(firm.people.map((p) => [p.name, p.initials] as const));
  const plans = new Map<string, Plan>(messages.map((m) => [m.id, decidePlan(m, firm, thresholds, asOf)]));
  const planOf = (id: string): Plan => {
    const p = plans.get(id);
    if (!p) throw new Error(`no plan for ${id}`);
    return p;
  };

  // --- scorecard ---
  let caught = 0, clockedN = 0, falseAlarms = 0, unclockedN = 0, automated = 0, escalated = 0, disguised = 0, alerts = 0;
  for (const m of messages) {
    const p = planOf(m.id);
    if (m.clocked) {
      clockedN++;
      if (p.clockFlagged) {
        caught++;
        const topC = classes.reduce((a, b) => (probOf(m, a) >= probOf(m, b) ? a : b), classes[0] ?? "");
        if (probOf(m, topC) < 0.75) disguised++;
      }
    } else {
      unclockedN++;
      if (p.clockFlagged) falseAlarms++;
    }
    if (p.handoffs.length) escalated++;
    else automated++;
    if (p.alert) alerts++;
  }
  const score: Score = { caught, clockedN, falseAlarms, unclockedN, automated, escalated, total: messages.length, disguised, alerts };

  // --- savings (declared estimates, never a measured figure) ---
  const recordN = messages.filter((m) => m.record).length;
  const handRead = messages.length * handSecs;
  const handLookup = recordN * lookupSecs;
  const siftRead = 60;
  const siftDecide = escalated * 45;
  const siftAlerts = alerts * 20;
  const handT = handRead + handLookup;
  const siftT = siftRead + siftDecide + siftAlerts;
  const saved = Math.max(0, handT - siftT);
  const savings: Savings = {
    handToday: fmtMin(handT), siftToday: fmtMin(siftT), savedToday: fmtMin(saved),
    savedWeek: fmtMin(saved * 5), savedMonth: fmtMin(saved * 21),
    rows: [
      { label: "Read and sort every message", sub: `${messages.length} messages at ${handSecs}s each by hand; one glance at the sorted list with Sift`, hand: fmtMin(handRead), sift: fmtMin(siftRead) },
      { label: `Look things up in ${firm.sourcesShort}`, sub: `${recordN} messages matched a record; Sift matched them in code`, hand: fmtMin(handLookup), sift: "0 min" },
      { label: "Decide the unclear ones", sub: `${escalated} items need a person's call, 45s each, reasons attached`, hand: "included", sift: fmtMin(siftDecide) },
      { label: "Deadline alerts", sub: `${alerts} ${alerts === 1 ? "alert" : "alerts"} to ${firm.owner}, 20s each to acknowledge`, hand: "not by hand", sift: fmtMin(siftAlerts) },
    ],
  };

  // --- inbox rows (with the nine probability bars) ---
  const bandOf = (v: number): "act" | "review" | "off" => (v >= thresholds.act ? "act" : v >= thresholds.review ? "review" : "off");
  const inboxRows: InboxRow[] = messages.map((m) => {
    const p = planOf(m.id);
    const probs: ProbBar[] = firm.classes.map(([c, q]) => {
      const v = probOf(m, c);
      return { question: q, value: v, band: bandOf(v), markPct: thresholds.act * 100, isClock: false };
    });
    const cf = m.clock >= thresholds.clockAct || m.corroborated === true;
    probs.push({ question: "Is a deadline running?", value: m.clock, band: cf ? "act" : "off", markPct: thresholds.clockAct * 100, isClock: true });

    const verdictLines: VerdictLine[] = [
      ...(p.alert ? [{ initials: initials.get(firm.owner) ?? "", who: p.alert.who, why: p.alert.why, kind: "alert" as const }] : []),
      ...p.outcomes.map((o): VerdictLine => ({
        initials: o.initials,
        who: o.who && o.who !== "?" ? `${o.who} · ${labelFor(o.priority)}` : o.who === "?" ? "A person" : "No one",
        why: o.why,
        kind: o.who && o.who !== "?" ? "person" : "none",
      })),
    ];

    return {
      id: m.id, fromName: m.from, fromEmail: m.email, subject: m.subject, body: m.body,
      received: m.received, when: when(m.received, asOf), routeShort: p.routeShort,
      priority: p.priority, clockFlagged: p.clockFlagged, headline: p.headline,
      verdictLines, foot: p.foot, note: m.note ?? null, probs,
    };
  });

  // --- deadlines ---
  const SPAN = 30;
  const withDate = messages
    .filter((m) => m.deadline != null && (m.clocked === true || planOf(m.id).clockFlagged))
    .slice()
    .sort((a, b) => (a.deadline as string).localeCompare(b.deadline as string));
  const deadlines: DeadlineRow[] = withDate.map((m) => {
    const p = planOf(m.id);
    const dl = m.deadline as string;
    const d = days(asOf, dl);
    const state: DeadlineRow["state"] = p.clockFlagged ? (m.clocked ? "caught" : "false alarm") : "missed";
    const owner = p.routed[0]?.who ?? firm.owner;
    return {
      id: m.id, date: nice(dl), days: `${d} days`, subject: m.subject, kind: m.kind ?? "Deadline",
      owner, widthPct: (Math.min(d, SPAN) / SPAN) * 100, state,
      urgency: d <= 7 ? "urgent" : d <= 14 ? "soon" : "later", hasDate: true,
    };
  });
  for (const m of messages.filter((m) => m.deadline == null && planOf(m.id).clockFlagged)) {
    deadlines.push({
      id: m.id, date: "no date", days: "", subject: m.subject, kind: m.kind ?? "Deadline",
      owner: `${firm.owner} sets it`, widthPct: 0, state: "needs a person", urgency: "none", hasDate: false,
    });
  }

  // --- decisions queue ---
  const decisions: DecisionCard[] = messages
    .filter((m) => planOf(m.id).handoffs.length > 0)
    .map((m) => {
      const p = planOf(m.id);
      return {
        id: m.id, subject: m.subject, fromName: m.from,
        items: p.handoffs.map((h) => `${cap(h)}.`),
        doneLine: p.people.length
          ? `Already routed to ${p.people.map(first).join(" and ")}; this is the part that was not clear.`
          : "Nothing was done with it automatically.",
      };
    });

  // --- lanes (one per person, plus the decide lane) ---
  const lanes: Lane[] = firm.people.map((person) => {
    const items: (LaneItem & { rank: number })[] = [];
    for (const m of messages) {
      const p = planOf(m.id);
      const isAlert = person.name === firm.owner && p.alert != null;
      const mine = p.routed.filter((o) => o.who === person.name);
      if (isAlert || mine.length) {
        const pri = isAlert ? p.priority ?? "high" : mine.reduce<Priority>((a, o) => worst(a, o.priority), "low");
        items.push({ id: m.id, subject: m.subject, priority: isAlert ? null : pri, isAlert, unclear: false, rank: isAlert ? -1 : PRIORITY_ORDER.indexOf(pri) });
      }
    }
    items.sort((a, b) => a.rank - b.rank);
    return { name: person.name, role: person.role, initials: person.initials, count: items.length, items: items.map(({ rank: _rank, ...i }) => i), empty: items.length === 0, isDecideLane: false };
  });
  lanes.push({
    name: "Someone decides", role: "not clear enough to act on", initials: "?",
    count: decisions.length,
    items: decisions.map((d) => ({ id: d.id, subject: d.subject, priority: null, isAlert: false, unclear: true })),
    empty: decisions.length === 0, isDecideLane: true,
  });

  // --- attention list (top of Overview) ---
  const attention: AttentionItem[] = messages
    .map((m) => ({ m, p: planOf(m.id) }))
    .filter((x) => x.p.alert != null || x.p.priority === "urgent")
    .sort((a, b) => (a.m.deadline ?? "9").localeCompare(b.m.deadline ?? "9"))
    .slice(0, 6)
    .map(({ m, p }) => {
      const d = m.deadline != null ? days(asOf, m.deadline) : null;
      return {
        id: m.id, subject: m.subject, isAlert: p.alert != null, priority: p.priority,
        line: `${p.routeShort}${m.kind ? ` · ${m.kind}` : ""}`,
        due: m.deadline != null ? `${nice(m.deadline)} · ${d}d` : p.alert != null ? "no date" : "",
        dueSoon: d != null && d <= 7,
      };
    });

  // --- effects (Autonomy screen) ---
  const routesTotal = messages.reduce((s, m) => s + planOf(m.id).routed.length, 0);
  const effects: EffectRow[] = [
    { n: automated, label: "messages sorted without a person", sub: "routed, labelled or left alone with no one asked", tone: "accent" },
    { n: escalated, label: "need a person's call", sub: "below the act line, above the review line, or no date to set", tone: "warn" },
    { n: alerts, label: "deadline alerts", sub: `to ${firm.owner}; ${caught} of ${clockedN} real deadlines caught`, tone: "neg" },
    { n: falseAlarms, label: falseAlarms === 1 ? "false alarm" : "false alarms", sub: "a deadline flagged on a message that has none", tone: "ink" },
    { n: routesTotal, label: "routes", sub: "a message with two topics reaches two people", tone: "ink" },
  ];

  const quietN = messages.filter((m) => planOf(m.id).quiet).length;
  const quietLine = `${quietN} ${quietN === 1 ? "message was" : "messages were"} labelled and left alone: pitches and internal mail. Nothing was deleted.`;

  return {
    thresholds, score, savings, inboxRows, deadlines, lanes, decisions, attention, effects, quietLine,
    navCounts: { inbox: messages.length, deadlines: deadlines.length, decide: decisions.length },
  };
}

function labelFor(priority: Priority): string {
  return priority === "urgent" ? "Urgent" : priority === "high" ? "Soon" : priority === "normal" ? "Normal" : "Low";
}
