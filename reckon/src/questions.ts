import { choice, noul } from "@typesafe-ai/sdk";
import { REPLY_CLASSES, type ReplyClass } from "./types.js";

/**
 * The judgment, in one request per reply.
 *
 * **Seven Nouls, not one Choice across seven labels.** Six of the 72 scored replies genuinely
 * carry two classes at once — paying part of a bill while disputing the rest, claiming payment
 * while offering to reissue. A pick-one answer manufactures a wrong answer on every one of
 * them. One Noul per class lets two things be true.
 *
 * Each Noul's `criteria` are drawn from the tie-break rules the fixture set was labelled
 * against, so the boundary the labeller used is the boundary the model is asked about. Where a
 * criterion reads oddly specific — "received, thank you" is not a payment claim — that is a
 * labelling decision being stated rather than left for the model to guess.
 *
 * **Dates and amounts are components, not extractions.** Only 4 of the 12 `promise_to_pay`
 * replies contain a numeral; the rest say "by Friday", "in the next cycle", "before month end".
 * There is nothing to select among, so selecting is the wrong shape. Jev answers what *kind* of
 * time reference the message uses, and code assembles the actual date against the ledger date
 * and a business calendar. The same for amounts: Jev names the shape, code does the arithmetic.
 *
 * Jev extracts no values, generates no text, and does no arithmetic anywhere in this build.
 */

const CLASS_QUESTIONS = {
  claimed_payment: noul(
    "Does the sender assert that this invoice has already been paid?",
    {
      true: "They say payment was made, sent, processed, mailed or issued — even hedged, second-hand, or without a reference. A claim someone else made the payment still counts.",
      false: "Merely acknowledging the email is not claiming payment. 'Received, thank you' and 'noted' are not payment claims. A commitment to pay later is not a claim that payment happened.",
    },
  ),

  promise_to_pay: noul(
    "Does the sender commit to paying this invoice at some future time?",
    {
      true: "A commitment that money will be sent — dated or not, precise or vague. 'By Friday', 'in the next cycle', 'once the PO clears' all count.",
      false: "A promise to reply, to check, to escalate internally or to come back to you is not a promise to pay. Money already sent is not a future commitment.",
    },
  ),

  partial: noul(
    "Is the sender paying, or stating they have just paid, part of this balance now?",
    {
      true: "Any portion of the balance described as being paid now or just sent — a stated figure, a fraction such as 'half', or 'the undisputed portion'. This holds even when they also promise the remainder.",
      false: "A promise covering the whole balance is not a partial payment. A claim that the full amount was already paid is not a partial payment.",
    },
  ),

  dispute: noul(
    "Does the sender contest this invoice — its amount, its scope, its validity or its terms?",
    {
      true: "They are arguing with the bill. Disputing the payment terms counts even when no amount is contested: 'our contract says net 60' is a dispute. So is contesting work that was or was not done.",
      false: "Asking what something is, or asking for a copy, is not contesting it. A delay with a reason is not a dispute.",
    },
  ),

  question: noul(
    "Does the sender need information or an action from you before this can proceed?",
    {
      true: "They are waiting on something: a copy of the invoice, a purchase-order number, a breakdown, a correction, or an answer only your side holds. 'Let me talk to the owner and come back to you' also sits here — it is a promise to reply, not to pay.",
      false: "A rhetorical remark is not a question. Contesting the bill is a dispute, not a question, even when phrased as one.",
    },
  ),

  wrong_contact: noul(
    "Is the sender saying they are not the right recipient, or redirecting you to someone else?",
    {
      true: "They have left, they do not handle this, or they name someone else to contact. An out-of-office that names a live alternate contact for finance matters belongs here — the redirect is actionable.",
      false: "An out-of-office with no alternate contact is not a redirect. Forwarding internally while still owning the invoice is not a wrong contact.",
    },
  ),

  noise: noul(
    "Is this message free of anything that changes what you should do about the invoice?",
    {
      true: "Bare acknowledgements, automated confirmations, out-of-office replies naming nobody, pleasantries and bounces. 'Received, thank you' is noise: acknowledging the email is not acknowledging the debt.",
      false: "Anything that claims payment, commits to payment, pays part, argues, asks for something, or redirects you is not noise.",
    },
  ),
} as const;

/**
 * Component questions. Each is answered on every reply; code ignores the ones the decision does
 * not need. One request per reply is the contract, so there is no cheaper shape available.
 */
const COMPONENT_QUESTIONS = {
  promise_anchor: choice(
    "If the message commits to paying at a future time, what kind of time reference does it give? Answer `none` if it gives no time reference, or if it makes no commitment to pay at all.",
    {
      none: "No future time is given, or there is no commitment to pay.",
      day_of_month: "A specific calendar day, written as a number or a date — 'the 15th', '10/3'.",
      weekday: "A named day of the week — 'Friday', 'by Monday'.",
      relative_period: "A period rather than a day — 'end of the month', 'next cycle', 'this week', 'our next payment run'.",
    },
  ),

  promise_weekday: choice(
    "If the message names a day of the week for payment, which one? Answer `none` if it names no weekday.",
    {
      none: "No day of the week is named.",
      monday: "Monday.", tuesday: "Tuesday.", wednesday: "Wednesday.", thursday: "Thursday.",
      friday: "Friday.", saturday: "Saturday.", sunday: "Sunday.",
    },
  ),

  promise_period: choice(
    "If the message gives a period rather than a day, which period? Answer `none` if it gives no period.",
    {
      none: "No period is given.",
      tomorrow: "Tomorrow, or the next day.",
      this_week: "Within this week.",
      next_week: "Within next week.",
      end_of_this_month: "By the end of the current month.",
      end_of_next_month: "By the end of next month.",
      next_payment_run: "Whenever their next payment run or billing cycle falls.",
    },
  ),

  partial_amount_shape: choice(
    "If the message states an amount being paid now, how is that amount expressed? Answer `none` if it names no amount, or if nothing is being paid now.",
    {
      none: "No amount is given for what is being paid now.",
      stated_figure: "An explicit figure — '21,000', '20k', '$10,000'.",
      fraction_of_balance: "A portion of the balance rather than a figure — 'half', 'most of it', 'the undisputed portion'.",
    },
  ),

  partial_fraction: choice(
    "If the message describes the amount as a portion of the balance rather than a figure, which portion? Answer `none` if it gives a figure or no amount at all.",
    {
      none: "No portion is described.",
      half: "Half of the balance.",
      third: "A third of the balance.",
      quarter: "A quarter of the balance.",
      most: "Most of the balance, without saying how much.",
      unspecified: "A portion is described but not in a way that fixes a size.",
    },
  ),
} as const;

export const QUESTIONS = { ...CLASS_QUESTIONS, ...COMPONENT_QUESTIONS } as const;

export type QuestionName = keyof typeof QUESTIONS;

/** Question names for the seven classes, in taxonomy order. */
export const CLASS_QUESTION_NAMES: readonly ReplyClass[] = REPLY_CLASSES;

/** Everything that is not a class Noul. Named so tests can assert the shape without counting. */
export const COMPONENT_QUESTION_NAMES = Object.keys(COMPONENT_QUESTIONS) as readonly (keyof typeof COMPONENT_QUESTIONS)[];

/**
 * The state each request carries.
 *
 * Reply text enters here as data and is never treated as instruction. The action space is a
 * closed enum in code, so nothing the text says can widen it — which matters because TypeSafe's
 * own model notes list adversarial steering as a current known weakness.
 */
export type JudgmentState = {
  invoice: {
    number: string;
    customer: string;
    amount: number;
    open_balance: number;
    days_past_due: number;
    terms: string;
  };
  reply: {
    subject: string;
    body: string;
  };
};
