import { readFileSync } from "node:fs";
import { firmById } from "./index";
import { buildInstrument, parseCsv, parseInbox } from "./instrument";
import {
  CONTACT_COLUMNS, parseContact, parseProject, parseRfi, parseSubmittal,
  PROJECT_COLUMNS, RFI_COLUMNS, SUBMITTAL_COLUMNS, type Instrument,
} from "./schema";

/**
 * Reading the instrument from disk. Tests and scripts come through here; the app and the systems of
 * record module import the committed `fixtures.json` snapshot instead, because a bundler has no
 * filesystem. `snapshot.test.ts` asserts the two agree.
 */

/** The one firm with a real instrument. */
export const MEASURED_FIRM_ID = "arch";

const read = (name: string): string => readFileSync(new URL(`../../fixtures/${name}`, import.meta.url), "utf8");

export function loadInstrument(): Instrument {
  const row = <T>(parse: (r: never, where: string) => T) => (r: unknown, i: number): T => parse(r as never, `row ${i + 2}`);
  return buildInstrument({
    projects: parseCsv(read("projects.csv"), PROJECT_COLUMNS, "projects.csv").map(row(parseProject)),
    rfis: parseCsv(read("rfi-log.csv"), RFI_COLUMNS, "rfi-log.csv").map(row(parseRfi)),
    submittals: parseCsv(read("submittal-log.csv"), SUBMITTAL_COLUMNS, "submittal-log.csv").map(row(parseSubmittal)),
    contacts: parseCsv(read("contacts.csv"), CONTACT_COLUMNS, "contacts.csv").map(row(parseContact)),
    inbox: parseInbox(read("inbox.jsonl")),
  }, firmById(MEASURED_FIRM_ID));
}
