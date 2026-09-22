import { describe, expect, it } from "vitest";
import { PROJECTS } from "../src/fixtures/sor";
import { derivePriority } from "../src/stages/priority";
import { firmById } from "../src/fixtures";
import { runOne } from "./helpers";
import type { Message } from "../src/types";

const arch = firmById("arch");
const message = (over: Partial<Message>): Message => ({
  id: "x", from: "Test Sender", email: "t@x.example", subject: "s", body: "b", received: "2026-09-20 09:00", p: {}, clock: 0.1, ...over,
});

describe("priority is computed in code from the schedule (AC #6)", () => {
  it("is urgent when the matched project has an activity inside the response window, lower when not", () => {
    const asOf = "2026-09-21";
    const deadline = "2026-09-25";
    // Same message, same deadline: Harbor Point pours Sep 24 (inside the window), Old Mill's next
    // activity is Nov 6 (outside). Priority differs purely on what the schedule says.
    expect(derivePriority({ deadline, project: PROJECTS["HP"] ?? null, asOf })).toBe("urgent");
    expect(derivePriority({ deadline, project: PROJECTS["OM"] ?? null, asOf })).not.toBe("urgent");
  });
});

describe("the clock is a separate low signal (AC #4)", () => {
  it("raises an owner alert even when the topic sits below the act line", async () => {
    const m = message({ id: "clk", subject: "Correction Notice: portal", body: "automated notice", deadline: "2026-10-02", kind: "Permit correction" });
    const { pipeline } = await runOne(arch, m, { agency: 0.5 }, 0.8);
    const plan = pipeline.planFor("clk");
    expect(plan?.asserted).not.toContain("agency");
    expect(plan?.clockFlagged).toBe(true);
    expect(plan?.alert).not.toBeNull();
  });
});

describe("the clock is corroborated in code (AC #5)", () => {
  it("fires when a logged RFI is referenced even though the model scored the clock low", async () => {
    const m = message({ id: "cor", subject: "RFI-042 follow up", body: "quick question", deadline: "2026-09-25", kind: "RFI response" });
    const { pipeline } = await runOne(arch, m, { rfi: 0.2 }, 0.1);
    expect(pipeline.planFor("cor")?.clockFlagged).toBe(true);
  });

  it("does not fire when nothing corroborates and the model clock is low", async () => {
    const m = message({ id: "non", subject: "Just checking in", body: "no numbers here" });
    const { pipeline } = await runOne(arch, m, { status: 0.2 }, 0.1);
    expect(pipeline.planFor("non")?.clockFlagged).toBe(false);
  });

  it("escalates a clock with no date rather than inventing one", async () => {
    const m = message({ id: "nod", subject: "Conditions of approval", body: "respond promptly" });
    const { pipeline } = await runOne(arch, m, { agency: 0.5 }, 0.8);
    const plan = pipeline.planFor("nod");
    expect(plan?.alert?.needsDate).toBe(true);
    expect(plan?.handoffs.some((h) => h.includes("set the deadline"))).toBe(true);
  });
});
