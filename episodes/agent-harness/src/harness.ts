// A tiny agent harness: everything around the model that turns its text into actions.
// The model never runs a tool. It asks for one; this loop runs it and sends the result back.

export type ToolUse = { type: "tool_use"; id: string; name: string; input: Record<string, unknown> };
export type ToolResult = { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };
export type Text = { type: "text"; text: string };

export type Message =
  | { role: "user"; content: string | ToolResult[] }
  | { role: "assistant"; content: (Text | ToolUse)[] };

export type ModelReply = { stop_reason: "tool_use" | "end_turn"; content: (Text | ToolUse)[] };

// Anything that takes the conversation and the tool list and returns the next reply: a real API client or a script.
export type Model = (messages: Message[], tools: ToolSpec[]) => Promise<ModelReply>;

// What the model reads. Say when to use the tool, what it returns and what it won't do.
export type ToolSpec = { name: string; description: string; input_schema: Record<string, unknown> };
export type Tool = ToolSpec & { run: (input: Record<string, unknown>) => Promise<string> };

export type Rule = "allow" | "ask" | "deny";
export type Permissions = { allow: string[]; ask: string[]; deny: string[] };

// Deny is checked first, then ask, then allow, so a deny beats a narrower allow. Unlisted tools are denied.
export function decide(permissions: Permissions, tool: string): Rule {
  if (permissions.deny.includes(tool)) return "deny";
  if (permissions.ask.includes(tool)) return "ask";
  if (permissions.allow.includes(tool)) return "allow";
  return "deny";
}

// Keep the end of a long tool output, where test failures and errors are.
export function trim(output: string, lines = 50): string {
  const all = output.split("\n");
  return all.length <= lines ? output : all.slice(-lines).join("\n");
}

export type RunOptions = {
  model: Model;
  tools: Tool[];
  permissions: Permissions;
  confirm: (tool: string, input: Record<string, unknown>) => Promise<boolean>; // for "ask": a person types yes or no
  maxTurns?: number;
  outputLines?: number;
};

export type RunResult =
  | { stopped: "answer"; answer: string; turns: number; messages: Message[] }
  | { stopped: "max_turns"; turns: number; messages: Message[] };

export async function run(task: string, o: RunOptions): Promise<RunResult> {
  const maxTurns = o.maxTurns ?? 20;
  const specs: ToolSpec[] = o.tools.map(({ name, description, input_schema }) => ({ name, description, input_schema }));
  const messages: Message[] = [{ role: "user", content: task }];

  for (let turn = 1; turn <= maxTurns; turn++) {
    const reply = await o.model(messages, specs);
    messages.push({ role: "assistant", content: reply.content });

    // The natural stop: plain text, no tool call.
    if (reply.stop_reason !== "tool_use") {
      const answer = reply.content.flatMap((c) => (c.type === "text" ? [c.text] : [])).join("\n");
      return { stopped: "answer", answer, turns: turn, messages };
    }

    const results: ToolResult[] = [];
    for (const call of reply.content) {
      if (call.type !== "tool_use") continue;
      results.push(await runTool(call, o));
    }
    messages.push({ role: "user", content: results });
  }
  // The hard stop: past the cap, a person looks at the run.
  return { stopped: "max_turns", turns: maxTurns, messages };
}

async function runTool(call: ToolUse, o: RunOptions): Promise<ToolResult> {
  const result = (content: string, is_error = false): ToolResult => ({ type: "tool_result", tool_use_id: call.id, content, ...(is_error && { is_error }) });
  const tool = o.tools.find((t) => t.name === call.name);
  if (!tool) return result(`No tool called ${call.name}. Available: ${o.tools.map((t) => t.name).join(", ")}.`, true);

  const rule = decide(o.permissions, call.name);
  if (rule === "deny") return result(`${call.name} is not allowed in this harness.`, true);
  if (rule === "ask" && !(await o.confirm(call.name, call.input))) return result(`The user declined ${call.name}.`, true);

  try {
    return result(trim(await tool.run(call.input), o.outputLines));
  } catch (e) {
    // A useful error the model can act on, not a crash.
    return result(`${call.name} failed: ${e instanceof Error ? e.message : String(e)}`, true);
  }
}
