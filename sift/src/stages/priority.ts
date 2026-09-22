import { days } from "../clock";
import type { Project } from "../fixtures/sor";
import type { Priority } from "../types";

/**
 * Priority, computed. Never read from the words in a message.
 *
 * The rule that carries the claim (AC #6): a clock is urgent when the matched project has a
 * scheduled activity that falls on or before the deadline, because acting late then blocks real
 * work already on the calendar. The same message text against a project whose next activity sits
 * after the deadline is not urgent. Two near-identical messages can land at different priorities
 * purely on what the schedule says.
 */
export interface PriorityContext {
  readonly deadline: string | null;
  readonly project: Project | null;
  readonly asOf: string;
}

export function derivePriority(ctx: PriorityContext): Priority {
  const { deadline, project, asOf } = ctx;
  if (deadline == null) return "normal";
  const dueIn = days(asOf, deadline);

  if (project?.next) {
    const activityIn = days(asOf, project.next.date);
    // A scheduled activity at or before the deadline: acting late blocks work already booked.
    if (activityIn <= dueIn) return "urgent";
  }
  if (dueIn <= 3) return "urgent";
  if (dueIn <= 10) return "high";
  return "normal";
}
