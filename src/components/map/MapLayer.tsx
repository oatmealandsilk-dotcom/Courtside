import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform, StyleSheet, View } from 'react-native';
import Reanimated, { runOnJS, runOnUI, useAnimatedReaction, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NearbyMap } from '@/components/NearbyMap';
import type { LayerMapControl, LayerMapHandle } from '@/components/NearbyMap.types';
import { MapCredit, PreviewOverlay } from '@/components/map/MapChrome';
import { CARD_ZOOM } from '@/components/map/cardFit';
import {
  CAMERA_CLOSE_MS, CAMERA_OPEN_MS, CARD_R, CLOSE, CLOSE_BEZIER, COMMIT_FRAC, COMMIT_V, DEVICE_R, EDGE_COMMIT_FRAC, EDGE_W, OPEN, OPEN_BEZIER, SNAPBACK,
  anyCard, box, cardRect, cardScale, dragging, getCard, layerState, layerUp, openness, setLayerHandle, setLayerState, useCardsVersion, useLayerState, win,
  type LayerSource, type Rect,
} from '@/components/map/mapWindow';
import { TipBubble } from '@/components/TipBubble';
import type { User } from '@/data/types';
import { useCurtainDown } from '@/features/feed/warmup';
import { useMapOpenEffects } from '@/features/players/useMapOpenEffects';
import { useLocationToggle } from '@/features/players/useLocationToggle';
import { useAndroidBack } from '@/lib/androidBack';
import * as haptics from '@/lib/haptics';
import { useApp } from '@/store/AppContext';
import { colors } from '@/theme';
import { useTheme, useThemedStyles } from '@/theme/ThemeProvider';

/** How long after the start page is up (and its card drawn) the map window is made: never in the way of the first paint. */
const MOUNT_AFTER_MS = 600;
/** Made anyway this long after the curtain, card drawn or not (a card whose map never comes still opens the map page). */
const MOUNT_ANYWAY_MS = 4000;
/** Away this long, the map window is made afresh on return (the phone may have trimmed it). */
const STALE_MS = 5 * 60 * 1000;
/** After the phone asks for memory back, the window waits this long before it is made again. */
const MEMORY_REST_MS = 30 * 1000;

/**
 * The full map as a window over the tabs (mapWindow explains the idea). Made
 * once, a moment after the start page is up, it waits shut, looking at
 * exactly what the still card shows. A tap on the card opens it from the
 * card's spot; Back, Android's Back, the browser's Back, Escape, a swipe down
 * on its top bar or (iPhone) a swipe in from the left edge close it into
 * the card again.
 */
export function MapLayer() {
  const { currentUser } = useApp();
  const curtain = useCurtainDown();
  const cardsVersion = useCardsVersion();
  const [mounted, setMounted] = useState(false);
  const [gen, setGen] = useState(0);
  const restUntil = useRef(0);
  const cardPainted = !!anyCard()?.[1].painted;
  useEffect(() => {
    if (mounted || !curtain || !currentUser) return undefined;
    const rest = Math.max(0, restUntil.current - Date.now());
    const t = setTimeout(() => setMounted(true), Math.max(rest, cardPainted ? MOUNT_AFTER_MS : MOUNT_ANYWAY_MS));
    return () => clearTimeout(t);
  }, [mounted, curtain, currentUser, cardPainted, cardsVersion]);
  useEffect(() => {
    let leftAt = 0;
    const change = AppState.addEventListener('change', (s) => {
      if (s === 'background') leftAt = Date.now();
      else if (s === 'active' && leftAt && Date.now() - leftAt > STALE_MS && !layerUp(layerState())) setGen((g) => g + 1);
    });
    // The phone short of memory (the map and the video feed both use a lot): the shut window goes, and is made again later.
    const memory = Platform.OS === 'web' ? null : AppState.addEventListener('memoryWarning', () => {
      if (layerUp(layerState())) return;
      restUntil.current = Date.now() + MEMORY_REST_MS;
      setMounted(false);
    });
    return () => { change.remove(); memory?.remove(); };
  }, []);
  if (!mounted || !currentUser) return null;
  return <LayerBody key={gen} me={currentUser} />;
}

function LayerBody({ me }: { me: User }) {
  const styles = useThemedStyles(styleDefinitions);
  const { users, currentUserId, blockedIds, detectedCoords } = useApp();
  const players = useMemo(() => users.filter((u) => u.id !== currentUserId && !blockedIds.includes(u.id)), [users, currentUserId, blockedIds]);
  const location = useLocationToggle('map');
  const { dark } = useTheme();
  const insets = useSafeAreaInsets();
  const deviceR = Platform.OS === 'ios' && insets.bottom > 0 ? DEVICE_R : 0;
  const state = useLayerState();
  const up = layerUp(state);
  // The pins: the card's while shut, the full map's while open (one change each way).
  const [mode, setMode] = useState<'card' | 'full'>('card');
  // Open and still: prompts, the tip and a late location fix may come now.
  const [settled, setSettled] = useState(false);
  // Takes touches (from nearly open until it starts to close).
  const [touchable, setTouchable] = useState(false);
  const [source, setSource] = useState<LayerSource | null>(null);
  const sourceNow = useRef(source);
  sourceNow.current = source;
  useCardsVersion();
  const card = (source ? getCard(source) : undefined) ?? anyCard()?.[1];
  const parkedCenter = card?.center;
  const parkedMarkers = card?.markers;
  const parked = useMemo(() => (parkedCenter && parkedMarkers ? { center: parkedCenter, markers: parkedMarkers } : null), [parkedCenter?.lat, parkedCenter?.lng, parkedMarkers]); // eslint-disable-line react-hooks/exhaustive-deps
  const parkedNow = useRef(parked);
  parkedNow.current = parked;
  const overlay = card?.overlay ?? null;

  const handle = useRef<LayerMapHandle | null>(null);
  const back = useRef<(() => boolean) | null>(null);
  const { whoTip } = useMapOpenEffects(location, settled);

  // Getting ready: once its map has drawn, it visits where it opens to (so those streets are
  // already in) and comes back to the card's view; only then is a tap on the card its to open.
  const warmFallback = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onWarm = useCallback(() => {
    if (warmFallback.current) clearTimeout(warmFallback.current);
    if (layerState() === 'cold') setLayerState('ready');
  }, []);
  const onPainted = useCallback(() => {
    const h = handle.current;
    const at = parkedNow.current;
    if (!h || !at) { onWarm(); return; }
    const t = h.openTarget();
    h.warm(t.center, t.zoom, at.center, CARD_ZOOM);
    // Streets that never settle (a slow line) do not keep the window shut for good.
    warmFallback.current = setTimeout(onWarm, 8000);
  }, [onWarm]);
  useEffect(() => () => {
    if (warmFallback.current) clearTimeout(warmFallback.current);
    setLayerState('cold');
    setLayerHandle(null);
  }, []);
  // Shut, it follows the card (your city changing, your location arriving).
  useEffect(() => {
    if (state !== 'ready' || !parked) return;
    handle.current?.jump(parked.center, CARD_ZOOM);
  }, [parked?.center.lat, parked?.center.lng, state]); // eslint-disable-line react-hooks/exhaustive-deps

  // Where the layer itself sits on the screen (beside the sidebar in a wide browser).
  const origin = useRef({ x: 0, y: 0 });
  const root = useRef<View | null>(null);

  const closeStarted = useRef(0);
  const opened = useCallback(() => {
    if (layerState() !== 'opening') return;
    setLayerState('open');
    setTimeout(() => { if (layerState() === 'open') setSettled(true); }, 100);
  }, []);
  const collapsed = useCallback((dismissed: boolean) => {
    if (layerState() !== 'closing') return;
    const finish = () => {
      if (layerState() !== 'closing') return;
      runOnUI(() => {
        'worklet';
        win.x.value = 0; win.y.value = 0; win.w.value = 0; win.h.value = 0;
      })();
      const c = parkedNow.current;
      if (dismissed && c) handle.current?.jump(c.center, CARD_ZOOM);
      setLayerState('ready');
    };
    // The camera still easing into the card's view: the window waits on the card (at most 150 ms), so the hand-over is exact.
    const left = Math.min(150, Math.max(0, CAMERA_CLOSE_MS - (Date.now() - closeStarted.current)));
    if (left > 0 && !dismissed) setTimeout(finish, left); else finish();
  }, []);

  const open = useCallback((src: LayerSource, rect: Rect, s: number) => {
    const h = handle.current;
    const c = getCard(src);
    if (!h || !c) return;
    const wasClosing = layerState() === 'closing';
    const r = { x: rect.x - origin.current.x, y: rect.y - origin.current.y, w: rect.w, h: rect.h };
    setLayerState('opening');
    setSource(src);
    setMode('full');
    const cur = parkedNow.current;
    if (!wasClosing && cur && (cur.center.lat !== c.center.lat || cur.center.lng !== c.center.lng)) h.jump(c.center, CARD_ZOOM);
    h.pinMode(false);
    const t = h.openTarget();
    h.ease(t.center, t.zoom, CAMERA_OPEN_MS, OPEN_BEZIER);
    h.labels(true, 300, 120);
    if (Platform.OS === 'web') {
      try { window.history.pushState({ ...(window.history.state ?? {}), csMapLayer: 1 }, '', window.location.href); } catch { /* the window still opens */ }
    }
    runOnUI((x: number, y: number, w: number, hh: number, sc: number, fromLive: boolean) => {
      'worklet';
      cardRect.x.value = x; cardRect.y.value = y; cardRect.w.value = w; cardRect.h.value = hh; cardScale.value = sc;
      if (!fromLive) { win.x.value = x; win.y.value = y; win.w.value = w; win.h.value = hh; }
      win.x.value = withSpring(0, OPEN);
      win.y.value = withSpring(0, OPEN);
      win.w.value = withSpring(box.w.value, OPEN);
      win.h.value = withSpring(box.h.value, OPEN, (done) => { if (done) runOnJS(opened)(); });
    })(r.x, r.y, r.w, r.h, s, wasClosing);
  }, [opened]);

  const close = useCallback(async (fling?: { v: number; axis: 'x' | 'y' }, fromHistory = false) => {
    const st = layerState();
    if (st !== 'open' && st !== 'opening') return;
    setLayerState('closing');
    setSettled(false);
    setTouchable(false);
    setMode('card');
    const h = handle.current;
    h?.setInteractive(false);
    h?.labels(false, 200, 0);
    h?.pinMode(true);
    if (Platform.OS === 'web' && !fromHistory) {
      try { if (window.history.state?.csMapLayer) window.history.back(); } catch { /* closes all the same */ }
    }
    const src = sourceNow.current;
    const c = (src ? getCard(src) : undefined) ?? anyCard()?.[1];
    const rect = c ? await c.measure() : null;
    if (layerState() !== 'closing') return;
    const r = rect ? { x: rect.x - origin.current.x, y: rect.y - origin.current.y, w: rect.w, h: rect.h } : null;
    const seen = !!r && r.y + r.h > 0 && r.y < box.h.value && r.x + r.w > 0 && r.x < box.w.value;
    closeStarted.current = Date.now();
    if (c && seen) h?.ease(c.center, CARD_ZOOM, CAMERA_CLOSE_MS, CLOSE_BEZIER);
    const v = fling?.v ?? 0;
    const axisY = fling?.axis !== 'x';
    if (r && seen) {
      runOnUI((x: number, y: number, w: number, hh: number, fv: number, onY: boolean) => {
        'worklet';
        cardRect.x.value = x; cardRect.y.value = y; cardRect.w.value = w; cardRect.h.value = hh; cardScale.value = 1;
        // A swipe let go hands its speed on (Apple's rule): the finger's speed over the way left, times each edge's own way left.
        const left = onY ? y - win.y.value : x - win.x.value;
        const n = Math.abs(left) > 1 ? fv / left : 0;
        win.x.value = withSpring(x, { ...CLOSE, velocity: n * (x - win.x.value) });
        win.y.value = withSpring(y, { ...CLOSE, velocity: n * (y - win.y.value) });
        win.w.value = withSpring(w, { ...CLOSE, velocity: n * (w - win.w.value) });
        win.h.value = withSpring(hh, { ...CLOSE, velocity: n * (hh - win.h.value) }, (done) => { if (done) runOnJS(collapsed)(false); });
      })(r.x, r.y, r.w, r.h, v, axisY);
    } else {
      // The card is off screen (scrolled away, another tab): the window slides away down instead.
      runOnUI((fv: number) => {
        'worklet';
        cardRect.h.value = 0;
        win.y.value = withSpring(box.h.value, { ...CLOSE, velocity: fv }, (done) => { if (done) runOnJS(collapsed)(true); });
      })(axisY ? v : 0);
    }
  }, [collapsed]);
  const closeNow = useRef(close);
  closeNow.current = close;

  useEffect(() => {
    setLayerHandle({ open, close: () => { void closeNow.current(); } });
    return () => setLayerHandle(null);
  }, [open]);

  // Nearly open: it takes touches, and the map its drag and pinch.
  const enableTouch = useCallback(() => {
    if (layerState() !== 'opening' && layerState() !== 'open') return;
    setTouchable(true);
    handle.current?.setInteractive(true);
  }, []);
  useAnimatedReaction(() => openness() > 0.9 && dragging.value === 0, (now, was) => { if (now && !was) runOnJS(enableTouch)(); }, [enableTouch]);

  // Android's Back: whatever is up on the map first, then the window closes.
  useAndroidBack(() => {
    if (!layerUp(layerState())) return false;
    if (back.current?.()) return true;
    void closeNow.current();
    return true;
  }, up);
  // A browser: its Back, and Escape.
  useEffect(() => {
    if (Platform.OS !== 'web' || !up) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') void closeNow.current(); };
    const onPop = () => { if (!window.history.state?.csMapLayer) void closeNow.current(undefined, true); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('popstate', onPop);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('popstate', onPop); };
  }, [up]);

  // Swipes that close it: down from the top bar, and (iPhone) in from the left edge. The window follows the finger.
  const startAt = useSharedValue(0);
  const crossed = useSharedValue(0);
  const snapBack = (vx: number, vy: number) => {
    'worklet';
    const W = box.w.value, H = box.h.value;
    const ny = Math.abs(win.y.value) > 1 ? -vy / win.y.value : 0;
    const nx = Math.abs(win.x.value) > 1 ? -vx / win.x.value : 0;
    const n = Math.abs(win.y.value) > Math.abs(win.x.value) ? ny : nx;
    win.x.value = withSpring(0, { ...SNAPBACK, velocity: n * -win.x.value });
    win.y.value = withSpring(0, { ...SNAPBACK, velocity: n * -win.y.value });
    win.w.value = withSpring(W, { ...SNAPBACK, velocity: n * (W - win.w.value) });
    win.h.value = withSpring(H, { ...SNAPBACK, velocity: n * (H - win.h.value) });
  };
  const flung = useCallback((v: number, axis: 'x' | 'y') => { void closeNow.current({ v, axis }); }, []);
  const topGesture = useMemo(() => Gesture.Pan()
    .enabled(touchable)
    .activeOffsetY([-12, 12])
    .failOffsetX([-16, 16])
    .onStart((e) => { 'worklet'; dragging.value = 1; crossed.value = 0; startAt.value = e.absoluteX; })
    .onUpdate((e) => {
      'worklet';
      const W = box.w.value, H = box.h.value;
      // Up past rest only gives a little (a rubber band, 8 points at most).
      const dy = e.translationY < 0 ? Math.max(-8, e.translationY * 0.55) : e.translationY;
      const k = Math.min(1, Math.max(0, dy / (0.6 * H)));
      const sc = 1 - 0.25 * k;
      const fx = Math.min(W, Math.max(0, startAt.value));
      win.y.value = dy; win.h.value = H * sc; win.w.value = W * sc; win.x.value = fx * (1 - sc);
      if (!crossed.value && dy > COMMIT_FRAC * H) { crossed.value = 1; runOnJS(haptics.commit)(); }
    })
    .onEnd((e) => {
      'worklet';
      dragging.value = 0;
      if (e.velocityY > COMMIT_V || win.y.value > COMMIT_FRAC * box.h.value) runOnJS(flung)(e.velocityY, 'y');
      else snapBack(0, e.velocityY);
    })
    .onFinalize(() => { 'worklet'; dragging.value = 0; }), [touchable, flung]); // eslint-disable-line react-hooks/exhaustive-deps
  const edgeGesture = useMemo(() => Gesture.Pan()
    .enabled(touchable)
    .activeOffsetX(12)
    .failOffsetY([-20, 20])
    .onStart((e) => { 'worklet'; dragging.value = 1; crossed.value = 0; startAt.value = e.absoluteY; })
    .onUpdate((e) => {
      'worklet';
      const W = box.w.value, H = box.h.value;
      const dx = Math.max(0, e.translationX);
      const k = Math.min(1, dx / (0.6 * W));
      const sc = 1 - 0.25 * k;
      const fy = Math.min(H, Math.max(0, startAt.value));
      win.x.value = dx; win.w.value = W * sc; win.h.value = H * sc; win.y.value = fy * (1 - sc);
      if (!crossed.value && dx > EDGE_COMMIT_FRAC * W) { crossed.value = 1; runOnJS(haptics.commit)(); }
    })
    .onEnd((e) => {
      'worklet';
      dragging.value = 0;
      if (e.velocityX > COMMIT_V || win.x.value > EDGE_COMMIT_FRAC * box.w.value) runOnJS(flung)(e.velocityX, 'x');
      else snapBack(e.velocityX, 0);
    })
    .onFinalize(() => { 'worklet'; dragging.value = 0; }), [touchable, flung]); // eslint-disable-line react-hooks/exhaustive-deps

  // The window: where it is (the spring's last breath kept inside the screen) and its corners.
  const web = Platform.OS === 'web';
  const frame = () => {
    'worklet';
    const W = box.w.value, H = box.h.value;
    let x = win.x.value, y = win.y.value, w = win.w.value, h = win.h.value;
    if (x < 0) { w += x; x = 0; }
    if (y < 0 && dragging.value === 0) { h += y; y = 0; }
    w = Math.max(0, Math.min(w, W - x));
    h = Math.max(0, Math.min(h, H - Math.max(0, y)));
    return { x, y, w, h, W, H };
  };
  const rest = useSharedValue(0);
  useEffect(() => { rest.value = state === 'open' ? 1 : 0; }, [state, rest]);
  const windowStyle = useAnimatedStyle(() => {
    const f = frame();
    const p = openness();
    const r = rest.value && dragging.value === 0 && p >= 0.999 ? 0 : CARD_R + (deviceR - CARD_R) * p;
    const style: Record<string, unknown> = { left: f.x, top: f.y, width: f.w, height: f.h, borderRadius: Math.max(0, r) };
    // In a browser, a shut window is also out of sight to the page (and to the auto-tester's look for buttons).
    if (web) style.visibility = f.w > 0 && f.h > 0 ? 'visible' : 'hidden';
    return style;
  });
  // Rule B: the map's middle is always the window's middle, so the ground under the finger never slides.
  const contentStyle = useAnimatedStyle(() => {
    const f = frame();
    return { width: f.W, height: f.H, transform: [{ translateX: f.w / 2 - f.W / 2 }, { translateY: f.h / 2 - f.H / 2 }] };
  });
  // The card's own words, drawn over the window's corner as it leaves the card and fading as it grows.
  const replicaStyle = useAnimatedStyle(() => {
    const p = openness();
    const s = cardScale.value || 1;
    const w = cardRect.w.value / s, h = cardRect.h.value / s;
    return {
      opacity: Math.max(0, 1 - p / 0.3),
      width: w,
      height: h,
      transform: [{ translateX: (cardRect.w.value - w) / 2 }, { translateY: (cardRect.h.value - h) / 2 }, { scale: s }],
    };
  });
  const scrimStyle = useAnimatedStyle(() => ({ opacity: openness() * (dark ? 0.56 : 0.36) }));
  // The controls arrive by moving into place as the window uncovers them; never by a fade.
  const settleOf = () => { 'worklet'; return Math.min(1, Math.max(0, (openness() - 0.35) / 0.65)); };
  const topStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -12 * (1 - settleOf()) }] }));
  const bottomStyle = useAnimatedStyle(() => ({ transform: [{ translateY: 16 * (1 - settleOf()) }] }));

  const control = useMemo<LayerMapControl>(() => ({
    mode, parked, settled, handle, back, topStyle, bottomStyle, topGesture, onPainted, onWarm,
  }), [mode, parked, settled, topStyle, bottomStyle, topGesture, onPainted, onWarm]);

  return (
    <View
      ref={root}
      pointerEvents={up ? 'auto' : 'none'}
      style={StyleSheet.absoluteFill}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        box.w.value = width;
        box.h.value = height;
        root.current?.measureInWindow((x, y) => { origin.current = { x, y }; });
      }}
      accessibilityElementsHidden={!up}
      importantForAccessibility={up ? 'auto' : 'no-hide-descendants'}
      accessibilityViewIsModal={up}
    >
      <Reanimated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.scrim, scrimStyle]} />
      <Reanimated.View pointerEvents={touchable ? 'box-none' : 'none'} style={[styles.window, windowStyle]}>
        <Reanimated.View pointerEvents="box-none" style={[styles.content, contentStyle]}>
          <NearbyMap
            expanded
            fullscreen
            me={me}
            players={players}
            at={detectedCoords}
            locationOn={location.locationOn}
            locating={location.locating}
            onToggleLocation={location.toggle}
            onBack={() => { void closeNow.current(); }}
            onOpen={(id) => router.push(`/user/${id}`)}
            layer={control}
          />
          {settled ? <TipBubble tip="map-who-sees" shown={whoTip.shown} onClose={whoTip.close} pointer="up" style={{ top: insets.top + 62, right: 10, left: 40, alignItems: 'flex-end' }} /> : null}
        </Reanimated.View>
        {overlay ? (
          <Reanimated.View pointerEvents="none" style={[styles.replica, replicaStyle]}>
            <PreviewOverlay {...(overlay as React.ComponentProps<typeof PreviewOverlay>)} />
            <MapCredit align="right" style={{ position: 'absolute', right: 10, bottom: 10 }} />
          </Reanimated.View>
        ) : null}
        {Platform.OS === 'ios' && touchable ? (
          <GestureDetector gesture={edgeGesture}>
            <View style={styles.edge} />
          </GestureDetector>
        ) : null}
      </Reanimated.View>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  scrim: { backgroundColor: colors.overlay },
  window: { position: 'absolute', overflow: 'hidden', backgroundColor: colors.bgElevated },
  content: { position: 'absolute', left: 0, top: 0 },
  // The still card's own frame: its hairline and corners.
  replica: { position: 'absolute', left: 0, top: 0, borderRadius: CARD_R, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  edge: { position: 'absolute', left: 0, top: 0, bottom: 0, width: EDGE_W },
});
