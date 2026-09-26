/**
 * sift, in fifteen seconds.
 *
 * A shared mailbox fills, faster and faster, until the stream stops and folds into 91 grey tiles
 * that all look alike. A beam reads them, and the ones with a clock running light up. The camera
 * dives into the one that reads most like a form email, where fourteen days unfold into a dial
 * with eleven left, then pulls back out through the same tile as every message flows to the person
 * it belongs to. The three numbers arrive together, because they only mean anything together.
 *
 * Every value is from `data/sift.json`, which `scripts/data.ts` computes from sift's committed run.
 */
import data from "../data/sift.json";
import { bed, type Cue } from "../audio.js";
import "./sift.css";
import {
  E, K, W, H, attr, clamp, cobalt, el, hash, keys, lerp, noise, prog, set, spine, spring, sv, text, tf, tw,
  type Reel,
} from "../engine.js";

const F = data.featured;
const HL = data.headline;
type Msg = (typeof data.inbox)[number];

/* The beat: 120 BPM, a beat every 0.5s. Every hard cut and hit lands on it. */
const T = {
  streamFrom: 0.2, streamTo: 1.85, freeze: 2.0, caption: 2.4,
  scan: 3.5, scanEnd: 4.75, lens: 5.1, lensLand: 5.5, callout: 5.45,
  dive: 6.0, cut: 6.5,
  mark: 6.75, fly: 7.15, unfold: 7.45, drain: 8.0, alert: 8.5, wide: 8.4, route: 8.6, head: 8.6,
  pull: 9.5, pulled: 10.1, launch: 10.1,
  numbers: 11.5, lock: 13.0, end: 15,
};

/* ------------------------------------------------------------------ dates */

const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

/** Days since 1970-01-01 for a `YYYY-MM-DD` stamp, by arithmetic: a reel never reads a clock. */
function dayNum(s: string): number {
  const m = +s.slice(5, 7), d = +s.slice(8, 10);
  const y = +s.slice(0, 4) - (m <= 2 ? 1 : 0);
  const era = Math.floor(y / 400), yoe = y - era * 400;
  const doy = Math.floor((153 * (m > 2 ? m - 3 : m + 9) + 2) / 5) + d - 1;
  return era * 146097 + yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy - 719468;
}
/** The inverse: month and day of a day number. */
function civil(z0: number): { m: number; d: number; dow: number } {
  const z = z0 + 719468;
  const era = Math.floor(z / 146097), doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  return { m: mp + (mp < 10 ? 3 : -9), d: doy - Math.floor((153 * mp + 2) / 5) + 1, dow: (((z0 + 4) % 7) + 7) % 7 };
}
const minutesOf = (s: string): number => dayNum(s) * 1440 + +s.slice(11, 13) * 60 + +s.slice(14, 16);
const dayLabel = (z: number): string => { const c = civil(z); return `${MON[c.m - 1]} ${c.d}`; };
const pad = (n: number): string => String(n).padStart(2, "0");
const stamp = (s: string): string => `${dayLabel(dayNum(s))} ${s.slice(11, 16)}`;

/* ------------------------------------------------------------------ inbox */

const INBOX: readonly Msg[] = [...data.inbox].sort((a, b) => a.received.localeCompare(b.received) || a.id.localeCompare(b.id));
const N = INBOX.length;
const FEAT = INBOX.findIndex((m) => m.id === F.id);
if (FEAT < 0) throw new Error(`${F.id} is not in the inbox`);
const CLOCKED = INBOX.filter((m) => m.clocked).length;
const MINS = INBOX.map((m) => minutesOf(m.received));

/** When each message lands: a trickle that becomes a flood. */
const arriveAt: number[] = (() => {
  const gaps = INBOX.map((_, k) => (k === 0 ? 0 : 0.2 * 0.9 ** k + 0.0065 + hash(k, 5) * 0.004));
  const total = gaps.reduce((a, b) => a + b, 0);
  let acc = 0;
  return gaps.map((g) => T.streamFrom + ((acc += g) / total) * (T.streamTo - T.streamFrom));
})();
const PUSH_K = arriveAt.map((_, k) => lerp(260, 3200, (k / N) ** 1.4));
const PUSH_D = PUSH_K.map((k) => 1.3 * Math.sqrt(k));
const arrivedBy = (t: number): number => { let n = 0; while (n < N && arriveAt[n]! <= t) n++; return n; };

/* the stream column, and the pitch it compresses to */
const COLX = 780, COLW = 992;
const pitchAt = (t: number): number => keys(t, [[0, 100], [0.95, 92], [1.42, 58], [1.74, 20], [1.95, 10]]);
const topAt = (t: number): number => keys(t, [[0, 320], [1.0, 210], [1.95, 88]]);

/* ------------------------------------------------------------------- grid */

const COLS = 13, ROWS = Math.ceil(N / COLS);
const TW = 112, TH = 63, GAP = 14;
const GRID_W = COLS * TW + (COLS - 1) * GAP, GRID_H = ROWS * TH + (ROWS - 1) * GAP;
const GX = (W - GRID_W) / 2, GY = 128;
/** Newest first, the way an inbox lists them. */
const slotOf = (i: number): number => N - 1 - i;
const colOf = (i: number): number => slotOf(i) % COLS;
const rowOf = (i: number): number => Math.floor(slotOf(i) / COLS);
const tileX = (i: number): number => GX + colOf(i) * (TW + GAP);
const tileY = (i: number): number => GY + rowOf(i) * (TH + GAP);
const M40 = { x: tileX(FEAT) + TW / 2, y: tileY(FEAT) + TH / 2 };
const FILL = W / TW;

const flipAt = INBOX.map((_, i) => T.freeze + 0.03 + (slotOf(i) / (N - 1)) * 0.3 + hash(i, 11) * 0.05);

/* the read: a slanted beam at constant speed, so each tile knows when it is reached */
const BEAM = { x0: GX - 70, x1: GX + GRID_W + 70 };
const SPEED = (BEAM.x1 - BEAM.x0) / (T.scanEnd - T.scan);
const SLANT = 0.016;
const readAt = INBOX.map((_, i) => T.scan + (tileX(i) + TW / 2 - BEAM.x0) / SPEED + (rowOf(i) - (ROWS - 1) / 2) * SLANT);

const TOPIC: Record<string, { label: string; color: string }> = {
  rfi: { label: "rfi", color: "oklch(72% .17 254)" },
  submittal: { label: "submittal", color: "oklch(80% .1 212)" },
  agency_letter: { label: "agency letter", color: "oklch(74% .13 300)" },
  invoice: { label: "invoice", color: "oklch(79% .1 168)" },
  client_status: { label: "client status", color: "oklch(86% .05 236)" },
  internal: { label: "internal", color: "oklch(66% .014 256)" },
  other: { label: "other", color: "oklch(55% .03 256)" },
  vendor_pitch: { label: "vendor pitch", color: "oklch(43% .016 256)" },
};
const TOPICS = Object.keys(TOPIC);

const byRead = INBOX.map((m, i) => ({ at: readAt[i]!, m })).sort((a, b) => a.at - b.at);
const running = (() => {
  let alerts = 0;
  const counts: Record<string, number> = Object.fromEntries(TOPICS.map((k) => [k, 0]));
  return byRead.map((r) => {
    if (r.m.clockFlagged) alerts++;
    for (const a of r.m.asserted) counts[a] = (counts[a] ?? 0) + 1;
    return { at: r.at, alerts, counts: { ...counts } };
  });
})();
const readBy = (t: number): number => {
  let lo = 0, hi = running.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (running[mid]!.at <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
};

/* ------------------------------------------------------------------ camera */

interface Cam { s: number; fx: number; fy: number; px: number; py: number }
/** Two framings blended, scale in log space so a zoom reads at an even pace. */
const mixCam = (a: Cam, b: Cam, k: number): Cam => ({
  s: Math.exp(lerp(Math.log(a.s), Math.log(b.s), k)),
  fx: lerp(a.fx, b.fx, k), fy: lerp(a.fy, b.fy, k), px: lerp(a.px, b.px, k), py: lerp(a.py, b.py, k),
});
const beamX = (t: number): number => BEAM.x0 + (t - T.scan) * SPEED;

/** Where the routes are drawn from: the grid small and to the left, the people on the right. */
const RS = 0.6;
const ROUTE: Cam = { s: RS, fx: M40.x, fy: M40.y, px: 110 + (M40.x - GX) * RS, py: 520 + (M40.y - GY - GRID_H / 2) * RS };

function boardCam(t: number): Cam {
  const home: Cam = { s: 1 + 0.035 * tw(t, T.freeze, T.scan + 0.3, E.inOutSine), fx: 960, fy: GY + GRID_H / 2, px: 960, py: 400 };
  const scan: Cam = { s: 1.17, fx: clamp(lerp(beamX(t), 960, 0.35), 620, 1300), fy: GY + GRID_H / 2, px: 960, py: 392 };
  const wide: Cam = { s: 1, fx: 960, fy: GY + GRID_H / 2, px: 960, py: 400 };
  const lk = tw(t, T.lens, T.dive, E.inOutSine);
  const focus: Cam = { s: 1 + 0.1 * lk, fx: M40.x, fy: M40.y, px: lerp(M40.x, 960, 0.45 * lk), py: lerp(M40.y + 400 - (GY + GRID_H / 2), 330, 0.5 * lk) };
  let c = home;
  c = mixCam(c, scan, tw(t, T.scan - 0.05, T.scan + 0.55, E.inOutCubic));
  c = mixCam(c, wide, tw(t, T.scanEnd - 0.1, T.scanEnd + 0.45, E.inOutCubic));
  c = mixCam(c, focus, tw(t, T.lens - 0.15, T.lensLand, E.inOutCubic));
  if (t >= T.dive && t < T.pull) {
    const u = prog(t, T.dive, T.cut);
    const dive: Cam = { s: FILL, fx: M40.x, fy: M40.y, px: 960, py: 540 };
    c = { ...mixCam(c, dive, E.inCubic(u)), px: lerp(c.px, 960, E.inOutCubic(u)), py: lerp(c.py, 540, E.inOutCubic(u)) };
  }
  if (t >= T.pull) {
    const u = prog(t, T.pull, T.pulled);
    const inside: Cam = { s: FILL, fx: M40.x, fy: M40.y, px: 960, py: 540 };
    const k = E.inOutCubic(u);
    c = { ...mixCam(inside, ROUTE, E.inOutQuad(u)), px: lerp(960, ROUTE.px, k), py: lerp(540, ROUTE.py, k) };
  }
  return c;
}
const toScreen = (c: Cam, x: number, y: number): { x: number; y: number } => ({ x: (x - c.fx) * c.s + c.px, y: (y - c.fy) * c.s + c.py });

/* ------------------------------------------------------------------- case */

const PHRASE = "within fourteen (14) calendar days";
if (!F.body.includes(PHRASE)) throw new Error("the featured message no longer carries its clock phrase");
const DAYS = Number(/\((\d+)\)/.exec(PHRASE)?.[1] ?? 0);
const DUE = /Due (\d{4}-\d{2}-\d{2})/.exec(F.outcomes[0]?.why ?? "")?.[1] ?? data.asOf;
const RECEIVED = dayNum(F.received);
const SPENT = dayNum(data.asOf) - RECEIVED;
const LEFT = dayNum(DUE) - dayNum(data.asOf);
if (dayNum(DUE) - RECEIVED !== DAYS) throw new Error("the due date does not sit fourteen days from receipt");
const RESPONSE = /Response by ([^,.]+), (\d+) days/.exec(F.alert?.why ?? "");
if (!RESPONSE || Number(RESPONSE[2]) !== LEFT) throw new Error("the alert and the dial disagree on the days left");
const RESPONSE_LINE = `Response by ${RESPONSE[1]} · ${RESPONSE[2]} days`;
const CONFIRMED = (F.alert?.why ?? "").split(". ")[0] ?? "";
const OUT = F.outcomes[0]!;

const DIAL = { x: 1500, y: 392, r: 196, sw: 30 };
const A0 = 135, SWEEP = 270, STEP = SWEEP / DAYS;
const polar = (deg: number, r: number): { x: number; y: number } => ({
  x: DIAL.x + r * Math.cos((deg * Math.PI) / 180), y: DIAL.y + r * Math.sin((deg * Math.PI) / 180),
});
const arc = (a1: number, a2: number, r: number): string => {
  const p = polar(a1, r), q = polar(a2, r);
  return `M ${p.x.toFixed(2)} ${p.y.toFixed(2)} A ${r} ${r} 0 ${a2 - a1 > 180 ? 1 : 0} 1 ${q.x.toFixed(2)} ${q.y.toFixed(2)}`;
};

/** The case camera: close on the phrase, across to the dial, back to take it all in. */
const CASE_CAM: readonly [number, number, number, number][] = [
  [T.cut, 600, 405, 1.5], [T.fly, 600, 430, 1.64], [T.unfold + 0.25, 1470, 428, 1.34], [T.alert - 0.1, 1480, 432, 1.4],
  [T.alert + 0.45, 960, 522, 1.0], [T.pull, 960, 526, 1.018],
];
const caseCam = (t: number): Cam => {
  const pick = (k: 1 | 2 | 3) => keys(t, CASE_CAM.map((f) => [f[0], f[k]] as const));
  return { s: pick(3), fx: pick(1), fy: pick(2), px: 960, py: 540 };
};

/* ---------------------------------------------------------------- routing */

const PEOPLE = (() => {
  const n = new Map<string, number>();
  for (const m of INBOX) for (const p of m.people) n.set(p, (n.get(p) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
})();
const initials = (name: string): string => name.split(" ").map((w) => w.charAt(0)).join("");
const NODES = [
  ...PEOPLE.map(([name, count]) => ({ key: name, label: name, kind: "person" as const, r: 18 + 4.4 * Math.sqrt(count) })),
  { key: "decide", label: "a person decides", kind: "decide" as const, r: 20 },
  { key: "alone", label: "labelled and left alone", kind: "alone" as const, r: 16 },
];
const NODE_X = 1450;
const nodeY: number[] = (() => {
  const ys: number[] = [];
  let y = 0;
  NODES.forEach((n, k) => {
    const prev = NODES[k - 1];
    y += k === 0 ? 0 : (prev?.r ?? 0) + n.r + (n.kind !== "person" && prev?.kind === "person" ? 58 : 26);
    ys.push(y);
  });
  const mid = (ys[0]! + ys[ys.length - 1]!) / 2;
  return ys.map((v) => v - mid + 540);
})();

const FLOWS = INBOX.flatMap((m, i) => {
  const to = m.people.length ? [...m.people] : [m.escalated ? "decide" : "alone"];
  const launch = T.launch + (colOf(i) / (COLS - 1)) * 0.5 + hash(i, 41) * 0.14;
  return to.map((key, k) => {
    const node = NODES.findIndex((n) => n.key === key);
    const from = toScreen(ROUTE, tileX(i) + TW / 2, tileY(i) + TH / 2);
    const nx = NODE_X - (NODES[node]?.r ?? 20) - 8, ny = nodeY[node]!;
    const span = nx - from.x;
    const bend = (hash(i * 7 + k, 43) - 0.5) * 60;
    const pts = [from, { x: from.x + span * 0.42, y: from.y + bend }, { x: nx - span * 0.38, y: ny }, { x: nx, y: ny }] as const;
    return { i, m, node, launch: launch + k * 0.05, dur: 0.5 + hash(i, 44) * 0.12, pts };
  });
});
const bez = (p: readonly { x: number; y: number }[], u: number): { x: number; y: number } => {
  const v = 1 - u;
  const a = v * v * v, b = 3 * v * v * u, c = 3 * v * u * u, d = u * u * u;
  return { x: a * p[0]!.x + b * p[1]!.x + c * p[2]!.x + d * p[3]!.x, y: a * p[0]!.y + b * p[1]!.y + c * p[2]!.y + d * p[3]!.y };
};
/** When each tile leaves for its first destination. */
const FLOWS_BY_TILE: number[] = INBOX.map((_, i) => FLOWS.find((f) => f.i === i)?.launch ?? T.launch);
const arrivals = NODES.map((_, k) => FLOWS.filter((f) => f.node === k).map((f) => f.launch + f.dur).sort((a, b) => a - b));

/* ---------------------------------------------------------------- numbers */

const pctOf = (r: { rate: number }): number => Math.round(r.rate * 100);
const FIGURES = [
  { eyebrow: "clocks caught", value: pctOf(HL.caught), line: `${HL.caught.count} of ${HL.caught.n} clocked messages`, line2: "raised an alert", tone: K.warnBright },
  { eyebrow: "false alarms", value: pctOf(HL.falseAlarms), line: `${HL.falseAlarms.count} of ${HL.falseAlarms.n} unclocked messages`, line2: "raised one anyway", tone: K.negBright },
  { eyebrow: "automation", value: pctOf(HL.automated), line: `${HL.automated.count} of ${HL.automated.n} handled`, line2: "with no person asked", tone: K.gAccent },
];

const AMBER = (a = 1): string => `oklch(80% .14 80 / ${a})`;
const RED = (a = 1): string => `oklch(70% .17 27 / ${a})`;

/** A node's layout offset inside an ancestor, summed up the offset-parent chain. */
function offsetIn(node: HTMLElement, root: HTMLElement): { x: number; y: number } {
  let x = 0, y = 0;
  for (let n: HTMLElement | null = node; n && n !== root; n = n.offsetParent as HTMLElement | null) {
    x += n.offsetLeft;
    y += n.offsetTop;
  }
  return { x, y };
}

export const sift: Reel = {
  id: "sift",
  title: "sift",
  duration: T.end,
  poster: 12.8,
  fast: [[1.2, T.freeze + 0.6], [T.dive, T.cut + 0.3], [T.pull, T.pulled], [T.numbers - 0.1, T.numbers + 0.4], [T.lock, T.lock + 0.6]],

  build(stage) {
    stage.classList.add("sift");

    /* backdrop: graphite, a cobalt glow and a warm one that wakes with the clock */
    const bg = el("div", "layer", stage);
    set(bg, { background: `radial-gradient(ellipse 60% 55% at 50% 45%, ${K.g2}, ${K.gDeep})` });
    const glowA = el("div", "glow", bg);
    const glowB = el("div", "glow glow-warm", bg);
    const paper = el("div", "paper-dots", bg);

    const defs = sv("svg", { width: 0, height: 0 }, stage);
    const smearF = sv("filter", { id: "sift-smear", x: "-2%", y: "-10%", width: "104%", height: "120%" }, defs);
    const smear = sv("feGaussianBlur", { stdDeviation: "0 0" }, smearF);

    /* ---------------------------------------------- the board: stream, pile, read, routes */
    const sceneB = el("div", "layer", stage);
    const tilt = el("div", "layer", sceneB);
    const board = el("div", "board", tilt);
    const beam = el("div", "beam", board);
    const beamLine = el("div", "beam-line", beam);

    const cards = INBOX.map((m, i) => {
      const card = el("div", "card", board);
      const row = el("div", "row-face", card);
      el("span", "row-dot", row);
      el("div", "row-from", row, m.from);
      el("div", "row-subject", row, m.subject);
      el("div", "row-time", row, stamp(m.received));
      const face = el("div", "tile-face", card);
      const chip = el("div", "chip", face);
      const segW = m.asserted.length ? Math.floor((40 - (m.asserted.length - 1) * 3) / m.asserted.length) : 0;
      for (const a of m.asserted) {
        const seg = el("span", "chip-seg", chip);
        seg.style.width = `${segW}px`;
        seg.style.background = TOPIC[a]?.color ?? K.onG3;
      }
      const b1 = el("div", "bar", face);
      b1.style.width = `${Math.round(30 + Math.min(1, m.from.length / 36) * 44)}px`;
      b1.style.top = "31px";
      const b2 = el("div", "bar bar-2", face);
      b2.style.width = `${Math.round(40 + Math.min(1, m.subject.length / 60) * 50)}px`;
      b2.style.top = "45px";
      const clk = m.clockFlagged ? el("div", "clk", face) : null;
      const hand = clk ? el("span", "clk-hand", clk) : null;
      const pitchOnly = m.asserted.length > 0 && m.asserted.every((a) => a === "vendor_pitch");
      return { m, i, card, row, face, chip, b1, b2, clk, hand, pitchOnly, spin: (hash(i, 13) - 0.5) * 40 };
    });

    const reticle = el("div", "reticle", board);
    reticle.style.left = `${M40.x}px`;
    reticle.style.top = `${M40.y}px`;
    const corners = [0, 1, 2, 3].map((k) => el("span", `corner c${k}`, reticle));

    /* routes, drawn in screen space at the routing framing */
    const routeL = el("div", "layer route", sceneB);
    const rsvg = sv("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}` }, routeL);
    rsvg.classList.add("route-svg");
    const flows = FLOWS.map((f) => {
      const d = `M ${f.pts[0].x.toFixed(1)} ${f.pts[0].y.toFixed(1)} C ${f.pts[1].x.toFixed(1)} ${f.pts[1].y.toFixed(1)}, ${f.pts[2].x.toFixed(1)} ${f.pts[2].y.toFixed(1)}, ${f.pts[3].x.toFixed(1)} ${f.pts[3].y.toFixed(1)}`;
      const flag = f.m.clockFlagged, esc = f.m.escalated, alone = NODES[f.node]?.kind === "alone";
      const color = flag ? K.warnBright : alone ? K.onG3 : K.gAccent;
      const faint = sv("path", { d, pathLength: 1, fill: "none", stroke: color, "stroke-width": 1.4, "stroke-dasharray": "1 1", "stroke-dashoffset": 1, opacity: 0 }, rsvg);
      const comet = sv("path", { d, pathLength: 1, fill: "none", stroke: color, "stroke-width": flag ? 3.4 : 2.4, "stroke-linecap": "round", "stroke-dasharray": "0.16 2", opacity: 0 }, rsvg);
      const dot = esc
        ? sv("circle", { r: 7, fill: K.gDeep, stroke: K.onG, "stroke-width": 2.6, opacity: 0 }, rsvg)
        : sv("circle", { r: flag ? 7 : 5.5, fill: color, opacity: 0 }, rsvg);
      return { f, faint, comet, dot };
    });
    const nodes = NODES.map((n, k) => {
      const node = el("div", `node node-${n.kind}`, routeL);
      node.style.left = `${NODE_X}px`;
      node.style.top = `${nodeY[k]}px`;
      const disc = el("div", "node-disc", node, n.kind === "person" ? initials(n.label) : "");
      set(disc, { left: -n.r, top: -n.r, width: n.r * 2, height: n.r * 2 });
      disc.style.fontSize = `${Math.round(n.r * 0.62)}px`;
      const label = el("div", "node-label", node);
      label.style.left = `${n.r + 22}px`;
      el("span", "node-name", label, n.label);
      const count = n.kind === "person" ? el("span", "node-n", label, "0") : null;
      return { n, node, disc, label, count };
    });
    const routeHead = el("div", "eyebrow route-head", routeL, "who each message goes to");
    const legend2 = el("div", "route-legend", routeL);
    const lg = (cls: string, label: string) => { const r = el("span", "rl-item", legend2); el("span", `rl-mark ${cls}`, r); el("span", "rl-label", r, label); };
    lg("rl-alert", "clock alert");
    lg("rl-routed", "routed");
    lg("rl-person", "a person decides");

    /* ---------------------------------------------- the night: a clock racing through the week */
    const night = el("div", "layer", stage);
    const eyebrow = el("div", "eyebrow inbox-eyebrow", night);
    const dayRead = el("div", "night-day", night);
    const timeRead = el("div", "night-time", night);
    const nightLabel = el("div", "eyebrow night-label", night, "received");

    /* the pile's caption */
    const caption = el("div", "caption", stage);
    const capLines = [`${CLOCKED} of these started a clock.`, "They look like the rest."].map((s, k) => {
      const line = el("div", `cap-line cap-${k}`, caption);
      return s.split(" ").map((w) => el("span", "cap-word", el("span", "cap-mask", line), w));
    });

    /* the read's counters */
    const hud = el("div", "hud", stage);
    const hudRead = el("div", "hud-block", hud);
    el("div", "eyebrow hud-eb", hudRead, "read by sift");
    const readNum = el("div", "hud-num", hudRead, "0");
    el("span", "hud-of", readNum.parentElement!, `/ ${N}`);
    const hudAlert = el("div", "hud-block hud-alert", hud);
    el("div", "eyebrow hud-eb", hudAlert, "clock alerts");
    const alertNum = el("div", "hud-num", hudAlert, "0");
    const legend = el("div", "legend", hud);
    const legendRows = TOPICS.map((k) => {
      const r = el("div", "lg-row", legend);
      const sw = el("span", "lg-swatch", r);
      sw.style.background = TOPIC[k]!.color;
      el("span", "lg-label", r, TOPIC[k]!.label);
      return { k, n: el("span", "lg-n", r, "0") };
    });

    /* the one that looks routine */
    const callout = el("div", "callout", stage);
    const leader = el("div", "leader", stage);
    el("div", "eyebrow co-from", callout, `${F.from} · ${stamp(F.received)}`);
    el("div", "co-subject", callout, F.subject);
    el("div", "co-note", callout, "an automated notice that reads like every other form email");

    /* ---------------------------------------------- the case: inside m040 */
    const caseL = el("div", "case", stage);
    const caseIn = el("div", "case-cam", caseL);
    const warm = el("div", "case-warm", caseIn);
    el("div", "eyebrow case-from", caseIn, `${F.from} · ${stamp(F.received)}`);
    const subj = el("div", "case-subject", caseIn, F.subject);
    const body = el("div", "case-body", caseIn);
    const at = F.body.indexOf(PHRASE);
    body.append(document.createTextNode(F.body.slice(0, at)));
    const phrase = el("span", "phrase", body);
    const numAt = PHRASE.indexOf("(") + 1;
    phrase.append(document.createTextNode(PHRASE.slice(0, numAt)));
    const n14 = el("span", "n14", phrase, PHRASE.slice(numAt, PHRASE.indexOf(")")));
    phrase.append(document.createTextNode(PHRASE.slice(PHRASE.indexOf(")"))));
    body.append(document.createTextNode(F.body.slice(at + PHRASE.length)));

    const scores = [
      { label: "agency letter", v: F.scores.agency_letter, line: data.lines.act },
      { label: "clock running", v: F.clock, line: data.lines.clockAct },
    ].map((s, k) => {
      const row = el("div", "score", caseIn);
      row.style.top = `${664 + k * 84}px`;
      el("span", "score-label", row, s.label);
      const val = el("span", "score-val", row, "0.00");
      const track = el("div", "score-track", row);
      const fill = el("div", `score-fill ${k === 1 ? "hot" : ""}`, track);
      const tick = el("div", "score-tick", track);
      tick.style.left = `${s.line * 940}px`;
      el("span", "score-cap", tick, `line ${s.line.toFixed(2)}`);
      return { ...s, row, val, fill };
    });

    const dialSvg = sv("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}` }, caseIn);
    dialSvg.classList.add("dial");
    const dialTrack = sv("path", { d: arc(A0, A0 + SWEEP, DIAL.r), fill: "none", stroke: K.g3, "stroke-width": DIAL.sw, opacity: 0 }, dialSvg);
    const segs = Array.from({ length: DAYS }, (_, k) =>
      sv("path", { d: arc(A0 + k * STEP + 1.3, A0 + (k + 1) * STEP - 1.3, DIAL.r), fill: "none", stroke: K.warnBright, "stroke-width": DIAL.sw, pathLength: 1, "stroke-dasharray": "1 1", "stroke-dashoffset": 1 }, dialSvg));
    const ticks = Array.from({ length: DAYS + 1 }, (_, k) => {
      const a = A0 + k * STEP, p = polar(a, DIAL.r + DIAL.sw / 2 + 8), q = polar(a, DIAL.r + DIAL.sw / 2 + (k % 7 === 0 || k === SPENT ? 26 : 16));
      return sv("line", { x1: p.x, y1: p.y, x2: q.x, y2: q.y, stroke: K.onG3, "stroke-width": 2, opacity: 0 }, dialSvg);
    });
    // "now": a needle across the ring, so the centre stays the number's
    const hand = sv("line", { stroke: K.onG, "stroke-width": 5, "stroke-linecap": "round", opacity: 0 }, dialSvg);
    const hub = sv("circle", { r: 7, fill: K.onG, opacity: 0 }, dialSvg);
    const dialLabels = [
      { k: 0, s: dayLabel(RECEIVED), sub: "received" },
      { k: SPENT, s: dayLabel(dayNum(data.asOf)), sub: "today" },
      { k: DAYS, s: dayLabel(dayNum(DUE)), sub: "due" },
    ].map((d) => {
      const lab = el("div", "dial-label", caseIn);
      const p = polar(A0 + d.k * STEP, DIAL.r + DIAL.sw / 2 + (d.k === SPENT ? 104 : 74));
      lab.style.left = `${p.x}px`;
      lab.style.top = `${p.y}px`;
      el("div", "eyebrow dl-date", lab, d.s);
      el("div", "eyebrow dl-sub", lab, d.sub);
      return { ...d, lab };
    });
    const dialNum = el("div", "dial-num", caseIn, String(DAYS));
    const dialSub = el("div", "eyebrow dial-sub", caseIn, "days left");
    const fly14 = el("div", "dial-num fly14", caseIn, String(DAYS));
    const response = el("div", "response", caseIn, RESPONSE_LINE);
    const confirmed = el("div", "confirmed", caseIn, `${CONFIRMED}.`);
    const routeRow = el("div", "route-row", caseIn);
    const pn = el("span", "pn", routeRow, OUT.initials);
    el("span", "route-to", routeRow, "to");
    el("span", "route-who", routeRow, OUT.who);
    const prio = el("span", "prio", routeRow, `priority ${OUT.priority}`);
    const headline = el("div", "case-head", caseIn);
    const headWords = F.headline.split(" ").map((w) => el("span", "hw", el("span", "hw-mask", headline), w));

    /* measure where the phrase and its number sit, once, before anything moves */
    const n14At = offsetIn(n14, caseIn);
    const n14Box = { x: n14At.x + n14.offsetWidth / 2, y: n14At.y + n14.offsetHeight / 2 };
    const bodyScale = 29 / 150;

    /* ---------------------------------------------- the three numbers */
    const numbers = el("div", "layer numbers", stage);
    const numHead = el("div", "eyebrow num-head", numbers, `the headline · ${N} synthetic messages`);
    const figs = FIGURES.map((f, k) => {
      const col = el("div", "fig", numbers);
      col.style.left = `${[380, 960, 1540][k]}px`;
      const eb = el("div", "eyebrow fig-eb", col);
      const dot = el("span", "fig-dot", eb);
      dot.style.background = f.tone;
      el("span", "", eb, f.eyebrow);
      const mask = el("div", "fig-mask", col);
      const num = el("div", "fig-num", mask, "0%");
      const l1 = el("div", "fig-line", col, f.line);
      const l2 = el("div", "fig-line fig-line2", col, f.line2);
      return { f, col, eb, num, l1, l2 };
    });
    const brace = el("div", "brace", numbers);
    const braceL = el("span", "brace-end brace-l", brace);
    const braceR = el("span", "brace-end brace-r", brace);
    const together = el("div", "together", numbers, "printed together or not at all");

    /* ---------------------------------------------- the close */
    const lock = el("div", "layer lock", stage);
    const mark = el("div", "lock-mark display", lock);
    // a dotless i, so the dot can be sift's clock
    const markLetters = [..."s\u0131ft"].map((ch) => el("span", "lock-ch", el("span", "lock-mask", mark), ch));
    const tittle = el("div", "tittle", lock);
    const tittleHand = el("span", "tittle-hand", tittle);
    const tagline = el("div", "lock-tag", lock, "reads the mail the way the firm would");
    const url = el("div", "lock-url", lock, "sift.visheshbaghel.com");
    const chain = spine(lock, 960, 820);
    const fine = el("div", "eyebrow lock-fine", lock,
      `self-built experiment on ${N} synthetic messages · no client data · figures: sift/SCORECARD.md`);
    const iMask = markLetters[1]!.parentElement!;
    const tittleX = mark.offsetLeft + iMask.offsetLeft + iMask.offsetWidth / 2;

    const flash = el("div", "layer flash", stage);
    const black = el("div", "layer black", stage);

    return (t) => {
      const hand2 = { x: noise(t * 0.55, 1) * 5, y: noise(t * 0.5, 2) * 4, r: noise(t * 0.4, 3) * 0.1 };
      const beat = Math.floor(t * 2);
      const tickA = (beat + spring((t * 2 - beat) * 0.5, 420, 18)) * 30;

      /* backdrop */
      const warmK = tw(t, T.dive, T.unfold, E.inOutSine) * (1 - tw(t, T.pull, T.pulled + 0.3));
      set(glowA, { transform: tf({ x: 420 + noise(t * 0.2, 4) * 160, y: 200 + noise(t * 0.17, 5) * 120 }), opacity: 0.55 * (1 - 0.6 * warmK) });
      set(glowB, { transform: tf({ x: 1380 + noise(t * 0.18, 6) * 160, y: 560 + noise(t * 0.21, 7) * 120 }), opacity: 0.12 + 0.5 * warmK + 0.18 * tw(t, T.scan, T.lensLand) * (1 - tw(t, T.pull, T.pulled)) });

      /* ---------------------------------------------- the board camera */
      const cam = boardCam(t);
      const boardOn = t < T.cut + 0.02 || (t >= T.pull && t < T.numbers);
      set(board, { transform: `translate(${(cam.px - cam.fx * cam.s).toFixed(2)}px,${(cam.py - cam.fy * cam.s).toFixed(2)}px) scale(${cam.s.toFixed(4)})` });
      set(sceneB, { visibility: boardOn ? "visible" : "hidden" });

      // the stream leans in 3D and straightens as it compresses; the read tilts the table
      const straight = tw(t, 1.35, T.freeze, E.inOutCubic);
      const scanTilt = tw(t, T.scan - 0.05, T.scan + 0.45, E.inOutCubic) * (1 - tw(t, T.scanEnd - 0.15, T.scanEnd + 0.4, E.inOutCubic));
      const bp = prog(t, T.scan, T.scanEnd);
      const lean = tw(t, T.freeze + 0.5, T.scan + 0.2, E.inOutSine) * (1 - tw(t, T.scanEnd - 0.15, T.scanEnd + 0.4, E.inOutCubic));
      const rx = lerp(15, 0, straight) * (t < T.freeze ? 1 : 0) + 10 * scanTilt + 5 * lean;
      const ry = lerp(-9, 0, straight) * (t < T.freeze ? 1 : 0) + lerp(7, -7, bp) * scanTilt;
      const push = t < T.freeze ? 1 + 0.07 * tw(t, 0, T.freeze, E.inOutSine) - 0.07 * straight : 1;
      set(tilt, {
        transformOrigin: t < T.freeze ? `${COLX + COLW / 2}px 520px` : "960px 420px",
        transform: `perspective(1900px) rotateX(${rx.toFixed(3)}deg) rotateY(${ry.toFixed(3)}deg) rotate(${hand2.r.toFixed(3)}deg) translate(${hand2.x.toFixed(2)}px,${hand2.y.toFixed(2)}px) scale(${push.toFixed(4)})`,
      });

      // motion smear while the stream runs flat out
      const smearK = keys(t, [[0.9, 0], [1.35, 1.6], [1.62, 3], [1.8, 1.1], [1.94, 0]]);
      attr(smear, "stdDeviation", `0 ${smearK.toFixed(2)}`);
      set(board, { filter: smearK > 0.25 ? "url(#sift-smear)" : "none" });

      /* ---------------------------------------------- the beam */
      const bx = beamX(t);
      const beamOn = tw(t, T.scan - 0.05, T.scan + 0.1) * (1 - tw(t, T.scanEnd - 0.05, T.scanEnd + 0.15));
      set(beam, { left: bx - 260, top: GY - 70, height: GRID_H + 140, opacity: beamOn, transform: `skewX(${(-Math.atan((SLANT * SPEED) / (TH + GAP)) * 180 / Math.PI).toFixed(2)}deg)` });
      set(beamLine, { opacity: 0.85 + 0.15 * Math.sin(t * 40) });

      /* ---------------------------------------------- the cards */
      const P = pitchAt(t), y0 = topAt(t);
      // later arrivals snap in faster, so the flood still reads as rows rather than a smear
      const pushes = arriveAt.map((a, k) => (t >= a ? spring(t - a, PUSH_K[k]!, PUSH_D[k]!) : 0));
      const above: number[] = new Array(N).fill(0);
      for (let i = N - 2, acc = 0; i >= 0; i--) { acc += pushes[i + 1]!; above[i] = acc; }
      const rowH = P * 0.86;
      const freezeGlow = t >= T.freeze ? 1 - prog(t, T.freeze, T.freeze + 0.3) : 0;
      const lensDim = tw(t, T.lens, T.lensLand, E.inOutCubic) * (1 - tw(t, T.pull, T.pulled - 0.1));
      const alarm = tw(t, T.lensLand - 0.15, T.lensLand + 0.1);

      for (const c of cards) {
        const i = c.i, m = c.m;
        const txl = tileX(i), tyl = tileY(i);
        let cx = txl + TW / 2, cy = tyl + TH / 2, w = TW, h = TH, rot = 0, op = 1, ks = 1, rowOp = 0;
        if (t < flipAt[i]! + 0.9) {
          const enter = pushes[i]!;
          const sy = y0 + P * above[i]! - (1 - clamp(enter)) * P * 0.9;
          const scx = COLX + COLW / 2 + (1 - clamp(enter)) * 60, scy = sy + rowH / 2;
          op = t >= arriveAt[i]! ? clamp(enter * 2.5) : 0;
          rowOp = prog(rowH, 34, 66);
          if (t < flipAt[i]!) {
            cx = scx; cy = scy; w = COLW; h = rowH; ks = 0;
          } else {
            const dt = t - flipAt[i]!;
            // the strip folds into a card first, then the card flies
            const kp = spring(dt - 0.05, 200, 17);
            ks = clamp(spring(dt, 900, 52), 0, 1.02);
            cx = lerp(scx, cx, kp);
            cy = lerp(scy, cy, kp) - Math.sin(Math.PI * clamp(kp)) * 36;
            w = lerp(COLW, TW, ks);
            h = lerp(rowH, TH, ks);
            rot = (kp - ks) * c.spin;
            rowOp *= 1 - clamp(ks * 3);
          }
        }

        // read: the tile turns over as the beam passes, and shows what it is
        const rd = t >= readAt[i]! ? spring(t - readAt[i]!, 170, 15) : 0;
        const ang = 180 * rd;
        const back = ang >= 90;
        const shown = back ? ang - 180 : ang;
        const pop = 1 + 0.14 * Math.sin(Math.PI * clamp(rd));
        const ign = back && m.clockFlagged ? 1 - prog(t, readAt[i]! + 0.08, readAt[i]! + 0.7) : 0;
        const isFeat = i === FEAT;
        const hot = back && m.clockFlagged;
        const alarmK = isFeat ? alarm : 0;
        let ring = "none";
        if (hot) {
          const glow = 10 + 34 * ign + (isFeat ? 20 * alarmK * (0.7 + 0.3 * Math.sin(t * 12.566)) : 0);
          const col = isFeat && alarmK > 0 ? `color-mix(in oklch, ${K.negBright} ${Math.round(alarmK * 100)}%, ${K.warnBright})` : K.warnBright;
          ring = `0 0 0 ${2 + ign * 2}px ${col}, 0 0 ${glow.toFixed(1)}px ${isFeat && alarmK > 0 ? RED(0.55) : AMBER(0.45 + 0.4 * ign)}`;
        }
        const arrivalFlash = t >= arriveAt[i]! ? 1 - prog(t, arriveAt[i]!, arriveAt[i]! + 0.45) : 0;
        const base = ks > 0.5 ? (back ? (hot ? "oklch(30% .035 68)" : c.pitchOnly ? "oklch(25% .014 260)" : "oklch(28% .02 260)") : K.g3) : "oklch(28.5% .022 260)";
        if (ks <= 0.5) ring = "inset 0 1px 0 oklch(100% 0 0 / .06)";
        const flashPct = Math.round(100 * Math.max(arrivalFlash * (0.4 - 0.3 * (i / N)) * (1 - ks), freezeGlow * 0.4 * (1 - ks), ign * 0.5));
        const bgc = flashPct > 0 ? `color-mix(in oklch, ${hot ? K.warnBright : K.gAccent} ${flashPct}%, ${base})` : base;

        // the routes: each tile gives itself up as a particle
        const fl = FLOWS_BY_TILE[i]!;
        const gone = t >= T.launch ? tw(t, fl, fl + 0.22, E.inCubic) : 0;
        const dimK = isFeat ? 0 : lensDim;
        op *= (1 - 0.72 * dimK) * (1 - 0.85 * gone);
        set(c.card, {
          left: cx - w / 2, top: cy - h / 2, width: w, height: h, opacity: op,
          transform: `perspective(700px) rotateY(${shown.toFixed(2)}deg) rotate(${rot.toFixed(2)}deg) scale(${(pop * (1 - 0.5 * gone)).toFixed(4)})`,
          background: bgc, boxShadow: ring,
        });
        set(c.row, { opacity: rowOp, visibility: rowOp > 0.01 ? "visible" : "hidden" });
        set(c.face, { opacity: prog(ks, 0.55, 1), visibility: ks > 0.5 ? "visible" : "hidden" });
        set(c.chip, { opacity: back ? 1 : 0, transform: tf({ sx: back ? 0.3 + 0.7 * clamp(rd * 1.4) : 1 }) });
        set(c.b1, { opacity: back ? (c.pitchOnly ? 0.35 : 0.8) : 0.55 });
        set(c.b2, { opacity: back ? (c.pitchOnly ? 0.3 : 0.6) : 0.55 });
        if (c.clk && c.hand) {
          const cs = back ? spring(t - readAt[i]! - 0.06, 300, 14) : 0;
          set(c.clk, { opacity: back ? 1 : 0, transform: tf({ s: cs }), borderColor: isFeat && alarmK > 0.5 ? K.negBright : K.warnBright });
          set(c.hand, { transform: `rotate(${tickA.toFixed(2)}deg)`, background: isFeat && alarmK > 0.5 ? K.negBright : K.warnBright });
        }
      }

      // the reticle closes on the one that looks routine
      const rk = spring(t - T.lens, 120, 13);
      const rOn = t > T.lens ? clamp((t - T.lens) * 5) * (1 - tw(t, T.dive + 0.15, T.dive + 0.35)) : 0;
      set(reticle, { opacity: rOn, transform: tf({ r: (1 - clamp(rk, 0, 1.2)) * 90 }) });
      const e = lerp(380, 12, rk);
      corners.forEach((cn, k) => {
        const sx = k === 0 || k === 3 ? -1 : 1, sy = k < 2 ? -1 : 1;
        set(cn, { transform: tf({ x: sx * (TW / 2 + e) - 12, y: sy * (TH / 2 + e * 0.6) - 12 }), borderColor: alarm > 0.5 ? K.negBright : K.warnBright });
      });

      /* ---------------------------------------------- the night, the caption, the counters */
      const n = arrivedBy(t);
      const nightOn = 1 - tw(t, T.freeze + 0.05, T.freeze + 0.3, E.inQuad);
      const k0 = Math.max(0, n - 1);
      const mins = n === 0
        ? MINS[0]! - 90 * (1 - tw(t, 0, T.streamFrom))
        : n >= N ? MINS[N - 1]! : lerp(MINS[k0]!, MINS[k0 + 1]!, prog(t, arriveAt[k0]!, arriveAt[k0 + 1]!));
      const z = Math.floor(mins / 1440), mm = Math.floor(mins - z * 1440);
      const cd = civil(z);
      text(dayRead, `${DOW[cd.dow]} ${MON[cd.m - 1]} ${cd.d}`);
      text(timeRead, `${pad(Math.floor(mm / 60))}:${pad(mm % 60)}`);
      const nIn = tw(t, 0.05, 0.55);
      set(dayRead, { opacity: nIn * nightOn, transform: tf({ y: (1 - nIn) * 20 - (1 - nightOn) * 30 }) });
      set(timeRead, { opacity: nIn * nightOn, transform: tf({ y: (1 - nIn) * 30 - (1 - nightOn) * 30 }), filter: t > T.freeze ? `blur(${((1 - nightOn) * 10).toFixed(1)}px)` : "none" });
      set(nightLabel, { opacity: nIn * nightOn * 0.9 });
      text(eyebrow, `info@ · ${n} unread`);
      const ebOut = tw(t, T.scan - 0.25, T.scan);
      set(eyebrow, { opacity: tw(t, 0.05, 0.4) * (1 - ebOut), transform: tf({ y: -ebOut * 16 }) });

      capLines.forEach((words, li) => words.forEach((wd, wi) => {
        const at0 = T.caption + li * 0.28 + wi * 0.04;
        const k = spring(t - at0, 190, 17);
        const out = tw(t, T.scan - 0.22 + wi * 0.015 + li * 0.04, T.scan + 0.02 + wi * 0.015 + li * 0.04, E.inCubic);
        set(wd, { transform: tf({ y: (1 - k) * 80 - out * 80 }), opacity: t > at0 ? 1 : 0 });
      }));

      const hudIn = tw(t, T.scan + 0.1, T.scan + 0.45);
      const hudOut = tw(t, T.lens - 0.1, T.lens + 0.2, E.inCubic);
      set(hud, { opacity: hudIn * (1 - hudOut), transform: tf({ y: (1 - hudIn) * 30 + hudOut * 30 }) });
      const nr = readBy(t);
      const now = running[nr - 1];
      text(readNum, String(nr));
      text(alertNum, String(now?.alerts ?? 0));
      legendRows.forEach((r) => text(r.n, String(now?.counts[r.k] ?? 0)));

      const coIn = tw(t, T.callout, T.callout + 0.35);
      const coOut = tw(t, T.dive + 0.05, T.dive + 0.2, E.inQuad);
      const m40s = toScreen(cam, M40.x, M40.y + TH / 2 + 16);
      set(callout, { opacity: coIn * (1 - coOut), transform: tf({ x: m40s.x, y: 690 + (1 - coIn) * 24 }) });
      const lead = tw(t, T.callout - 0.1, T.callout + 0.25, E.inOutCubic);
      set(leader, { left: m40s.x - 1, top: m40s.y, height: Math.max(0, 668 - m40s.y), transform: `scaleY(${lead.toFixed(3)})`, opacity: 1 - coOut });

      /* ---------------------------------------------- the case, inside the tile */
      const tileS = TW * cam.s;
      const caseOn = t >= T.dive && t < T.pulled && tileS > 90;
      set(caseL, { visibility: caseOn ? "visible" : "hidden" });
      if (caseOn) {
        const tl = toScreen(cam, M40.x - TW / 2, M40.y - TH / 2);
        const k = tileS / W;
        const inside = t >= T.cut && t < T.pull;
        set(caseL, {
          transform: inside ? "none" : `translate(${tl.x.toFixed(2)}px,${tl.y.toFixed(2)}px) scale(${k.toFixed(5)})`,
          opacity: inside ? 1 : prog(tileS, 150, 620),
        });
        caseL.style.borderRadius = inside ? "0px" : `${(8 / k).toFixed(1)}px`;
      }

      const cc = caseCam(t);
      set(caseIn, { transform: `translate(${(cc.px - cc.fx * cc.s + hand2.x).toFixed(2)}px,${(cc.py - cc.fy * cc.s + hand2.y).toFixed(2)}px) scale(${cc.s.toFixed(4)})` });
      set(warm, { opacity: tw(t, T.unfold - 0.2, T.unfold + 0.4) * (0.75 + 0.25 * Math.sin(t * 6.283)) });

      // the phrase: a marker sweep, then its number lifts out
      const mk = tw(t, T.mark, T.mark + 0.34, E.inOutCubic);
      set(phrase, {
        background: `linear-gradient(${AMBER(0.26)}, ${AMBER(0.26)}) 0 0 / ${(mk * 100).toFixed(1)}% 100% no-repeat`,
        color: mk > 0 ? `color-mix(in oklch, ${K.warnBright} ${Math.round(mk * 100)}%, ${K.onG2})` : K.onG2,
      });
      const restDim = tw(t, T.mark + 0.1, T.mark + 0.5);
      set(body, { color: `color-mix(in oklch, ${K.onG3} ${Math.round(restDim * 70)}%, ${K.onG2})` });
      set(subj, { opacity: 1 - 0.35 * restDim });
      const fk = spring(t - T.fly, 110, 14);
      const fu = clamp(fk);
      const flyOn = t >= T.fly && t < T.unfold + 0.12;
      const fs = Math.exp(lerp(Math.log(bodyScale), 0, fu * fu));
      // under the text, not through it: a quadratic swung below the body, out to the dial
      const fv = 1 - fk;
      const fcx = fv * fv * n14Box.x + 2 * fv * fk * 1220 + fk * fk * DIAL.x;
      const fcy = fv * fv * n14Box.y + 2 * fv * fk * 720 + fk * fk * DIAL.y;
      set(fly14, { opacity: flyOn ? 1 : 0, transform: tf({ x: fcx - 150 * fs, y: fcy - 75 * fs, s: fs, r: Math.sin(Math.PI * fu) * -8 }) });
      set(n14, { opacity: t >= T.fly ? 0.25 : 1 });

      // the dial unfolds from the number
      const dialOn = t >= T.unfold;
      attr(dialTrack, "opacity", 0.6 * tw(t, T.unfold - 0.1, T.unfold + 0.2));
      segs.forEach((sg, k) => {
        const a = T.unfold + k * 0.034;
        const d = tw(t, a, a + 0.16, E.outCubic);
        const spent = k < SPENT ? tw(t, T.drain + k * 0.15, T.drain + k * 0.15 + 0.12) : 0;
        const pulse = k >= SPENT && t > T.alert ? 0.5 + 0.5 * Math.cos((t - T.alert) * 6.283 * 2) : 0;
        attr(sg, "stroke-dashoffset", 1 - d);
        attr(sg, "stroke", spent > 0 ? `color-mix(in oklch, ${RED(0.32)} ${Math.round(spent * 100)}%, ${K.warnBright})` : K.warnBright);
        attr(sg, "stroke-width", DIAL.sw * (1 + 0.18 * (1 - spring(t - a, 260, 12))) * (dialOn ? 1 : 0) + pulse * 2);
      });
      ticks.forEach((tk, k) => attr(tk, "opacity", tw(t, T.unfold + k * 0.034 + 0.05, T.unfold + k * 0.034 + 0.2) * 0.8));
      let spentNow = 0;
      for (let k = 0; k < SPENT; k++) spentNow += spring(t - (T.drain + k * 0.15), 320, 17);
      const handA = A0 + STEP * spentNow;
      const hIn = polar(handA, DIAL.r - DIAL.sw / 2 - 16), hOut = polar(handA, DIAL.r + DIAL.sw / 2 + 16), hDot = polar(handA, DIAL.r + DIAL.sw / 2 + 30);
      attr(hand, "x1", hIn.x);
      attr(hand, "y1", hIn.y);
      attr(hand, "x2", hOut.x);
      attr(hand, "y2", hOut.y);
      attr(hub, "cx", hDot.x);
      attr(hub, "cy", hDot.y);
      attr(hand, "opacity", tw(t, T.unfold + 0.2, T.unfold + 0.4));
      attr(hub, "opacity", tw(t, T.unfold + 0.2, T.unfold + 0.4));
      dialLabels.forEach((d) => {
        const a = d.k === SPENT ? T.drain + 0.3 : T.unfold + d.k * 0.034 + 0.1;
        const k = tw(t, a, a + 0.3);
        set(d.lab, { opacity: k, transform: `translate(-50%,-50%) ${tf({ y: (1 - k) * 12 })}` });
      });
      let stepped = 0;
      for (let k = 0; k < SPENT; k++) if (t >= T.drain + k * 0.15 + 0.05) stepped++;
      text(dialNum, String(DAYS - stepped));
      const landed = t >= T.alert;
      const numPop = 1 + 0.12 * (1 - spring(t - T.alert, 300, 12)) * (landed ? 1 : 0);
      set(dialNum, { opacity: t >= T.unfold + 0.1 ? 1 : 0, color: landed ? K.warnBright : K.onG, transform: tf({ s: numPop }) });
      set(dialSub, { opacity: tw(t, T.unfold + 0.2, T.unfold + 0.5) });
      const rIn = spring(t - T.alert - 0.05, 200, 16);
      set(response, { opacity: clamp(rIn * 1.5), transform: `translateX(-50%) ${tf({ y: (1 - rIn) * 40 })}` });
      set(confirmed, { opacity: tw(t, T.alert + 0.2, T.alert + 0.5), transform: `translateX(-50%)` });

      scores.forEach((s, k) => {
        const a = T.wide + 0.1 + k * 0.12;
        const f = tw(t, a, a + 0.5, E.outQuart);
        set(s.row, { opacity: tw(t, a - 0.1, a + 0.2), transform: tf({ y: (1 - tw(t, a - 0.1, a + 0.3)) * 24 }) });
        set(s.fill, { width: s.v * 940 * f });
        text(s.val, (s.v * f).toFixed(2));
      });
      const rr = spring(t - T.route, 190, 15);
      set(routeRow, { opacity: clamp(rr * 2), transform: `translateX(-50%) ${tf({ x: (1 - rr) * 80 })}` });
      set(pn, { transform: tf({ s: 0.4 + 0.6 * spring(t - T.route - 0.05, 320, 12) }) });
      set(prio, { opacity: tw(t, T.route + 0.15, T.route + 0.35) });
      headWords.forEach((w, k) => {
        const hk = spring(t - T.head - k * 0.018, 200, 18);
        set(w, { transform: tf({ y: (1 - hk) * 70 }), opacity: t > T.head + k * 0.018 ? 1 : 0 });
      });

      /* ---------------------------------------------- routing */
      const routeOn = t >= T.pull + 0.35 && t < T.numbers;
      set(routeL, { visibility: routeOn ? "visible" : "hidden" });
      const pre = tw(t, T.numbers - 0.22, T.numbers, E.inCubic);
      set(sceneB, { transform: tf({ s: 1 + 0.025 * tw(t, T.pulled, T.numbers, E.inOutSine) + 0.12 * pre }), filter: pre > 0.01 ? `blur(${(pre * 10).toFixed(1)}px)` : "none" });
      if (routeOn) {
        const counts = NODES.map(() => 0);
        const pulses = NODES.map(() => 0);
        const drawK = tw(t, T.pulled - 0.2, T.pulled + 0.35, E.inOutCubic);
        for (const fw of flows) {
          const f = fw.f;
          const u = prog(t, f.launch, f.launch + f.dur);
          const ue = E.inOutCubic(u);
          const flying = t >= f.launch && u < 1;
          attr(fw.faint, "stroke-dashoffset", 1 - drawK);
          attr(fw.faint, "opacity", 0.1 + 0.08 * (u >= 1 ? 1 - prog(t, f.launch + f.dur, f.launch + f.dur + 0.4) : 0) + (flying ? 0.08 : 0));
          attr(fw.comet, "stroke-dashoffset", 0.16 - ue);
          attr(fw.comet, "opacity", t >= f.launch ? 0.9 * (1 - prog(t, f.launch + f.dur - 0.05, f.launch + f.dur + 0.15)) : 0);
          const p = bez(f.pts, ue);
          attr(fw.dot, "cx", p.x);
          attr(fw.dot, "cy", p.y);
          attr(fw.dot, "opacity", t >= f.launch ? 1 - prog(t, f.launch + f.dur, f.launch + f.dur + 0.1) : 0);
          if (u >= 1) {
            counts[f.node]!++;
            pulses[f.node] = Math.max(pulses[f.node]!, 1 - prog(t, f.launch + f.dur, f.launch + f.dur + 0.3));
          }
        }
        nodes.forEach((nd, k) => {
          const a = T.pull + 0.42 + k * 0.045;
          const s = spring(t - a, 220, 15);
          set(nd.disc, { transform: tf({ s: s * (1 + 0.14 * pulses[k]!) }), boxShadow: pulses[k]! > 0 ? `0 0 ${(26 * pulses[k]!).toFixed(1)}px ${nd.n.kind === "person" ? cobalt(70, 0.7) : "oklch(92% .006 256 / .4)"}` : "none" });
          set(nd.label, { opacity: tw(t, a + 0.1, a + 0.35), transform: tf({ x: (1 - tw(t, a + 0.1, a + 0.4)) * -16, y: -19 }) });
          if (nd.count) text(nd.count, String(counts[k]));
        });
        const hIn = tw(t, T.pulled - 0.1, T.pulled + 0.3);
        set(routeHead, { opacity: hIn, transform: tf({ y: (1 - hIn) * 14 }) });
        set(legend2, { opacity: tw(t, T.launch + 0.3, T.launch + 0.6) });
      }

      /* ---------------------------------------------- the three numbers, together */
      const numOn = t >= T.numbers && t < T.lock + 0.5;
      set(numbers, { visibility: numOn ? "visible" : "hidden" });
      if (numOn) {
        const lockOut = tw(t, T.lock - 0.05, T.lock + 0.25, E.inCubic);
        const count = tw(t, T.numbers + 0.05, T.numbers + 0.75, E.outCubic);
        figs.forEach((fg, k) => {
          const rise = spring(t - T.numbers - k * 0.04, 170, 15);
          set(fg.num, { transform: tf({ y: (1 - rise) * 230 }) });
          text(fg.num, `${Math.round(fg.f.value * count)}%`);
          const ebk = tw(t, T.numbers + 0.1 + k * 0.04, T.numbers + 0.4 + k * 0.04);
          set(fg.eb, { opacity: ebk, transform: `translateX(-50%) ${tf({ y: (1 - ebk) * 14 })}` });
          const lk = tw(t, T.numbers + 0.3 + k * 0.04, T.numbers + 0.65 + k * 0.04);
          set(fg.l1, { opacity: lk, transform: `translateX(-50%) ${tf({ y: (1 - lk) * 18 })}` });
          set(fg.l2, { opacity: lk, transform: `translateX(-50%) ${tf({ y: (1 - lk) * 18 })}` });
          set(fg.col, { opacity: 1 - lockOut, transform: tf({ y: -lockOut * 90 }), filter: lockOut > 0 ? `blur(${(lockOut * 12).toFixed(1)}px)` : "none" });
        });
        const bk = tw(t, T.numbers + 0.6, T.numbers + 1.0, E.inOutCubic);
        set(brace, { transform: `scaleX(${bk.toFixed(4)})`, opacity: 1 - lockOut });
        set(braceL, { opacity: bk > 0.95 ? 1 : 0 });
        set(braceR, { opacity: bk > 0.95 ? 1 : 0 });
        const tg = tw(t, T.numbers + 0.85, T.numbers + 1.2);
        set(together, { opacity: tg * (1 - lockOut), transform: tf({ y: (1 - tg) * 16 - lockOut * 60 }) });
        set(numHead, { opacity: tw(t, T.numbers + 0.15, T.numbers + 0.45) * (1 - lockOut), transform: tf({ y: -lockOut * 60 }) });
      }

      /* ---------------------------------------------- the close */
      set(lock, { visibility: t > T.lock ? "visible" : "hidden" });
      markLetters.forEach((ch, k) => {
        const lk = spring(t - T.lock - 0.14 - k * 0.06, 200, 17);
        set(ch, { transform: tf({ y: (1 - lk) * 300, r: (1 - lk) * 8 }) });
      });
      const td = spring(t - T.lock - 0.62, 260, 11);
      set(tittle, { left: tittleX, transform: `translate(-50%,-50%) ${tf({ y: (1 - clamp(td, 0, 2)) * -120, s: clamp(td, 0, 1.5) })}`, opacity: t > T.lock + 0.62 ? 1 : 0 });
      set(tittleHand, { transform: `rotate(${tickA.toFixed(2)}deg)` });
      const tagIn = tw(t, T.lock + 0.55, T.lock + 1.0);
      set(tagline, { opacity: tagIn, transform: tf({ y: (1 - tagIn) * 20 }) });
      const urlIn = tw(t, T.lock + 0.75, T.lock + 1.2);
      set(url, { opacity: urlIn, transform: tf({ y: (1 - urlIn) * 16 }) });
      chain(t, T.lock + 0.85);
      set(fine, { opacity: tw(t, T.lock + 1.1, T.lock + 1.6) });
      set(lock, { transform: tf({ s: 1 + tw(t, T.lock, T.end, E.linear) * 0.025 }) });

      /* ---------------------------------------------- flashes and the fade from black */
      const fr = t >= T.freeze ? 1 - prog(t, T.freeze, T.freeze + 0.18) : prog(t, T.freeze - 0.04, T.freeze);
      const nb = t >= T.numbers ? 1 - prog(t, T.numbers, T.numbers + 0.25) : prog(t, T.numbers - 0.06, T.numbers);
      set(flash, { opacity: Math.max(fr * 0.12, nb * 0.2), background: nb > fr ? K.gAccent : K.onG });
      set(black, { opacity: 1 - tw(t, 0, 0.35, E.outQuad) });
      set(paper, { opacity: 0.35, backgroundPosition: `${(-cam.fx * 0.05).toFixed(1)}px ${(-cam.fy * 0.05).toFixed(1)}px` });
    };
  },

  cues(): Cue[] {
    const c: Cue[] = [
      ...bed({
        from: 0, to: T.end, kickFrom: T.pull, hats: true,
        chords: [[52, 59, 62, 67, 71], [48, 55, 59, 64, 67], [45, 52, 57, 60, 64], [47, 54, 59, 63, 66]],
      }),
      { t: 0, kind: "swell", dur: 0.3, gain: 0.08 },
      { t: 0.6, kind: "riser", dur: T.freeze - 0.6, gain: 0.2 },
      { t: T.freeze, kind: "impact", gain: 0.55 },
      { t: T.freeze + 0.03, kind: "whoosh", dur: 0.45, gain: 0.2, up: false, pan: [0.5, -0.5] },
      { t: T.freeze + 0.25, kind: "type", dur: 0.45, gain: 0.13, rate: 80 },
      { t: T.caption, kind: "pluck", note: 59, gain: 0.1, dur: 0.5 },
      { t: T.caption + 0.32, kind: "pluck", note: 55, gain: 0.08, dur: 0.6 },
      { t: T.scan - 0.1, kind: "whoosh", dur: T.scanEnd - T.scan + 0.2, gain: 0.1, up: true, pan: [-0.8, 0.8] },
      { t: T.lens, kind: "swell", dur: T.lensLand - T.lens, gain: 0.12 },
      { t: T.lensLand, kind: "bell", note: 83, gain: 0.14, dur: 1.4 },
      { t: T.lensLand, kind: "bell", note: 76, gain: 0.08, dur: 1.4 },
      { t: T.lensLand, kind: "click", gain: 0.3 },
      { t: T.dive, kind: "riser", dur: T.cut - T.dive, gain: 0.3 },
      { t: T.cut, kind: "impact", gain: 0.85 },
      { t: T.mark, kind: "whoosh", dur: 0.34, gain: 0.08, up: true },
      { t: T.fly - 0.05, kind: "whoosh", dur: 0.5, gain: 0.2, up: true, pan: [-0.4, 0.5] },
      { t: T.alert, kind: "bell", note: 88, gain: 0.16, dur: 1.6 },
      { t: T.alert, kind: "bell", note: 81, gain: 0.1, dur: 1.6 },
      { t: T.alert, kind: "stamp", gain: 0.35 },
      { t: T.route, kind: "click", gain: 0.3, pan: 0.3 },
      { t: T.route, kind: "pluck", note: 71, gain: 0.1 },
      { t: T.head, kind: "pluck", note: 64, gain: 0.08, dur: 0.6 },
      { t: T.pull, kind: "whoosh", dur: 0.5, gain: 0.3, up: false },
      { t: T.pull, kind: "boom", gain: 0.35, pitch: 1.3 },
      { t: T.numbers - 0.5, kind: "riser", dur: 0.5, gain: 0.26 },
      { t: T.numbers, kind: "impact", gain: 1 },
      { t: T.numbers + 0.75, kind: "bell", note: 83, gain: 0.12 },
      { t: T.numbers + 0.75, kind: "bell", note: 76, gain: 0.08 },
      { t: T.numbers + 0.6, kind: "swell", dur: 0.4, gain: 0.1 },
      { t: T.lock - 0.4, kind: "swell", dur: 0.4, gain: 0.16 },
      { t: T.lock, kind: "whoosh", dur: 0.5, gain: 0.22, up: false },
      { t: T.lock + 0.2, kind: "boom", gain: 0.5 },
      { t: T.lock + 0.62, kind: "tick", freq: 3200, gain: 0.16 },
      { t: T.lock + 1.0, kind: "bell", note: 76, gain: 0.12, dur: 2.5 },
      { t: T.lock + 1.0, kind: "bell", note: 83, gain: 0.1, dur: 2.5 },
      { t: T.lock + 1.0, kind: "bell", note: 88, gain: 0.07, dur: 2.5 },
    ];
    // the stream: one grain per message, brighter and closer together as the flood builds
    arriveAt.forEach((a, k) => c.push({ t: a, kind: "tick", freq: 1500 + 1700 * (k / N), gain: 0.03 + 0.03 * (k / N), pan: hash(k, 51) * 1.2 - 0.6 }));
    // the read: a pluck per column in E minor, a bright tick for each clock that lights
    const scale = [64, 67, 69, 71, 74, 76, 79, 81, 83, 86, 88, 91, 93];
    for (let col = 0; col < COLS; col++) {
      const at = T.scan + (GX + col * (TW + GAP) + TW / 2 - BEAM.x0) / SPEED;
      c.push({ t: at, kind: "pluck", note: scale[col]!, gain: 0.06, dur: 0.3, pan: (col / (COLS - 1)) * 1.4 - 0.7, bright: 0.8 + col * 0.05 });
    }
    INBOX.forEach((m, i) => { if (m.clockFlagged) c.push({ t: readAt[i]! + 0.08, kind: "tick", freq: 3000 + hash(i, 52) * 900, gain: 0.05, pan: (colOf(i) / (COLS - 1)) * 1.4 - 0.7 }); });
    // the clock scene keeps time: tick and tock on every beat
    for (let b = T.cut; b < T.pull; b += 0.5) c.push({ t: b, kind: "tick", freq: (b * 2) % 2 === 0 ? 2300 : 1800, gain: 0.08 });
    for (let k = 0; k < DAYS; k++) c.push({ t: T.unfold + k * 0.034, kind: "pluck", note: 64 + [0, 3, 5, 7, 10, 12, 15][k % 7]! + (k >= 7 ? 12 : 0), gain: 0.04, dur: 0.2, pan: -0.5 + k / DAYS });
    for (let k = 0; k < SPENT; k++) c.push({ t: T.drain + k * 0.15, kind: "tick", freq: 1400, gain: 0.14 });
    // routing: a whoosh per wave, a soft pluck as each person's first message lands
    [0, 0.2, 0.4].forEach((d, k) => c.push({ t: T.launch + d, kind: "whoosh", dur: 0.55, gain: 0.12, up: true, pan: [-0.7 + k * 0.1, 0.8] }));
    NODES.forEach((_, k) => { const first = arrivals[k]?.[0]; if (first !== undefined) c.push({ t: first, kind: "pluck", note: [76, 79, 83, 86, 88, 91, 71, 67][k] ?? 76, gain: 0.06, dur: 0.3, pan: 0.6 }); });
    // the numbers count up together
    for (let k = 0; k < 12; k++) c.push({ t: T.numbers + 0.05 + k * 0.055, kind: "tick", freq: 2400 + k * 70, gain: 0.05 });
    return c;
  },
};
