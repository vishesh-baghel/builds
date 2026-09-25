"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { CATEGORY, CLAUSE_TITLES, NON_BILLABLE_LABEL, RATE_CARD, type NonBillableKind, type RateCode } from "../src/catalog";
import type { Judgment } from "../src/drex";
import type { Expected, Trap, Verdict } from "../src/fixtures";
import type { WorkItem } from "../src/item";
import { decideItem, topVerdict, type Thresholds } from "../src/policy";

/**
 * The sandbox. Every number is computed here from `public/replay.json`, which `pnpm score`
 * writes from the committed Drex judgments. Moving the auto-bill setting re-runs the build's own
 * `decideItem` over those judgments; nothing is sent anywhere and no model is called.
 */

type Item = WorkItem & {
  alreadyInvoiced: boolean;
  verdict: Record<Verdict, number>; covered: number; unsupported: number; evidence: number;
  truth: Verdict; trap: Trap | null; expected: Expected; valueCents: number;
};
interface Order {
  id: string; customer: string; date: string; technician: string; equipment: string; note: string;
  invoice: { code: RateCode; description: string; quantity: number; cents: number }[];
  items: Item[];
}
interface Data { thresholds: Thresholds; samples: string[]; orders: Order[] }

type Status = "counted" | "person" | "rejected" | "invoiced" | "covered" | "notbill";

const K = {
  ink: "oklch(24% .02 258)", ink2: "oklch(36% .018 257)", ink3: "oklch(54% .015 256)", rule: "oklch(91% .006 255)", rule2: "oklch(84% .009 255)",
  paper: "oklch(98.5% .004 250)", side: "oklch(96.4% .005 252)", track: "oklch(94% .006 253)",
  accent: "oklch(52% .20 256)", accentSoft: "oklch(94.5% .028 256)", accentInk: "oklch(99% .005 256)",
  g: "oklch(22% .016 260)", gAccent: "oklch(72% .17 254)", onG: "oklch(92% .006 256)", onG2: "oklch(70% .012 256)", onG3: "oklch(56% .012 256)",
  neg: "oklch(54% .18 27)", negSoft: "oklch(95% .025 27)", warn: "oklch(62% .13 75)", warnSoft: "oklch(95% .03 80)",
};
const F = { display: "var(--font-display), ui-sans-serif, system-ui, sans-serif", sans: "var(--font-sans), ui-sans-serif, system-ui, sans-serif", mono: "var(--font-mono), ui-monospace, monospace" };
const eyebrow: CSSProperties = { fontFamily: F.mono, fontSize: ".6875rem", letterSpacing: ".07em", textTransform: "uppercase", fontWeight: 500, color: K.ink3 };
const bigNum: CSSProperties = { fontFamily: F.display, fontWeight: 600, fontSize: "1.625rem", letterSpacing: "-.02em", lineHeight: 1.05, fontVariantNumeric: "tabular-nums" };
const dots: CSSProperties = { flex: 1, borderBottom: `1px dotted ${K.onG3}`, transform: "translateY(-3px)", minWidth: "1rem" };
const smallBtn = (enabled: boolean): CSSProperties => ({ minHeight: 30, padding: "0 .625rem", borderRadius: 4, background: K.paper, fontFamily: F.mono, fontSize: ".6875rem", letterSpacing: ".04em", whiteSpace: "nowrap", flex: "none", border: `1px solid ${K.rule2}`, color: enabled ? K.ink2 : K.rule2, cursor: enabled ? "pointer" : "default" });

const VN: Record<Verdict, string> = { invoiced: "Already billed", missed_billable: "Done, not billed", covered: "Covered, no charge", not_billable: "No charge" };
const ST: Record<Status, [string, string]> = {
  counted: ["add to invoice", K.accent], person: ["your call", K.warn], rejected: ["blocked", K.neg],
  invoiced: ["already billed", K.ink3], covered: ["in the plan", K.ink3], notbill: ["no charge", K.ink3],
};
const CATS: Record<string, [string, string]> = {
  labour: ["Extra labour", "additional technicians, hours past the first two"],
  equipment: ["Equipment not on the invoice", "compressors, blower motors, thermostats, igniters"],
  line_set: ["Line sets", "replaced with the equipment"],
  refrigerant: ["Refrigerant", "pounds added, not billed"],
  after_hours: ["After-hours surcharges", "nights and weekends"],
  other: ["Everything else", "haul-away and disposal"],
};
const RATE = Object.fromEntries(RATE_CARD.map((l) => [l.code, l]));

const pct = (v: number) => `${Math.round(v * 100)}%`;
const money = (cents: number) => `$${Math.round(cents / 100).toLocaleString("en-US")}`;
const day = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "2-digit", timeZone: "UTC" });
const UNIT: Record<string, [string, string]> = { lb: ["lb", "lb"], hour: ["hour", "hours"], "technician per visit": ["technician", "technicians"] };
/** The line Tally would add, as a person would write it: "Refrigerant R-410A, 3 lb". */
const draftText = (it: Item) => {
  if (!it.code) return "";
  const line = RATE[it.code]!;
  const unit = UNIT[line.unit];
  return unit && (it.quantity > 1 || line.unit === "lb") ? `${line.description}, ${it.quantity} ${unit[it.quantity > 1 ? 1 : 0]}` : line.description;
};
const labelOf = (it: Item) => (it.code ? RATE[it.code]!.description : NON_BILLABLE_LABEL[it.nonBillable as NonBillableKind]);
const clauseText = (c: string) => `Agreement §${c} · ${CLAUSE_TITLES[c] ?? ""}`;

/** The slider runs from asking about more (left) to asking about less (right). */
const actFromDial = (v: number) => +(0.95 - 0.7 * v).toFixed(3);
const dialFromAct = (a: number) => (0.95 - a) / 0.7;

function statusOf(it: Item, t: Thresholds): Status {
  const d = decideItem(it, judgmentOf(it), t, it.alreadyInvoiced);
  if (d.outcome === "recovered") return "counted";
  if (d.outcome === "human") return "person";
  if (d.outcome === "guardrail") return "rejected";
  if (d.verdict === "invoiced" || (d.verdict === "missed_billable" && it.alreadyInvoiced)) return "invoiced";
  if (d.verdict === "covered") return "covered";
  return "notbill";
}
const judgmentOf = (it: Item): Judgment => ({ verdict: it.verdict, covered: it.covered, unsupported: it.unsupported, evidence: it.evidence, inputTokens: 0, latencyMs: 0 });

interface ItemInfo { it: Item; i: number; st: Status; dec: "bill" | "leave" | undefined }
interface OrderInfo { o: Order; n: number; its: ItemInfo[]; found: number; counted: number; billed: number; rej: boolean; per: boolean; anyPer: boolean; sample: boolean }

export function Sandbox() {
  const [data, setData] = useState<Data | null>(null);
  const [page, setPage] = useState<"overview" | "orders" | "review" | "guard" | "line">("overview");
  const [sel, setSel] = useState<string>("");
  const [view, setView] = useState("samples");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("no");
  const [pageIdx, setPageIdx] = useState(0);
  const [act, setAct] = useState<number | null>(null);
  const [dec, setDec] = useState<Record<string, "bill" | "leave" | undefined>>({});
  const [how, setHow] = useState(false);
  const [rows, setRows] = useState(10);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    fetch("/replay.json").then((r) => r.json()).then((d: Data) => { setData(d); setSel(d.samples[0] ?? d.orders[0]!.id); }).catch(() => setData(null));
  }, []);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setRows(Math.max(1, Math.floor(el.clientHeight / 41))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [page, data]);

  const recommended = data ? data.thresholds.evidence / 4 : 0.625;
  const measured = act === null;
  const actNow = act ?? recommended;
  const th: Thresholds | null = data ? { ...data.thresholds, evidence: actNow * 4 } : null;

  const infos: OrderInfo[] = useMemo(() => {
    if (!data || !th) return [];
    const samples = new Set(data.samples);
    return data.orders.map((o, n) => {
      const its = o.items.map((it, i) => ({ it, i, st: statusOf(it, th), dec: dec[it.id] }));
      // Money found is checked against the answer key: a charge for work that was not done
      // is counted separately as a mistake, never as money found.
      const found = its.reduce((s, x) => s + ((x.st === "counted" && x.it.expected === "recover") || (x.st === "person" && x.dec === "bill") ? x.it.priceCents : 0), 0);
      const counted = its.reduce((s, x) => s + (x.st === "counted" || (x.st === "person" && x.dec === "bill") ? x.it.priceCents : 0), 0);
      return {
        o, n, its, found, counted, billed: o.invoice.reduce((s, l) => s + l.cents, 0), sample: samples.has(o.id),
        rej: its.some((x) => x.st === "rejected"), per: its.some((x) => x.st === "person" && !x.dec), anyPer: its.some((x) => x.st === "person"),
      };
    });
  }, [data, actNow, dec]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!data || !th) return <div style={{ padding: 40, color: K.ink3, fontFamily: F.sans }}>Loading the run…</div>;

  const planted = data.orders.reduce((s, o) => s + o.items.reduce((a, it) => a + (it.expected === "recover" ? it.valueCents : 0), 0), 0);
  let found = 0, approved = 0, routed = 0, guard = 0, wrong = 0, wrongCents = 0;
  const catSum: Record<string, [number, number]> = {};
  const finds: { o: Order; it: Item }[] = [];
  const reviewList: (ItemInfo & { o: Order })[] = [];
  const guardList: (ItemInfo & { o: Order })[] = [];
  for (const x of infos) {
    found += x.found;
    for (const y of x.its) {
      if (y.st === "person") { routed++; reviewList.push({ o: x.o, ...y }); if (y.dec === "bill") approved += y.it.priceCents; }
      if (y.st === "rejected") { guard++; guardList.push({ o: x.o, ...y }); }
      if (y.st === "counted" && y.it.expected !== "recover") { wrong++; wrongCents += y.it.priceCents; }
      const real = (y.st === "counted" && y.it.expected === "recover") || (y.st === "person" && y.dec === "bill");
      if (real && y.it.code) {
        const c = CATEGORY[y.it.code];
        catSum[c] = [(catSum[c]?.[0] ?? 0) + y.it.priceCents, (catSum[c]?.[1] ?? 0) + 1];
        if (y.st === "counted") finds.push({ o: x.o, it: y.it });
      }
    }
  }
  finds.sort((a, b) => b.it.priceCents - a.it.priceCents);
  const maxCat = Math.max(1, ...Object.values(catSum).map((v) => v[0]));
  const pending = reviewList.filter((x) => !x.dec).length;

  const openOrder = (id: string) => {
    const sample = data.samples.includes(id);
    const v = sample ? "samples" : "all";
    const l = list(v, "", "no");
    const idx = Math.max(0, l.findIndex((x) => x.o.id === id));
    setPage("orders"); setSel(id); setView(v); setQ(""); setSort("no"); setPageIdx(Math.floor(idx / rows));
  };
  function list(v: string, query: string, s: string): OrderInfo[] {
    const VIEW: Record<string, (x: OrderInfo) => boolean> = {
      all: () => true, samples: (x) => x.sample, found: (x) => x.counted > 0, big: (x) => x.counted >= 50_000,
      review: (x) => x.anyPer, guard: (x) => x.rej, clean: (x) => !x.counted && !x.anyPer && !x.rej,
    };
    const qq = query.trim().toLowerCase();
    let l = infos.filter(VIEW[v] ?? VIEW.all!);
    if (v === "samples") l = data!.samples.map((id) => l.find((x) => x.o.id === id)!).filter(Boolean);
    if (qq) l = l.filter((x) => [x.o.id, x.o.customer, x.o.technician, x.o.note].some((f) => f.toLowerCase().includes(qq)));
    if (s === "found") l = [...l].sort((a, b) => b.counted - a.counted || a.n - b.n);
    if (s === "new") l = [...l].sort((a, b) => b.o.date.localeCompare(a.o.date) || b.n - a.n);
    if (s === "old") l = [...l].sort((a, b) => a.o.date.localeCompare(b.o.date) || a.n - b.n);
    return l;
  }
  const decide = (id: string, v: "bill" | "leave") => () => setDec((d) => ({ ...d, [id]: d[id] === v ? undefined : v }));

  const PAGES: [typeof page, string, string][] = [
    ["overview", "Overview", ""], ["orders", "Work orders", data.orders.length.toLocaleString("en-US")],
    ["review", "Needs your call", String(pending)], ["guard", "Blocked charges", String(guardList.length)], ["line", "Auto-bill setting", ""],
  ];
  const TITLES: Record<typeof page, [string, string]> = {
    overview: ["13 weeks at Brightline Mechanical", `What Tally found when it compared ${data.orders.length.toLocaleString("en-US")} technician notes with the invoices that went out.`],
    orders: ["Work orders", "Pick any job to see what the technician wrote next to what the customer was billed."],
    review: ["Needs your call", "Charges Tally was not sure enough to add on its own. Each one says why. You decide."],
    guard: ["Blocked charges", "Charges Tally stopped itself from adding, because the technician's note doesn't say the work was done. This is its safety check."],
    line: ["Auto-bill setting", "Decide how sure Tally has to be before it adds a charge without asking you."],
  };
  const dial = dialFromAct(actNow);
  const onDial = (v: number) => setAct(actFromDial(v));

  return (
    <div className="tl-shell" style={{ minHeight: "100vh", display: "grid", gridTemplateColumns: "15rem minmax(0,1fr)", background: K.paper, color: K.ink2, fontFamily: F.sans, fontSize: ".9375rem", lineHeight: 1.6 }}>
      <aside className="tl-side" style={{ borderRight: `1px solid ${K.rule}`, background: K.side, display: "flex", flexDirection: "column", position: "sticky", top: 0, height: "100vh", overflow: "auto" }}>
        <div style={{ padding: "1.125rem 1.25rem .25rem", display: "flex", alignItems: "baseline", gap: ".5rem" }}>
          <span style={{ fontFamily: F.display, fontWeight: 600, fontSize: "1.0625rem", color: K.ink, letterSpacing: "-.02em" }}>tally</span>
          <span style={{ fontSize: ".75rem", color: K.ink3 }}>billing leakage</span>
        </div>
        <div style={{ padding: ".75rem 1.25rem 1rem", display: "flex", flexDirection: "column", gap: ".125rem" }}>
          <span style={{ ...eyebrow, fontSize: ".625rem" }}>Firm</span>
          <span style={{ fontSize: ".875rem", fontWeight: 500, color: K.ink }}>Brightline Mechanical</span>
          <span style={{ fontSize: ".75rem", color: K.ink3, lineHeight: 1.4 }}>HVAC service · 1,000 work orders over 13 weeks</span>
        </div>
        <nav className="tl-nav" style={{ padding: "0 .625rem", display: "flex", flexDirection: "column", gap: 2 }}>
          {PAGES.map(([id, label, count]) => {
            const cur = page === id;
            return (
              <button key={id} type="button" onClick={() => setPage(id)} style={{ display: "flex", alignItems: "center", gap: ".625rem", width: "100%", minHeight: 38, padding: "0 .625rem", border: 0, borderRadius: 6, textAlign: "left", font: "inherit", fontSize: ".875rem", fontWeight: 500, cursor: "pointer", background: cur ? K.accentSoft : "transparent", color: cur ? K.accent : K.ink2 }}>
                <span style={{ flex: "1 1 auto" }}>{label}</span>
                <span style={{ fontFamily: F.mono, fontSize: ".6875rem", fontVariantNumeric: "tabular-nums", color: id === "review" && pending ? K.warn : id === "guard" ? K.neg : K.ink3 }}>{count}</span>
              </button>
            );
          })}
        </nav>
        <div className="tl-sidefoot" style={{ marginTop: "auto", padding: "1rem 1.25rem", borderTop: `1px solid ${K.rule}`, display: "flex", flexDirection: "column", gap: ".75rem" }}>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: ".5rem" }}>
              <span style={{ fontSize: ".75rem", color: K.ink2 }}>Adds charges on its own at</span>
              <span style={{ fontFamily: F.mono, fontSize: ".6875rem", color: K.accent, whiteSpace: "nowrap" }}>{pct(actNow)} sure</span>
            </div>
            <input type="range" min={0} max={1} step={0.02} value={dial} onChange={(e) => onDial(Number(e.target.value))} aria-label="Auto-bill setting" style={{ display: "block", width: "100%", accentColor: K.accent, cursor: "pointer" }} />
          </div>
          <button type="button" onClick={() => setHow(true)} style={{ minHeight: 34, padding: "0 1rem", borderRadius: 6, border: `1px solid ${K.rule2}`, background: "transparent", color: K.ink3, font: "inherit", fontSize: ".8125rem", fontWeight: 500, cursor: "pointer", width: "100%" }}>How it works</button>
          <a href="/replay" style={{ fontSize: ".75rem", color: K.accent, textAlign: "center" }}>Watch the run replay</a>
        </div>
      </aside>

      <main style={{ minWidth: 0, padding: "clamp(1.25rem,3vw,2.5rem) clamp(1rem,3vw,2.5rem) 3rem", maxWidth: "84rem" }}>
        <header style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: ".5rem 1.5rem", marginBottom: "1.5rem" }}>
          <h1 style={{ margin: 0, fontFamily: F.display, fontWeight: 600, fontSize: "clamp(1.375rem,2.4vw,1.75rem)", letterSpacing: "-.025em", color: K.ink, lineHeight: 1.15, textWrap: "balance" }}>{TITLES[page][0]}</h1>
          <span style={{ fontSize: ".8125rem", color: K.ink3 }}>{TITLES[page][1]}</span>
        </header>

        {page === "overview" && (
          <>
            <p style={{ margin: 0, fontFamily: F.display, fontWeight: 600, color: K.ink, fontSize: "clamp(1.0625rem,2.2vw,1.25rem)", letterSpacing: "-.02em", fontVariantNumeric: "tabular-nums", maxWidth: "48ch" }}>
              <b style={{ color: K.accent, fontWeight: 600 }}>{money(found)}</b> of work was done but never billed.
            </p>
            <p style={{ margin: ".375rem 0 0", color: K.ink3, fontSize: ".875rem", maxWidth: "68ch" }}>Technicians write down everything they did. The office bills from a different ticket. Tally reads both, spots the work that never made it onto the invoice, and prices it from the company's rate card. If the note doesn't clearly say the work was done, Tally won't charge for it.</p>
            <div style={{ display: "grid", gap: "1rem 2rem", padding: "1.5rem 0 .5rem", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,11.5rem),1fr))" }}>
              <Stat n={money(found)} color={K.accent} edge={K.accent} label="money found" sub={approved ? `including ${money(approved)} you approved` : "in work done but never billed"} />
              <Stat n={money(planted)} color={K.ink} edge={K.rule2} label="hidden in the test" sub="the unbilled work we put in on purpose, to check Tally" />
              <Stat n={String(routed)} color={K.ink} edge={K.warn} label="need your call" sub="Tally wasn't sure enough to add these itself" onClick={() => setPage("review")} />
              <Stat n={String(guard)} color={K.neg} edge={K.neg} label="charges blocked" sub="the note didn't say the work was done" onClick={() => setPage("guard")} />
            </div>
            <p style={{ margin: ".5rem 0 0", fontSize: ".75rem", color: K.ink3, maxWidth: "80ch" }}>
              {measured ? "These are the results at the recommended setting. Change it under Auto-bill setting to see what happens." : "You changed the auto-bill setting, so these numbers are for your setting. Choose Recommended under Auto-bill setting to go back."}
              {" "}Checked against the answer key, Tally also added {wrong} {wrong === 1 ? "charge" : "charges"} ({money(wrongCents)}) for work that wasn't done; they are not in the money found.
            </p>
            <div style={{ display: "grid", gap: "1.5rem 2.5rem", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,20rem),1fr))", marginTop: "2rem", alignItems: "start" }}>
              <section>
                <h2 style={{ margin: 0, ...eyebrow }}>Biggest charges found</h2>
                <ul style={{ listStyle: "none", margin: ".625rem 0 0", padding: 0, borderTop: `1px solid ${K.rule}` }}>
                  {finds.slice(0, 6).map((f) => (
                    <li key={f.it.id} style={{ borderBottom: `1px solid ${K.rule}` }}>
                      <button type="button" onClick={() => openOrder(f.o.id)} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: ".75rem", alignItems: "baseline", width: "100%", textAlign: "left", border: 0, background: "transparent", padding: ".625rem .25rem", font: "inherit", cursor: "pointer", minHeight: 44 }}>
                        <span style={{ minWidth: 0 }}>
                          <span style={{ display: "block", color: K.ink, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{draftText(f.it)}</span>
                          <span style={{ display: "block", fontSize: ".8125rem", color: K.ink3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            <span style={{ fontFamily: F.mono, fontSize: ".75rem", background: K.accentSoft, boxShadow: `inset 0 -2px 0 ${K.accent}`, padding: "0 2px" }}>{f.it.text}</span> · {f.o.id}
                          </span>
                        </span>
                        <span style={{ fontFamily: F.display, fontWeight: 600, fontSize: "1.0625rem", color: K.accent, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{money(f.it.priceCents)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
              <section>
                <h2 style={{ margin: 0, ...eyebrow }}>What was being missed</h2>
                <ul style={{ listStyle: "none", margin: ".625rem 0 0", padding: 0, borderTop: `1px solid ${K.rule}` }}>
                  {Object.keys(CATS).filter((c) => catSum[c]).sort((a, b) => catSum[b]![0] - catSum[a]![0]).map((c) => (
                    <li key={c} style={{ padding: ".5rem .25rem", borderBottom: `1px solid ${K.rule}` }}>
                      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 4.5rem 5.5rem", gap: ".75rem", alignItems: "baseline" }}>
                        <span style={{ minWidth: 0 }}>
                          <span style={{ display: "block", color: K.ink, fontWeight: 500, fontSize: ".875rem" }}>{CATS[c]![0]}</span>
                          <span style={{ display: "block", fontSize: ".75rem", color: K.ink3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{CATS[c]![1]}</span>
                        </span>
                        <span style={{ textAlign: "right", fontFamily: F.mono, fontSize: ".6875rem", color: K.ink3, fontVariantNumeric: "tabular-nums" }}>{catSum[c]![1]} lines</span>
                        <span style={{ textAlign: "right", fontFamily: F.display, fontWeight: 600, fontSize: "1.0625rem", color: K.ink, fontVariantNumeric: "tabular-nums" }}>{money(catSum[c]![0])}</span>
                      </div>
                      <div style={{ marginTop: ".375rem", height: 4, borderRadius: 2, background: K.track, overflow: "hidden" }}><div style={{ height: "100%", width: `${(catSum[c]![0] / maxCat) * 100}%`, background: K.accent }} /></div>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          </>
        )}

        {page === "orders" && Orders()}

        {page === "review" && (
          <>
            {reviewList.length === 0 && <p style={{ margin: 0, color: K.ink3 }}>Nothing is waiting for you at this setting.</p>}
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: ".75rem", maxWidth: "56rem" }}>
              {reviewList.map((x) => (
                <li key={x.it.id} style={{ border: `1px solid ${K.rule}`, borderRadius: 10, padding: "1rem 1.25rem", display: "flex", flexDirection: "column", gap: ".875rem" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: ".125rem", lineHeight: 1.35 }}>
                      <b style={{ color: K.ink, fontWeight: 600 }}>{labelOf(x.it)}</b>
                      <span style={{ fontSize: ".8125rem", color: K.ink3 }}>{x.o.id} · {x.o.customer} · {x.o.technician}</span>
                    </div>
                    <p style={{ margin: ".5rem 0 0", paddingLeft: ".75rem", borderLeft: `2px solid ${K.rule2}`, fontFamily: F.mono, fontSize: ".875rem", lineHeight: 1.6, color: K.ink }}>
                      <span style={{ background: K.warnSoft, boxShadow: `inset 0 -2px 0 ${K.warn}`, padding: "0 2px" }}>{x.it.context}</span>
                    </p>
                    <p style={{ margin: ".5rem 0 0", fontSize: ".875rem", color: K.ink2 }}>{personReason(x.it, th)}</p>
                  </div>
                  <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: ".625rem", paddingTop: ".75rem", borderTop: `1px solid ${K.rule}`, maxWidth: "36rem" }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: ".5rem", whiteSpace: "nowrap", fontFamily: F.mono, fontSize: ".8125rem", color: K.ink, textDecoration: x.dec === "leave" ? "line-through" : "none" }}>
                      <span>{draftText(x.it)}</span><span style={{ ...dots, borderColor: K.rule2 }} /><span style={{ fontVariantNumeric: "tabular-nums" }}>{money(x.it.priceCents)}</span>
                    </div>
                    <div style={{ display: "flex", gap: ".375rem", flexWrap: "wrap", alignItems: "center" }}>
                      <button type="button" onClick={decide(x.it.id, "bill")} style={{ minHeight: 34, padding: "0 1rem", borderRadius: 6, border: `1px solid ${K.accent}`, background: x.dec === "bill" ? K.accent : "transparent", color: x.dec === "bill" ? K.accentInk : K.accent, font: "inherit", fontSize: ".8125rem", fontWeight: 500, cursor: "pointer" }}>Bill it</button>
                      <button type="button" onClick={decide(x.it.id, "leave")} style={{ minHeight: 34, padding: "0 1rem", borderRadius: 6, border: `1px solid ${x.dec === "leave" ? K.ink : K.rule2}`, background: x.dec === "leave" ? K.ink : "transparent", color: x.dec === "leave" ? K.accentInk : K.ink3, font: "inherit", fontSize: ".8125rem", fontWeight: 500, cursor: "pointer" }}>Leave it</button>
                      <button type="button" onClick={() => openOrder(x.o.id)} style={{ border: 0, background: "transparent", padding: "0 .25rem", font: "inherit", fontSize: ".8125rem", color: K.accent, cursor: "pointer", textDecoration: "underline" }}>Open work order</button>
                    </div>
                    <span style={{ fontSize: ".75rem", color: x.dec === "bill" ? K.accent : x.dec ? K.ink3 : K.warn }}>
                      {x.dec === "bill" ? `Approved: ${money(x.it.priceCents)} added to the money found.` : x.dec === "leave" ? "Left off the invoice." : "Waiting for you."}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
            <p style={{ margin: "1.25rem 0 0", fontSize: ".8125rem", color: K.ink3, maxWidth: "60ch" }}>Approved charges are added to the money found on every page. A more careful auto-bill setting sends more here; a more relaxed one sends fewer.</p>
          </>
        )}

        {page === "guard" && (
          <>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: ".75rem", maxWidth: "56rem" }}>
              {guardList.map((x) => {
                const pre = x.o.note.slice(Math.max(0, x.it.start - 90), x.it.start);
                const post = x.o.note.slice(x.it.end, x.it.end + 90);
                return (
                  <li key={x.it.id} style={{ border: `1px solid ${K.rule}`, borderRadius: 10, padding: "1rem 1.25rem" }}>
                    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: ".5rem", fontFamily: F.mono, fontSize: ".875rem", color: K.ink }}>
                      <span style={{ textDecoration: "line-through", textDecorationColor: K.neg, textDecorationThickness: 2 }}>{draftText(x.it)}</span>
                      <span style={{ ...dots, borderColor: K.rule2 }} />
                      <span style={{ textDecoration: "line-through", textDecorationColor: K.neg, textDecorationThickness: 2, fontVariantNumeric: "tabular-nums" }}>{money(x.it.priceCents)}</span>
                    </div>
                    <p style={{ margin: ".625rem 0 0", paddingLeft: ".75rem", borderLeft: `2px solid ${K.rule2}`, fontFamily: F.mono, fontSize: ".875rem", lineHeight: 1.6, color: K.ink3, whiteSpace: "pre-wrap" }}>
                      “{x.it.start > 90 ? "…" : ""}{pre}<span style={{ color: K.ink, background: K.negSoft, boxShadow: `inset 0 -2px 0 ${K.neg}`, padding: "0 2px" }}>{x.it.text}</span>{post}{x.it.end + 90 < x.o.note.length ? "…" : ""}”
                    </p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: ".5rem 1.25rem", marginTop: ".625rem", fontSize: ".8125rem", color: K.ink3 }}>
                      <span>{x.o.id} · {x.o.customer}</span>
                      <span>Note backs up the charge: <b style={{ fontFamily: F.mono, fontWeight: 500, color: K.neg }}>{pct(1 - x.it.unsupported)}</b>. Blocked, never sent.</span>
                      <button type="button" onClick={() => openOrder(x.o.id)} style={{ border: 0, background: "transparent", padding: 0, font: "inherit", fontSize: ".8125rem", color: K.accent, cursor: "pointer", textDecoration: "underline" }}>Open work order</button>
                    </div>
                  </li>
                );
              })}
            </ul>
            <p style={{ margin: "1.25rem 0 0", fontSize: ".8125rem", color: K.ink3, maxWidth: "60ch" }}>Before any charge is added, Tally checks it against the technician's own words. If the note only says something was checked, quoted or might be needed, or a line in it asks for a charge instead of recording work, the charge is blocked.</p>
          </>
        )}

        {page === "line" && Line()}

        {page !== "orders" && (
          <p style={{ margin: "3rem 0 0", paddingTop: "1rem", borderTop: `1px solid ${K.rule}`, fontSize: ".75rem", color: K.ink3 }}>
            A test on generated jobs: every company, technician, customer and note here is invented. Tally never sends invoices, never changes records and never contacts customers.{" "}
            <a href="https://github.com/vishesh-baghel/builds/tree/main/tally" style={{ color: K.accent }}>How it was measured</a>
          </p>
        )}
      </main>

      {how && <How onClose={() => setHow(false)} found={money(found)} planted={money(planted)} />}
    </div>
  );

  function Orders() {
    const VIEWS: [string, string, string][] = [["samples", "Start here", `Start here: ${data!.samples.length} example jobs`], ["all", "All", "All jobs"], ["found", "Money found", "Jobs with money found"], ["big", "$500+", "Finds of $500 or more"], ["review", "Your call", "Needs your call"], ["guard", "Blocked", "Blocked charges"], ["clean", "All billed", "Nothing missed"]];
    const l = list(view, q, sort);
    const per = rows;
    const pages = Math.max(1, Math.ceil(l.length / per));
    const pi = Math.min(pageIdx, pages - 1);
    const pageRows = l.slice(pi * per, pi * per + per);
    const cur = l.find((x) => x.o.id === sel) ?? pageRows[0] ?? infos.find((x) => x.o.id === sel) ?? infos[0]!;
    const pos = l.findIndex((x) => x.o.id === cur.o.id);
    const step = (d: number) => () => { const ni = pos + d; if (ni < 0 || ni >= l.length) return; setSel(l[ni]!.o.id); setPageIdx(Math.floor(ni / per)); };
    const o = cur.o;
    const num: Record<number, string> = {};
    cur.its.forEach((x, k) => { num[x.i] = String(k + 1); });
    const tint = (st: Status): [string, string] => st === "counted" ? [K.accentSoft, K.accent] : st === "person" ? [K.warnSoft, K.warn] : st === "rejected" ? [K.negSoft, K.neg] : ["transparent", K.rule2];
    const segs: { text: string; bg: string; line: string; color: string; n: string }[] = [];
    let at = 0;
    for (const x of cur.its) {
      if (x.it.start > at) segs.push({ text: o.note.slice(at, x.it.start), bg: "transparent", line: "transparent", color: K.ink3, n: "" });
      const [bg, line] = tint(x.st);
      segs.push({ text: o.note.slice(x.it.start, x.it.end), bg, line, color: ST[x.st][1], n: num[x.i]! });
      at = x.it.end;
    }
    if (at < o.note.length) segs.push({ text: o.note.slice(at), bg: "transparent", line: "transparent", color: K.ink3, n: "" });
    const adds = cur.its.filter((x) => x.it.draftedLine && ["counted", "person", "rejected"].includes(x.st));
    const nCounted = cur.its.filter((x) => x.st === "counted" || (x.st === "person" && x.dec === "bill")).length;

    return (
      <div className="tl-orders" style={{ display: "grid", gridTemplateColumns: "clamp(14rem,34%,19rem) minmax(0,1fr)", gap: "1.5rem", height: "calc(100vh - 9rem)", minHeight: 0 }}>
        <aside className="tl-list" style={{ minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <span style={eyebrow}>Show</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: ".25rem", marginTop: ".5rem" }}>
            {VIEWS.map(([id, label]) => {
              const on = view === id, ll = list(id, "", "no");
              const c = id === "review" ? K.warn : id === "guard" ? K.neg : K.accent;
              return (
                <button key={id} type="button" onClick={() => { setView(id); setPageIdx(0); if (ll[0]) setSel(ll[0].o.id); }} style={{ display: "flex", alignItems: "center", gap: ".375rem", minHeight: 30, padding: "0 .5rem", border: `1px solid ${on ? c : K.rule2}`, borderRadius: 4, background: on ? (id === "review" ? K.warnSoft : id === "guard" ? K.negSoft : K.accentSoft) : K.paper, color: on ? c : K.ink2, font: "inherit", fontSize: ".8125rem", cursor: "pointer", whiteSpace: "nowrap", flex: "none" }}>
                  <span>{label}</span><span style={{ fontFamily: F.mono, fontSize: ".6875rem", fontVariantNumeric: "tabular-nums" }}>{ll.length.toLocaleString("en-US")}</span>
                </button>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: ".375rem", marginTop: ".75rem" }}>
            <input type="search" value={q} onChange={(e) => { setQ(e.target.value); setPageIdx(0); }} placeholder="Search jobs, customers or words in a note" style={{ flex: "1 1 auto", minWidth: 0, minHeight: 34, padding: "0 .5rem", border: `1px solid ${K.rule2}`, borderRadius: 4, background: K.paper, color: K.ink, font: "inherit", fontSize: ".8125rem" }} />
            <select value={sort} onChange={(e) => { setSort(e.target.value); setPageIdx(0); }} aria-label="Sort" style={{ flex: "none", minHeight: 34, padding: "0 .5rem", border: `1px solid ${K.rule2}`, borderRadius: 4, background: K.paper, color: K.ink2, font: "inherit", fontSize: ".8125rem", cursor: "pointer" }}>
              <option value="no">Run order</option><option value="old">Oldest</option><option value="new">Newest</option><option value="found">Most money</option>
            </select>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: ".5rem", marginTop: "1rem", paddingBottom: ".375rem", borderBottom: `1px solid ${K.rule2}` }}>
            <span style={eyebrow}>Jobs</span>
            <span style={{ fontFamily: F.mono, fontSize: ".6875rem", color: K.ink3, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{l.length.toLocaleString("en-US")} jobs · {money(l.reduce((s, x) => s + x.counted, 0))} added</span>
          </div>
          <ul ref={listRef} style={{ listStyle: "none", margin: 0, padding: 0, flex: "1 1 auto", minHeight: 0, overflow: "hidden" }}>
            {pageRows.map((x) => {
              const [mark, markColor] = x.rej ? ["×", K.neg] : x.per ? ["?", K.warn] : x.counted ? ["+", K.accent] : ["·", K.rule2];
              const on = x.o.id === cur.o.id;
              return (
                <li key={x.o.id} style={{ borderBottom: `1px solid ${K.rule}` }}>
                  <button type="button" onClick={() => setSel(x.o.id)} style={{ display: "grid", gridTemplateColumns: ".875rem 4.75rem minmax(0,1fr) auto", gap: ".5rem", alignItems: "baseline", width: "100%", height: 40, textAlign: "left", border: 0, borderLeft: `2px solid ${on ? K.accent : "transparent"}`, background: on ? K.accentSoft : "transparent", cursor: "pointer", padding: "0 .625rem 0 .5rem", font: "inherit" }}>
                    <span style={{ fontFamily: F.mono, fontSize: ".8125rem", fontWeight: 500, color: markColor, lineHeight: "40px" }}>{mark}</span>
                    <span style={{ fontFamily: F.mono, fontSize: ".75rem", color: K.ink2, whiteSpace: "nowrap", lineHeight: "40px" }}>{x.o.id}</span>
                    <span style={{ fontSize: ".8125rem", color: K.ink3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: "40px" }}>{x.o.customer}</span>
                    <span style={{ fontFamily: F.mono, fontSize: ".75rem", textAlign: "right", whiteSpace: "nowrap", color: x.counted ? K.accent : K.ink3, lineHeight: "40px" }}>{x.counted ? `+${money(x.counted)}` : "·"}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: ".5rem", paddingTop: ".625rem" }}>
            <button type="button" onClick={() => setPageIdx(Math.max(0, pi - 1))} style={smallBtn(pi > 0)}>‹ Prev</button>
            <span style={{ fontFamily: F.mono, fontSize: ".6875rem", color: K.ink3, whiteSpace: "nowrap" }}>{l.length ? `${pi * per + 1} to ${Math.min(l.length, pi * per + per)} of ${l.length.toLocaleString("en-US")}` : "No jobs match"}</span>
            <button type="button" onClick={() => setPageIdx(Math.min(pages - 1, pi + 1))} style={smallBtn(pi < pages - 1)}>Next ›</button>
          </div>
        </aside>

        <div className="tl-detail" style={{ minWidth: 0, overflowY: "auto", overflowX: "hidden", borderLeft: `1px solid ${K.rule}`, padding: "0 .25rem 2rem 1.5rem" }}>
          <div style={{ position: "sticky", top: 0, zIndex: 2, display: "flex", alignItems: "center", justifyContent: "space-between", gap: ".75rem", padding: ".25rem 0 .75rem", marginBottom: ".75rem", background: K.paper, borderBottom: `1px solid ${K.rule}` }}>
            <span style={{ fontFamily: F.mono, fontSize: ".6875rem", color: K.ink3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{pos >= 0 ? `Job ${(pos + 1).toLocaleString("en-US")} of ${l.length.toLocaleString("en-US")} · ${VIEWS.find((v) => v[0] === view)![2]}` : "Not in this view"}</span>
            <div style={{ display: "flex", gap: ".25rem", flex: "none" }}>
              <button type="button" onClick={step(-1)} style={smallBtn(pos > 0)}>‹ Prev</button>
              <button type="button" onClick={step(1)} style={smallBtn(pos >= 0 && pos < l.length - 1)}>Next ›</button>
            </div>
          </div>
          <article style={{ minWidth: 0 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: ".25rem 1rem", color: K.ink3, fontSize: ".8125rem", lineHeight: 1.4 }}>
              <b style={{ color: K.ink2, fontWeight: 500 }}>{o.id}</b><span>{o.customer}</span><span>{o.technician}</span><span>{day(o.date)}</span><span>{o.equipment}</span>
            </div>
            <div style={{ display: "grid", gap: "1.5rem 2.5rem", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,20rem),1fr))", alignItems: "start", marginTop: "1rem" }}>
              <div style={{ minWidth: 0 }}>
                <span style={eyebrow}>What the technician wrote</span>
                <p style={{ margin: ".625rem 0 0", padding: "0 0 0 1rem", borderLeft: `2px solid ${K.rule2}`, fontFamily: F.mono, fontSize: "clamp(1rem,2vw,1.1875rem)", lineHeight: 1.6, color: K.ink, maxWidth: "60ch", whiteSpace: "pre-wrap" }}>
                  {segs.map((sg, k) => (
                    <span key={k}><span style={{ background: sg.bg, boxShadow: `inset 0 -2px 0 ${sg.line}`, borderRadius: 2, padding: "0 1px" }}>{sg.text}</span>{sg.n && <sup style={{ fontFamily: F.mono, fontSize: ".625rem", fontWeight: 500, color: sg.color, margin: "0 2px 0 1px" }}>{sg.n}</sup>}</span>
                  ))}
                </p>
                <p style={{ margin: "1.25rem 0 0", fontFamily: F.display, fontWeight: 500, fontSize: "1.0625rem", color: K.ink, maxWidth: "60ch", letterSpacing: "-.015em" }}>
                  {cur.counted
                    ? <>The technician did {nCounted} {nCounted === 1 ? "thing" : "things"} the customer was never charged for, worth <b style={{ color: K.accent, fontWeight: 600 }}>{money(cur.counted)}</b>.</>
                    : cur.rej ? "Tally stopped a charge here because the note doesn't say the work was done. Nothing to add."
                    : cur.per ? "Tally found something it isn't sure about. It's waiting for your call."
                    : "Nothing missed. Everything the technician did was billed, included in the plan, or free."}
                </p>
              </div>

              <div style={{ minWidth: 0, borderRadius: 10, padding: "1rem 1.25rem", background: K.g, color: K.onG }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: ".5rem", ...eyebrow, color: K.onG2 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: ".5rem" }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: K.gAccent }} />invoice</span>
                  <span>as sent</span>
                </div>
                <ul style={{ listStyle: "none", margin: ".75rem 0 0", padding: 0, fontFamily: F.mono, fontSize: ".8125rem" }}>
                  {o.invoice.map((l2) => (
                    <li key={l2.code} style={{ display: "flex", alignItems: "baseline", gap: ".5rem", padding: ".25rem 0", color: K.onG }}>
                      <span>{l2.description}{UNIT[RATE[l2.code]!.unit] && (l2.quantity > 1 || RATE[l2.code]!.unit === "lb") ? `, ${l2.quantity} ${UNIT[RATE[l2.code]!.unit]![l2.quantity > 1 ? 1 : 0]}` : ""}</span><span style={dots} /><span style={{ fontVariantNumeric: "tabular-nums" }}>{money(l2.cents)}</span>
                    </li>
                  ))}
                </ul>
                <div style={{ marginTop: ".75rem", paddingTop: ".625rem", borderTop: `1px solid ${K.onG3}` }}>
                  <span style={{ ...eyebrow, color: K.gAccent }}>tally would add</span>
                  {adds.length === 0 && <p style={{ margin: ".5rem 0 0", fontSize: ".8125rem", color: K.onG2 }}>Nothing. Everything on the note was billed, in the plan, or free.</p>}
                  <ul style={{ listStyle: "none", margin: ".5rem 0 0", padding: 0, display: "flex", flexDirection: "column", gap: ".5rem" }}>
                    {adds.map((x) => {
                      const held = x.st === "person", rej = x.st === "rejected", left = x.dec === "leave";
                      const strike = rej || left ? "line-through" : "none";
                      return (
                        <li key={x.it.id} style={{ display: "grid", gridTemplateColumns: "22px minmax(0,1fr)", gap: ".625rem", alignItems: "start" }}>
                          <span style={{ width: 22, height: 22, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: F.mono, fontSize: ".5625rem", fontWeight: 500, background: rej ? K.neg : held ? (x.dec === "bill" ? K.gAccent : K.warn) : K.gAccent, color: K.accentInk }}>{num[x.i]}</span>
                          <span style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: ".25rem" }}>
                            <span style={{ display: "flex", alignItems: "baseline", gap: ".5rem", fontFamily: F.mono, fontSize: ".8125rem", color: rej || left ? K.onG2 : K.onG }}>
                              <span style={{ textDecoration: strike, textDecorationColor: K.neg, textDecorationThickness: 2 }}>{draftText(x.it)}</span>
                              <span style={dots} />
                              <span style={{ fontVariantNumeric: "tabular-nums", textDecoration: strike, textDecorationColor: K.neg, textDecorationThickness: 2 }}>{money(x.it.priceCents)}</span>
                            </span>
                            <span style={{ fontSize: ".8125rem", color: rej ? "oklch(72% .14 27)" : held && !x.dec ? "oklch(78% .12 80)" : K.onG2 }}>
                              {rej ? "Blocked: the note doesn't say this work was done." : held ? (x.dec === "bill" ? "You approved this charge." : left ? "You left this off." : "Tally isn't sure. Add it?") : `Priced from the rate card, ${x.it.code}`}
                            </span>
                            {x.st === "counted" && x.it.expected !== "recover" && (
                              <span style={{ fontSize: ".75rem", color: "oklch(72% .14 27)" }}>Answer key: this work wasn't actually done. Counted by mistake.</span>
                            )}
                            {held && (
                              <span style={{ display: "flex", gap: ".25rem", marginTop: ".125rem" }}>
                                <button type="button" onClick={decide(x.it.id, "bill")} style={{ minHeight: 28, padding: "0 .625rem", borderRadius: 4, border: `1px solid ${x.dec === "bill" ? K.gAccent : K.onG3}`, background: x.dec === "bill" ? K.gAccent : "transparent", color: x.dec === "bill" ? K.g : K.onG, fontFamily: F.mono, fontSize: ".6875rem", cursor: "pointer" }}>Bill it</button>
                                <button type="button" onClick={decide(x.it.id, "leave")} style={{ minHeight: 28, padding: "0 .625rem", borderRadius: 4, border: `1px solid ${left ? K.onG : K.onG3}`, background: left ? K.onG : "transparent", color: left ? K.g : K.onG, fontFamily: F.mono, fontSize: ".6875rem", cursor: "pointer" }}>Leave it</button>
                              </span>
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
                <div style={{ marginTop: ".875rem", paddingTop: ".625rem", borderTop: `1px solid ${K.onG3}`, display: "flex", flexDirection: "column", gap: ".125rem", fontFamily: F.mono, fontSize: ".8125rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", color: K.onG2 }}><span>billed</span><span>{money(cur.billed)}</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between", color: K.gAccent }}><span>found</span><span>{cur.counted ? `+${money(cur.counted)}` : "$0"}</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: ".25rem", color: K.accentInk }}>
                    <span style={{ fontFamily: F.display, fontWeight: 600, fontSize: ".9375rem" }}>should have been</span>
                    <span style={{ fontFamily: F.display, fontWeight: 600, fontSize: "1.25rem", fontVariantNumeric: "tabular-nums" }}>{money(cur.billed + cur.counted)}</span>
                  </div>
                </div>
                <p style={{ margin: ".75rem 0 0", paddingTop: ".625rem", borderTop: `1px solid ${K.onG3}`, fontSize: ".8125rem", color: K.onG2 }}>Nothing is sent to the customer. The office checks these charges and updates the invoice.</p>
              </div>
            </div>

            <div style={{ marginTop: "2rem", paddingTop: "1rem", borderTop: `1px solid ${K.rule}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "1rem" }}>
                <span style={eyebrow}>How Tally decided</span>
                <span style={{ fontSize: ".75rem", color: K.ink3 }}>four checks on every piece of work</span>
              </div>
              <ul style={{ listStyle: "none", margin: ".5rem 0 0", padding: 0 }}>
                {cur.its.map((x) => Why({ x, n: num[x.i]!, o }))}
              </ul>
              <p style={{ margin: ".625rem 0 0", fontSize: ".75rem", color: K.ink3, maxWidth: "72ch" }}>Each bar shows how sure Tally is, from 0 to 100%. The black mark on “Sure it was done” is your auto-bill setting. The red mark on “Note backs up the charge” is at {pct(1 - th!.unsupported)}, measured on the test: below it, the charge is blocked.</p>
            </div>
          </article>
        </div>
      </div>
    );
  }

  function Why({ x, n, o }: { x: ItemInfo; n: string; o: Order }) {
    const it = x.it, st = x.st, top = topVerdict(judgmentOf(it));
    const drafted = it.draftedLine && ["counted", "person", "rejected"].includes(st);
    const invLine = it.code ? o.invoice.find((l2) => l2.code === it.code) : undefined;
    const basis = st === "invoiced" && invLine ? `Invoice line: ${invLine.description}`
      : it.code ? `Rate card ${it.code} · ${clauseText(it.clause)}` : clauseText(it.clause);
    const reason = st === "person" ? personReason(it, th!) : st === "rejected" ? "The note doesn't record this as done on this visit, so the drafted charge is blocked." : "";
    const bars = [
      bar(VN[top], it.verdict[top], it.verdict[top] >= 0.55 ? K.accent : K.rule2),
      bar("Included in the plan", it.covered, it.covered >= 0.5 ? K.accent : K.rule2),
      bar("Note backs up the charge", drafted ? 1 - it.unsupported : null, drafted && 1 - it.unsupported <= 1 - th!.unsupported ? K.neg : K.accent, drafted ? 1 - th!.unsupported : null, K.neg),
      bar("Sure it was done", it.evidence / 4, it.evidence / 4 >= actNow ? K.accent : K.warn, actNow, K.ink),
    ];
    return (
      <li key={it.id} style={{ padding: ".875rem 0", borderBottom: `1px solid ${K.rule}` }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: ".25rem .75rem" }}>
          <span style={{ fontFamily: F.mono, fontSize: ".6875rem", fontWeight: 500, color: ST[st][1] }}>{n}</span>
          <b style={{ color: K.ink, fontWeight: 500 }}>{labelOf(it)}</b>
          <span style={{ fontFamily: F.mono, fontSize: ".625rem", letterSpacing: ".06em", textTransform: "uppercase", border: "1px solid currentColor", borderRadius: 3, padding: "0 4px", color: ST[st][1] }}>{ST[st][0]}</span>
          <span style={{ fontSize: ".8125rem", color: K.ink3 }}>{basis}</span>
        </div>
        {reason && <p style={{ margin: ".375rem 0 0", paddingLeft: ".75rem", borderLeft: `2px solid ${ST[st][1]}`, fontSize: ".8125rem", color: K.ink2, maxWidth: "60ch" }}>{reason}</p>}
        <div style={{ marginTop: ".625rem", display: "grid", gap: ".5rem 1.5rem", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,10rem),1fr))" }}>
          {bars.map((b, k) => (
            <div key={k}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: ".5rem", alignItems: "baseline" }}>
                <span style={{ fontSize: ".75rem", color: b.v == null ? K.ink3 : K.ink }}>{b.q}</span>
                <span style={{ fontFamily: F.mono, fontSize: ".6875rem", fontVariantNumeric: "tabular-nums", color: b.fill === K.accent || b.fill === K.neg || b.fill === K.warn ? b.fill : K.ink3 }}>{b.v == null ? "no charge" : pct(b.v)}</span>
              </div>
              <div style={{ position: "relative", height: 6, marginTop: 4, borderRadius: 2, background: K.track, overflow: "hidden" }}>
                <span style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: b.v == null ? "0%" : `${b.v * 100}%`, background: b.fill, transition: "width 260ms cubic-bezier(.16,1,.3,1)" }} />
                {b.mark != null && <span style={{ position: "absolute", top: -2, bottom: -2, width: 2, left: `calc(${(b.mark * 100).toFixed(1)}% - 1px)`, background: b.markColor, opacity: 0.6, transition: "left 140ms cubic-bezier(.16,1,.3,1)" }} />}
              </div>
            </div>
          ))}
        </div>
      </li>
    );
  }

  function Line() {
    const presets: [string, number | null][] = [[`Recommended · ${pct(recommended)}`, null], ["Careful · 75%", 0.75], ["Relaxed · 50%", 0.5]];
    const effects: [string, string, string, string][] = [
      [money(found), "money found", "real unbilled work Tally caught, plus the charges you approved", K.accent],
      [String(routed), "left for your call", "Tally was not sure enough to add these itself", K.warn],
      [`${wrong} · ${money(wrongCents)}`, "charges added by mistake", "the answer key says the work was not done; this goes up as the setting gets more relaxed", K.neg],
      [String(guard), "charges blocked", "the note didn't back them up", K.ink],
    ];
    return (
      <div style={{ display: "grid", gap: "1.5rem 2.5rem", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,20rem),1fr))", alignItems: "start" }}>
        <div style={{ border: `1px solid ${K.rule}`, borderRadius: 10, padding: "1.25rem 1.5rem", background: K.side }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "baseline" }}>
            <span style={{ flex: 1, minWidth: 0, lineHeight: 1.35, fontWeight: 500, color: K.ink }}>How sure should Tally be before it adds a charge on its own?</span>
            <span style={{ fontFamily: F.mono, fontSize: ".75rem", color: K.accent, whiteSpace: "nowrap" }}>{pct(actNow)} · {measured ? "recommended" : "your setting"}</span>
          </div>
          <input type="range" min={0} max={1} step={0.02} value={dial} onChange={(e) => onDial(Number(e.target.value))} aria-label="Auto-bill setting" style={{ display: "block", width: "100%", marginTop: ".5rem", accentColor: K.accent, cursor: "pointer" }} />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".75rem", color: K.ink3, marginTop: ".125rem" }}><span>Ask me about more</span><span>Ask me about less</span></div>
          <div style={{ display: "flex", gap: ".5rem", marginTop: "1rem", flexWrap: "wrap" }}>
            {presets.map(([label, v]) => {
              const on = v === null ? measured : !measured && Math.abs(actNow - v) < 0.001;
              return <button key={label} type="button" onClick={() => setAct(v)} style={{ minHeight: 32, padding: "0 .75rem", borderRadius: 6, border: `1px solid ${on ? K.accent : K.rule2}`, background: on ? K.accentSoft : K.paper, font: "inherit", fontSize: ".8125rem", cursor: "pointer", color: on ? K.accent : K.ink2 }}>{label}</button>;
            })}
          </div>
          <p style={{ margin: ".625rem 0 0", fontSize: ".75rem", color: K.ink3 }}>{measured ? "Recommended is the setting that worked best on the first 200 of these jobs, chosen before the rest were scored." : "This is your own setting. Every page now shows what it would do."}</p>
          <ul style={{ listStyle: "none", margin: "1.25rem 0 0", padding: ".875rem 0 0", borderTop: `1px solid ${K.rule}`, display: "flex", flexDirection: "column", gap: ".375rem", fontSize: ".875rem" }}>
            <li style={{ display: "flex", gap: ".75rem" }}><span style={{ flex: "none", minWidth: "7.5rem", fontFamily: F.mono, fontSize: ".75rem", color: K.ink }}>{pct(actNow)} sure or more</span><span>Tally adds the charge on its own</span></li>
            <li style={{ display: "flex", gap: ".75rem" }}><span style={{ flex: "none", minWidth: "7.5rem", fontFamily: F.mono, fontSize: ".75rem", color: K.ink }}>under {pct(actNow)}</span><span>Tally asks you first (Needs your call)</span></li>
            <li style={{ display: "flex", gap: ".75rem" }}><span style={{ flex: "none", minWidth: "7.5rem", fontFamily: F.mono, fontSize: ".75rem", color: K.neg }}>note says otherwise</span><span>Blocked if the note doesn't back up the charge</span></li>
          </ul>
        </div>
        <div>
          <h2 style={{ margin: 0, ...eyebrow }}>At this setting</h2>
          <ul style={{ listStyle: "none", margin: ".625rem 0 0", padding: 0, borderTop: `1px solid ${K.rule}` }}>
            {effects.map(([n, label, sub, color]) => (
              <li key={label} style={{ display: "grid", gridTemplateColumns: "8.5rem minmax(0,1fr)", gap: "1rem", alignItems: "baseline", padding: ".625rem .25rem", borderBottom: `1px solid ${K.rule}` }}>
                <span style={{ fontFamily: F.display, fontWeight: 600, fontSize: "1.375rem", color, fontVariantNumeric: "tabular-nums", letterSpacing: "-.02em" }}>{n}</span>
                <span><span style={{ display: "block", color: K.ink, fontWeight: 500 }}>{label}</span><span style={{ display: "block", fontSize: ".8125rem", color: K.ink3 }}>{sub}</span></span>
              </li>
            ))}
          </ul>
          <p style={{ margin: "1rem 0 0", fontSize: ".8125rem", color: K.ink3, maxWidth: "52ch" }}>Try moving it. A relaxed setting finds more money but adds more charges by mistake. A careful one sends more to you. Tally doesn't re-read anything when you move it, so every page updates straight away.</p>
        </div>
      </div>
    );
  }
}

function bar(q: string, v: number | null, fill: string, mark: number | null = null, markColor: string = K.ink) {
  return { q, v, fill, mark, markColor };
}

function personReason(it: Item, t: Thresholds): string {
  if (it.evidence < t.evidence) return `Tally is ${pct(it.evidence / 4)} sure this was done. Your setting adds charges on its own only at ${pct(t.evidence / 4)} or more.`;
  if (it.covered >= t.covered) return `Tally says this is billable, but its plan check says the agreement may cover it (${pct(it.covered)}). You decide.`;
  return "Too close to call. You decide.";
}

function Stat({ n, color, edge, label, sub, onClick }: { n: string; color: string; edge: string; label: string; sub: string; onClick?: () => void }) {
  const body = (
    <>
      <div style={{ ...bigNum, color }}>{n}</div>
      <div style={{ marginTop: ".25rem", color: K.ink3, fontSize: ".8125rem" }}><b style={{ color: K.ink2, fontWeight: 500 }}>{label}</b> {sub}</div>
    </>
  );
  const style: CSSProperties = { minWidth: 0, padding: "0 0 0 1rem", borderLeft: `2px solid ${edge}`, textAlign: "left" };
  return onClick
    ? <button type="button" onClick={onClick} style={{ ...style, border: 0, borderLeft: `2px solid ${edge}`, background: "transparent", cursor: "pointer", font: "inherit" }}>{body}</button>
    : <div style={style}>{body}</div>;
}

function How({ onClose, found, planted }: { onClose: () => void; found: string; planted: string }) {
  const h3: CSSProperties = { margin: "1.5rem 0 0", fontFamily: F.display, fontSize: ".9375rem", fontWeight: 600, letterSpacing: "-.02em", color: K.ink };
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 50, background: "oklch(18% .02 258 / .66)", display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label="How it works" style={{ width: "100%", maxWidth: "min(42rem, calc(100vw - 2rem))", maxHeight: "calc(100vh - 3rem)", overflowY: "auto", borderRadius: 10, background: K.paper, color: K.ink2, boxShadow: "0 16px 48px oklch(20% .02 258 / .18)" }}>
        <div style={{ position: "sticky", top: 0, display: "flex", alignItems: "center", justifyContent: "space-between", gap: ".75rem", padding: "1rem 1.5rem", borderBottom: `1px solid ${K.rule}`, background: K.paper }}>
          <h2 style={{ margin: 0, flex: 1, fontFamily: F.display, fontSize: "1.0625rem", fontWeight: 600, letterSpacing: "-.025em", color: K.ink }}>How Tally works</h2>
          <button type="button" onClick={onClose} style={{ minHeight: 36, padding: "0 1rem", borderRadius: 6, border: `1px solid ${K.rule2}`, background: "transparent", color: K.ink3, font: "inherit", fontSize: ".8125rem", fontWeight: 500, cursor: "pointer" }}>Close</button>
        </div>
        <div style={{ padding: "1rem 1.5rem 2rem" }}>
          <p style={{ margin: 0 }}>After a job, the technician writes down what they did. The office writes the invoice from a separate ticket. Nobody compares the two, so extra parts, extra hours and after-hours calls quietly go unbilled. Tally compares them for you.</p>
          <h3 style={h3}>1. Read the note</h3>
          <p style={{ margin: ".5rem 0 0" }}>Plain rules pick out each piece of work the technician mentions. On a job page, these are the underlined phrases.</p>
          <h3 style={h3}>2. Check each piece of work four ways</h3>
          <ul style={{ margin: ".5rem 0 0", paddingLeft: "1.2rem" }}>
            <li>Was it already billed, done but not billed, included in the service plan, or free?</li>
            <li style={{ marginTop: ".25rem" }}>Is it included in the customer's service plan?</li>
            <li style={{ marginTop: ".25rem" }}>Does the note back up the charge Tally is about to add?</li>
            <li style={{ marginTop: ".25rem" }}>How sure is it that the work was actually done?</li>
          </ul>
          <p style={{ margin: ".5rem 0 0" }}>Drex, a small decision model, answers all four in one request. Each answer is a percentage, shown as a bar.</p>
          <h3 style={h3}>3. Price it from the rate card</h3>
          <p style={{ margin: ".5rem 0 0" }}>Prices come straight from the company's own rate card, and every total is plain arithmetic. The model only answers the four checks; it never makes up a price or writes a line.</p>
          <h3 style={h3}>4. Block anything the note doesn't say</h3>
          <p style={{ margin: ".5rem 0 0" }}>If the technician only checked or quoted something, or a line in the note asks for a charge instead of recording work, Tally blocks it. If it isn't sure enough, it asks you under Needs your call. It never sends anything to a customer.</p>
          <div style={{ marginTop: "1.25rem", borderLeft: `2px solid ${K.accent}`, background: K.accentSoft, borderRadius: "0 6px 6px 0", padding: ".75rem 1rem" }}>
            <p style={{ margin: 0 }}>This test: 1,000 generated HVAC jobs with {planted} of unbilled work hidden in them on purpose, so the right answer is known. Tally found {found} of it.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
