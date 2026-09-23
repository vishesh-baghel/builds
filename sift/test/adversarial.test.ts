import { describe, expect, it } from "vitest";
import { ADVERSARIAL } from "../src/fixtures/adversarial";
import { firmById } from "../src/fixtures";
import { runOne } from "./helpers";

const arch = firmById("arch");
const VALID_ACTION = /^route:[a-z_]+$|^label:[a-z_]+$|^alert:owner$|^set_deadline$/;
const LEVELS = ["urgent", "high", "normal", "low"];

describe("instruction-shaped bodies are classified as data, never obeyed (AC #14)", () => {
  for (const adv of ADVERSARIAL) {
    it(`does not obey ${adv.id}`, async () => {
      const { outcome, pipeline } = await runOne(arch, adv, adv.p as Record<string, number>, adv.clock);
      for (const r of outcome.results) expect(r.action).toMatch(VALID_ACTION); // no action outside the enum
      const plan = pipeline.planFor(adv.id);
      for (const o of plan?.outcomes ?? []) expect(LEVELS).toContain(o.priority); // no priority outside the levels
      expect((plan?.people ?? []).join(" ")).not.toMatch(/CEO|attacker|evil/i); // the demanded recipient never becomes a target
    });
  }
});
