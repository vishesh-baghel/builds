/**
 * What a stranger is allowed to send.
 *
 * The PRD forbade free-text input outright, for a good reason: a public demo that will classify
 * anything is a public demo someone can run up a bill on. That exclusion is overridden because
 * a sandbox that only ever replays committed fixtures reads as hardcoded, and a visitor who
 * believes the demo is faked has learned nothing true. The protection the exclusion stood for
 * is kept, explicitly, here.
 */

/** Long enough for any real debtor reply; short enough that the token cost stays bounded. */
export const MAX_REPLY_CHARS = 1_200;

export interface TextProblem {
  readonly problem: string;
}

/** Validation at the trust boundary. The result is data to be classified, never an instruction. */
export function readReplyText(value: unknown): string | TextProblem {
  if (typeof value !== "string") return { problem: "text must be a string" };

  const text = value.trim();
  if (text.length === 0) return { problem: "write something for it to read" };
  if (text.length > MAX_REPLY_CHARS) {
    return { problem: `keep it under ${MAX_REPLY_CHARS} characters — that is longer than any real reply` };
  }
  return text;
}

export const isProblem = (value: string | TextProblem): value is TextProblem =>
  typeof value !== "string";
