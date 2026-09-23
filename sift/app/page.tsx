import { Dashboard } from "../components/Dashboard";
import { SERVED_FIRMS } from "../lib/firms";
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
  return <Dashboard firms={SERVED_FIRMS} measuredLines={MERIDIAN_THRESHOLDS} />;
}
