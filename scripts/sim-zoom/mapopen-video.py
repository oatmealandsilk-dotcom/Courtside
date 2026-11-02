# mapopen-video.py DIR...: reads mapopen-run.sh's recordings (no app code: only the screen). Per opening:
#   tap_to_slide_ms  finger down -> the Community page visibly starting to slide (lined up by the recorder's "Recording
#                    started" wall clock, so about +-30 ms; the same error for every build)
#   main_ms/frames   the slide's visible part: the new page's green "All" chip from the right edge to 20 pt from its rest
#   stills           inside that part, every wait of 30 ms or more between two frames where the chip moved (a frame or more
#                    missed at 60 a second; the recorder's times wobble by ~8 ms, so 30-35 ms is borderline)
#   rest_ms          slide start -> the chip at rest (the last ~150 ms are sub-point moves of iOS's ease-out: not stills)
#   streets_ms       the tap -> the map's middle shows its streets (its texture past half of what it ends at), 0.75 s on
# Needs ffmpeg/ffprobe and numpy. iPhone 18 Pro Simulator (402x874 points), the Community tab's card tapped.
import subprocess, sys, os, json
import numpy as np
def load(path, vf, shape, fmt):
    pts = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v', '-show_entries', 'frame=pts_time', '-of', 'csv=p=0', path], capture_output=True, text=True).stdout.split()
    pts = [float(p.strip(',')) for p in pts if p.strip(',')]
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-fps_mode', 'passthrough', '-vf', vf, '-pix_fmt', fmt, '-f', 'rawvideo', '-'], capture_output=True).stdout
    a = np.frombuffer(raw, np.uint8).reshape(-1, *shape).astype(np.int16)
    n = min(len(a), len(pts))
    return np.array(pts[:n]), a[:n]
def biggest_change(a, x0, y0, x1, y1):  # half-size grey frames; region in points
    r = a[:, y0 // 2:y1 // 2, x0 // 2:x1 // 2]
    return np.concatenate([[0], np.abs(np.diff(r, axis=0)).max(axis=(1, 2))])
def chip_x(f):  # the left edge of the green "All" chip in a 14-point band, or None
    r, g, b = f[..., 0], f[..., 1], f[..., 2]
    cols = np.where(((g > r + 25) & (g > b + 5) & (g < 170)).sum(axis=0) >= 6)[0]
    return int(cols[0]) if len(cols) else None
def one(d, n, taps, modes):
    k = f'open{n}'
    r0 = float([l for l in open(f'{d}/rec{n}.txt') if 'Recording started' in l][0].split()[0])
    tap = taps[k] - r0
    t, g = load(f'{d}/{k}.mp4', 'scale=201:437,format=gray', (437, 201), 'gray')
    head = biggest_change(g, 17, 85, 163, 111)  # the Community title, moving as the old page slides away
    i0 = next((i for i in range(len(t)) if t[i] > tap + 0.02 and head[i] >= 40), None)
    if i0 is None: return {'open': k, 'error': 'no slide found'}
    tc, c = load(f'{d}/{k}.mp4', 'scale=402:874,crop=402:14:0:133', (14, 402, 3), 'rgb24')
    moves, last, rest = [], None, None
    for tt, f in zip(tc, c):
        if tt < t[i0] - 0.05: continue
        x = chip_x(f)
        if x is None: continue
        if rest is None and x <= 14: rest = tt
        if (last is None or x != last) and (not moves or moves[-1][1] > 33): moves.append((tt, x))
        last = x
    gaps = [(round((p[0] - t[i0]) * 1000), round((q[0] - p[0]) * 1000)) for p, q in zip(moves, moves[1:])]
    region = g[:, 400 // 2:700 // 2, 60 // 2:340 // 2].astype(np.float32).reshape(len(g), -1).std(axis=1)
    final = np.median(region[-20:])
    js = next((i for i in range(len(t)) if t[i] > tap + 0.75 and region[i] > final * 0.5), None)
    return {'open': k, 'mode': modes.get(k, ''), 'tap_to_slide_ms': round((t[i0] - tap) * 1000),
            'main_ms': round((moves[-1][0] - t[i0]) * 1000) if moves else None, 'main_frames': len(moves),
            'stills': [x for x in gaps if x[1] >= 30], 'rest_ms': round((rest - t[i0]) * 1000) if rest else None,
            'streets_ms': round((t[js] - tap) * 1000) if js is not None else None}
for d in sys.argv[1:]:
    taps = {l.split()[0]: float(l.split()[1]) for l in open(f'{d}/taps.txt')}
    modes = {l.split()[0]: l.split()[1].split('=')[1] for l in open(f'{d}/modes.txt')} if os.path.exists(f'{d}/modes.txt') else {}
    n = 1
    while os.path.exists(f'{d}/open{n}.mp4'):
        print(json.dumps({'dir': os.path.basename(d), **one(d, n, taps, modes)}))
        n += 1
