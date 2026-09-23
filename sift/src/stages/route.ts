import { days } from "../clock";
import type { Sor } from "../fixtures/schema";
import type { Priority, Route } from "../types";
import type { Facts } from "./extract";

/**
 * Routing and priority, as code over the systems of record. Never read from the words in a message
 * and never from a hand-written answer.
 *
 * These are the firm's rules, stated once. The instrument's labels were written against the same
 * rules, so what the scorecard measures is whether the judgment, the join and the date parse land a
 * message where the rules say it belongs.
 *
 * Routing: an RFI to the project's coordinator, a submittal to its reviewer, an agency letter to the
 * principal, an invoice to accounting, a client chasing status to the project lead. Vendor pitches
 * and internal mail go to no one. Anything else, or any topic whose project cannot be matched, goes
 * to a person to decide.
 *
 * Priority: a dated item is urgent when the project's next scheduled activity waits on this kind of
 * item and falls on or before the deadline, or when the deadline is three days out or less; high
 * inside ten days; normal after that. A dated agency letter is never below high. Undated: an RFI
 * the log has never seen is high (a contractor is waiting and it still needs logging), a repeat
 * status chase is high, pitches and internal mail are low, the rest normal. An undated regulatory
 * letter takes its urgency from its clock, if it has one, not from being regulatory.
 */

/** Classes whose stated dates are someone else's calendar, not a response clock. */
export const DATES_ARE_NOT_CLOCKS: readonly string[] = ["vendor_pitch", "internal", "invoice"];

export function deadlinePriority(date: string, asOf: string): Priority {
  const d = days(asOf, date);
  if (d <= 3) return "urgent";
  if (d <= 10) return "high";
  return "normal";
}

export function topicPriority(topic: string, facts: Facts, asOf: string): Priority {
  if (topic === "vendor_pitch" || topic === "internal") return "low";
  // A date on a bill is accounting's calendar: it neither raises a clock nor the bill's priority.
  if (DATES_ARE_NOT_CLOCKS.includes(topic)) return "normal";
  const { deadline, project } = facts;
  if (deadline) {
    const blocked = project !== null && project.next.blocks.includes(topic) && days(project.next.date, deadline.date) >= 0;
    if (blocked) return "urgent";
    const dated = deadlinePriority(deadline.date, asOf);
    return topic === "agency_letter" && dated === "normal" ? "high" : dated;
  }
  if (topic === "rfi") return facts.logged ? "normal" : "high";
  if (topic === "client_status") return facts.repeat ? "high" : "normal";
  return "normal";
}

export function routeFor(topic: string, facts: Facts, sor: Sor, owner: string, asOf: string): Route {
  const priority = topicPriority(topic, facts, asOf);
  const p = facts.project;
  const on = p ? ` on ${p.name}` : "";
  const due = facts.deadline ? ` Due ${facts.deadline.date}, ${facts.deadline.how}.` : "";
  const blocking = p && facts.deadline && priority === "urgent" && p.next.blocks.includes(topic)
    ? ` ${p.name} has the ${p.next.what} on ${p.next.date}, before this is due.` : "";

  switch (topic) {
    case "vendor_pitch": return { who: null, priority, why: "Vendor marketing, labelled and left in the inbox." };
    case "internal": return { who: null, priority, why: "Team mail stays on its thread." };
    case "invoice": {
      const accounting = sor.contacts.find((c) => c.role === "accounting")?.name ?? "?";
      return { who: accounting, priority, why: `A bill${on}; accounting owns it.` };
    }
    case "agency_letter": return { who: owner, priority, why: `A regulatory letter${on}.${due}` };
    case "rfi":
      return p ? { who: p.coordinator, priority, why: `An RFI${on}.${due || " Not in the RFI log yet, so it needs logging."}${blocking}` }
               : { who: "?", priority, why: "An RFI, but no project could be matched." };
    case "submittal":
      return p ? { who: p.reviewer, priority, why: `A submittal${on}.${due}${blocking}` }
               : { who: "?", priority, why: "A submittal, but no project could be matched." };
    case "client_status":
      return p ? { who: p.lead, priority, why: `The client asking about ${p.name}${facts.repeat ? ", and not for the first time" : ""}.` }
               : { who: "?", priority, why: "A client asking for an update, but no project could be matched." };
    default: return { who: "?", priority, why: "Actionable, but outside the usual kinds." };
  }
}
