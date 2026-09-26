/**
 * reckon, in fifteen seconds.
 *
 * A reminder goes out into the dark and the replies come back out of the same point. The one that
 * matters lands last, on paper, and is read: two phrases, a stated figure, seven probabilities
 * against their lines. Then the card cleaves along the gap between what it pays and what it
 * disputes, one half to plain code and a closed list of actions, the other half to a person.
 * The run follows, per subset, with the one miss nobody caught left in.
 *
 * Every value is from `data/reckon.json`, which `scripts/data.ts` computes from reckon's committed run.
 */
import data from "../data/reckon.json";
import { bed, type Cue } from "../audio.js";
import "./reckon.css";
import {
  E, K, clamp, cobalt, el, hash, lerp, noise, prog, set, spine, spring, text, tf, tw,
  type Ease, type Reel,
} from "../engine.js";

const F = data.featured;
const INV = F.invoice;
type Cls = keyof typeof F.scores;
const SCORE = F.scores as Record<Cls, number>;
const ACT = data.lines.act as Record<Cls, number>;
const REVIEW = data.lines.review;
/** The seven questions, highest first, so the two that crossed their line lead. */
const CLASSES = (Object.keys(SCORE) as Cls[]).sort((a, b) => SCORE[b] - SCORE[a]);
const asserted = (c: Cls): boolean => (F.asserted as string[]).includes(c);
const flagged = (c: Cls): boolean => (F.review as string[]).includes(c);
const FLAGGED = CLASSES.find(flagged);

const NEUTRAL = "oklch(66% .04 256)";
const COUNT = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const usd = (n: number): string => `$${Math.round(n).toLocaleString("en-US")}`;
const dollars = (s: string): number => Number(s.replace(/[$,]/g, ""));

/** The partial payment, as the decide stage wrote it, checked against the open balance. */
const RECORD = F.effects.find((e) => e.action === "record_partial");
const LEDGER = (() => {
  const m = /^(\$[\d,]+) recorded against \S+, (\$[\d,]+) still outstanding$/.exec(RECORD?.summary ?? "");
  const paid = dollars(m?.[1] ?? "NaN"), left = dollars(m?.[2] ?? "NaN");
  if (paid + left !== INV.openBalance) throw new Error("record_partial does not reconcile with the open balance");
  return { paid, left };
})();

const ORD = data.ordinary, HARD = data.hard;
const PER_REPLY = `${(data.meta.totalCents / data.meta.replies).toFixed(4)}¢`;
const MEDIAN = `${Math.round(data.meta.medianMs)} ms`;

/* The beat: 120 BPM, a beat every 0.5s, a bar every 2s. Every hard cut and hit lands on it. */
const T = {
  remind: 0.06, sent: 0.42, launch: 1.0, star: 1.2, headline: 1.08,
  lands: [1.75, 2.0, 2.25, 2.5, 2.75, 3.0, 3.25, 3.5] as const,
  feat: 3.5, land: 4.0,
  hl: [4.375, 4.75, 5.0] as const, pull: 5.25, bars: 5.5, verdict: 6.25, flag: 6.5,
  cut: 7.5, decide: 8.0, audit: 8.625, nothing: 9.25,
  heal: 9.72, nums: 10.0, count: 10.4, caught: 11.0, miss: 11.5, meta: 12.0,
  lock: 13.0, end: 15,
};

/* ------------------------------------------------------------------ depth */

/** A reply's resting place in the constellation, around the gap the featured card will fill. */
const REST = [
  { x: -620, y: -300, z: -80, r: -4 },
  { x: 600, y: -320, z: -260, r: 3 },
  { x: -660, y: 240, z: -300, r: 2.5 },
  { x: 640, y: 270, z: -60, r: -3 },
  { x: -30, y: -440, z: -640, r: 1.5 },
  { x: 80, y: 430, z: -520, r: -2 },
  { x: -340, y: -20, z: -1150, r: 2 },
  { x: 380, y: 10, z: -900, r: -1.5 },
] as const;

/** Where the reminder vanishes, and where every reply comes back from. */
const VP = { x: 1540, y: 250 };
const PERSP = 1400, ORIGIN = { x: 960, y: 520 };
const FAR = -4200;
const FROM = { x: (VP.x - ORIGIN.x) * (PERSP - FAR) / PERSP, y: (VP.y - ORIGIN.y) * (PERSP - FAR) / PERSP };

/** When a spring released at 0 first reaches its target: the moment a landing should sound. */
function crossing(k: number, d: number): number {
  const w0 = Math.sqrt(k), z = d / (2 * w0), wd = w0 * Math.sqrt(1 - z * z);
  return (Math.PI - Math.atan(wd / (z * w0))) / wd;
}
const FLY = { k: 90, d: 13 };
const FLY_T = crossing(FLY.k, FLY.d);

/** A struck thing ringing down: 0 at the strike, a few swings, then still. */
const ring = (dt: number, freq = 18, decay = 7): number => (dt <= 0 ? 0 : Math.exp(-decay * dt) * Math.sin(freq * dt));

/* ------------------------------------------------------------------ card */

const CW = 1120, CH = 640;
const LINE_TOP = [112, 188, 380, 456] as const;
/** The cleave: where it meets the card's left and right edges. It runs through the gap the sentence leaves. */
const CUT = { l: 476, r: 156 };
const cutY = (x: number): number => lerp(CUT.l, CUT.r, x / CW);
const C = { x: CW / 2, y: cutY(CW / 2) };
const CUT_ANGLE = Math.atan2(CUT.r - CUT.l, CW);
const CUT_LEN = Math.hypot(CW, CUT.r - CUT.l);
/** Unit normal of the cut, pointing into the top half. */
const NORMAL = { x: Math.sin(CUT_ANGLE), y: -Math.cos(CUT_ANGLE) };

const WORDS = F.body.split(" ");
/** Two lines of what it pays, two of what it holds back; the sentence breaks where its meaning does. */
const LINES = [WORDS.slice(0, 3), WORDS.slice(3, 8), WORDS.slice(8, 12), WORDS.slice(12)].map((w) => w.join(" "));
if (LINES.join(" ") !== F.body) throw new Error("the featured body no longer breaks into these four lines");

type Mark = "partial" | "amount" | "dispute";
const span = (s: string): [number, number] => {
  const a = F.body.indexOf(s);
  if (a < 0) throw new Error(`"${s}" is not in the featured body`);
  return [a, a + s.length];
};
const MARKS: Record<Mark, [number, number]> = {
  partial: span("Paying the undisputed portion now"),
  amount: span("21,000"),
  dispute: span("holding the rest pending review"),
};
const MARK_INK: Record<Mark, string> = {
  partial: "oklch(86% .085 256 / .9)", amount: "oklch(92% .07 158)", dispute: "oklch(87% .075 27 / .9)",
};

/** A card on screen: the point C of the card sits at (x, y), at scale s, turned r degrees. */
interface Pose { x: number; y: number; s: number; r?: number; sx?: number; sy?: number; z?: number; rx?: number; ry?: number; rz?: number }
const poseTf = (p: Pose): string => {
  let out = `translate(${p.x.toFixed(2)}px,${p.y.toFixed(2)}px)`;
  if (p.r) out += ` rotate(${p.r.toFixed(3)}deg)`;
  out += ` scale(${(p.s * (p.sx ?? 1)).toFixed(4)},${(p.s * (p.sy ?? 1)).toFixed(4)})`;
  if (p.z !== undefined) {
    out += ` perspective(${(1600 / p.s).toFixed(1)}px) translate3d(0,0,${p.z.toFixed(1)}px)` +
      ` rotateX(${(p.rx ?? 0).toFixed(2)}deg) rotateY(${(p.ry ?? 0).toFixed(2)}deg) rotate(${(p.rz ?? 0).toFixed(2)}deg)`;
  }
  return `${out} translate(${-C.x}px,${-C.y}px)`;
};
const mix = (a: Pose, b: Pose, k: number): Pose => ({
  x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), s: lerp(a.s, b.s, k), r: lerp(a.r ?? 0, b.r ?? 0, k),
  sx: lerp(a.sx ?? 1, b.sx ?? 1, k), sy: lerp(a.sy ?? 1, b.sy ?? 1, k),
});
/** Where a card point lands on screen for a pose (no perspective, no turn). */
const onScreen = (p: Pose, cx: number, cy: number): { x: number; y: number } =>
  ({ x: p.x + (cx - C.x) * p.s * (p.sx ?? 1), y: p.y + (cy - C.y) * p.s * (p.sy ?? 1) });

/** The read camera, as shots: which card point sits where on screen, and how close. */
type Shot = { fx: number; fy: number; px: number; py: number; s: number };
const SHOTS: readonly (readonly [number, Shot, Ease])[] = [
  [T.land, { fx: 560, fy: 320, px: 960, py: 540, s: 0.78 }, E.linear],
  [4.08, { fx: 560, fy: 318, px: 960, py: 540, s: 0.8 }, E.outQuad],
  [4.45, { fx: 560, fy: 300, px: 960, py: 540, s: 1.5 }, E.snap],
  [T.pull, { fx: 604, fy: 330, px: 960, py: 540, s: 1.56 }, E.inOutSine],
  [5.65, { fx: 560, fy: 320, px: 560, py: 556, s: 0.64 }, E.swift],
  [7.05, { fx: 560, fy: 320, px: 574, py: 548, s: 0.66 }, E.linear],
  [7.42, { fx: 560, fy: 320, px: 960, py: 540, s: 0.9 }, E.inOutCubic],
];
function shotPose(t: number): Pose {
  let a = SHOTS[0]![1], b = a, k = 0;
  for (let i = 1; i < SHOTS.length; i++) {
    const [at, s, ease] = SHOTS[i]!;
    const prev = SHOTS[i - 1]!;
    if (t <= at) {
      a = prev[1];
      b = s;
      k = ease(prog(t, prev[0], at));
      break;
    }
    a = b = s;
  }
  const s = lerp(a.s, b.s, k);
  const fx = lerp(a.fx, b.fx, k), fy = lerp(a.fy, b.fy, k), px = lerp(a.px, b.px, k), py = lerp(a.py, b.py, k);
  return { x: px + (C.x - fx) * s, y: py + (C.y - fy) * s, s };
}

/** After the cleave: each half's place at the head of its path. */
const SPLIT_S = 0.9;
const AT_SPLIT: Pose = { x: 960 + (C.x - 560) * SPLIT_S, y: 540 + (C.y - 320) * SPLIT_S, s: SPLIT_S };
const DOCK_S = 0.46;
const DOCK = {
  a: { x: 110 + C.x * DOCK_S, y: 64 + C.y * DOCK_S, s: DOCK_S, r: 0 },
  b: { x: 1810 - (CW - C.x) * DOCK_S, y: 100 + (C.y - CUT.r) * DOCK_S, s: DOCK_S, r: 0 },
};

/** The close: the seam the wordmark's two halves meet along, through the middle of its letters. */
const LOCK = { y: 156, angle: (-8 * Math.PI) / 180 };

/* ------------------------------------------------------------------ run */

const PITCH = 42;
const WAFFLE = { ord: { x: 135, y: 250, cols: 17 }, hard: { x: 1075, y: 250, cols: 7 } };
/** One square per reply, right first, then the errors the gate caught, then the ones it did not. */
const units = (n: number, errors: number, caught: number): (0 | 1 | 2)[] =>
  Array.from({ length: n }, (_, i) => (i < n - errors ? 0 : i < n - errors + caught ? 1 : 2));
const DOTS = [
  ...units(ORD.n, ORD.errors, ORD.caught).map((kind, i) => ({ kind, set: "ord" as const, i })),
  ...units(HARD.n, HARD.errors, HARD.caught).map((kind, i) => ({ kind, set: "hard" as const, i })),
].map((d) => {
  const w = WAFFLE[d.set];
  return { ...d, x: w.x + (d.i % w.cols) * PITCH, y: w.y + Math.floor(d.i / w.cols) * PITCH };
});
/** The featured reply's own square: its subset, and whether the scorecard counts it right. */
const HOME = DOTS.find((d) => d.set === (data.featured.hard ? "hard" : "ord") && (d.kind === 0) === data.featured.correct)!;

export const reckon: Reel = {
  id: "reckon",
  title: "reckon",
  duration: T.end,
  poster: 9.6,
  fast: [[T.launch - 0.05, T.launch + 0.5], [T.feat, T.land + 0.2], [T.cut - 0.05, T.cut + 0.6], [T.nums, T.nums + 0.5], [T.lock, T.lock + 0.6]],

  build(stage) {
    stage.classList.add("reckon");

    /* backdrop: graphite, two slow cobalt glows, and dust that drifts toward the lens */
    const bg = el("div", "layer", stage);
    set(bg, { background: `radial-gradient(ellipse 62% 58% at 50% 45%, ${K.g2}, ${K.gDeep})` });
    const glowA = el("div", "glow", bg);
    const glowB = el("div", "glow", bg);
    const dustLayer = el("div", "depth", bg);
    const dustCam = el("div", "depth-cam", dustLayer);
    const motes = Array.from({ length: 46 }, (_, i) => ({
      node: el("div", "mote", dustCam),
      x: (hash(i, 41) - 0.5) * 3000, y: (hash(i, 42) - 0.5) * 1800, z0: hash(i, 43) * 3600, s: 0.5 + hash(i, 44) * 1.2,
    }));

    /* 1. the reminder */
    const s1 = el("div", "layer", stage);
    const remind = el("div", "remind", s1);
    const remindBar = el("div", "remind-bar", remind);
    const remindEyebrow = el("div", "eyebrow remind-eyebrow", remind, `reminder · invoice ${INV.number}`);
    const remindCustomer = el("div", "remind-customer", remind, INV.customer);
    const remindRule = el("div", "remind-rule", remind);
    const stats = [
      { label: "open balance", to: INV.openBalance, fmt: usd, x: 56, cls: "" },
      { label: "days past due", to: INV.daysPastDue, fmt: (n: number) => String(Math.round(n)), x: 460, cls: "warm" },
    ].map((s) => {
      const box = el("div", "remind-stat", remind);
      box.style.left = `${s.x}px`;
      el("span", "stat-label", box, s.label);
      return { ...s, box, value: el("span", `stat-value ${s.cls}`, box, s.fmt(0)) };
    });
    const SENT = `invoice ${INV.number} · reminder sent`;
    const sent = el("div", "remind-sent", s1);
    const sentText = el("span", "", sent);
    sentText.style.position = "relative";
    const caret = el("span", "caret", sent);
    const streak = el("div", "streak", s1);
    const star = el("div", "star", s1);
    const flareA = el("div", "flare", s1);
    const flareB = el("div", "flare", s1);
    const headline = el("div", "headline", s1);
    const headWords = "then the replies come back".split(" ").map((w) => el("span", "", el("span", "mask", headline), w));

    /* 2. the replies, in depth */
    // each card carries its own perspective and the camera, so no shared 3D context has to sort them
    const field = el("div", "layer field", stage);
    const replies = data.replies.map((r, i) => {
      const anchor = el("div", "r-anchor", field);
      const card = el("div", "reply", anchor);
      el("div", "reply-from", card, r.from);
      el("div", "reply-body", card, r.body);
      const tags = el("div", "reply-tags", card);
      if (r.asserted.length) for (const c of r.asserted) el("span", "reply-tag", tags, c);
      else el("span", "reply-tag none", tags, "nothing cleared · to a person");
      const land = T.lands[i] ?? T.lands[T.lands.length - 1]!;
      return {
        anchor, card, tags, land, launch: land - FLY_T, rest: REST[i % REST.length]!,
        spin: { rx: 90 + hash(i, 51) * 140, ry: (hash(i, 52) - 0.5) * 320, r: (hash(i, 53) - 0.5) * 90 },
        jit: { x: (hash(i, 54) - 0.5) * 260, y: (hash(i, 55) - 0.5) * 260 },
      };
    });

    /* 3 to 5. the featured reply, as two halves that start as one card */
    const read = el("div", "layer", stage);
    const card = (side: "a" | "b") => {
      const half = el("div", "half", read);
      const clip = el("div", "half-clip", half);
      el("div", "paper", clip);
      el("div", "fc-from", clip, F.from);
      el("div", "fc-subj", clip, F.subject);
      el("div", "fc-rule", clip);
      const marks: { mark: Mark; node: HTMLElement; from: number; to: number }[] = [];
      const tags: Partial<Record<Mark, HTMLElement>> = {};
      let chip: HTMLElement | null = null;
      let offset = 0;
      LINES.forEach((line, li) => {
        const row = el("div", `fc-line ${li >= 2 ? "b" : ""}`, clip);
        row.style.top = `${LINE_TOP[li]}px`;
        // a pinned tag sits outside the text, so it never moves a glyph
        const pin = (mark: Mark) => {
          const p = el("span", "pin", row);
          const tag = el("span", `fc-tag ${mark}`, p);
          if (mark === "amount") {
            el("span", "amt-value", tag, usd(LEDGER.paid));
            el("span", "amt-note", tag, "stated figure, resolved in code");
          } else tag.textContent = mark;
          tags[mark] = tag;
        };
        if (li === 2) pin("dispute");
        // runs of the line that share a mark
        let i = 0;
        while (i < line.length) {
          const at = offset + i;
          const markOf = (g: number): Mark | null =>
            (Object.keys(MARKS) as Mark[]).find((m) => g >= MARKS[m][0] && g < MARKS[m][1]) ?? null;
          const m = markOf(at);
          let j = i + 1;
          while (j < line.length && markOf(offset + j) === m) j++;
          const s = el("span", m === "amount" ? "chip" : m ? "hl" : "", row, line.slice(i, j));
          if (m === "amount") chip = s;
          if (m) marks.push({ mark: m, node: s, from: at, to: offset + j });
          i = j;
        }
        if (li === 0) pin("partial");
        if (li === 1) pin("amount");
        offset += line.length + 1;
      });
      el("div", "fc-foot", clip, `joined in code · ${INV.customer} · ${usd(INV.openBalance)} open · ${INV.daysPastDue} days past due`);
      const edge = el("div", "edge", clip);
      set(edge, { left: 0, top: CUT.l, width: CUT_LEN, transform: `rotate(${(CUT_ANGLE * 180) / Math.PI}deg)`, background: side === "a" ? K.gAccent : K.negBright });
      const tint = el("div", "card-tint", clip);
      return { half, clip, marks, tags, chip: chip as HTMLElement | null, edge, tint };
    };
    const halfA = card("a");
    const halfB = card("b");
    const M = 400;
    const clipA = `polygon(${-M}px ${-M}px, ${CW + M}px ${-M}px, ${CW + M}px ${cutY(CW + M)}px, ${-M}px ${cutY(-M)}px)`;
    const clipB = `polygon(${-M}px ${cutY(-M)}px, ${CW + M}px ${cutY(CW + M)}px, ${CW + M}px ${CH + M}px, ${-M}px ${CH + M}px)`;
    const cutLine = el("div", "cut", read);
    const shock = el("div", "shock");
    read.prepend(shock);
    const sparks = Array.from({ length: 22 }, (_, i) => ({
      node: el("div", "spark", read), u: hash(i, 61), side: i % 2 === 0 ? 1 : -1,
      v: 260 + hash(i, 62) * 520, drift: (hash(i, 63) - 0.5) * 300, life: 0.35 + hash(i, 64) * 0.3,
    }));

    /* 4. the seven questions */
    const bars = el("div", "bars", stage);
    const barsHead = el("div", "eyebrow bars-head", bars, `${COUNT[CLASSES.length] ?? CLASSES.length} yes or no questions · one per class`);
    const rows = CLASSES.map((c, i) => {
      const row = el("div", "bar-row", bars);
      row.style.top = `${56 + i * 86}px`;
      const label = el("span", "bar-label", row, c);
      const status = el("span", "bar-status", row, asserted(c) ? "act" : flagged(c) ? "flagged, not acted on" : "");
      status.style.left = `${c.length * 15.6 + 22}px`;
      const val = el("span", "bar-val", row, "0.00");
      const track = el("div", "bar-track", row);
      const band = el("div", "bar-band", track);
      set(band, { left: REVIEW * 780, width: (ACT[c] - REVIEW) * 780 });
      const fill = el("div", "bar-fill", track);
      const tick = el("div", "bar-tick", track);
      tick.style.left = `${ACT[c] * 780}px`;
      const hue = c === "dispute" ? K.negBright : asserted(c) ? K.gAccent : flagged(c) ? K.warnBright : K.onG3;
      return { c, row, label, status, val, fill, band, tick, hue, at: T.bars + i * 0.1 };
    });
    const key = el("div", "bars-key", bars);
    const k1 = el("span", "key", key);
    el("span", "key-tick", k1);
    el("span", "", k1, "act line, per class");
    const k2 = el("span", "key", key);
    el("span", "key-band", k2);
    el("span", "", k2, `review band from ${REVIEW.toFixed(2)}`);

    /* 5. the decision */
    const decide = el("div", "layer", stage);
    const left = el("div", "col col-left", decide);
    const leftHead = el("div", "eyebrow col-eyebrow", left);
    set(el("span", "dotc", leftHead), { background: K.gAccent });
    el("span", "", leftHead, "act · plain code, closed list").style.color = K.gAccent;
    const effects = F.effects.map((e) => {
      const row = el("div", "effect", left);
      el("span", "action", row, e.action);
      const words = el("span", "effect-text", row);
      for (const part of e.summary.split(/(?<=,) /)) el("span", "", words, part);
      return row;
    });
    const ledger = el("div", "ledger", left);
    left.insertBefore(ledger, effects[1] ?? null);
    el("span", "ledger-open", ledger, `invoice ${INV.number}`);
    const ledgerTotal = el("span", "ledger-total", ledger, `${usd(INV.openBalance)} open`);
    const ledgerTrack = el("div", "ledger-track", ledger);
    const ledgerPaid = el("div", "ledger-paid", ledgerTrack);
    const ledgerA = el("span", "ledger-a", ledger, `${usd(LEDGER.paid)} recorded`);
    const ledgerB = el("span", "ledger-b", ledger, `${usd(LEDGER.left)} outstanding`);
    const right = el("div", "col col-right", decide);
    const rightHead = el("div", "eyebrow col-eyebrow", right);
    set(el("span", "dotc", rightHead), { background: K.negBright });
    el("span", "", rightHead, "escalate · a person owns it").style.color = K.negBright;
    const quote = el("div", "quote", right);
    for (const sentence of (F.handoffs[0] ?? "").split(/(?<=\.) /)) el("span", "", quote, sentence);
    const flag = el("div", "flag", right);
    const flagMain = el("span", "flag-main", flag, FLAGGED ? `${FLAGGED} · ${SCORE[FLAGGED].toFixed(2)}, needs ${ACT[FLAGGED].toFixed(2)}` : "");
    const flagSub = el("span", "flag-sub", flag, "flagged for you, not acted on");
    const divider = el("div", "divider", decide);
    const audit = el("div", "audit", decide);
    const auditHead = el("div", "eyebrow audit-head", audit, "audit log · every stage, in order");
    const AUDIT: [string, string][] = [
      ["extract", `${F.id} joined to invoice ${INV.number}`],
      ["classify", [...F.asserted, ...F.review].map((c) => `${c} ${SCORE[c as Cls].toFixed(2)}`).join(" · ")],
      ["decide", `${F.effects.map((e) => e.action).join(", ")}${F.handoffs.length ? " · escalate" : ""}`],
      ...F.effects.map((e): [string, string] => ["act", `${F.id}:${e.action} · once · done`]),
      ["escalate", `${F.handoffs.length} ${F.handoffs.length === 1 ? "note" : "notes"} to a person`],
    ];
    const auditRows = AUDIT.map(([stageName, line], i) => {
      const row = el("div", "audit-row", audit);
      row.style.top = `${40 + i * 30}px`;
      el("span", "audit-stage", row, stageName);
      return { row, text: el("span", "audit-text", row, ""), line, at: T.audit + i * 0.1 };
    });
    const sentLine = el("div", "sent", decide);
    const noReply = el("span", "", sentLine, "No reply is written.");
    const nothing = el("span", "", sentLine, "Nothing is sent.");

    /* 6. the run, per subset */
    const nums = el("div", "layer", stage);
    const numsHead = el("div", "eyebrow nums-head", nums,
      `${data.meta.replies} replies · scored per subset · no overall accuracy figure, on purpose`);
    const numsRule = el("div", "nums-rule", nums);
    const panel = (x: number, eyebrow: string, right: number, n: number, errors: number, caught: number) => {
      const p = el("div", "panel", nums);
      p.style.left = `${x}px`;
      const eb = el("div", "eyebrow panel-eyebrow", p, eyebrow);
      const big = el("div", "big", p);
      const bigN = el("span", "big-n", big, "0");
      el("span", "big-of", big, `of ${n}`);
      const cap = el("div", "big-cap", p, "primary class right");
      const err = el("div", "err", p);
      const errN = el("span", "err-n", err, `${caught} of ${errors}`);
      el("span", "err-label", err, "errors the gate sent to a person");
      return { p, eb, big, bigN, cap, err, errN, right };
    };
    const pOrd = panel(120, `ordinary replies · ${ORD.n}`, ORD.n - ORD.errors, ORD.n, ORD.errors, ORD.caught);
    const pHard = panel(1060, `hard replies, written to sit on a boundary · ${HARD.n}`, HARD.n - HARD.errors, HARD.n, HARD.errors, HARD.caught);
    set(pHard.errN, { color: K.gAccent });
    set(pOrd.errN, { color: K.negBright });
    const missRule = el("div", "miss-rule", pOrd.p);
    const uncaught = ORD.errors - ORD.caught;
    const miss = el("div", "miss", pOrd.p);
    el("span", "", miss, uncaught === 1 ? "The one ordinary miss went uncaught." : `${uncaught} ordinary misses went uncaught.`);
    el("span", "", miss, "Published, not rounded away.");
    const dots = DOTS.map((d) => {
      const node = el("div", "wdot", nums);
      node.style.left = `${d.x}px`;
      node.style.top = `${d.y}px`;
      const ringEl = d.kind === 1 ? el("div", "wring", node) : null;
      const dist = Math.hypot(d.x - HOME.x, d.y - HOME.y);
      return { ...d, node, ring: ringEl, dist, home: d === HOME, at: T.nums + 0.08 + (dist / 1000) * 0.42 };
    });
    const numsFoot = el("div", "nums-foot", nums);
    numsFoot.innerHTML = `<b>${PER_REPLY}</b> per reply · <b>${MEDIAN}</b> median machine time · figures: reckon/SCORECARD.md`;

    /* 7. the close */
    const lock = el("div", "layer lock", stage);
    // the wordmark arrives as two halves along a diagonal, the cleave in reverse
    const seamY = (x: number): number => LOCK.y + (x - 960) * Math.tan(LOCK.angle);
    const marks = ([1, -1] as const).map((side) => {
      const m = el("div", "lock-mark display", lock);
      const edge = side === 1 ? -600 : 1200;
      const clip = `polygon(-200px ${edge}px, 2120px ${edge}px, 2120px ${seamY(2120)}px, -200px ${seamY(-200)}px)`;
      return { m, side, clip, letters: [..."reckon"].map((ch) => el("span", "lock-ch", el("span", "lock-mask", m), ch)) };
    });
    const seam = el("div", "cut", lock);
    set(seam, { left: 520, top: 262 + seamY(520), width: 880, transform: `rotate(${(LOCK.angle * 180) / Math.PI}deg)` });
    const tagline = el("div", "lock-tag", lock, "reads what the debtor writes back");
    const url = el("div", "lock-url", lock, "reckon.visheshbaghel.com");
    const chain = spine(lock, 960, 820);
    const fine = el("div", "eyebrow lock-fine", lock,
      `self-built experiment on ${data.meta.replies} synthetic replies · no client data · figures: reckon/SCORECARD.md`);

    const flash = el("div", "layer flash", stage);
    const black = el("div", "layer black", stage);

    return (t) => {
      const hand = { x: noise(t * 0.5, 1) * 5, y: noise(t * 0.45, 2) * 4 };
      const quake = (at: number, amp: number) => (t > at ? Math.exp(-(t - at) * 9) * amp : 0);
      const shake = quake(T.land, 16) + quake(T.cut, 10) + quake(T.nums, 12);
      const sh = { x: hand.x + noise(t * 40, 8) * shake, y: hand.y + noise(t * 40, 9) * shake };

      /* backdrop */
      set(glowA, { transform: tf({ x: 420 + noise(t * 0.2, 4) * 160, y: 220 + noise(t * 0.17, 5) * 120 }), opacity: 0.55 });
      set(glowB, { transform: tf({ x: 1380 + noise(t * 0.18, 6) * 180, y: 640 + noise(t * 0.21, 7) * 120 }), opacity: 0.45 });
      // dust rides forward, faster while things are in flight
      const travel = t * 180 + 2200 * tw(t, 1.3, 3.6, E.inOutSine) + 1400 * tw(t, 3.45, 4.1, E.inOutCubic) + 900 * tw(t, 9.7, 10.4, E.inOutCubic);
      set(dustCam, { transform: `rotateY(${lerp(-8, 5, tw(t, 1.3, 4.4, E.inOutSine)).toFixed(2)}deg)` });
      const dustOn = 0.55 - 0.3 * tw(t, 4.2, 5.0) + 0.2 * tw(t, 9.8, 10.3) - 0.2 * tw(t, 12.8, 13.3);
      for (const m of motes) {
        const z = ((m.z0 + travel) % 3600) - 3200;
        const near = clamp((z + 3200) / 3000);
        set(m.node, { transform: tf({ x: m.x, y: m.y, z, s: m.s }), opacity: dustOn * near * (1 - clamp((z + 300) / 400)) });
      }

      /* ---------------------------------------------- 1. the reminder */
      const s1On = t < 2.9;
      set(s1, { visibility: s1On ? "visible" : "hidden" });
      if (s1On) {
        const a = spring(t - T.remind, 170, 15);
        const ant = tw(t, 0.8, T.launch, E.inOutCubic);
        const h = E.inCubic(prog(t, T.launch, T.star));
        const c0 = { x: 960, y: 446 };
        const near = 1 + 0.06 * tw(t, 0.1, T.launch, E.inOutSine);
        const px = lerp(c0.x, VP.x, h), py = lerp(c0.y, VP.y, h);
        set(remind, {
          opacity: tw(t, 0.02, 0.18) * (1 - prog(h, 0.55, 0.95)),
          transform: `translate(${(px - c0.x + sh.x).toFixed(2)}px,${(py - c0.y + sh.y).toFixed(2)}px) perspective(1400px) ` +
            `rotateX(${(22 * (1 - a) + 16 * ant).toFixed(2)}deg) rotate(${(-2 * (1 - a) - 1.5 * ant).toFixed(2)}deg) ` +
            `scale(${((0.9 + 0.1 * a) * near * (1 - 0.04 * ant) * 0.012 ** h).toFixed(4)})`,
          filter: h > 0 ? `blur(${(h * 10).toFixed(1)}px)` : "none",
        });
        set(remindBar, { transform: `scaleX(${tw(t, 0.1, 0.5, E.inOutCubic)})` });
        const rise = (at: number) => spring(t - at, 220, 18);
        set(remindEyebrow, { opacity: tw(t, 0.12, 0.3), transform: tf({ y: (1 - rise(0.12)) * 18 }) });
        set(remindCustomer, { opacity: tw(t, 0.16, 0.34), transform: tf({ y: (1 - rise(0.16)) * 28 }) });
        set(remindRule, { transform: `scaleX(${tw(t, 0.22, 0.55, E.inOutCubic)})` });
        stats.forEach((s, i) => {
          const at = 0.28 + i * 0.08;
          set(s.box, { opacity: tw(t, at, at + 0.15), transform: tf({ y: (1 - rise(at)) * 30 }) });
          text(s.value, s.fmt(s.to * tw(t, at, at + 0.42, E.outCubic)));
        });

        // the caption types, and holds its caret until the card is gone
        const typed = Math.round(SENT.length * prog(t, T.sent, T.sent + 0.36));
        text(sentText, SENT.slice(0, typed));
        const gone = tw(t, T.launch - 0.02, T.launch + 0.14, E.inCubic);
        set(sent, { opacity: tw(t, T.sent - 0.02, T.sent + 0.04) * (1 - gone), transform: tf({ x: -60 * gone + sh.x - (near - 1) * 430, y: sh.y + (near - 1) * 240 - 24 * gone }) });
        set(caret, { opacity: Math.floor(t * 4) % 2 === 0 || t < T.sent + 0.4 ? 1 : 0, transform: tf({ x: typed * 19.2 + 4 }) });

        // the streak: a head that races to the vanishing point, a tail that follows it in
        const tail = E.inOutCubic(prog(t, T.launch + 0.06, T.star + 0.14));
        const head = h;
        const len = Math.hypot(VP.x - c0.x, VP.y - c0.y);
        const ang = Math.atan2(VP.y - c0.y, VP.x - c0.x);
        set(streak, {
          left: c0.x + (VP.x - c0.x) * tail, top: c0.y + (VP.y - c0.y) * tail, width: Math.max(0, (head - tail) * len),
          transform: `rotate(${((ang * 180) / Math.PI).toFixed(3)}deg) scaleY(${(1 - 0.6 * tail).toFixed(3)})`,
          opacity: head > 0.02 && tail < 0.995 ? 1 : 0,
        });

        // the star: lit when the reminder arrives, flaring as the replies burst back out of it
        const lit = spring(t - T.star, 260, 12);
        const burst = tw(t, T.lands[0] - FLY_T - 0.04, T.lands[0] - FLY_T + 0.3, E.outCubic);
        const starOp = tw(t, T.star - 0.02, T.star + 0.04) * (1 - tw(t, 1.9, 2.6));
        const pulse = 1 + 0.08 * Math.sin((t - T.star) * 14) * (1 - burst);
        set(star, { transform: tf({ x: VP.x, y: VP.y, s: (0.25 + 0.75 * lit) * pulse + burst * 1.4 }), opacity: starOp * (1 - 0.5 * burst) });
        set(flareA, { transform: tf({ x: VP.x, y: VP.y, r: -8 + t * 6, sx: (0.2 + 0.8 * lit) * (1 + burst * 1.6), sy: 1 }), opacity: starOp * 0.9 });
        set(flareB, { transform: tf({ x: VP.x, y: VP.y, r: 82 + t * 6, sx: (0.1 + 0.4 * lit) * (1 + burst), sy: 1 }), opacity: starOp * 0.6 });

        // the headline, then pushed back into the depth the replies arrive through
        const rec = tw(t, 1.75, 2.6, E.inOutCubic);
        set(headline, {
          transform: tf({ x: sh.x, y: sh.y - rec * 30, s: 1 - 0.14 * rec }),
          opacity: 1 - rec, filter: rec > 0 ? `blur(${(rec * 9).toFixed(1)}px)` : "none",
        });
        headWords.forEach((w, i) => {
          const k = spring(t - T.headline - i * 0.055, 190, 17);
          set(w, { transform: tf({ y: (1 - k) * 120, r: (1 - k) * 6 }) });
        });
      }

      /* ---------------------------------------------- 2. the replies come back */
      const fieldOn = t > 1.3 && t < 4.7;
      set(field, { visibility: fieldOn ? "visible" : "hidden" });
      if (fieldOn) {
        const orbit = tw(t, 1.3, 4.4, E.inOutSine);
        const push = tw(t, T.land, T.land + 0.5, E.inCubic);
        // the camera orbits a point 500px into the scene, and dollies in as it goes
        const cam = `perspective(${PERSP}px) translate3d(${sh.x.toFixed(2)}px,${sh.y.toFixed(2)}px,${(lerp(-220, 160, orbit) + push * 500 - 500).toFixed(1)}px) ` +
          `rotateY(${lerp(-11, 7, orbit).toFixed(3)}deg) rotateX(${lerp(6, -3, orbit).toFixed(3)}deg) translateZ(500px) `;
        const recede = tw(t, T.feat - 0.05, T.land + 0.05, E.inOutCubic);
        const focus = -260;
        for (const r of replies) {
          const dt = t - r.launch;
          if (dt <= 0) {
            set(r.anchor, { opacity: 0 });
            continue;
          }
          const p = spring(dt, FLY.k, FLY.d);
          const z = lerp(FAR, r.rest.z, p) - 1100 * recede;
          const bob = noise(t * 0.7, 20 + r.rest.x) * 8;
          const x = lerp(FROM.x + r.jit.x, r.rest.x, p);
          const y = lerp(FROM.y + r.jit.y, r.rest.y, p) + bob * clamp(t - r.land);
          const blur = Math.min(16, Math.abs(z - focus) / 90) + 8 * recede;
          set(r.anchor, { transform: cam + tf({ x, y, z, rx: r.spin.rx * (1 - p), ry: r.spin.ry * (1 - p), r: lerp(r.spin.r, r.rest.r, p) }), opacity: 1 });
          const depth = String(Math.round(z + 6000));
          if (r.anchor.style.zIndex !== depth) r.anchor.style.zIndex = depth;
          set(r.card, {
            opacity: clamp(dt / 0.12) * (1 - 0.5 * recede) * (1 - tw(t, T.land + 0.1, T.land + 0.55)),
            filter: `blur(${blur.toFixed(1)}px) brightness(${(1 - 0.35 * recede).toFixed(3)})`,
          });
          // the thud: an edge of light the moment it lands
          const hit = t > r.land ? Math.exp(-(t - r.land) * 5) : 0;
          set(r.card, { boxShadow: `0 30px 80px oklch(8% .02 262 / .55), inset 0 0 0 ${(1 + 2 * hit).toFixed(2)}px ${cobalt(lerp(41, 72, hit), lerp(0.35, 1, hit))}, 0 0 ${(40 * hit).toFixed(1)}px ${cobalt(70, 0.5 * hit)}` });
          const tagK = tw(t, r.land + 0.1, r.land + 0.35);
          set(r.tags, { opacity: tagK, transform: tf({ y: (1 - tagK) * 10 }) });
        }
      }

      /* ---------------------------------------------- 3 to 5. the featured card */
      const readOn = t >= T.feat && t < T.nums + 0.5;
      set(read, { visibility: readOn ? "visible" : "hidden" });
      const split = t >= T.cut;
      if (readOn) {
        let pose: Pose;
        if (t < T.land) {
          const p = prog(t, T.feat, T.land);
          const u = 1 - p;
          pose = { ...shotPose(T.land), z: -5200 * u ** 1.35, rx: 58 * u ** 1.6, ry: -70 * u ** 1.6, rz: 16 * u ** 1.6 };
        } else {
          pose = shotPose(t);
          pose.s *= 1 - 0.035 * ring(t - T.land, 22, 8);
        }
        pose.x += sh.x;
        pose.y += sh.y;

        // after the cleave each half has a pose of its own
        let pa: Pose = pose, pb: Pose = pose;
        if (split) {
          const sep = spring(t - T.cut, 240, 13);
          const off = 44 * sep + 18 * tw(t, T.cut, T.decide);
          const base = { ...AT_SPLIT, x: AT_SPLIT.x + sh.x, y: AT_SPLIT.y + sh.y };
          const opened = (dir: number): Pose => ({ ...base, x: base.x + NORMAL.x * off * dir, y: base.y + NORMAL.y * off * dir, r: -3.5 * sep * dir });
          const go = spring(t - 7.8, 150, 16);
          const float = (seed: number): Pose => ({ x: noise(t * 0.7, seed) * 5, y: noise(t * 0.6, seed + 1) * 6, s: 0, r: noise(t * 0.5, seed + 2) * 0.6 });
          const fa = float(71), fb = float(81);
          pa = mix(opened(1), { ...DOCK.a, x: DOCK.a.x + fa.x, y: DOCK.a.y + fa.y, r: fa.r ?? 0 }, go);
          pb = mix(opened(-1), { ...DOCK.b, x: DOCK.b.x + fb.x, y: DOCK.b.y + fb.y, r: fb.r ?? 0 }, go);
          // the heal: both halves come home to one small card, then that card becomes one square of the run
          const heal = E.inOutCubic(prog(t, T.heal, T.nums));
          const whole: Pose = { x: 960, y: 520, s: 0.34 };
          pa = mix(pa, whole, heal);
          pb = mix(pb, whole, heal);
          if (t >= T.nums) {
            // a pull back about the square it becomes: constant zoom speed, so it reads as a camera
            const k = E.inOutCubic(prog(t, T.nums, T.nums + 0.4));
            const s0 = whole.s, s1 = 30 / CW;
            const s = s0 * (s1 / s0) ** k;
            const f = (s - s1) / (s0 - s1);
            const sq = tw(t, T.nums + 0.22, T.nums + 0.4, E.inOutCubic);
            pa = pb = { x: HOME.x + (whole.x - HOME.x) * f, y: HOME.y + (whole.y - HOME.y) * f, s, sy: lerp(1, CW / CH, sq) };
          }
        }
        set(halfA.half, { transform: poseTf(pa), opacity: t < T.land ? tw(t, T.feat, T.feat + 0.1) : 1 - prog(t, T.nums + 0.36, T.nums + 0.44) });
        set(halfB.half, { transform: poseTf(pb), opacity: split ? 1 - prog(t, T.nums + 0.36, T.nums + 0.44) : 0 });
        set(halfA.clip, { clipPath: split ? clipA : "none", filter: t < T.land ? `blur(${(6 * (1 - prog(t, T.feat, T.land))).toFixed(1)}px)` : "none" });
        set(halfB.clip, { clipPath: clipB });
        const drop = split ? 1 : 0.9;
        const shadow = `drop-shadow(0 ${(40 * drop).toFixed(0)}px 60px oklch(8% .02 262 / .6))`;
        set(halfA.half, { filter: shadow });
        set(halfB.half, { filter: shadow });

        // the read: highlighter sweeps, the figure boxed and resolved, then the tags
        for (const h of [halfA, halfB]) {
          for (const m of h.marks) {
            if (m.mark === "amount") continue;
            const [a0, a1] = MARKS[m.mark];
            const at = m.mark === "partial" ? T.hl[0] : T.hl[2];
            const sweep = tw(t, at, at + 0.36, E.inOutCubic) * (a1 - a0);
            const k = clamp((sweep - (m.from - a0)) / (m.to - m.from)) * 100;
            set(m.node, {
              background: k > 0
                ? `linear-gradient(90deg, ${MARK_INK[m.mark]} ${k.toFixed(2)}%, transparent ${Math.min(100, k + 0.5).toFixed(2)}%) 0 88% / 100% 64% no-repeat`
                : "none",
            });
          }
          if (h.chip) {
            const box = spring(t - T.hl[1], 320, 14);
            const on = t > T.hl[1] ? 1 : 0;
            set(h.chip, {
              background: on ? MARK_INK.amount : "transparent",
              boxShadow: on ? `inset 0 0 0 ${(3 * clamp(box)).toFixed(2)}px ${K.pos}` : "none",
              transform: tf({ s: 1 + 0.12 * (1 - box) * on }),
            });
          }
          for (const [m, tag] of Object.entries(h.tags) as [Mark, HTMLElement][]) {
            const at = (m === "partial" ? T.hl[0] : m === "amount" ? T.hl[1] : T.hl[2]) + 0.22;
            const k = spring(t - at, 260, 16);
            const out = tw(t, 7.05, 7.35);
            set(tag, { opacity: clamp(k * 3) * (1 - out), transform: tf({ x: (1 - k) * (m === "dispute" ? 30 : -30), s: 0.85 + 0.15 * k }) });
          }
          const edgeK = tw(t, T.cut, T.cut + 0.3);
          set(h.edge, { opacity: split ? edgeK * (1 - tw(t, T.heal, T.nums)) : 0 });
          set(h.tint, { opacity: tw(t, T.nums + 0.2, T.nums + 0.36), clipPath: `inset(0 round ${lerp(22, 260, tw(t, T.nums + 0.2, T.nums + 0.4)).toFixed(1)}px)` });
        }

        // the landing: an outline of the card, thrown off it
        const sk = prog(t, T.land, T.land + 0.3);
        const land = shotPose(T.land);
        const tl = onScreen(land, 0, 0);
        set(shock, {
          left: tl.x, top: tl.y, width: CW * land.s, height: CH * land.s,
          opacity: sk > 0 && sk < 1 ? 0.9 * (1 - sk) : 0, transform: tf({ s: 1 + 0.22 * E.outCubic(sk) }),
        });

        // the cut: a slash of light across the gap, drawn from the left edge
        const draw = tw(t, T.cut - 0.2, T.cut, E.inOutExpo);
        const cutFade = 1 - tw(t, T.cut + 0.02, T.cut + 0.35);
        const cp = { ...pose };
        if (split) Object.assign(cp, AT_SPLIT, { x: AT_SPLIT.x + sh.x, y: AT_SPLIT.y + sh.y });
        const p0 = onScreen(cp, -40, cutY(-40));
        set(cutLine, {
          left: p0.x, top: p0.y, width: (CUT_LEN + 80) * cp.s,
          transform: `rotate(${((CUT_ANGLE * 180) / Math.PI).toFixed(3)}deg) scaleX(${draw.toFixed(4)}) scaleY(${(1 + 1.5 * (1 - cutFade)).toFixed(3)})`,
          opacity: draw > 0 ? cutFade : 0,
        });
        for (const s of sparks) {
          const dt = t - T.cut;
          const k = dt / s.life;
          if (dt < 0 || k > 1) {
            set(s.node, { opacity: 0 });
            continue;
          }
          const origin = onScreen(AT_SPLIT, lerp(60, CW - 60, s.u), cutY(lerp(60, CW - 60, s.u)));
          const vx = NORMAL.x * s.v * s.side + Math.cos(CUT_ANGLE) * s.drift;
          const vy = NORMAL.y * s.v * s.side + Math.sin(CUT_ANGLE) * s.drift;
          const x = origin.x + vx * dt, y = origin.y + vy * dt + 700 * dt * dt;
          set(s.node, { opacity: 1 - k, transform: tf({ x, y, r: (Math.atan2(vy + 1400 * dt, vx) * 180) / Math.PI, sx: 1.4 - k }) });
        }
      }

      /* ---------------------------------------------- 4. the seven questions */
      const barsOn = t > T.pull && t < 7.6;
      set(bars, { visibility: barsOn ? "visible" : "hidden" });
      if (barsOn) {
        const bIn = tw(t, T.bars - 0.1, T.bars + 0.3);
        const bOut = tw(t, 6.95, 7.2);
        set(barsHead, { opacity: bIn * (1 - bOut), transform: tf({ x: (1 - bIn) * 60 + bOut * 200 }) });
        rows.forEach((r, i) => {
          const k = spring(t - r.at, 200, 18);
          const f = tw(t, r.at + 0.05, r.at + 0.55, E.outQuart);
          const out = tw(t, 6.98 + i * 0.03, 7.24 + i * 0.03, E.inCubic);
          const v = SCORE[r.c] * f;
          const verdict = asserted(r.c) ? tw(t, T.verdict, T.verdict + 0.2) : flagged(r.c) ? tw(t, T.flag, T.flag + 0.2) : 0;
          const quiet = !asserted(r.c) && !flagged(r.c) ? tw(t, T.verdict, T.verdict + 0.3) : 0;
          set(r.row, {
            opacity: clamp(k * 2) * (1 - out) * (1 - 0.45 * quiet),
            transform: tf({ x: (1 - k) * 90 + out * 260 + sh.x * 0.5, y: sh.y * 0.5 }),
            filter: out > 0 ? `blur(${(out * 10).toFixed(1)}px)` : "none",
          });
          text(r.val, v.toFixed(2));
          set(r.val, { color: verdict > 0.5 ? r.hue : K.onG });
          set(r.fill, {
            width: v * 780,
            background: verdict > 0 ? `color-mix(in srgb, ${r.hue} ${Math.round(verdict * 100)}%, ${NEUTRAL})` : NEUTRAL,
            boxShadow: verdict > 0 ? `0 0 ${(22 * verdict).toFixed(1)}px color-mix(in oklch, ${r.hue} 70%, transparent)` : "none",
          });
          set(r.status, { opacity: verdict, color: r.hue, transform: tf({ x: (1 - verdict) * -14 }) });
          set(r.band, { opacity: tw(t, r.at + 0.1, r.at + 0.4) });
          set(r.tick, { opacity: tw(t, r.at + 0.15, r.at + 0.35), transform: tf({ sy: 0.4 + 0.6 * spring(t - r.at - 0.15, 300, 14) }) });
        });
        const keyIn = tw(t, T.bars + 0.75, T.bars + 1.1);
        set(key, { opacity: keyIn * (1 - tw(t, 6.95, 7.15)), transform: tf({ y: (1 - keyIn) * 14 }) });
      }

      /* ---------------------------------------------- 5. the decision is code */
      const decOn = t > T.decide - 0.1 && t < T.nums;
      set(decide, { visibility: decOn ? "visible" : "hidden" });
      if (decOn) {
        const leave = tw(t, T.heal - 0.08, T.heal + 0.14, E.inCubic);
        const item = (node: HTMLElement, at: number, dx = 0) => {
          const k = spring(t - at, 210, 18);
          set(node, {
            opacity: clamp(k * 1.6) * (1 - leave),
            transform: tf({ x: (1 - k) * dx + sh.x * 0.6, y: (1 - k) * 36 + sh.y * 0.6 - leave * 30 }),
            filter: leave > 0 ? `blur(${(leave * 10).toFixed(1)}px)` : "none",
          });
        };
        item(leftHead, T.decide, -40);
        item(effects[0]!, T.decide + 0.08, -40);
        item(ledger, T.decide + 0.18, -40);
        if (effects[1]) item(effects[1], T.decide + 0.4, -40);
        item(rightHead, T.decide + 0.1, 40);
        item(quote, T.decide + 0.2, 40);
        item(flag, T.decide + 0.45, 40);
        set(divider, { transform: `scaleY(${tw(t, T.decide, T.decide + 0.5, E.inOutCubic)})`, opacity: 1 - leave });

        // the ledger: the open balance splits where the payment lands
        const pay = tw(t, T.decide + 0.35, T.decide + 0.8, E.inOutCubic);
        set(ledgerPaid, { width: 860 * (LEDGER.paid / INV.openBalance) * pay });
        set(ledgerA, { opacity: tw(t, T.decide + 0.6, T.decide + 0.8), transform: tf({ y: (1 - tw(t, T.decide + 0.6, T.decide + 0.9)) * 10 }) });
        set(ledgerB, { opacity: tw(t, T.decide + 0.7, T.decide + 0.9), transform: tf({ y: (1 - tw(t, T.decide + 0.7, T.decide + 1.0)) * 10 }) });
        set(ledgerTotal, { opacity: 1 - 0.4 * pay });
        set(flagMain, { color: K.warnBright });
        set(flagSub, { opacity: tw(t, T.decide + 0.55, T.decide + 0.8) });

        // the log ticks in like a log does
        set(auditHead, { opacity: tw(t, T.audit - 0.15, T.audit) * (1 - leave) });
        for (const r of auditRows) {
          const n = Math.round(r.line.length * prog(t, r.at, r.at + 0.12));
          text(r.text, r.line.slice(0, n));
          set(r.row, { opacity: (t >= r.at ? 1 : 0) * (1 - leave), transform: tf({ x: (1 - tw(t, r.at, r.at + 0.1)) * -12 }) });
        }
        const sIn = (at: number) => spring(t - at, 240, 17);
        set(noReply, { opacity: clamp(sIn(T.nothing) * 2) * (1 - leave), transform: tf({ y: (1 - sIn(T.nothing)) * 40 }) });
        set(nothing, { opacity: clamp(sIn(T.nothing + 0.125) * 2) * (1 - leave), transform: tf({ y: (1 - sIn(T.nothing + 0.125)) * 40 }) });
      }

      /* ---------------------------------------------- 6. the numbers, per subset */
      const numsOn = t >= T.nums;
      set(nums, { visibility: numsOn ? "visible" : "hidden" });
      if (numsOn) {
        const out = tw(t, 12.78, T.lock + 0.12, E.inCubic);
        // a slow push, leaning in on the miss when it lands
        const push = 1 + 0.02 * tw(t, T.nums, T.lock, E.linear) + 0.035 * tw(t, T.miss, T.miss + 1.1, E.inOutCubic);
        const P = { x: 420, y: 720 };
        const ns = push * (1 - 0.08 * out);
        set(nums, {
          transform: tf({ x: (P.x - 960) * (1 - push) + sh.x, y: (P.y - 540) * (1 - push) + sh.y, s: ns }),
          opacity: 1 - out, filter: out > 0 ? `blur(${(out * 14).toFixed(1)}px)` : "none",
        });
        const up = (node: HTMLElement, at: number, dy = 24) => {
          const k = tw(t, at, at + 0.4);
          set(node, { opacity: k, transform: tf({ y: (1 - k) * dy }) });
        };
        up(numsHead, T.nums + 0.15);
        set(numsRule, { transform: `scaleY(${tw(t, T.nums + 0.2, T.nums + 0.7, E.inOutCubic)})` });
        up(numsFoot, T.meta);
        const focusMiss = tw(t, T.miss, T.miss + 0.3) * (1 - tw(t, T.meta, T.meta + 0.4) * 0.6);
        for (const p of [pOrd, pHard]) {
          const k = tw(t, T.count, T.count + 0.7, E.outCubic);
          up(p.eb, T.nums + 0.2);
          up(p.big, T.count - 0.05, 40);
          text(p.bigN, String(Math.round(p.right * k)));
          up(p.cap, T.count + 0.3);
          const dim = p === pHard ? 1 - 0.45 * focusMiss : 1;
          set(p.p, { opacity: dim });
        }
        // the errors: the hard ones caught, one by one; the ordinary one not
        const cK = spring(t - T.caught, 220, 15);
        set(pHard.err, { opacity: clamp(cK * 2), transform: tf({ y: (1 - cK) * 30 }) });
        const mK = spring(t - T.miss, 260, 11);
        const mOn = t > T.miss ? 1 : 0;
        set(pOrd.err, { opacity: clamp(mK * 2) * mOn, transform: tf({ y: (1 - mK) * 30 }) });
        set(pOrd.errN, { transform: tf({ s: 1 + 0.12 * ring(t - T.miss, 20, 6) }), textShadow: `0 0 ${(40 * focusMiss).toFixed(1)}px oklch(70% .17 27 / .6)` });
        set(missRule, { width: 560, transform: `scaleX(${tw(t, T.miss + 0.15, T.miss + 0.5, E.inOutCubic)})` });
        const missK = tw(t, T.miss + 0.25, T.miss + 0.6);
        set(miss, { opacity: missK, transform: tf({ y: (1 - missK) * 16 }) });

        let caughtN = 0;
        const slotted = T.nums + 0.4;
        for (const d of dots) {
          const isHome = d.home;
          const pop = spring(t - d.at, 300, 19);
          const errK = d.kind === 0 ? 0 : tw(t, d.kind === 1 ? T.caught - 0.2 : T.miss - 0.2, d.kind === 1 ? T.caught : T.miss);
          const base = d.kind === 2 ? K.negBright : K.warnBright;
          let s = clamp(pop, 0, 1.3);
          // the card lands in its slot and the neighbours feel it
          const bump = d.dist > 0 ? ring(t - slotted - d.dist / 1800, 20, 8) * 16 * Math.exp(-d.dist / 420) : 0;
          const dir = { x: (d.x - HOME.x) / (d.dist || 1), y: (d.y - HOME.y) / (d.dist || 1) };
          let lift = 0;
          if (d.kind === 1) {
            const at = T.caught + 0.06 * caughtN++;
            const rk = spring(t - at, 260, 14);
            if (d.ring) set(d.ring, { opacity: clamp(rk * 2), transform: tf({ s: 1.6 - 0.6 * clamp(rk, 0, 1.2) }) });
            lift = -6 * clamp(rk);
          }
          if (d.kind === 2) {
            s *= 1 + 0.35 * ring(t - T.miss, 16, 4);
          }
          const empty = isHome && t < slotted;
          if (isHome) s = t < slotted ? s : 1 + 0.25 * ring(t - slotted, 18, 7);
          set(d.node, {
            transform: tf({ x: dir.x * bump, y: lift + dir.y * bump, s }),
            opacity: t < d.at ? 0 : 1,
            background: empty ? "transparent" : errK > 0 ? `color-mix(in oklch, ${base} ${Math.round(errK * 100)}%, ${K.gAccent})` : K.gAccent,
            boxShadow: empty ? `inset 0 0 0 2px ${cobalt(72, 0.7)}`
              : isHome ? `0 0 ${(26 * Math.exp(-(t - slotted) * 4)).toFixed(1)}px ${cobalt(75, 0.9)}`
              : d.kind === 2 && errK > 0 ? `0 0 ${(30 * focusMiss).toFixed(1)}px oklch(70% .17 27 / .9)` : "none",
          });
        }
      }

      /* ---------------------------------------------- 7. the close */
      set(lock, { visibility: t > T.lock - 0.05 ? "visible" : "hidden" });
      if (t > T.lock - 0.05) {
        const meet = T.lock + 0.5;
        const gap = 110 * (1 - E.inCubic(prog(t, T.lock + 0.02, meet))) - 5 * ring(t - meet, 26, 10);
        const n = { x: Math.sin(LOCK.angle), y: -Math.cos(LOCK.angle) };
        // once they have met, one whole copy, so no hairline survives along the seam
        const whole = t > meet + 0.3;
        for (const h of marks) {
          set(h.m, {
            transform: tf({ x: n.x * gap * h.side, y: n.y * gap * h.side }),
            clipPath: whole && h.side === 1 ? "none" : h.clip, opacity: whole && h.side === -1 ? 0 : 1,
          });
          h.letters.forEach((ch, i) => {
            const k = spring(t - T.lock - 0.1 - i * 0.05, 200, 17);
            set(ch, { transform: tf({ y: (1 - k) * 250, r: (1 - k) * 9 }) });
          });
        }
        // a weld of light where they meet, gone in a quarter second
        const sf = prog(t, meet, meet + 0.24);
        set(seam, { opacity: t >= meet ? 0.75 * (1 - E.outQuad(sf)) : 0, transform: `rotate(${(LOCK.angle * 180) / Math.PI}deg) scaleX(${(0.6 + 0.4 * E.outCubic(sf)).toFixed(3)}) scaleY(${(1 - 0.6 * sf).toFixed(3)})`, transformOrigin: "50% 50%" });
        const tagIn = tw(t, T.lock + 0.5, T.lock + 0.95);
        set(tagline, { opacity: tagIn, transform: tf({ y: (1 - tagIn) * 20 }) });
        const urlIn = tw(t, T.lock + 0.7, T.lock + 1.15);
        set(url, { opacity: urlIn, transform: tf({ y: (1 - urlIn) * 16 }) });
        chain(t, T.lock + 0.75);
        set(fine, { opacity: tw(t, T.lock + 1.05, T.lock + 1.55) });
        set(lock, { transform: tf({ s: 1 + tw(t, T.lock, T.end, E.linear) * 0.025 }) });
      }

      /* ---------------------------------------------- light */
      const fl = Math.max(
        t >= T.cut ? 0.55 * (1 - E.outQuad(prog(t, T.cut, T.cut + 0.22))) : 0,
        t >= T.nums ? 0.45 * (1 - E.outQuad(prog(t, T.nums, T.nums + 0.25))) : 0,
      );
      const at = t >= T.nums ? { x: HOME.x, y: HOME.y } : { x: 960, y: 540 };
      set(flash, { opacity: fl, background: `radial-gradient(circle at ${at.x}px ${at.y}px, ${cobalt(85, 0.9, 0.12)}, ${cobalt(60, 0.25)} 30%, transparent 65%)` });
      set(black, { opacity: 1 - tw(t, 0, 0.3, E.outQuad) });
    };
  },

  cues(): Cue[] {
    const c: Cue[] = [
      // A minor, i iv III V: the E lands under the cleave and resolves on the decision
      ...bed({
        from: 0, to: T.end, kickFrom: T.decide, hats: true, gain: 0.95,
        chords: [
          [45, 57, 60, 64, 71], [50, 57, 60, 65, 69], [48, 55, 59, 64, 67], [52, 56, 59, 62, 68],
          [45, 57, 60, 64, 71], [53, 57, 60, 64, 69], [52, 56, 59, 64, 68], [45, 57, 60, 64, 69],
        ],
      }),
      { t: 0, kind: "swell", dur: 0.25, gain: 0.08 },
      { t: 0.12, kind: "click", gain: 0.1 },
      { t: 0.14, kind: "pluck", note: 69, gain: 0.07, dur: 0.25 },
      { t: 0.28, kind: "tick", freq: 2200, gain: 0.1 },
      { t: 0.36, kind: "tick", freq: 2500, gain: 0.1 },
      { t: T.sent, kind: "type", dur: 0.36, gain: 0.12, rate: 60 },
      { t: 0.8, kind: "swell", dur: 0.2, gain: 0.12 },
      { t: T.launch - 0.04, kind: "whoosh", dur: 0.36, gain: 0.5, up: true, pan: [-0.2, 0.8] },
      { t: T.star, kind: "bell", note: 88, gain: 0.1, dur: 1.2, pan: 0.6 },
      { t: T.star + 0.08, kind: "riser", dur: T.lands[0] - T.star - 0.1, gain: 0.18 },
      // the replies: each one flies, each one lands
      ...T.lands.flatMap((l, i): Cue[] => [
        { t: l - FLY_T, kind: "whoosh", dur: FLY_T, gain: 0.07 + 0.02 * (i % 2), up: false, pan: [0.6, REST[i % REST.length]!.x / 900] },
        { t: l, kind: "stamp", gain: 0.2 },
        { t: l, kind: "click", gain: 0.18, pan: REST[i % REST.length]!.x / 900 },
        { t: l, kind: "pluck", note: [69, 72, 76, 74, 72, 76, 79, 81][i] ?? 76, gain: 0.05, dur: 0.3, pan: REST[i % REST.length]!.x / 900 },
      ]),
      // the featured reply, from far, onto the downbeat
      { t: T.feat, kind: "riser", dur: T.land - T.feat, gain: 0.3 },
      { t: T.feat + 0.05, kind: "whoosh", dur: 0.45, gain: 0.35, up: true, pan: [0, 0] },
      { t: T.land, kind: "impact", gain: 0.8 },
      { t: T.land + 0.02, kind: "stamp", gain: 0.5 },
      // the read: three marks
      { t: T.hl[0], kind: "whoosh", dur: 0.34, gain: 0.1, up: true, pan: [-0.5, 0.2] },
      { t: T.hl[0] + 0.22, kind: "pluck", note: 76, gain: 0.1, bright: 1.3 },
      { t: T.hl[1], kind: "click", gain: 0.3 },
      { t: T.hl[1], kind: "bell", note: 84, gain: 0.1, dur: 1.2 },
      { t: T.hl[2], kind: "whoosh", dur: 0.34, gain: 0.1, up: true, pan: [-0.2, 0.5] },
      { t: T.hl[2] + 0.22, kind: "pluck", note: 72, gain: 0.1, bright: 1.3 },
      { t: T.pull - 0.02, kind: "whoosh", dur: 0.5, gain: 0.16, up: false, pan: [0.3, -0.5] },
      // the seven bars, a rising run, then the two that act and the one that waits
      ...CLASSES.map((_, i): Cue => ({ t: T.bars + i * 0.1, kind: "tick", freq: 1700 + i * 260, gain: 0.1, pan: 0.4 })),
      { t: T.verdict, kind: "bell", note: 81, gain: 0.13 },
      { t: T.verdict, kind: "pluck", note: 76, gain: 0.1 },
      { t: T.flag, kind: "pluck", note: 68, gain: 0.1, dur: 0.5 },
      // the cleave
      { t: 6.95, kind: "whoosh", dur: 0.35, gain: 0.14, up: false, pan: [-0.2, 0.9] },
      { t: 6.9, kind: "riser", dur: T.cut - 6.9, gain: 0.3 },
      { t: T.cut - 0.2, kind: "whoosh", dur: 0.2, gain: 0.3, up: true, pan: [-0.8, 0.8] },
      { t: T.cut, kind: "impact", gain: 0.75 },
      { t: T.cut, kind: "glitch", dur: 0.12, gain: 0.05 },
      { t: T.cut + 0.3, kind: "whoosh", dur: 0.45, gain: 0.2, up: false, pan: [0.5, -0.5] },
      // the decision is code: a bell on the downbeat, the ledger, the log
      { t: T.decide, kind: "bell", note: 81, gain: 0.15, dur: 2.2 },
      { t: T.decide, kind: "bell", note: 76, gain: 0.09, dur: 2.2 },
      { t: T.decide + 0.35, kind: "pluck", note: 84, gain: 0.08 },
      { t: T.decide + 0.8, kind: "tick", freq: 3000, gain: 0.08 },
      { t: T.audit, kind: "type", dur: 0.7, gain: 0.1, rate: 40 },
      { t: T.nothing, kind: "pluck", note: 69, gain: 0.12, dur: 0.6 },
      { t: T.nothing + 0.125, kind: "pluck", note: 64, gain: 0.1, dur: 0.6 },
      // the run
      { t: T.heal, kind: "riser", dur: T.nums - T.heal, gain: 0.28 },
      { t: T.nums, kind: "impact", gain: 0.9 },
      { t: T.nums + 0.02, kind: "whoosh", dur: 0.6, gain: 0.2, up: false },
      { t: T.caught, kind: "bell", note: 81, gain: 0.1 },
      { t: T.miss, kind: "boom", gain: 0.55, pitch: 0.8 },
      { t: T.miss, kind: "bell", note: 63, gain: 0.12, dur: 1.6 },
      { t: T.meta, kind: "pluck", note: 72, gain: 0.08 },
      // the close
      // the close: the two halves of the wordmark meet on the beat
      { t: T.lock - 0.35, kind: "swell", dur: 0.35, gain: 0.16 },
      { t: T.lock, kind: "whoosh", dur: 0.3, gain: 0.18, up: false },
      { t: T.lock + 0.05, kind: "whoosh", dur: 0.45, gain: 0.26, up: true, pan: [-0.6, 0.6] },
      { t: T.lock + 0.5, kind: "boom", gain: 0.55 },
      { t: T.lock + 0.5, kind: "stamp", gain: 0.35 },
      { t: T.lock + 0.75, kind: "bell", note: 69, gain: 0.12, dur: 2.5 },
      { t: T.lock + 0.75, kind: "bell", note: 76, gain: 0.1, dur: 2.5 },
      { t: T.lock + 0.75, kind: "bell", note: 81, gain: 0.07, dur: 2.5 },
    ];
    // the counts tick up, and each caught error rings once
    for (let k = 0; k < 12; k++) c.push({ t: T.count + k * 0.05, kind: "tick", freq: 2400 + k * 70, gain: 0.045 });
    for (let k = 0; k < HARD.caught; k++) c.push({ t: T.caught + k * 0.06, kind: "pluck", note: [76, 79, 81, 84, 86, 88][k % 6]!, gain: 0.05, dur: 0.25, pan: 0.5 });
    return c;
  },
};
