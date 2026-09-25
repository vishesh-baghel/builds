import type { Sor } from "./fixtures/schema";
import type { Judgment } from "./jev";
import type { Thresholds } from "./policy";
import { decidePlan, type Plan } from "./stages/decide";
import type { Facts } from "./stages/extract";
import { deadlinePriority, routeFor } from "./stages/route";
import { rulesFor } from "./trades";
import type { Firm, Message } from "./types";

/**
 * The code half of a decision, over a judgment already bought.
 *
 * Shared by the pipeline and the scorecard so the policy lives in exactly one place: the scorecard
 * re-derives outcomes at many thresholds without running side effects, and it must reach the same
 * answer the pipeline would.
 *
 * Only the message's text and metadata go in. Whatever a fixture carries beyond that (a label, a
 * hand-written route, a committed deadline) is dropped here, so nothing that is an answer can leak
 * into the decision that is being measured.
 */
export function assess(
  firm: Firm, message: Message, judgment: Pick<Judgment, "scores" | "clock">, facts: Facts, sor: Sor, thresholds: Thresholds, asOf: string,
): Plan {
  const rules = rulesFor(firm.id);
  const actFor = (c: string): number => thresholds.actByClass?.[c] ?? thresholds.act;
  // A date in a pitch, in team mail or on a bill is somebody's calendar, not a response clock.
  const notAClock = rules.datesAreNotClocks.some((c) => (judgment.scores[c] ?? 0) >= actFor(c));
  const corroborated = facts.inLog || (facts.deadline !== null && !notAClock);

  const judged: Message = {
    id: message.id, from: message.from, email: message.email, subject: message.subject, body: message.body,
    received: message.received, p: judgment.scores, clock: judgment.clock,
    ...(facts.deadline ? { deadline: facts.deadline.date } : {}),
  };

  return decidePlan(judged, firm, thresholds, asOf, {
    corroborated,
    routeOf: (topic) => routeFor(topic, facts, rules, firm.owner, asOf),
    clockPriority: facts.deadline ? deadlinePriority(facts.deadline.date, asOf) : "high",
  });
}
