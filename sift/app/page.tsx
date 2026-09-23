import { Dashboard } from "../components/Dashboard";
import snapshot from "../fixtures/fixtures.json" with { type: "json" };
import run from "../runs/run.json" with { type: "json" };
import { FIRMS } from "../src/fixtures";
import { measuredFirm, type RecordedRun } from "../src/fixtures/meridian";
import type { Instrument } from "../src/fixtures/schema";
import { MERIDIAN_THRESHOLDS } from "../src/policy";

/**
 * Server component.
 *
 * Meridian is the measured firm: its messages are the frozen instrument, each carrying the judgment
 * recorded for it in the committed run, decided by the same code the scorecard uses and opened at the
 * lines the sweep chose, so the page and `SCORECARD.md` show the same numbers. The other six firms
 * are illustrative. Everything is a bundled import; nothing reads the filesystem at request time,
 * and only scores and clocks leave the server, never token counts or costs.
 */
export default function Page() {
  const firms = FIRMS.map((f) =>
    f.id === "arch" ? measuredFirm(f, snapshot as unknown as Instrument, run as unknown as RecordedRun) : f);
  return <Dashboard firms={firms} measuredLines={MERIDIAN_THRESHOLDS} />;
}
