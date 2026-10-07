#!/usr/bin/env python3
"""
Cuts the launch picture's logo, name and line out of assets/splash.png as shapes the app can draw,
and writes them to src/components/launchPicture.ts (Oct 7, owner: the CourtSide in the app's copy of
the launch screen did not match the launch picture's letters exactly).

Why shapes from the picture and not a font: the picture's name is set in an Arial-like bold the app
does not carry, so no font the app has can draw the same letters. Following the picture's own edges
can. Run it again whenever assets/splash.png changes (a new native build), and ship the two together.

    python3 scripts/trace-launch-picture.py          (needs numpy, scipy, scikit-image, pillow)

How: each part's ink is worked out per pixel against the cream (the picture is anti-aliased, so an
edge pixel is part ink), smoothed up six times with a cubic spline, and its half-ink edge followed
(marching squares): the edge the picture itself draws, to a small fraction of a pixel. The name and
the line keep that edge, smoothed over about half a pixel between corners (the pixel grid leaves a
faint ripple on it) and thinned to within 0.06 of a pixel. The logo is straight-sided (a leaning
frame, its bar and the sideline), so each of its four outlines is fitted with four straight lines
and drawn from their corners. Every shape is then drawn back at the picture's own size and compared
with it; the script prints how far off each part is (Oct 7: about 1% of the logo's and the name's
ink and 3% of the small line's, all of it in the softness of the edges, no pixel off by 0.4).
"""
import os
import sys

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import map_coordinates
from skimage.measure import approximate_polygon, find_contours

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PICTURE = os.path.join(ROOT, 'assets', 'splash.png')
OUT = os.path.join(ROOT, 'src', 'components', 'launchPicture.ts')
UP = 6      # how many times the ink is smoothed up before its edge is followed
TOL = 0.06  # how far (picture pixels) a thinned edge may stray from the followed one
PAD = 4     # cream kept round each part

pic = np.array(Image.open(PICTURE).convert('RGB')).astype(float)
cream = pic[5, 5].copy()


def find_parts():
    """The three bands of ink (logo, name, line), top to bottom, as (top, bottom, left, right), inclusive."""
    inked = (np.abs(pic - cream).sum(2) > 30)
    rows = np.where(inked.any(1))[0]
    bands, start = [], rows[0]
    for a, b in zip(rows, rows[1:]):
        if b != a + 1:
            bands.append((start, a))
            start = b
    bands.append((start, rows[-1]))
    if len(bands) != 3:
        sys.exit(f'Expected 3 bands of ink (logo, name, line), found {len(bands)}: {bands}')
    out = []
    for top, bottom in bands:
        cols = np.where(inked[top:bottom + 1].any(0))[0]
        out.append((top, bottom, int(cols[0]), int(cols[-1])))
    return out


def ink_share(top, bottom, left, right):
    """Per pixel, how much of it is ink (0 cream, 1 ink), with PAD of cream round it; and the ink colour."""
    reg = pic[top - PAD:bottom + PAD + 1, left - PAD:right + PAD + 1]
    d = ((reg - cream) ** 2).sum(2)
    ink = reg.reshape(-1, 3)[d.argmax()]
    v = ink - cream
    return (((reg - cream) * v).sum(2) / (v * v).sum()).clip(0, 1), ink


def edges(share, oy, ox):
    """Every closed half-ink edge of a part, in picture pixels, densely sampled."""
    h, w = share.shape
    yy = (np.arange(h * UP) + 0.5) / UP - 0.5
    xx = (np.arange(w * UP) + 0.5) / UP - 0.5
    gy, gx = np.meshgrid(yy, xx, indexing='ij')
    up = np.pad(map_coordinates(share, [gy, gx], order=3, mode='nearest'), 1)
    out = []
    for c in find_contours(up, 0.5):
        c = c - 1
        pts = np.stack([(c[:, 1] + 0.5) / UP + ox, (c[:, 0] + 0.5) / UP + oy], 1)
        if len(pts) > 12:
            out.append(pts)
    return out


def even(pts, step=0.25):
    """The closed outline resampled every `step` pixels along it."""
    if np.hypot(*(pts[0] - pts[-1])) < 1e-9:
        pts = pts[:-1]
    loop = np.vstack([pts, pts[:1]])
    seg = np.hypot(*np.diff(loop, axis=0).T)
    at = np.concatenate([[0], np.cumsum(seg)])
    n = max(8, int(at[-1] / step))
    t = np.linspace(0, at[-1], n, endpoint=False)
    return np.stack([np.interp(t, at, loop[:, 0]), np.interp(t, at, loop[:, 1])], 1)


def corners_of(pts, reach=6, angle=40):
    """Where the outline turns sharply (more than `angle` degrees over `reach` samples either side)."""
    a = np.roll(pts, reach, 0) - pts
    b = np.roll(pts, -reach, 0) - pts
    cos = (a * b).sum(1) / (np.hypot(*a.T) * np.hypot(*b.T))
    turn = 180 - np.degrees(np.arccos(cos.clip(-1, 1)))
    out = []
    for i in np.where(turn > angle)[0]:
        window = turn[np.arange(i - reach, i + reach + 1) % len(pts)]
        if turn[i] >= window.max():
            out.append(i)
    return sorted(set(out))


def thin(pts):
    """A curved outline: the followed edge carries a small ripple from the pixel grid (a few hundredths
    of a pixel, once a pixel), so it is smoothed over about a pixel, but never across a corner, then
    thinned."""
    pts = even(pts)
    n = len(pts)
    pins = corners_of(pts)
    sigma = 2.4  # samples (0.6 px)
    k = np.arange(-8, 9)
    w = np.exp(-0.5 * (k / sigma) ** 2)
    smooth = pts.copy()
    for i in range(n):
        if pins:
            # how far to the nearest corner on each side: the smoothing never reaches past it
            before = min(((i - p) % n for p in pins))
            after = min(((p - i) % n for p in pins))
            r = min(8, before, after)
        else:
            r = 8
        if r == 0:
            continue
        kk = np.arange(-r, r + 1)
        ww = w[kk + 8]
        smooth[i] = (pts[(i + kk) % n] * ww[:, None]).sum(0) / ww.sum()
    closed = np.vstack([smooth, smooth[:1]])
    return approximate_polygon(closed, tolerance=TOL)[:-1]


def four_sides(pts):
    """A straight-sided outline: its four corners, each side fitted by least squares away from the corners."""
    closed = np.vstack([pts, pts[:1]]) if np.hypot(*(pts[0] - pts[-1])) > 1e-9 else pts
    rough = approximate_polygon(closed, tolerance=1.5)[:-1]
    if len(rough) != 4:
        sys.exit(f'A logo outline has {len(rough)} corners, not 4')
    lines = []
    for i in range(4):
        a, b = rough[i], rough[(i + 1) % 4]
        ab = b - a
        t = ((pts - a) @ ab) / (ab @ ab)
        dist = np.abs(np.cross(ab, pts - a)) / np.hypot(*ab)
        side = pts[(t > 0) & (t < 1) & (dist < 1.5)]
        side = side[(np.hypot(*(side - a).T) > 3) & (np.hypot(*(side - b).T) > 3)]
        mid = side.mean(0)
        _, _, vt = np.linalg.svd(side - mid)
        lines.append((mid, vt[0]))
    corners = []
    for i in range(4):
        (p, u), (q, v) = lines[i - 1], lines[i]
        s = np.linalg.solve(np.stack([u, -v], 1), q - p)
        corners.append(p + s[0] * u)
    return np.array(corners)


def path(outlines, dec):
    """SVG path data: absolute start, relative steps, rounded to `dec` places."""
    out = []
    for poly in outlines:
        q = np.round(poly, dec)
        d = f'M{q[0, 0]:g} {q[0, 1]:g}'
        for a, b in zip(q, q[1:]):
            dx, dy = np.round(b - a, dec)
            d += f'l{dx:g} {dy:g}'.replace(' -', '-')
        out.append(d + 'z')
    return ''.join(out)


def drawn_back(outlines, share, oy, ox, ss=8):
    """The outlines drawn even-odd at ss times the size, then box-filtered to the picture's pixels."""
    h, w = share.shape
    acc = np.zeros((h * ss, w * ss), bool)
    for p in outlines:
        im = Image.new('1', (w * ss, h * ss), 0)
        ImageDraw.Draw(im).polygon([((x - ox) * ss, (y - oy) * ss) for x, y in p], fill=1)
        acc ^= np.array(im, bool)
    return acc.reshape(h, ss, w, ss).mean((1, 3))


def rounded(outlines, dec):
    return [np.round(p, dec) for p in outlines]


(mark_box, name_box, line_box) = find_parts()
parts = {}
for key, box in (('mark', mark_box), ('name', name_box), ('line', line_box)):
    share, ink = ink_share(*box)
    oy, ox = box[0] - PAD, box[2] - PAD
    found = edges(share, oy, ox)
    if key == 'mark':
        if len(found) != 4:
            sys.exit(f'Expected 4 logo outlines (frame, its two openings, sideline), found {len(found)}')
        outlines, dec = [four_sides(p) for p in found], 2
    else:
        outlines, dec = [thin(p) for p in found], 1
    back = drawn_back(rounded(outlines, dec), share, oy, ox)
    off = np.abs(back - share)
    print(f'{key}: {len(outlines)} outlines, {sum(len(p) for p in outlines)} points; drawn back against the picture: '
          f'{100 * off.sum() / share.sum():.2f}% of its ink differs, worst pixel {off.max():.2f}, pixels off by more than a quarter: {(off > 0.25).sum()}')
    parts[key] = {'d': path(outlines, dec), 'ink': '#%02X%02X%02X' % tuple(int(c) for c in ink), 'box': box}

H, W = pic.shape[:2]
# The logo and the name share one drawing; the line has its own, near the foot. Each box is whole pixels with a pixel of room.
def view(*boxes):
    top = min(b[0] for b in boxes) - 1
    bottom = max(b[1] for b in boxes) + 2
    left = min(b[2] for b in boxes) - 1
    right = max(b[3] for b in boxes) + 2
    return [left, top, right - left, bottom - top]

brand_view = view(mark_box, name_box)
line_view = view(line_box)
ts = f'''/*
 * The launch picture's logo, name and line as shapes, cut from assets/splash.png by
 * scripts/trace-launch-picture.py. Generated: run that script again (do not edit by hand) whenever
 * the picture changes, and ship both together. Every number is in the picture's own pixels.
 */

/** The launch picture's size, in its own pixels. */
export const PICTURE = {{ width: {W}, height: {H} }};

/** The logo and the name: the box they are drawn in (x, y, width, height), and their outlines. */
export const BRAND = {{
  view: [{', '.join(map(str, brand_view))}],
  mark: '{parts['mark']['d']}',
  name: '{parts['name']['d']}',
}};

/** "GROWING THE GAME": its box and outlines. */
export const LINE = {{
  view: [{', '.join(map(str, line_view))}],
  d: '{parts['line']['d']}',
}};
'''
open(OUT, 'w').write(ts)
print(f'ink colours in the picture: logo and name {parts["mark"]["ink"]}, line {parts["line"]["ink"]}')
print(f'wrote {os.path.relpath(OUT, ROOT)} ({len(ts)} characters)')
