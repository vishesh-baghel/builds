"""Composite a recording into the demo video.

Puts each captured frame in a rounded window on a blue wallpaper, applies the
camera moves from timeline.json (eased zoom and pan, with motion blur while
moving), and writes two files:

  <outDir>/<name>-master.mp4   1920x1080, 30fps, crf 18
  <outDir>/<name>-demo.mp4     1280x720, 20fps, crf 24: the web encode the
                               portfolio serves from public/demos/

Usage: python3 demos/lib/compose.py <outDir> <name>
"""
import bisect
import json
import math
import os
import subprocess
import sys
from multiprocessing import Pool

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

W, H = 3840, 2160
OW, OH = 1920, 1080
FPS = 30
PX, PY, PW, PH = 480, 180, 2880, 1800  # where the 2x page frame sits on the canvas
R = 26

OUT_DIR, NAME = sys.argv[1], sys.argv[2]
d = json.load(open(os.path.join(OUT_DIR, 'timeline.json')))
T0 = d['T0']
frames = [(f['t'] - T0, f['name']) for f in d['frames']]
ft = [f[0] for f in frames]
events = [e for e in d['events'] if e['type'] == 'cam']
DUR = d['T1'] - T0


def wallpaper():
    y, x = np.mgrid[0:H // 4, 0:W // 4].astype(np.float32)
    x /= W / 4
    y /= H / 4
    w1 = np.sin(x * 3.1 + y * 1.7 + 0.6) * 0.5 + 0.5
    w2 = np.sin(x * 1.3 - y * 3.9 + 2.0) * 0.5 + 0.5
    t = np.clip(0.55 * w1 + 0.45 * w2 * (1 - y * 0.4), 0, 1)[..., None]
    deep = np.array([12, 38, 110])
    mid = np.array([38, 110, 220])
    lite = np.array([150, 205, 245])
    c = np.where(t < 0.55, deep + (mid - deep) * (t / 0.55), mid + (lite - mid) * ((t - 0.55) / 0.45))
    return Image.fromarray(c.astype(np.uint8)).filter(ImageFilter.GaussianBlur(18)).resize((W, H), Image.BICUBIC)


bg = wallpaper()
sh = Image.new('L', (W, H), 0)
ImageDraw.Draw(sh).rounded_rectangle((PX, PY + 24, PX + PW, PY + PH + 24), R, fill=150)
sh = sh.filter(ImageFilter.GaussianBlur(40))
bg = Image.composite(Image.new('RGB', (W, H), (5, 12, 35)), bg, sh)
mask = Image.new('L', (PW, PH), 0)
ImageDraw.Draw(mask).rounded_rectangle((0, 0, PW - 1, PH - 1), R, fill=255)


def e3(u):
    return 4 * u ** 3 if u < .5 else 1 - (-2 * u + 2) ** 3 / 2


def camera(t):
    z, x, y = 1.0, W / 2, H / 2
    for e in events:
        et = e['t'] - T0
        if et > t:
            break
        tz, tx, ty = e['zoom'], PX + 2 * e['x'], PY + 2 * e['y']
        u = 1.0 if e['dur'] == 0 else min(1, (t - et) / e['dur'])
        k = e3(u)
        z = math.exp(math.log(z) + (math.log(tz) - math.log(z)) * k)
        x = x + (tx - x) * k
        y = y + (ty - y) * k
    return z, x, y


cache = {}


def canvas(t):
    i = max(0, bisect.bisect_right(ft, t) - 1)
    if i in cache:
        return cache[i]
    frame = Image.open(frames[i][1]).convert('RGB')
    if frame.size != (PW, PH):
        frame = frame.resize((PW, PH))
    c = bg.copy()
    c.paste(frame, (PX, PY), mask)
    cache.clear()
    cache[i] = c
    return c


def view(t):
    z, x, y = camera(t)
    if t < 0.7:
        z *= 1 + 0.05 * (1 - e3(t / 0.7))
    cw, ch = W / z, H / z
    x = min(max(x, cw / 2), W - cw / 2)
    y = min(max(y, ch / 2), H - ch / 2)
    return (x - cw / 2, y - ch / 2, x + cw / 2, y + ch / 2)


def render(n):
    t = n / FPS
    b0, b1 = view(t - 1 / (FPS * 2.5)), view(t + 1 / (FPS * 2.5))
    move = max(abs(a - b) for a, b in zip(b0, b1))
    samples = [view(t)] if move < 6 else [view(t + (k - 2) / (FPS * 5)) for k in range(5)]
    c = canvas(t)
    acc = None
    for bx in samples:
        a = np.asarray(c.resize((OW, OH), Image.BICUBIC, box=bx), dtype=np.float32)
        acc = a if acc is None else acc + a
    out = acc / len(samples)
    if t < 0.5:
        out = out * (t / 0.5) + np.asarray(bg.resize((OW, OH)), np.float32) * (1 - t / 0.5)
    return out.astype(np.uint8).tobytes()


if __name__ == '__main__':
    master = os.path.join(OUT_DIR, f'{NAME}-master.mp4')
    web = os.path.join(OUT_DIR, f'{NAME}-demo.mp4')
    N = int(DUR * FPS)
    ff = subprocess.Popen(['ffmpeg', '-y', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{OW}x{OH}', '-r', str(FPS), '-i', '-',
                           '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', master],
                          stdin=subprocess.PIPE)
    with Pool(os.cpu_count() or 8) as pool:
        for i, buf in enumerate(pool.imap(render, range(N), chunksize=24)):
            ff.stdin.write(buf)
            if i % 300 == 0:
                print(i, '/', N, flush=True)
    ff.stdin.close()
    ff.wait()
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', master, '-vf', 'scale=1280:720:flags=lanczos,fps=20',
                    '-c:v', 'libx264', '-preset', 'veryslow', '-crf', '24', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', web],
                   check=True)
    print('wrote', master, 'and', web)
