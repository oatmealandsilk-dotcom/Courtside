import React from 'react';
import Svg, { Circle, Defs, G, Line, LinearGradient, Rect, Stop } from 'react-native-svg';

import type { Court } from '@/features/players/courts';
import { colors } from '@/theme';

/** The surface, as the map data names it, in three families; anything else is unknown. */
export function surfaceOf(c: Court): 'hard' | 'clay' | 'grass' | null {
  const s = (c.surface ?? '').toLowerCase();
  if (!s) return null;
  if (s.includes('clay')) return 'clay';
  if (s.includes('grass') || s.includes('turf')) return 'grass';
  if (/hard|acrylic|asphalt|concrete|tartan|carpet|plexi|decoturf/.test(s)) return 'hard';
  return null;
}

/** The court's own colour: hard blue, clay terracotta, grass green; else the court theme's court colour. */
export const tintOf = (c: Court) => {
  const s = surfaceOf(c);
  return s === 'hard' ? colors.hard : s === 'clay' ? colors.clay : s === 'grass' ? colors.grass : colors.court;
};

/**
 * A court's real lines, in feet from its middle: 78 long, 36 wide (27 for
 * singles), service lines 21 from the net, net posts 3 outside the doubles
 * lines. `along`/`across` are the court's own axes; `portrait` stands it on end.
 */
function OneCourt({ cx, cy, s, portrait, tint, lw, grass }: { cx: number; cy: number; s: number; portrait: boolean; tint: string; lw: number; grass: boolean }) {
  const P = (along: number, across: number) => (portrait ? { x: cx + across * s, y: cy + along * s } : { x: cx + along * s, y: cy + across * s });
  const box = (a1: number, b1: number, a2: number, b2: number) => {
    const p = P(a1, b1); const q = P(a2, b2);
    return { x: Math.min(p.x, q.x), y: Math.min(p.y, q.y), width: Math.abs(q.x - p.x), height: Math.abs(q.y - p.y) };
  };
  const seg = (a1: number, b1: number, a2: number, b2: number) => { const p = P(a1, b1); const q = P(a2, b2); return { x1: p.x, y1: p.y, x2: q.x, y2: q.y }; };
  const line = { stroke: colors.onMedia, strokeWidth: lw, strokeLinecap: 'square' as const };
  const net = seg(0, -21, 0, 21);
  const shift = lw * 0.9;
  return (
    <G>
      <Rect {...box(-39, -18, 39, 18)} fill={tint} />
      {/* A grass court's mowing stripes, across the court. */}
      {grass ? [-39, -26, -13, 0, 13, 26].map((a, i) => (i % 2 ? <Rect key={a} {...box(a, -18, a + 13, 18)} fill={colors.onMedia} fillOpacity={0.07} /> : null)) : null}
      <Rect {...box(-39, -18, 39, 18)} fill="none" {...line} />
      <Line {...seg(-39, -13.5, 39, -13.5)} {...line} />
      <Line {...seg(-39, 13.5, 39, 13.5)} {...line} />
      <Line {...seg(-21, -13.5, -21, 13.5)} {...line} />
      <Line {...seg(21, -13.5, 21, 13.5)} {...line} />
      <Line {...seg(-21, 0, 21, 0)} {...line} />
      <Line {...seg(-39, 0, -37.6, 0)} {...line} />
      <Line {...seg(37.6, 0, 39, 0)} {...line} />
      {/* The net, with the shadow it throws, and its two posts. */}
      <Line x1={net.x1 + shift} y1={net.y1 + shift} x2={net.x2 + shift} y2={net.y2 + shift} stroke={colors.checker} strokeOpacity={0.28} strokeWidth={lw * 1.8} />
      <Line {...net} stroke={colors.onMedia} strokeWidth={lw * 1.5} />
      <Circle cx={net.x1} cy={net.y1} r={lw * 1.3} fill={colors.onMedia} />
      <Circle cx={net.x2} cy={net.y2} r={lw * 1.3} fill={colors.onMedia} />
    </G>
  );
}

/** Feet: the room behind each baseline and beside the outer courts, and between two courts side by side. */
const BACK = 21; const SIDE = 12; const BETWEEN = 12;

/**
 * Courts seen from above, as a landscape picture.
 * - 'postcard': the court block (its courts, up to three, and the room around them) on the page's own
 *   ground, with a faint shadow under it.
 * - 'bleed': the block's colour fills the picture, the courts in the middle, like an aerial photo.
 * - 'close': one court close up, turned a little and cut by the picture's edges.
 * One court lies along the picture; two or three stand side by side. The room around a hard court
 * takes the theme's court green where the theme has one (blue inside, green outside, as hard courts are);
 * otherwise it is the court's colour a shade deeper. Lit courts show their four light posts.
 */
export function AerialCourt({ court, width, height, frame, id }: { court: Court; width: number; height: number; frame: 'postcard' | 'bleed' | 'close'; id: string }) {
  const tint = tintOf(court);
  const surface = surfaceOf(court);
  const around = surface === 'hard' && colors.court !== colors.hard ? colors.court : null;
  const gid = `ac-${frame}-${id.replace(/[^A-Za-z0-9_-]/g, '')}`;
  const light = (
    <LinearGradient id={`${gid}-l`} x1="0" y1="0" x2="1" y2="1">
      <Stop offset="0" stopColor={colors.onMedia} stopOpacity={0.16} />
      <Stop offset="0.5" stopColor={colors.onMedia} stopOpacity={0} />
      <Stop offset="1" stopColor={colors.checker} stopOpacity={0.14} />
    </LinearGradient>
  );
  if (frame === 'close') {
    // One court on end, about one and a half times the picture's height, turned 16 degrees.
    const s = (height * 1.32) / 78;
    const cx = width / 2; const cy = height * 0.42;
    return (
      <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <Defs>
          {light}
          {/* A soft darkening at the foot, for the white words over it. */}
          <LinearGradient id={`${gid}-d`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0.38" stopColor={colors.checker} stopOpacity={0} />
            <Stop offset="1" stopColor={colors.checker} stopOpacity={0.62} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={width} height={height} fill={around ?? tint} />
        {around ? null : <Rect x={0} y={0} width={width} height={height} fill={colors.checker} fillOpacity={0.2} />}
        <G transform={`rotate(-16 ${cx} ${cy})`}>
          <OneCourt cx={cx} cy={cy} s={s} portrait tint={tint} lw={Math.max(1.6, s * 0.55)} grass={surface === 'grass'} />
        </G>
        <Rect x={0} y={0} width={width} height={height} fill={`url(#${gid}-l)`} />
        <Rect x={0} y={0} width={width} height={height} fill={`url(#${gid}-d)`} />
      </Svg>
    );
  }
  const n = Math.min(3, Math.max(1, court.count));
  const portrait = n > 1;
  // The block in feet: courts plus the room around them.
  const bw = portrait ? n * 36 + (n - 1) * BETWEEN + 2 * SIDE : 78 + 2 * BACK;
  const bh = portrait ? 78 + 2 * BACK : 36 + 2 * SIDE;
  const pad = frame === 'postcard' ? Math.round(height * 0.13) : Math.round(height * 0.1);
  const s = Math.min((width - pad * 2) / bw, (height - pad * 2) / bh);
  const bx = (width - bw * s) / 2; const by = (height - bh * s) / 2;
  const lw = Math.max(1.1, s * 0.42);
  const centres = Array.from({ length: n }, (_, i) => (portrait ? { x: bx + (SIDE + 18 + i * (36 + BETWEEN)) * s, y: by + (bh / 2) * s } : { x: width / 2, y: height / 2 }));
  const posts = court.lit ? [[bx + 3, by + 3], [bx + bw * s - 3, by + 3], [bx + 3, by + bh * s - 3], [bx + bw * s - 3, by + bh * s - 3]] : [];
  const blockFill = around ?? tint;
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <Defs>{light}</Defs>
      {frame === 'postcard' ? (
        <>
          <Rect x={0} y={0} width={width} height={height} fill={colors.surfaceAlt} />
          {/* A faint shadow under the block: two soft steps. */}
          <Rect x={bx - 1} y={by + 2} width={bw * s + 2} height={bh * s + 3} rx={5} fill={colors.checker} fillOpacity={0.07} />
          <Rect x={bx} y={by + 1} width={bw * s} height={bh * s + 1} rx={4} fill={colors.checker} fillOpacity={0.1} />
          <Rect x={bx} y={by} width={bw * s} height={bh * s} rx={3} fill={blockFill} />
          {around ? null : <Rect x={bx} y={by} width={bw * s} height={bh * s} rx={3} fill={colors.checker} fillOpacity={0.2} />}
        </>
      ) : (
        <>
          <Rect x={0} y={0} width={width} height={height} fill={blockFill} />
          {around ? null : <Rect x={0} y={0} width={width} height={height} fill={colors.checker} fillOpacity={0.2} />}
        </>
      )}
      {centres.map((c, i) => <OneCourt key={i} cx={c.x} cy={c.y} s={s} portrait={portrait} tint={tint} lw={lw} grass={surface === 'grass'} />)}
      {posts.map(([x, y], i) => (
        <G key={i}>
          <Circle cx={x} cy={y} r={5} fill={colors.onMedia} fillOpacity={0.16} />
          <Circle cx={x} cy={y} r={1.8} fill={colors.onMedia} />
        </G>
      ))}
      {frame === 'postcard'
        ? <Rect x={bx} y={by} width={bw * s} height={bh * s} rx={3} fill={`url(#${gid}-l)`} />
        : <Rect x={0} y={0} width={width} height={height} fill={`url(#${gid}-l)`} />}
    </Svg>
  );
}
