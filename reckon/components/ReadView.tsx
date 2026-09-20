"use client";

import { PLAIN, type Plan } from "../src/stages/decide";
import { REPLY_CLASSES, type Invoice } from "../src/types";
import type { ClassScores, Thresholds } from "../src/policy";

/**
 * One reply, read.
 *
 * Used for both a committed fixture and text the visitor just wrote. That is deliberate and
 * load-bearing: if the two rendered through different code, a visitor would be right to
 * suspect the fixtures were getting special treatment. Same component, same `decidePlan`,
 * same thresholds, the only difference is where the seven numbers came from.
 */
export interface ReadViewProps {
  invoice: Invoice;
  body: string;
  plan: Plan;
  scores: ClassScores;
  thresholds: Thresholds;
  money: (n: number) => string;
  /** Shown above the message when the judgment is not from the frozen scored set. */
  banner?: React.ReactNode;
  note?: string;
  busy?: boolean;
  provenance: string;
}

export function ReadView(props: ReadViewProps) {
  const { invoice, body, plan, scores, thresholds, money } = props;

  return (
    <>
      {props.banner}

      <p className="read__meta">
        <b>{invoice.customer}</b>
        <span>invoice {invoice.invoiceNo}</span>
        <span>{money(invoice.openBalance)} outstanding</span>
        <span>{invoice.daysPastDue} days late</span>
        {props.busy && <span>judging&hellip;</span>}
      </p>

      <blockquote className="read__msg">{body}</blockquote>

      <p className="read__verdict">
        {plan.asserted.length === 0
          ? <>Not sure enough about this one, so <b>a person gets it</b>.</>
          : <>Read as {plan.asserted.map((label, index) => (
              <span key={label}>{index > 0 ? " and " : ""}<b>{PLAIN[label]}</b></span>
            ))}{plan.tieBreak ? `, led by the rule that ${plan.tieBreak.name}` : ""}.</>}
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
            Invoice {invoice.invoiceNo}, the full message and every score go with it, so the
            person picking this up never has to go back to the inbox to work out what happened.
          </p>
        </div>
      )}

      {props.note && <p className="why"><b>Why this one is tricky:</b> {props.note}</p>}

      <section className="reads">
        <span className="mono">
          What it made of it. These are the model&rsquo;s own scores, not proven odds
        </span>
        <div className="reads__grid">
          {REPLY_CLASSES.map((label) => {
            const value = scores[label];
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
            {REPLY_CLASSES.map((label) => `${label} ${scores[label].toFixed(2)}`).join("  ")}
          </span></li>
          <li><span className="mono">decide</span><span>{plan.reason}</span></li>
          {plan.effects.map((effect) => (
            <li key={effect.action}><span className="mono">act</span><span>{effect.action}</span></li>
          ))}
          {plan.handoffs.length > 0 && (
            <li><span className="mono">escalate</span><span>
              {plan.handoffs.length} {plan.handoffs.length === 1 ? "reason" : "reasons"}, full reply attached
            </span></li>
          )}
          <li><span className="mono">source</span><span>{props.provenance}</span></li>
        </ul>
      </details>
    </>
  );
}
