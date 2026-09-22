import { nice } from "../clock";
import { matchProject, RFI_LOG, SUB_LOG } from "../fixtures/sor";
import type { Firm, Message } from "../types";

/**
 * The draft, assembled from a fixed template with slots filled from the matched records.
 *
 * It takes nothing from the message body, so instruction-shaped text in an email cannot reach it, and
 * there is no send path anywhere: a draft is an artifact a person reads and sends, never something
 * this build transmits. Only Meridian's drafting classes produce one; the other firms route without a
 * draft in this build.
 */

const DRAFTING = new Set(["rfi", "submittal", "status"]);

export interface Draft {
  readonly topic: string;
  readonly to: string;
  readonly body: string;
}

export function draftFor(firm: Firm, message: Message, topic: string): Draft | null {
  if (firm.id !== "arch" || !DRAFTING.has(topic)) return null;
  const project = matchProject(`${message.subject} ${message.body}`);
  const projName = project?.name ?? "the referenced project";
  const rfiNo = Object.keys(RFI_LOG).find((n) => message.subject.includes(n) || message.body.includes(n));
  const subNo = Object.keys(SUB_LOG).find((n) => message.subject.includes(n) || message.body.includes(n));

  if (topic === "rfi") {
    const due = rfiNo ? RFI_LOG[rfiNo]!.due : null;
    return { topic, to: message.from, body: `Thank you for ${rfiNo ?? "the RFI"} on ${projName}. It is logged against the project; a response is due ${due ? nice(due) : "per the RFI log"}. ${project?.coordinator ?? "The coordinator"} will confirm which governs.` };
  }
  if (topic === "submittal") {
    const reviewDue = subNo ? SUB_LOG[subNo]!.reviewDue : null;
    return { topic, to: message.from, body: `Received ${subNo ?? "the submittal"} for ${projName}. It is in the submittal log; review is due back ${reviewDue ? nice(reviewDue) : "per the log"}. ${project?.reviewer ?? "The reviewing architect"} has it.` };
  }
  const nextWhat = project?.next.what ?? "the next milestone";
  const nextDate = project ? nice(project.next.date) : "per the project list";
  return { topic, to: message.from, body: `On ${projName}: the next scheduled item is ${nextWhat} on ${nextDate}. ${project?.lead ?? "The project lead"} will follow up.` };
}
