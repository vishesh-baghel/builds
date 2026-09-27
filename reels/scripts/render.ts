/**
 * Builds the player page and renders each reel to video.
 *
 *   pnpm --filter @builds/reels render                  every reel, final quality
 *   pnpm --filter @builds/reels render tally            one reel
 *   pnpm --filter @builds/reels render tally --draft    no motion blur, fast encode
 *   pnpm --filter @builds/reels render tally --stills 2.5,7,11
 *   pnpm --filter @builds/reels render --html           only out/reels.html
 *   pnpm --filter @builds/reels render tally --audio    only the soundtrack, out/.tmp/tally.wav
 *   pnpm --filter @builds/reels render --workers 4      browsers capturing side by side (default 3)
 *
 * Frames come from headless Chromium, one seek per sample; motion blur is real, the average of
 * four samples spread across a 180 degree shutter, twelve where a reel says its motion is fastest. Needs ffmpeg with libx264 on PATH (or FFMPEG),
 * and a Chromium that playwright-core can find (or REELS_CHROMIUM).
 */
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { chromium, type Page } from "playwright-core";

const root = fileURLToPath(new URL("..", import.meta.url));
const outDir = join(root, "out");
const tmpDir = join(outDir, ".tmp");
const require = createRequire(import.meta.url);

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const draft = args.includes("--draft");
const htmlOnly = args.includes("--html");
const audioOnly = args.includes("--audio");
const stills = flag("--stills")?.split(",").map(Number).filter((n) => Number.isFinite(n));
const ids = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--stills" && args[i - 1] !== "--workers");

const FPS = 60;
const SUBFRAMES = draft ? 1 : 4;
const FAST_SAMPLES = 12;
const CHUNK = 90;
const SHUTTER = 0.5;
const WORKERS = Math.max(1, Number(flag("--workers") ?? 3));
const FFMPEG = process.env.FFMPEG ?? "ffmpeg";

/* ------------------------------------------------------------------ page */

const FACES: readonly [family: string, pkg: string, file: string, weight: number][] = [
  ["Space Grotesk", "@fontsource/space-grotesk", "space-grotesk-latin", 500],
  ["Space Grotesk", "@fontsource/space-grotesk", "space-grotesk-latin", 600],
  ["Space Grotesk", "@fontsource/space-grotesk", "space-grotesk-latin", 700],
  ["Inter", "@fontsource/inter", "inter-latin", 400],
  ["Inter", "@fontsource/inter", "inter-latin", 500],
  ["Inter", "@fontsource/inter", "inter-latin", 600],
  ["JetBrains Mono", "@fontsource/jetbrains-mono", "jetbrains-mono-latin", 400],
  ["JetBrains Mono", "@fontsource/jetbrains-mono", "jetbrains-mono-latin", 500],
];

/** The fonts ride inside the page, so a render never depends on the network. */
const fontCss = (): string => FACES.map(([family, pkg, file, weight]) => {
  const dir = dirname(require.resolve(`${pkg}/package.json`));
  const data = readFileSync(join(dir, "files", `${file}-${weight}-normal.woff2`)).toString("base64");
  return `@font-face{font-family:"${family}";font-style:normal;font-weight:${weight};font-display:block;src:url(data:font/woff2;base64,${data}) format("woff2")}`;
}).join("\n");

/**
 * The page with every reel, or with just the ones asked for: a reel being worked on can then be
 * rendered while another is mid-edit and does not compile.
 */
async function page(only: readonly string[] = []): Promise<string> {
  const entry = only.length
    ? {
        stdin: {
          contents: `import { boot } from "./player.ts";\n${only.map((id) => `import { ${id} } from "./reels/${id}.ts";`).join("\n")}\nvoid boot([${only.join(", ")}]);`,
          resolveDir: join(root, "src"), sourcefile: "entry.ts", loader: "ts" as const,
        },
      }
    : { entryPoints: [join(root, "src/main.ts")] };
  const result = await build({
    ...entry, bundle: true, format: "iife", target: "es2022",
    write: false, outdir: tmpDir, minify: true, legalComments: "none",
  });
  const js = result.outputFiles.find((f) => f.path.endsWith(".js"))?.text ?? "";
  const css = result.outputFiles.find((f) => f.path.endsWith(".css"))?.text ?? "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>builds reels</title>
<meta name="description" content="Fifteen-second motion pieces for tally, reckon and sift, each drawn from the build's own committed run.">
<style>${fontCss()}\n${css}</style>
</head>
<body>
<script>${js.replace(/<\/script/g, "<\\/script")}</script>
</body>
</html>
`;
}

/* ----------------------------------------------------------------- video */

type Capture = { page: Page; shot: (t: number, type?: "png" | "jpeg") => Promise<Buffer>; close: () => Promise<void> };

async function open(url: string): Promise<Capture> {
  const browser = await chromium.launch({
    ...(process.env.REELS_CHROMIUM ? { executablePath: process.env.REELS_CHROMIUM } : {}),
    // software raster without the GL path is faster here, and nothing on the stage needs a GPU
    args: ["--font-render-hinting=none", "--force-color-profile=srgb", "--disable-lcd-text", "--hide-scrollbars", "--disable-gpu"],
  });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on("pageerror", (e) => console.error(`page error: ${e.message}`));
  await page.goto(url);
  await page.waitForFunction(() => window.__reel?.ready === true, undefined, { timeout: 30_000 });
  const cdp = await context.newCDPSession(page);
  const shot = async (t: number, type: "png" | "jpeg" = "png"): Promise<Buffer> => {
    await page.evaluate((at) => window.__reel?.seek(at), t);
    const { data } = await cdp.send("Page.captureScreenshot", { format: type, optimizeForSpeed: true, ...(type === "jpeg" ? { quality: 92 } : {}) });
    return Buffer.from(data, "base64");
  };
  return { page, shot, close: () => browser.close() };
}

function ffmpeg(argv: string[]): { write(b: Buffer): Promise<void>; done: Promise<void>; end(): void } {
  const proc = spawn(FFMPEG, ["-y", "-loglevel", "error", ...argv], { stdio: ["pipe", "inherit", "pipe"] });
  let log = "";
  proc.stderr.on("data", (d: Buffer) => { log = (log + d.toString()).slice(-4000); });
  const done = new Promise<void>((resolve, reject) => {
    proc.on("error", reject);
    proc.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}\n${log}`))));
  });
  // a broken pipe is reported by `done`, with ffmpeg's own last words, rather than thrown here
  proc.stdin.on("error", () => {});
  return {
    write: async (b) => {
      if (!proc.stdin.write(b)) await Promise.race([new Promise<void>((resolve) => proc.stdin.once("drain", resolve)), done]);
    },
    done,
    end: () => proc.stdin.end(),
  };
}

interface Segment { from: number; to: number; samples: number; path: string }

/**
 * Captures output frames [from, to) into a lossless segment. Each output frame is the average of
 * `samples` exposures across the shutter, and a segment asks only for its own frames' exposures, so
 * segments can be captured side by side, at different densities, and joined without a seam.
 */
async function segment(cap: Capture, seg: Segment, duration: number, tick: () => void): Promise<void> {
  const n = seg.samples;
  const blur = n > 1 ? `tmix=frames=${n},trim=start_frame=${n - 1},setpts=PTS-STARTPTS,framestep=${n},` : "";
  const enc = ffmpeg([
    "-f", "image2pipe", "-framerate", String(FPS * n), "-c:v", "png", "-i", "-",
    "-vf", `${blur}setpts=PTS-STARTPTS,fps=${FPS}`,
    "-c:v", "libx264rgb", "-preset", "ultrafast", "-qp", "0", seg.path,
  ]);
  for (let f = seg.from; f < seg.to; f++) {
    for (let k = 0; k < n; k++) {
      const offset = n > 1 ? ((k + 0.5) / n - 0.5) * (SHUTTER / FPS) : 0;
      await enc.write(await cap.shot(Math.min(duration - 1e-4, Math.max(0, f / FPS + offset))));
    }
    tick();
  }
  enc.end();
  await enc.done;
}

/**
 * Splits the frames into segments: the reel's fast spans at FAST_SAMPLES exposures a frame, the
 * rest at SUBFRAMES, and nothing longer than CHUNK frames, so the workers stay evenly loaded.
 */
function plan(id: string, frames: number, fast: readonly (readonly [number, number])[]): Segment[] {
  const dense = (f: number) => !draft && fast.some(([a, b]) => f >= Math.floor(a * FPS) && f < Math.ceil(b * FPS));
  const segs: Segment[] = [];
  let from = 0;
  for (let f = 1; f <= frames; f++) {
    if (f === frames || dense(f) !== dense(from) || f - from >= CHUNK) {
      segs.push({ from, to: f, samples: dense(from) ? FAST_SAMPLES : SUBFRAMES, path: join(tmpDir, `${id}-${process.pid}-${segs.length}.mkv`) });
      from = f;
    }
  }
  return segs;
}

async function renderReel(id: string, url: string): Promise<void> {
  const capUrl = `${url}#capture=${id}`;
  const first = await open(capUrl);
  let meta: { duration: number; poster: number; fast: readonly (readonly [number, number])[] };
  const wavPath = join(tmpDir, `${id}.wav`);
  try {
    meta = await first.page.evaluate(() => ({ duration: window.__reel!.duration, poster: window.__reel!.poster, fast: window.__reel!.fast }));

    if (stills) {
      mkdirSync(join(outDir, "stills"), { recursive: true });
      for (const t of stills) writeFileSync(join(outDir, "stills", `${id}-${t.toFixed(2)}.png`), await first.shot(t));
      console.log(`${id}: ${stills.length} stills in out/stills/`);
      return;
    }
    writeFileSync(wavPath, Buffer.from(await first.page.evaluate(() => window.__reel!.audio()), "base64"));
    if (audioOnly) {
      console.log(`${id}: wrote out/.tmp/${id}.wav`);
      return;
    }
    writeFileSync(join(outDir, `${id}${draft ? "-draft" : ""}.jpg`), await first.shot(meta.poster, "jpeg"));
  } finally {
    await first.close();
  }

  const { duration } = meta;
  const frames = Math.round(duration * FPS);
  const started = Date.now();
  let done = 0;
  const tick = () => {
    done++;
    if (done % 30 === 0) process.stdout.write(`\r${id}: ${done}/${frames} frames, ${(done / ((Date.now() - started) / 1000)).toFixed(1)} fps   `);
  };
  const segs = plan(id, frames, meta.fast);
  const queue = [...segs];
  await Promise.all(Array.from({ length: Math.min(WORKERS, segs.length) }, async () => {
    const cap = await open(capUrl);
    try {
      for (let seg = queue.shift(); seg; seg = queue.shift()) await segment(cap, seg, duration, tick);
    } finally {
      await cap.close();
    }
  }));

  const list = join(tmpDir, `${id}-${process.pid}.txt`);
  writeFileSync(list, segs.map((p) => `file '${p.path}'`).join("\n"));
  const out = join(outDir, `${id}${draft ? "-draft" : ""}.mp4`);
  const enc = ffmpeg([
    "-f", "concat", "-safe", "0", "-i", list, "-i", wavPath,
    // a whisper of luma noise dithers the dark gradients so they do not band in 8 bits
    "-vf", "noise=c0s=3:c0f=t,scale=out_color_matrix=bt709:out_range=tv,format=yuv420p",
    "-c:v", "libx264", "-preset", draft ? "veryfast" : "slow", "-crf", draft ? "23" : "17",
    "-profile:v", "high", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
    // the page's limiter is a compressor with a fast attack; this one looks ahead and keeps true peaks under -1 dBFS
    "-af", "alimiter=limit=0.75:attack=2:release=40:level=false",
    "-c:a", "aac", "-b:a", "192k", "-t", String(duration), "-movflags", "+faststart", out,
  ]);
  enc.end();
  await enc.done;
  for (const p of segs) rmSync(p.path, { force: true });
  rmSync(list, { force: true });
  console.log(`\n${id}: wrote out/${id}${draft ? "-draft" : ""}.mp4 in ${((Date.now() - started) / 1000).toFixed(0)}s`);
}

/* ------------------------------------------------------------------ main */

mkdirSync(tmpDir, { recursive: true });
// the page with every reel is written by a full render, or by --html; a single reel never needs it
if (htmlOnly || (!stills && !audioOnly && ids.length === 0)) {
  writeFileSync(join(outDir, "reels.html"), await page());
  console.log("wrote out/reels.html");
}

if (!htmlOnly) {
  for (const id of ids.length ? ids : ["tally", "reckon", "sift"]) {
    // each reel is captured from a page of its own, so parallel renders never share a file
    const path = join(tmpDir, `${id}-${process.pid}.html`);
    writeFileSync(path, await page([id]));
    try {
      await renderReel(id, pathToFileURL(path).href);
    } finally {
      rmSync(path, { force: true });
    }
  }
}
