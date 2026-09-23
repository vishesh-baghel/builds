import { noul, type NoulQuestion } from "@typesafe-ai/sdk";
import type { Firm } from "./types";

/**
 * The judgment, in one request per message.
 *
 * One Noul per topic class plus the separated `carries_clock` Noul. Multi-topic is the requirement,
 * not an edge case: one message can be an RFI and a status chase at once, and a pick-one answer would
 * manufacture a wrong answer on every such message. The class questions are the firm's own; the clock
 * question is shared and deliberately framed to catch a running deadline even when the topic is
 * unclear. The message text enters `state` as data and is classified, never obeyed.
 */

export const CLOCK_QUESTION = "carries_clock";

export type SiftQuestions = Record<string, NoulQuestion>;

type Criteria = { readonly true: string; readonly false: string };

/**
 * Meridian's class criteria, written from the class boundaries in `fixtures/README.md`: the class
 * table and the labelling notes committed before any run was scored. They state the same boundaries
 * the labeller used, so the boundary the model is asked about is the boundary it is scored against.
 * Nothing here was added from a run's results. The six illustrative firms keep a generic pair.
 */
const MERIDIAN_CRITERIA: Readonly<Record<string, Criteria>> = {
  rfi: {
    true: "A question about the drawings or specifications that construction is waiting on, numbered or not, whoever passes it along. Correspondence about an RFI, including closing one out, counts.",
    false: "A request to approve product data, samples or shop drawings is a submittal, even when titled RFI. A client asking how the project is going is a status request.",
  },
  submittal: {
    true: "Product data, samples, shop drawings, mix designs or cut sheets sent for review or approval, including resubmittals, reminders about a pending review, and confirmations of one already reviewed.",
    false: "A question about what the drawings mean is an RFI. A bill for samples is an invoice.",
  },
  agency_letter: {
    true: "A letter or automated notice from a city, county, state or other public authority about a permit, plan review, inspection, hearing, licence or compliance, including one forwarded by someone else.",
    false: "A vendor, directory or trade association writing in official-sounding language is not an authority. The firm's own staff discussing an agency matter is internal mail.",
  },
  invoice: {
    true: "A bill or statement asking the firm to pay for work or goods it bought, including subscription charges.",
    false: "A solicitation dressed as an invoice, which says it is not a bill, is a vendor pitch.",
  },
  client_status: {
    true: "A client asking about progress, schedule or an outstanding item on their project, whether it is the first ask or a repeat.",
    false: "A client relaying a contractor's technical question carries an RFI; a client forwarding an authority's letter carries an agency letter. A question from the contractor is not a client asking for status.",
  },
  vendor_pitch: {
    true: "Unsolicited marketing, however urgent or official it sounds: offers, trials, demos, directory listings, recruiting and event invitations from vendors.",
    false: "A bill for something the firm actually bought is an invoice. Mail from the firm's clients, contractors, consultants or authorities is not a pitch.",
  },
  internal: {
    true: "Mail between the firm's own staff, including forwards and assignments among them.",
    false: "Anything sent from outside the firm.",
  },
  other: {
    true: "Actionable mail that none of these kinds holds: an RFI, a submittal, an authority's letter, an invoice, a client asking for status, a vendor pitch or internal mail. For example insurance, legal, press, employment or new-business requests.",
    false: "If any one of those seven kinds fits the message, this is no, even when the message also seems unusual.",
  },
};

export function questionsFor(firm: Firm): SiftQuestions {
  const questions: SiftQuestions = {};
  for (const [key, question, plain] of firm.classes) {
    const criteria = firm.id === "arch" ? MERIDIAN_CRITERIA[key] : undefined;
    questions[key] = noul(question, criteria ?? {
      true: `Yes: this message is ${plain}. Judge the kind of message, not the tone or the words used.`,
      false: `No: this message is not ${plain}.`,
    });
  }
  questions[CLOCK_QUESTION] = noul(
    "Is a contractual or regulatory clock running on this message: a response, filing, correction, appeal, inspection, renewal or payment carrying a due date or a stated window?",
    {
      true: "A time limit applies, even when the date is only implied or buried in the body. A short window, a 'within N days', a scheduled inspection, a filing or appeal deadline all count.",
      false: "No obligation with a time limit. Routine correspondence, a vendor pitch, internal chatter, or a message that merely mentions a far-off date it does not oblige you to meet.",
    },
  );
  return questions;
}

/** The state one request carries. Message text is data, never instruction. */
export type JudgmentState = {
  readonly firm: { readonly name: string; readonly trade: string; readonly sources: string };
  readonly message: { readonly subject: string; readonly body: string };
};

export function stateFor(firm: Firm, message: { subject: string; body: string }): JudgmentState {
  return {
    firm: { name: firm.firm, trade: firm.label, sources: firm.sourcesLong },
    message: { subject: message.subject, body: message.body },
  };
}
