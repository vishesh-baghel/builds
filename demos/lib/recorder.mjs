// Drives a live site in headless Chromium and captures a screencast plus a
// timeline of camera moves. compose.py turns the two into the final video.
//
// Coordinates are CSS pixels in a 1440x900 viewport. The page is captured at
// deviceScaleFactor 2, so frames are 2880x1800.
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const CURSOR_SVG = `<svg width="26" height="32" viewBox="0 0 26 32"><path d="M2 2 L2 25 L8 19.5 L12.5 29.5 L16.5 27.7 L12.2 18 L20 18 Z" fill="#111" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg>`;

// A visible cursor and a click ripple, since headless Chromium draws neither.
const installCursor = (svg) => {
  addEventListener('DOMContentLoaded', () => {
    const c = document.createElement('div');
    c.innerHTML = svg;
    Object.assign(c.style, { position: 'fixed', left: '0', top: '0', zIndex: 2147483647, pointerEvents: 'none', transform: 'translate(-100px,-100px)', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,.35))' });
    document.body.appendChild(c);
    addEventListener('mousemove', (e) => { c.style.transform = `translate(${e.clientX - 3}px,${e.clientY - 3}px)`; }, true);
    addEventListener('mousedown', (e) => {
      const r = document.createElement('div');
      Object.assign(r.style, { position: 'fixed', left: e.clientX - 18 + 'px', top: e.clientY - 18 + 'px', width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(37,99,235,.28)', zIndex: 2147483646, pointerEvents: 'none', transition: 'transform .45s ease-out, opacity .45s ease-out', transform: 'scale(.3)', opacity: '1' });
      document.body.appendChild(r);
      requestAnimationFrame(() => requestAnimationFrame(() => { r.style.transform = 'scale(1.4)'; r.style.opacity = '0'; }));
      setTimeout(() => r.remove(), 600);
    }, true);
  });
};

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * Opens `url`, starts the screencast, and hands back the helpers a demo
 * script uses. Call `finish()` at the end to write `<outDir>/timeline.json`.
 */
export const startRecording = async (url, outDir) => {
  const framesDir = path.join(outDir, 'frames');
  fs.rmSync(framesDir, { recursive: true, force: true });
  fs.mkdirSync(framesDir, { recursive: true });

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await ctx.addInitScript(installCursor, CURSOR_SVG);
  const p = await ctx.newPage();
  await p.goto(url, { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(800);

  const events = [];
  const now = () => Date.now() / 1000;
  /** Ease the camera to `zoom` centred on viewport point (x, y) over `dur` seconds. */
  const cam = (zoom, x, y, dur = 1.1) => events.push({ t: now(), type: 'cam', zoom, x, y, dur });
  const wait = (ms) => p.waitForTimeout(ms);

  let mx = 1100, my = 700;
  await p.mouse.move(mx, my);
  /**
   * Move the cursor to (x, y) along a slight arc, like a hand. Each step is a
   * browser round trip, so `stepMs` stays coarse enough that the glide keeps
   * to `ms`; raise it when every move makes the page re-render (dragging).
   */
  const glide = async (x, y, ms = 800, stepMs = 33) => {
    const sx = mx, sy = my, n = Math.max(8, Math.round(ms / stepMs)), t0 = Date.now();
    const ox = (y - sy) * 0.08, oy = -(x - sx) * 0.08;
    for (let i = 1; i <= n; i++) {
      const k = ease(i / n), arc = Math.sin(Math.PI * k);
      await p.mouse.move(sx + (x - sx) * k + ox * arc, sy + (y - sy) * k + oy * arc);
      const due = t0 + (ms * i) / n - Date.now();
      if (due > 0) await p.waitForTimeout(due);
    }
    mx = x; my = y;
  };
  const box = async (loc) => {
    const r = await loc.boundingBox();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, r };
  };
  const clickOn = async (loc, ms = 800, dx = 0) => {
    const c = await box(loc);
    await glide(c.x + dx, c.y, ms);
    await wait(120);
    await p.mouse.down();
    await wait(70);
    await p.mouse.up();
    return c;
  };
  /** Press on a range input's thumb and drag it through each fraction (0..1) in turn. */
  const drag = async (slider, stops, ms = 1800) => {
    const sb = await slider.boundingBox();
    const val = await slider.evaluate((e) => (e.value - e.min) / (e.max - e.min));
    const at = (f) => sb.x + 8 + (sb.width - 16) * f;
    const y = sb.y + sb.height / 2;
    await glide(at(val), y, 1000);
    await wait(250);
    await p.mouse.down();
    for (const f of stops) {
      await glide(at(f), y, ms, 80);
      await wait(500);
    }
    await p.mouse.up();
  };
  /** Smooth-scroll the page itself (a wheel over an inner scroller would move that instead). */
  const scrollBy = async (dy, ms = 900) => {
    await p.evaluate(([dy, ms]) => new Promise((done) => {
      const y0 = scrollY, t0 = performance.now();
      const e = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
      const step = (now) => {
        const k = Math.min(1, (now - t0) / ms);
        scrollTo(0, y0 + dy * e(k));
        if (k < 1) requestAnimationFrame(step); else done();
      };
      requestAnimationFrame(step);
    }), [dy, ms]);
  };

  const cdp = await ctx.newCDPSession(p);
  let fi = 0;
  const frames = [];
  cdp.on('Page.screencastFrame', async (f) => {
    const name = path.join(framesDir, `${String(fi++).padStart(5, '0')}.jpg`);
    fs.writeFileSync(name, Buffer.from(f.data, 'base64'));
    frames.push({ t: f.metadata.timestamp, name });
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 2880, maxHeight: 1800, everyNthFrame: 1 });
  const T0 = now();
  cam(1, 720, 450, 0);

  const finish = async () => {
    await cdp.send('Page.stopScreencast');
    await wait(300);
    fs.writeFileSync(path.join(outDir, 'timeline.json'), JSON.stringify({ T0, T1: now(), frames, events }, null, 1));
    console.log('frames', frames.length, 'duration', (now() - T0).toFixed(1) + 's');
    await browser.close();
  };

  return { p, cam, wait, glide, box, clickOn, drag, scrollBy, finish };
};
