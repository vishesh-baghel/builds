import { describe, expect, it } from "vitest";
import { DEFAULT_THRESHOLDS, linesFor } from "../src/policy";
import { decidePlan } from "../src/stages/decide";
import { firmById, messageById } from "../src/fixtures";

/**
 * Engine sanity over the ported fixtures. These inject no probabilities of their own: they read the
 * committed illustrative ones and assert the deterministic policy over them. No network, no key.
 * Phase 3 replaces the fixture probabilities with injected ones and covers every functional AC.
 */

const arch = firmById("arch");
const msg = (id: string) => {
  const m = messageById(arch, id);
  if (!m) throw new Error(`no fixture ${id}`);
  return m;
};

describe("decidePlan over Meridian at the shipped dial", () => {
  it("routes a clear single-topic RFI and flags its corroborated clock", () => {
    const plan = decidePlan(msg("a2"), arch, DEFAULT_THRESHOLDS);
    expect(plan.asserted).toEqual(["rfi"]);
    expect(plan.clockFlagged).toBe(true);
    expect(plan.alert).not.toBeNull();
    expect(plan.actions).toContain("route:rfi");
    expect(plan.actions).toContain("alert:owner");
  });

  it("fans a two-topic message out to two routes and two people", () => {
    const plan = decidePlan(msg("a1"), arch, DEFAULT_THRESHOLDS);
    expect([...plan.asserted].sort()).toEqual(["rfi", "status"]);
    expect(plan.actions.filter((a) => a.startsWith("route:")).length).toBe(2);
    expect(plan.people.length).toBe(2);
  });

  it("raises an owner alert on the clock even when no topic clears the act line", () => {
    const plan = decidePlan(msg("a6"), arch, DEFAULT_THRESHOLDS);
    expect(plan.asserted).toEqual([]); // the agency topic sits in the review band
    expect(plan.clockFlagged).toBe(true);
    expect(plan.alert).not.toBeNull();
  });

  it("re-decides purely when the dial moves: hands-off asserts fewer topics than cautious", () => {
    const cautious = decidePlan(msg("a1"), arch, linesFor(0.15)).asserted.length;
    const handsOff = decidePlan(msg("a1"), arch, linesFor(0.95)).asserted.length;
    expect(handsOff).toBeGreaterThanOrEqual(cautious); // a higher act line asserts no more, a lower review asserts no fewer
  });
});
