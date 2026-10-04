---
name: record-demo
description: builds repo only. Record the walkthrough video for a build from its live site, the way tally, sift and upweight were made, and hand back the web encode for the portfolio's public/demos/. Use when a build ships, or when its UI changed enough that the old video lies.
---

# Record demo

Everything lives in `demos/`. Read `demos/README.md` first: it has the commands, what
each helper does, and the pacing rules. This skill is the order of work.

## 1. The build must be live on its subdomain

Record from `https://<build>.visheshbaghel.com`, never localhost. If the subdomain is
missing, it is a project domain on Vercel (the `visheshbaghel.com` DNS is on Vercel):
`vercel domains add <build>.visheshbaghel.com <vercel-project>`, then open it to confirm.

## 2. Learn the page at 1440x900

Open the live site in Playwright at 1440x900 and screenshot it. Dump the buttons, links
and range inputs with their boxes. Click through the states worth showing and screenshot
each one. Pick five or six beats: what the product does, shown by doing it.

## 3. Write `demos/<build>.mjs`

Copy the closest script (`tally.mjs` for a sidebar app, `upweight.mjs` for a single page
with controls). Aim for 45 to 60 seconds. Use locators by role or text, not coordinates,
wherever the element has a name.

## 4. Record, then check before compositing

```bash
cd demos && node <build>.mjs out/<build>
```

Read the printed duration. Then sample about a dozen frames from
`out/<build>/timeline.json` (nearest frame to each beat) into a contact sheet and look at
it. Check every beat landed: the click hit, the list changed, the panel opened, the
camera framed what it should. Fix and re-record until it does. Compositing is the slow step.

## 5. Composite and check the video

```bash
python3 lib/compose.py out/<build> <build>
ffmpeg -v error -y -i out/<build>/<build>-demo.mp4 -vf "fps=1/3,scale=480:-1,tile=4x4" -frames:v 1 out/<build>/sheet.png
```

Look at the sheet. Blurred frames are camera moves; that is expected.

## 6. Hand it over

Give back `out/<build>/<build>-demo.mp4` (1280x720, 20fps). In the portfolio it goes to
`public/demos/<build>-demo.mp4` with an entry in `src/lib/builds.ts`. Commit the script
here; never commit `demos/out/`.
