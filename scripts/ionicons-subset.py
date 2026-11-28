#!/usr/bin/env python3
"""Rebuild the website's small icon font (public/fonts/ionicons-used.woff2) after adding icons.

Why: the website draws its icons from a font. The whole Ionicons set is 1,357 icons (213 KB);
the app uses about 300 of them. public/index.html loads a small file holding only those, early,
and falls back to the whole set (public/fonts/ionicons.woff2) for any icon not in it.

What it does: finds every Ionicons name written in app/ and src/ as a quoted word, keeps just
those glyphs from the font that ships with @expo/vector-icons, saves them as WOFF2, and rewrites
the matching unicode-range line in public/index.html.

Run from the project folder:  python3 scripts/ionicons-subset.py
Needs fontTools and brotli:    python3 -m pip install fonttools brotli
"""
import glob
import json
import os
import re
import sys

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VENDOR = os.path.join(ROOT, 'node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons')
GLYPHS = json.load(open(os.path.join(VENDOR, 'glyphmaps/Ionicons.json')))
TTF = os.path.join(VENDOR, 'Fonts/Ionicons.ttf')
OUT = os.path.join(ROOT, 'public/fonts/ionicons-used.woff2')
FULL = os.path.join(ROOT, 'public/fonts/ionicons.woff2')
HTML = os.path.join(ROOT, 'public/index.html')

names = set()
for path in glob.glob(os.path.join(ROOT, 'app/**/*.ts*'), recursive=True) + glob.glob(os.path.join(ROOT, 'src/**/*.ts*'), recursive=True):
    for word in re.findall(r"['\"`]([a-z0-9-]+)['\"`]", open(path, encoding='utf-8').read()):
        if word in GLYPHS:
            names.add(word)
codes = sorted({GLYPHS[n] for n in names})

def save(unicodes, out):
    opts = subset.Options()
    opts.flavor = 'woff2'
    opts.layout_features = []
    opts.name_IDs = ['*']
    font = TTFont(TTF)
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=unicodes)
    sub.subset(font)
    font.flavor = 'woff2'
    font.save(out)

save(codes, OUT)
if '--full' in sys.argv or not os.path.exists(FULL):
    save(sorted(GLYPHS.values()), FULL)

ranges = []
for c in codes:
    if ranges and c == ranges[-1][1] + 1:
        ranges[-1][1] = c
    else:
        ranges.append([c, c])
unicode_range = ','.join('U+%X' % a if a == b else 'U+%X-%X' % (a, b) for a, b in ranges)

html = open(HTML, encoding='utf-8').read()
pattern = r'(src:url\(/fonts/ionicons-used\.woff2\) format\("woff2"\);font-display:auto;unicode-range:)[^}]*(\})'
html, n = re.subn(pattern, lambda m: m.group(1) + unicode_range + m.group(2), html)
if n != 1:
    sys.exit('Could not find the ionicons-used @font-face line in public/index.html')
open(HTML, 'w', encoding='utf-8').write(html)
print(f'{len(codes)} icons, {os.path.getsize(OUT):,} bytes -> {os.path.relpath(OUT, ROOT)}')
