import type { Priority } from "../types";

/**
 * The instrument's shapes, and validation at the trust boundary between the committed fixtures and
 * everything downstream.
 *
 * Hand-rolled rather than a schema library: five small shapes, and the repo rule is stdlib before a
 * dependency. What matters is that a malformed fixture fails a test loudly, with the offending row
 * named, rather than reaching a scorecard or a demo.
 */

export class FixtureError extends Error {
  constructor(source: string, where: string, problem: string) {
    super(`${source} ${where}: ${problem}`);
    this.name = "FixtureError";
  }
}

export interface Project {
  readonly code: string;
  readonly name: string;
  /** Names a message might use for the project, matched case-insensitively. */
  readonly aliases: readonly string[];
  readonly permits: readonly string[];
  readonly client: string;
  /** The next thing on this project's calendar, and which topics it waits on. */
  readonly next: { readonly what: string; readonly date: string; readonly blocks: readonly string[] };
  readonly coordinator: string;
  readonly lead: string;
  readonly reviewer: string;
}

export interface RfiRow {
  readonly number: string;
  readonly project: string;
  readonly subject: string;
  readonly received: string;
  readonly due: string;
  readonly status: "open" | "answered";
}

export interface SubmittalRow {
  readonly number: string;
  readonly project: string;
  readonly description: string;
  readonly received: string;
  readonly reviewDue: string;
  readonly status: "open" | "in review" | "approved";
}

export interface Contact {
  readonly name: string;
  readonly email: string;
  readonly org: string;
  readonly project: string | null;
  readonly role: string;
}

/** The firm's systems of record: what code joins a message against. */
export interface Sor {
  readonly projects: readonly Project[];
  readonly rfis: readonly RfiRow[];
  readonly submittals: readonly SubmittalRow[];
  readonly contacts: readonly Contact[];
}

/** One hand-labelled inbox message. Everything after `receivedAt` is ground truth, never an input. */
export interface LabelledMessage {
  readonly id: string;
  readonly from: string;
  readonly email: string;
  readonly subject: string;
  readonly body: string;
  readonly receivedAt: string;
  readonly topics: readonly string[];
  /** Everyone it should reach, including the owner when a clock alert is due. Sorted. */
  readonly route: readonly string[];
  readonly priority: Priority;
  readonly deadline: string | null;
  readonly clocked: boolean;
  readonly project: string | null;
  readonly hard: boolean;
  readonly note: string;
}

export interface Instrument extends Sor {
  readonly inbox: readonly LabelledMessage[];
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const STAMP = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/;
const LEVELS: readonly Priority[] = ["urgent", "high", "normal", "low"];

export function requireText(source: string, where: string, field: string, value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") throw new FixtureError(source, where, `${field} must be a non-empty string`);
  return value;
}

export function requireDay(source: string, where: string, field: string, value: unknown): string {
  if (typeof value !== "string" || !DAY.test(value) || Number.isNaN(Date.parse(value))) {
    throw new FixtureError(source, where, `${field} must be a real YYYY-MM-DD date, got ${String(value)}`);
  }
  return value;
}

export function requireOneOf<T extends string>(source: string, where: string, field: string, value: unknown, allowed: readonly T[]): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new FixtureError(source, where, `${field} must be one of ${allowed.join(", ")}, got ${String(value)}`);
  }
  return value as T;
}

const list = (cell: string): string[] => cell.split(";").map((s) => s.trim()).filter((s) => s !== "");

export const PROJECT_COLUMNS = ["code", "name", "aliases", "permits", "client", "next_what", "next_date", "next_blocks", "coordinator", "lead", "reviewer"] as const;
export const RFI_COLUMNS = ["number", "project", "subject", "received", "due", "status"] as const;
export const SUBMITTAL_COLUMNS = ["number", "project", "description", "received", "review_due", "status"] as const;
export const CONTACT_COLUMNS = ["name", "email", "org", "project", "role"] as const;

type Row<C extends readonly string[]> = Readonly<Record<C[number], string>>;

export function parseProject(r: Row<typeof PROJECT_COLUMNS>, where: string): Project {
  const s = "projects.csv";
  return {
    code: requireText(s, where, "code", r.code),
    name: requireText(s, where, "name", r.name),
    aliases: list(r.aliases),
    permits: list(r.permits),
    client: requireText(s, where, "client", r.client),
    next: { what: requireText(s, where, "next_what", r.next_what), date: requireDay(s, where, "next_date", r.next_date), blocks: list(r.next_blocks) },
    coordinator: requireText(s, where, "coordinator", r.coordinator),
    lead: requireText(s, where, "lead", r.lead),
    reviewer: requireText(s, where, "reviewer", r.reviewer),
  };
}

export function parseRfi(r: Row<typeof RFI_COLUMNS>, where: string): RfiRow {
  const s = "rfi-log.csv";
  return {
    number: requireText(s, where, "number", r.number),
    project: requireText(s, where, "project", r.project),
    subject: requireText(s, where, "subject", r.subject),
    received: requireDay(s, where, "received", r.received),
    due: requireDay(s, where, "due", r.due),
    status: requireOneOf(s, where, "status", r.status, ["open", "answered"] as const),
  };
}

export function parseSubmittal(r: Row<typeof SUBMITTAL_COLUMNS>, where: string): SubmittalRow {
  const s = "submittal-log.csv";
  return {
    number: requireText(s, where, "number", r.number),
    project: requireText(s, where, "project", r.project),
    description: requireText(s, where, "description", r.description),
    received: requireDay(s, where, "received", r.received),
    reviewDue: requireDay(s, where, "review_due", r.review_due),
    status: requireOneOf(s, where, "status", r.status, ["open", "in review", "approved"] as const),
  };
}

export function parseContact(r: Row<typeof CONTACT_COLUMNS>, where: string): Contact {
  const s = "contacts.csv";
  return {
    name: requireText(s, where, "name", r.name),
    email: requireText(s, where, "email", r.email),
    org: requireText(s, where, "org", r.org),
    project: r.project.trim() === "" ? null : r.project.trim(),
    role: requireText(s, where, "role", r.role),
  };
}

export function parseLabelled(raw: unknown, where: string, source = "inbox.jsonl"): LabelledMessage {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new FixtureError(source, where, "must be a JSON object");
  const r = raw as Record<string, unknown>;

  const receivedAt = r["received_at"];
  if (typeof receivedAt !== "string" || !STAMP.test(receivedAt)) throw new FixtureError(source, where, `received_at must be YYYY-MM-DD HH:MM, got ${String(receivedAt)}`);

  const strings = (field: string): string[] => {
    const v = r[field];
    if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) throw new FixtureError(source, where, `${field} must be an array of strings`);
    return v as string[];
  };
  const bool = (field: string): boolean => {
    const v = r[field];
    if (typeof v !== "boolean") throw new FixtureError(source, where, `${field} must be a boolean`);
    return v;
  };

  const topics = strings("topics");
  if (topics.length === 0) throw new FixtureError(source, where, "topics must name at least one class");
  const route = strings("route");
  if ([...route].sort().join("|") !== route.join("|")) throw new FixtureError(source, where, "route must be sorted, so it compares as a set");

  const deadline = r["deadline"] === null ? null : requireDay(source, where, "deadline", r["deadline"]);
  const project = r["project"] === null ? null : requireText(source, where, "project", r["project"]);
  const note = r["note"];
  if (typeof note !== "string") throw new FixtureError(source, where, "note must be a string");

  return {
    id: requireText(source, where, "id", r["id"]),
    from: requireText(source, where, "from", r["from"]),
    email: requireText(source, where, "email", r["email"]),
    subject: requireText(source, where, "subject", r["subject"]),
    body: requireText(source, where, "body", r["body"]),
    receivedAt,
    topics,
    route,
    priority: requireOneOf(source, where, "priority", r["priority"], LEVELS),
    deadline,
    clocked: bool("clocked"),
    project,
    hard: bool("hard"),
    note,
  };
}
