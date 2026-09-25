import { days } from "../clock";
import type { TradeRules } from "../trades";
import type { Priority, Route } from "../types";
import type { Facts } from "./extract";

/**
 * Routing and priority, as code over the systems of record and the firm's rules. Never read from the
 * words in a message and never from a hand-written answer.
 *
 * The rules differ by firm (`src/trades/`); this code does not. Meridian's, for example: an RFI to
 * the project's coordinator, a submittal to its reviewer, an agency letter to the principal, an
 * invoice to accounting, a client chasing status to the project lead, pitches and internal mail to no
 * one, anything else to a person to decide.
 *
 * Priority: a dated item is urgent when the project's next scheduled activity waits on this kind of
 * item and falls on or before the deadline, or when the deadline is three days out or less; high
 * inside ten days; normal after that. A dated item of a `datedFloorHigh` kind is never below high.
 * Undated: an `unloggedHigh` kind is high until the log has it, a `repeatHigh` kind is high on a
 * repeat ask, `low` kinds are low, everything else normal. A date on a `datesAreNotClocks` kind is
 * somebody's calendar: it raises neither a clock nor that topic's priority.
 */

export function deadlinePriority(date: string, asOf: string): Priority {
  const d = days(asOf, date);
  if (d <= 3) return "urgent";
  if (d <= 10) return "high";
  return "normal";
}

export function topicPriority(topic: string, facts: Facts, asOf: string, rules: TradeRules): Priority {
  if (rules.low.includes(topic)) return "low";
  if (rules.datesAreNotClocks.includes(topic)) return "normal";
  const { deadline, project } = facts;
  if (deadline) {
    const blocked = project !== null && project.next.blocks.includes(topic) && days(project.next.date, deadline.date) >= 0;
    if (blocked) return "urgent";
    const dated = deadlinePriority(deadline.date, asOf);
    return rules.datedFloorHigh.includes(topic) && dated === "normal" ? "high" : dated;
  }
  if (rules.unloggedHigh.includes(topic)) return facts.logged ? "normal" : "high";
  if (rules.repeatHigh.includes(topic)) return facts.repeat ? "high" : "normal";
  return "normal";
}

export function routeFor(topic: string, facts: Facts, rules: TradeRules, owner: string, asOf: string): Route {
  const priority = topicPriority(topic, facts, asOf, rules);
  const rule = rules.topics[topic];
  if (!rule) return { who: "?", priority, why: "Actionable, but outside the usual kinds." };

  const p = facts.project;
  const on = p ? ` on ${p.name}` : "";
  const due = facts.deadline ? ` Due ${facts.deadline.date}, ${facts.deadline.how}.` : "";
  const unlogged = !due && rules.unloggedHigh.includes(topic) && !facts.logged ? " Not in the log yet, so it needs logging." : "";
  const repeat = rules.repeatHigh.includes(topic) && facts.repeat ? " Not the first time of asking." : "";
  const blocking = p && facts.deadline && priority === "urgent" && p.next.blocks.includes(topic)
    ? ` ${p.name} has the ${p.next.what} on ${p.next.date}, before this is due.` : "";
  const why = `${rule.noun}${on}.${due}${unlogged}${repeat}${blocking}`;

  switch (rule.owner.to) {
    case "none": return { who: null, priority, why: `${rule.noun}, labelled and left.` };
    case "ask": return { who: "?", priority, why: "Actionable, but outside the usual kinds." };
    case "owner": return { who: owner, priority, why };
    case "person": return { who: rule.owner.name, priority, why };
    case "slot":
      return p ? { who: p[rule.owner.slot], priority, why }
               : { who: "?", priority, why: `${rule.noun}, but nothing in the records matched it.` };
  }
}
