#!/usr/bin/env python3
"""
The logo-only launch screen (Oct 24, "splash C"): the app icon's thin mark in the icon's green,
centred, and "GROWING THE GAME" small and quiet low down, the way Instagram, WhatsApp and Threads
open (the mark alone, a quiet line at the foot). Oct 25: on white, the Clean theme's own ground
(Clean is what the app opens in since Oct 24; on the icon's cream the launch then turned white,
owner: "Think the loading screen color is off"), the line in Clean's muted grey.
Oct 25, later: two looks, white and dark (owner: "just have two themes for the loading screen just
white clean and dark mode"). The dark one is the same mark and line on the Night theme's ground, the
mark in Night's green and the line in Night's muted grey. The phone shows whichever matches its own
light or dark mode; the app's drawn copy follows the phone the same way (src/components/LaunchMark.tsx).

Writes, from one set of shapes, so the phone's launch picture and the app's drawn copy of it
are the same pixels:
  assets/splash-c.png                 the iPhone launch picture, 1284 x 2778, drawn to cover the screen
  assets/splash-c-dark.png            the same, dark (shown when the phone is in dark mode)
  assets/splash-c-android.png         Android 12+ launch icon: the mark alone on a clear 1024 square
  assets/splash-c-android-dark.png    the same in Night's green, for the dark launch screen
  src/components/launchPictureC.ts    the same mark and line as outlines, in the picture's pixels
  public/index.html                   the website's loader: both looks, picked by the browser's own light or dark mode

    python3 scripts/make-splash-c.py        (needs numpy, pillow, fonttools; run from anywhere)

The mark is not traced: it is the refined icon's own geometry (~/Desktop/CourtSide-App-Icon-Oct5/
1-refined/icon.svg, copied below), a leaning frame with round outer corners, two windows and a
round-ended sideline, made thinner the way the Oct 22 "Thin + Large" icon was (every edge moved in
by THIN of the mark's width, round corners kept round). The script checks its drawing against
assets/icon-thin.png and prints how far off it is. The line is set in Inter SemiBold (the app's
own font) and turned into outlines here, so no font has to load for it.
"""
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw
from fontTools.pens.basePen import BasePen
from fontTools.ttLib import TTFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT = os.environ.get('INTER_SEMIBOLD') or os.path.join(ROOT, 'node_modules/@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf')

ICON_CREAM = (0xF6, 0xEF, 0xE4)  # the icon's cream (assets/icon-thin.png): only to measure the mark against the icon
GROUND = (0xFF, 0xFF, 0xFF)  # the launch screen's ground: the Clean theme's bg (src/theme/ThemeProvider.tsx), white
GREEN = (0x2E, 0x7E, 0x4B)   # the icon's green
LINE_INK = (0x53, 0x64, 0x71)  # the quiet line: Clean's muted ink (textMuted), 6.1:1 on white
# The dark look (Oct 25): the Night theme's ground, its green (brand) and its muted ink (textMuted),
# src/theme/ThemeProvider.tsx darkColors.
DARK_GROUND = (0x0F, 0x14, 0x12)
DARK_GREEN = (0x6F, 0xB4, 0x83)
DARK_LINE_INK = (0xA6, 0xB1, 0xAB)
PIC_W, PIC_H = 1284, 2778
MARK_FRAC = 0.22             # the mark's width, as a share of the screen's
THIN = 0.016                 # the Oct 22 thinning, as a share of the refined mark's width
# The line: Inter SemiBold, 30 px caps size on the 3x picture (10 pt), tracked 0.16 em, its baseline
# where the old picture's line sat (2487, 97 pt up on a 6.1" iPhone, still on screen on an SE).
LINE_TEXT = 'GROWING THE GAME'
LINE_SIZE = 30.0
LINE_TRACK = 0.16
LINE_BASELINE = 2487.0

# The refined icon's mark (1024 grid): the frame with its two windows, and the sideline.
FRAME = 'M327.95 221.87L649.70 221.87A36.00 36.00 0 0 1 684.63 266.58L562.16 757.78A36.00 36.00 0 0 1 527.23 785.07L205.48 785.07A36.00 36.00 0 0 1 170.55 740.36L293.02 249.16A36.00 36.00 0 0 1 327.95 221.87Z'
WINDOWS = [
    'M333.65 472.18L541.11 472.18A8.00 8.00 0 0 0 548.88 466.11L587.44 311.45A8.00 8.00 0 0 0 579.68 301.51L372.22 301.51A8.00 8.00 0 0 0 364.45 307.58L325.89 462.24A8.00 8.00 0 0 0 333.65 472.18Z',
    'M275.50 705.42L482.96 705.42A8.00 8.00 0 0 0 490.72 699.36L529.28 544.69A8.00 8.00 0 0 0 521.52 534.76L314.06 534.76A8.00 8.00 0 0 0 306.30 540.82L267.74 695.49A8.00 8.00 0 0 0 275.50 705.42Z',
]
SIDE = 'M813.85 191.87A41.72 41.72 0 0 1 854.33 243.68L719.76 783.44A41.72 41.72 0 0 1 679.27 815.07A41.72 41.72 0 0 1 638.79 763.25L773.37 223.50A41.72 41.72 0 0 1 813.85 191.87Z'


def arc_centres(d):
    """Each arc's centre in a path of L and A commands, and its radius (all arcs share one)."""
    import re
    toks = re.findall(r'[MLAZ]|-?[\d.]+', d)
    i, cur, out, r = 0, None, [], 0.0
    while i < len(toks):
        t = toks[i]
        if t in 'ML':
            cur = (float(toks[i + 1]), float(toks[i + 2])); i += 3
        elif t == 'A':
            r = float(toks[i + 1]); fa, fs = int(toks[i + 4]), int(toks[i + 5])
            end = (float(toks[i + 6]), float(toks[i + 7]))
            x1p, y1p = (cur[0] - end[0]) / 2, (cur[1] - end[1]) / 2
            q = max(0.0, (r * r - x1p * x1p - y1p * y1p) / (x1p * x1p + y1p * y1p))
            k = math.sqrt(q) * (1 if fa != fs else -1)
            c = (k * y1p + (cur[0] + end[0]) / 2, -k * x1p + (cur[1] + end[1]) / 2)
            if not out or math.dist(out[-1], c) > 0.5:
                out.append(c)
            cur = end; i += 8
        else:
            i += 1
    if len(out) > 1 and math.dist(out[0], out[-1]) < 0.5:
        out.pop()
    return out, r


def rounded(core, R, sweep):
    """A convex polygon's outline grown by R round its corner centres, as (points, arcs) for drawing."""
    n = len(core)

    # Outward from the shape, for the way its outline runs: clockwise on screen (sweep 1) or not.
    def normal(a, b):
        dx, dy = b[0] - a[0], b[1] - a[1]; L = math.hypot(dx, dy)
        return (dy / L, -dx / L) if sweep == 1 else (-dy / L, dx / L)
    segs = []
    for i in range(n):
        c = core[i]; nin = normal(core[i - 1], c); nout = normal(c, core[(i + 1) % n])
        segs.append(((c[0] + R * nin[0], c[1] + R * nin[1]), (c[0] + R * nout[0], c[1] + R * nout[1]), c))
    return segs, R, sweep


def path_of(shape, tx, ty, s):
    segs, R, sweep = shape
    f = lambda p: f'{(p[0] + tx) * s:.2f} {(p[1] + ty) * s:.2f}'
    out = 'M' + f(segs[-1][1])
    for a, b, _ in segs:
        out += f'L{f(a)}A{R * s:.2f} {R * s:.2f} 0 0 {sweep} {f(b)}'
    return out + 'Z'


def polygon_of(shape, steps=48):
    """The outline as a list of points, arcs flattened, for drawing with PIL."""
    segs, R, sweep = shape
    pts = []
    for a, b, c in segs:
        a0 = math.atan2(a[1] - c[1], a[0] - c[0]); a1 = math.atan2(b[1] - c[1], b[0] - c[0])
        da = a1 - a0
        if sweep == 1 and da < 0: da += 2 * math.pi
        if sweep == 0 and da > 0: da -= 2 * math.pi
        for k in range(steps + 1):
            t = a0 + da * k / steps
            pts.append((c[0] + R * math.cos(t), c[1] + R * math.sin(t)))
    return pts


def thin_mark(d):
    """The thin mark's shapes (frame outline, windows, sideline as a 2-corner 'polygon')."""
    fc, fr = arc_centres(FRAME)
    frame = rounded(fc, fr - d, 1)
    wins = []
    for w in WINDOWS:
        wc, wr = arc_centres(w)
        wins.append(rounded(wc, wr + d, 0))
    sc, sr = arc_centres(SIDE)
    side = rounded(sc, sr - d, 1)
    return [frame, *wins, side]


def bbox(shapes):
    pts = [p for sh in shapes for p in polygon_of(sh, 64)]
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
    return min(xs), min(ys), max(xs), max(ys)


def raster(polys, w, h, up=8):
    """Coverage (0..1) of the given outlines on a w x h grid, filled non-zero (as SVG fills by default:
    a letter's overlapping strokes stay solid, and the mark's windows, which run the other way, are holes)."""
    acc = np.zeros((h * up, w * up), np.int16)
    for poly in polys:
        area = sum(poly[i - 1][0] * poly[i][1] - poly[i][0] * poly[i - 1][1] for i in range(len(poly)))
        one = Image.new('1', (w * up, h * up), 0)
        ImageDraw.Draw(one).polygon([(x * up, y * up) for x, y in poly], fill=1)
        acc += np.asarray(one, np.int16) * (1 if area > 0 else -1)
    a = (acc != 0).astype(np.float32).reshape(h, up, w, up).mean(axis=(1, 3))
    return a


def mark_polys(d, left, top, width):
    """The thin mark's outlines, placed with its box's top left at (left, top) and `width` wide."""
    shapes = thin_mark(d)
    x0, y0, x1, y1 = bbox(shapes)
    s = width / (x1 - x0)
    return [[(left + (x - x0) * s, top + (y - y0) * s) for x, y in polygon_of(sh)] for sh in shapes], (x1 - x0) * s, (y1 - y0) * s


def check_against_icon(d):
    """How far this drawing of the mark is from assets/icon-thin.png (placed as that icon places it)."""
    icon = np.asarray(Image.open(os.path.join(ROOT, 'assets/icon-thin.png')).convert('RGB')).astype(np.float32)
    ink = np.clip((ICON_CREAM[1] - icon[..., 1]) / (ICON_CREAM[1] - GREEN[1]), 0, 1)
    shapes = thin_mark(d); x0, y0, x1, y1 = bbox(shapes)
    w = 0.68 * 1024; h = w * (y1 - y0) / (x1 - x0)
    polys, _, _ = mark_polys(d, 512 - w / 2, 0.494 * 1024 - h / 2, w)
    mine = raster(polys, 1024, 1024, 4)
    return float(np.abs(mine - ink).mean() * 1024 * 1024 / max(1.0, ink.sum())), float(ink.sum()), float(mine.sum())


class FlatPen(BasePen):
    """Glyph outlines as flat point lists (curves cut into short lines), and as an SVG path."""

    def __init__(self, glyphs, f):
        super().__init__(glyphs); self.f = f; self.polys = []; self.cur = []; self.d = []

    def _moveTo(self, p):
        self.cur = [self.f(p)]; self.d.append('M%.2f %.2f' % self.f(p))

    def _lineTo(self, p):
        self.cur.append(self.f(p)); self.d.append('L%.2f %.2f' % self.f(p))

    def _qCurveToOne(self, p1, p2):
        a = self.cur[-1]; b, c = self.f(p1), self.f(p2)
        for k in range(1, 13):
            t = k / 12
            self.cur.append(((1 - t) ** 2 * a[0] + 2 * (1 - t) * t * b[0] + t * t * c[0], (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * b[1] + t * t * c[1]))
        self.d.append('Q%.2f %.2f %.2f %.2f' % (b + c))

    def _curveToOne(self, p1, p2, p3):
        a = self.cur[-1]; b, c, e = self.f(p1), self.f(p2), self.f(p3)
        for k in range(1, 17):
            t = k / 16; u = 1 - t
            self.cur.append(tuple(u ** 3 * a[i] + 3 * u * u * t * b[i] + 3 * u * t * t * c[i] + t ** 3 * e[i] for i in (0, 1)))
        self.d.append('C%.2f %.2f %.2f %.2f %.2f %.2f' % (b + c + e))

    def _closePath(self):
        if self.cur: self.polys.append(self.cur)
        self.cur = []; self.d.append('Z')

    _endPath = _closePath


def line_shapes():
    """The line's letters, set centred on the picture at LINE_BASELINE: (outlines, SVG path)."""
    font = TTFont(FONT); gs = font.getGlyphSet(); cmap = font.getBestCmap()
    k = LINE_SIZE / font['head'].unitsPerEm; track = LINE_TRACK * LINE_SIZE
    names = [cmap[ord(ch)] for ch in LINE_TEXT]
    widths = [gs[n].width * k for n in names]
    total = sum(widths) + track * (len(names) - 1)
    x = PIC_W / 2 - total / 2
    polys, d = [], []
    for n, w in zip(names, widths):
        pen = FlatPen(gs, lambda p, ox=x: (ox + p[0] * k, LINE_BASELINE - p[1] * k))
        gs[n].draw(pen); polys += pen.polys; d += pen.d
        x += w + track
    return polys, ''.join(d)


def box_of(polys, pad):
    xs = [x for p in polys for x, _ in p]; ys = [y for p in polys for _, y in p]
    x0, y0 = math.floor(min(xs)) - pad, math.floor(min(ys)) - pad
    return [x0, y0, math.ceil(max(xs)) + pad - x0, math.ceil(max(ys)) + pad - y0]


def paint(img, polys, box, ink):
    x0, y0, w, h = box
    cov = raster([[(x - x0, y - y0) for x, y in p] for p in polys], w, h)
    region = np.asarray(img.crop((x0, y0, x0 + w, y0 + h))).astype(np.float32)
    out = region * (1 - cov[..., None]) + np.array(ink, np.float32) * cov[..., None]
    img.paste(Image.fromarray(np.round(out).astype(np.uint8)), (x0, y0))


def main():
    shapes = thin_mark(0)
    x0, y0, x1, y1 = bbox(shapes)
    d = THIN * (x1 - x0)
    err = check_against_icon(d)[0]
    print(f'mark vs assets/icon-thin.png: {err * 100:.1f}% of its ink differs (edge softness only below ~2%)')
    shapes = thin_mark(d); x0, y0, x1, y1 = bbox(shapes)
    mw = MARK_FRAC * PIC_W; s = mw / (x1 - x0); mh = (y1 - y0) * s
    left, top = PIC_W / 2 - mw / 2, PIC_H / 2 - mh / 2
    mark_d = ''.join(path_of(sh, left / s - x0, top / s - y0, s) for sh in shapes)
    mark_poly = [[(left + (x - x0) * s, top + (y - y0) * s) for x, y in polygon_of(sh)] for sh in shapes]
    mark_box = box_of(mark_poly, 2)
    line_poly, line_d = line_shapes()
    line_box = box_of(line_poly, 2)
    # The boxes the app and the website draw them in: centred on the picture's middle (the mark both
    # ways, the line across), so "centre this box" puts the shape exactly where the picture has it.
    hw = max(PIC_W / 2 - mark_box[0], mark_box[0] + mark_box[2] - PIC_W / 2)
    hh = max(PIC_H / 2 - mark_box[1], mark_box[1] + mark_box[3] - PIC_H / 2)
    mark_view = [PIC_W / 2 - hw, PIC_H / 2 - hh, 2 * hw, 2 * hh]
    lw = max(PIC_W / 2 - line_box[0], line_box[0] + line_box[2] - PIC_W / 2)
    line_view = [PIC_W / 2 - lw, line_box[1], 2 * lw, line_box[3]]

    for ground, green, ink, name in ((GROUND, GREEN, LINE_INK, 'splash-c.png'), (DARK_GROUND, DARK_GREEN, DARK_LINE_INK, 'splash-c-dark.png')):
        pic = Image.new('RGB', (PIC_W, PIC_H), ground)
        paint(pic, mark_poly, mark_box, green)
        paint(pic, line_poly, line_box, ink)
        pic.save(os.path.join(ROOT, 'assets', name), optimize=True)

    # Android 12+: the mark alone on a clear square the phone shows ANDROID_PT across; the mark
    # MARK_FRAC of a 411-point-wide phone (90 pt), in the middle of the screen.
    ANDROID_PT = 288
    aw = 1024 * (MARK_FRAC * 411) / ANDROID_PT
    asx = aw / (x1 - x0); ah = (y1 - y0) * asx
    ap = [[(512 - aw / 2 + (x - x0) * asx, 512 - ah / 2 + (y - y0) * asx) for x, y in polygon_of(sh)] for sh in shapes]
    cov = raster(ap, 1024, 1024, 4)
    for green, name in ((GREEN, 'splash-c-android.png'), (DARK_GREEN, 'splash-c-android-dark.png')):
        rgba = np.zeros((1024, 1024, 4), np.uint8); rgba[..., :3] = green; rgba[..., 3] = np.round(cov * 255).astype(np.uint8)
        Image.fromarray(rgba, 'RGBA').save(os.path.join(ROOT, 'assets', name), optimize=True)

    hexc = lambda c: '#%02X%02X%02X' % c
    ts = TS.format(W=PIC_W, H=PIC_H, ground=hexc(GROUND), green=hexc(GREEN), line=hexc(LINE_INK),
                   dground=hexc(DARK_GROUND), dgreen=hexc(DARK_GREEN), dline=hexc(DARK_LINE_INK),
                   mbox=[round(v, 2) for v in mark_view], mw=f'{mw:.2f}', cx=PIC_W / 2, cy=PIC_H / 2, md=mark_d,
                   text=LINE_TEXT, size=f'{LINE_SIZE:g}', track=LINE_TRACK, base=f'{LINE_BASELINE:g}',
                   lbox=[round(v, 2) for v in line_view], ld=line_d, apt=ANDROID_PT, apx=f'{aw:.2f}')
    with open(os.path.join(ROOT, 'src/components/launchPictureC.ts'), 'w') as fh:
        fh.write(ts)

    # The website's own loader (public/index.html), shown before any of the app's code has run: the same
    # shapes, sized as the app's web splash sizes them (WebLaunchMarkC: the mark 22% of the width, at most
    # 96 px), so the app's first screen replaces it with nothing moving. White, or dark when the browser
    # (the phone or computer it runs on) is in dark mode: the app's first screen picks the same way.
    vb = lambda v: ' '.join(f'{x:g}' for x in (round(t, 2) for t in v))
    u = f'calc(min({MARK_FRAC * 100:g}vw, 96px) / {mw:.2f})'
    looks = (
        f'#cs-launch{{background:{hexc(GROUND)}}}#cs-launch .cs-mark{{fill:{hexc(GREEN)}}}#cs-launch .cs-line{{fill:{hexc(LINE_INK)}}}'
        f'@media (prefers-color-scheme: dark){{#cs-launch{{background:{hexc(DARK_GROUND)}}}#cs-launch .cs-mark{{fill:{hexc(DARK_GREEN)}}}#cs-launch .cs-line{{fill:{hexc(DARK_LINE_INK)}}}}}')
    block = (
        '<!-- launch:start (written by scripts/make-splash-c.py; the app\'s first screen replaces it) -->\n'
        f'      <div id="cs-launch" role="img" aria-label="CourtSide" style="position:fixed;inset:0;--u:{u}">\n'
        f'        <style>{looks}</style>\n'
        f'        <svg viewBox="{vb(mark_view)}" style="position:absolute;left:50%;top:50%;width:calc(var(--u) * {mark_view[2]:g});height:calc(var(--u) * {mark_view[3]:g});transform:translate(-50%,-50%)">'
        f'<path class="cs-mark" fill-rule="evenodd" d="{mark_d}"/></svg>\n'
        f'        <svg viewBox="{vb(line_view)}" style="position:absolute;left:50%;bottom:calc(var(--u) * {PIC_H - line_view[1] - line_view[3]:g});width:calc(var(--u) * {line_view[2]:g});height:calc(var(--u) * {line_view[3]:g});transform:translateX(-50%)">'
        f'<path class="cs-line" d="{line_d}"/></svg>\n'
        '      </div>\n'
        '      <!-- launch:end -->')
    page = os.path.join(ROOT, 'public/index.html')
    html = open(page).read()
    a, b = html.index('<!-- launch:start'), html.index('<!-- launch:end -->') + len('<!-- launch:end -->')
    with open(page, 'w') as fh:
        fh.write(html[:a] + block + html[b:])
    print('mark', [round(v, 1) for v in (left, top, mw, mh)], 'line box', line_box)


TS = '''/*
 * The logo-only launch screen (splash C, Oct 24) as shapes, written by scripts/make-splash-c.py with
 * assets/splash-c.png from the same outlines, so the app's drawn copy is the picture's own pixels.
 * Generated: run that script again (do not edit by hand) whenever the look changes, and ship both
 * together in a new store build. Every number is in the picture's own pixels ({W} x {H}).
 */

/** The picture's size, in its own pixels (the same as the old launch picture's). */
export const PICTURE_C = {{ width: {W}, height: {H} }};

/** Its colours: the ground (the Clean theme's white, Oct 25), the icon's green, and the quiet line's grey (Clean's muted ink). */
export const SPLASH_C_COLORS = {{ ground: '{ground}', green: '{green}', line: '{line}' }};

/**
 * The dark look (Oct 25, assets/splash-c-dark.png), shown when the phone is in dark mode: the Night
 * theme's ground, its green and its muted grey.
 */
export const SPLASH_C_DARK_COLORS = {{ ground: '{dground}', green: '{dgreen}', line: '{dline}' }};

/** The mark: its box (x, y, width, height), its own width, the middle it is centred on, and its outline (even-odd: the windows are holes). */
export const MARK_C = {{
  view: {mbox},
  width: {mw},
  centre: [{cx:g}, {cy:g}],
  d: '{md}',
}};

/** "{text}": Inter SemiBold {size} px, tracked {track} em, centred, on its baseline. */
export const LINE_C = {{
  view: {lbox},
  size: {size},
  tracking: {track},
  baseline: {base},
  d: '{ld}',
}};

/** Android's launch icon (assets/splash-c-android.png, and -dark): 1024 px shown {apt} points across, the mark {apx} px wide in it. */
export const ANDROID_C = {{ iconPt: {apt}, iconPx: 1024, markPx: {apx} }};
'''

if __name__ == '__main__':
    main()
