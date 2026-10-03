# demos

The walkthrough videos on visheshbaghel.com. Each one is recorded from the live
site, not a local build, so it shows exactly what a visitor gets.

| build | script | live site |
|---|---|---|
| tally | `tally.mjs` | tally.visheshbaghel.com |
| sift | `sift.mjs` | sift.visheshbaghel.com |
| upweight | `upweight.mjs` | upweight.visheshbaghel.com (code in vishesh-baghel/typesafe) |
| reckon | none: recorded before this pipeline existed | reckon.visheshbaghel.com |

## Make one

```bash
cd demos
pnpm install                       # playwright; browsers: npx playwright install chromium
node upweight.mjs out/upweight     # drive the live site, capture frames + timeline.json
python3 lib/compose.py out/upweight upweight
```

`compose.py` needs Python 3 with `numpy` and `Pillow`, and `ffmpeg` on the path. It
writes two files into the out dir:

- `<name>-master.mp4`: 1920x1080, 30fps, crf 18. Keep this one.
- `<name>-demo.mp4`: 1280x720, 20fps, crf 24, no audio. This is the file the
  portfolio serves from `public/demos/`, at roughly 3 to 5MB.

Compositing takes a few minutes on 12 cores.

## How it works

**Recording** (`lib/recorder.mjs`). Headless Chromium opens the live site at
1440x900 with deviceScaleFactor 2. A CDP screencast saves every changed frame
(2880x1800 JPEG) with its timestamp. Headless Chromium draws no cursor, so the
recorder injects one, plus a blue ripple on each click. A demo script drives the
page with these helpers:

- `glide(x, y, ms)`: move the cursor along a slight arc, eased like a hand.
- `clickOn(locator, ms)`: glide to an element's centre and click it.
- `drag(slider, [fractions], ms)`: grab a range input's thumb and drag it
  through each position.
- `scrollBy(dy, ms)`: smooth-scroll the page itself. A mouse wheel over an inner
  scroller (a JSON panel, say) would scroll that instead.
- `cam(zoom, x, y)`: queue a camera move centred on viewport point (x, y). The
  camera is applied later, in compositing, so it never disturbs the page.
- `box(locator)`: centre and bounding box, for aiming the cursor and camera.

**Compositing** (`lib/compose.py`). Each frame sits in a rounded window with a
soft shadow on a blue wallpaper (3840x2160 canvas). The camera eases between
the `cam` targets on a log scale for zoom, with five-sample motion blur while it
moves, and the first half second fades up from the wallpaper.

## Writing a script

Copy the closest existing script and change the beats. What has worked:

- **45 to 60 seconds**, five or six beats, each one a thing the product does.
  Lead with the finished state, end by pulling back to the full page.
- **Zoom on what the eye should read** (1.5 to 1.9), then pull back to `cam(1, 720, 450)`
  before moving to a different part of the page.
- **Hold after every change** for 1.5 to 2.5 seconds, so the viewer sees the result.
- **Steps are browser round trips.** Each `glide` step costs one, so a script's
  real duration runs past its `wait`s. `drag` uses coarser steps because every
  move re-renders the page. Check the printed duration and trim waits.
- **Check before compositing.** `timeline.json` has every frame's time; sample a
  dozen frames into a contact sheet and look at each beat. Compositing is the slow part.
- **Leave the page as you found it** where you can (a Reset or Recommended button
  at the end), so the last frame shows the real default.
