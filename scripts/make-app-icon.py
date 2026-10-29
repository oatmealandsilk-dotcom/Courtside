# Writes the layered iPhone app icon, assets/CourtSideIcon.icon (Oct 29).
#
# iOS 26 and later draw every home-screen icon through Apple's "Liquid Glass" system.
# A flat picture (our old icon-a.png) gets that treatment guessed for it, which softened
# the mark next to apps like Instagram. An Icon Composer ".icon" file instead tells the
# phone what each part is: a cream background, and the green court mark as its own
# sharp vector layers, so the phone draws them crisp at any size and in every style
# (Default, Dark, Clear, Tinted).
#
# The mark is the exact shape of assets/icon-a.png (fitted to its pixels, under half a
# pixel off at 1024px), drawn as vector paths. Colours are the ones already approved:
# deep green #236B3F on cream #F6EFE4, and for Dark the icon-a-dark.png pair (#52A66D on
# #181E1A). In Clear and Tinted styles the mark is white, so the phone can tint it.
#
# Run: python3 scripts/make-app-icon.py   (no extra packages needed)
# Check a render: "/Applications/Xcode.app/Contents/Applications/Icon Composer.app/
#   Contents/Executables/ictool" assets/CourtSideIcon.icon --export-image --output-file
#   out.png --platform iOS --rendition Default --width 1024 --height 1024 --scale 1
import json, math, os, shutil

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'CourtSideIcon.icon')

GREEN, CREAM = '#236B3F', '#F6EFE4'            # icon-a.png
DARK_GREEN, DARK_BG = '#52A66D', '#181E1A'     # icon-a-dark.png
MONO = '#FFFFFF'                               # Clear + Tinted: the phone tints white

# The mark, on the 1024 x 1024 icon canvas, before the 14 degree lean is applied.
OUTER = (223.25, 625.125, 220.0, 791.625)      # court outline: left, right, top, bottom
HOLE_X = (310.75, 537.875)
HOLE_TOP = (300.75, 474.0)
HOLE_BOTTOM = (537.5, 710.75)
OUTER_R, HOLE_R = 37.25, 6.375                 # corner roundness
BAR_X, BAR_TOP, BAR_BOTTOM, BAR_R = 748.0, 231.875, 780.125, 42.2   # the sideline

LEAN = math.tan(math.radians(14))


def lean(x, y):
    return (x - LEAN * (y - 512), y)


def parallelogram(x0, x1, y0, y1):
    return [lean(x0, y0), lean(x1, y0), lean(x1, y1), lean(x0, y1)]


def sub(a, b): return (a[0] - b[0], a[1] - b[1])
def add(a, b): return (a[0] + b[0], a[1] + b[1])
def mul(a, k): return (a[0] * k, a[1] * k)
def norm(a): return math.hypot(*a)
def unit(a): return mul(a, 1 / norm(a))
def pt(p): return f'{p[0]:.2f} {p[1]:.2f}'


def rounded(poly, r):
    """Closed path of a convex shape (clockwise on screen) with round corners of radius r."""
    d = ''
    for i, p in enumerate(poly):
        u = unit(sub(poly[i - 1], p))
        v = unit(sub(poly[(i + 1) % len(poly)], p))
        half = math.acos(max(-1, min(1, u[0] * v[0] + u[1] * v[1]))) / 2
        cut = r / math.tan(half)
        d += ('M' if i == 0 else 'L') + pt(add(p, mul(u, cut)))
        d += f'A{r:.2f} {r:.2f} 0 0 1 ' + pt(add(p, mul(v, cut)))
    return d + 'Z'


def capsule(x, y0, y1, r):
    p1, p2 = lean(x, y0), lean(x, y1)
    dx, dy = unit(sub(p2, p1))
    n = (-dy, dx)
    a, b, c, e = add(p1, mul(n, r)), add(p2, mul(n, r)), sub(p2, mul(n, r)), sub(p1, mul(n, r))
    return f'M{pt(a)}L{pt(b)}A{r:.2f} {r:.2f} 0 0 0 {pt(c)}L{pt(e)}A{r:.2f} {r:.2f} 0 0 0 {pt(a)}Z'


def svg(d, even_odd=False):
    rule = ' fill-rule="evenodd"' if even_odd else ''
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">'
            f'<path fill="{GREEN}"{rule} d="{d}"/></svg>\n')


def colour(hex_):
    r, g, b = (int(hex_[i:i + 2], 16) / 255 for i in (1, 3, 5))
    return f'srgb:{r:.5f},{g:.5f},{b:.5f},1.00000'


def fills(light, dark, mono=None):
    out = [{'value': {'solid': colour(light)}}, {'appearance': 'dark', 'value': {'solid': colour(dark)}}]
    if mono:
        out.append({'appearance': 'tinted', 'value': {'solid': colour(mono)}})
    return out


def layer(name, image):
    return {
        'name': name,
        'image-name': image,
        # Glass on gives the mark its own lift and soft shadow; specular is off (below)
        # because its bright rim is what reads as a fuzzy edge at home-screen size.
        'glass': True,
        'fill-specializations': fills(GREEN, DARK_GREEN, MONO),
        'position': {'scale': 1, 'translation-in-points': [0, 0]},
    }


def main():
    court = (rounded(parallelogram(*OUTER), OUTER_R)
             + rounded(parallelogram(*HOLE_X, *HOLE_TOP), HOLE_R)
             + rounded(parallelogram(*HOLE_X, *HOLE_BOTTOM), HOLE_R))
    sideline = capsule(BAR_X, BAR_TOP, BAR_BOTTOM, BAR_R)

    shutil.rmtree(OUT, ignore_errors=True)
    os.makedirs(os.path.join(OUT, 'Assets'))
    with open(os.path.join(OUT, 'Assets', 'court.svg'), 'w') as f:
        f.write(svg(court, even_odd=True))
    with open(os.path.join(OUT, 'Assets', 'sideline.svg'), 'w') as f:
        f.write(svg(sideline))

    doc = {
        'fill-specializations': fills(CREAM, DARK_BG),
        'groups': [{
            'layers': [layer('Sideline', 'sideline.svg'), layer('Court', 'court.svg')],
            'shadow': {'kind': 'neutral', 'opacity': 0.3},
            'specular': False,
            'translucency': {'enabled': False, 'value': 0.5},
        }],
        'supported-platforms': {'squares': ['iOS']},
    }
    with open(os.path.join(OUT, 'icon.json'), 'w') as f:
        json.dump(doc, f, indent=2)
        f.write('\n')
    print('wrote', os.path.relpath(OUT, ROOT))


if __name__ == '__main__':
    main()
