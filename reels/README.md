# reels · fifteen seconds per build

> **Self-built experiments on synthetic data.** Each reel shows one build working on its own
> synthetic or generated data, and every figure on screen is computed from that build's committed
> run. No client data, names or results appear here.

Three motion pieces, one per build: [tally](../tally/), [reckon](../reckon/) and [sift](../sift/).
Each is 15 seconds at 1920x1080 and 60 frames a second, with sound. This directory holds the code
that makes them; the videos themselves are render output and are not committed.

| reel | what it shows | figures from |
|---|---|---|
| tally | one technician's note, the igniter nobody billed, Drex's four questions, the drafted line, then all 1,000 orders read outward from that one | `tally/public/replay.json` |
| reckon | one debtor reply read into two classes at once, the decision made in code, the per-subset results including the miss the gate did not catch | `reckon/runs/run.json` |
| sift | a shared inbox overnight, the routine-looking letter with a 14-day clock, the routing, the three headline figures printed together | `sift/runs/run.json` |

A full render also writes `out/reels.html`, a self-contained player for all three: open it in a
browser, pick a reel, play it with sound, scrub it. It works offline; the fonts ride inside the
page.

## Where the numbers come from

```bash
pnpm --filter @builds/reels data
```

`scripts/data.ts` writes `src/data/*.json` by calling each build's own code on its committed run:
tally's per-order totals are checked against its scorecard before they are written, and reckon and
sift replay `runs/run.json` through their own `scoreRun` and decide stages at the lines their
scorecards publish. Nothing is judged and nothing is spent. A reel shows no figure that file did
not compute.

## How a reel is made

A reel is a pure function of time. `build()` makes its DOM once and returns a function that sets
every property from `t` alone: no CSS transitions, no timers, no unseeded randomness. So the frame
at 7.25s is the same on every render, and the player can scrub backwards.

- `src/engine.ts`: easing curves, damped springs, seeded noise, the transform and style helpers,
  the palette (the builds' own tokens), and the six-stage chain that closes every reel.
- `src/audio.ts`: the sound. Every whoosh, impact, tick, bell and the music bed are synthesised
  from a cue list with Web Audio and rendered offline, so a cue at 8.00s lands on frame 480.
- `src/reels/<build>.ts`: one composition each, with its styles beside it.
- `src/player.ts`: the player page, and the bare 1920x1080 stage the renderer captures.

## Rendering

```bash
pnpm --filter @builds/reels render                 # all three, final quality
pnpm --filter @builds/reels render tally           # one reel
pnpm --filter @builds/reels render tally --draft   # no motion blur, fast encode
pnpm --filter @builds/reels render sift --stills 2.5,7,11
```

A final render writes `out/<reel>.mp4` with a poster frame beside it, `out/<reel>.jpg`; `--draft`
writes `out/<reel>-draft.mp4` and `out/<reel>-draft.jpg`, and `--stills` writes only PNGs to
`out/stills/`.

`scripts/render.ts` bundles the page with esbuild, drives headless Chromium through
`playwright-core` one seek at a time, and pipes the frames to ffmpeg. Motion blur is real: each
output frame is the average of four samples spread across a 180 degree shutter, and of twelve in
the spans a reel marks as its fastest (a whip pan, a dive). Three browsers capture side by side
into lossless segments that are joined and encoded once. The audio is rendered by the same page
and muxed in.

It needs **ffmpeg with libx264** on `PATH` (or `FFMPEG=/path/to/ffmpeg`) and a Chromium that
`playwright-core` can find (`PLAYWRIGHT_BROWSERS_PATH`, or `REELS_CHROMIUM=/path/to/chrome`).
Neither is needed for the repo gate: rendering is outside CI, like each build's `score`.

## Layout

```
scripts/data.ts     figures for each reel, from each build's committed run
scripts/render.ts   the page, the frames, the video
src/data/           what data.ts wrote
src/reels/          one composition per build
out/                render output, not committed: the videos, a poster each, reels.html
```
