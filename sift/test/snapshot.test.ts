import { describe, expect, it } from "vitest";
import snapshot from "../fixtures/fixtures.json" with { type: "json" };
import { loadInstruments } from "../src/fixtures/load";

/**
 * The snapshot is what the app and the systems-of-record module read; the CSVs and the JSONL are what
 * a person authored and what the scorecard measures. Two representations of one instrument is a drift
 * risk, so the gate closes it: edit a fixture without regenerating and this fails.
 *
 *   pnpm --filter @builds/sift snapshot
 */
describe("the committed snapshot matches its sources", () => {
  it("holds exactly what the authored files parse to", () => {
    expect(snapshot).toEqual(JSON.parse(JSON.stringify(loadInstruments())));
  });
});
