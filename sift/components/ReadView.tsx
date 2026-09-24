"use client";

import type { CSSProperties } from "react";
import type { Priority } from "../src/types";
import type { InboxRow, ProbBar, VerdictLine } from "../src/view";
import type { ClassifyOk } from "../lib/classify";

/**
 * One decided message, opened.
 *
 * The left column is the message as it arrived and, when there is one, the line about why it
 * matters. The right column is what Sift did: the headline, one row per person it routed to, and the
 * footnote naming what a person still has to do. Below both sit the nine judgments as bars, each with
 * the current line from the autonomy dial marked on it. Colours come from the tokens; the semantics
 * (band, priority, kind) come from the derived row.
 */

const priColor = (p: Priority | null): string =>
  p === "urgent" ? "var(--color-neg)" : p === "high" ? "var(--color-warn)" : p === "normal" ? "var(--color-ink-2)" : "var(--color-ink-3)";

const fillFor = (b: ProbBar): string =>
  b.isClock
    ? b.band === "act" ? "var(--color-neg)" : "var(--color-rule-2)"
    : b.band === "act" ? "var(--color-accent)" : b.band === "review" ? "var(--color-warn)" : "var(--color-rule-2)";

const avatarBg = (kind: VerdictLine["kind"]): string =>
  kind === "alert" ? "var(--color-neg)" : kind === "person" ? "var(--color-graphite-accent)" : "var(--color-graphite)";

const avatarFg = (kind: VerdictLine["kind"]): string =>
  kind === "none" ? "var(--color-on-graphite-2)" : "var(--color-accent-ink)";

const cardStyle: CSSProperties = {
  borderRadius: "var(--radius-lg)", padding: "1rem 1.25rem",
  background: "var(--color-graphite)", color: "var(--color-on-graphite)",
};

const mark = (ok: boolean, what: string) => (
  <span aria-label={`${what} ${ok ? "matches" : "differs"}`} style={{ fontFamily: "var(--font-mono)", fontSize: ".625rem", letterSpacing: ".06em", textTransform: "uppercase", padding: "1px 6px", borderRadius: 3, border: "1px solid currentColor", color: ok ? "var(--color-pos)" : "var(--color-neg)" }}>{what} {ok ? "right" : "wrong"}</span>
);

export function ReadView({ row, measured = null, live = null }: { row: InboxRow; measured?: { runDate: string; model: string } | null; live?: ClassifyOk | null }) {
  const c = row.check;
  return (
    <div style={{ padding: ".5rem 1rem 1.5rem 1.25rem", borderLeft: "3px solid var(--color-accent)", background: "var(--color-paper)" }}>
      <div style={{ display: "grid", gap: "1.5rem 2.5rem", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,20rem),1fr))", alignItems: "start" }}>
        <div>
          <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--color-ink-3)" }}>{row.fromEmail} · {row.received}</p>
          <p style={{ margin: ".5rem 0 0", color: "var(--color-ink)", whiteSpace: "pre-wrap", fontSize: "var(--text-base)", maxWidth: "56ch" }}>{row.body}</p>
          {row.note && (
            <p style={{ margin: "1rem 0 0", fontSize: "var(--text-sm)", color: "var(--color-ink-3)", maxWidth: "56ch" }}>
              <b style={{ color: "var(--color-ink-2)", fontWeight: 500 }}>Why this one matters.</b> {row.note}
            </p>
          )}
        </div>
        <div style={cardStyle}>
          <div className="mono" style={{ display: "flex", alignItems: "center", gap: ".5rem", color: "var(--color-on-graphite-2)" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--color-graphite-accent)" }} />sift
          </div>
          <p style={{ margin: ".5rem 0 0", fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "var(--text-lg)", letterSpacing: "-.02em", lineHeight: 1.25, color: "var(--color-accent-ink)" }}>{row.headline}</p>
          <ul style={{ listStyle: "none", margin: ".75rem 0 0", padding: 0, display: "flex", flexDirection: "column", gap: ".5rem" }}>
            {row.verdictLines.map((l, i) => (
              <li key={i} style={{ display: "grid", gridTemplateColumns: "26px minmax(0,1fr)", gap: ".625rem", alignItems: "start" }}>
                <span style={{ width: 26, height: 26, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-mono)", fontSize: ".5625rem", fontWeight: 500, background: avatarBg(l.kind), color: avatarFg(l.kind) }}>{l.initials || "-"}</span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", color: "var(--color-accent-ink)", fontWeight: 500, fontSize: "var(--text-base)" }}>{l.who}</span>
                  <span style={{ display: "block", fontSize: "var(--text-sm)", color: "var(--color-on-graphite)" }}>{l.why}</span>
                </span>
              </li>
            ))}
          </ul>
          {row.foot && (
            <p style={{ margin: ".75rem 0 0", paddingTop: ".625rem", borderTop: "1px solid var(--color-on-graphite-3)", fontSize: "var(--text-sm)", color: "var(--color-on-graphite)" }}>{row.foot}</p>
          )}
        </div>
      </div>
      <div style={{ marginTop: "1.25rem", display: "grid", gap: ".5rem 1.5rem", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,10rem),1fr))" }}>
        {row.probs.map((b, i) => (
          <div key={i}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: ".5rem", alignItems: "baseline" }}>
              <span style={{ fontSize: ".75rem", color: b.band === "off" ? "var(--color-ink-3)" : "var(--color-ink)" }}>{b.question}</span>
              <span className="mono" style={{ fontSize: ".6875rem", color: b.band === "act" ? "var(--color-accent)" : "var(--color-ink-3)" }}>{b.value.toFixed(2)}</span>
            </div>
            <div style={{ position: "relative", height: 5, marginTop: 3, borderRadius: 2, background: "var(--color-paper-3)", overflow: "hidden" }}>
              <span style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: `${b.value * 100}%`, background: fillFor(b), transition: "width 240ms var(--ease-out)" }} />
              <span style={{ position: "absolute", top: -2, bottom: -2, width: 2, left: `calc(${b.markPct}% - 1px)`, background: b.isClock ? "var(--color-neg)" : "var(--color-ink)", opacity: 0.6 }} />
            </div>
          </div>
        ))}
      </div>
      <p style={{ margin: ".625rem 0 0", fontSize: ".75rem", color: "var(--color-ink-3)" }}>
        {live?.live
          ? `Sift's nine yes/no questions, answered just now in one live request (${live.judgment.model}). Each bar is the AI's confidence, not a tested accuracy rate. The mark on each bar is where the autonomy slider puts the line.`
          : measured
            ? `Sift's nine yes/no questions, answered once and recorded in the test run on ${measured.runDate} (${measured.model}). Each bar is the AI's confidence, not a tested accuracy rate. The mark on each bar is where the autonomy slider puts the line.`
            : "Sift's nine yes/no questions. For this firm the answers are illustrative, not from a real run. The mark on each bar is where the autonomy slider puts the line."}
      </p>
      {live && !live.live && live.notice && (
        <p role="status" style={{ margin: ".375rem 0 0", fontSize: ".75rem", color: "var(--color-warn)" }}>{live.notice}</p>
      )}
      {c && (
        <div style={{ marginTop: ".875rem", paddingTop: ".75rem", borderTop: "1px solid var(--color-rule)" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: ".375rem", alignItems: "center" }}>
            <span style={{ fontSize: ".75rem", color: "var(--color-ink-2)", marginRight: ".25rem" }}>Compared with the correct answer</span>
            {mark(c.topics, "topics")}{mark(c.route, "route")}{mark(c.priority, "priority")}{mark(c.clock, "deadline")}
          </div>
          {!(c.topics && c.route && c.priority && c.clock) && (
            <p style={{ margin: ".375rem 0 0", fontSize: ".75rem", color: "var(--color-ink-3)" }}>
              Correct answer: {c.labelled.topics.join(" and ")}; reaches {c.labelled.route.length ? c.labelled.route.join(", ") : "no one"}; {c.labelled.priority}; {c.labelled.clocked ? "has a deadline" : "no deadline"}.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export { priColor };
