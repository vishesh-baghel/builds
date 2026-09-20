"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { MAX_REPLY_CHARS } from "../lib/limits";
import { HUMAN_MINUTES_PER_REPLY, type ClassScores, type Thresholds } from "../src/policy";
import type { AmountComponents } from "../src/resolve/amount";
import type { DateComponents } from "../src/resolve/date";
import { decidePlan, PLAIN } from "../src/stages/decide";
import { REPLY_CLASSES, type Invoice, type Reply, type ReplyClass } from "../src/types";
import { ReadView } from "./ReadView";

/**
 * The instrument.
 *
 * The 72 committed replies were judged once, in a recorded run, and their answers ship with
 * the page. Nothing on this tab calls the model, ever: re-buying a judgment that has not
 * changed would cost money to learn nothing. The live path is the "Write your own" tab, which
 * is where a visitor can satisfy themselves that none of this is a lookup table.
 *
 * Everything the dials do runs here in the browser through `decidePlan`, the same function the
 * headless pipeline and the scorecard call.
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
 * How much higher the two costly classes sit. Taken from the committed policy, where a reply
 * that argues or claims payment must clear 0.80 against 0.65 for the rest. Moving the dial
 * keeps that gap rather than flattening it.
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

const BLANK: Judgment = {
  scores: Object.fromEntries(REPLY_CLASSES.map((l) => [l, 0])) as ClassScores,
  date: { anchor: "none", weekday: "none", period: "none" },
  amount: { shape: "none", fraction: "none" },
  model: "unknown",
};

export function Sandbox(props: SandboxProps) {
  const { asOf, replies, invoices, recorded, runDate } = props;

  const [act, setAct] = useState(props.defaults.act);
  const [review, setReview] = useState(props.defaults.review);
  const [minutes, setMinutes] = useState(HUMAN_MINUTES_PER_REPLY);
  const [filterClass, setFilterClass] = useState("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("r043");
  const [mode, setMode] = useState<"fixture" | "own">("fixture");
  const [draft, setDraft] = useState("");
  const [draftInvoice, setDraftInvoice] = useState("4340");
  const [own, setOwn] = useState<{ judgment: Judgment; invoice: string; body: string } | null>(null);
  const [ownError, setOwnError] = useState<string | null>(null);
  const [classifying, setClassifying] = useState(false);
  const [freeFlash, setFreeFlash] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);

  const byInvoice = useMemo(
    () => new Map(invoices.map((invoice) => [invoice.invoiceNo, invoice])),
    [invoices],
  );
  const thresholds = useMemo(() => thresholdsFor(act, review), [act, review]);

  /** Every reply re-decided at the current dial setting. Pure, instant, and free. */
  const plans = useMemo(() => {
    const out = new Map<string, ReturnType<typeof decidePlan>>();
    for (const reply of replies) {
      const judgment = recorded[reply.id];
      const invoice = byInvoice.get(reply.invoice);
      if (!judgment || !invoice) continue;
      out.set(reply.id, decidePlan({
        replyId: reply.id, body: reply.body, invoice,
        scores: judgment.scores, date: judgment.date, amount: judgment.amount,
        thresholds, asOf,
      }));
    }
    return out;
  }, [replies, recorded, byInvoice, thresholds, asOf]);

  const figures = useMemo(() => {
    let handled = 0;
    let reachYou = 0;
    const atRisk = new Set<string>();

    for (const reply of replies) {
      const plan = plans.get(reply.id);
      if (!plan) continue;
      if (plan.handoffs.length > 0) reachYou += 1; else handled += 1;
      for (const label of RISKY) {
        if (plan.asserted.includes(label) || plan.review.includes(label)) atRisk.add(reply.invoice);
      }
    }

    return {
      handled, reachYou, total: handled + reachYou,
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

  /**
   * Judges text the visitor wrote. There is deliberately no fallback behind this one: a
   * recorded run holds no answer for a sentence nobody has written before, and showing a
   * stand-in would be the exact thing this tab exists to disprove. If it cannot judge, it says so.
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
      setOwnError("Could not reach the service that reads replies.");
    } finally {
      setClassifying(false);
    }
  }, [draft, draftInvoice, classifying]);

  const resetOwn = useCallback(() => {
    setOwn(null);
    setOwnError(null);
    setDraft("");
    composer.current?.focus();
  }, []);

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
    setTimeout(() => setFreeFlash(false), 700);
  };

  const reply = replies.find((candidate) => candidate.id === selected);
  const invoice = reply ? byInvoice.get(reply.invoice) : undefined;
  const plan = reply ? plans.get(reply.id) : undefined;
  const judgment = reply ? recorded[reply.id] ?? BLANK : BLANK;

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
          <span className="bar__tag">reads what the customer writes back</span>
          <div className="bar__right">
            <button className="btn btn--primary" type="button" onClick={() => dialog.current?.showModal()}>
              How it works
            </button>
          </div>
        </div>
      </header>

      <section className="pitch" aria-label="What this setting does across every reply">
        <div className="wrap">
          <div className="pitch__in">
            <div className="pitch__say">
              <p className="pitch__lead">
                <b>{figures.handled} of {figures.total}</b> replies are finished without you.
                The other <b>{figures.reachYou}</b> reach you, already sorted by what they say.
              </p>
              <p className="pitch__sub">
                These stand in for the replies that land in your finance inbox after a chasing
                tool sends its reminders. Every one is read and sorted before you open it.
                Replies that argue about the bill, ask you a question, or came from the wrong
                person always reach you. That is on purpose, not a limitation.
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
              <p className="fig__l">to read all {figures.total} yourself, <b>every time</b> the inbox fills</p>
            </div>
            <div className="fig fig--saved">
              <div className="fig__n">{hhmm(figures.handled * minutes)}</div>
              <p className="fig__l">of that is <b>handled for you</b>, on replies you never open</p>
            </div>
            <div className="fig">
              <div className="fig__n">{hhmm(figures.reachYou * minutes)}</div>
              <p className="fig__l">is still your time, on the <b>{figures.reachYou}</b> that need a person</p>
            </div>
            <div className="fig fig--risk">
              <div className="fig__n">{money(figures.risk)}</div>
              <p className="fig__l">is owed on replies that <b>argue about the bill or say it was already paid</b></p>
            </div>
          </div>
        </div>
      </section>

      <section className="policy" aria-label="Policy">
        <div className="wrap policy__in">
          <div>
            <div className="dial__top">
              <label className="dial__name" htmlFor="actRange">How sure it must be to act on its own</label>
              <span className="dial__val num">{act.toFixed(2)}</span>
            </div>
            <input
              id="actRange" type="range" min={0.5} max={0.99} step={0.01} value={act}
              onChange={(event) => { setAct(Number(event.target.value)); flashFree(); }}
            />
          </div>
          <div>
            <div className="dial__top">
              <label className="dial__name" htmlFor="revRange">Low enough to flag for you</label>
              <span className="dial__val num">{review.toFixed(2)}</span>
            </div>
            <input
              id="revRange" type="range" min={0.1} max={0.7} step={0.01} value={review}
              onChange={(event) => { setReview(Number(event.target.value)); flashFree(); }}
            />
          </div>
          <p className="policy__free" style={{ opacity: freeFlash ? 1 : 0.55 }}>
            <b>costs nothing to move</b>
          </p>
        </div>
      </section>

      <main className="wrap">
        <div className="zones">
          <nav className="rail" aria-label="Replies">
            <div className="modes" role="tablist" aria-label="What to read">
              <button
                className="mode" type="button" role="tab" aria-selected={mode === "fixture"}
                onClick={() => setMode("fixture")}
              >The 72 replies</button>
              <button
                className="mode" type="button" role="tab" aria-selected={mode === "own"}
                onClick={() => setMode("own")}
              >Write your own</button>
            </div>

            {mode === "fixture" && (
              <>
                <div className="rail__head">
                  <span className="mono">Showing</span>
                  <span className="mono num">{visible.length} of {replies.length}</span>
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
                        onClick={() => setSelected(candidate.id)}
                      >
                        <span className="item__top">
                          <span className="item__who">{byInvoice.get(candidate.invoice)?.customer}</span>
                          {candidate.also.length > 0 && <span className="item__flag">2 things</span>}
                        </span>
                        <span className="item__line">{candidate.body}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {mode === "own" && (
              <p className="rail__note">
                Type any reply you like. It goes to the same model and the same rules as the 72
                on the other tab.
              </p>
            )}
          </nav>

          <article className="read" aria-live="polite">
            {mode === "own" ? (
              <>
                <div className="compose">
                  <label className="compose__label" htmlFor="draft">
                    Write a reply the way a customer would, then see what it makes of it.
                    Nothing here is matched against a script.
                  </label>
                  <textarea
                    id="draft" ref={composer} value={draft} maxLength={MAX_REPLY_CHARS}
                    rows={4} placeholder="e.g. We paid half of this last Tuesday and we are disputing the call-out charge on the rest."
                    onChange={(event) => setDraft(event.target.value)}
                  />
                  <div className="compose__row">
                    <label className="sr" htmlFor="draftInv">Against which invoice</label>
                    <select id="draftInv" value={draftInvoice} onChange={(e) => setDraftInvoice(e.target.value)}>
                      {invoices.map((inv) => (
                        <option key={inv.invoiceNo} value={inv.invoiceNo}>
                          {inv.customer} · {inv.invoiceNo} · {money(inv.openBalance)} owed
                        </option>
                      ))}
                    </select>
                    <span className="compose__count num">{draft.length}/{MAX_REPLY_CHARS}</span>
                    {own && (
                      <button className="btn btn--ghost" type="button" onClick={resetOwn}>
                        Try another
                      </button>
                    )}
                    <button
                      className="btn btn--primary" type="button"
                      disabled={classifying || draft.trim().length === 0}
                      onClick={() => void classifyOwn()}
                    >
                      {classifying ? "Reading..." : "Read it"}
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
                    provenance={`read just now by ${own.judgment.model}`}
                    banner={
                      <p className="yours">
                        <b>Your words, read just now.</b> Same seven questions, same settings and
                        same code as every reply on the other tab. This one is not counted in the
                        published accuracy figures, which cover the fixed set of 72 only.
                      </p>
                    }
                  />
                )}
              </>
            ) : reply && invoice && plan ? (
              <ReadView
                invoice={invoice}
                body={reply.body}
                plan={plan}
                scores={judgment.scores}
                thresholds={thresholds}
                money={money}
                {...(reply.note ? { note: reply.note } : {})}
                provenance={`read once on ${runDate} by ${judgment.model}, and saved`}
              />
            ) : null}
          </article>
        </div>

        <footer className="foot">
          Ledger dated <span className="num">{asOf}</span>. 15 unpaid invoices worth{" "}
          <span className="num">$245,960</span>, {replies.length} replies written by hand,{" "}
          {replies.filter((r) => r.hard).length} of them deliberately awkward.
          Everything here is invented. No client data, names or results.
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
            reply and work out what it actually means. Are they paying? Arguing? Confused? Was it
            even the right person? That reading is the part that still lands on a human.
          </p>
          <div className="mcall">
            <p>
              Tools that send the reminders are everywhere. QuickBooks bundles one at $85/mo and
              Chaser lists $180/mo, and the better ones already do something with what comes
              back. Chaser files replies from your Gmail or Outlook against the right customer,
              and its AI can read a message, work out the intent, and write you a polite response
              to send.
            </p>
            <p>
              <b>That response is the difference.</b> What this produces is not a message. It is a
              decision: the chasing pauses or stops, a payment query is opened, a part payment is
              recorded, a promised date is worked out. It writes nothing and it sends nothing.
              There is no email in it at all.
            </p>
          </div>

          <h3>Using it, in three steps</h3>
          <ol>
            <li>
              <b>Pick a reply</b> from the list. These stand in for what arrives in your finance
              inbox after the reminders go out. There are {replies.length}, written to look like a
              real inbox: mostly junk, with the awkward ones mixed in.
            </li>
            <li>
              <b>Look at the seven scores</b> under the message. Each one answers a separate
              question, because a single reply can genuinely be two things at once.
            </li>
            <li>
              <b>Move the first slider.</b> That is you deciding how certain it has to be before
              it does anything on its own. Anything below your line comes to you instead.
            </li>
          </ol>
          <p>
            Try the ones marked <code>2 things</code>. Those pay part of the bill and argue about
            the rest. Anything forced to pick a single answer would have thrown one of them away.
          </p>

          <h3>Is this just a canned demo?</h3>
          <p>
            Fair question, and the reason for the <b>Write your own</b> tab. Type any reply you
            like against any invoice and it goes to the same model, through the same seven
            questions, into the same rules, and comes out in the same layout as everything on the
            other tab. Nothing is matched against a script.
          </p>
          <p>
            The {replies.length} sample replies work differently on purpose. They were written and
            labelled <em>before</em> the system was built, so they can be scored honestly, and
            they were read once and saved. Re-reading them on every visit would cost money to
            learn nothing. Your own text is read live, and is deliberately kept out of the
            published accuracy figures.
          </p>

          <h3>What the sliders cost</h3>
          <p>
            Nothing. The seven scores are worked out once per reply. Moving a slider only
            re-applies your rules to numbers that already exist, so it is instant and free. That
            is the whole point of keeping the judgment and the policy separate.
          </p>

          <h3>What it will not do</h3>
          <ul>
            <li><b>It never sends anything.</b> There is no email path in the system.</li>
            <li>
              <b>It never marks an invoice paid.</b> If someone claims they paid, that opens a
              query for a person to check. There is no action in the system that can close an
              invoice.
            </li>
            <li>
              <b>It never invents a date.</b> If a promise has no date in it, the promise is
              recorded without one and a person sets it.
            </li>
            <li>
              <b>It does what the text says, not what the text asks.</b> A reply telling it to
              ignore its rules is read as data, like any other reply.
            </li>
          </ul>

          <h3>Where the numbers come from</h3>
          <p>
            The accuracy figures come from running all {replies.length} replies and comparing the
            answer to the label written beforehand, reported one class at a time. The reading
            time above is your own estimate, which is why you can change it. It is an estimate,
            not a measurement, and it is never mixed in with the measured figures.
          </p>
        </div>
      </dialog>
    </>
  );
}
