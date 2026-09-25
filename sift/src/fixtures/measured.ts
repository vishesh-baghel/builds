import type { Thresholds } from "../policy";
import { factsFor, type Deadline } from "../stages/extract";
import type { Firm, Message } from "../types";
import { toMessage } from "./instrument";
import type { Instrument } from "./schema";

/**
 * A measured firm, as the dashboard shows it: the firm's definition (people, classes, owner) over
 * the frozen instrument, each message carrying the judgment actually recorded for it in the scored
 * run. Deadlines, kinds and record matches are computed here in code from the message and the logs,
 * never read from a label. The label rides along for display only.
 *
 * Pure and filesystem-free, so the server component can build it from bundled JSON.
 */

export interface RecordedRun {
  readonly date: string;
  readonly judgments: Readonly<Record<string, { readonly scores: Readonly<Record<string, number>>; readonly clock: number; readonly model: string }>>;
}

const kindOf = (d: Deadline): string =>
  d.source === "log" ? d.kind ?? "Logged deadline" : d.source === "window" ? "Response window" : "Stated deadline";

/** `lines` are the thresholds the sweep chose on this firm's run, which the page opens at. */
export function measuredFirm(base: Firm, instrument: Instrument, run: RecordedRun, lines: Thresholds): Firm {
  const sor = { projects: instrument.projects, logs: instrument.logs, contacts: instrument.contacts };
  let model = "unknown";

  const messages: Message[] = instrument.inbox.map((lm) => {
    const j = run.judgments[lm.id];
    if (!j) throw new Error(`the recorded run holds no judgment for ${lm.id}`);
    model = j.model;
    const message = toMessage(lm);
    const facts = factsFor(message, sor);
    return {
      ...message,
      p: j.scores,
      clock: j.clock,
      clocked: lm.clocked,
      record: facts.project !== null || facts.logged,
      ...(facts.deadline ? { deadline: facts.deadline.date, kind: kindOf(facts.deadline) } : {}),
      ...(lm.note ? { note: lm.note } : {}),
      label: { topics: lm.topics, route: lm.route, priority: lm.priority },
    };
  });

  return { ...base, messages, sor, measured: { runDate: run.date, model, lines } };
}
