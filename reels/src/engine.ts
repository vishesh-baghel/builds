/**
 * The motion toolkit every reel is written against.
 *
 * A reel is a pure function of time: `build()` makes the DOM once, and the function it returns
 * sets every property from `t` alone. Nothing animates by itself (no CSS transitions, no timers),
 * so a frame captured at 7.25s is the same frame on every render, and seeking backwards works.
 */
import type { Cue } from "./audio.js";

export const W = 1920;
export const H = 1080;

export interface Reel {
  readonly id: string;
  readonly title: string;
  readonly duration: number;
  /** The moment used as the video's poster frame. */
  readonly poster: number;
  /** Where the motion is fastest: the renderer samples these spans more densely for smooth blur. */
  readonly fast?: readonly (readonly [number, number])[];
  build(stage: HTMLElement): (t: number) => void;
  cues(): Cue[];
}

/* ------------------------------------------------------------------ math */

export const clamp = (v: number, lo = 0, hi = 1): number => Math.min(hi, Math.max(lo, v));
export const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
/** Linear progress of `t` through [a, b], clamped to 0..1. */
export const prog = (t: number, a: number, b: number): number => (b === a ? (t >= b ? 1 : 0) : clamp((t - a) / (b - a)));

export type Ease = (x: number) => number;

const bezier = (x1: number, y1: number, x2: number, y2: number): Ease => {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (u: number) => ((ax * u + bx) * u + cx) * u;
  const sy = (u: number) => ((ay * u + by) * u + cy) * u;
  const dx = (u: number) => (3 * ax * u + 2 * bx) * u + cx;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let u = x;
    for (let i = 0; i < 8; i++) {
      const e = sx(u) - x;
      if (Math.abs(e) < 1e-6) break;
      const d = dx(u);
      if (Math.abs(d) < 1e-6) break;
      u -= e / d;
    }
    return sy(clamp(u));
  };
};

export const E = {
  linear: ((x) => x) as Ease,
  inQuad: ((x) => x * x) as Ease,
  outQuad: ((x) => 1 - (1 - x) * (1 - x)) as Ease,
  inOutQuad: ((x) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2)) as Ease,
  inCubic: ((x) => x ** 3) as Ease,
  outCubic: ((x) => 1 - (1 - x) ** 3) as Ease,
  inOutCubic: ((x) => (x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2)) as Ease,
  outQuart: ((x) => 1 - (1 - x) ** 4) as Ease,
  inOutQuart: ((x) => (x < 0.5 ? 8 * x ** 4 : 1 - (-2 * x + 2) ** 4 / 2)) as Ease,
  outQuint: ((x) => 1 - (1 - x) ** 5) as Ease,
  inQuint: ((x) => x ** 5) as Ease,
  inExpo: ((x) => (x <= 0 ? 0 : 2 ** (10 * x - 10))) as Ease,
  outExpo: ((x) => (x >= 1 ? 1 : 1 - 2 ** (-10 * x))) as Ease,
  inOutExpo: ((x) => (x <= 0 ? 0 : x >= 1 ? 1 : x < 0.5 ? 2 ** (20 * x - 10) / 2 : (2 - 2 ** (-20 * x + 10)) / 2)) as Ease,
  inOutSine: ((x) => -(Math.cos(Math.PI * x) - 1) / 2) as Ease,
  outBack: ((x) => 1 + 2.70158 * (x - 1) ** 3 + 1.70158 * (x - 1) ** 2) as Ease,
  /** The house curve: a fast start that lands softly, the motion equivalent of `--ease-out`. */
  snap: bezier(0.16, 1, 0.3, 1),
  /** Anticipation into a hard stop, for things that slam. */
  slam: bezier(0.7, 0, 0.84, 0),
  swift: bezier(0.65, 0, 0.35, 1),
  bezier,
};

/** Eased progress of `t` through [a, b]. */
export const tw = (t: number, a: number, b: number, ease: Ease = E.snap): number => ease(prog(t, a, b));

/**
 * A damped spring from 0 to 1, `dt` seconds after release. Underdamped springs overshoot, which is
 * the point: it is the difference between a thing arriving and a thing being placed.
 */
export function spring(dt: number, stiffness = 180, damping = 14, mass = 1): number {
  if (dt <= 0) return 0;
  const w0 = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));
  if (zeta < 1) {
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    return 1 - Math.exp(-zeta * w0 * dt) * (Math.cos(wd * dt) + ((zeta * w0) / wd) * Math.sin(wd * dt));
  }
  return 1 - Math.exp(-w0 * dt) * (1 + w0 * dt);
}

/** Keyframes: `[[time, value], ...]` sampled with an ease per segment. */
export function keys(t: number, frames: readonly (readonly [number, number])[], ease: Ease = E.inOutCubic): number {
  const first = frames[0];
  const last = frames[frames.length - 1];
  if (!first || !last) return 0;
  if (t <= first[0]) return first[1];
  if (t >= last[0]) return last[1];
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i - 1]!, b = frames[i]!;
    if (t <= b[0]) return lerp(a[1], b[1], ease(prog(t, a[0], b[0])));
  }
  return last[1];
}

/* ---------------------------------------------------------------- random */

/** A seeded generator, so every "random" scatter is the same on every render. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** A stateless hash of an integer to 0..1. */
export const hash = (i: number, seed = 0): number => {
  let x = Math.imul((i + 0x9e3779b9 + seed * 0x85ebca6b) | 0, 0x27d4eb2d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x2c1b3c6d);
  x ^= x >>> 12;
  return (x >>> 0) / 4294967296;
};

/** Smooth 1D value noise in -1..1, for drift and handheld camera. */
export function noise(x: number, seed = 0): number {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return lerp(hash(i, seed), hash(i + 1, seed), u) * 2 - 1;
}

/* ------------------------------------------------------------------- DOM */

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, cls = "", parent?: Element, text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  parent?.appendChild(node);
  return node;
}

const SVG_NS = "http://www.w3.org/2000/svg";
export function sv<K extends keyof SVGElementTagNameMap>(
  tag: K, attrs: Record<string, string | number> = {}, parent?: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent?.appendChild(node);
  return node;
}

export interface Tf {
  x?: number; y?: number; z?: number; s?: number; sx?: number; sy?: number;
  r?: number; rx?: number; ry?: number; skx?: number;
}
/** A transform string. Order: move, then rotate, then scale, the order a camera operator thinks in. */
export const tf = ({ x = 0, y = 0, z = 0, s = 1, sx = 1, sy = 1, r = 0, rx = 0, ry = 0, skx = 0 }: Tf): string =>
  `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,${z.toFixed(2)}px)` +
  (rx ? ` rotateX(${rx.toFixed(3)}deg)` : "") + (ry ? ` rotateY(${ry.toFixed(3)}deg)` : "") +
  (r ? ` rotate(${r.toFixed(3)}deg)` : "") + (skx ? ` skewX(${skx.toFixed(3)}deg)` : "") +
  (s !== 1 || sx !== 1 || sy !== 1 ? ` scale(${(s * sx).toFixed(4)},${(s * sy).toFixed(4)})` : "");

type StyleKey = "opacity" | "transform" | "filter" | "clipPath" | "color" | "background" | "width" | "height" |
  "left" | "top" | "boxShadow" | "borderColor" | "visibility" | "letterSpacing" | "textShadow" | "strokeDashoffset" |
  "transformOrigin" | "backgroundPosition" | "fill" | "stroke" | "display" | "borderRadius";

const PX = new Set(["left", "top", "width", "height"]);

/**
 * Sets only what changed since the last frame, which keeps a 1,000-element frame cheap. Numbers
 * are pixels for box geometry and unitless for everything else (opacity, stroke offsets).
 */
export function set(node: HTMLElement | SVGElement, props: Partial<Record<StyleKey, string | number>>): void {
  const memo = ((node as unknown as { __m?: Record<string, string> }).__m ??= {});
  for (const [k, raw] of Object.entries(props)) {
    const v = typeof raw === "number" ? `${Math.round(raw * 10000) / 10000}${PX.has(k) ? "px" : ""}` : String(raw);
    if (memo[k] === v) continue;
    memo[k] = v;
    (node.style as unknown as Record<string, string>)[k] = v;
  }
}

/** Sets an attribute only when it changed. */
export function attr(node: Element, name: string, value: string | number): void {
  const v = typeof value === "number" ? String(Math.round(value * 1000) / 1000) : value;
  if (node.getAttribute(name) !== v) node.setAttribute(name, v);
}

/** Rewrites text only when it changed. */
export function text(node: Element, value: string): void {
  if (node.textContent !== value) node.textContent = value;
}

/* --------------------------------------------------------------- numbers */

export const money = (cents: number, withCents = false): string =>
  `$${(withCents ? cents / 100 : Math.round(cents / 100)).toLocaleString("en-US", {
    minimumFractionDigits: withCents ? 2 : 0, maximumFractionDigits: withCents ? 2 : 0,
  })}`;
export const int = (n: number): string => Math.round(n).toLocaleString("en-US");

/* ----------------------------------------------------------------- color */

/** The build's tokens, lifted from the apps' own globals so the reels read as the same hand. */
export const K = {
  ink: "oklch(24% .02 258)", ink2: "oklch(36% .018 257)", ink3: "oklch(54% .015 256)",
  rule: "oklch(91% .006 255)", rule2: "oklch(84% .009 255)",
  paper: "oklch(98.5% .004 250)", paper2: "oklch(96.4% .005 252)", paper3: "oklch(94% .006 253)",
  accent: "oklch(52% .20 256)", accentSoft: "oklch(94.5% .028 256)", accentInk: "oklch(99% .005 256)",
  g: "oklch(22% .016 260)", g2: "oklch(26% .018 260)", g3: "oklch(31% .02 260)", gDeep: "oklch(16% .014 262)",
  gAccent: "oklch(72% .17 254)", onG: "oklch(92% .006 256)", onG2: "oklch(70% .012 256)", onG3: "oklch(56% .012 256)",
  pos: "oklch(52% .13 158)", posBright: "oklch(76% .15 158)", neg: "oklch(54% .18 27)", negBright: "oklch(70% .17 27)",
  warn: "oklch(62% .13 75)", warnBright: "oklch(80% .14 80)",
};

/** Cobalt at a given lightness and alpha, for glows that must stay on-hue. */
export const cobalt = (l = 72, a = 1, c = 0.17): string => `oklch(${l}% ${c} 254 / ${a})`;

/* ----------------------------------------------------------- typography */

export interface Glyph { readonly span: HTMLSpanElement; readonly i: number; readonly line: number; readonly col: number; readonly x: number; readonly y: number; readonly ch: string }

/**
 * Sets monospaced text one absolutely placed glyph at a time. Line breaks are the text's own
 * `\n`s, so a caller that swaps a space for a newline keeps every character index intact, which is
 * what lets a reel highlight a range the build reported as `start..end`.
 */
export function mono(parent: Element, source: string, size: number, lineHeight: number, cls = ""): Glyph[] {
  const adv = size * 0.6;
  const glyphs: Glyph[] = [];
  let line = 0, col = 0;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i]!;
    if (ch === "\n") { line++; col = 0; continue; }
    const span = el("span", `glyph ${cls}`, parent, ch === " " ? " " : ch);
    const x = col * adv, y = line * lineHeight;
    span.style.left = `${x}px`;
    span.style.top = `${y}px`;
    glyphs.push({ span, i, line, col, x, y, ch });
    col++;
  }
  return glyphs;
}

/** Splits a headline into per-character inline-block spans, grouped by word so lines wrap cleanly. */
export function letters(parent: Element, source: string, cls = ""): HTMLSpanElement[] {
  const out: HTMLSpanElement[] = [];
  source.split(" ").forEach((word, w, words) => {
    const box = el("span", "word", parent);
    for (const ch of word) out.push(el("span", `ch ${cls}`, box, ch));
    if (w < words.length - 1) parent.appendChild(document.createTextNode(" "));
  });
  return out;
}

/* ------------------------------------------------------------ shared kit */

/**
 * The six stages every build composes, drawn as the closing signature of each reel. Returned as
 * an element plus an updater that lights the chain from `start`.
 */
export const STAGES = ["extract", "classify", "decide", "act", "escalate", "log"] as const;

export function spine(parent: Element, x: number, y: number, dark = true): (t: number, start: number) => void {
  const wrap = el("div", "spine", parent);
  wrap.style.left = `${x}px`;
  wrap.style.top = `${y}px`;
  const nodes = STAGES.map((name, i) => {
    const item = el("div", "spine-node", wrap);
    const dot = el("span", "spine-dot", item);
    const label = el("span", "spine-label", item, name);
    const link = i < STAGES.length - 1 ? el("span", "spine-link", wrap) : null;
    return { item, dot, label, link };
  });
  const on = dark ? K.gAccent : K.accent;
  const off = dark ? K.onG3 : K.ink3;
  return (t, start) => {
    nodes.forEach((n, i) => {
      const k = tw(t, start + i * 0.09, start + i * 0.09 + 0.45);
      const lit = tw(t, start + 0.25 + i * 0.09, start + 0.4 + i * 0.09, E.outQuad);
      set(n.item, { opacity: k, transform: tf({ y: (1 - k) * 18 }) });
      set(n.dot, { background: lit > 0.5 ? on : off, boxShadow: lit > 0.5 ? `0 0 ${14 * lit}px ${cobalt(70, 0.7 * lit)}` : "none" });
      set(n.label, { color: lit > 0.5 ? (dark ? K.onG : K.ink) : off });
      if (n.link) set(n.link, { transform: `scaleX(${tw(t, start + 0.2 + i * 0.09, start + 0.5 + i * 0.09)})` });
    });
  };
}
