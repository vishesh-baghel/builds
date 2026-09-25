import { topVerdict, type Thresholds } from "../src/policy";
import { K, F, VN, judgmentOf, pct, type Item, type Status } from "./ui";

/** Why an item waits for a person, in the viewer's words. */
export function personReason(it: Item, t: Thresholds): string {
  if (it.evidence < t.evidence) return `Tally is ${pct(it.evidence / 4)} sure this was done. Your setting adds charges on its own only at ${pct(t.evidence / 4)} or more.`;
  if (it.covered >= t.covered) return `Tally says this is billable, but its plan check says the agreement may cover it (${pct(it.covered)}). You decide.`;
  return "Too close to call. You decide.";
}

export const drafts = (it: Item, st: Status) => Boolean(it.draftedLine) && ["counted", "person", "rejected"].includes(st);

/**
 * The four checks on one piece of work, as bars. `shown` false draws the same bars empty, so a
 * card has the same height before and after its judgment arrives.
 */
export function CheckBars({ it, st, t, shown = true, animate = true, compact = false }: { it: Item; st: Status; t: Thresholds; shown?: boolean; animate?: boolean; compact?: boolean }) {
  const top = topVerdict(judgmentOf(it));
  const drafted = drafts(it, st);
  const act = t.evidence / 4;
  const bars: { q: string; v: number | null; fill: string; mark: number | null; markColor: string }[] = [
    { q: shown ? VN[top] : "Billing status", v: it.verdict[top], fill: it.verdict[top] >= 0.55 ? K.accent : K.rule2, mark: null, markColor: K.ink },
    { q: compact ? "In the plan" : "Included in the plan", v: it.covered, fill: it.covered >= 0.5 ? K.accent : K.rule2, mark: null, markColor: K.ink },
    { q: compact ? "Note backs it up" : "Note backs up the charge", v: drafted ? 1 - it.unsupported : null, fill: drafted && it.unsupported >= t.unsupported ? K.neg : K.accent, mark: drafted ? 1 - t.unsupported : null, markColor: K.neg },
    { q: "Sure it was done", v: it.evidence / 4, fill: it.evidence / 4 >= act ? K.accent : K.warn, mark: act, markColor: K.ink },
  ];
  return (
    <div style={{ display: "grid", gap: compact ? ".25rem 1rem" : ".5rem 1.5rem", gridTemplateColumns: compact ? "repeat(4,minmax(0,1fr))" : "repeat(auto-fit,minmax(min(100%,10rem),1fr))" }}>
      {bars.map((b, k) => (
        <div key={k}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: ".5rem", alignItems: "baseline" }}>
            <span style={{ flex: "1 1 auto", minWidth: 0, fontSize: compact ? ".6875rem" : ".75rem", color: !shown || b.v == null ? K.ink3 : K.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{b.q}</span>
            <span style={{ flex: "none", whiteSpace: "nowrap", fontFamily: F.mono, fontSize: ".6875rem", fontVariantNumeric: "tabular-nums", color: b.fill === K.accent || b.fill === K.neg || b.fill === K.warn ? b.fill : K.ink3, visibility: shown ? "visible" : "hidden" }}>{b.v == null ? "no charge" : pct(b.v)}</span>
          </div>
          <div style={{ position: "relative", height: compact ? 5 : 6, marginTop: compact ? 2 : 4, borderRadius: 2, background: K.track, overflow: "hidden" }}>
            <span style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: shown && b.v != null ? `${b.v * 100}%` : "0%", background: b.fill, transition: animate ? "width 260ms cubic-bezier(.16,1,.3,1)" : "none" }} />
            {shown && b.mark != null && <span style={{ position: "absolute", top: -2, bottom: -2, width: 2, left: `calc(${(b.mark * 100).toFixed(1)}% - 1px)`, background: b.markColor, opacity: 0.6 }} />}
          </div>
        </div>
      ))}
    </div>
  );
}
