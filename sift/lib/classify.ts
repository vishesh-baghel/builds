import { SpendCapExceededError } from "@builds/shared";
import type { LiveStore } from "../src/store/turso";
import type { Firm, Message } from "../src/types";

/**
 * Judging a committed message live, as a pure function over its dependencies, so every path the
 * route can take is testable with no network and no key.
 *
 * The opening is as narrow as it can be: the request names a firm and a message already committed,
 * and nothing else. No text, no address, no free field of any kind reaches the vendor or this code.
 * Every reason not to spend (no key, a visitor's allowance used up, the deploy's 24-hour ceiling,
 * the spend cap) serves the committed judgment behind a visible notice, never an error.
 */

export interface JudgedScores {
  readonly scores: Readonly<Record<string, number>>;
  readonly clock: number;
  readonly model: string;
}

export interface ClassifyDeps {
  readonly hasKey: boolean;
  readonly store: LiveStore;
  readonly visitor: string;
  readonly capCents: number;
  readonly lookup: (firmId: string, messageId: string) => { firm: Firm; message: Message } | null;
  /** One capped, retried vendor call. Throws `SpendCapExceededError` rather than spend past the cap. */
  readonly judge: (message: Message, firm: Firm) => Promise<JudgedScores>;
}

export interface ClassifyOk {
  readonly firmId: string;
  readonly messageId: string;
  /** True only when this response carries a judgment bought just now. */
  readonly live: boolean;
  readonly judgment: JudgedScores;
  /** Why no live judgment was bought, in words the page shows. Null when `live`. */
  readonly notice: string | null;
  readonly spend: { readonly spentCents: number; readonly capCents: number };
}

export type ClassifyResult =
  | { readonly status: 200; readonly body: ClassifyOk }
  | { readonly status: 400; readonly body: { readonly error: string } };

const ID = /^[a-z0-9-]{1,32}$/;
const ALLOWED = ["firmId", "messageId"];

export function parseRequest(raw: unknown): { firmId: string; messageId: string } | { error: string } {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { error: "expected a JSON object" };
  const extra = Object.keys(raw).filter((k) => !ALLOWED.includes(k));
  if (extra.length) return { error: `only firmId and messageId are accepted, not ${extra.join(", ")}` };
  const { firmId, messageId } = raw as Record<string, unknown>;
  if (typeof firmId !== "string" || !ID.test(firmId) || typeof messageId !== "string" || !ID.test(messageId)) {
    return { error: "firmId and messageId must name a committed message" };
  }
  return { firmId, messageId };
}

export const NOTICES = {
  noKey: "Live judging is off on this deploy, so this is the recorded judgment.",
  visitor: "You have used this month's live judgments, so this is the recorded judgment.",
  ceiling: "This deploy has reached its limit of live judgments for the last 24 hours, so this is the recorded judgment.",
  cap: "This month's demo budget is spent, so this is the recorded judgment.",
  vendor: "The judgment service did not answer, so this is the recorded judgment.",
} as const;

export async function classifyFixture(raw: unknown, deps: ClassifyDeps): Promise<ClassifyResult> {
  const req = parseRequest(raw);
  if ("error" in req) return { status: 400, body: { error: req.error } };

  const found = deps.lookup(req.firmId, req.messageId);
  if (!found) return { status: 400, body: { error: "pick a message from the committed inbox" } };
  const { firm, message } = found;

  const recorded: JudgedScores = { scores: message.p, clock: message.clock, model: firm.measured?.model ?? "illustrative" };
  const respond = async (live: boolean, judgment: JudgedScores, notice: string | null): Promise<ClassifyResult> => ({
    status: 200,
    body: {
      firmId: req.firmId, messageId: req.messageId, live, judgment, notice,
      spend: { spentCents: await deps.store.counter.spentCents(), capCents: deps.capCents },
    },
  });

  if (!deps.hasKey) return respond(false, recorded, NOTICES.noKey);
  if (await deps.store.overVisitorLimit(deps.visitor)) return respond(false, recorded, NOTICES.visitor);
  if (!(await deps.store.reserveLiveCall())) return respond(false, recorded, NOTICES.ceiling);

  try {
    return respond(true, await deps.judge(message, firm), null);
  } catch (error) {
    if (error instanceof SpendCapExceededError) return respond(false, recorded, NOTICES.cap);
    console.error("[classify] vendor call failed:", error);
    return respond(false, recorded, NOTICES.vendor);
  }
}
