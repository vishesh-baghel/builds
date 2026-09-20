"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

/** The estimate is a dial, not a form field. One minute either way is the only useful step. */
const MIN_MINUTES = 1;
const MAX_MINUTES = 60;

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
  const [selected, setSelected] = useState("r043");
  const [mode, setMode] = useState<"fixture" | "own">("fixture");
  const [draft, setDraft] = useState("");
  const [draftInvoice, setDraftInvoice] = useState("4340");
  const [own, setOwn] = useState<{ judgment: Judgment; invoice: string; body: string } | null>(null);
  const [ownError, setOwnError] = useState<string | null>(null);
  const [classifying, setClassifying] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setMenuOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

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

  const visible = useMemo(
    () => replies.filter((reply) => filterClass === "all" || reply.label === filterClass),
    [replies, filterClass],
  );

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
      {/* One definition, rendered in the bar on a wide screen and in the drawer on a narrow
          one. The drawer cannot live inside <header> because the bar carries a backdrop-filter,
          and that makes it a containing block for position:fixed children: a drawer nested
          there is laid out inside a 56px bar rather than against the viewport. */}
      {(() => {
        const actions = (done?: () => void) => (
          <>
            <a
              className="btn btn--ghost" href="https://cal.com/vishesh-baghel/15min"
              target="_blank" rel="noopener noreferrer" onClick={done}
            >Want this on your inbox?</a>
            <button
              className="btn btn--primary" type="button"
              onClick={() => { done?.(); dialog.current?.showModal(); }}
            >
              How it works
            </button>
          </>
        );

        return (
          <>
            <header className="bar">
              <div className="wrap bar__in">
                <span className="bar__mark">reckon</span>
                <span className="bar__tag">reads what the customer writes back</span>
                <button
                  className="burger" type="button" aria-label="Menu" aria-expanded={menuOpen}
                  aria-controls="barActions" onClick={() => setMenuOpen((open) => !open)}
                >
                  <svg width="18" height="14" viewBox="0 0 18 14" aria-hidden="true" focusable="false">
                    <path d="M1 1h16M1 7h16M1 13h16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                </button>
                <div className="bar__right">{actions()}</div>
              </div>
            </header>

            <div
              className={`navscrim${menuOpen ? " is-open" : ""}`} aria-hidden="true"
              onClick={() => setMenuOpen(false)}
            />

            <nav className={`drawer${menuOpen ? " is-open" : ""}`} id="barActions" aria-label="Menu">
              <div className="drawer__head">
                <span className="mono">Menu</span>
                <button className="btn btn--ghost" type="button" onClick={() => setMenuOpen(false)}>
                  Close
                </button>
              </div>
              {actions(() => setMenuOpen(false))}
            </nav>
          </>
        );
      })()}

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
              <span id="minsLabel">a reply takes</span>
              <div className="stepper" role="group" aria-labelledby="minsLabel">
                <button
                  type="button" className="stepper__btn" aria-label="one minute less"
                  disabled={minutes <= MIN_MINUTES}
                  onClick={() => setMinutes((m) => Math.max(MIN_MINUTES, m - 1))}
                >&minus;</button>
                <output className="stepper__val num" aria-live="polite">{minutes}</output>
                <button
                  type="button" className="stepper__btn" aria-label="one minute more"
                  disabled={minutes >= MAX_MINUTES}
                  onClick={() => setMinutes((m) => Math.min(MAX_MINUTES, m + 1))}
                >+</button>
              </div>
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
              onChange={(event) => setAct(Number(event.target.value))}
            />
          </div>
          <div>
            <div className="dial__top">
              <label className="dial__name" htmlFor="revRange">Low enough to flag for you</label>
              <span className="dial__val num">{review.toFixed(2)}</span>
            </div>
            <input
              id="revRange" type="range" min={0.1} max={0.7} step={0.01} value={review}
              onChange={(event) => setReview(Number(event.target.value))}
            />
          </div>
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

          <h3>How to read the seven scores</h3>
          <p>
            Each score is that question answered on its own, from 0 to 1. They are not shares of
            a total and they do not add up to anything: a reply can score high on two at once,
            which is the whole point.
          </p>
          <p>The small mark on each bar is your line. So:</p>
          <ul>
            <li><b>Bar past the mark</b>, it is sure enough, and it acts.</li>
            <li>
              <b>Bar close to the mark but short of it</b>, it is unsure, so it does nothing and
              flags the reply for you with the score attached.
            </li>
            <li><b>Bar nowhere near</b>, it does not apply and you never hear about it.</li>
          </ul>
          <p>
            Two of the seven sit at a higher line than the rest: a reply that argues about the
            bill, and one that claims it was already paid. Those are the two where acting wrongly
            costs the most, so they have to be more certain before they act on their own.
          </p>
          <p>
            Drag the first slider and watch the row of numbers at the top move. Right, and almost
            everything comes to you. Left, and more is handled without you, with more chance of
            something being handled wrongly. There is no correct setting. It is your call, and
            the point of showing it is that it is a dial rather than someone else's decision.
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
            labelled <em>before</em> this was built, and their answers are fixed, so the accuracy
            figures below are measured against something that cannot be quietly adjusted after
            the fact. Your own text is read fresh each time and is kept out of those figures.
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
