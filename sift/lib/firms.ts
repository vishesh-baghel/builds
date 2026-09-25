import snapshot from "../fixtures/fixtures.json" with { type: "json" };
import run from "../runs/run.json" with { type: "json" };
import served from "../runs/served.json" with { type: "json" };
import { FIRMS } from "../src/fixtures";
import { measuredFirm, type RecordedRun } from "../src/fixtures/measured";
import type { Instrument } from "../src/fixtures/schema";
import { MERIDIAN_THRESHOLDS, type Thresholds } from "../src/policy";
import type { Firm, Message } from "../src/types";

/**
 * The firms as the app serves them, built once per server instance from bundled JSON. The page and
 * the classify route both come through here, so the message a visitor picks and the message the
 * route judges are the same object. Nothing reads the filesystem at request time.
 *
 * A firm is served measured once it has a recorded run: Meridian's from `runs/run.json`, every other
 * firm's from `runs/served.json`, which `pnpm score --firm <id>` writes. Until then it is served
 * with its illustrative messages, captioned as such.
 */
const instruments = snapshot as unknown as Readonly<Record<string, Instrument>>;
const recorded = served as unknown as Readonly<Record<string, RecordedRun & { lines: Thresholds }>>;

export const SERVED_FIRMS: readonly Firm[] = FIRMS.map((f) => {
  const instrument = instruments[f.id];
  if (!instrument) return f;
  if (f.id === "arch") return measuredFirm(f, instrument, run as unknown as RecordedRun, MERIDIAN_THRESHOLDS);
  const r = recorded[f.id];
  return r ? measuredFirm(f, instrument, r, r.lines) : f;
});

export function servedMessage(firmId: string, messageId: string): { firm: Firm; message: Message } | null {
  const firm = SERVED_FIRMS.find((f) => f.id === firmId);
  const message = firm?.messages.find((m) => m.id === messageId);
  return firm && message ? { firm, message } : null;
}
