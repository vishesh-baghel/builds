"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { ClassifyOk } from "../lib/classify";
import { HUMAN_TIME_ESTIMATE, linesFor, type Thresholds } from "../src/policy";
import { deriveView } from "../src/view";
import type { Firm, Message, Priority } from "../src/types";
import { ReadView, priColor } from "./ReadView";

/**
 * The dashboard.
 *
 * All state that matters, the firm, the page, the autonomy dial and the two savings estimates, lives
 * here. Everything the dial does runs in `deriveView`, in the browser, through the same `decidePlan`
 * the headless pipeline calls. There is no network on the client and no model call when the dial
 * moves: the judgment is bought once per message on the deploy, and this re-decides over it for free.
 *
 * Meridian is the measured firm: recorded model judgments over the frozen instrument, opened at the
 * lines the sweep chose so its numbers match the published scorecard. Moving the dial leaves that
 * setting, and the Measured preset returns to it. The other six firms are illustrative, and the
 * sidebar says which is which.
 */

interface LiveStatus {
  readonly live: boolean;
  readonly persistent: boolean;
  readonly spentCents: number;
  readonly capCents: number;
  readonly liveCallsToday: number;
  readonly ceiling: number;
}

type PageId = "overview" | "inbox" | "deadlines" | "people" | "decide" | "autonomy" | "savings" | "how";

const NAV: readonly (readonly [PageId, string])[] = [
  ["overview", "Overview"], ["inbox", "Inbox"], ["deadlines", "Deadlines"], ["people", "People"],
  ["decide", "Needs a decision"], ["autonomy", "Autonomy"], ["savings", "Savings"], ["how", "How it works"],
];

const PRI: Readonly<Record<Priority, string>> = { urgent: "Urgent", high: "Soon", normal: "Normal", low: "Low" };

const TONE: Readonly<Record<"accent" | "warn" | "neg" | "ink", string>> = {
  accent: "var(--color-accent)", warn: "var(--color-warn)", neg: "var(--color-neg)", ink: "var(--color-ink)",
};

const urgencyColor = (u: "urgent" | "soon" | "later" | "none"): string =>
  u === "urgent" ? "var(--color-neg)" : u === "soon" ? "var(--color-warn)" : u === "later" ? "var(--color-accent)" : "var(--color-ink-3)";

const stateColor = (s: string): string =>
  s === "caught" ? "var(--color-ink-3)" : s === "missed" ? "var(--color-neg)" : "var(--color-warn)";

const mono = (extra: CSSProperties = {}): CSSProperties => ({
  fontFamily: "var(--font-mono)", fontSize: ".625rem", letterSpacing: ".08em", textTransform: "uppercase", fontWeight: 500, color: "var(--color-ink-3)", ...extra,
});

const h2mono: CSSProperties = { margin: 0, fontFamily: "var(--font-mono)", fontSize: ".6875rem", letterSpacing: ".08em", textTransform: "uppercase", fontWeight: 500, color: "var(--color-ink-3)" };
const card: CSSProperties = { border: "1px solid var(--color-rule)", borderRadius: "var(--radius-lg)", padding: "1.125rem 1.25rem" };
const bigNum: CSSProperties = { marginTop: ".375rem", fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "2.25rem", letterSpacing: "-.03em", lineHeight: 1, fontVariantNumeric: "tabular-nums" };

export function Dashboard({ firms, measuredLines }: { firms: readonly Firm[]; measuredLines: Thresholds }) {
  const [firmId, setFirmId] = useState(firms[0]?.id ?? "arch");
  const [page, setPage] = useState<PageId>("overview");
  const [dial, setDialState] = useState(0.6);
  const [atMeasured, setAtMeasured] = useState(true);
  const setDial = (n: number) => { setDialState(n); setAtMeasured(false); };
  const [openId, setOpenId] = useState<string | null>(null);
  const [handSecs, setHandSecs] = useState<number>(HUMAN_TIME_ESTIMATE.handSecondsPerMessage);
  const [lookupSecs, setLookupSecs] = useState<number>(HUMAN_TIME_ESTIMATE.lookupSecondsPerRecord);

  // Live judging: opening a message asks the route for one fresh judgment, once per message per page
  // load. A live result replaces that message's scores; the dial still re-decides locally, for free.
  const [status, setStatus] = useState<LiveStatus | null>(null);
  const [results, setResults] = useState<Readonly<Record<string, ClassifyOk>>>({});
  const requested = useRef(new Set<string>());

  useEffect(() => {
    fetch("/api/classify").then((r) => (r.ok ? r.json() : null)).then((s: LiveStatus | null) => { if (s) setStatus(s); }).catch(() => {});
  }, []);

  const pick = useCallback((fid: string, mid: string) => {
    const key = `${fid}/${mid}`;
    if (requested.current.has(key)) return;
    requested.current.add(key);
    fetch("/api/classify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmId: fid, messageId: mid }) })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: ClassifyOk | null) => {
        if (!body) return;
        setResults((prev) => ({ ...prev, [key]: body }));
        setStatus((prev) => (prev ? { ...prev, spentCents: body.spend.spentCents, liveCallsToday: prev.liveCallsToday + (body.live ? 1 : 0) } : prev));
      })
      .catch(() => { requested.current.delete(key); });
  }, []);

  const baseFirm = useMemo(() => firms.find((f) => f.id === firmId) ?? firms[0]!, [firms, firmId]);
  const liveHere = useMemo(() => Object.values(results).filter((r) => r.live && r.firmId === baseFirm.id), [results, baseFirm.id]);
  const firm = useMemo<Firm>(() => {
    if (liveHere.length === 0) return baseFirm;
    const byId = new Map(liveHere.map((r) => [r.messageId, r.judgment]));
    return {
      ...baseFirm,
      messages: baseFirm.messages.map((m): Message => {
        const j = byId.get(m.id);
        return j ? { ...m, p: j.scores, clock: j.clock } : m;
      }),
    };
  }, [baseFirm, liveHere]);

  useEffect(() => { if (openId) pick(firm.id, openId); }, [openId, firm.id, pick]);
  const measuring = firm.measured !== undefined && atMeasured;
  const th = useMemo(() => (measuring ? measuredLines : linesFor(dial)), [measuring, measuredLines, dial]);
  const view = useMemo(() => deriveView(firm, th, handSecs, lookupSecs), [firm, th, handSecs, lookupSecs]);

  const open = (id: string) => { setPage("inbox"); setOpenId(id); };
  const dialLabel = measuring ? "tested setting" : dial <= 0.01 ? "check everything" : dial >= 0.99 ? "hands off" : `${Math.round(dial * 100)}%`;
  const counts: Record<string, number | undefined> = { inbox: view.navCounts.inbox, deadlines: view.navCounts.deadlines, decide: view.navCounts.decide };

  const TITLES: Record<PageId, readonly [string, string]> = {
    overview: [`Monday morning at ${firm.firm}`, `${firm.messages.length} messages from ${view.span.workingDays} working ${view.span.workingDays === 1 ? "day" : "days"} in the shared inbox, sorted before anyone opened it.`],
    inbox: ["Inbox", "Every message, newest first. Click one to see what Sift did with it and why."],
    deadlines: ["Deadlines", "Every deadline in this inbox: the ones Sift caught, the ones it missed, and its false alarms."],
    people: ["People", "What each person receives. A message about two things reaches both people who own them."],
    decide: ["Needs a decision", "The messages Sift was not sure about. Each one says what is unclear, so a person can decide quickly."],
    autonomy: ["Autonomy", "One slider sets how much Sift handles on its own and how much it checks with you first."],
    savings: ["Savings", `Time and effort on this inbox, by hand versus with Sift, over ${view.span.workingDays} working ${view.span.workingDays === 1 ? "day" : "days"}.`],
    how: ["How it works", `What Sift does with each message in ${firm.firm}'s inbox, step by step.`],
  };

  const dialInput = (id: string) => (
    <input id={id} aria-label="Autonomy" type="range" min={0} max={1} step={0.02} value={dial}
      onChange={(e) => setDial(Number(e.target.value))}
      style={{ display: "block", width: "100%", accentColor: "var(--color-accent)", background: "transparent", cursor: "pointer" }} />
  );

  return (
    <div style={{ minHeight: "100vh", display: "grid", gridTemplateColumns: "15rem minmax(0,1fr)", background: "var(--color-paper)" }}>
      <aside style={{ borderRight: "1px solid var(--color-rule)", background: "var(--color-paper-2)", display: "flex", flexDirection: "column", position: "sticky", top: 0, height: "100vh", overflow: "auto" }}>
        <div style={{ padding: "1.125rem 1.25rem 1rem", display: "flex", alignItems: "baseline", gap: ".5rem" }}>
          <span style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "1.0625rem", color: "var(--color-ink)", letterSpacing: "-.02em" }}>sift</span>
          <span style={{ fontSize: ".75rem", color: "var(--color-ink-3)" }}>inbox triage</span>
        </div>
        <div style={{ padding: "0 1rem 1rem" }}>
          <label htmlFor="firm" style={mono({ display: "block", marginBottom: ".375rem" })}>Firm</label>
          <select id="firm" value={firmId} onChange={(e) => { setFirmId(e.target.value); setOpenId(null); }}
            style={{ appearance: "none", width: "100%", minHeight: 38, padding: "0 2rem 0 .625rem", border: "1px solid var(--color-rule-2)", borderRadius: "var(--radius-md)", background: "var(--color-paper)", color: "var(--color-ink)", font: "inherit", fontSize: ".875rem", fontWeight: 500, cursor: "pointer" }}>
            {firms.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select>
          <p style={{ margin: ".375rem 0 0", fontSize: ".75rem", color: "var(--color-ink-3)", lineHeight: 1.4 }}>{firm.firm} · {firm.messages.length} messages over {view.span.workingDays} working {view.span.workingDays === 1 ? "day" : "days"}</p>
        </div>
        <nav aria-label="Sections" style={{ padding: "0 .625rem", display: "flex", flexDirection: "column", gap: 2 }}>
          {NAV.map(([id, label]) => {
            const current = page === id;
            const count = counts[id];
            return (
              <button key={id} type="button" onClick={() => setPage(id)} aria-current={current ? "page" : undefined}
                style={{ display: "flex", alignItems: "center", gap: ".625rem", width: "100%", minHeight: 38, padding: "0 .625rem", border: 0, borderRadius: "var(--radius-md)", textAlign: "left", font: "inherit", fontSize: ".875rem", fontWeight: 500, cursor: "pointer", background: current ? "var(--color-accent-soft)" : "transparent", color: current ? "var(--color-accent)" : "var(--color-ink-2)" }}>
                <span style={{ flex: "1 1 auto" }}>{label}</span>
                {count != null && <span className="num" style={{ fontFamily: "var(--font-mono)", fontSize: ".6875rem", color: id === "decide" && count ? "var(--color-warn)" : "var(--color-ink-3)" }}>{count}</span>}
              </button>
            );
          })}
        </nav>
        <div style={{ marginTop: "auto", padding: "1rem 1.25rem", borderTop: "1px solid var(--color-rule)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: ".5rem" }}>
            <span style={{ fontSize: ".75rem", color: "var(--color-ink-2)" }}>Autonomy</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: ".6875rem", color: "var(--color-accent)" }}>{dialLabel}</span>
          </div>
          {dialInput("dial")}
          {status && (
            <p style={{ margin: ".75rem 0 0", fontSize: ".6875rem", color: "var(--color-ink-3)", lineHeight: 1.45 }}>
              {status.live ? "Live mode on: opening a message has the AI read it fresh, once." : "Live mode off: each message shows the answers recorded in testing."}
              {" "}Hard spending cap: {status.spentCents.toFixed(3)} of {status.capCents} cents used this month{status.persistent ? "" : " on this server"}; {status.liveCallsToday} of {status.ceiling} live reads used in the last 24 hours.
            </p>
          )}
          {firm.measured && liveHere.length > 0 && (
            <p style={{ margin: ".5rem 0 0", fontSize: ".6875rem", color: "var(--color-warn)", lineHeight: 1.45 }}>
              {liveHere.length} {liveHere.length === 1 ? "message was" : "messages were"} read live this visit, so this page may differ from the tested results.
            </p>
          )}
          <p style={{ margin: ".75rem 0 0", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: ".07em", textTransform: "uppercase", color: "var(--color-warn)" }}>{firm.measured ? `invented data · AI answers recorded ${firm.measured.runDate} · no email is sent` : "invented data · illustrative AI answers · no email is sent"}</p>
        </div>
      </aside>

      <main style={{ minWidth: 0, padding: "clamp(1.25rem,3vw,2.5rem) clamp(1rem,3vw,2.5rem) 3rem", maxWidth: "80rem" }}>
        <header style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: ".5rem 1.5rem", marginBottom: "1.5rem" }}>
          <h1 style={{ margin: 0, fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "clamp(1.375rem,2.4vw,1.75rem)", letterSpacing: "-.025em", color: "var(--color-ink)", lineHeight: 1.15 }}>{TITLES[page][0]}</h1>
          <span style={{ fontSize: ".8125rem", color: "var(--color-ink-3)" }}>{TITLES[page][1]}</span>
        </header>

        {page === "overview" && <Overview view={view} firm={firm} open={open} measuring={measuring} />}
        {page === "inbox" && <Inbox view={view} firm={firm} openId={openId} setOpenId={setOpenId} results={results} />}
        {page === "deadlines" && <Deadlines view={view} open={open} />}
        {page === "people" && <People view={view} open={open} />}
        {page === "decide" && <Decide view={view} open={open} />}
        {page === "autonomy" && <Autonomy view={view} firm={firm} setDial={setDial} dialLabel={dialLabel} dialInput={dialInput} measuring={measuring} toMeasured={() => setAtMeasured(true)} />}
        {page === "savings" && <Savings view={view} firm={firm} handSecs={handSecs} setHandSecs={setHandSecs} lookupSecs={lookupSecs} setLookupSecs={setLookupSecs} />}
        {page === "how" && <How firm={firm} />}
      </main>
    </div>
  );
}

type V = ReturnType<typeof deriveView>;

function Avatar({ initials, bg = "var(--color-accent-soft)", fg = "var(--color-accent)", size = 28 }: { initials: string; bg?: string; fg?: string; size?: number }) {
  return <span style={{ width: size, height: size, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-mono)", fontSize: ".625rem", fontWeight: 500, background: bg, color: fg, flex: "none" }}>{initials}</span>;
}

function Overview({ view, firm, open, measuring }: { view: V; firm: Firm; open: (id: string) => void; measuring: boolean }) {
  const s = view.score;
  return (
    <>
      <p style={{ margin: "0 0 1.5rem", color: "var(--color-ink-2)", lineHeight: 1.55 }}>
        Sift reads a firm's shared inbox, checks each message against {firm.sourcesLong}, and sends it to the person who owns it.
        Every deadline goes to {firm.owner}, including the ones buried in routine-looking mail. Anything Sift is unsure about waits for a person, with the reason attached.
        It never sends email, never changes a record and never deletes anything.
      </p>
      <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,12rem),1fr))" }}>
        <div style={card}>
          <div style={mono()}>deadlines caught</div>
          <div style={{ ...bigNum, color: "var(--color-accent)" }}>{s.caught} of {s.clockedN}</div>
          <p style={{ margin: ".5rem 0 0", fontSize: ".8125rem", color: "var(--color-ink-3)" }}>{s.disguised} of them were hidden in routine-looking mail.</p>
        </div>
        <div style={card}>
          <div style={mono()}>false alarms</div>
          <div style={{ ...bigNum, color: "var(--color-neg)" }}>{s.falseAlarms}</div>
          <p style={{ margin: ".5rem 0 0", fontSize: ".8125rem", color: "var(--color-ink-3)" }}>of the {s.unclockedN} messages with no deadline were flagged as having one.</p>
        </div>
        <div style={card}>
          <div style={mono()}>sorted without you</div>
          <div style={{ ...bigNum, color: "var(--color-ink)" }}>{s.automated} <span style={{ fontSize: "1.125rem", color: "var(--color-ink-3)", fontWeight: 500 }}>/ {s.total}</span></div>
          <p style={{ margin: ".5rem 0 0", fontSize: ".8125rem", color: "var(--color-ink-3)" }}>{s.escalated} need a person to decide.</p>
        </div>
      </div>
      <p style={{ margin: ".75rem 0 0", fontSize: ".75rem", color: "var(--color-ink-3)" }}>
        {firm.measured
          ? measuring
            ? "These are the tested results, at the setting chosen in testing. Move the autonomy slider to see how they change."
            : "You have moved the autonomy slider, so these numbers show that setting, not the tested results. Autonomy > Tested puts it back."
          : "An illustrative example: the AI's answers for this firm are made up to show the idea. Architecture firm is the tested example."}
      </p>

      <div style={{ display: "grid", gap: "1.5rem 2rem", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,20rem),1fr))", marginTop: "2rem", alignItems: "start" }}>
        <section>
          <h2 style={h2mono}>Needs attention first</h2>
          <ul style={{ listStyle: "none", margin: ".625rem 0 0", padding: 0, borderTop: "1px solid var(--color-rule)" }}>
            {view.attention.map((a) => (
              <li key={a.id} style={{ borderBottom: "1px solid var(--color-rule)" }}>
                <button type="button" onClick={() => open(a.id)} style={{ display: "grid", gridTemplateColumns: "auto minmax(0,1fr) auto", gap: ".75rem", alignItems: "baseline", width: "100%", textAlign: "left", border: 0, background: "transparent", padding: ".625rem .25rem", font: "inherit", cursor: "pointer", minHeight: 44 }}>
                  <span style={{ ...mono({ fontSize: ".625rem", letterSpacing: ".06em", color: a.isAlert || a.priority === "urgent" ? "var(--color-neg)" : "var(--color-warn)" }), border: "1px solid currentColor", borderRadius: 3, padding: "0 4px" }}>{a.isAlert ? "deadline" : PRI[a.priority ?? "normal"]}</span>
                  <span style={{ minWidth: 0 }}><span style={{ display: "block", color: "var(--color-ink)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.subject}</span><span style={{ display: "block", fontSize: ".8125rem", color: "var(--color-ink-3)" }}>{a.line}</span></span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: ".6875rem", color: a.dueSoon ? "var(--color-neg)" : "var(--color-ink-3)", whiteSpace: "nowrap" }}>{a.due}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h2 style={h2mono}>Who gets what</h2>
          <ul style={{ listStyle: "none", margin: ".625rem 0 0", padding: 0, borderTop: "1px solid var(--color-rule)" }}>
            {view.lanes.map((l) => (
              <li key={l.name} style={{ display: "grid", gridTemplateColumns: "28px minmax(0,1fr) 3rem", gap: ".75rem", alignItems: "center", padding: ".5rem .25rem", borderBottom: "1px solid var(--color-rule)" }}>
                <Avatar initials={l.initials} bg={l.isDecideLane ? "var(--color-graphite)" : "var(--color-accent-soft)"} fg={l.isDecideLane ? "var(--color-on-graphite)" : "var(--color-accent)"} />
                <span style={{ minWidth: 0 }}><span style={{ display: "block", color: "var(--color-ink)", fontWeight: 500, fontSize: ".875rem" }}>{l.name}</span><span style={{ display: "block", fontSize: ".75rem", color: "var(--color-ink-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.role}</span></span>
                <span style={{ textAlign: "right", fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "1.125rem", color: l.count ? "var(--color-ink)" : "var(--color-ink-3)", fontVariantNumeric: "tabular-nums" }}>{l.count}</span>
              </li>
            ))}
          </ul>
          <p style={{ margin: ".75rem 0 0", fontSize: ".8125rem", color: "var(--color-ink-3)" }}>{view.quietLine}</p>
        </section>
      </div>
    </>
  );
}

function Inbox({ view, firm, openId, setOpenId, results }: { view: V; firm: Firm; openId: string | null; setOpenId: (id: string | null) => void; results: Readonly<Record<string, ClassifyOk>> }) {
  const [onlyDiff, setOnlyDiff] = useState(false);
  const checked = view.inboxRows.filter((r) => r.check !== null);
  const differs = (r: V["inboxRows"][number]) => r.check !== null && !(r.check.topics && r.check.route && r.check.priority && r.check.clock);
  const diffCount = checked.filter(differs).length;
  const rows = onlyDiff ? view.inboxRows.filter(differs) : view.inboxRows;
  return (
    <>
      {checked.length > 0 && (
        <label style={{ display: "flex", alignItems: "center", gap: ".5rem", margin: "0 0 .75rem", fontSize: ".8125rem", color: "var(--color-ink-2)", cursor: "pointer" }}>
          <input type="checkbox" checked={onlyDiff} onChange={(e) => setOnlyDiff(e.target.checked)} style={{ accentColor: "var(--color-accent)" }} />
          Show only messages where Sift got something wrong ({diffCount} of {checked.length} at this setting)
        </label>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.1fr) minmax(0,2fr) minmax(0,1.3fr) 5.5rem 6rem", gap: ".75rem", padding: "0 .75rem .5rem", borderBottom: "1px solid var(--color-rule-2)", ...mono() }}>
        <span>from</span><span>subject</span><span>sent to</span><span>priority</span><span style={{ textAlign: "right" }}>received</span>
      </div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {rows.map((m) => {
          const isOpen = openId === m.id;
          return (
            <li key={m.id} style={{ borderBottom: "1px solid var(--color-rule)" }}>
              <button type="button" onClick={() => setOpenId(isOpen ? null : m.id)} aria-expanded={isOpen}
                style={{ display: "grid", gridTemplateColumns: "minmax(0,1.1fr) minmax(0,2fr) minmax(0,1.3fr) 5.5rem 6rem", gap: ".75rem", alignItems: "baseline", width: "100%", textAlign: "left", border: 0, cursor: "pointer", padding: ".75rem .75rem", borderLeft: `3px solid ${isOpen ? "var(--color-accent)" : differs(m) ? "var(--color-warn)" : "transparent"}`, background: isOpen ? "var(--color-accent-soft)" : "transparent", font: "inherit", minHeight: 48 }}>
                <span style={{ fontSize: ".875rem", color: "var(--color-ink-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{m.fromName}</span>
                <span style={{ minWidth: 0, fontSize: ".9375rem", color: "var(--color-ink)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.subject}</span>
                <span style={{ fontSize: ".8125rem", color: "var(--color-ink-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{m.routeShort}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: ".625rem", letterSpacing: ".05em", textTransform: "uppercase", color: m.clockFlagged ? "var(--color-neg)" : m.priority ? priColor(m.priority) : "var(--color-warn)", whiteSpace: "nowrap" }}>{m.clockFlagged ? `due ${m.priority ? PRI[m.priority] : ""}` : m.priority ? PRI[m.priority] : "unclear"}</span>
                <span style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontSize: ".6875rem", color: "var(--color-ink-3)", whiteSpace: "nowrap" }}>{m.when}</span>
              </button>
              {isOpen && <ReadView row={m} measured={firm.measured ?? null} live={results[`${firm.id}/${m.id}`] ?? null} />}
            </li>
          );
        })}
      </ul>
      {onlyDiff && rows.length === 0 && <p style={{ margin: "1rem 0 0", color: "var(--color-ink-3)" }}>Sift got every message right at this setting.</p>}
    </>
  );
}

function Deadlines({ view, open }: { view: V; open: (id: string) => void }) {
  return (
    <>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, borderTop: "1px solid var(--color-rule)" }}>
        {view.deadlines.map((d) => (
          <li key={d.id} style={{ borderBottom: "1px solid var(--color-rule)" }}>
            <button type="button" onClick={() => open(d.id)} style={{ display: "grid", gridTemplateColumns: "6.5rem minmax(0,1fr) auto", gap: "1rem", alignItems: "center", width: "100%", textAlign: "left", border: 0, background: "transparent", padding: ".75rem .5rem", font: "inherit", cursor: "pointer", minHeight: 48 }}>
              <span><span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: ".8125rem", color: d.hasDate ? urgencyColor(d.urgency) : "var(--color-warn)", fontVariantNumeric: "tabular-nums" }}>{d.date}</span><span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: ".6875rem", color: "var(--color-ink-3)" }}>{d.days}</span></span>
              <span style={{ minWidth: 0 }}><span style={{ display: "block", color: "var(--color-ink)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.subject}</span><span style={{ display: "block", fontSize: ".8125rem", color: "var(--color-ink-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.kind} · {d.owner}</span><span style={{ display: "block", marginTop: 5, height: 4, borderRadius: 2, background: "var(--color-paper-3)", position: "relative", overflow: "hidden" }}><span style={{ position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: 2, width: `${d.widthPct}%`, background: d.hasDate ? urgencyColor(d.urgency) : "var(--color-rule-2)" }} /></span></span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: ".625rem", letterSpacing: ".06em", textTransform: "uppercase", color: stateColor(d.state), whiteSpace: "nowrap" }}>{d.state}</span>
            </button>
          </li>
        ))}
      </ul>
      <p style={{ margin: "1rem 0 0", fontSize: ".8125rem", color: "var(--color-ink-3)", maxWidth: "60ch" }}>A deadline counts as caught when Sift is confident enough that one is running, or when the firm's own records confirm it. Missed deadlines and false alarms are listed here too, so you can check the catch count for yourself.</p>
    </>
  );
}

function People({ view, open }: { view: V; open: (id: string) => void }) {
  return (
    <>
      <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fill,minmax(min(100%,15rem),1fr))" }}>
        {view.lanes.map((l) => (
          <div key={l.name} style={{ ...card, padding: ".875rem 1rem", minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: ".625rem" }}>
              <Avatar initials={l.initials} size={30} bg={l.isDecideLane ? "var(--color-graphite)" : "var(--color-accent-soft)"} fg={l.isDecideLane ? "var(--color-on-graphite)" : "var(--color-accent)"} />
              <span style={{ minWidth: 0, flex: "1 1 auto" }}><span style={{ display: "block", fontWeight: 600, color: "var(--color-ink)", letterSpacing: "-.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.name}</span><span style={{ display: "block", fontSize: ".75rem", color: "var(--color-ink-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.role}</span></span>
              <span style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "1.25rem", color: l.count ? "var(--color-ink)" : "var(--color-ink-3)", fontVariantNumeric: "tabular-nums" }}>{l.count}</span>
            </div>
            <ul style={{ listStyle: "none", margin: ".75rem 0 0", padding: 0, display: "flex", flexDirection: "column", gap: ".25rem" }}>
              {l.items.map((i) => (
                <li key={i.id}><button type="button" onClick={() => open(i.id)} style={{ display: "grid", gridTemplateColumns: "auto minmax(0,1fr)", gap: ".5rem", alignItems: "baseline", width: "100%", textAlign: "left", border: 0, background: "transparent", padding: ".25rem 0", cursor: "pointer", font: "inherit", minHeight: 30 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: ".5625rem", letterSpacing: ".06em", textTransform: "uppercase", color: i.isAlert ? "var(--color-neg)" : i.unclear ? "var(--color-warn)" : i.priority ? priColor(i.priority) : "var(--color-ink-3)", border: "1px solid currentColor", borderRadius: 3, padding: "0 3px" }}>{i.isAlert ? "deadline" : i.unclear ? "?" : PRI[i.priority ?? "normal"]}</span>
                  <span style={{ fontSize: ".875rem", color: "var(--color-ink-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{i.subject}</span>
                </button></li>
              ))}
            </ul>
            {l.empty && <p style={{ margin: ".75rem 0 0", fontSize: ".875rem", color: "var(--color-ink-3)" }}>Nothing in this inbox.</p>}
          </div>
        ))}
      </div>
      <p style={{ margin: "1.25rem 0 0", fontSize: ".8125rem", color: "var(--color-ink-3)" }}>{view.quietLine}</p>
    </>
  );
}

function Decide({ view, open }: { view: V; open: (id: string) => void }) {
  return (
    <>
      {view.decisions.length === 0 && <p style={{ margin: 0, color: "var(--color-ink-3)" }}>Nothing is waiting on a person at this setting.</p>}
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: ".75rem" }}>
        {view.decisions.map((d) => (
          <li key={d.id} style={{ border: "1px solid var(--color-rule)", borderLeft: "3px solid var(--color-warn)", borderRadius: "var(--radius-md)", padding: ".875rem 1.125rem" }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: ".25rem 1rem", alignItems: "baseline" }}><b style={{ color: "var(--color-ink)", fontWeight: 600 }}>{d.subject}</b><span style={{ fontSize: ".8125rem", color: "var(--color-ink-3)" }}>{d.fromName}</span></div>
            <ul style={{ margin: ".5rem 0 0", paddingLeft: "1.1rem", fontSize: ".9375rem", color: "var(--color-ink-2)" }}>{d.items.map((t, i) => <li key={i}>{t}</li>)}</ul>
            <div style={{ display: "flex", flexWrap: "wrap", gap: ".5rem 1.25rem", marginTop: ".625rem", fontSize: ".8125rem", color: "var(--color-ink-3)" }}><span>{d.doneLine}</span><button type="button" onClick={() => open(d.id)} style={{ border: 0, background: "transparent", padding: 0, font: "inherit", fontSize: ".8125rem", color: "var(--color-accent)", cursor: "pointer", textDecoration: "underline" }}>Open in inbox</button></div>
          </li>
        ))}
      </ul>
      <p style={{ margin: "1.25rem 0 0", fontSize: ".8125rem", color: "var(--color-ink-3)", maxWidth: "60ch" }}>Each item comes with the message, the records it matched and Sift's nine answers, so nobody has to go back through the mailbox. Move the autonomy slider left and this list grows; move it right and it shrinks.</p>
    </>
  );
}

function Autonomy({ view, firm, setDial, dialLabel, dialInput, measuring, toMeasured }: { view: V; firm: Firm; setDial: (n: number) => void; dialLabel: string; dialInput: (id: string) => React.ReactNode; measuring: boolean; toMeasured: () => void }) {
  const th = view.thresholds;
  const preset = (label: string, value: number) => (
    <button type="button" onClick={() => setDial(value)} style={{ minHeight: 32, padding: "0 .75rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-rule-2)", background: "var(--color-paper)", font: "inherit", fontSize: ".8125rem", cursor: "pointer", color: "var(--color-ink-2)" }}>{label}</button>
  );
  return (
    <div style={{ display: "grid", gap: "1.5rem 2.5rem", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,20rem),1fr))", alignItems: "start" }}>
      <div style={{ ...card, padding: "1.25rem 1.5rem", background: "var(--color-paper-2)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "baseline" }}><label htmlFor="dial2" style={{ fontWeight: 500, color: "var(--color-ink)" }}>How much should Sift do on its own?</label><span style={{ fontFamily: "var(--font-mono)", fontSize: ".75rem", color: "var(--color-accent)" }}>{dialLabel}</span></div>
        {dialInput("dial2")}
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".75rem", color: "var(--color-ink-3)", marginTop: ".125rem" }}><span>Check almost everything with me</span><span>Handle it on your own</span></div>
        <div style={{ display: "flex", gap: ".5rem", marginTop: "1rem", flexWrap: "wrap" }}>
          {firm.measured && <button type="button" onClick={toMeasured} aria-pressed={measuring} style={{ minHeight: 32, padding: "0 .75rem", borderRadius: "var(--radius-md)", border: `1px solid ${measuring ? "var(--color-accent)" : "var(--color-rule-2)"}`, background: measuring ? "var(--color-accent-soft)" : "var(--color-paper)", font: "inherit", fontSize: ".8125rem", cursor: "pointer", color: measuring ? "var(--color-accent)" : "var(--color-ink-2)" }}>Tested</button>}
          {preset("Cautious", 0.15)}{preset("Default", 0.6)}{preset("Hands off", 0.95)}
        </div>
        {firm.measured && <p style={{ margin: ".625rem 0 0", fontSize: ".75rem", color: "var(--color-ink-3)" }}>{measuring ? "Tested is the setting chosen by testing Sift on this inbox. Every number here matches the published results." : "You are off the tested setting: the numbers show what this setting would do, not the published results."}</p>}
        <ul style={{ listStyle: "none", margin: "1.25rem 0 0", padding: ".875rem 0 0", borderTop: "1px solid var(--color-rule)", display: "flex", flexDirection: "column", gap: ".375rem", fontSize: ".875rem" }}>
          <li style={{ display: "flex", gap: ".75rem" }}><span style={{ flex: "none", minWidth: "6.5rem", fontFamily: "var(--font-mono)", fontSize: ".75rem", color: "var(--color-ink)" }}>{th.act.toFixed(2)} and up</span><span>Sure enough: Sift sends it to the right person on its own</span></li>
          <li style={{ display: "flex", gap: ".75rem" }}><span style={{ flex: "none", minWidth: "6.5rem", fontFamily: "var(--font-mono)", fontSize: ".75rem", color: "var(--color-ink)" }}>{th.review.toFixed(2)} to {th.act.toFixed(2)}</span><span>Not sure: Sift leaves it for a person to decide</span></li>
          <li style={{ display: "flex", gap: ".75rem" }}><span style={{ flex: "none", minWidth: "6.5rem", fontFamily: "var(--font-mono)", fontSize: ".75rem", color: "var(--color-ink)" }}>under {th.review.toFixed(2)}</span><span>Clearly not this kind of message: no action for it</span></li>
          <li style={{ display: "flex", gap: ".75rem" }}><span style={{ flex: "none", minWidth: "6.5rem", fontFamily: "var(--font-mono)", fontSize: ".75rem", color: "var(--color-neg)" }}>deadline {th.clockAct.toFixed(2)} and up</span><span>Deadline alert to {firm.owner}, whatever the message is about</span></li>
        </ul>
      </div>
      <div>
        <h2 style={h2mono}>What changes at this setting</h2>
        <ul style={{ listStyle: "none", margin: ".625rem 0 0", padding: 0, borderTop: "1px solid var(--color-rule)" }}>
          {view.effects.map((e, i) => (
            <li key={i} style={{ display: "grid", gridTemplateColumns: "3.5rem minmax(0,1fr)", gap: "1rem", alignItems: "baseline", padding: ".625rem .25rem", borderBottom: "1px solid var(--color-rule)" }}>
              <span style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "1.375rem", color: TONE[e.tone], fontVariantNumeric: "tabular-nums", letterSpacing: "-.02em" }}>{e.n}</span>
              <span><span style={{ display: "block", color: "var(--color-ink)", fontWeight: 500 }}>{e.label}</span><span style={{ display: "block", fontSize: ".8125rem", color: "var(--color-ink-3)" }}>{e.sub}</span></span>
            </li>
          ))}
        </ul>
        <p style={{ margin: "1rem 0 0", fontSize: ".8125rem", color: "var(--color-ink-3)", maxWidth: "52ch" }}>The numbers on the left are Sift's confidence, from 0 to 1, on each of its nine questions about a message. Moving the slider only moves these lines; the AI is not asked again, so trying a setting costs nothing and every page updates instantly. The deadline line moves too: the more you let Sift handle, the surer it must be before it raises a deadline alert, so a cautious setting flags fainter deadlines.</p>
      </div>
    </div>
  );
}

function Savings({ view, firm, handSecs, setHandSecs, lookupSecs, setLookupSecs }: { view: V; firm: Firm; handSecs: number; setHandSecs: (n: number) => void; lookupSecs: number; setLookupSecs: (n: number) => void }) {
  const sav = view.savings;
  const numInput = (value: number, set: (n: number) => void, min: number, max: number) => (
    <input type="number" min={min} max={max} step={15} value={value} onChange={(e) => set(Math.max(0, Number(e.target.value) || 0))}
      style={{ width: "5.5rem", minHeight: 36, padding: "0 .5rem", border: "1px solid var(--color-rule-2)", borderRadius: "var(--radius-md)", background: "var(--color-paper)", color: "var(--color-ink)", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: ".875rem" }} />
  );
  return (
    <div style={{ display: "grid", gap: "1.5rem 2.5rem", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,20rem),1fr))", alignItems: "start" }}>
      <div>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 6rem 6rem", gap: ".75rem", padding: "0 .25rem .5rem", borderBottom: "1px solid var(--color-rule-2)", ...mono() }}><span>time on this inbox (estimate)</span><span style={{ textAlign: "right" }}>by hand</span><span style={{ textAlign: "right" }}>with sift</span></div>
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {sav.rows.map((r, i) => (
            <li key={i} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 6rem 6rem", gap: ".75rem", padding: ".625rem .25rem", borderBottom: "1px solid var(--color-rule)", alignItems: "baseline" }}>
              <span><span style={{ display: "block", color: "var(--color-ink)", fontWeight: 500, fontSize: ".9375rem" }}>{r.label}</span><span style={{ display: "block", fontSize: ".8125rem", color: "var(--color-ink-3)" }}>{r.sub}</span></span>
              <span style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontSize: ".875rem", color: "var(--color-ink-2)", fontVariantNumeric: "tabular-nums" }}>{r.hand}</span>
              <span style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontSize: ".875rem", color: "var(--color-accent)", fontVariantNumeric: "tabular-nums" }}>{r.sift}</span>
            </li>
          ))}
          <li style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 6rem 6rem", gap: ".75rem", padding: ".75rem .25rem", alignItems: "baseline" }}>
            <span style={{ color: "var(--color-ink)", fontWeight: 600 }}>Total</span>
            <span style={{ textAlign: "right", fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "1.25rem", color: "var(--color-ink)", fontVariantNumeric: "tabular-nums", letterSpacing: "-.02em" }}>{sav.handToday}</span>
            <span style={{ textAlign: "right", fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "1.25rem", color: "var(--color-accent)", fontVariantNumeric: "tabular-nums", letterSpacing: "-.02em" }}>{sav.siftToday}</span>
          </li>
        </ul>
        <div style={{ marginTop: "1.5rem", display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,8rem),1fr))" }}>
          <div><div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "1.75rem", letterSpacing: "-.03em", lineHeight: 1, color: "var(--color-accent)", fontVariantNumeric: "tabular-nums" }}>{sav.savedToday}</div><p style={{ margin: ".25rem 0 0", fontSize: ".8125rem", color: "var(--color-ink-3)" }}>back on these {firm.messages.length} messages (estimate)</p></div>
          <div><div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "1.75rem", letterSpacing: "-.03em", lineHeight: 1, color: "var(--color-ink)", fontVariantNumeric: "tabular-nums" }}>{sav.savedWeek}</div><p style={{ margin: ".25rem 0 0", fontSize: ".8125rem", color: "var(--color-ink-3)" }}>a week, at this volume (estimate)</p></div>
          <div><div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "1.75rem", letterSpacing: "-.03em", lineHeight: 1, color: "var(--color-ink)", fontVariantNumeric: "tabular-nums" }}>{sav.savedMonth}</div><p style={{ margin: ".25rem 0 0", fontSize: ".8125rem", color: "var(--color-ink-3)" }}>a month, 21 working days (estimate)</p></div>
        </div>
      </div>
      <div style={{ ...card, padding: "1.25rem 1.5rem", background: "var(--color-paper-2)" }}>
        <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 600, color: "var(--color-ink)" }}>Assumptions, yours to change</h2>
        <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", marginTop: "1rem", fontSize: ".875rem" }}><span>Seconds to read and sort one message by hand (estimate)</span>{numInput(handSecs, setHandSecs, 15, 600)}</label>
        <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", marginTop: ".75rem", fontSize: ".875rem" }}><span>Seconds to look a message up in {firm.sourcesShort} (estimate)</span>{numInput(lookupSecs, setLookupSecs, 0, 900)}</label>
        <ul style={{ margin: "1.25rem 0 0", padding: ".875rem 0 0 1.1rem", borderTop: "1px solid var(--color-rule)", fontSize: ".8125rem", color: "var(--color-ink-2)", display: "flex", flexDirection: "column", gap: ".375rem" }}>
          <li>With Sift, a person still spends {HUMAN_TIME_ESTIMATE.decideSecondsPerItem} seconds on each item that needs a decision and {HUMAN_TIME_ESTIMATE.acknowledgeSecondsPerAlert} seconds on each deadline alert, plus {HUMAN_TIME_ESTIMATE.glanceSecondsPerWorkingDay} seconds a working day glancing over the sorted list. Every time on this page is an estimate built from these.</li>
          <li>Deadlines are not given a time value. One missed {firm.clockExample} can cost more than a year of morning sorting, so deadline alerts are counted, not priced.</li>
          <li>This is not a measured before-and-after result. It is arithmetic on these {firm.messages.length} invented messages over {view.span.workingDays} working days, at the current setting. The weekly and monthly figures scale up the daily rate, and both rates above are estimates you can change.</li>
        </ul>
      </div>
    </div>
  );
}

function How({ firm }: { firm: Firm }) {
  const P = ({ h, children }: { h: string; children: React.ReactNode }) => (
    <div><h2 style={{ margin: 0, fontSize: "1.0625rem", fontWeight: 600, color: "var(--color-ink)" }}>{h}</h2><p style={{ margin: ".375rem 0 0", color: "var(--color-ink-2)" }}>{children}</p></div>
  );
  return (
    <div style={{ maxWidth: "40rem", display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <P h="The problem">A shared mailbox fills overnight and someone sorts it by hand every morning. The message that starts a deadline often reads exactly like the routine ones around it. Rules based on sender and keyword cannot help, because they cannot see {firm.sourcesLong}, and that is where the real urgency lives.</P>
      <P h="What Sift does">It sorts the whole inbox before anyone opens it. Each message goes to the person who owns it, every deadline goes to {firm.owner}, and anything unclear goes to one short list for a person to decide. Each message shows what Sift did and why, in plain words.</P>
      <P h="1. Read each message once">The AI reads each message one time and answers nine yes/no questions about it: eight about what kind of message it is, and one about whether a deadline is running. Each answer is a confidence from 0 to 1, shown as a bar when you open the message.</P>
      <P h="2. Check the firm's own records">Sift then matches the message to {firm.sourcesLong} and reads what is scheduled. Priority comes from those records, not from how urgent the email sounds, so two near-identical messages can get different priorities.</P>
      <P h="3. Send it on, then stop">Each part of the message goes to the person who owns it, so a message about two things reaches two people. Every deadline goes to {firm.owner}. If a deadline has no date, Sift asks a person to set one rather than guess. Anything uncertain goes to Needs a decision with the reason attached.</P>
      <P h="What Sift never does">It never sends email, never changes a record, never deletes a message and never invents a date. Messages that need no one, like sales pitches, are labelled and left in place.</P>
      <P h="You set how much it handles">The autonomy slider sets how sure Sift must be before it acts on its own. Left, it checks almost everything with you and flags even faint deadlines. Right, it handles more by itself. Moving it does not ask the AI again, so every page updates instantly.</P>
      <P h="Every decision is on the record">Sift keeps a log of every message it read, what it decided and why. Each run has a hard spending cap, and a message is never acted on twice.</P>
      <p style={{ margin: 0, fontSize: ".8125rem", color: "var(--color-ink-3)" }}>A self-built experiment on invented data. Every firm, person, project and message here is made up. The architecture firm's numbers come from a recorded test run; the other firms are illustrative. Switch the firm in the sidebar to see the same system read a different trade's mail.</p>
    </div>
  );
}
