/**
 * The closed vocabulary of this build: what can be billed, at what price, and which clause of
 * the service agreement governs it.
 *
 * Code owns everything here. Drex is asked about a work item; it never picks a price, never
 * names a clause, and never adds a line the catalog does not already contain.
 */

export type RateCode =
  | "SVC-CALL" | "TECH-ADD" | "LABOR-HR" | "AFTER-HRS"
  | "COMP" | "LINESET" | "REFRIG" | "BLOWER" | "TSTAT" | "IGNITER" | "DISPOSAL"
  | "CAP" | "CONTACTOR" | "FILTER" | "COIL-CLEAN" | "DRAIN";

export interface RateLine {
  readonly code: RateCode;
  readonly description: string;
  readonly unit: string;
  readonly cents: number;
  /** Agreement clause that decides whether this line is billable under the plan. */
  readonly clause: string;
}

export const RATE_CARD: readonly RateLine[] = [
  { code: "SVC-CALL", description: "Service call, first technician, first two hours", unit: "visit", cents: 45_000, clause: "4.1" },
  { code: "TECH-ADD", description: "Additional technician", unit: "technician per visit", cents: 28_500, clause: "4.2" },
  { code: "LABOR-HR", description: "Labour beyond the first two hours", unit: "hour", cents: 12_500, clause: "4.3" },
  { code: "AFTER-HRS", description: "After-hours surcharge", unit: "visit", cents: 17_500, clause: "4.4" },
  { code: "COMP", description: "Compressor replacement", unit: "each", cents: 185_000, clause: "3.2" },
  { code: "LINESET", description: "Refrigerant line set replacement", unit: "each", cents: 64_000, clause: "3.2" },
  { code: "REFRIG", description: "Refrigerant R-410A", unit: "lb", cents: 8_500, clause: "3.3" },
  { code: "BLOWER", description: "Blower motor replacement", unit: "each", cents: 72_000, clause: "3.2" },
  { code: "TSTAT", description: "Thermostat replacement", unit: "each", cents: 26_000, clause: "3.2" },
  { code: "IGNITER", description: "Hot surface igniter replacement", unit: "each", cents: 21_000, clause: "3.2" },
  { code: "DISPOSAL", description: "Removal and disposal of replaced equipment", unit: "visit", cents: 15_000, clause: "6.1" },
  { code: "CAP", description: "Run capacitor replacement", unit: "each", cents: 16_500, clause: "3.1" },
  { code: "CONTACTOR", description: "Contactor replacement", unit: "each", cents: 18_500, clause: "3.1" },
  { code: "FILTER", description: "Air filter replacement", unit: "each", cents: 4_500, clause: "2.2" },
  { code: "COIL-CLEAN", description: "Evaporator and condenser coil cleaning", unit: "visit", cents: 19_500, clause: "2.2" },
  { code: "DRAIN", description: "Condensate drain clearing", unit: "visit", cents: 12_000, clause: "2.2" },
];

export const rateLine = (code: RateCode): RateLine => {
  const line = RATE_CARD.find((l) => l.code === code);
  if (!line) throw new Error(`unknown rate code ${code}`);
  return line;
};

/** Work that never carries a price under the agreement, and the clause that says so. */
export type NonBillableKind = "travel" | "waiting" | "conversation" | "callback" | "cleanup";

export const NON_BILLABLE_CLAUSE: Record<NonBillableKind, string> = {
  travel: "5.1", waiting: "5.2", conversation: "5.3", callback: "5.4", cleanup: "5.5",
};

/**
 * The splitter's lexicon. A clause of the technician's note becomes a work item when one of
 * these patterns matches it; the first match names the candidate rate line or non-billable
 * kind. Order matters where patterns overlap: "line set" before "refrigerant", "extra guys"
 * before "hours".
 */
export type Trigger =
  | { readonly kind: "rate"; readonly code: RateCode; readonly pattern: RegExp }
  | { readonly kind: "non_billable"; readonly what: NonBillableKind; readonly pattern: RegExp };

export const TRIGGERS: readonly Trigger[] = [
  { kind: "rate", code: "COMP", pattern: /\bcompres+or\b|\bcomp\b/i },
  { kind: "rate", code: "LINESET", pattern: /\bline ?sets?\b|\blineset\b/i },
  { kind: "rate", code: "BLOWER", pattern: /\bblower\b/i },
  { kind: "rate", code: "TSTAT", pattern: /\bt-?stat\b|\bthermostat\b/i },
  { kind: "rate", code: "IGNITER", pattern: /\bignit[oe]r\b|\bhsi\b/i },
  { kind: "rate", code: "CAP", pattern: /\bcap\b|\bcapacitor\b|\bdual run\b/i },
  { kind: "rate", code: "CONTACTOR", pattern: /\bcontactor\b/i },
  { kind: "rate", code: "REFRIG", pattern: /\bfreon\b|\brefrigerant\b|\br-?410a?\b|\blbs?\b|\bcharge(?:d)?\b/i },
  { kind: "rate", code: "TECH-ADD", pattern: /\bextra (?:guys?|techs?|hands?|man|men)\b|\b(?:helper|second tech|2nd tech)\b|\bbrought (?:in )?(?:\w+ )?(?:guys?|techs?)\b/i },
  { kind: "rate", code: "LABOR-HR", pattern: /\b(?:extra|another|over by|ran over|additional) (?:\d+|an?|one|two|three|couple(?: of)?) ?(?:hrs?|hours?)\b|\b(?:\d+|two|three) (?:extra|more) (?:hrs?|hours?)\b|\bran long\b/i },
  { kind: "rate", code: "AFTER-HRS", pattern: /\bafter ?hours\b|\bafter-hours\b|\bsunday\b|\bsaturday\b|\bat night\b|\b(?:9|10|11) ?pm\b|\bemergency call\b/i },
  { kind: "rate", code: "DISPOSAL", pattern: /\bhaul(?:ed)?(?: it)? (?:off|away)\b|\bdispos(?:al|ed)\b|\bdump\b|\bscrap(?:ped)?\b/i },
  { kind: "rate", code: "FILTER", pattern: /\bfilters?\b/i },
  { kind: "rate", code: "COIL-CLEAN", pattern: /\bcoils?\b/i },
  { kind: "rate", code: "DRAIN", pattern: /\bdrain\b|\bcondensate\b|\bp-?trap\b/i },
  { kind: "non_billable", what: "callback", pattern: /\bcall ?back\b|\bcallback\b|\bwarranty\b|\bsame (?:issue|problem|fault)\b|\bcame back\b/i },
  { kind: "non_billable", what: "travel", pattern: /\bdr[io]ve\b|\btraffic\b|\bdrive time\b|\bmiles\b|\bfreeway\b/i },
  { kind: "non_billable", what: "waiting", pattern: /\bwait(?:ed|ing)?\b|\bgate code\b|\blocked out\b|\bno one home\b|\bnobody home\b/i },
  { kind: "non_billable", what: "cleanup", pattern: /\bswept\b|\bcleaned up\b|\bdrop cloth\b|\bvacuumed\b|\bshoe covers\b/i },
  { kind: "non_billable", what: "conversation", pattern: /\btalked\b|\bchatted\b|\bexplained\b|\bwalked (?:her|him|them|cust|customer|owner)\b|\bshowed (?:her|him|them|cust|customer)\b|\bquestions? about\b/i },
];
