import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { mix, type Look } from '@/components/map/look';
import { colors } from '@/theme';

/*
 * A court's spot as a small still picture of the map, for the court card in
 * a chat (Instagram's location share, iMessage's map card). The map is the
 * app's own MapLibre map in its own colours; drawing it live in every card
 * would mean a map engine per card, so each spot is drawn once, off to the
 * side, photographed, and kept (CourtMapThumb, phone and browser). These are
 * the pieces both share.
 */

/** How close in the picture is: the park and the streets around it. */
export const THUMB_ZOOM = 15;

/** Bump when the map's look changes, so pictures taken in the old look are taken again. */
const LOOK_VERSION = 2;

/** One picture per spot, size, zoom and theme: a new theme (or a dark one) is a new picture. */
export const thumbKey = (theme: string, lat: number, lng: number, width: number, height: number, zoom = THUMB_ZOOM) =>
  `v${LOOK_VERSION}|${theme}|${lat.toFixed(5)},${lng.toFixed(5)}|${zoom}|${Math.round(width)}x${Math.round(height)}`;

/** A short file-safe name for a key (a plain string hash: it only has to tell keys apart). */
export function keyName(key: string): string {
  let a = 5381, b = 52711;
  for (let i = 0; i < key.length; i += 1) {
    const c = key.charCodeAt(i);
    a = (a * 33) ^ c;
    b = (b * 31) ^ c;
  }
  return `${(a >>> 0).toString(36)}${(b >>> 0).toString(36)}`;
}

/**
 * The order spots are drawn in: one at a time, so a chat full of court cards
 * never runs several map engines at once. Each card waits its turn.
 */
export function makeQueue() {
  const line: string[] = [];
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((fn) => fn());
  return {
    subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    /** Joins the line (once); the first in line is the one being drawn. */
    join(key: string) { if (!line.includes(key)) { line.push(key); emit(); } },
    /** Leaves it (drawn, failed, or the card went away). */
    leave(key: string) { const i = line.indexOf(key); if (i >= 0) { line.splice(i, 1); emit(); } },
    first: () => line[0] ?? null,
    emit,
  };
}

/**
 * What shows while the picture is being drawn, and in its place if it cannot
 * be (no signal): the map's own ground with a few soft streets and a park,
 * the same every time for the same spot. It reads as a map, never as an error.
 */
export function ThumbStandIn({ look, seed }: { look: Look; seed: string }) {
  // The look always has these; the theme's own colours only stand in should a future look drop one.
  const ground = look.background?.fill ?? colors.bgElevated;
  const road = look.highway_minor?.line ?? colors.surface;
  const park = look.park?.fill ?? mix(ground, colors.grass, 0.3);
  let h = 7;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) % 9973;
  const r = (n: number) => ((h * (n + 3) * 7919) % 1000) / 1000;
  const tilt = 8 + r(1) * 18;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width="100%" height="100%" viewBox="0 0 240 120" preserveAspectRatio="xMidYMid slice">
        <Rect x={0} y={0} width={240} height={120} fill={ground} />
        <Path d={`M${30 + r(2) * 40} ${20 + r(3) * 20} h${70 + r(4) * 30} v${42 + r(5) * 20} h-${80 + r(6) * 20} z`} fill={park} opacity={0.9} />
        <Path d={`M-10 ${60 + tilt} L250 ${60 - tilt}`} stroke={road} strokeWidth={7} strokeLinecap="round" />
        <Path d={`M${70 + r(7) * 60} -10 L${90 + r(8) * 60} 130`} stroke={road} strokeWidth={5} strokeLinecap="round" />
        <Path d={`M-10 ${18 + r(9) * 12} L250 ${26 + r(10) * 12}`} stroke={road} strokeWidth={3} strokeLinecap="round" opacity={0.8} />
        <Path d={`M${180 + r(11) * 30} -10 L${165 + r(12) * 30} 130`} stroke={road} strokeWidth={3} strokeLinecap="round" opacity={0.8} />
      </Svg>
    </View>
  );
}
