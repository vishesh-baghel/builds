"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Replays the committed run. Nothing here calls a model: every number on screen comes from
 * `public/replay.json`, which `pnpm score` writes from the committed judgments.
 */
type Verdict = "invoiced" | "missed_billable" | "covered" | "not_billable";
type Outcome = "recovered" | "guardrail" | "human" | "no_charge";

interface Item {
  id: string; start: number; end: number; text: string; code: string | null; clause: string;
  draftedLine: string | null; cents: number;
  verdict: Record<Verdict, number>; covered: number; unsupported: number; evidence: number;
  outcome: Outcome; reason: string;
  truth: Verdict; trap: string | null; expected: "recover" | "no_charge" | "human";
}
interface Order {
  id: string; customer: string; date: string; technician: string; equipment: string; note: string;
  invoice: { code: string; description: string; quantity: number; cents: number }[];
  items: Item[];
}
interface ReplayFile {
  orders: Order[];
  performance: { model: string; p50LatencyMs: number; decisions: number };
  full: { foundCents: number; plantedCents: number; wronglyCountedCents: number };
}

const VERDICT_LABEL: Record<Verdict, string> = {
  invoiced: "already invoiced", missed_billable: "missed, billable", covered: "covered by agreement", not_billable: "not billable",
};
const OUTCOME_LABEL: Record<Outcome, string> = {
  recovered: "unbilled: drafted", guardrail: "blocked by guardrail", human: "sent to a person", no_charge: "no charge",
};
const SPEEDS = [1, 4, 30, 200] as const;
/** Milliseconds per item at 1x. */
const BASE_MS = 1_400;

const money = (cents: number) => `$${Math.round(cents / 100).toLocaleString("en-US")}`;

/** The trap the video stops on: the first injected line the guardrail stopped, else the first close call. */
function findTrap(orders: Order[]): { order: number; item: number } | null {
  const find = (pred: (i: Item) => boolean) => {
    for (const [o, order] of orders.entries()) {
      const i = order.items.findIndex(pred);
      if (i !== -1) return { order: o, item: i };
    }
    return null;
  };
  return find((i) => i.trap === "injection" && i.outcome === "guardrail")
    ?? find((i) => i.outcome === "guardrail")
    ?? find((i) => i.outcome === "human");
}

export function Replay() {
  const [data, setData] = useState<ReplayFile | null>(null);
  const [pos, setPos] = useState({ order: 0, item: -1 });
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [paused, setPaused] = useState(false);
  const trapSeen = useRef(false);

  useEffect(() => {
    fetch("/replay.json").then((r) => r.json()).then(setData).catch(() => setData(null));
  }, []);

  const trap = useMemo(() => (data ? findTrap(data.orders) : null), [data]);

  // Running totals up to and including the current position.
  const totals = useMemo(() => {
    const t = { orders: 0, found: 0, verified: 0, human: 0, blocked: 0 };
    if (!data) return t;
    for (let o = 0; o <= pos.order && o < data.orders.length; o++) {
      const items = data.orders[o]!.items;
      const upTo = o < pos.order ? items.length : pos.item + 1;
      if (o < pos.order || upTo === items.length) t.orders++;
      for (const i of items.slice(0, upTo)) {
        if (i.outcome === "recovered") { t.found += i.cents; if (i.expected === "recover") t.verified += i.cents; }
        if (i.outcome === "human") t.human++;
        if (i.outcome === "guardrail") t.blocked++;
      }
    }
    return t;
  }, [data, pos]);

  useEffect(() => {
    if (!data || !playing || paused) return;
    const id = setTimeout(() => {
      setPos((p) => {
        const order = data.orders[p.order]!;
        const next = p.item + 1 < order.items.length ? { order: p.order, item: p.item + 1 }
          : p.order + 1 < data.orders.length ? { order: p.order + 1, item: 0 } : null;
        if (!next) { setPlaying(false); return p; }
        if (trap && !trapSeen.current && next.order === trap.order && next.item === trap.item) {
          trapSeen.current = true;
          setPaused(true);
        }
        return next;
      });
    }, BASE_MS / speed);
    return () => clearTimeout(id);
  }, [data, playing, paused, speed, pos, trap]);

  useEffect(() => {
    document.querySelector(".item.active")?.scrollIntoView({ block: "nearest", behavior: speed > 4 ? "auto" : "smooth" });
  }, [pos, speed]);

  if (!data) return <main className="loading">loading the run…</main>;

  const order = data.orders[pos.order]!;
  const current = order.items[pos.item];
  const atTrap = paused && trap?.order === pos.order && trap.item === pos.item;

  return (
    <main className="shell">
      <header className="bar">
        <div className="brand">
          <span className="name">tally</span>
          <span className="sub">unbilled work in technicians' notes, judged by {data.performance.model}</span>
        </div>
        <div className="counter">
          <span className="label">unbilled $ found</span>
          <span className="value">{money(totals.found)}</span>
        </div>
        <dl className="stats">
          <div><dt>work orders</dt><dd>{totals.orders.toLocaleString("en-US")} / {data.orders.length.toLocaleString("en-US")}</dd></div>
          <div><dt>sent to a person</dt><dd>{totals.human}</dd></div>
          <div><dt>guardrail stops</dt><dd>{totals.blocked}</dd></div>
        </dl>
      </header>

      <section className="stage">
        <article className="ticket">
          <div className="meta">
            <span>{order.id}</span><span>{order.date}</span><span>{order.equipment}</span><span>tech {order.technician}</span>
          </div>
          <p className="note">{highlight(order, pos.item)}</p>
          <div className="invoice">
            <span className="label">invoice as issued</span>
            {order.invoice.map((l) => (
              <div key={l.code} className="line"><span>{l.description}{l.quantity > 1 ? ` x${l.quantity}` : ""}</span><span>{money(l.cents)}</span></div>
            ))}
          </div>
        </article>

        <ol className="items">
          {order.items.map((item, i) => (
            <li key={item.id} className={`item ${i > pos.item ? "pending" : ""} ${i === pos.item ? "active" : ""} ${item.outcome}`}>
              <div className="quote">“{item.text}”</div>
              {i <= pos.item && <Judged item={item} />}
            </li>
          ))}
        </ol>
      </section>

      {atTrap && current && (
        <aside className="callout">
          <strong>{current.outcome === "guardrail" ? "Caught: the note never says this was done." : "Too close to call: sent to a person."}</strong>
          <span>{current.reason}</span>
          <button onClick={() => setPaused(false)}>continue</button>
        </aside>
      )}

      <footer className="controls">
        <button onClick={() => { if (!playing && pos.item === -1) setPos({ order: 0, item: 0 }); setPlaying(!playing); setPaused(false); }}>
          {playing && !paused ? "pause" : "play"}
        </button>
        {SPEEDS.map((s) => (
          <button key={s} className={s === speed ? "on" : ""} onClick={() => setSpeed(s)}>{s}x</button>
        ))}
        {trap && <button onClick={() => { trapSeen.current = true; setPos(trap); setPlaying(true); setPaused(true); }}>jump to the trap</button>}
        <span className="fine">
          replay of a committed run on 1,000 generated work orders · checked against the answer key: {money(totals.verified)} correct of {money(totals.found)} counted
        </span>
      </footer>
    </main>
  );
}

function highlight(order: Order, active: number) {
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  order.items.forEach((item, i) => {
    parts.push(order.note.slice(cursor, item.start));
    parts.push(<mark key={item.id} className={`${i === active ? "active" : ""} ${i <= active ? item.outcome : "pending"}`}>{order.note.slice(item.start, item.end)}</mark>);
    cursor = item.end;
  });
  parts.push(order.note.slice(cursor));
  return parts;
}

function Judged({ item }: { item: Item }) {
  const verdicts = Object.entries(item.verdict) as [Verdict, number][];
  return (
    <div className="judged">
      <div className="bars">
        {verdicts.map(([v, p]) => (
          <div key={v} className={`bar ${v}`}>
            <span className="k">{VERDICT_LABEL[v]}</span>
            <span className="track"><span className="fill" style={{ width: `${p * 100}%` }} /></span>
            <span className="p">{p.toFixed(2)}</span>
          </div>
        ))}
        <div className="bar check">
          <span className="k">note supports the line</span>
          <span className="track"><span className="fill" style={{ width: `${(1 - item.unsupported) * 100}%` }} /></span>
          <span className="p">{(1 - item.unsupported).toFixed(2)}</span>
        </div>
        <div className="bar check">
          <span className="k">evidence it happened</span>
          <span className="track"><span className="fill" style={{ width: `${(item.evidence / 4) * 100}%` }} /></span>
          <span className="p">{item.evidence.toFixed(1)}/4</span>
        </div>
      </div>
      <div className="result">
        <span className={`badge ${item.outcome}`}>{OUTCOME_LABEL[item.outcome]}</span>
        {item.draftedLine && (item.outcome === "recovered" || item.outcome === "guardrail") && (
          <span className={`draft ${item.outcome === "guardrail" ? "struck" : ""}`}>{item.draftedLine.replace(/^\[[^\]]+\] /, "")}</span>
        )}
        <span className="clause">clause {item.clause}</span>
      </div>
    </div>
  );
}
