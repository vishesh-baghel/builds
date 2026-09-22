import { Dashboard } from "../components/Dashboard";
import { FIRMS } from "../src/fixtures";

/**
 * Server component.
 *
 * For now it hands the committed firms straight to the client dashboard. When the Meridian run
 * artifact lands (Phase 4) this is where it will be imported and scored at build time, so the
 * measured catch rate is computed by the same code the scorecard uses and never transcribed into
 * copy. Nothing here reads the filesystem at request time: the firms are a bundled import.
 */
export default function Page() {
  return <Dashboard firms={FIRMS} />;
}
