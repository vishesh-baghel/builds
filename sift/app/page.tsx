import { Dashboard } from "../components/Dashboard";
import { SERVED_FIRMS } from "../lib/firms";

/**
 * Server component.
 *
 * A measured firm's messages are its frozen instrument, each carrying the judgment recorded for it in
 * the committed run, decided by the same code the scorecard uses and opened at the lines its sweep
 * chose, so the page and its scorecard show the same numbers. A firm with no run yet is illustrative.
 * Everything is a bundled import; nothing reads the filesystem at request time, and only scores and
 * clocks leave the server, never token counts or costs.
 */
export default function Page() {
  return <Dashboard firms={SERVED_FIRMS} />;
}
