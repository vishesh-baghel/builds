import { describe, expect, it } from "vitest";
import { PROJECTS } from "../src/fixtures/sor";
import { topicPriority } from "../src/stages/route";
import { ARCH } from "../src/trades/arch";
import type { Facts } from "../src/stages/extract";
import { firmById } from "../src/fixtures";
import { runOne } from "./helpers";
import type { Message } from "../src/types";

const arch = firmById("arch");
const message = (over: Partial<Message>): Message => ({
  id: "x", from: "Test Sender", email: "t@x.example", subject: "s", body: "b", received: "2026-09-20 09:00", p: {}, clock: 0.1, ...over,
});

describe("priority is computed in code from the schedule (AC #6)", () => {
  const asOf = "2026-09-21";
  const facts = (project: keyof typeof PROJECTS, deadline: string): Facts => ({
    project: PROJECTS[project] ?? null, deadline: { date: deadline, how: "test", source: "log" }, inLog: true, logged: true, repeat: false,
  });

  it("is urgent when the project's next activity waits on this kind of item and lands inside the window", () => {
    // Same RFI, same Sep 25 deadline. Harbor Point pours on Sep 24 and the pour waits on RFIs.
    expect(topicPriority("rfi", facts("HP", "2026-09-25"), asOf, ARCH)).toBe("urgent");
    // Old Mill's next activity is Nov 6, after the deadline: nothing is blocked, so it is lower.
    expect(topicPriority("rfi", facts("OM", "2026-09-25"), asOf, ARCH)).not.toBe("urgent");
  });

  it("reads the later deadline as more urgent when the schedule says so", () => {
    // Westgate releases casework on Oct 2. A submittal due Sep 26 lands before it; one due Oct 8
    // lands after it, so the later one is the one that blocks fabrication.
    expect(topicPriority("submittal", facts("WC", "2026-09-26"), asOf, ARCH)).toBe("high");
    expect(topicPriority("submittal", facts("WC", "2026-10-08"), asOf, ARCH)).toBe("urgent");
  });

  it("does not let a schedule block a kind of item it does not wait on", () => {
    // Harbor Point's pour waits on RFIs, not on a roofing submittal due Sep 30.
    expect(topicPriority("submittal", facts("HP", "2026-09-30"), asOf, ARCH)).toBe("high");
  });
});

describe("the clock is a separate low signal (AC #4)", () => {
  it("raises an owner alert even when the topic sits below the act line", async () => {
    const m = message({ id: "clk", subject: "Correction Notice: portal", body: "automated notice", deadline: "2026-10-02", kind: "Permit correction" });
    const { pipeline } = await runOne(arch, m, { agency_letter: 0.5 }, 0.8);
    const plan = pipeline.planFor("clk");
    expect(plan?.asserted).not.toContain("agency_letter");
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
    const { pipeline } = await runOne(arch, m, { client_status: 0.2 }, 0.1);
    expect(pipeline.planFor("non")?.clockFlagged).toBe(false);
  });

  it("escalates a clock with no date rather than inventing one", async () => {
    const m = message({ id: "nod", subject: "Conditions of approval", body: "respond promptly" });
    const { pipeline } = await runOne(arch, m, { agency_letter: 0.5 }, 0.8);
    const plan = pipeline.planFor("nod");
    expect(plan?.alert?.needsDate).toBe(true);
    expect(plan?.handoffs.some((h) => h.includes("set the deadline"))).toBe(true);
  });
});
