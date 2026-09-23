import snapshot from "../../fixtures/fixtures.json" with { type: "json" };
import { matchProject as match } from "../stages/extract";
import type { Instrument, Project, RfiRow, Sor, SubmittalRow } from "./schema";

/**
 * Meridian's systems of record, from the committed snapshot of `projects.csv`, `rfi-log.csv`,
 * `submittal-log.csv` and `contacts.csv`. All synthetic. Only Meridian carries a real instrument;
 * the other six firms route from their fixture defaults and are labelled illustrative in the UI.
 */

const data = snapshot as unknown as Instrument;

export const MERIDIAN: Sor = {
  projects: data.projects, rfis: data.rfis, submittals: data.submittals, contacts: data.contacts,
};

export const PROJECTS: Readonly<Record<string, Project>> = Object.fromEntries(MERIDIAN.projects.map((p) => [p.code, p]));
export const RFI_LOG: Readonly<Record<string, RfiRow>> = Object.fromEntries(MERIDIAN.rfis.map((r) => [r.number, r]));
export const SUB_LOG: Readonly<Record<string, SubmittalRow>> = Object.fromEntries(MERIDIAN.submittals.map((s) => [s.number, s]));

export const matchProject = (text: string, email = ""): Project | null => match(MERIDIAN, text, email);

export type { Project, RfiRow, SubmittalRow } from "./schema";
