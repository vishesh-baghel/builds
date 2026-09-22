import { days } from "../clock";

/**
 * Meridian's systems of record.
 *
 * This is the `arch` firm's own data: the project list with each project's next scheduled activity,
 * the RFI log and the submittal log. Priority is read from here, in code, not from the words in a
 * message. All synthetic. Only Meridian carries a real instrument; the other six firms route from
 * their fixture defaults and are labelled illustrative in the UI.
 */

export interface Project {
  readonly code: string;
  readonly name: string;
  /** The next thing on this project's calendar. A clock landing inside this window is urgent. */
  readonly next: { readonly what: string; readonly date: string };
  readonly coordinator: string;
  readonly lead: string;
  readonly reviewer: string;
}

export interface RfiLogRow {
  readonly project: string;
  readonly due: string;
}

export interface SubmittalLogRow {
  readonly project: string;
  readonly status: string;
  readonly reviewDue: string;
}

export const PROJECTS: Readonly<Record<string, Project>> = {
  HP: { code: "HP", name: "Harbor Point Residences", next: { what: "concrete pour, L2 deck", date: "2026-09-24" }, coordinator: "Tom Okafor", lead: "Priya Nair", reviewer: "Elena Ruiz" },
  LL: { code: "LL", name: "Linden Street Library", next: { what: "permit resubmittal", date: "2026-10-15" }, coordinator: "Tom Okafor", lead: "Priya Nair", reviewer: "Elena Ruiz" },
  WC: { code: "WC", name: "Westgate Clinic", next: { what: "casework fabrication release", date: "2026-10-02" }, coordinator: "Sam Adeyemi", lead: "Marcus Lee", reviewer: "Elena Ruiz" },
  OM: { code: "OM", name: "Old Mill Adaptive Reuse", next: { what: "DD set issue", date: "2026-11-06" }, coordinator: "Sam Adeyemi", lead: "Marcus Lee", reviewer: "Elena Ruiz" },
};

export const RFI_LOG: Readonly<Record<string, RfiLogRow>> = {
  "RFI-042": { project: "HP", due: "2026-09-25" },
  "RFI-017": { project: "OM", due: "2026-10-01" },
};

export const SUB_LOG: Readonly<Record<string, SubmittalLogRow>> = {
  "07-21-03": { project: "HP", status: "received 2026-09-17, not yet assigned", reviewDue: "2026-09-30" },
  "06-40-23": { project: "WC", status: "in review since 2026-09-14, comments due 2026-09-26", reviewDue: "2026-09-26" },
};

/** Pull the referenced RFI or submittal number out of a subject or body, if the log holds it. */
export function matchProject(text: string): Project | null {
  for (const num of Object.keys(RFI_LOG)) if (text.includes(num)) return PROJECTS[RFI_LOG[num]!.project] ?? null;
  for (const num of Object.keys(SUB_LOG)) if (text.includes(num)) return PROJECTS[SUB_LOG[num]!.project] ?? null;
  for (const p of Object.values(PROJECTS)) if (text.toLowerCase().includes(p.name.toLowerCase().split(" ")[0]!.toLowerCase())) return p;
  return null;
}

/** Whole days from `asOf` to a project's next scheduled activity, or null when there is none. */
export function daysToNextActivity(project: Project, asOf: string): number | null {
  return project.next ? days(asOf, project.next.date) : null;
}
