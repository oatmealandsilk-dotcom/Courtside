import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, { Easing, type SharedValue, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { CourtGlyph } from '@/components/map/CourtGlyph';
import { CourtMapSnapshots, CourtMapThumb } from '@/components/map/CourtMapThumb';
import { ordinal } from '@/features/courtUnlocks/DesignParts';
import { MY_COURTS, NEW_COURT_FACTS } from '@/features/courtUnlocks/designDemo';
import { latOf, lngOf, worldSize, worldX, worldY } from '@/features/courtUnlocks/mapMath';
import { CloseButton, UnlockActions, UnlockRows, useUnlock } from '@/features/courtUnlocks/UnlockParts';
import * as haptics from '@/lib/haptics';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, spacing, typography, withAlpha } from '@/theme';
import { corner } from '@/theme/look';
import { TextScale } from '@/theme/textScale';

/** Street level, where the new court lights up. */
const Z0 = 15.4;
/** Map pictures from close to wide; the zoom hands from one to the next as it pulls back. */
const LAYERS = 4;
/** A picture fades out over this stretch of zoom, just after its own zoom is passed. */
const FADE_FROM = 0.12;
const FADE_TO = 0.42;
const EASE = Easing.bezier(0.22, 1, 0.36, 1);
const NEW_TILE = 34;
const OLD_TILE = 26;

type Pt = { x: number; y: number };
interface Layer { z: number; cx: number; cy: number; lat: number; lng: number; w: number; h: number; last: boolean }

/**
 * DESIGN BRANCH ONLY. Court unlocked, option C, "Your map" (round 3). It
 * opens close in on the new court, its mark plain; the mark fills with your
 * colour and one ring goes out from it. Then the map pulls back, the way
 * the real map flies, until every court you have unlocked round home is on
 * it, each one coming in as it comes into view; the new one stays the
 * biggest. Then the words come up over the bottom of the map.
 *
 * The pull-back is a stack of still map pictures, close to wide, each
 * handing over to the next as its zoom is passed, all moved together about
 * the one spot that stays put (so it reads as one camera). Every frame is
 * worked out on the UI thread from one number, the zoom. It waits for the
 * pictures before it moves. On the phone the same moment would fly the real
 * map instead. Reduce Motion: it opens already pulled back, words up.
 */
export function UnlockZoom() {
  const styles = useThemedStyles(styleDefinitions);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const still = useReducedMotion();
  const { court: fresh, nth } = useUnlock();
  const W = Math.min(width, 560);
  const H = height;
  const home = MY_COURTS.filter((c) => !c.town);
  const away = MY_COURTS.length - home.length;

  // The camera: from close in on the new court (zoom Z0) to all your home courts in the top half (zoom z1),
  // as one zoom about the spot that stays put on screen (P, at S).
  const plan = useMemo(() => {
    const F: Pt = { x: W / 2, y: H / 2 };
    const pts = home.map((c) => ({ name: c.name, x: worldX(c.lng), y: worldY(c.lat) }));
    const c0: Pt = { x: worldX(fresh.lng), y: worldY(fresh.lat) };
    const region = { left: 48, right: W - 48, top: insets.top + 84, bottom: Math.round(H * 0.36) };
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const box = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
    const fit = Math.min((region.right - region.left) / Math.max(1e-9, box.x1 - box.x0), (region.bottom - region.top) / Math.max(1e-9, box.y1 - box.y0));
    const z1 = Math.min(13.4, Math.log2(fit / 512));
    const K0 = worldSize(Z0);
    const K1 = worldSize(z1);
    const mid: Pt = { x: (region.left + region.right) / 2, y: (region.top + region.bottom) / 2 };
    const c1: Pt = { x: (box.x0 + box.x1) / 2 - (mid.x - F.x) / K1, y: (box.y0 + box.y1) / 2 - (mid.y - F.y) / K1 };
    const P: Pt = { x: (c0.x * K0 - c1.x * K1) / (K0 - K1), y: (c0.y * K0 - c1.y * K1) / (K0 - K1) };
    const S: Pt = { x: F.x + (P.x - c0.x) * K0, y: F.y + (P.y - c0.y) * K0 };
    // Each picture big enough to still cover the screen when it has shrunk and drifted to where it fades out.
    const sEnd = Math.pow(2, -FADE_TO);
    const growX = ((W / 2 + (1 - sEnd) * Math.abs(S.x - F.x)) / (sEnd * (W / 2))) * 1.04;
    const growY = ((H / 2 + (1 - sEnd) * Math.abs(S.y - F.y)) / (sEnd * (H / 2))) * 1.04;
    const layers: Layer[] = Array.from({ length: LAYERS }, (_, i) => {
      const z = Z0 + ((z1 - Z0) * i) / (LAYERS - 1);
      const K = worldSize(z);
      const cx = P.x - (S.x - F.x) / K;
      const cy = P.y - (S.y - F.y) / K;
      const last = i === LAYERS - 1;
      return { z, cx, cy, lat: latOf(cy), lng: lngOf(cx), w: Math.round(W * (last ? 1 : growX)), h: Math.round(H * (last ? 1 : growY)), last };
    });
    // The older courts come in one by one, nearest the new one first.
    const order = pts.filter((p) => p.name !== fresh.name).sort((a, b) => Math.hypot(a.x - c0.x, a.y - c0.y) - Math.hypot(b.x - c0.x, b.y - c0.y));
    return { F, P, S, z1, layers, c0, order };
  }, [W, H, insets.top]); // eslint-disable-line react-hooks/exhaustive-deps

  const z = useSharedValue(still ? plan.z1 : Z0);
  const lit = useSharedValue(still ? 1 : 0);
  const ring = useSharedValue(still ? 1 : 0);
  const words = useSharedValue(still ? 1 : 0);

  // Wait for the pictures (or 5 seconds) before anything moves.
  const [ready, setReady] = useState(false);
  const shown = useRef(new Set<number>());
  const onShown = useCallback((i: number) => {
    shown.current.add(i);
    if (shown.current.size >= LAYERS) setReady(true);
  }, []);
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 5000);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    if (still || !ready) return undefined;
    lit.value = withDelay(250, withTiming(1, { duration: 420, easing: EASE }));
    ring.value = withDelay(300, withTiming(1, { duration: 1000, easing: Easing.out(Easing.cubic) }));
    z.value = withDelay(1050, withTiming(plan.z1, { duration: 2000, easing: Easing.inOut(Easing.cubic) }));
    words.value = withDelay(2650, withTiming(1, { duration: 600, easing: EASE }));
    const t = setTimeout(() => haptics.reward(), 420);
    return () => clearTimeout(t);
  }, [still, ready, plan.z1, lit, ring, z, words]);

  const wordsIn = useAnimatedStyle(() => ({ opacity: words.value, transform: [{ translateY: 18 * (1 - words.value) }] }));
  const fadeIn = useAnimatedStyle(() => ({ opacity: words.value }));
  const appearAt = (j: number) => Z0 - 0.9 - j * 0.32;

  return (
    <View style={styles.page}>
      <CourtMapSnapshots />
      <View style={[styles.mapBox, { width: W, height: H }]}>
        {/* Close first (it is the one drawn first and lies on top), wide last. */}
        {plan.layers.map((layer, i) => (
          <ZoomLayer key={i} index={i} layer={layer} z={z} P={plan.P} S={plan.S} F={plan.F} onShown={onShown} />
        ))}
        {plan.order.map((p, j) => (
          <ZoomTile key={p.name} at={p} z={z} P={plan.P} S={plan.S} appear={appearAt(j)} />
        ))}
        <NewTile at={plan.c0} z={z} P={plan.P} S={plan.S} lit={lit} ring={ring} tag={words} />
        {/* The bottom of the map fades into the page as the words come up. */}
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { zIndex: 30 }, fadeIn]}>
          <Svg width={W} height={H}>
            <Defs>
              <LinearGradient id="zoomFade" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={colors.bg} stopOpacity={0.25} />
                <Stop offset="0.1" stopColor={colors.bg} stopOpacity={0} />
                <Stop offset="0.39" stopColor={colors.bg} stopOpacity={0} />
                <Stop offset="0.52" stopColor={colors.bg} stopOpacity={1} />
                <Stop offset="1" stopColor={colors.bg} stopOpacity={1} />
              </LinearGradient>
            </Defs>
            <Rect x={0} y={0} width={W} height={H} fill="url(#zoomFade)" />
          </Svg>
        </Animated.View>
      </View>
      <CloseButton top={insets.top + 10} />

      <Animated.View style={[styles.body, { paddingBottom: insets.bottom + spacing.lg }, wordsIn]}>
        <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.over}>Court unlocked</Text>
        <Text maxFontSizeMultiplier={TextScale.TITLE} style={styles.name} numberOfLines={3}>{fresh.name}</Text>
        <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.meta}>
          <Text style={styles.metaStrong}>Your {ordinal(nth)} court</Text>
          {` · ${home.length} in ${NEW_COURT_FACTS.city}${away ? `, ${away} away` : ''}`}
        </Text>
        <View style={styles.rows}><UnlockRows /></View>
        <UnlockActions />
      </Animated.View>
    </View>
  );
}

/** One map picture in the stack, placed and sized from the zoom each frame. */
function ZoomLayer({ index, layer, z, P, S, F, onShown }: { index: number; layer: Layer; z: SharedValue<number>; P: Pt; S: Pt; F: Pt; onShown: (i: number) => void }) {
  const { z: zi, cx, cy, w, h, last } = layer;
  const style = useAnimatedStyle(() => {
    const K = worldSize(z.value);
    const s = Math.pow(2, z.value - zi);
    const o = last ? 1 : Math.min(1, Math.max(0, (z.value - (zi - FADE_TO)) / (FADE_TO - FADE_FROM)));
    return {
      opacity: o,
      transform: [{ translateX: S.x + (cx - P.x) * K - F.x }, { translateY: S.y + (cy - P.y) * K - F.y }, { scale: s }],
    };
  });
  const shown = useCallback(() => onShown(index), [index, onShown]);
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: F.x - w / 2, top: F.y - h / 2, width: w, height: h, zIndex: LAYERS - index }, style]}>
      <CourtMapThumb lat={layer.lat} lng={layer.lng} width={w} height={h} zoom={Number(zi.toFixed(3))} onShown={shown} />
    </Animated.View>
  );
}

/** One of your older courts, as the map shows a court of yours: it comes in as the map pulls back. */
function ZoomTile({ at, z, P, S, appear }: { at: Pt; z: SharedValue<number>; P: Pt; S: Pt; appear: number }) {
  const styles = useThemedStyles(styleDefinitions);
  const style = useAnimatedStyle(() => {
    const K = worldSize(z.value);
    const a = Math.min(1, Math.max(0, (appear - z.value) / 0.3));
    return {
      opacity: a,
      transform: [{ translateX: S.x + (at.x - P.x) * K - OLD_TILE / 2 }, { translateY: S.y + (at.y - P.y) * K - OLD_TILE / 2 }, { scale: 0.55 + 0.45 * a }],
    };
  });
  return (
    <Animated.View pointerEvents="none" style={[styles.tile, { width: OLD_TILE, height: OLD_TILE, borderRadius: corner(8) }, style]}>
      <CourtGlyph size={11} color={colors.brandInk} />
    </Animated.View>
  );
}

/** The new court: plain to begin with, then it fills with your colour and one ring goes out. */
function NewTile({ at, z, P, S, lit, ring, tag }: { at: Pt; z: SharedValue<number>; P: Pt; S: Pt; lit: SharedValue<number>; ring: SharedValue<number>; tag: SharedValue<number> }) {
  const styles = useThemedStyles(styleDefinitions);
  const place = useAnimatedStyle(() => {
    const K = worldSize(z.value);
    const pop = 1 + 0.16 * Math.sin(Math.PI * Math.min(1, lit.value));
    return { transform: [{ translateX: S.x + (at.x - P.x) * K - 40 }, { translateY: S.y + (at.y - P.y) * K - 40 }, { scale: pop }] };
  });
  const on = useAnimatedStyle(() => ({ opacity: lit.value }));
  const out = useAnimatedStyle(() => ({ opacity: ring.value > 0 && ring.value < 1 ? 0.7 * (1 - ring.value) : 0, transform: [{ scale: 0.9 + 1.5 * ring.value }] }));
  const tagIn = useAnimatedStyle(() => ({ opacity: tag.value, transform: [{ translateY: 4 * (1 - tag.value) }] }));
  return (
    <Animated.View pointerEvents="none" style={[styles.newBox, place]}>
      <Animated.View style={[styles.ring, out]} />
      {/* "New", as on its card in Your courts, once the map has pulled back. */}
      <Animated.View style={[styles.tag, tagIn]}><Text maxFontSizeMultiplier={1.1} style={styles.tagText}>New</Text></Animated.View>
      <View style={[styles.tile, styles.tileOff, { width: NEW_TILE, height: NEW_TILE, borderRadius: corner(10) }]}>
        <CourtGlyph size={14} color={colors.textMuted} />
      </View>
      <Animated.View style={[styles.tile, styles.tileOn, { width: NEW_TILE, height: NEW_TILE, borderRadius: corner(10) }, on]}>
        <CourtGlyph size={14} color={colors.brandInk} />
      </Animated.View>
    </Animated.View>
  );
}

const styleDefinitions = StyleSheet.create({
  page: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: colors.bg, alignItems: 'center' },
  mapBox: { position: 'absolute', top: 0, zIndex: 0, overflow: 'hidden', backgroundColor: colors.surfaceAlt },
  tile: { position: 'absolute', left: 0, top: 0, zIndex: 10, backgroundColor: colors.brand, borderWidth: 2.5, borderColor: colors.bg, alignItems: 'center', justifyContent: 'center', boxShadow: '0px 3px 8px rgba(0, 0, 0, 0.22)' },
  tileOff: { position: 'absolute', left: 23, top: 23, backgroundColor: colors.bg, borderColor: colors.borderStrong, borderWidth: 1.5 },
  tileOn: { position: 'absolute', left: 23, top: 23 },
  newBox: { position: 'absolute', left: 0, top: 0, width: 80, height: 80, zIndex: 11 },
  ring: { position: 'absolute', left: 13, top: 13, width: 54, height: 54, borderRadius: 27, borderWidth: 2, borderColor: withAlpha(colors.brand, 0.9) },
  tag: { position: 'absolute', left: 58, top: 30, height: 20, paddingHorizontal: 7, borderRadius: 10, backgroundColor: colors.bg, justifyContent: 'center', boxShadow: '0px 2px 6px rgba(0, 0, 0, 0.16)' },
  tagText: { ...font('700'), fontSize: 11, color: colors.brand },
  body: { position: 'absolute', bottom: 0, zIndex: 1, width: '100%', maxWidth: 560, paddingHorizontal: spacing.lg + 4 },
  over: { ...font('600'), fontSize: 16, color: colors.brand },
  name: { ...font('700'), fontSize: 40, lineHeight: 42, letterSpacing: -1.5, color: colors.text, marginTop: 6 },
  meta: { ...typography.small, color: colors.textMuted, marginTop: 10 },
  metaStrong: { ...font('600'), color: colors.text },
  rows: { marginTop: spacing.xl },
});
