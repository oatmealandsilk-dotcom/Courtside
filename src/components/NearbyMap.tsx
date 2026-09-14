import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Platform, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Avatar } from '@/components/ui';
import type { User } from '@/data/types';
import { colors, radius, spacing, typography } from '@/theme';

const HEIGHT = 220;

/** Stable 0–1 pair from a string, so a player always lands in the same spot. */
function place(seed: string): { x: number; y: number } {
  let hash = 7;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) % 65521;
  const x = 0.12 + ((hash % 1000) / 1000) * 0.76;
  const y = 0.14 + (((hash >> 4) % 1000) / 1000) * 0.66;
  return { x, y };
}

/**
 * A schematic map of who is around you. There is no location permission in
 * this build, so players are scattered deterministically around you at the
 * centre — the shape of the real thing, without the tiles or the tracking.
 *
 * In the community tab it is a card that opens into its own page; expanded,
 * it fills the page and shows everyone rather than the nearest handful.
 */
/** The full map is this many screens wide and tall; you drag around it. */
const WORLD = 2.4;
const MIN_ZOOM = 0.6;
const MAX_ZOOM = 2.5;

/** Tells the browser this box handles its own touches, so a drag pans the map instead of the page. */
const ownTouches = Platform.OS === 'web' ? ({ touchAction: 'none' } as unknown as ViewStyle) : null;

const distance = (a: { pageX: number; pageY: number }, b: { pageX: number; pageY: number }) =>
  Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);

export function NearbyMap({ me, players, onOpen, onExpand, expanded = false }: {
  me: User; players: User[]; onOpen: (id: string) => void;
  /** Tapping the card or the expand button opens the full map. */
  onExpand?: () => void;
  expanded?: boolean;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const nearby = expanded ? players.slice(0, 24) : players.slice(0, 8);

  /* ------------------------ Drag and pinch (full map) --------------------- */

  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const zoom = useRef(new Animated.Value(1)).current;
  const state = useRef({ x: 0, y: 0, zoom: 1, pinchStart: 0, zoomStart: 1, pinching: false, midX: 0, midY: 0 });
  const centred = useRef(false);

  const world = { width: viewport.width * WORLD, height: viewport.height * WORLD };

  /** Keeps the world covering the viewport, so you never drag into blank space. */
  const clamp = (x: number, y: number, z: number) => {
    const w = world.width * z;
    const h = world.height * z;
    const minX = Math.min(0, viewport.width - w);
    const minY = Math.min(0, viewport.height - h);
    return { x: Math.max(minX, Math.min(0, x)), y: Math.max(minY, Math.min(0, y)) };
  };

  // Open on yourself, in the middle, the first time the size is known.
  if (expanded && viewport.width && !centred.current) {
    centred.current = true;
    const start = clamp((viewport.width - world.width) / 2, (viewport.height - world.height) / 2, 1);
    state.current.x = start.x;
    state.current.y = start.y;
    pan.setValue(start);
  }

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        // A tap still reaches a pin; only a real move takes the gesture.
        onMoveShouldSetPanResponder: (e, g) => expanded && (e.nativeEvent.touches.length === 2 || Math.abs(g.dx) > 6 || Math.abs(g.dy) > 6),
        onPanResponderGrant: (e) => {
          const touches = e.nativeEvent.touches;
          state.current.pinching = touches.length === 2;
          if (touches.length === 2) {
            state.current.pinchStart = distance(touches[0], touches[1]);
            state.current.zoomStart = state.current.zoom;
            state.current.midX = (touches[0].pageX + touches[1].pageX) / 2;
            state.current.midY = (touches[0].pageY + touches[1].pageY) / 2;
          }
        },
        onPanResponderMove: (e, g) => {
          const touches = e.nativeEvent.touches;
          if (touches.length === 2) {
            const midX = (touches[0].pageX + touches[1].pageX) / 2;
            const midY = (touches[0].pageY + touches[1].pageY) / 2;
            if (!state.current.pinching) {
              state.current.pinching = true;
              state.current.pinchStart = distance(touches[0], touches[1]);
              state.current.zoomStart = state.current.zoom;
              state.current.midX = midX;
              state.current.midY = midY;
            }
            const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, (state.current.zoomStart * distance(touches[0], touches[1])) / Math.max(1, state.current.pinchStart)));
            zoomAround(next, { x: viewport.width / 2, y: viewport.height / 2 }, false);
            // The two fingers drifting together is a pan on top of the pinch.
            const moved = clamp(state.current.x + (midX - state.current.midX), state.current.y + (midY - state.current.midY), state.current.zoom);
            state.current.x = moved.x;
            state.current.y = moved.y;
            state.current.midX = midX;
            state.current.midY = midY;
            pan.setValue(moved);
            return;
          }
          const moved = clamp(state.current.x + g.dx, state.current.y + g.dy, state.current.zoom);
          pan.setValue(moved);
        },
        onPanResponderRelease: (_, g) => {
          if (state.current.pinching) { state.current.pinching = false; return; }
          const settled = clamp(state.current.x + g.dx, state.current.y + g.dy, state.current.zoom);
          state.current.x = settled.x;
          state.current.y = settled.y;
          state.current.pinching = false;
          Animated.spring(pan, { toValue: settled, useNativeDriver: true, speed: 20, bounciness: 4 }).start();
        },
        onPanResponderTerminate: () => { state.current.pinching = false; pan.setValue({ x: state.current.x, y: state.current.y }); },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [expanded, viewport.width, viewport.height],
  );

  /**
   * Zooms so the map point under `focal` (viewport coordinates) stays put —
   * what a trackpad pinch or a two-finger pinch is expected to do.
   */
  const zoomAround = (z: number, focal: { x: number; y: number }, animate: boolean) => {
    const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
    const ratio = next / state.current.zoom;
    const target = clamp(focal.x - (focal.x - state.current.x) * ratio, focal.y - (focal.y - state.current.y) * ratio, next);
    state.current.zoom = next;
    state.current.x = target.x;
    state.current.y = target.y;
    if (animate) {
      Animated.parallel([
        Animated.spring(zoom, { toValue: next, useNativeDriver: true, speed: 20, bounciness: 4 }),
        Animated.spring(pan, { toValue: target, useNativeDriver: true, speed: 20, bounciness: 4 }),
      ]).start();
    } else {
      zoom.setValue(next);
      pan.setValue(target);
    }
  };

  // Computer: a trackpad pinch arrives as a wheel event with ctrlKey held;
  // a plain wheel pans. Both are ours, not the page's.
  const mapNode = useRef<View | null>(null);
  React.useEffect(() => {
    if (Platform.OS !== 'web' || !expanded) return;
    const el = mapNode.current as unknown as HTMLElement | null;
    if (!el || typeof el.addEventListener !== 'function') return;
    const slide = (dx: number, dy: number) => {
      if (!dx && !dy) return;
      const moved = clamp(state.current.x + dx, state.current.y + dy, state.current.zoom);
      state.current.x = moved.x;
      state.current.y = moved.y;
      pan.setValue(moved);
    };
    // Chrome and Firefox: a pinch is a wheel with Ctrl held. Any sideways
    // movement in the same event still pans, so zooming and sliding mix.
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = el.getBoundingClientRect();
      const focal = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      if (event.ctrlKey || event.metaKey) {
        zoomAround(state.current.zoom * Math.exp(-event.deltaY * 0.01), focal, false);
        slide(-event.deltaX, 0);
      } else {
        slide(-event.deltaX, -event.deltaY);
      }
    };
    // Safari reports a trackpad pinch as gesture events whose centre moves
    // with the fingers, so a pinch that drifts sideways pans as it zooms.
    type Gesture = Event & { scale: number; clientX: number; clientY: number };
    let gestureZoom = 1;
    let gestureAt = { x: 0, y: 0 };
    const onGestureStart = (event: Event) => {
      const g = event as Gesture;
      event.preventDefault();
      gestureZoom = state.current.zoom;
      gestureAt = { x: g.clientX, y: g.clientY };
    };
    const onGestureChange = (event: Event) => {
      const g = event as Gesture;
      event.preventDefault();
      const rect = el.getBoundingClientRect();
      zoomAround(gestureZoom * g.scale, { x: g.clientX - rect.left, y: g.clientY - rect.top }, false);
      slide(g.clientX - gestureAt.x, g.clientY - gestureAt.y);
      gestureAt = { x: g.clientX, y: g.clientY };
    };
    const onGestureEnd = (event: Event) => event.preventDefault();
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('gesturestart', onGestureStart, { passive: false });
    el.addEventListener('gesturechange', onGestureChange, { passive: false });
    el.addEventListener('gestureend', onGestureEnd, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('gesturestart', onGestureStart);
      el.removeEventListener('gesturechange', onGestureChange);
      el.removeEventListener('gestureend', onGestureEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, viewport.width, viewport.height]);

  const zoomTo = (z: number) => {
    const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
    state.current.zoom = next;
    const settled = clamp(state.current.x, state.current.y, next);
    state.current.x = settled.x;
    state.current.y = settled.y;
    Animated.parallel([
      Animated.spring(zoom, { toValue: next, useNativeDriver: true, speed: 20, bounciness: 4 }),
      Animated.spring(pan, { toValue: settled, useNativeDriver: true, speed: 20, bounciness: 4 }),
    ]).start();
  };

  const pins = nearby.map((player) => {
    const { x, y } = place(player.avatarSeed);
    return (
      <Pressable
        key={player.id}
        accessibilityRole="link"
        accessibilityLabel={`${player.name}, open profile`}
        onPress={() => onOpen(player.id)}
        style={[styles.pin, { left: `${x * 100}%`, top: `${y * 100}%` }]}
      >
        <View style={styles.pinRing}>
          <Avatar name={player.name} seed={player.avatarSeed} size={30} ring={player.isCoach} />
        </View>
      </Pressable>
    );
  });

  const scenery = (
    <>
      {[0.25, 0.5, 0.75].map((f) => (
        <React.Fragment key={f}>
          <View style={[styles.gridLine, { top: `${f * 100}%`, left: 0, right: 0, height: 1 }]} />
          <View style={[styles.gridLine, { left: `${f * 100}%`, top: 0, bottom: 0, width: 1 }]} />
        </React.Fragment>
      ))}
      <View style={[styles.road, { top: '38%', transform: [{ rotate: '-8deg' }] }]} />
      <View style={[styles.road, { top: '66%', transform: [{ rotate: '5deg' }] }]} />
      <View style={styles.ring} />
    </>
  );

  if (expanded) {
    return (
      <View style={styles.card}>
        <View style={styles.head}>
          <Ionicons name="location-outline" size={16} color={colors.brand} />
          <Text style={styles.title}>Players near {me.location.trim() ? me.location.split(',')[0] : 'you'}</Text>
          <Text style={styles.count}>{nearby.length}</Text>
        </View>
        <View
          ref={mapNode}
          style={[styles.map, styles.mapExpanded, ownTouches]}
          onLayout={(e) => setViewport({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
          {...responder.panHandlers}
        >
          {viewport.width ? (
            <Animated.View
              style={{
                position: 'absolute', left: 0, top: 0, width: world.width, height: world.height,
                transform: [{ translateX: pan.x }, { translateY: pan.y }, { scale: zoom }],
                transformOrigin: 'top left',
              }}
            >
              {scenery}
              {pins}
              <View style={[styles.pin, styles.mePin]}>
                <View style={styles.meDot} />
              </View>
            </Animated.View>
          ) : null}
          <View style={styles.zoomControls}>
            <Pressable accessibilityRole="button" accessibilityLabel="Zoom in" onPress={() => zoomTo(state.current.zoom * 1.35)} style={styles.zoomButton}>
              <Ionicons name="add" size={18} color={colors.text} />
            </Pressable>
            <View style={styles.zoomRule} />
            <Pressable accessibilityRole="button" accessibilityLabel="Zoom out" onPress={() => zoomTo(state.current.zoom / 1.35)} style={styles.zoomButton}>
              <Ionicons name="remove" size={18} color={colors.text} />
            </Pressable>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to me"
            onPress={() => { const c = clamp((viewport.width - world.width * state.current.zoom) / 2, (viewport.height - world.height * state.current.zoom) / 2, state.current.zoom); state.current.x = c.x; state.current.y = c.y; Animated.spring(pan, { toValue: c, useNativeDriver: true, speed: 20, bounciness: 4 }).start(); }}
            style={styles.locate}
          >
            <Ionicons name="locate-outline" size={18} color={colors.brand} />
          </Pressable>
        </View>
        <Text style={styles.hint}>Drag to move around. Pinch or use + / − to zoom. Tap a player to open their profile.</Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Ionicons name="location-outline" size={16} color={colors.brand} />
        <Text style={styles.title}>Players near {me.location.trim() ? me.location.split(',')[0] : 'you'}</Text>
        <Text style={styles.count}>{nearby.length}</Text>
        {onExpand ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Open map" onPress={onExpand} hitSlop={8} style={styles.expand}>
            <Ionicons name="expand-outline" size={16} color={colors.brand} />
            <Text style={styles.expandText}>Open map</Text>
          </Pressable>
        ) : null}
      </View>
      <Pressable
        accessibilityRole={onExpand ? 'button' : undefined}
        accessibilityLabel="Map of players near you"
        onPress={onExpand}
        disabled={!onExpand}
        style={[styles.map, expanded && styles.mapExpanded]}
      >
        {scenery}
        {pins}
        <View style={[styles.pin, styles.mePin]}>
          <View style={styles.meDot} />
        </View>
      </Pressable>
      <Text style={styles.hint}>Tap the map to open it. The badge means coach.</Text>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md },
  title: { ...typography.smallStrong, color: colors.text, flex: 1 },
  count: { ...typography.caption, color: colors.textFaint, letterSpacing: 0 },
  expand: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: spacing.sm },
  expandText: { ...typography.caption, color: colors.brand, letterSpacing: 0 },
  map: { height: HEIGHT, backgroundColor: colors.bgElevated, overflow: 'hidden' },
  mapExpanded: { height: 520, backgroundColor: colors.bgElevated },
  zoomControls: { position: 'absolute', right: 10, top: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg, overflow: 'hidden' },
  zoomButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  zoomRule: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  locate: { position: 'absolute', right: 10, bottom: 10, width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  gridLine: { position: 'absolute', backgroundColor: colors.border, opacity: 0.6 },
  road: { position: 'absolute', left: -20, right: -20, height: 6, borderRadius: 3, backgroundColor: colors.surfaceAlt },
  ring: {
    position: 'absolute', left: '50%', top: '50%', width: 150, height: 150, marginLeft: -75, marginTop: -75,
    borderRadius: 75, borderWidth: 1, borderColor: colors.brand, opacity: 0.35,
  },
  pin: { position: 'absolute', marginLeft: -17, marginTop: -17 },
  pinRing: { padding: 2, borderRadius: radius.pill, backgroundColor: colors.bg },
  mePin: { left: '50%', top: '50%', marginLeft: -9, marginTop: -9 },
  meDot: { width: 18, height: 18, borderRadius: 9, backgroundColor: colors.brand, borderWidth: 3, borderColor: colors.bg },
  hint: { ...typography.caption, color: colors.textFaint, letterSpacing: 0, padding: spacing.md, paddingTop: spacing.sm },
});
