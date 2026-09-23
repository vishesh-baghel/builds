import snapshot from "../fixtures/fixtures.json" with { type: "json" };
import run from "../runs/run.json" with { type: "json" };
import { FIRMS } from "../src/fixtures";
import { measuredFirm, type RecordedRun } from "../src/fixtures/meridian";
import type { Instrument } from "../src/fixtures/schema";
import type { Firm, Message } from "../src/types";

/**
 * The firms as the app serves them, built once per server instance from bundled JSON. The page and
 * the classify route both come through here, so the message a visitor picks and the message the
 * route judges are the same object. Nothing reads the filesystem at request time.
 */
export const SERVED_FIRMS: readonly Firm[] = FIRMS.map((f) =>
  f.id === "arch" ? measuredFirm(f, snapshot as unknown as Instrument, run as unknown as RecordedRun) : f);

export function servedMessage(firmId: string, messageId: string): { firm: Firm; message: Message } | null {
  const firm = SERVED_FIRMS.find((f) => f.id === firmId);
  const message = firm?.messages.find((m) => m.id === messageId);
  return firm && message ? { firm, message } : null;
}
