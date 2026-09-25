import { noul, type NoulQuestion } from "@typesafe-ai/sdk";
import { RULES } from "./trades";
import type { Firm } from "./types";

/**
 * The judgment, in one request per message.
 *
 * One Noul per topic class plus the separated `carries_clock` Noul. Multi-topic is the requirement,
 * not an edge case: one message can be an RFI and a status chase at once, and a pick-one answer would
 * manufacture a wrong answer on every such message. The class questions are the firm's own; the clock
 * question is shared and deliberately framed to catch a running deadline even when the topic is
 * unclear. The message text enters `state` as data and is classified, never obeyed.
 *
 * A firm with rules asks its own criteria, written from its labelling rules before any run (see
 * `src/trades/`). A firm without falls back to a generic pair.
 */

export const CLOCK_QUESTION = "carries_clock";

export type SiftQuestions = Record<string, NoulQuestion>;

export function questionsFor(firm: Firm): SiftQuestions {
  const questions: SiftQuestions = {};
  for (const [key, question, plain] of firm.classes) {
    const criteria = RULES[firm.id]?.topics[key]?.criteria;
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
