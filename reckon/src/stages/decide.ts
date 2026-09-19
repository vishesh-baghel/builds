import {
  assertedFrom, derivePrimary, reviewBandFrom, wantsNoContact,
  type ClassScores, type Thresholds, type TieBreak,
} from "../policy.js";
import { resolvePartialAmount, type AmountComponents } from "../resolve/amount.js";
import { resolvePromiseDate, type DateComponents } from "../resolve/date.js";
import type { ChaseStatus } from "../state.js";
import type { ChaseAction, Invoice, ReplyClass } from "../types.js";

/**
 * The decision: plain TypeScript over the probabilities, the components and the thresholds.
 *
 * No model runs here, and that is the point. A model that can be steered by the text it is
 * reading must not also choose what happens next, so every side effect sits behind both the
 * probability gate and a closed action enum. The five tie-break rules live in `policy.ts`; this
 * file turns their outcome into effects.
 */

export interface Effect {
  readonly action: ChaseAction;
  /** Composed here, from the class set and the rule that fired. Never model-written. */
  readonly summary: string;
  readonly detail: Readonly<Record<string, unknown>>;
  /** The chase state this action implies, when it implies one. */
  readonly status?: ChaseStatus;
  readonly resumeOn?: string;
}

export interface Plan {
  readonly asserted: readonly ReplyClass[];
  readonly review: readonly ReplyClass[];
  readonly primary: ReplyClass | null;
  readonly tieBreak: TieBreak | null;
  readonly effects: readonly Effect[];
  /** One line per thing a person must own. Empty means nothing escalates. */
  readonly handoffs: readonly string[];
  readonly reason: string;
  /** True when the unsubscribe guard fired, whatever the classes said. */
  readonly guardFired: boolean;
}

export interface DecideInput {
  readonly replyId: string;
  readonly body: string;
  readonly invoice: Invoice;
  readonly scores: ClassScores;
  readonly date: DateComponents;
  readonly amount: AmountComponents;
  readonly thresholds: Thresholds;
  readonly asOf: string;
}

const money = (n: number): string => `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

/** Plain-language names, used only to compose reason strings. */
export const PLAIN: Readonly<Record<ReplyClass, string>> = {
  claimed_payment: "says it is already paid",
  promise_to_pay: "promises to pay",
  partial: "pays part of it",
  dispute: "argues with the bill",
  question: "asks for something",
  wrong_contact: "is the wrong person",
  noise: "carries nothing actionable",
};

export function decidePlan(input: DecideInput): Plan {
  const { scores, thresholds, invoice, body, replyId } = input;

  const asserted = assertedFrom(scores, thresholds);
  const review = reviewBandFrom(scores, thresholds);
  const { primary, tieBreak } = derivePrimary(asserted, scores);

  const effects: Effect[] = [];
  const handoffs: string[] = [];

  for (const label of asserted) {
    switch (label) {
      case "claimed_payment":
        effects.push({
          action: "pause_chase",
          summary: `Chasing ${invoice.invoiceNo} is held while the claim is checked`,
          detail: { invoice: invoice.invoiceNo },
          status: "paused",
        });
        effects.push({
          action: "open_reconciliation",
          summary: `Check the ledger for ${money(invoice.openBalance)} against ${invoice.invoiceNo}`,
          // There is no action in the enum that marks an invoice paid, and there never will be
          // one: a claim of payment is a reason for a person to look, not a reason to close.
          detail: { invoice: invoice.invoiceNo, openBalance: invoice.openBalance },
        });
        break;

      case "dispute":
        effects.push({
          action: "stop_chase",
          summary: `Chasing ${invoice.invoiceNo} stops while the bill is in dispute`,
          detail: { invoice: invoice.invoiceNo },
          status: "stopped",
        });
        handoffs.push("Somebody is arguing with the bill. A person owns that.");
        break;

      case "partial": {
        const resolved = resolvePartialAmount(input.amount, body, invoice.openBalance);
        effects.push({
          action: "record_partial",
          summary: resolved.amount === null
            ? `Part payment on ${invoice.invoiceNo}, amount not recorded — ${resolved.how}`
            : `${money(resolved.amount)} recorded against ${invoice.invoiceNo}, ${money(invoice.openBalance - resolved.amount)} still outstanding`,
          detail: {
            invoice: invoice.invoiceNo,
            amount: resolved.amount,
            how: resolved.how,
            openBalance: invoice.openBalance,
          },
        });
        if (resolved.amount === null) {
          handoffs.push("They are paying part of it, but no amount could be worked out. A person sets it.");
        }
        break;
      }

      case "promise_to_pay": {
        const resolved = resolvePromiseDate(input.date, body, input.asOf);
        if (resolved.date === null) {
          effects.push({
            action: "record_promise",
            summary: `Promise on ${invoice.invoiceNo} recorded with no date — none was given, and none is invented`,
            detail: { invoice: invoice.invoiceNo, date: null, how: resolved.how },
          });
          handoffs.push("A promise with no date. A person agrees one.");
        } else if (resolved.alreadyPast) {
          effects.push({
            action: "flag_broken_promise",
            summary: `They said ${resolved.date} (${resolved.how}); the ledger is at ${input.asOf} and nothing arrived`,
            detail: { invoice: invoice.invoiceNo, date: resolved.date, how: resolved.how },
          });
          handoffs.push("The date they promised has already gone by.");
        } else {
          effects.push({
            action: "record_promise",
            summary: `Chasing ${invoice.invoiceNo} is held until ${resolved.date}, worked out from ${resolved.how}`,
            detail: { invoice: invoice.invoiceNo, date: resolved.date, how: resolved.how },
            status: "paused",
            resumeOn: resolved.date,
          });
        }
        break;
      }

      case "question":
        effects.push({
          action: "pause_chase",
          summary: `Chasing ${invoice.invoiceNo} is held — they are waiting on an answer`,
          detail: { invoice: invoice.invoiceNo },
          status: "paused",
        });
        handoffs.push("They asked for something only a person can supply.");
        break;

      case "wrong_contact":
        effects.push({
          action: "stop_chase",
          summary: `No further chasing of this contact about ${invoice.invoiceNo}`,
          detail: { invoice: invoice.invoiceNo },
          status: "stopped",
        });
        effects.push({
          action: "open_contact_correction",
          // Deliberately not a parsed replacement address. Extraction is out of scope for this
          // build, and a guessed address is a worse outcome than a person reading the reply.
          summary: `Find the right contact for ${invoice.customer} — read reply ${replyId}`,
          detail: { invoice: invoice.invoiceNo, readReply: replyId, assertedClass: "wrong_contact" },
        });
        handoffs.push("Wrong person. The reply goes with it so somebody can find the right one.");
        break;

      case "noise":
        // Nothing. Chasing neither pauses nor advances.
        break;
    }
  }

  const guardFired = wantsNoContact(body);
  if (guardFired) {
    effects.push({
      action: "stop_contacting",
      summary: `${invoice.customer} asked not to be contacted about ${invoice.invoiceNo}`,
      detail: { invoice: invoice.invoiceNo, readReply: replyId },
      status: "suppressed",
    });
  }

  if (asserted.length === 0) {
    handoffs.push("Nothing cleared its threshold, so a person reads this one.");
  }
  for (const label of review) {
    handoffs.push(`It might be a reply that ${PLAIN[label]}, but only at ${scores[label].toFixed(2)}.`);
  }

  return {
    asserted, review, primary, tieBreak, effects, handoffs, guardFired,
    reason: composeReason(asserted, review, tieBreak, guardFired),
  };
}

/**
 * The reason a person reads. Assembled from the class set and the rule that fired — this build
 * ships no generative model, so every string a human sees is composed here or in a template.
 */
export function composeReason(
  asserted: readonly ReplyClass[],
  review: readonly ReplyClass[],
  tieBreak: TieBreak | null,
  guardFired: boolean,
): string {
  const parts: string[] = [];

  parts.push(asserted.length === 0
    ? "Nothing cleared its threshold"
    : `Read as a reply that ${asserted.map((label) => PLAIN[label]).join(", and ")}`);

  if (tieBreak) parts.push(`led by rule ${tieBreak.rule} (${tieBreak.name})`);
  if (review.length > 0) {
    parts.push(`with ${review.length} more possibilit${review.length === 1 ? "y" : "ies"} in the review band`);
  }
  if (guardFired) parts.push("and a stop-contacting request caught by the code guard");

  return `${parts.join(", ")}.`;
}
