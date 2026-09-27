/**
 * The page: a player for people, and a frame server for the renderer.
 *
 *   reels.html            the player: pick a reel, play it with sound, scrub it
 *   reels.html#capture=x  one bare 1920x1080 stage and `window.__reel`, for scripts/render.ts
 */
import "./reels.css";
import { renderAudio, toWav } from "./audio.js";
import { H, W, clamp, el, hash, type Reel } from "./engine.js";

let REELS: readonly Reel[] = [];

declare global {
  interface Window {
    __reel?: {
      duration: number; poster: number; fast: readonly (readonly [number, number])[]; ready: boolean;
      seek(t: number): void; audio(): Promise<string>;
    };
  }
}

const FONTS = [
  "500 20px 'Space Grotesk'", "600 20px 'Space Grotesk'", "700 20px 'Space Grotesk'",
  "400 20px Inter", "500 20px Inter", "600 20px Inter",
  "400 20px 'JetBrains Mono'", "500 20px 'JetBrains Mono'",
];

/**
 * The finish every reel shares: a soft vignette and a film grain that changes 24 times a second.
 * The grain is seeded from the frame's own time, so it is part of the deterministic picture.
 */
function finish(stage: HTMLElement): (t: number) => void {
  el("div", "vignette", stage);
  const canvas = el("canvas", "grain", stage);
  canvas.width = 480;
  canvas.height = 270;
  const g = canvas.getContext("2d");
  const img = g?.createImageData(canvas.width, canvas.height);
  let last = -1;
  return (t) => {
    const frame = Math.floor(t * 24);
    if (!g || !img || frame === last) return;
    last = frame;
    const d = img.data;
    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      const v = hash(p, frame) * 255;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  };
}

/**
 * The renderer leaves the grain out: blended over the whole frame it is the costliest thing in
 * it, and the encoder dithers the video instead.
 */
function mountStage(parent: HTMLElement, reel: Reel, grain = true): (t: number) => void {
  const stage = el("div", "stage", parent);
  stage.dataset.reel = reel.id;
  const draw = reel.build(stage);
  const film = grain ? finish(stage) : () => {};
  if (!grain) el("div", "vignette", stage);
  return (t) => {
    draw(t);
    film(t);
  };
}

const b64 = (buf: ArrayBuffer): string => {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

async function capture(id: string): Promise<void> {
  const reel = REELS.find((r) => r.id === id);
  if (!reel) throw new Error(`no reel ${id}`);
  document.body.className = "capture";
  const seek = mountStage(document.body, reel, false);
  seek(0);
  window.__reel = {
    duration: reel.duration, poster: reel.poster, fast: reel.fast ?? [], ready: true, seek,
    audio: async () => b64(toWav(await renderAudio(reel.cues(), reel.duration))),
  };
}

function player(): void {
  document.body.className = "player";
  const shell = el("main", "shell", document.body);
  const head = el("header", "bar", shell);
  el("span", "bar-mark", head, "builds · reels");
  const tabs = el("nav", "tabs", head);
  tabs.setAttribute("aria-label", "Reels");

  const frame = el("div", "frame", shell);
  const viewport = el("div", "viewport", frame);
  const controls = el("div", "controls", shell);
  const play = el("button", "btn play", controls, "Play");
  play.type = "button";
  const scrub = el("input", "scrub", controls);
  scrub.type = "range";
  scrub.min = "0";
  scrub.step = "0.001";
  scrub.setAttribute("aria-label", "Position");
  const clock = el("span", "clock", controls, "0.00");
  const sound = el("button", "btn sound", controls, "Sound on");
  sound.type = "button";
  const foot = el("p", "foot", shell,
    "Each reel is a self-built experiment on synthetic data, and every figure in it is computed from that build's committed run. Sources are named in each reel's closing frame.");
  foot.setAttribute("role", "note");

  let reel = REELS[0]!;
  let seek: (t: number) => void = () => {};
  let t = 0, playing = false, startedAt = 0, muted = false;
  let actx: AudioContext | null = null;
  let source: AudioBufferSourceNode | null = null;
  const buffers = new Map<string, Promise<AudioBuffer>>();

  const fit = () => {
    const k = viewport.clientWidth / W;
    const stage = viewport.firstElementChild as HTMLElement | null;
    if (stage) stage.style.transform = `scale(${k})`;
    viewport.style.height = `${H * k}px`;
  };
  new ResizeObserver(fit).observe(frame);

  const stopAudio = () => {
    source?.stop();
    source = null;
  };
  const startAudio = async () => {
    stopAudio();
    if (muted) return;
    actx ??= new AudioContext();
    await actx.resume();
    const buffer = await buffers.get(reel.id)!;
    if (!playing) return;
    source = actx.createBufferSource();
    source.buffer = buffer;
    source.connect(actx.destination);
    // The playhead has moved on while the buffer rendered; start from where it is now.
    source.start(0, clamp((performance.now() - startedAt) / 1000, 0, reel.duration));
  };

  const show = (next: Reel) => {
    playing = false;
    stopAudio();
    reel = next;
    viewport.replaceChildren();
    seek = mountStage(viewport, reel);
    t = reel.poster;
    scrub.max = String(reel.duration);
    if (!buffers.has(reel.id)) buffers.set(reel.id, renderAudio(reel.cues(), reel.duration));
    for (const b of tabs.children) b.setAttribute("aria-current", String((b as HTMLElement).dataset.id === reel.id));
    fit();
    draw();
  };

  const draw = () => {
    seek(t);
    scrub.value = String(t);
    clock.textContent = `${t.toFixed(2)} / ${reel.duration.toFixed(2)}`;
    play.textContent = playing ? "Pause" : t >= reel.duration ? "Replay" : "Play";
  };

  const tick = (now: number) => {
    if (!playing) return;
    t = clamp((now - startedAt) / 1000, 0, reel.duration);
    if (t >= reel.duration) {
      playing = false;
      stopAudio();
    }
    draw();
    if (playing) requestAnimationFrame(tick);
  };

  const start = () => {
    if (t >= reel.duration - 0.01 || t === reel.poster) t = 0;
    playing = true;
    startedAt = performance.now() - t * 1000;
    void startAudio();
    requestAnimationFrame(tick);
    draw();
  };

  play.addEventListener("click", () => {
    if (playing) {
      playing = false;
      stopAudio();
      draw();
    } else start();
  });
  scrub.addEventListener("input", () => {
    t = Number(scrub.value);
    if (playing) {
      startedAt = performance.now() - t * 1000;
      void startAudio();
    }
    draw();
  });
  sound.addEventListener("click", () => {
    muted = !muted;
    sound.textContent = muted ? "Sound off" : "Sound on";
    if (muted) stopAudio();
    else if (playing) void startAudio();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === " " && document.activeElement?.tagName !== "BUTTON") {
      e.preventDefault();
      play.click();
    }
  });

  for (const r of REELS) {
    const b = el("button", "tab", tabs, r.title);
    b.type = "button";
    b.dataset.id = r.id;
    b.addEventListener("click", () => show(r));
  }
  const wanted = REELS.find((r) => `#${r.id}` === location.hash);
  show(wanted ?? REELS[0]!);
}

export async function boot(reels: readonly Reel[]): Promise<void> {
  REELS = reels;
  await Promise.all(FONTS.map((f) => document.fonts.load(f)));
  await document.fonts.ready;
  const m = /^#capture=(\w+)$/.exec(location.hash);
  if (m?.[1]) await capture(m[1]);
  else player();
}

