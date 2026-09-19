"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HUMAN_MINUTES_PER_REPLY, type ClassScores, type Thresholds } from "../src/policy";
import type { AmountComponents } from "../src/resolve/amount";
import type { DateComponents } from "../src/resolve/date";
import { decidePlan, PLAIN, type Plan } from "../src/stages/decide";
import { REPLY_CLASSES, type Invoice, type Reply, type ReplyClass } from "../src/types";

/**
 * The instrument.
 *
 * The only thing bought from the vendor is the seven probabilities. Everything the dials do —
 * the bands, the tie-breaks, the date and amount assembly, the effects — is `decidePlan`, the
 * same function the headless pipeline and the scorecard call, running here in the browser.
 * That is why moving a dial costs nothing: the judgment is unchanged and only the composition
 * re-runs.
 */

type Judgment = { scores: ClassScores; date: DateComponents; amount: AmountComponents; model: string };

export interface SandboxProps {
  asOf: string;
  runDate: string;
  defaults: { act: number; review: number };
  invoices: Invoice[];
  replies: Reply[];
  recorded: Record<string, Judgment>;
}

/**
 * How much higher the two expensive classes sit. Taken from the committed policy, where
 * `dispute` and `claimed_payment` clear at 0.80 against a base of 0.65 — moving the dial keeps
 * that relationship rather than flattening it.
 */
const RISKY_PREMIUM = 0.15;
const RISKY: readonly ReplyClass[] = ["dispute", "claimed_payment"];

const thresholdsFor = (act: number, review: number): Thresholds => ({
  review,
  act: Object.fromEntries(REPLY_CLASSES.map((label) => [
    label, RISKY.includes(label) ? Math.min(0.99, act + RISKY_PREMIUM) : act,
  ])) as Thresholds["act"],
});

const money = (n: number): string => `$${Math.round(n).toLocaleString("en-US")}`;
const hhmm = (minutes: number): string => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h${m ? ` ${m}m` : ""}` : `${m}m`;
};

export function Sandbox(props: SandboxProps) {
  const { asOf, replies, invoices, recorded, runDate } = props;

  const [act, setAct] = useState(props.defaults.act);
  const [review, setReview] = useState(props.defaults.review);
  const [minutes, setMinutes] = useState(HUMAN_MINUTES_PER_REPLY);
  const [filterClass, setFilterClass] = useState("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("r043");
  const [judgments, setJudgments] = useState<Record<string, Judgment>>(recorded);
  const [sources, setSources] = useState<Record<string, "live" | "recorded">>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [spend, setSpend] = useState({ cents: 0, cap: 0, persistent: false });
  const [busy, setBusy] = useState(false);
  const [freeFlash, setFreeFlash] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);

  const byInvoice = useMemo(
    () => new Map(invoices.map((invoice) => [invoice.invoiceNo, invoice])),
    [invoices],
  );
  const thresholds = useMemo(() => thresholdsFor(act, review), [act, review]);

  /** Every reply re-decided at the current dial setting. Pure, and free. */
  const plans = useMemo(() => {
    const out = new Map<string, Plan>();
    for (const reply of replies) {
      const judgment = judgments[reply.id];
      const invoice = byInvoice.get(reply.invoice);
      if (!judgment || !invoice) continue;
      out.set(reply.id, decidePlan({
        replyId: reply.id, body: reply.body, invoice,
        scores: judgment.scores, date: judgment.date, amount: judgment.amount,
        thresholds, asOf,
      }));
    }
    return out;
  }, [replies, judgments, byInvoice, thresholds, asOf]);

  const figures = useMemo(() => {
    let automated = 0;
    let reached = 0;
    const atRisk = new Set<string>();

    for (const reply of replies) {
      const plan = plans.get(reply.id);
      if (!plan) continue;
      if (plan.handoffs.length > 0) reached += 1; else automated += 1;
      for (const label of RISKY) {
        if (plan.asserted.includes(label) || plan.review.includes(label)) atRisk.add(reply.invoice);
      }
    }

    return {
      automated, reached, total: automated + reached,
      risk: [...atRisk].reduce((sum, no) => sum + (byInvoice.get(no)?.openBalance ?? 0), 0),
    };
  }, [replies, plans, byInvoice]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return replies.filter((reply) =>
      (filterClass === "all" || reply.label === filterClass) &&
      (!needle || reply.body.toLowerCase().includes(needle) || reply.id.includes(needle) ||
        (byInvoice.get(reply.invoice)?.customer ?? "").toLowerCase().includes(needle)));
  }, [replies, filterClass, query, byInvoice]);

  const pick = useCallback(async (id: string) => {
    setSelected(id);
    if (sources[id]) return;

    setBusy(true);
    try {
      const response = await fetch("/api/judge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!response.ok) return;
      const data = await response.json() as {
        judgment: Judgment; source: "live" | "recorded"; why: string | null;
        spentCents: number; capCents: number; persistent: boolean;
      };
      setJudgments((current) => ({ ...current, [id]: data.judgment }));
      setSources((current) => ({ ...current, [id]: data.source }));
      setSpend({ cents: data.spentCents, cap: data.capCents, persistent: data.persistent });
      setNotice(data.why);
    } catch {
      setNotice("Could not reach the judgment service, so this is the recorded run.");
    } finally {
      setBusy(false);
    }
  }, [sources]);

  useEffect(() => { void pick("r043"); }, [pick]);

  const flashFree = () => {
    setFreeFlash(true);
    const timer = setTimeout(() => setFreeFlash(false), 700);
    return () => clearTimeout(timer);
  };

  const reply = replies.find((candidate) => candidate.id === selected);
  const invoice = reply ? byInvoice.get(reply.invoice) : undefined;
  const plan = reply ? plans.get(reply.id) : undefined;
  const judgment = reply ? judgments[reply.id] : undefined;

  const counts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const r of replies) out[r.label] = (out[r.label] ?? 0) + 1;
    return out;
  }, [replies]);

  return (
    <>
      <header className="bar">
        <div className="wrap bar__in">
          <span className="bar__mark">reckon</span>
          <span className="bar__tag">reads what the debtor writes back</span>
          <div className="bar__right">
            {spend.cap > 0 && (
              <span className="spend">
                spend <span className="num">{spend.cents.toFixed(2)} / {spend.cap}¢</span>
              </span>
            )}
            <button className="btn btn--primary" type="button" onClick={() => dialog.current?.showModal()}>
              How it works
            </button>
          </div>
        </div>
      </header>

      <section className="pitch" aria-label="What this setting does across every reply">
        <div className="wrap">
          <div className="pitch__in">
            <div>
              <p className="pitch__lead">
                <b>{figures.automated} of {figures.total}</b> replies close without a person.{" "}
                <b>{figures.reached}</b> reach one, already sorted.
              </p>
              <p className="pitch__sub">
                Every reply is read and sorted first. Arguments, questions and wrong-person
                replies always reach a human &mdash; that is the design, not a shortfall.
              </p>
            </div>
            <div className="pitch__est">
              <label htmlFor="mins">a reply takes</label>
              <input
                id="mins" type="number" min={1} max={60} step={1} value={minutes}
                onChange={(event) => setMinutes(Math.max(1, Math.min(60, Number(event.target.value) || 1)))}
              />
              <span>min to read</span>
              <span className="tagline">your estimate</span>
            </div>
          </div>

          <div className="figures">
            <div className="fig">
              <div className="fig__n">{hhmm(figures.total * minutes)}</div>
              <p className="fig__l">to read all {figures.total} by hand, <b>every time</b> this inbox fills</p>
            </div>
            <div className="fig fig--saved">
              <div className="fig__n">{hhmm(figures.automated * minutes)}</div>
              <p className="fig__l">nobody does &mdash; those replies never get opened</p>
            </div>
            <div className="fig">
              <div className="fig__n">{hhmm(figures.reached * minutes)}</div>
              <p className="fig__l">still yours, on the <b>{figures.reached}</b> that need judgment</p>
            </div>
            <div className="fig fig--risk">
              <div className="fig__n">{money(figures.risk)}</div>
              <p className="fig__l">outstanding on replies that <b>dispute the bill or claim it was already paid</b></p>
            </div>
          </div>
        </div>
      </section>

      <section className="policy" aria-label="Policy">
        <div className="wrap policy__in">
          <div>
            <div className="dial__top">
              <label className="dial__name" htmlFor="actRange">How sure before it acts</label>
              <span className="dial__val num">{act.toFixed(2)}</span>
            </div>
            <input
              id="actRange" type="range" min={0.5} max={0.99} step={0.01} value={act}
              onChange={(event) => { setAct(Number(event.target.value)); flashFree(); }}
            />
          </div>
          <div>
            <div className="dial__top">
              <label className="dial__name" htmlFor="revRange">Worth a second look</label>
              <span className="dial__val num">{review.toFixed(2)}</span>
            </div>
            <input
              id="revRange" type="range" min={0.1} max={0.7} step={0.01} value={review}
              onChange={(event) => { setReview(Number(event.target.value)); flashFree(); }}
            />
          </div>
          <p className="policy__free" style={{ opacity: freeFlash ? 1 : 0.55 }}>
            <b>no model call</b>
          </p>
        </div>
      </section>

      <main className="wrap">
        {notice && (
          <div className="replay is-on">
            <b>Recorded run.</b> {notice}
          </div>
        )}

        <div className="zones">
          <nav className="rail" aria-label="Replies">
            <div className="rail__head">
              <span className="mono">Replies</span>
              <span className="mono num">{visible.length}/{replies.length}</span>
            </div>
            <div className="rail__find">
              <label className="sr" htmlFor="fClass">Filter</label>
              <select id="fClass" value={filterClass} onChange={(event) => setFilterClass(event.target.value)}>
                <option value="all">Every reply ({replies.length})</option>
                {REPLY_CLASSES.map((label) => (
                  <option key={label} value={label}>
                    {PLAIN[label].charAt(0).toUpperCase() + PLAIN[label].slice(1)} ({counts[label] ?? 0})
                  </option>
                ))}
              </select>
              <label className="sr" htmlFor="fText">Search</label>
              <input
                id="fText" type="search" placeholder="Search" autoComplete="off"
                value={query} onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <ul className="list">
              {visible.length === 0 && <li className="list__none">Nothing matches that.</li>}
              {visible.map((candidate) => (
                <li key={candidate.id}>
                  <button
                    className="item" type="button"
                    aria-current={selected === candidate.id}
                    onClick={() => void pick(candidate.id)}
                  >
                    <span className="item__top">
                      <span className="item__who">{byInvoice.get(candidate.invoice)?.customer}</span>
                      {candidate.also.length > 0 && <span className="item__flag">2 reads</span>}
                    </span>
                    <span className="item__line">{candidate.body}</span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          <article className="read" aria-live="polite">
            {reply && invoice && plan && judgment && (
              <>
                <p className="read__meta">
                  <b>{invoice.customer}</b>
                  <span>invoice {invoice.invoiceNo}</span>
                  <span>{money(invoice.openBalance)} outstanding</span>
                  <span>{invoice.daysPastDue} days late</span>
                  {busy && <span>judging&hellip;</span>}
                </p>

                <blockquote className="read__msg">{reply.body}</blockquote>

                <p className="read__verdict">
                  {plan.asserted.length === 0
                    ? <>Not sure enough about this one, so <b>a person gets it</b>.</>
                    : <>Read as {plan.asserted.map((label, index) => (
                        <span key={label}>{index > 0 ? " and " : ""}<b>{PLAIN[label]}</b></span>
                      ))}{plan.tieBreak ? `, led by ${plan.tieBreak.name}` : ""}.</>}
                </p>

                {plan.effects.length > 0 && (
                  <ul className="does">
                    {plan.effects.map((effect) => (
                      <li key={effect.action}>
                        <span className="does__mark">&rarr;</span>
                        <span>
                          <b>{effect.action.replace(/_/g, " ")}</b>
                          <small>{effect.summary}</small>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                {plan.handoffs.length > 0 && (
                  <div className="handover">
                    <h3>Handed to a person</h3>
                    <ul>{plan.handoffs.map((line) => <li key={line}>{line}</li>)}</ul>
                    <p>
                      Invoice {invoice.invoiceNo}, the full message and every score go with it,
                      so nobody re-reads the mailbox.
                    </p>
                  </div>
                )}

                {reply.note && (
                  <p className="why"><b>Why this one is tricky:</b> {reply.note}</p>
                )}

                <section className="reads">
                  <span className="mono">
                    What it read &mdash; the model&rsquo;s raw judgment, not calibrated frequencies
                  </span>
                  <div className="reads__grid">
                    {REPLY_CLASSES.map((label) => {
                      const value = judgment.scores[label];
                      const on = plan.asserted.includes(label);
                      const maybe = plan.review.includes(label);
                      return (
                        <div key={label} className={`pb ${on ? "is-act" : maybe ? "is-review" : ""}`}>
                          <div className="pb__top">
                            <span className="pb__name">{PLAIN[label]}</span>
                            <span className="pb__val">{value.toFixed(2)}</span>
                          </div>
                          <div className="pb__track">
                            <span className="pb__fill" style={{ width: `${value * 100}%` }} />
                            <span className="pb__mark" style={{ left: `calc(${thresholds.act[label] * 100}% - 1px)` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>

                <details className="steps">
                  <summary><span className="mono">Every step it took</span></summary>
                  <ul className="steps__log">
                    <li><span className="mono">extract</span><span>
                      invoice {invoice.invoiceNo}, {invoice.daysPastDue} days past due, {money(invoice.openBalance)} open
                    </span></li>
                    <li><span className="mono">classify</span><span>
                      {REPLY_CLASSES.map((label) => `${label} ${judgment.scores[label].toFixed(2)}`).join("  ")}
                    </span></li>
                    <li><span className="mono">decide</span><span>{plan.reason}</span></li>
                    {plan.effects.map((effect) => (
                      <li key={effect.action}><span className="mono">act</span><span>{effect.action}</span></li>
                    ))}
                    {plan.handoffs.length > 0 && (
                      <li><span className="mono">escalate</span><span>
                        {plan.handoffs.length} reason(s), full reply attached
                      </span></li>
                    )}
                    <li><span className="mono">source</span><span>
                      {sources[reply.id] === "live" ? "judged live just now" : `recorded run of ${runDate}`}
                      {" · "}{judgment.model}
                    </span></li>
                  </ul>
                </details>
              </>
            )}
          </article>
        </div>

        <footer className="foot">
          Ledger as of <span className="num">{asOf}</span> &mdash; 15 open invoices worth{" "}
          <span className="num">$245,960</span>, {replies.length} hand-written replies,{" "}
          {replies.filter((r) => r.hard).length} of them deliberate edge cases.
          Self-built experiment on invented data. No client data, names or results.
        </footer>
      </main>

      <dialog ref={dialog} aria-labelledby="howTitle">
        <div className="mhead">
          <h2 id="howTitle">How it works</h2>
          <button className="btn btn--ghost" type="button" onClick={() => dialog.current?.close()}>Close</button>
        </div>
        <div className="mbody">
          <h3>The problem, in one line</h3>
          <p>
            You chase an unpaid invoice. The customer writes back. Now somebody has to read that
            reply and work out what it actually means &mdash; are they paying, arguing, confused,
            or was it the wrong person entirely? That reading is the part nobody automated.
          </p>
          <div className="mcall">
            <p>
              Tools that send the reminders are everywhere. QuickBooks bundles one at $85/mo;
              Chaser lists $180/mo. Neither of their product pages advertises handling what comes
              <em> back</em>.
            </p>
            <p>So this does not replace your chasing tool. It sits behind it and reads the replies.</p>
          </div>

          <h3>Using it, in three steps</h3>
          <ol>
            <li>
              <b>Pick a reply</b> from the list. There are {replies.length}, written to look like
              a real inbox &mdash; mostly noise, with the awkward ones mixed in.
            </li>
            <li>
              <b>Read the seven scores</b> under the message. One per outcome, because a message
              can genuinely be two things at once.
            </li>
            <li>
              <b>Move the dial</b> marked &ldquo;how sure before it acts&rdquo;. That is you
              choosing how confident it must be before it does anything by itself. Everything
              below your line goes to a person.
            </li>
          </ol>
          <p>
            Try the ones marked <code>2 reads</code>. Those pay part of the bill and argue about
            the rest. A system forced to pick one answer would have thrown one of them away.
          </p>

          <h3>What the dial costs</h3>
          <p>
            Nothing. The seven scores are bought once per reply and cached; moving the dial
            re-runs only the policy, which is ordinary code. The spend counter does not move.
          </p>

          <h3>What this is not</h3>
          <p>
            It never sends anything &mdash; there is no email path in the system at all. It never
            marks an invoice paid; a claim of payment opens a check for a person. The data is
            invented, and this is a self-built experiment, not a client result.
          </p>
        </div>
      </dialog>
    </>
  );
}
