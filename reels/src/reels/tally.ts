/**
 * tally, in fifteen seconds.
 *
 * One technician's note types itself out; the three pieces of work in it are read, and the one the
 * invoice never billed (an igniter, mentioned in passing) is put through Drex's four questions.
 * The line tally drafts flies into the invoice, the camera dives into its bullet and comes out as
 * one dot of 1,000, and the whole run reads outward from it until the found money is on screen.
 *
 * Every value is from `data/tally.json`, which `scripts/data.ts` computes from tally's committed run.
 */
import data from "../data/tally.json";
import { bed, type Cue } from "../audio.js";
import "./tally.css";
import {
  E, K, W, H, attr, clamp, cobalt, el, hash, lerp, money, mono, noise, prog, set, spine, spring, sv, text, tf, tw,
  type Glyph, type Reel,
} from "../engine.js";

const F = data.featured;
const IGNITER = F.items.find((it) => it.code === "IGNITER")!;
const BILLED = F.items.filter((it) => it.alreadyInvoiced);
/** Per order, in run order: [outcome, found cents, wrongly counted cents]. */
const GRID = data.grid as unknown as readonly (readonly [kind: 0 | 1 | 2 | 3, found: number, wrong: number])[];

/* The beat: 120 BPM, a beat every 0.5s. Every hard cut and hit lands on it. */
const T = {
  typeFrom: 0.3, typeTo: 2.25,
  scan: 2.4, billed: [2.55, 2.8] as const, found: 3.0,
  focus: 4.0, rows: [4.25, 4.45, 4.65, 4.85] as const, stamp: 5.5,
  whip: 5.72, land: 6.45, roll: 6.7, rolled: 7.3,
  dive: 7.45, cut: 8.0, readFrom: 8.35, readTo: 10.6,
  hero: 11.0, honest: 12.0, lock: 13.0, end: 15,
};

/* ------------------------------------------------------------------ note */

const NOTE = F.note.replace(/([;.]) /g, "$1\n"); // same length, so item start..end still index it
const SIZE = 50, ADV = SIZE * 0.6, LH = 80;
const NX = 160, NY = 350;
const MARGIN = 1560;

/** When each character is typed: an uneven hand, a beat of hesitation at each line end. */
const typedAt: number[] = (() => {
  const gaps: number[] = [];
  for (let i = 0; i < NOTE.length; i++) {
    const ch = NOTE[i]!;
    gaps.push((ch === "\n" ? 3.2 : ch === " " ? 1.35 : 1) * (0.55 + hash(i, 3) * 0.9));
  }
  const total = gaps.reduce((a, b) => a + b, 0);
  let acc = 0;
  return gaps.map((g) => {
    acc += g;
    return T.typeFrom + (acc / total) * (T.typeTo - T.typeFrom);
  });
})();

const lineOf = (index: number): number => NOTE.slice(0, index).split("\n").length - 1;

/** Where the cursor sits at time t: after the last character typed. */
function cursorAt(t: number): { x: number; y: number; line: number } {
  let last = -1;
  for (let i = 0; i < NOTE.length; i++) if (typedAt[i]! <= t && NOTE[i] !== "\n") last = i;
  if (last < 0) return { x: NX, y: NY, line: 0 };
  const line = lineOf(last);
  return { x: NX + (colOf(last) + 1) * ADV, y: NY + line * LH, line };
}

/** The follow camera's target: the cursor, averaged over the last half second so it glides. */
function followAt(t: number): { x: number; y: number } {
  let x = 0, y = 0;
  const n = 8;
  for (let k = 0; k < n; k++) {
    const c = cursorAt(t - (k / n) * 0.5);
    x += Math.min(1150, Math.max(720, c.x));
    y += c.y + SIZE / 2;
  }
  return { x: x / n, y: y / n };
}
const colOf = (index: number): number => index - (NOTE.lastIndexOf("\n", index - 1) + 1);

/* ------------------------------------------------------------------ grid */

const COLS = 40, CELL = 26, DOT = 16;
const GX = 780, GY = 250;
const ORIGIN = data.featuredIndex;
const ORIGIN_COL = ORIGIN % COLS, ORIGIN_ROW = Math.floor(ORIGIN / COLS);
const cellX = (i: number): number => GX + (i % COLS) * CELL;
const cellY = (i: number): number => GY + Math.floor(i / COLS) * CELL;

/** When each order is read: a ripple outward from the featured order, with a little grain in it. */
const readAt: number[] = GRID.map((_, i) => {
  const d = Math.hypot((i % COLS) - ORIGIN_COL, Math.floor(i / COLS) - ORIGIN_ROW);
  const far = Math.hypot(COLS - 1 - ORIGIN_COL, 24 - ORIGIN_ROW);
  return T.readFrom + (d / far) ** 0.85 * (T.readTo - T.readFrom - 0.12) + hash(i, 9) * 0.12;
});
const byTime = GRID.map((g, i) => ({ at: readAt[i]!, kind: g[0], found: g[1], wrong: g[2] })).sort((a, b) => a.at - b.at);
const running = (() => {
  let found = 0, wrong = 0;
  const counts = [0, 0, 0, 0];
  return byTime.map((r) => {
    found += r.found;
    wrong += r.wrong;
    counts[r.kind]!++;
    return { at: r.at, found, wrong, counts: [...counts] };
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

const DOT_COLOR = [K.onG3, K.gAccent, K.warnBright, K.negBright];

/* ------------------------------------------------------------------ hero */

const BAR = { x: 130, y: 742, w: 1660, h: 22 };
const FOUND_SHARE = data.full.foundCents / data.full.plantedCents;
const pct1 = (x: number): string => `${(x * 100).toFixed(1)}%`;

export const tally: Reel = {
  id: "tally",
  title: "tally",
  duration: T.end,
  poster: 12.4,
  fast: [[T.whip - 0.1, T.whip + 0.55], [T.dive + 0.2, T.cut + 0.5], [T.hero - 0.1, T.hero + 0.6], [T.lock, T.lock + 0.7]],

  build(stage) {
    stage.classList.add("tally");

    /* backdrop: graphite, two slow cobalt glows, and engineering-paper dots that ride the camera */
    const bg = el("div", "layer", stage);
    set(bg, { background: `radial-gradient(ellipse 60% 55% at 50% 45%, ${K.g2}, ${K.gDeep})` });
    const glowA = el("div", "glow", bg);
    const glowB = el("div", "glow", bg);
    const paper = el("div", "paper-dots", bg);

    /* world camera: the note at x 0, the invoice at x 1920 */
    const world = el("div", "world", stage);
    const noteScene = el("div", "note-scene", world);
    const eyebrow = el("div", "eyebrow note-eyebrow", noteScene, `${F.id} · ${F.technician} · ${F.equipment}`);

    const lines = NOTE.split("\n").map((_, i) => {
      const line = el("div", "note-line", noteScene);
      line.style.top = `${NY + i * LH}px`;
      return line;
    });
    const glyphLayer = lines.map((line) => el("div", "glyph-row", line));
    const glyphs: Glyph[] = [];
    {
      const all = mono(el("div", ""), NOTE, SIZE, LH);
      for (const g of all) {
        g.span.style.top = "0px";
        g.span.style.left = `${NX + g.col * ADV}px`;
        g.span.style.fontSize = `${SIZE}px`;
        glyphLayer[g.line]!.appendChild(g.span);
        glyphs.push(g);
      }
    }
    const cursor = el("div", "cursor", noteScene);

    /* each work item: an underline or a bracket, a dotted leader and a tag in the margin */
    const items = F.items.map((it) => {
      const li = lineOf(it.start);
      const x0 = NX + colOf(it.start) * ADV, x1 = NX + colOf(it.end) * ADV;
      const found = it === IGNITER;
      const line = lines[li]!;
      const mark = el("div", found ? "bracket" : "underline", line);
      set(mark, found
        ? { left: x0 - 14, top: -12, width: x1 - x0 + 28, height: SIZE + 22 }
        : { left: x0, top: SIZE + 8, width: x1 - x0, height: 3 });
      const leader = el("div", found ? "leader hot" : "leader", line);
      set(leader, { left: x1 + 22, top: SIZE / 2, width: MARGIN - x1 - 42 });
      const tag = el("div", `tag ${found ? "tag-found" : ""}`, line);
      tag.style.left = `${MARGIN}px`;
      el("span", "tag-dot", tag);
      el("span", "tag-status", tag, found ? "not on the invoice" : "on the invoice");
      el("span", "tag-code", tag, it.code ?? "");
      return { it, li, mark, leader, tag, found, at: found ? T.found : T.billed[BILLED.indexOf(it)] ?? T.found };
    });
    const ignLine = items.find((x) => x.found)!.li;

    /* Drex's four questions, and the stamp */
    const checks = el("div", "checks", noteScene);
    const checksHead = el("div", "eyebrow checks-head", checks, "drex · four questions, one request");
    const th = data.thresholds;
    const ROWS = [
      { label: "verdict", value: "done, not billed", num: IGNITER.verdict.missed_billable, fmt: (v: number) => v.toFixed(2), line: null, caption: "" },
      { label: "covered by the agreement?", value: "no", num: IGNITER.covered, fmt: (v: number) => v.toFixed(2), line: th.covered, caption: `line ${th.covered.toFixed(2)}` },
      { label: "bills anything not done?", value: "no", num: IGNITER.unsupported, fmt: (v: number) => v.toFixed(2), line: th.unsupported, caption: `guardrail ${th.unsupported.toFixed(2)}` },
      { label: "how plainly it happened", value: "strong", num: IGNITER.evidence / 4, fmt: (v: number) => `${(v * 4).toFixed(1)} of 4`, line: th.evidence / 4, caption: `needs ${th.evidence.toFixed(1)}` },
    ];
    const V = IGNITER.verdict;
    const SEGS = [V.invoiced, V.missed_billable, V.covered, V.not_billable];
    const rows = ROWS.map((r, i) => {
      const row = el("div", "check", checks);
      row.style.top = `${60 + i * 108}px`;
      el("span", "check-label", row, r.label);
      const value = el("span", "check-value", row);
      const word = el("span", "check-word", value, r.value);
      const numEl = el("span", "check-num", value);
      const track = el("div", "check-track", row);
      const fills = i === 0
        ? SEGS.map((_, s) => el("div", `check-fill ${s === 1 ? "hot" : "cool"}`, track))
        : [el("div", `check-fill ${i === 3 ? "hot" : "cool"}`, track)];
      let tick: HTMLElement | null = null;
      if (r.line !== null) {
        tick = el("div", "check-tick", track);
        tick.style.left = `${r.line * 1290}px`;
        el("span", "check-caption", tick, r.caption);
      }
      return { ...r, row, word, numEl, track, fills, tick };
    });
    const stamp = el("div", "stamp", noteScene);
    el("span", "stamp-main", stamp, "add to invoice");
    el("span", "stamp-sub", stamp, `+ ${money(IGNITER.priceCents, true)}`);
    const shock = el("div", "shock", noteScene);

    /* the invoice, 1920 to the right */
    const card = el("div", "invoice", world);
    el("div", "eyebrow inv-eyebrow", card, `invoice · ${F.id}`);
    el("div", "inv-customer", card, F.customer);
    el("div", "inv-meta", card, `${F.technician} · ${F.equipment}`);
    el("div", "inv-rule", card);
    F.invoice.forEach((line, i) => {
      const row = el("div", "inv-row", card);
      row.style.top = `${INV_TOP + i * ROW_H}px`;
      el("div", "inv-desc", row, line.description);
      el("div", "inv-code", row, `${line.code} · ${line.quantity} × ${money(line.cents / line.quantity, true)}`);
      el("div", "inv-amount", row, money(line.cents, true));
    });
    const added = el("div", "inv-row inv-added", card);
    added.style.top = `${INV_TOP + F.invoice.length * ROW_H}px`;
    const bullet = el("div", "inv-bullet", added);
    el("div", "inv-desc", added, IGNITER.description ?? "");
    el("div", "inv-code", added, `IGNITER · 1 × ${money(IGNITER.priceCents, true)}`);
    el("div", "inv-amount", added, money(IGNITER.priceCents, true));
    el("div", "eyebrow inv-drafted", added, "drafted, not sent");
    const totalRow = el("div", "inv-total", card);
    el("div", "inv-total-label", totalRow, "Total");
    const before = F.invoice.reduce((s, l) => s + l.cents, 0) / 100;
    const after = before + IGNITER.priceCents / 100;
    const odo = odometer(el("div", "inv-total-amount", totalRow), after);

    /* the flying line */
    const pill = el("div", "pill", world);
    el("span", "pill-desc", pill, IGNITER.description ?? "");
    el("span", "pill-amount", pill, money(IGNITER.priceCents, true));

    /* the 1,000 orders */
    const gridScene = el("div", "layer grid-scene", stage);
    const gridCam = el("div", "grid-cam", gridScene);
    const wave = sv("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}` }, gridCam);
    wave.classList.add("wave");
    const ring = sv("circle", { cx: cellX(ORIGIN) + DOT / 2, cy: cellY(ORIGIN) + DOT / 2, r: 0, fill: "none", "stroke-width": 2 }, wave);
    const dots = GRID.map((_, i) => {
      const d = el("div", "dot", gridCam);
      d.style.left = `${cellX(i)}px`;
      d.style.top = `${cellY(i)}px`;
      return d;
    });
    const panel = el("div", "panel", gridScene);
    el("div", "eyebrow panel-eyebrow", panel, "orders read");
    const readNum = el("div", "panel-read", panel, "0");
    el("div", "eyebrow panel-eyebrow found-eyebrow", panel, "unbilled work found");
    const legend = el("div", "legend", panel);
    const LEGEND: [number, string][] = [[1, "add to invoice"], [2, "your call"], [3, "blocked"], [0, "nothing to add"]];
    const legendRows = LEGEND.map(([kind, label]) => {
      const row = el("div", "legend-row", legend);
      const sw = el("span", "legend-swatch", row);
      set(sw, { background: DOT_COLOR[kind]! });
      el("span", "legend-label", row, label);
      return { kind, n: el("span", "legend-n", row, "0") };
    });

    /* the number, shared by the grid panel and the hero */
    const hero = el("div", "layer hero", stage);
    const foundNum = el("div", "hero-num", hero, "$0");
    const heroEyebrow = el("div", "eyebrow hero-eyebrow", hero, "unbilled work found in 1,000 technicians' notes");
    const ofLine = el("div", "hero-of", hero, `of ${money(data.full.plantedCents)} planted`);
    const pctNum = el("div", "hero-pct", hero, pct1(FOUND_SHARE));
    const track = el("div", "hero-track", hero);
    const fill = el("div", "hero-fill", track);
    const honest = el("div", "hero-honest", hero);
    el("span", "honest-dot", honest);
    el("span", "", honest, `${money(data.full.wronglyCountedCents)} counted that should not have been, across ${data.full.wronglyCounted} items`);
    const heroSource = el("div", "eyebrow hero-source", hero, "tally/SCORECARD.md · all 1,000 orders");

    /* the close */
    const lock = el("div", "layer lock", stage);
    const halo = el("div", "lock-halo", lock);
    const underline = el("div", "lock-underline", stage);
    const mark = el("div", "lock-mark display", lock);
    const markLetters = [..."tally"].map((ch) => el("span", "lock-ch", el("span", "lock-mask", mark), ch));
    const tagline = el("div", "lock-tag", lock, "unbilled work, found in technicians' notes");
    const url = el("div", "lock-url", lock, "tally.visheshbaghel.com");
    const chain = spine(lock, 960, 850);
    const fine = el("div", "eyebrow lock-fine", lock,
      "self-built experiment on 1,000 generated work orders · no client data · figures: tally/SCORECARD.md");

    const flash = el("div", "layer flash", stage);
    const black = el("div", "layer black", stage);

    return (t) => {
      const hand = { x: noise(t * 0.55, 1) * 5, y: noise(t * 0.5, 2) * 4, r: noise(t * 0.4, 3) * 0.12 };

      /* backdrop */
      set(glowA, { transform: tf({ x: 380 + noise(t * 0.2, 4) * 160, y: 180 + noise(t * 0.17, 5) * 120 }), opacity: 0.55 });
      set(glowB, { transform: tf({ x: 1280 + noise(t * 0.18, 6) * 180, y: 620 + noise(t * 0.21, 7) * 120 }), opacity: 0.4 + 0.25 * tw(t, T.hero, T.hero + 0.6) });

      /* ---------------------------------------------- world camera */
      const whip = tw(t, T.whip, T.whip + 0.42, E.inOutExpo);
      const dip = Math.sin(Math.PI * prog(t, T.whip - 0.05, T.whip + 0.5));
      const panX = -1920 * whip + hand.x, panY = hand.y;
      const push = whip < 1 ? 1 + 0.05 * tw(t, 0, T.focus, E.inOutSine) - 0.03 * tw(t, T.focus, T.focus + 0.8) : 1;
      // scale about the frame centre: screen = (world + pan - C) * s + C
      // after the whip, a slow push into the invoice that the dive then accelerates
      const lean = 1 + 0.12 * tw(t, T.whip + 0.45, T.dive, E.inOutSine);
      let camS = (1 - 0.1 * dip) * push * lean;
      let camX = (panX - 960) * camS + 960, camY = (panY - 540) * camS + 540;

      // the dive: the drafted line's bullet grows to fill the frame, and the cut hides in its colour
      const bx = 1920 + CARD.x + 39, by = CARD.y + INV_TOP + F.invoice.length * ROW_H + 36;
      const dive = prog(t, T.dive, T.cut);
      if (dive > 0) {
        const s = camS * Math.exp(Math.log(150 / camS) * E.inExpo(dive));
        const k = E.inOutCubic(prog(t, T.dive, T.cut - 0.1));
        const sx = lerp((bx + panX - 960) * camS + 960, 960, k), sy = lerp((by + panY - 540) * camS + 540, 540, k);
        camX = sx - bx * s;
        camY = sy - by * s;
        camS = s;
      }
      set(world, { transform: `translate(${camX.toFixed(2)}px,${camY.toFixed(2)}px) scale(${camS.toFixed(4)})`, visibility: t < T.cut ? "visible" : "hidden" });
      set(paper, { backgroundPosition: `${(panX * 0.35).toFixed(1)}px ${(panY * 0.35).toFixed(1)}px`, opacity: t < T.cut ? 0.5 : 0.18 });

      /* ---------------------------------------------- the note */
      const settle = tw(t, 0, 4.2, E.inOutCubic);
      const flat = tw(t, T.focus, T.focus + 0.7);
      // while it is being written the camera rides the cursor, close; then it pulls back to read
      const f = followAt(t);
      const S = 1.38, OX = 960, OY = 486;
      const release = tw(t, T.typeTo - 0.15, T.scan + 0.45, E.inOutCubic);
      const fx = (1100 - ((f.x - OX) * S + OX)) * (1 - release);
      const fy = (560 - ((f.y - OY) * S + OY)) * (1 - release);
      const fs = lerp(S, 1, release);
      set(noteScene, { transform: `perspective(2200px) ${tf({ x: fx, y: fy, s: fs, rx: lerp(16, 5, settle) * (1 - flat), r: lerp(-2.4, -0.8, settle) * (1 - flat) + hand.r, z: lerp(-120, 0, settle) })}` });
      set(eyebrow, { opacity: tw(t, 0.1, 0.5) * (1 - tw(t, T.focus, T.focus + 0.3)), transform: tf({ y: (1 - tw(t, 0.1, 0.6)) * 14 }) });

      const dim = tw(t, T.scan, T.found + 0.2, E.inOutCubic);
      for (const g of glyphs) {
        const at = typedAt[g.i]!;
        const k = prog(t, at, at + 0.06);
        const heat = 1 - prog(t, at + 0.05, at + 0.45);
        const inItem = F.items.some((it) => g.i >= it.start && g.i < it.end);
        const isFound = g.i >= IGNITER.start && g.i < IGNITER.end;
        const tone = isFound ? lerp(1, 1, dim) : inItem ? lerp(1, 0.72, dim) : lerp(1, 0.3, dim);
        set(g.span, {
          opacity: k * tone,
          transform: tf({ y: (1 - E.outCubic(prog(t, at, at + 0.14))) * 10 }),
          color: isFound && t > T.found
            ? `color-mix(in oklch, ${K.gAccent} ${Math.round(100 * tw(t, T.found, T.found + 0.3))}%, ${K.onG})`
            : `color-mix(in oklch, ${K.gAccent} ${Math.round(heat * 100)}%, ${K.onG})`,
        });
      }
      // cursor rides the last typed glyph and blinks while it waits
      const cur = cursorAt(t);
      const blink = t < T.typeFrom || t > T.typeTo ? (Math.floor(t * 3.2) % 2 === 0 ? 1 : 0) : 1;
      set(cursor, { transform: tf({ x: cur.x + 4, y: cur.y - 5 }), opacity: blink * (1 - tw(t, T.scan, T.scan + 0.15)) });

      // the read head and the marks
      for (const x of items) {
        const k = tw(t, x.at, x.at + 0.45);
        const lead = tw(t, x.at + 0.05, x.at + 0.4, E.inOutCubic);
        const tagIn = spring(t - x.at - 0.12, 220, 16);
        if (x.found) {
          const draw = tw(t, x.at, x.at + 0.5, E.inOutCubic);
          set(x.mark, { opacity: k, clipPath: `inset(0 ${(1 - draw) * 100}% 0 0 round 10px)`, boxShadow: `0 0 ${34 * k}px ${cobalt(70, 0.45 * k)}, inset 0 0 0 2px ${cobalt(72, 0.95)}` });
        } else {
          set(x.mark, { opacity: 0.9, transform: `scaleX(${k})` });
        }
        set(x.leader, { transform: `scaleX(${lead})`, opacity: lead > 0 ? 1 : 0 });
        set(x.tag, { opacity: clamp(tagIn * 1.4), transform: tf({ x: (1 - tagIn) * 40, y: -8 }) });
      }

      // focus: the found line rises, everything else falls away
      const away = tw(t, T.focus - 0.05, T.focus + 0.22, E.inQuad);
      const rise = spring(t - T.focus, 150, 17);
      lines.forEach((line, i) => {
        if (i === ignLine) {
          set(line, { transform: tf({ y: (280 - (NY + i * LH)) * rise }) });
        } else {
          set(line, { opacity: 1 - away, filter: away > 0 ? `blur(${(away * 14).toFixed(1)}px)` : "none", transform: tf({ y: (i < ignLine ? -90 : 60) * away, s: 1 - 0.08 * away }) });
        }
      });

      set(checks, { opacity: t > T.focus ? 1 : 0 });
      set(checksHead, { opacity: tw(t, T.rows[0] - 0.1, T.rows[0] + 0.3), transform: tf({ y: (1 - tw(t, T.rows[0] - 0.1, T.rows[0] + 0.4)) * 16 }) });
      rows.forEach((r, i) => {
        const at = T.rows[i]!;
        const k = tw(t, at, at + 0.4);
        const f = tw(t, at + 0.1, at + 0.6, E.outQuart);
        set(r.row, { opacity: k, transform: tf({ y: (1 - k) * 30 }) });
        if (i === 0) {
          let x = 0;
          r.fills.forEach((fl, s) => {
            const w = SEGS[s]! * 1290 * f;
            set(fl, { left: x, width: Math.max(0, w - 4) });
            x += w;
          });
        } else {
          set(r.fills[0]!, { left: 0, width: r.num * 1290 * f });
        }
        text(r.numEl, r.fmt(r.num * f));
        set(r.word, { opacity: tw(t, at + 0.45, at + 0.6) });
        if (r.tick) set(r.tick, { opacity: tw(t, at + 0.2, at + 0.4) });
      });

      // stamp: anticipation, slam, settle
      const pre = prog(t, T.stamp - 0.16, T.stamp);
      const post = t - T.stamp;
      const slam = pre < 1 ? lerp(2.6, 1, E.inCubic(pre)) : 1 + (1 - spring(post, 400, 18)) * -0.08;
      set(stamp, {
        opacity: t < T.stamp - 0.16 ? 0 : clamp(pre * 2) * (1 - tw(t, T.whip - 0.1, T.whip + 0.05)),
        transform: tf({ x: STAMP.x, y: STAMP.y, r: -7 + (1 - clamp(pre)) * 6, s: slam }),
        filter: pre < 1 ? `blur(${((1 - pre) * 6).toFixed(1)}px)` : "none",
      });
      const sh = prog(t, T.stamp, T.stamp + 0.5);
      set(shock, { opacity: sh > 0 && sh < 1 ? (1 - sh) * 0.8 : 0, transform: tf({ x: STAMP.x + 190, y: STAMP.y + 60, s: 0.3 + E.outCubic(sh) * 3.6 }) });

      /* ---------------------------------------------- the invoice */
      const cardIn = tw(t, T.whip + 0.1, T.whip + 0.9);
      set(card, { transform: `perspective(1800px) ${tf({ x: CARD.x + 1920, y: CARD.y, ry: lerp(-24, 0, cardIn), z: lerp(-260, 0, cardIn) })}`, opacity: t > T.whip ? 1 : 0 });
      const insert = spring(t - T.land, 260, 20);
      set(added, { opacity: clamp((t - T.land) / 0.08), transform: tf({ x: (1 - insert) * -24 }) });
      set(totalRow, { transform: tf({ y: INV_TOP + F.invoice.length * ROW_H + 24 + ROW_H * clamp(insert, 0, 1.2) }) });
      const glowRow = 1 - tw(t, T.land + 0.1, T.land + 1.2);
      set(added, { boxShadow: `0 0 0 ${1 + 3 * glowRow}px ${cobalt(60, 0.25 + 0.5 * glowRow)}` });
      odo(lerp(before, after, tw(t, T.roll, T.rolled, E.inOutCubic)));
      set(bullet, { transform: tf({ s: 1 + 0.15 * Math.sin(Math.max(0, t - T.rolled) * 8) * (1 - prog(t, T.rolled, T.dive)) }) });

      // the line itself, from stamp to slot, on an arc
      const fly = prog(t, T.whip - 0.12, T.land);
      const fe = E.inOutCubic(fly);
      const px = lerp(STAMP.x - 200, 1920 + CARD.x + 24, fe);
      const py = lerp(STAMP.y + 20, CARD.y + INV_TOP + F.invoice.length * ROW_H + 6, fe) - Math.sin(Math.PI * fe) * 160;
      set(pill, {
        opacity: fly > 0 && t < T.land + 0.08 ? 1 - prog(t, T.land, T.land + 0.08) : 0,
        // it lifts toward the lens mid-flight, then sets down into its row
        transform: tf({ x: px, y: py, r: Math.sin(Math.PI * fe) * -5, s: lerp(0.8, 1, E.outCubic(prog(fly, 0, 0.3))) * (1 + 0.28 * Math.sin(Math.PI * fe)) }),
      });

      /* ---------------------------------------------- flash across the cut */
      const fl = t < T.cut ? prog(t, T.cut - 0.12, T.cut - 0.02) : 1 - prog(t, T.cut + 0.02, T.cut + 0.22);
      set(flash, { opacity: fl, background: K.gAccent });

      /* ---------------------------------------------- the grid */
      const gOn = t >= T.cut;
      set(gridScene, { visibility: gOn ? "visible" : "hidden" });
      if (gOn) {
        const pull = prog(t, T.cut, T.cut + 0.95);
        const s = Math.exp(Math.log(150) * (1 - E.outExpo(pull)));
        const ox = cellX(ORIGIN) + DOT / 2, oy = cellY(ORIGIN) + DOT / 2;
        const k = E.inOutCubic(prog(t, T.cut + 0.05, T.cut + 0.9));
        const sx = lerp(960, ox, k), sy = lerp(540, oy, k);
        const heroK = tw(t, T.hero - 0.25, T.hero, E.inCubic);
        set(gridCam, { transform: `translate(${(sx - ox * s).toFixed(2)}px,${(sy - oy * s).toFixed(2)}px) scale(${s.toFixed(4)})` });

        const n = readBy(t);
        const now = running[n - 1];
        const ringR = Math.max(0, (t - T.readFrom) / (T.readTo - T.readFrom)) ** (1 / 0.85) * Math.hypot(COLS * CELL, 25 * CELL);
        attr(ring, "r", ringR);
        attr(ring, "stroke", cobalt(72, 0.5 * (1 - prog(t, T.readTo - 0.4, T.readTo + 0.2))));
        set(wave as unknown as HTMLElement, { opacity: t > T.readFrom ? 1 : 0 });

        for (let i = 0; i < dots.length; i++) {
          const g = GRID[i]!;
          const at = readAt[i]!;
          const d = dots[i]!;
          const read = t >= at;
          const pop = read ? spring(t - at, 320, 13) : 0;
          const isOrigin = i === ORIGIN;
          let x = 0, y = 0, sc = read || isOrigin ? 0.2 + 0.8 * pop : 0.5, op = read || isOrigin ? 1 : 0.42;
          if (isOrigin) sc = 1;
          const color = read || isOrigin ? DOT_COLOR[g[0]]! : K.onG3;
          if ((read || isOrigin) && g[0] === 0) op = 0.5;

          // the hero: counted orders pour into the bar, the rest let go
          if (t > T.hero - 0.25) {
            const gather = 1 - 0.16 * heroK * (1 - prog(t, T.hero, T.hero + 0.08));
            sc *= gather;
            x += (cellX(i) + DOT / 2 - 1300) * (gather - 1);
            y += (cellY(i) + DOT / 2 - 575) * (gather - 1);
            if (g[0] === 1) {
              const tx = BAR.x + 6 + hash(i, 21) * (BAR.w * FOUND_SHARE - 12);
              const ty = BAR.y + 3 + hash(i, 22) * (BAR.h - 14);
              const delay = T.hero + ((tx - BAR.x) / (BAR.w * FOUND_SHARE)) * 0.26 + hash(i, 23) * 0.05;
              const f = prog(t, delay, delay + 0.32);
              x = lerp(x, tx - cellX(i), E.inOutCubic(f));
              y = lerp(y, ty - cellY(i), E.inCubic(f));
              sc = lerp(sc, 0.55, f);
              op = f >= 1 ? 1 - prog(t, delay + 0.32, delay + 0.45) : op;
            } else if (t > T.hero) {
              const f = prog(t, T.hero + hash(i, 25) * 0.15, T.hero + 0.4 + hash(i, 25) * 0.15);
              y += E.inQuad(f) * 420;
              op *= 1 - f;
            }
          }
          if (!read && !isOrigin && t > T.hero) op = 0;
          set(d, { transform: tf({ x, y, s: sc }), opacity: op, background: color });
          // the match cut: the invoice's round bullet becomes this order's square as the camera pulls out
          if (isOrigin) set(d, { borderRadius: `${lerp(8, 4, tw(t, T.cut + 0.15, T.cut + 0.7)).toFixed(2)}px` });
        }

        // the panel
        const panelIn = tw(t, T.cut + 0.5, T.cut + 1.0);
        const panelOut = tw(t, T.hero - 0.2, T.hero + 0.1, E.inCubic);
        set(panel, { opacity: panelIn * (1 - panelOut), transform: tf({ x: (1 - panelIn) * -60 - panelOut * 60 }) });
        text(readNum, (n).toLocaleString("en-US"));
        legendRows.forEach((r) => text(r.n, (now?.counts[r.kind] ?? 0).toLocaleString("en-US")));
      }

      /* ---------------------------------------------- the number: panel size, then hero size */
      const nNow = gOn ? readBy(t) : 0;
      const foundNow = nNow > 0 ? running[nNow - 1]!.found : 0;
      text(foundNum, money(foundNow));
      const grow = tw(t, T.hero + 0.08, T.hero + 0.5, E.snap);
      const small = { x: 124, y: 520, s: 104 / 240 };
      const big = { x: 118, y: 300, s: 1 };
      const numIn = tw(t, T.cut + 0.6, T.cut + 1.1);
      const lockOut = tw(t, T.lock, T.lock + 0.4, E.inCubic);
      const punch = 1 + 0.06 * (1 - spring(t - T.hero - 0.3, 260, 12)) * (t > T.hero + 0.3 ? 1 : 0);
      set(foundNum, {
        opacity: numIn * (1 - lockOut),
        transform: tf({ x: lerp(small.x, big.x, grow), y: lerp(small.y, big.y, grow) - lockOut * 80, s: lerp(small.s, big.s, grow) * punch }),
        filter: lockOut > 0 ? `blur(${(lockOut * 12).toFixed(1)}px)` : "none",
        color: grow > 0.5 ? K.onG : K.gAccent,
      });
      const heroIn = (a: number) => tw(t, a, a + 0.5);
      const heroOut = (1 - lockOut);
      set(heroEyebrow, { opacity: heroIn(T.hero + 0.15) * heroOut, transform: tf({ y: (1 - heroIn(T.hero + 0.15)) * 20 - lockOut * 80 }) });
      set(ofLine, { opacity: heroIn(T.hero + 0.45) * heroOut, transform: tf({ y: (1 - heroIn(T.hero + 0.45)) * 24 - lockOut * 80 }) });
      set(pctNum, { opacity: heroIn(T.hero + 0.55) * heroOut, transform: tf({ y: (1 - heroIn(T.hero + 0.55)) * 24 - lockOut * 80 }) });
      const fillK = tw(t, T.hero + 0.05, T.hero + 0.62, E.inOutCubic);
      set(track, { opacity: tw(t, T.hero - 0.1, T.hero + 0.2) * heroOut, transform: tf({ y: -lockOut * 80 }) });
      set(fill, { width: BAR.w * FOUND_SHARE * fillK, opacity: t < T.lock ? 1 : 0 });
      // the found bar does not leave: it becomes the wordmark's underline
      const u = tw(t, T.lock, T.lock + 0.7, E.inOutCubic);
      const uw = lerp(BAR.w * FOUND_SHARE, 520, u);
      set(underline, {
        opacity: t < T.lock ? 0 : 1,
        width: uw, height: lerp(BAR.h, 12, u),
        transform: tf({ x: lerp(BAR.x, 960 - 260, u), y: lerp(BAR.y, 606, u) + Math.sin(Math.PI * u) * -40 }),
      });
      set(honest, { opacity: heroIn(T.honest) * heroOut, transform: tf({ y: (1 - heroIn(T.honest)) * 24 - lockOut * 80 }) });
      set(heroSource, { opacity: heroIn(T.honest + 0.3) * heroOut, transform: tf({ y: -lockOut * 80 }) });

      /* ---------------------------------------------- the close */
      set(lock, { visibility: t > T.lock ? "visible" : "hidden" });
      markLetters.forEach((ch, i) => {
        const k = spring(t - T.lock - 0.32 - i * 0.055, 200, 17);
        set(ch, { transform: tf({ y: (1 - k) * 380, r: (1 - k) * 8 }) });
      });
      const tagIn = tw(t, T.lock + 0.55, T.lock + 1.0);
      set(tagline, { opacity: tagIn, transform: tf({ y: (1 - tagIn) * 20 }) });
      const urlIn = tw(t, T.lock + 0.75, T.lock + 1.2);
      set(url, { opacity: urlIn, transform: tf({ y: (1 - urlIn) * 16 }) });
      chain(t, T.lock + 0.8);
      set(fine, { opacity: tw(t, T.lock + 1.1, T.lock + 1.6) });
      const pulse = spring(t - T.lock - 1.0, 60, 9);
      set(halo, { opacity: 0.9 * tw(t, T.lock + 0.2, T.lock + 0.9) * (1 - 0.35 * tw(t, T.lock + 1.4, T.end)), transform: tf({ s: 0.7 + 0.3 * pulse }) });
      const drift = tw(t, T.lock, T.end, E.linear);
      set(lock, { transform: tf({ s: 1 + drift * 0.025 }) });

      set(black, { opacity: 1 - tw(t, 0, 0.35, E.outQuad) });
    };
  },

  cues(): Cue[] {
    const c: Cue[] = [
      ...bed({
        from: 0, to: T.end, subFrom: T.scan + 0.1, hatsFrom: T.focus, kickFrom: T.cut,
        breaks: [[T.dive, T.cut], [T.hero - 0.5, T.hero], [T.lock, T.end]],
        chords: [[50, 57, 60, 64, 65], [46, 58, 62, 65, 69], [53, 57, 60, 65, 69], [48, 55, 60, 64, 67]],
      }),
      { t: 0, kind: "swell", dur: 0.3, gain: 0.08 },
      { t: T.typeFrom, kind: "type", dur: T.typeTo - T.typeFrom, gain: 0.16, rate: 70 },
      { t: T.scan, kind: "whoosh", dur: 0.5, gain: 0.12, up: true },
      { t: T.billed[0], kind: "pluck", note: 69, gain: 0.1 },
      { t: T.billed[1], kind: "pluck", note: 72, gain: 0.1 },
      { t: T.found, kind: "bell", note: 81, gain: 0.16 },
      { t: T.found, kind: "pluck", note: 76, gain: 0.14, bright: 1.4 },
      { t: T.focus - 0.05, kind: "whoosh", dur: 0.4, gain: 0.18, up: false },
      ...T.rows.map((r, i): Cue => ({ t: r, kind: "tick", freq: 1800 + i * 300, gain: 0.14 })),
      ...T.rows.map((r, i): Cue => ({ t: r + 0.1, kind: "pluck", note: 64 + [0, 3, 7, 12][i]!, gain: 0.07, dur: 0.3 })),
      { t: T.stamp - 0.35, kind: "swell", dur: 0.35, gain: 0.18 },
      { t: T.stamp, kind: "stamp", gain: 0.75 },
      { t: T.whip - 0.05, kind: "whoosh", dur: 0.42, gain: 0.5, up: true, pan: [0.7, -0.7] },
      { t: T.land, kind: "click", gain: 0.35 },
      { t: T.land, kind: "pluck", note: 74, gain: 0.14 },
      { t: T.rolled, kind: "bell", note: 86, gain: 0.14 },
      { t: T.rolled, kind: "bell", note: 81, gain: 0.08 },
      { t: T.dive, kind: "riser", dur: T.cut - T.dive, gain: 0.3 },
      { t: T.cut, kind: "impact", gain: 0.9 },
      { t: T.cut + 0.02, kind: "whoosh", dur: 0.7, gain: 0.25, up: false },
      { t: T.hero - 0.8, kind: "riser", dur: 0.8, gain: 0.26 },
      { t: T.hero, kind: "impact", gain: 1 },
      { t: T.hero + 0.35, kind: "bell", note: 86, gain: 0.16 },
      { t: T.hero + 0.35, kind: "bell", note: 79, gain: 0.1 },
      { t: T.honest, kind: "pluck", note: 62, gain: 0.12, dur: 0.6 },
      { t: T.lock - 0.4, kind: "swell", dur: 0.4, gain: 0.16 },
      { t: T.lock, kind: "whoosh", dur: 0.5, gain: 0.22, up: false },
      { t: T.lock + 0.2, kind: "boom", gain: 0.5 },
      { t: T.lock + 1.0, kind: "bell", note: 74, gain: 0.12, dur: 2.5 },
      { t: T.lock + 1.0, kind: "bell", note: 81, gain: 0.1, dur: 2.5 },
      { t: T.lock + 1.0, kind: "bell", note: 86, gain: 0.07, dur: 2.5 },
    ];
    // the odometer ticks as the total rolls
    for (let k = 0; k < 14; k++) c.push({ t: T.roll + k * 0.043, kind: "tick", freq: 2600 + k * 60, gain: 0.05 });
    // the read: a pentatonic scatter that thickens as the wave widens
    const scale = [62, 64, 67, 69, 72, 74, 76, 79, 81, 84];
    for (let k = 0; k < 44; k++) {
      const u = k / 44;
      const at = T.readFrom + u ** 0.8 * (T.readTo - T.readFrom);
      c.push({ t: at, kind: "pluck", note: scale[Math.floor(hash(k, 31) * scale.length)]!, gain: 0.04 + u * 0.05, dur: 0.25, pan: hash(k, 32) * 1.4 - 0.7, bright: 0.7 + u });
    }
    return c;
  },
};

/* ------------------------------------------------------------------ parts */

const CARD = { x: 560, y: 170 };
const STAMP = { x: 1490, y: 590 };
const INV_TOP = 236, ROW_H = 84;

/** A mechanical odometer: each column rolls only when the one to its right rolls over. */
function odometer(parent: HTMLElement, max: number): (v: number) => void {
  const places = String(Math.floor(max)).length;
  const cols: HTMLElement[] = [];
  el("span", "odo-sym", parent, "$");
  for (let p = places - 1; p >= 0; p--) {
    if (p === 2 && places > 3) el("span", "odo-sym", parent, ",");
    const col = el("span", "odo-col", parent);
    const strip = el("span", "odo-strip", col);
    for (let d = 0; d <= 10; d++) el("span", "odo-digit", strip, String(d % 10));
    col.dataset.place = String(p);
    cols.push(strip);
  }
  el("span", "odo-sym", parent, ".00");
  return (v) => {
    cols.forEach((strip, idx) => {
      const p = places - 1 - idx;
      const unit = 10 ** p;
      const d = Math.floor(v / unit) % 10;
      const rem = v % unit;
      const frac = p === 0 ? v % 1 : clamp(rem - (unit - 1));
      set(strip, { transform: tf({ y: -(d + frac) * 56 }) });
    });
  };
}

