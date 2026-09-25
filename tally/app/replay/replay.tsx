"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckBars, personReason } from "../checks";
import {
  K, F, eyebrow, smallBtn, ST, money, day, draftText, labelOf, clauseText, statusOf,
  type Data, type Item, type Order, type Status,
} from "../ui";

/**
 * The run replayed item by item, for recording. It reads the same `public/replay.json` as the
 * sandbox and derives every status with the same `decideItem`, at the recommended setting.
 *
 * Layout never moves: the page is exactly one screen tall, and the items sit in seven fixed slots
 * whose cards have the same height before and after their judgment arrives. Nothing scrolls, so
 * 200x stays watchable.
 */

const SPEEDS = [1, 4, 30, 200] as const;
/** Milliseconds per item at 1x. */
const BASE_MS = 1_400;
/** The most work items any order has; every order is laid out in this many fixed slots. */
const SLOTS = 7;

interface Flat { o: number; i: number }

export function Replay() {
  const [data, setData] = useState<Data | null>(null);
  const [g, setG] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);

  useEffect(() => {
    fetch("/replay.json").then((r) => r.json()).then(setData).catch(() => setData(null));
  }, []);

  // Every item in run order, its status, and running totals, computed once.
  const run = useMemo(() => {
    if (!data) return null;
    const flat: Flat[] = [];
    const status: Status[][] = data.orders.map((o) => o.items.map((it) => statusOf(it, data.thresholds)));
    data.orders.forEach((o, oi) => o.items.forEach((_, i) => flat.push({ o: oi, i })));
    const found: number[] = [], human: number[] = [], blocked: number[] = [], wrong: number[] = [], wrongCents: number[] = [];
    let f = 0, h = 0, b = 0, w = 0, wc = 0;
    for (const { o, i } of flat) {
      const it = data.orders[o]!.items[i]!, st = status[o]![i]!;
      if (st === "counted") { if (it.expected === "recover") f += it.priceCents; else { w++; wc += it.priceCents; } }
      if (st === "person") h++;
      if (st === "rejected") b++;
      found.push(f); human.push(h); blocked.push(b); wrong.push(w); wrongCents.push(wc);
    }
    const trapAt = (pred: (it: Item, st: Status) => boolean) => flat.findIndex(({ o, i }) => pred(data.orders[o]!.items[i]!, status[o]![i]!));
    let trap = trapAt((it, st) => it.trap === "injection" && st === "rejected");
    if (trap < 0) trap = trapAt((_, st) => st === "rejected");
    return { flat, status, found, human, blocked, wrong, wrongCents, trap };
  }, [data]);

  useEffect(() => {
    if (!run || !playing) return;
    const id = setTimeout(() => {
      const next = g + 1;
      if (next >= run.flat.length) { setPlaying(false); return; }
      setG(next);
    }, BASE_MS / speed);
    return () => clearTimeout(id);
  }, [run, playing, speed, g]);

  const cur = run && g >= 0 ? run.flat[g]! : { o: 0, i: -1 };


  if (!data || !run) return <div style={{ padding: 40, color: K.ink3, fontFamily: F.sans }}>Loading the run…</div>;

  const order: Order = data.orders[cur.o]!;
  const statuses = run.status[cur.o]!;
  const at = (arr: number[]) => (g >= 0 ? arr[g]! : 0);
  const ordersDone = g < 0 ? 0 : cur.i === order.items.length - 1 ? cur.o + 1 : cur.o;
  const fast = speed >= 30;
  const revealed = (i: number) => i <= cur.i;

  const play = () => {
    if (!playing && g >= run.flat.length - 1) setG(-1);
    setPlaying(!playing);
  };

  return (
    <div className="rp-shell" style={{ height: "100vh", overflow: "hidden", display: "grid", gridTemplateRows: "auto minmax(0,1fr) auto", gap: "1.25rem", padding: "clamp(1rem,2.4vw,2rem) clamp(1rem,3vw,2.5rem)", background: K.paper, color: K.ink2, fontFamily: F.sans, fontSize: ".9375rem", lineHeight: 1.6 }}>
      <header className="rp-head" style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "end", gap: "1.5rem", paddingBottom: "1rem", borderBottom: `1px solid ${K.rule}` }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: ".5rem" }}>
            <span style={{ fontFamily: F.display, fontWeight: 600, fontSize: "1.375rem", color: K.ink, letterSpacing: "-.02em" }}>tally</span>
            <span style={{ fontSize: ".8125rem", color: K.ink3 }}>run replay</span>
          </div>
          <span style={{ fontSize: ".8125rem", color: K.ink3 }}>Brightline Mechanical · 1,000 technician notes checked against the invoices that went out</span>
        </div>
        <div style={{ textAlign: "center" }}>
          <span style={eyebrow}>unbilled $ found</span>
          <div style={{ fontFamily: F.display, fontWeight: 600, fontSize: "clamp(2.5rem,5vw,3.75rem)", lineHeight: 1, letterSpacing: "-.03em", color: K.accent, fontVariantNumeric: "tabular-nums", marginTop: ".25rem" }}>{money(at(run.found))}</div>
        </div>
        <dl style={{ display: "flex", justifyContent: "flex-end", gap: "1.75rem", margin: 0 }}>
          {([["work orders", `${ordersDone.toLocaleString("en-US")} / ${data.orders.length.toLocaleString("en-US")}`, K.ink], ["sent to a person", String(at(run.human)), K.warn], ["charges blocked", String(at(run.blocked)), K.neg]] as const).map(([k, v, c]) => (
            <div key={k} style={{ paddingLeft: ".75rem", borderLeft: `2px solid ${c === K.ink ? K.rule2 : c}` }}>
              <dt style={{ fontSize: ".75rem", color: K.ink3, whiteSpace: "nowrap" }}>{k}</dt>
              <dd style={{ margin: 0, fontFamily: F.display, fontWeight: 600, fontSize: "1.375rem", letterSpacing: "-.02em", color: c, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{v}</dd>
            </div>
          ))}
        </dl>
      </header>

      <section className="rp-stage" style={{ display: "grid", gridTemplateColumns: "minmax(0,5fr) minmax(0,7fr)", gap: "2rem", minHeight: 0 }}>
        <article style={{ minWidth: 0, minHeight: 0, overflowY: "auto" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: ".25rem 1rem", color: K.ink3, fontSize: ".8125rem", lineHeight: 1.4 }}>
            <b style={{ color: K.ink2, fontWeight: 500 }}>{order.id}</b><span>{order.customer}</span><span>{order.technician}</span><span>{day(order.date)}</span><span>{order.equipment}</span>
          </div>
          <span style={{ ...eyebrow, display: "block", marginTop: "1rem" }}>What the technician wrote</span>
          <p style={{ margin: ".625rem 0 0", padding: "0 0 0 1rem", borderLeft: `2px solid ${K.rule2}`, fontFamily: F.mono, fontSize: "clamp(1.0625rem,1.9vw,1.5rem)", lineHeight: 1.65, color: K.ink, whiteSpace: "pre-wrap" }}>
            {noteSegments(order, statuses, cur.i)}
          </p>

        </article>

        <div style={{ minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", borderLeft: `1px solid ${K.rule}`, paddingLeft: "1.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "1rem", paddingBottom: ".5rem", borderBottom: `1px solid ${K.rule}` }}>
            <span style={eyebrow}>How Tally decided</span>
            <span style={{ fontSize: ".75rem", color: K.ink3 }}>four checks on every piece of work</span>
          </div>
          <ol className="rp-list" style={{ listStyle: "none", margin: 0, padding: 0, flex: "1 1 auto", minHeight: 0, overflow: "hidden", display: "grid", gridTemplateColumns: "minmax(0,1fr)", gridTemplateRows: `repeat(${SLOTS}, minmax(0,1fr))` }}>
            {Array.from({ length: SLOTS }, (_, i) => {
              const it = order.items[i];
              return it
                ? <Card key={it.id} it={it} n={i + 1} st={statuses[i]!} shown={revealed(i)} active={i === cur.i} fast={fast} order={order} data={data} />
                : <li key={`empty${i}`} aria-hidden style={{ borderBottom: `1px solid transparent` }} />;
            })}
          </ol>
        </div>
      </section>

      <footer style={{ display: "flex", flexWrap: "nowrap", alignItems: "center", gap: ".375rem", paddingTop: ".75rem", borderTop: `1px solid ${K.rule}`, minWidth: 0 }}>
        <button type="button" onClick={play} style={{ ...smallBtn(true), minWidth: "4.5rem", background: playing ? K.paper : K.accent, color: playing ? K.ink2 : K.accentInk, borderColor: playing ? K.rule2 : K.accent }}>{playing ? "Pause" : "Play"}</button>
        {SPEEDS.map((s) => (
          <button key={s} type="button" onClick={() => setSpeed(s)} style={{ ...smallBtn(true), background: s === speed ? K.accentSoft : K.paper, color: s === speed ? K.accent : K.ink2, borderColor: s === speed ? K.accent : K.rule2 }}>{s}x</button>
        ))}
        {run.trap >= 0 && <button type="button" onClick={() => { setG(run.trap); setPlaying(false); }} style={smallBtn(true)}>Jump to the trap</button>}
        <a href="/" style={{ flex: "none", marginLeft: ".5rem", fontSize: ".8125rem", color: K.accent, whiteSpace: "nowrap" }}>Open the sandbox</a>
        <span style={{ flex: "1 1 auto", minWidth: 0, textAlign: "right", fontSize: ".75rem", color: K.ink3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          1,000 generated work orders · answer key: {at(run.wrong)} {at(run.wrong) === 1 ? "charge" : "charges"} ({money(at(run.wrongCents))}) added in error, not counted
        </span>
      </footer>

    </div>
  );
}

/** The note with every work item underlined; judged items take their status colour. */
function noteSegments(order: Order, statuses: Status[], current: number) {
  const out: React.ReactNode[] = [];
  let at = 0;
  order.items.forEach((it, i) => {
    if (it.start > at) out.push(<span key={`t${i}`} style={{ color: K.ink3 }}>{order.note.slice(at, it.start)}</span>);
    const st = statuses[i]!;
    const done = i <= current;
    const [bg, line] = !done ? ["transparent", K.rule2] : st === "counted" ? [K.accentSoft, K.accent] : st === "person" ? [K.warnSoft, K.warn] : st === "rejected" ? [K.negSoft, K.neg] : ["transparent", K.rule2];
    out.push(
      <span key={it.id}>
        <span style={{ background: bg, boxShadow: `inset 0 -2px 0 ${line}`, borderRadius: 2, padding: "0 1px", outline: i === current ? `1px solid ${line === K.rule2 ? K.ink3 : line}` : "none", outlineOffset: 1 }}>{order.note.slice(it.start, it.end)}</span>
        <sup style={{ fontFamily: F.mono, fontSize: ".625rem", fontWeight: 500, color: done ? ST[st][1] : K.ink3, margin: "0 2px 0 1px" }}>{i + 1}</sup>
      </span>,
    );
    at = it.end;
  });
  if (at < order.note.length) out.push(<span key="end" style={{ color: K.ink3 }}>{order.note.slice(at)}</span>);
  return out;
}

function Card({ it, n, st, shown, active, fast, order, data }: { it: Item; n: number; st: Status; shown: boolean; active: boolean; fast: boolean; order: Order; data: Data }) {
  const color = shown ? ST[st][1] : K.rule2;
  const invLine = it.code ? order.invoice.find((l) => l.code === it.code) : undefined;
  const basis = shown && st === "invoiced" && invLine ? `Invoice line: ${invLine.description}` : it.code ? `Rate card ${it.code} · ${clauseText(it.clause)}` : clauseText(it.clause);
  const reason = !shown ? "" : st === "person" ? personReason(it, data.thresholds) : st === "rejected" ? "The note doesn't record this as done, so the charge is blocked." : st === "counted" ? `Add ${draftText(it)}, ${money(it.priceCents)}.` : "";
  return (
    <li style={{ minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column", justifyContent: "center", gap: ".375rem", padding: "0 .75rem", borderBottom: `1px solid ${K.rule}`, borderLeft: `2px solid ${active ? color : "transparent"}`, background: active ? (st === "rejected" && shown ? K.negSoft : st === "person" && shown ? K.warnSoft : K.accentSoft) : "transparent", transition: fast ? "none" : "background 200ms" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: ".625rem", whiteSpace: "nowrap", overflow: "hidden", minWidth: 0 }}>
        <span style={{ fontFamily: F.mono, fontSize: ".6875rem", fontWeight: 500, color, flex: "none" }}>{n}</span>
        <b style={{ color: shown ? K.ink : K.ink3, fontWeight: 500, flex: "none" }}>{labelOf(it)}</b>
        {shown && <span style={{ flex: "none", fontFamily: F.mono, fontSize: ".625rem", letterSpacing: ".06em", textTransform: "uppercase", border: "1px solid currentColor", borderRadius: 3, padding: "0 4px", color }}>{ST[st][0]}</span>}
        <span style={{ fontSize: ".8125rem", color: reason ? color : K.ink3, overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{reason || basis}</span>
      </div>
      <CheckBars it={it} st={st} t={data.thresholds} shown={shown} animate={!fast} compact />
    </li>
  );
}
