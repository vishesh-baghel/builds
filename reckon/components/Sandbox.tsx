"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HUMAN_MINUTES_PER_REPLY, type ClassScores, type Thresholds } from "../src/policy";
import type { AmountComponents } from "../src/resolve/amount";
import type { DateComponents } from "../src/resolve/date";
import { decidePlan, PLAIN, type Plan } from "../src/stages/decide";
import { REPLY_CLASSES, type Invoice, type Reply, type ReplyClass } from "../src/types";
import { MAX_REPLY_CHARS } from "../lib/limits";
import { ReadView } from "./ReadView";

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
  const [mode, setMode] = useState<"fixture" | "own">("fixture");
  const [draft, setDraft] = useState("");
  const [draftInvoice, setDraftInvoice] = useState("4340");
  const [own, setOwn] = useState<{ judgment: Judgment; invoice: string; body: string } | null>(null);
  const [ownError, setOwnError] = useState<string | null>(null);
  const [classifying, setClassifying] = useState(false);
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

  /**
   * Judges text the visitor wrote. There is no replay behind this one on purpose: a recorded
   * run holds no judgment for a sentence nobody has written before, and faking one would be
   * exactly the dishonesty this control exists to disprove. When it cannot judge, it says so.
   */
  const classifyOwn = useCallback(async () => {
    const text = draft.trim();
    if (!text || classifying) return;

    setClassifying(true);
    setOwnError(null);
    try {
      const response = await fetch("/api/classify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, invoice: draftInvoice }),
      });
      const data = await response.json() as { judgment?: Judgment; invoice?: string; error?: string };
      if (!response.ok || !data.judgment) {
        setOwn(null);
        setOwnError(data.error ?? "That did not work.");
        return;
      }
      setOwn({ judgment: data.judgment, invoice: data.invoice ?? draftInvoice, body: text });
    } catch {
      setOwn(null);
      setOwnError("Could not reach the judgment service.");
    } finally {
      setClassifying(false);
    }
  }, [draft, draftInvoice, classifying]);

  /** The visitor's text, decided by the very same policy the committed replies go through. */
  const ownPlan = useMemo(() => {
    if (!own) return null;
    const invoice = byInvoice.get(own.invoice);
    if (!invoice) return null;
    return decidePlan({
      replyId: "your reply", body: own.body, invoice,
      scores: own.judgment.scores, date: own.judgment.date, amount: own.judgment.amount,
      thresholds, asOf,
    });
  }, [own, byInvoice, thresholds, asOf]);

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
                These are replies as they land in the finance mailbox &mdash; the inbox the
                reminders were sent from, whichever tool sent them. Every one is read and sorted
                before anyone opens it. Arguments, questions and wrong-person replies always
                reach a human: that is the design, not a shortfall.
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
            <div className="modes" role="tablist" aria-label="What to read">
              <button
                className="mode" type="button" role="tab" aria-selected={mode === "fixture"}
                onClick={() => setMode("fixture")}
              >From the inbox</button>
              <button
                className="mode" type="button" role="tab" aria-selected={mode === "own"}
                onClick={() => setMode("own")}
              >Write your own</button>
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
            {mode === "own" ? (
              <>
                <div className="compose">
                  <label className="compose__label" htmlFor="draft">
                    Write a reply the way a customer would, and watch it go through the same
                    seven questions. Nothing here is matched against a script.
                  </label>
                  <textarea
                    id="draft" value={draft} maxLength={MAX_REPLY_CHARS}
                    rows={4} placeholder="e.g. We paid half of this last Tuesday and we are disputing the call-out charge on the rest."
                    onChange={(event) => setDraft(event.target.value)}
                  />
                  <div className="compose__row">
                    <label className="sr" htmlFor="draftInv">Against which invoice</label>
                    <select id="draftInv" value={draftInvoice} onChange={(e) => setDraftInvoice(e.target.value)}>
                      {invoices.map((inv) => (
                        <option key={inv.invoiceNo} value={inv.invoiceNo}>
                          {inv.customer} — {inv.invoiceNo}, {money(inv.openBalance)} open
                        </option>
                      ))}
                    </select>
                    <span className="compose__count num">{draft.length}/{MAX_REPLY_CHARS}</span>
                    <button
                      className="btn btn--primary" type="button"
                      disabled={classifying || draft.trim().length === 0}
                      onClick={() => void classifyOwn()}
                    >
                      {classifying ? "Reading…" : "Read it"}
                    </button>
                  </div>
                  {ownError && <p className="compose__err">{ownError}</p>}
                </div>

                {own && ownPlan && byInvoice.get(own.invoice) && (
                  <ReadView
                    invoice={byInvoice.get(own.invoice) as Invoice}
                    body={own.body}
                    plan={ownPlan}
                    scores={own.judgment.scores}
                    thresholds={thresholds}
                    money={money}
                    provenance={`judged live just now · ${own.judgment.model}`}
                    banner={
                      <p className="yours">
                        <b>Your words, judged live.</b> Same seven questions, same thresholds,
                        same code as every reply on the left. Not part of the measured 72 — the
                        published figures are the frozen set and only the frozen set.
                      </p>
                    }
                  />
                )}
              </>
            ) : reply && invoice && plan && judgment ? (
              <ReadView
                invoice={invoice}
                body={reply.body}
                plan={plan}
                scores={judgment.scores}
                thresholds={thresholds}
                money={money}
                busy={busy}
                {...(reply.note ? { note: reply.note } : {})}
                provenance={`${sources[reply.id] === "live" ? "judged live just now" : `recorded run of ${runDate}`} · ${judgment.model}`}
              />
            ) : null}
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
              Tools that send the reminders are everywhere &mdash; QuickBooks bundles one at
              $85/mo, Chaser lists $180/mo &mdash; and the better ones already do something with
              what comes back. Chaser logs replies from your Gmail or Outlook against the
              customer, and its AI email generator reads a debtor&rsquo;s message, detects intent,
              and drafts a courteous response for you to send.
            </p>
            <p>
              <b>That draft is the difference.</b> What this produces is not a message. It is a
              decision: the chase pauses or stops, a reconciliation item opens, a part payment is
              recorded, a promise gets a date worked out in code. It writes no prose and sends
              nothing &mdash; there is no email path in it at all.
            </p>
          </div>

          <h3>Using it, in three steps</h3>
          <ol>
            <li>
              <b>Pick a reply</b> from the list. These stand in for what arrives in the finance
              mailbox after a chasing tool sends its reminders &mdash; replies land in that inbox
              whichever tool sent them. There are {replies.length}, written to look like a real
              one: mostly noise, with the awkward cases mixed in.
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

          <h3>&ldquo;Isn&rsquo;t this just hardcoded?&rdquo;</h3>
          <p>
            Fair question, and the reason for the <b>Write your own</b> tab. Type any reply you
            like against any invoice in the ledger and it goes to the same model, through the
            same seven questions, into the same policy, and renders in the same component as
            everything on the left. Nothing is matched against a script.
          </p>
          <p>
            The committed {replies.length} exist for a different reason: they were labelled
            <em> before</em> the build, so they can be scored honestly. A set written afterwards
            gets unconsciously shaped by what the system already does, and the accuracy number
            stops meaning anything. Your own text is judged live and is deliberately{" "}
            <em>not</em> counted in those figures.
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
