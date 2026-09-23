import type { DeclaredThreshold } from "../policy";
import type { LabelledMessage } from "./schema";

/**
 * The instrument's size floors, binding before it freezes (AC #16).
 *
 * The clocked subset is the headline's denominator, so it holds at least 12 messages. Every topic
 * class holds at least 6 ordinary examples, or its threshold is declared in `policy.ts` with its `n`
 * and the reason, never fitted to a handful of examples. Below either floor the numbers would be
 * anecdotes, so the instrument cannot freeze there.
 */
export const CLOCKED_FLOOR = 12;
export const ORDINARY_FLOOR = 6;

export function checkFloors(
  inbox: readonly LabelledMessage[],
  classes: readonly string[],
  declared: Readonly<Record<string, DeclaredThreshold>>,
): string[] {
  const problems: string[] = [];
  const clocked = inbox.filter((m) => m.clocked).length;
  if (clocked < CLOCKED_FLOOR) problems.push(`the clocked subset holds ${clocked} messages, under the floor of ${CLOCKED_FLOOR}`);
  for (const c of classes) {
    const n = inbox.filter((m) => !m.hard && m.topics.includes(c)).length;
    const d = declared[c];
    if (n < ORDINARY_FLOOR && !d) problems.push(`${c} has ${n} ordinary examples, under the floor of ${ORDINARY_FLOOR}, and no declared threshold`);
    if (d && d.n !== n) problems.push(`${c} is declared with n = ${d.n} but the instrument holds ${n} ordinary examples`);
  }
  return problems;
}

/** Per-class ordinary and hard counts, for the README and the scorecard. */
export function classCounts(inbox: readonly LabelledMessage[], classes: readonly string[]): { label: string; ordinary: number; hard: number }[] {
  return classes.map((label) => ({
    label,
    ordinary: inbox.filter((m) => !m.hard && m.topics.includes(label)).length,
    hard: inbox.filter((m) => m.hard && m.topics.includes(label)).length,
  }));
}
