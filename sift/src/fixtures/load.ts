import { existsSync, readFileSync } from "node:fs";
import { RULES } from "../trades";
import { firmById } from "./index";
import { buildInstrument, parseCsv, parseInbox } from "./instrument";
import {
  CONTACT_COLUMNS, LOG_COLUMNS, parseContact, parseLog, parseProject, parseRfi, parseSubmittal,
  PROJECT_COLUMNS, RFI_COLUMNS, rfiToLog, SUBMITTAL_COLUMNS, submittalToLog, type Instrument,
} from "./schema";

/**
 * Reading the instruments from disk. Tests and scripts come through here; the app and the systems of
 * record module import the committed `fixtures.json` snapshot instead, because a bundler has no
 * filesystem. `snapshot.test.ts` asserts the two agree.
 *
 * Meridian's instrument sits at the top of `fixtures/`, as it was frozen, with its RFI and submittal
 * logs in their own files. Every other firm's sits in `fixtures/<firm id>/` with one `log.csv`.
 */

/** The firm whose instrument was measured first, and the default wherever one firm is assumed. */
export const MEASURED_FIRM_ID = "arch";

const read = (path: string): string => readFileSync(new URL(`../../fixtures/${path}`, import.meta.url), "utf8");
const has = (path: string): boolean => existsSync(new URL(`../../fixtures/${path}`, import.meta.url));

/** Every firm with rules and an authored instrument. */
export function instrumentFirmIds(): string[] {
  return Object.keys(RULES).filter((id) => id === MEASURED_FIRM_ID || has(`${id}/inbox.jsonl`));
}

export function loadInstrument(firmId: string = MEASURED_FIRM_ID): Instrument {
  const row = <T>(parse: (r: never, where: string) => T) => (r: unknown, i: number): T => parse(r as never, `row ${i + 2}`);
  const dir = firmId === MEASURED_FIRM_ID ? "" : `${firmId}/`;
  const logs = firmId === MEASURED_FIRM_ID
    ? [
        ...parseCsv(read("rfi-log.csv"), RFI_COLUMNS, "rfi-log.csv").map(row(parseRfi)).map(rfiToLog),
        ...parseCsv(read("submittal-log.csv"), SUBMITTAL_COLUMNS, "submittal-log.csv").map(row(parseSubmittal)).map(submittalToLog),
      ]
    : parseCsv(read(`${dir}log.csv`), LOG_COLUMNS, `${dir}log.csv`).map(row(parseLog));
  return buildInstrument({
    projects: parseCsv(read(`${dir}projects.csv`), PROJECT_COLUMNS, `${dir}projects.csv`).map(row(parseProject)),
    logs,
    contacts: parseCsv(read(`${dir}contacts.csv`), CONTACT_COLUMNS, `${dir}contacts.csv`).map(row(parseContact)),
    inbox: parseInbox(read(`${dir}inbox.jsonl`), `${dir}inbox.jsonl`),
  }, firmById(firmId));
}

/** Every instrument, by firm id: what the snapshot holds. */
export function loadInstruments(): Record<string, Instrument> {
  return Object.fromEntries(instrumentFirmIds().map((id) => [id, loadInstrument(id)]));
}
