import snapshot from "../../fixtures/fixtures.json" with { type: "json" };
import { matchProject as match } from "../stages/extract";
import type { Instrument, LogRow, Project, Sor } from "./schema";

/**
 * Every firm's systems of record, from the committed snapshot of its authored CSVs. All synthetic.
 * A firm with an instrument routes, prioritises and dates its mail in code over these.
 */

const data = snapshot as unknown as Readonly<Record<string, Instrument>>;

export const SORS: Readonly<Record<string, Sor>> = Object.fromEntries(
  Object.entries(data).map(([id, i]) => [id, { projects: i.projects, logs: i.logs, contacts: i.contacts }]));

export const MERIDIAN: Sor = SORS["arch"]!;

export const PROJECTS: Readonly<Record<string, Project>> = Object.fromEntries(MERIDIAN.projects.map((p) => [p.code, p]));
const byTopic = (topic: string): Readonly<Record<string, LogRow>> =>
  Object.fromEntries(MERIDIAN.logs.filter((r) => r.topic === topic).map((r) => [r.number, r]));
export const RFI_LOG = byTopic("rfi");
export const SUB_LOG = byTopic("submittal");

export const matchProject = (text: string, email = ""): Project | null => match(MERIDIAN, text, email);

export type { LogRow, Project } from "./schema";
