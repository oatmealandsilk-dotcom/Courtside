import React, { useEffect, useRef, useState } from 'react';

import { useTheme } from '@/theme/ThemeProvider';
import { colors } from '@/theme';

/*
 * The browser's twin of OpenRing (see there): the same green ring, halo and
 * pop, done with the browser's own transitions and keyframes, the way the
 * map's pins are (markers.ts), so nothing ticks on the page's main thread
 * while a card is up and the map is flying.
 */

/** The same measurements as a pin's on the map (markers.ts): a gap, then the green ring. */
const GAP = 3;
const RING = 2.5;
/** How long the pop lasts, with a little to spare. */
const POP_MS = 650;

const CSS = `
.cs-or{position:relative;display:flex;align-items:center;justify-content:center;flex:none}
.cs-or-halo-wrap{position:absolute;inset:0;opacity:0;transition:opacity .42s ease;pointer-events:none}
.cs-or-on .cs-or-halo-wrap{opacity:1}
.cs-or-halo{position:absolute;border-radius:999px;opacity:0;animation:cs-or-pulse 2.8s cubic-bezier(.22,.61,.36,1) infinite;animation-play-state:paused}
.cs-or-on .cs-or-halo{animation-play-state:running}
@keyframes cs-or-pulse{0%{transform:scale(1);opacity:.45}70%{opacity:0}100%{transform:scale(1.85);opacity:0}}
.cs-or-sm .cs-or-halo{animation-name:cs-or-pulse-sm}
@keyframes cs-or-pulse-sm{0%{transform:scale(1);opacity:.45}70%{opacity:0}100%{transform:scale(1.4);opacity:0}}
.cs-or-line{position:absolute;box-sizing:border-box;border-radius:999px;pointer-events:none;transition:opacity .42s ease}
.cs-or-on .cs-or-line{opacity:0}
.cs-or-ring{position:absolute;left:0;top:0;transform:rotate(-90deg);overflow:visible;pointer-events:none}
.cs-or-ring circle{opacity:0;stroke-linecap:butt;transition:stroke-dashoffset .42s cubic-bezier(.4,0,.2,1),opacity .2s ease .22s}
.cs-or-on .cs-or-ring circle{stroke-dashoffset:0;opacity:1;stroke-linecap:round;transition:stroke-dashoffset .75s cubic-bezier(.65,0,.35,1),opacity .1s ease}
.cs-or-face{display:flex}
.cs-or-pop .cs-or-face{animation:cs-or-pop .55s ease-out}
@keyframes cs-or-pop{0%{transform:scale(1)}30%{transform:scale(1.08)}62%{transform:scale(.99)}100%{transform:scale(1)}}
@media (prefers-reduced-motion:reduce){
.cs-or-halo{animation:none;transform:scale(1.3);opacity:.2}
.cs-or-sm .cs-or-halo{animation:none;transform:scale(1.2)}
.cs-or-pop .cs-or-face{animation:none}
.cs-or-ring circle,.cs-or-on .cs-or-ring circle{stroke-dashoffset:0;transition:opacity .26s ease}
}
`;

if (typeof document !== 'undefined' && !document.getElementById('cs-open-ring-css')) {
  const style = document.createElement('style');
  style.id = 'cs-open-ring-css';
  style.textContent = CSS;
  document.head.appendChild(style);
}

/**
 * A face wearing the Open to hit look, the same one the map's pins wear:
 * a green ring round it, a gap of the card between, and a soft halo that
 * breathes out from it. Switched on, the ring draws itself round the face
 * and the face gives one small pop; off, the ring unwinds and a quiet
 * hairline takes its place (`hairline`). Reduce Motion: the ring fades in
 * and the halo holds still. `halo="small"`: a shorter breath (1.4x, not
 * 1.85x) for a row of faces side by side, as on the phone.
 */
export function OpenRing({ open, size, hairline = false, halo = 'full', children }: { open: boolean; /** The face's own size. */ size: number; /** Off, a faint ring stays, so the face still reads as a place to look (your own card). */ hairline?: boolean; /** How far the halo breathes out: the map's, or `small` in a row of faces. */ halo?: 'full' | 'small'; children: React.ReactNode }) {
  useTheme();
  const box = size + GAP * 2 + RING * 2 + 2;
  const r = size / 2 + GAP + RING / 2;
  const lap = 2 * Math.PI * r;
  const inner = size + GAP * 2;
  // Only a real switch from off to on pops the face: not its first appearance, nor a second run of the same effect.
  const prev = useRef(open);
  const [pop, setPop] = useState(false);
  useEffect(() => {
    const switchedOn = open && !prev.current;
    prev.current = open;
    if (switchedOn) setPop(true);
    else if (!open) setPop(false);
  }, [open]);
  useEffect(() => {
    if (!pop) return;
    const t = setTimeout(() => setPop(false), POP_MS);
    return () => clearTimeout(t);
  }, [pop]);

  return (
    <div className={`cs-or${open ? ' cs-or-on' : ''}${pop ? ' cs-or-pop' : ''}${halo === 'small' ? ' cs-or-sm' : ''}`} style={{ width: box, height: box }}>
      <div className="cs-or-halo-wrap">
        <div className="cs-or-halo" style={{ left: (box - inner) / 2, top: (box - inner) / 2, width: inner, height: inner, background: colors.open }} />
      </div>
      {hairline ? <div className="cs-or-line" style={{ left: 1, top: 1, width: box - 2, height: box - 2, border: `1.5px solid ${colors.borderStrong}` }} /> : null}
      <svg className="cs-or-ring" width={box} height={box} viewBox={`0 0 ${box} ${box}`} aria-hidden="true">
        <circle cx={box / 2} cy={box / 2} r={r} fill="none" stroke={colors.open} strokeWidth={RING} strokeDasharray={`${lap} ${lap}`} strokeDashoffset={lap} />
      </svg>
      <div className="cs-or-face">{children}</div>
    </div>
  );
}
