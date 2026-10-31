# episodes

Code from the [doodle-monster](https://www.youtube.com/@doodlemonsterhq) videos: one folder per long video, named for
it, holding the TypeScript the video explains so you can run it, read it and change it.

| folder | video | what it is |
|---|---|---|
| [agent-harness](agent-harness) | [What an Agent Harness Is, and a Tiny One You Can Build](https://doodle.monster/videos/what-an-agent-harness-is-and-a-tiny-one-you-can-) | a tool loop with a turn cap, trimmed tool output and allow, ask and deny permissions |

## How an episode folder is put together

- `episodes/<name>/` is its own workspace package, `@builds/ep-<name>`, with a `typecheck` and a `test` script, so the
  repo gate covers it.
- It runs with no vendor key. A model call goes through a small interface, and the tests drive it with a scripted
  model, so `pnpm --filter @builds/ep-<name> test` passes on a fresh clone.
- Its README links the video and the episode page on doodle.monster, says what the code does and what it leaves out,
  and shows how to plug in a real model.
- The code on screen and the code here agree. Where the video simplifies, the README says so.

Episode folders teach one idea each, so they are not builds: they do not compose the six stages from `shared` and
carry no baseline number. Everything else in `CLAUDE.md` applies, the claims discipline and the house style included.
