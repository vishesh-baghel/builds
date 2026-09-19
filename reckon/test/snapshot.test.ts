import { describe, expect, it } from "vitest";
import snapshot from "../fixtures/fixtures.json" with { type: "json" };
import { loadFixtures } from "../src/fixtures/load";

/**
 * The snapshot is what the sandbox reads; the CSV and the JSONL are what a human authored and
 * what the scorecard measures against. Two representations of one instrument is a drift risk,
 * so the gate closes it: edit a fixture without regenerating and this fails.
 *
 *   pnpm --filter @builds/reckon snapshot
 */
describe("the committed snapshot matches its sources", () => {
  const fixtures = loadFixtures();

  it("holds the same invoices", () => {
    expect(snapshot.invoices).toEqual(fixtures.invoices);
  });

  it("holds the same replies", () => {
    expect(snapshot.replies).toEqual(fixtures.replies);
  });
});
