import { LEDGER_AS_OF } from "../src/clock";
import type { Judgment } from "../src/jev";
import { DEFAULT_THRESHOLDS } from "../src/policy";
import type { Invoice, Reply } from "../src/types";
import { buildFixtureSet } from "../src/fixtures/parse";
import { Sandbox } from "../components/Sandbox";
import snapshot from "../fixtures/fixtures.json" with { type: "json" };
import run from "../runs/run.json" with { type: "json" };

/**
 * Server component.
 *
 * Reads the committed snapshot rather than the authored CSV and JSONL: a bundler has no
 * filesystem, and a build that prerenders this page has no business opening files. The
 * snapshot is generated from those sources and a test fails if the two disagree.
 *
 * Every judgment on the page starts as one already bought and committed in `runs/run.json`.
 * Selecting a reply asks the route handler for a fresh one; if the key is absent, the visitor
 * is over their allowance, or the month's budget is spent, it stays on the recorded judgment
 * and says so.
 */
export default function Page() {
  const fixtures = buildFixtureSet(snapshot.invoices as Invoice[], snapshot.replies as Reply[]);
  const artifact = run as { date: string; judgments: Record<string, Judgment & { elapsedMs: number }> };

  return (
    <Sandbox
      asOf={LEDGER_AS_OF}
      runDate={artifact.date}
      defaults={{ act: DEFAULT_THRESHOLDS.act.noise, review: DEFAULT_THRESHOLDS.review }}
      invoices={fixtures.invoices.map((invoice) => ({ ...invoice }))}
      replies={fixtures.replies.map((reply) => ({ ...reply, also: [...reply.also] }))}
      recorded={Object.fromEntries(
        Object.entries(artifact.judgments).map(([id, j]) => [id, {
          scores: j.scores, date: j.date, amount: j.amount, model: j.model,
        }]),
      )}
    />
  );
}
