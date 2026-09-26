/**
 * Sound design, synthesised from a cue list.
 *
 * No samples: every sound is oscillators, seeded noise and filters, rendered offline, so the audio
 * is as deterministic as the frames and a cue at 8.00s lands on frame 480 exactly. The player plays
 * the same rendered buffer the video is muxed with.
 */
import { rng } from "./engine.js";

/** A cue on the music bus is ducked under every impact, boom and stamp, the way a mixer would. */
type Bus = { bus?: "music" };

export type Cue = Bus & (
  | { t: number; kind: "boom"; gain?: number; pitch?: number }
  | { t: number; kind: "impact"; gain?: number }
  | { t: number; kind: "whoosh"; dur?: number; gain?: number; up?: boolean; pan?: [number, number] }
  | { t: number; kind: "riser"; dur: number; gain?: number }
  | { t: number; kind: "swell"; dur: number; gain?: number }
  | { t: number; kind: "tick"; freq?: number; gain?: number; pan?: number }
  | { t: number; kind: "click"; gain?: number; pan?: number }
  | { t: number; kind: "pluck"; note: number; gain?: number; dur?: number; pan?: number; bright?: number }
  | { t: number; kind: "bell"; note: number; gain?: number; dur?: number; pan?: number }
  | { t: number; kind: "pad"; notes: number[]; dur: number; gain?: number; cutoff?: number }
  | { t: number; kind: "sub"; note: number; dur: number; gain?: number }
  | { t: number; kind: "kick"; gain?: number }
  | { t: number; kind: "hat"; gain?: number; open?: boolean; pan?: number }
  | { t: number; kind: "type"; dur: number; gain?: number; rate?: number }
  | { t: number; kind: "stamp"; gain?: number }
  | { t: number; kind: "glitch"; dur: number; gain?: number }
);

const hz = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

export const SAMPLE_RATE = 48000;

export async function renderAudio(cues: readonly Cue[], duration: number): Promise<AudioBuffer> {
  const tail = 1.5;
  const ctx = new OfflineAudioContext(2, Math.ceil((duration + tail) * SAMPLE_RATE), SAMPLE_RATE);
  const random = rng(7);

  const noise = ctx.createBuffer(2, SAMPLE_RATE * 2, SAMPLE_RATE);
  for (let c = 0; c < 2; c++) {
    const d = noise.getChannelData(c);
    for (let i = 0; i < d.length; i++) d[i] = random() * 2 - 1;
  }

  // A plate-ish room: two seconds of decaying noise, darker as it fades.
  const ir = ctx.createBuffer(2, SAMPLE_RATE * 2.6, SAMPLE_RATE);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < d.length; i++) {
      const k = i / d.length;
      lp += (random() * 2 - 1 - lp) * (0.9 - 0.75 * k);
      d[i] = lp * (1 - k) ** 3.2;
    }
  }

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.knee.value = 8;
  comp.ratio.value = 3.5;
  comp.attack.value = 0.004;
  comp.release.value = 0.18;
  const master = ctx.createGain();
  master.gain.value = 1.15;
  // a brickwall after the glue compressor, so the makeup gain cannot clip
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -3.5;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.08;
  const fadeOut = ctx.createGain();
  fadeOut.gain.setValueAtTime(1, duration - 0.6);
  fadeOut.gain.linearRampToValueAtTime(0, duration + 0.02);
  comp.connect(master).connect(limiter).connect(fadeOut).connect(ctx.destination);

  const verb = ctx.createConvolver();
  verb.buffer = ir;
  const verbOut = ctx.createGain();
  verbOut.gain.value = 0.55;
  verb.connect(verbOut).connect(comp);

  // the music bus, pulled down under each hit and let back up over half a second
  const music = ctx.createGain();
  music.connect(comp);
  for (const c of cues) {
    if (c.kind !== "impact" && c.kind !== "boom" && c.kind !== "stamp") continue;
    const depth = c.kind === "impact" ? 0.3 : 0.55;
    music.gain.setTargetAtTime(depth, c.t, 0.004);
    music.gain.setTargetAtTime(1, c.t + 0.06, 0.18);
  }
  let target: AudioNode = comp;

  /** A voice's output: dry to its bus, a share to the room, optionally panned. */
  const out = (send = 0.15, pan = 0): AudioNode => {
    const g = ctx.createGain();
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    g.connect(p).connect(target);
    if (send > 0) {
      const s = ctx.createGain();
      s.gain.value = send;
      p.connect(s).connect(verb);
    }
    return g;
  };

  const noiseSrc = (t: number, dur: number): AudioBufferSourceNode => {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    src.start(t, random() * 1.5, dur + 0.05);
    return src;
  };

  const env = (g: GainNode, t: number, peak: number, attack: number, decay: number): void => {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  };

  const osc = (type: OscillatorType, t: number, dur: number, freq: number, detune = 0): OscillatorNode => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  };

  const filter = (type: BiquadFilterType, freq: number, q = 0.7): BiquadFilterNode => {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    return f;
  };

  const voices: Record<Cue["kind"], (c: never) => void> = {
    boom: (c: Extract<Cue, { kind: "boom" }>) => {
      const g0 = c.gain ?? 1, p = c.pitch ?? 1;
      const o = osc("sine", c.t, 2, 120 * p);
      o.frequency.setValueAtTime(120 * p, c.t);
      o.frequency.exponentialRampToValueAtTime(36 * p, c.t + 0.5);
      const g = ctx.createGain();
      env(g, c.t, 0.9 * g0, 0.004, 1.6);
      o.connect(g).connect(out(0.2));
      const n = noiseSrc(c.t, 0.25);
      const f = filter("lowpass", 900);
      const ng = ctx.createGain();
      env(ng, c.t, 0.35 * g0, 0.002, 0.2);
      n.connect(f).connect(ng).connect(out(0.3));
    },
    impact: (c: Extract<Cue, { kind: "impact" }>) => {
      const g0 = c.gain ?? 1;
      voices.boom({ t: c.t, kind: "boom", gain: g0 } as never);
      const n = noiseSrc(c.t, 0.6);
      const f = filter("highpass", 2400);
      const ng = ctx.createGain();
      env(ng, c.t, 0.22 * g0, 0.002, 0.5);
      n.connect(f).connect(ng).connect(out(0.6));
      const o = osc("triangle", c.t, 1.2, hz(38));
      const og = ctx.createGain();
      env(og, c.t, 0.25 * g0, 0.01, 1.1);
      o.connect(og).connect(out(0.3));
    },
    whoosh: (c: Extract<Cue, { kind: "whoosh" }>) => {
      const dur = c.dur ?? 0.45, g0 = c.gain ?? 0.5, up = c.up ?? true;
      const n = noiseSrc(c.t, dur);
      const f = filter("bandpass", up ? 300 : 3200, 1.1);
      f.frequency.setValueAtTime(up ? 300 : 3200, c.t);
      f.frequency.exponentialRampToValueAtTime(up ? 3600 : 260, c.t + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, c.t);
      g.gain.exponentialRampToValueAtTime(g0, c.t + dur * 0.72);
      g.gain.exponentialRampToValueAtTime(0.0001, c.t + dur);
      const p = ctx.createStereoPanner();
      const [a, b] = c.pan ?? [-0.5, 0.5];
      p.pan.setValueAtTime(a, c.t);
      p.pan.linearRampToValueAtTime(b, c.t + dur);
      n.connect(f).connect(g).connect(p);
      const o = out(0.35);
      p.connect(o);
    },
    riser: (c: Extract<Cue, { kind: "riser" }>) => {
      const g0 = c.gain ?? 0.35;
      const n = noiseSrc(c.t, c.dur);
      const f = filter("highpass", 300, 1.5);
      f.frequency.setValueAtTime(300, c.t);
      f.frequency.exponentialRampToValueAtTime(7000, c.t + c.dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, c.t);
      g.gain.exponentialRampToValueAtTime(g0, c.t + c.dur);
      g.gain.setValueAtTime(0.0001, c.t + c.dur + 0.01);
      n.connect(f).connect(g).connect(out(0.4));
      const o = osc("sawtooth", c.t, c.dur, hz(45));
      o.frequency.setValueAtTime(hz(45), c.t);
      o.frequency.exponentialRampToValueAtTime(hz(69), c.t + c.dur);
      const lp = filter("lowpass", 400, 4);
      lp.frequency.setValueAtTime(400, c.t);
      lp.frequency.exponentialRampToValueAtTime(5000, c.t + c.dur);
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.0001, c.t);
      og.gain.exponentialRampToValueAtTime(g0 * 0.25, c.t + c.dur);
      og.gain.setValueAtTime(0.0001, c.t + c.dur + 0.01);
      o.connect(lp).connect(og).connect(out(0.3));
    },
    swell: (c: Extract<Cue, { kind: "swell" }>) => {
      const g0 = c.gain ?? 0.3;
      const n = noiseSrc(c.t, c.dur);
      const f = filter("bandpass", 5000, 0.6);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, c.t);
      g.gain.exponentialRampToValueAtTime(g0, c.t + c.dur);
      g.gain.setValueAtTime(0.0001, c.t + c.dur + 0.005);
      n.connect(f).connect(g).connect(out(0.5));
    },
    tick: (c: Extract<Cue, { kind: "tick" }>) => {
      const o = osc("sine", c.t, 0.08, c.freq ?? 2400);
      const g = ctx.createGain();
      env(g, c.t, c.gain ?? 0.18, 0.001, 0.05);
      o.connect(g).connect(out(0.12, c.pan ?? 0));
    },
    click: (c: Extract<Cue, { kind: "click" }>) => {
      const n = noiseSrc(c.t, 0.03);
      const f = filter("highpass", 2800);
      const g = ctx.createGain();
      env(g, c.t, c.gain ?? 0.25, 0.0005, 0.012);
      n.connect(f).connect(g).connect(out(0.05, c.pan ?? 0));
    },
    pluck: (c: Extract<Cue, { kind: "pluck" }>) => {
      const dur = c.dur ?? 0.4, f0 = hz(c.note), bright = c.bright ?? 1;
      const lp = filter("lowpass", 3800 * bright, 3);
      lp.frequency.setValueAtTime(4200 * bright, c.t);
      lp.frequency.exponentialRampToValueAtTime(380, c.t + dur * 0.7);
      const g = ctx.createGain();
      env(g, c.t, c.gain ?? 0.16, 0.002, dur);
      for (const d of [-7, 7]) osc("sawtooth", c.t, dur, f0, d).connect(lp);
      lp.connect(g).connect(out(0.22, c.pan ?? 0));
    },
    bell: (c: Extract<Cue, { kind: "bell" }>) => {
      const dur = c.dur ?? 2.2, f0 = hz(c.note);
      const carrier = osc("sine", c.t, dur, f0);
      const mod = osc("sine", c.t, dur, f0 * 3.5);
      const depth = ctx.createGain();
      depth.gain.setValueAtTime(f0 * 2.2, c.t);
      depth.gain.exponentialRampToValueAtTime(f0 * 0.05, c.t + dur * 0.6);
      mod.connect(depth).connect(carrier.frequency);
      const g = ctx.createGain();
      env(g, c.t, c.gain ?? 0.14, 0.003, dur);
      carrier.connect(g).connect(out(0.45, c.pan ?? 0));
    },
    pad: (c: Extract<Cue, { kind: "pad" }>) => {
      const g0 = c.gain ?? 0.05;
      const lp = filter("lowpass", c.cutoff ?? 1100, 0.9);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, c.t);
      g.gain.linearRampToValueAtTime(g0, c.t + Math.min(0.9, c.dur * 0.4));
      g.gain.setValueAtTime(g0, c.t + c.dur - 0.5);
      g.gain.linearRampToValueAtTime(0.0001, c.t + c.dur + 0.6);
      for (const note of c.notes) for (const d of [-9, 0, 9]) osc("sawtooth", c.t, c.dur + 0.7, hz(note), d).connect(lp);
      lp.connect(g).connect(out(0.5));
    },
    sub: (c: Extract<Cue, { kind: "sub" }>) => {
      const g0 = c.gain ?? 0.3;
      const o = osc("sine", c.t, c.dur + 0.1, hz(c.note));
      const g = ctx.createGain();
      env(g, c.t, g0, 0.006, c.dur);
      // a little upper harmonic so the bass line survives small speakers
      const o2 = osc("triangle", c.t, c.dur + 0.1, hz(c.note + 12));
      const g2 = ctx.createGain();
      env(g2, c.t, g0 * 0.28, 0.004, c.dur * 0.6);
      const lp = filter("lowpass", 600);
      o.connect(g).connect(out(0));
      o2.connect(lp).connect(g2).connect(out(0.05));
    },
    kick: (c: Extract<Cue, { kind: "kick" }>) => {
      const o = osc("sine", c.t, 0.5, 150);
      o.frequency.setValueAtTime(160, c.t);
      o.frequency.exponentialRampToValueAtTime(46, c.t + 0.11);
      const g = ctx.createGain();
      env(g, c.t, c.gain ?? 0.55, 0.002, 0.38);
      o.connect(g).connect(out(0.04));
      voices.click({ t: c.t, kind: "click", gain: (c.gain ?? 0.55) * 0.3 } as never);
    },
    hat: (c: Extract<Cue, { kind: "hat" }>) => {
      const n = noiseSrc(c.t, 0.2);
      const f = filter("highpass", 7600);
      const g = ctx.createGain();
      env(g, c.t, c.gain ?? 0.05, 0.001, c.open ? 0.16 : 0.035);
      n.connect(f).connect(g).connect(out(0.08, c.pan ?? 0.15));
    },
    type: (c: Extract<Cue, { kind: "type" }>) => {
      const rate = c.rate ?? 22, g0 = c.gain ?? 0.14;
      let at = c.t;
      while (at < c.t + c.dur) {
        const n = noiseSrc(at, 0.04);
        const f = filter("bandpass", 1800 + random() * 2200, 2.5);
        const g = ctx.createGain();
        env(g, at, g0 * (0.6 + random() * 0.4), 0.0008, 0.018 + random() * 0.012);
        n.connect(f).connect(g).connect(out(0.06, random() * 0.4 - 0.2));
        at += (1 / rate) * (0.55 + random() * 0.9);
      }
    },
    stamp: (c: Extract<Cue, { kind: "stamp" }>) => {
      const g0 = c.gain ?? 0.6;
      const o = osc("sine", c.t, 0.4, 95);
      o.frequency.setValueAtTime(140, c.t);
      o.frequency.exponentialRampToValueAtTime(60, c.t + 0.09);
      const g = ctx.createGain();
      env(g, c.t, g0, 0.002, 0.26);
      o.connect(g).connect(out(0.2));
      const n = noiseSrc(c.t, 0.1);
      const f = filter("lowpass", 2200);
      const ng = ctx.createGain();
      env(ng, c.t, g0 * 0.6, 0.001, 0.07);
      n.connect(f).connect(ng).connect(out(0.25));
    },
    glitch: (c: Extract<Cue, { kind: "glitch" }>) => {
      const g0 = c.gain ?? 0.07;
      let at = c.t;
      while (at < c.t + c.dur) {
        const step = 0.02 + random() * 0.03;
        const o = osc("square", at, step, 200 + random() * 1800);
        const g = ctx.createGain();
        g.gain.setValueAtTime(random() > 0.35 ? g0 : 0, at);
        g.gain.setValueAtTime(0, at + step * 0.9);
        o.connect(g).connect(out(0.05, random() - 0.5));
        at += step;
      }
    },
  };

  for (const cue of cues) {
    target = cue.bus === "music" ? music : comp;
    voices[cue.kind](cue as never);
  }
  return ctx.startRendering();
}

/** 16-bit PCM WAV, for the muxer. */
export function toWav(buffer: AudioBuffer): ArrayBuffer {
  const channels = buffer.numberOfChannels, frames = buffer.length;
  const data = new DataView(new ArrayBuffer(44 + frames * channels * 2));
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) data.setUint8(o + i, s.charCodeAt(i)); };
  str(0, "RIFF"); data.setUint32(4, 36 + frames * channels * 2, true); str(8, "WAVE");
  str(12, "fmt "); data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, channels, true);
  data.setUint32(24, buffer.sampleRate, true); data.setUint32(28, buffer.sampleRate * channels * 2, true);
  data.setUint16(32, channels * 2, true); data.setUint16(34, 16, true);
  str(36, "data"); data.setUint32(40, frames * channels * 2, true);
  const chans = Array.from({ length: channels }, (_, c) => buffer.getChannelData(c));
  let o = 44;
  for (let i = 0; i < frames; i++) {
    for (const ch of chans) {
      const s = Math.max(-1, Math.min(1, ch[i] ?? 0));
      data.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      o += 2;
    }
  }
  return data.buffer;
}

/**
 * A music bed on a 120 BPM grid (a beat every 0.5s, a bar every 2s), so cuts that land on the
 * grid land on the music. `chords` holds one chord per bar, as MIDI notes, root first. Parts enter
 * at their own times, and `breaks` are rests for everything but the pad: a breath before a drop.
 */
export function bed(opts: {
  from: number; to: number; chords: number[][];
  subFrom?: number; kickFrom?: number; hats?: boolean; hatsFrom?: number;
  breaks?: [number, number][]; gain?: number;
}): Cue[] {
  const cues: Cue[] = [];
  const g = opts.gain ?? 1;
  const beat = 0.5;
  const resting = (t: number) => (opts.breaks ?? []).some(([a, b]) => t >= a - 1e-6 && t < b - 1e-6);
  const hatsFrom = opts.hatsFrom ?? (opts.hats ? opts.from : Infinity);
  const subFrom = opts.subFrom ?? opts.from;
  for (let bar = 0; opts.from + bar * 2 < opts.to; bar++) {
    const t0 = opts.from + bar * 2;
    const chord = opts.chords[bar % opts.chords.length] ?? [45];
    const root = chord[0] ?? 45;
    cues.push({ t: t0, kind: "pad", notes: chord.slice(1), dur: Math.min(2, opts.to - t0), gain: 0.03 * g, cutoff: 900 + bar * 140, bus: "music" });
    for (let b = 0; b < 4; b++) {
      const t = t0 + b * beat;
      if (t >= opts.to || resting(t)) continue;
      if (t >= subFrom) {
        cues.push({ t, kind: "sub", note: root - 12, dur: 0.34, gain: 0.13 * g, bus: "music" });
        if (b % 2 === 1) cues.push({ t: t + beat / 2, kind: "sub", note: root - 12, dur: 0.18, gain: 0.07 * g, bus: "music" });
      }
      if (opts.kickFrom !== undefined && t >= opts.kickFrom) cues.push({ t, kind: "kick", gain: 0.4 * g, bus: "music" });
      if (t >= hatsFrom) {
        cues.push({ t: t + beat / 2, kind: "hat", gain: 0.05 * g, open: b % 2 === 1, bus: "music" });
        cues.push({ t: t + beat / 4, kind: "hat", gain: 0.02 * g, pan: -0.2, bus: "music" });
        cues.push({ t: t + (3 * beat) / 4, kind: "hat", gain: 0.02 * g, pan: 0.25, bus: "music" });
      }
    }
  }
  return cues;
}
