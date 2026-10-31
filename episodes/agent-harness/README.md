# agent-harness

From the video [What an Agent Harness Is, and a Tiny One You Can Build](https://www.youtube.com/watch?v=xWTn3224cQ0)
([episode page](https://doodle.monster/videos/what-an-agent-harness-is-and-a-tiny-one-you-can-)).

An agent is a model plus a harness. The model reads text and writes text; the harness is everything else. This one is
about a hundred lines in [`src/harness.ts`](src/harness.ts):

- **The loop.** Call the model, save its reply, check the stop reason. On `tool_use`, run the tool and send back a
  `tool_result` tagged with the request's id. On plain text, stop.
- **A turn cap.** `maxTurns`, 20 by default. Past it the run stops with `max_turns` so a person can look.
- **Trimmed tool output.** Every result keeps its last 50 lines, where test failures and errors are.
- **Permissions.** `allow`, `ask` or `deny` per tool, checked deny first, then ask, then allow. An unlisted tool is
  denied. `ask` waits for `confirm` to say yes.
- **Useful errors.** An unknown tool, a refusal or a thrown error goes back to the model as an `is_error` result it
  can act on.

```bash
pnpm install
pnpm --filter @builds/ep-agent-harness test
```

The tests replay the video's example with a scripted model: a failing cart test, fixed in five turns.

## Plugging in a real model

`Model` is any function from the conversation and the tool list to the next reply. The message shapes follow
Anthropic's Messages API (`stop_reason`, `tool_use`, `tool_result`), so an adapter is a few lines:

```ts
import Anthropic from "@anthropic-ai/sdk";
import type { Model } from "./src/harness.js";

const client = new Anthropic(); // reads ANTHROPIC_API_KEY
const model: Model = async (messages, tools) => {
  const r = await client.messages.create({ model: "claude-sonnet-5-5", max_tokens: 4096, messages, tools });
  return { stop_reason: r.stop_reason === "tool_use" ? "tool_use" : "end_turn", content: r.content.filter((c) => c.type === "text" || c.type === "tool_use") };
};
```

## What it leaves out

The video shows the same harness in Python; this is the TypeScript version. It keeps one conversation in memory, so
it has no compaction or clearing of old tool results (the video covers both as the next steps for long runs). It has
no sandbox: `deny` stops a tool call, it does not contain a command that runs.
