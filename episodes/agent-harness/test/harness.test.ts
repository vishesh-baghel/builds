import { describe, expect, it } from "vitest";
import { decide, run, trim, type Model, type ModelReply, type Tool } from "../src/harness.js";

// The video's example: a failing cart test, fixed in five turns.
const script = (replies: ModelReply[]): Model => {
  let i = 0;
  return async () => replies[Math.min(i++, replies.length - 1)]!;
};
const use = (id: string, name: string, input: Record<string, unknown> = {}): ModelReply => ({
  stop_reason: "tool_use",
  content: [{ type: "tool_use", id, name, input }],
});
const say = (text: string): ModelReply => ({ stop_reason: "end_turn", content: [{ type: "text", text }] });

function cartTools(log: string[]) {
  let file = "export const total = (prices: number[]) => prices.length;";
  const tools: Tool[] = [
    {
      name: "run_tests",
      description: "Runs the tests in one file. Returns the end of the log, where the failures are. Changes nothing.",
      input_schema: { type: "object", properties: { path: { type: "string" } } },
      run: async () => (log.push("run_tests"), file.includes("reduce") ? "1 passed" : "1 failed: expected 30, got 2"),
    },
    {
      name: "read_file",
      description: "Returns the contents of one file.",
      input_schema: { type: "object", properties: { path: { type: "string" } } },
      run: async () => (log.push("read_file"), file),
    },
    {
      name: "edit_file",
      description: "Replaces the contents of one file. Ask before using it.",
      input_schema: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } } },
      run: async (input) => (log.push("edit_file"), (file = String(input.content)), "saved"),
    },
    {
      name: "deploy",
      description: "Deploys to production.",
      input_schema: { type: "object", properties: {} },
      run: async () => (log.push("deploy"), "deployed"),
    },
  ];
  return tools;
}

const permissions = { allow: ["read_file", "run_tests"], ask: ["edit_file"], deny: ["deploy"] };
const fixed = "export const total = (prices: number[]) => prices.reduce((a, b) => a + b, 0);";

describe("the loop", () => {
  it("runs the tools the model asks for and stops on plain text", async () => {
    const log: string[] = [];
    const model = script([
      use("tu_1", "run_tests", { path: "cart.test.ts" }),
      use("tu_2", "read_file", { path: "cart.ts" }),
      use("tu_3", "edit_file", { path: "cart.ts", content: fixed }),
      use("tu_4", "run_tests", { path: "cart.test.ts" }),
      say("Fixed: total now adds the prices instead of counting them."),
    ]);
    const r = await run("Fix the failing cart test", { model, tools: cartTools(log), permissions, confirm: async () => true });
    expect(r.stopped).toBe("answer");
    expect(r.turns).toBe(5);
    expect(log).toEqual(["run_tests", "read_file", "edit_file", "run_tests"]);
    // Each result goes back tagged with the request's id.
    expect(r.messages[2]).toEqual({ role: "user", content: [{ type: "tool_result", tool_use_id: "tu_1", content: "1 failed: expected 30, got 2" }] });
  });

  it("stops at the turn cap", async () => {
    const r = await run("Loop forever", { model: script([use("tu", "run_tests")]), tools: cartTools([]), permissions, confirm: async () => true, maxTurns: 3 });
    expect(r).toMatchObject({ stopped: "max_turns", turns: 3 });
  });
});

describe("permissions", () => {
  it("checks deny first, then ask, then allow; unlisted tools are denied", () => {
    expect(decide({ allow: ["deploy"], ask: [], deny: ["deploy"] }, "deploy")).toBe("deny");
    expect(decide(permissions, "edit_file")).toBe("ask");
    expect(decide(permissions, "run_tests")).toBe("allow");
    expect(decide(permissions, "rm_rf")).toBe("deny");
  });

  it("never runs a denied tool, and runs an ask tool only after a yes", async () => {
    const log: string[] = [];
    const model = script([use("tu_1", "deploy"), use("tu_2", "edit_file", { content: fixed }), say("done")]);
    const r = await run("Ship it", { model, tools: cartTools(log), permissions, confirm: async () => false });
    expect(log).toEqual([]);
    expect(r.messages[2]).toMatchObject({ content: [{ tool_use_id: "tu_1", is_error: true }] });
    expect(r.messages[4]).toMatchObject({ content: [{ tool_use_id: "tu_2", content: "The user declined edit_file.", is_error: true }] });
  });
});

describe("context", () => {
  it("keeps only the last lines of a long tool output", () => {
    const log = Array.from({ length: 200 }, (_, i) => `line ${i + 1}`).join("\n");
    const kept = trim(log, 50).split("\n");
    expect(kept).toHaveLength(50);
    expect(kept[0]).toBe("line 151");
  });
});
