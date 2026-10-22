import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Keyboard, Platform, StyleSheet, View } from 'react-native';
import Reanimated, { cancelAnimation, runOnJS, runOnUI, useAnimatedReaction, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NearbyMap } from '@/components/NearbyMap';
import type { LayerMapControl, LayerMapHandle } from '@/components/NearbyMap.types';
import { MapCredit, PreviewOverlay } from '@/components/map/MapChrome';
import { CARD_ZOOM } from '@/components/map/cardFit';
import {
  CAMERA_CLOSE_MS, CAMERA_OPEN_MS, CARD_R, CLOSE, CLOSE_BEZIER, COMMIT_FRAC, COMMIT_V, DEVICE_R, EDGE_COMMIT_FRAC, EDGE_W, FULL_AT, MAX_FLING, OPEN, OPEN_BEZIER, PINS_CARD_AT_MS, SNAPBACK,
  LAYER, anyCard, box, cardRect, cardScale, closingSV, contentScaleOf, dragging, getCard, layerState, layerUp, motion, openness, rectOf, resetWindow, setLayerHandle, setLayerState, useCardsVersion, useLayerState, win,
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
  const [mounted, setMounted] = useState(false);
  const [gen, setGen] = useState(0);
  const restUntil = useRef(0);
  const signedIn = !!currentUser;
  useEffect(() => {
    if (mounted || !curtain || !signedIn) return undefined;
    // Looked at now and then, not on every change of the card: made once the card has drawn and a moment has passed.
    const since = Date.now();
    let paintedAt = 0;
    const timer = setInterval(() => {
      const now = Date.now();
      if (now < restUntil.current) return;
      if (!paintedAt && anyCard()?.[1].painted) paintedAt = now;
      if ((paintedAt && now - paintedAt >= MOUNT_AFTER_MS) || now - since >= MOUNT_ANYWAY_MS) { clearInterval(timer); setMounted(true); }
    }, 200);
    return () => clearInterval(timer);
  }, [mounted, curtain, signedIn]);
  useEffect(() => {
    let leftAt = 0;
    const change = AppState.addEventListener('change', (s) => {
      if (s === 'background') leftAt = Date.now();
      // Made again the usual way (once the card has drawn, and a moment after), never in the very moment the app comes back.
      else if (s === 'active' && leftAt && Date.now() - leftAt > STALE_MS && !layerUp(layerState())) { setMounted(false); setGen((g) => g + 1); }
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
  const closing = state === 'closing';
  // The pins: the card's own while shut and through the first frames of the open (so frame one IS the card); the full map's
  // from most of the way open (FULL_AT) until most of the way closed (PINS_CARD_AT_MS), each change one build in the map.
  const [mode, setMode] = useState<'card' | 'full'>('card');
  // Open and still: prompts, the tip and a late location fix may come now.
  const [settled, setSettled] = useState(false);
  // Takes touches (from most of the way open until it starts to close).
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
  const reset = useRef<(() => void) | null>(null);
  const { whoTip } = useMapOpenEffects(location, settled);

  // Getting ready: once its map has drawn, it visits where it opens to (so those streets are
  // already in) and comes back to the card's view; only then is a tap on the card its to open.
  const warmFallback = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onWarm = useCallback(() => {
    if (warmFallback.current) clearTimeout(warmFallback.current);
    warmFallback.current = null;
    if (layerState() === 'cold') setLayerState('ready');
  }, []);
  const onPainted = useCallback(() => {
    const h = handle.current;
    const at = parkedNow.current;
    // Drawn again while open (a new theme in a browser, or the phone restarting the map's page): back to the open map, no visit.
    if (h && layerUp(layerState())) {
      const t = h.openTarget();
      h.labels(true, 0, 0);
      h.setInteractive(true);
      // A browser's map made again keeps its own view; the phone's restarted page starts on the card's.
      if (Platform.OS !== 'web') h.jump(t.center, t.zoom);
      return;
    }
    if (!h || !at) { onWarm(); return; }
    const t = h.openTarget();
    h.warm(t.center, t.zoom, at.center, CARD_ZOOM);
    // Streets that never settle (a slow line) do not keep the window shut for good.
    if (warmFallback.current) clearTimeout(warmFallback.current);
    warmFallback.current = setTimeout(onWarm, 8000);
  }, [onWarm]);
  // The phone stopped the map's page while the window was shut: not ready (a tap opens the map page) until it has drawn again.
  const onReboot = useCallback(() => {
    if (layerUp(layerState())) return;
    if (warmFallback.current) clearTimeout(warmFallback.current);
    warmFallback.current = null;
    setLayerState('cold');
  }, []);
  useEffect(() => {
    resetWindow();
    return () => {
      if (warmFallback.current) clearTimeout(warmFallback.current);
      // Gone while open or closing (signed out, the tabs made again): nothing of the window may stay over the tabs.
      resetWindow();
      setLayerState('cold');
      setLayerHandle(null);
    };
  }, []);
  // Shut, it follows the card (your city changing, your location arriving).
  useEffect(() => {
    if (state !== 'ready' || !parked) return;
    handle.current?.jump(parked.center, CARD_ZOOM);
  }, [parked?.center.lat, parked?.center.lng, state]); // eslint-disable-line react-hooks/exhaustive-deps

  // Where the layer itself sits on the screen (beside the sidebar in a wide browser).
  const origin = useRef({ x: 0, y: 0 });
  const root = useRef<View | null>(null);

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  const closeStarted = useRef(0);
  // Most of the way open: the full map's pins (one build, mid-zoom) and touches, in one go.
  const goFull = useCallback(() => {
    const st = layerState();
    if (st !== 'opening' && st !== 'open') return;
    setMode('full');
    setTouchable(true);
    handle.current?.setInteractive(true);
  }, []);
  useAnimatedReaction(
    () => openness(LAYER) >= FULL_AT && dragging.value === 0 && closingSV.value === 0,
    (now, was) => { if (now && !was) runOnJS(goFull)(); },
    [goFull],
  );
  const opened = useCallback(() => {
    if (layerState() !== 'opening') return;
    goFull();
    // Landed: open and settled in the same moment (one redraw).
    setLayerState('open');
    setSettled(true);
  }, [goFull]);
  const collapsed = useCallback((dismissed: boolean) => {
    if (layerState() !== 'closing') return;
    const finish = () => {
      if (layerState() !== 'closing') return;
      clearTimers();
      resetWindow();
      const c = parkedNow.current;
      if (dismissed && c) handle.current?.jump(c.center, CARD_ZOOM);
      // Out of sight now: whatever was up on the map is put away, so the next open starts fresh (as the map page did).
      reset.current?.();
      setMode('card');
      setLayerState('ready');
    };
    // Only while the camera is still easing into the card's view (it is timed to land with the window): at most 150 ms.
    const left = Math.min(150, Math.max(0, CAMERA_CLOSE_MS - (Date.now() - closeStarted.current)));
    if (left > 0 && !dismissed) setTimeout(finish, left); else finish();
  }, []);

  const open = useCallback((src: LayerSource, rect: Rect, s: number) => {
    const h = handle.current;
    const c = getCard(src);
    if (!h || !c) return;
    const wasClosing = layerState() === 'closing';
    const r = { x: rect.x - origin.current.x, y: rect.y - origin.current.y, w: rect.w, h: rect.h };
    clearTimers();
    // One redraw: the state and which card it opens from.
    setLayerState('opening');
    setSource(src);
    const cur = parkedNow.current;
    if (!wasClosing && cur && (cur.center.lat !== c.center.lat || cur.center.lng !== c.center.lng)) h.jump(c.center, CARD_ZOOM);
    const t = h.openTarget();
    h.ease(t.center, t.zoom, CAMERA_OPEN_MS, OPEN_BEZIER);
    // Place names come in under the card's own words as they fade (the city's name hands over in place).
    h.labels(true, 260, 40);
    // Should the frame-by-frame look miss it, touches come anyway.
    timers.current.push(setTimeout(goFull, 300));
    if (Platform.OS === 'web') {
      try { window.history.pushState({ ...(window.history.state ?? {}), csMapLayer: 1 }, '', window.location.href); } catch { /* the window still opens */ }
    }
    runOnUI((x: number, y: number, w: number, hh: number, sc: number, fromLive: boolean) => {
      'worklet';
      const m = motion;
      // From where it is (a close turned round) or the sunk card itself; the map inside starts at the card's size.
      const f = fromLive ? rectOf(LAYER) : { x, y, w, h: hh };
      const s0 = fromLive ? contentScaleOf(LAYER) : sc;
      if (!fromLive) { cardRect.x.value = x; cardRect.y.value = y; cardRect.w.value = w; cardRect.h.value = hh; cardScale.value = sc; }
      closingSV.value = 0;
      cancelAnimation(m.q);
      m.fx.value = f.x; m.fy.value = f.y; m.fw.value = f.w; m.fh.value = f.h;
      m.full.value = 1; m.sf.value = s0; m.st.value = 1; m.q.value = 0; m.on.value = 1;
      m.q.value = withSpring(1, OPEN, (done) => { if (done) runOnJS(opened)(); });
    })(r.x, r.y, r.w, r.h, s, wasClosing);
  }, [opened, goFull]);

  // The window's close into the card, started on the UI thread (from a swipe let go, in the same frame) or from here.
  const close = useCallback((fling?: { v: number; axis: 'x' | 'y'; moving?: boolean }, fromHistory = false) => {
    const st = layerState();
    if (st !== 'open' && st !== 'opening') return;
    // The search's keyboard goes with it (never left up over Community, typing into a map nobody can see).
    Keyboard.dismiss();
    clearTimers();
    setLayerState('closing');
    setSettled(false);
    setTouchable(false);
    const h = handle.current;
    h?.setInteractive(false);
    h?.labels(false, 200, 0);
    if (Platform.OS === 'web' && !fromHistory) {
      try { if (window.history.state?.csMapLayer) window.history.back(); } catch { /* closes all the same */ }
    }
    const src = sourceNow.current;
    const c = (src ? getCard(src) : undefined) ?? anyCard()?.[1];
    closeStarted.current = Date.now();
    // The full map's pins stay as they are while the window starts down; most of the way down, the card's come back.
    timers.current.push(setTimeout(() => { if (layerState() === 'closing') setMode('card'); }, PINS_CARD_AT_MS));
    // The card cannot move while the window is over it, so the close starts now, toward where the card was when it opened.
    const known = cardRect.w.value > 0 && cardRect.h.value > 0;
    if (known && c) h?.ease(c.center, CARD_ZOOM, CAMERA_CLOSE_MS, CLOSE_BEZIER);
    const v = Math.max(0, fling?.v ?? 0);
    const onY = fling?.axis !== 'x';
    if (known && !fling?.moving) runOnUI(startClose)(v, onY);
    // Measured as it goes: a card that is somewhere else after all (more than half a point) is closed into where it is now.
    void (c ? c.measure() : Promise.resolve(null)).then((rect) => {
      if (layerState() !== 'closing') return;
      const r = rect ? { x: rect.x - origin.current.x, y: rect.y - origin.current.y, w: rect.w, h: rect.h } : null;
      const seen = !!r && r.y + r.h > 0 && r.y < box.h.value && r.x + r.w > 0 && r.x < box.w.value;
      if (r && seen) {
        if (!known) { h?.ease(c!.center, CARD_ZOOM, CAMERA_CLOSE_MS, CLOSE_BEZIER); }
        runOnUI((x: number, y: number, w: number, hh: number, start: boolean, fv: number, axisY: boolean) => {
          'worklet';
          const off = Math.abs(cardRect.x.value - x) + Math.abs(cardRect.y.value - y) + Math.abs(cardRect.w.value - w) + Math.abs(cardRect.h.value - hh);
          cardRect.x.value = x; cardRect.y.value = y; cardRect.w.value = w; cardRect.h.value = hh; cardScale.value = 1;
          if (start) startClose(fv, axisY);
          else if (off > 0.5 && motion.full.value === 0) { motion.tx.value = x; motion.ty.value = y; motion.tw.value = w; motion.th.value = hh; }
        })(r.x, r.y, r.w, r.h, !known, v, onY);
      } else {
        // The card is off screen (scrolled away, another tab): the window slides away down instead.
        runOnUI((fv: number) => {
          'worklet';
          const m = motion;
          const f = rectOf(LAYER);
          closingSV.value = 0;
          cancelAnimation(m.q);
          cardRect.h.value = 0;
          m.fx.value = f.x; m.fy.value = f.y; m.fw.value = f.w; m.fh.value = f.h;
          m.tx.value = f.x; m.ty.value = box.h.value; m.tw.value = f.w; m.th.value = f.h;
          m.sf.value = contentScaleOf(LAYER); m.st.value = m.sf.value;
          m.full.value = 0; m.q.value = 0; m.on.value = 1;
          const dist = Math.max(1, box.h.value - f.y);
          m.q.value = withSpring(1, { ...CLOSE, velocity: Math.min(MAX_FLING, fv / dist) }, (done) => { if (done) runOnJS(collapsed)(true); });
        })(onY ? v : 0);
      }
    });
  }, [collapsed]);
  const closeNow = useRef(close);
  closeNow.current = close;

  useEffect(() => {
    setLayerHandle({ open, close: () => { closeNow.current(); } });
    return () => setLayerHandle(null);
  }, [open]);

  // Landed on the card (every edge within half a point): the hand-over, that very frame, not on the spring's long tail.
  useAnimatedReaction(
    () => {
      if (!closingSV.value || !motion.on.value || motion.full.value) return false;
      const r = rectOf(LAYER);
      return Math.abs(r.x - motion.tx.value) < 0.5 && Math.abs(r.y - motion.ty.value) < 0.5 && Math.abs(r.w - motion.tw.value) < 0.5 && Math.abs(r.h - motion.th.value) < 0.5;
    },
    (now, was) => { if (now && !was) { closingSV.value = 0; runOnJS(collapsed)(false); } },
    [collapsed],
  );

  // Android's Back: whatever is up on the map first, then the window closes.
  useAndroidBack(() => {
    if (!layerUp(layerState())) return false;
    if (back.current?.()) return true;
    closeNow.current();
    return true;
  }, up);
  // A browser: its Back, and Escape.
  useEffect(() => {
    if (Platform.OS !== 'web' || !up) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeNow.current(); };
    const onPop = () => { if (!window.history.state?.csMapLayer) closeNow.current(undefined, true); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('popstate', onPop);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('popstate', onPop); };
  }, [up]);

  // Swipes that close it: down from the top bar, and (iPhone) in from the left edge. The window follows the finger, the map
  // inside shrinking with it (a card held in the hand: the bar stays under the finger).
  const startAt = useSharedValue(0);
  const crossed = useSharedValue(0);
  const flung = useCallback((v: number, axis: 'x' | 'y') => { closeNow.current({ v, axis, moving: true }); }, []);
  const grab = () => {
    'worklet';
    // Whatever it was doing (a snap back still settling), it is the finger's now, from where it is.
    const r = rectOf(LAYER);
    cancelAnimation(motion.q);
    motion.on.value = 0;
    win.x.value = r.x; win.y.value = r.y; win.w.value = r.w; win.h.value = r.h;
    dragging.value = 1; crossed.value = 0;
  };
  const topGesture = useMemo(() => Gesture.Pan()
    .enabled(touchable)
    .activeOffsetY([-12, 12])
    .failOffsetX([-16, 16])
    .onStart((e) => { 'worklet'; grab(); startAt.value = e.absoluteX; })
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
      const commit = e.velocityY > COMMIT_V || win.y.value > COMMIT_FRAC * box.h.value;
      if (commit) { startClose(Math.max(0, e.velocityY), true); dragging.value = 0; runOnJS(flung)(e.velocityY, 'y'); }
      else { snapBack(Math.max(0, -e.velocityY) / Math.max(1, 0.6 * box.h.value)); dragging.value = 0; }
    })
    .onFinalize(() => { 'worklet'; if (dragging.value) { dragging.value = 0; snapBack(0); } }), [touchable, flung]); // eslint-disable-line react-hooks/exhaustive-deps
  const edgeTop = insets.top + 108;
  const edgeGesture = useMemo(() => Gesture.Pan()
    .enabled(touchable && Platform.OS === 'ios')
    // Only a touch that starts in the strip at the left edge (below the top bar, so Back keeps its whole tap). The recognizer
    // sits on the window, not on a strip laid over the map: the players pill, the cards and the map under that edge keep their taps.
    .hitSlop({ left: 0, width: EDGE_W })
    .activeOffsetX(12)
    .failOffsetY([-20, 20])
    .onTouchesDown((e, manager) => { 'worklet'; const t = e.allTouches[0]; if (!t || t.y < edgeTop || t.x > EDGE_W) manager.fail(); })
    .onStart((e) => { 'worklet'; grab(); startAt.value = e.absoluteY; })
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
      const commit = e.velocityX > COMMIT_V || win.x.value > EDGE_COMMIT_FRAC * box.w.value;
      if (commit) { startClose(Math.max(0, e.velocityX), false); dragging.value = 0; runOnJS(flung)(e.velocityX, 'x'); }
      else { snapBack(Math.max(0, -e.velocityX) / Math.max(1, 0.6 * box.w.value)); dragging.value = 0; }
    })
    .onFinalize(() => { 'worklet'; if (dragging.value) { dragging.value = 0; snapBack(0); } }), [touchable, flung, edgeTop]); // eslint-disable-line react-hooks/exhaustive-deps

  // The window: where it is (the spring's last breath kept inside the screen) and its corners.
  const web = Platform.OS === 'web';
  const frame = (l: typeof LAYER) => {
    'worklet';
    const W = l.box.w.value, H = l.box.h.value;
    let { x, y, w, h } = rectOf(l);
    if (x < 0) { w += x; x = 0; }
    if (y < 0 && l.dragging.value === 0) { h += y; y = 0; }
    w = Math.max(0, Math.min(w, W - x));
    h = Math.max(0, Math.min(h, H - Math.max(0, y)));
    return { x, y, w, h, W, H };
  };
  const rest = useSharedValue(0);
  useEffect(() => { rest.value = state === 'open' ? 1 : 0; }, [state, rest]);
  const windowStyle = useAnimatedStyle(() => {
    const f = frame(LAYER);
    const p = openness(LAYER);
    const r = rest.value && LAYER.dragging.value === 0 && p >= 0.999 ? 0 : CARD_R + (deviceR - CARD_R) * p;
    const style: Record<string, unknown> = { left: f.x, top: f.y, width: f.w, height: f.h, borderRadius: Math.max(0, r) };
    // In a browser, a shut window is also out of sight to the page (and to the auto-tester's look for buttons).
    if (web) style.visibility = f.w > 0 && f.h > 0 ? 'visible' : 'hidden';
    return style;
  });
  // Rule B: the map's middle is always the window's middle, so the ground under the finger never slides. Drawn at the sunk
  // card's size on the first frame, at the window's own while a finger holds it, and at 1 once open.
  const contentStyle = useAnimatedStyle(() => {
    const f = frame(LAYER);
    const s = contentScaleOf(LAYER);
    return { width: f.W, height: f.H, transform: [{ translateX: f.w / 2 - f.W / 2 }, { translateY: f.h / 2 - f.H / 2 }, { scale: s }] };
  });
  // The card's own words, drawn over the map's middle as it leaves the card (so the city's name stays over the city) and
  // fading out smoothly over the first half of the open, about six frames at 60 Hz, as the map's own place names come in.
  const replicaStyle = useAnimatedStyle(() => {
    const f = frame(LAYER);
    const p = openness(LAYER);
    const s = cardScale.value || 1;
    const w = cardRect.w.value / s, h = cardRect.h.value / s;
    const t = Math.min(1, p / 0.55);
    return {
      opacity: 1 - t * t * (3 - 2 * t),
      width: w,
      height: h,
      transform: [{ translateX: f.w / 2 - w / 2 }, { translateY: f.h / 2 - h / 2 }, { scale: s }],
    };
  });
  const scrimStyle = useAnimatedStyle(() => ({ opacity: openness(LAYER) * (dark ? 0.56 : 0.36) }));
  // The controls arrive by moving into place as the window uncovers them; never by a fade.
  const settleOf = (p: number) => { 'worklet'; return Math.min(1, Math.max(0, (p - 0.35) / 0.65)); };
  const topStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -12 * (1 - settleOf(openness(LAYER))) }] }));
  const bottomStyle = useAnimatedStyle(() => ({ transform: [{ translateY: 16 * (1 - settleOf(openness(LAYER))) }] }));

  const control = useMemo<LayerMapControl>(() => ({
    mode, parked, settled, handle, back, reset, topStyle, bottomStyle, topGesture, onPainted, onWarm, onReboot,
  }), [mode, parked, settled, topStyle, bottomStyle, topGesture, onPainted, onWarm, onReboot]);

  const windowView = (
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
          onBack={() => { closeNow.current(); }}
          onOpen={(id) => router.push(`/user/${id}`)}
          layer={control}
        />
        {settled ? <TipBubble tip="map-who-sees" shown={whoTip.shown} onClose={whoTip.close} pointer="up" style={{ top: insets.top + 62, right: 10, left: 40, alignItems: 'flex-end' }} /> : null}
      </Reanimated.View>
      {overlay ? (
        <Reanimated.View pointerEvents="none" style={[styles.replica, replicaStyle]}>
          {/* The card's location arrow is drawn only when it has a press to answer: a no-op keeps it drawn here. */}
          <PreviewOverlay {...(overlay as React.ComponentProps<typeof PreviewOverlay>)} onToggleLocation={noop} />
          <MapCredit align="right" style={{ position: 'absolute', right: 10, bottom: 10 }} />
        </Reanimated.View>
      ) : null}
    </Reanimated.View>
  );

  return (
    <View
      ref={root}
      testID={`map-layer-${state}`}
      // Closing, a tap goes through to the card under it (and opens it again from where the window is).
      pointerEvents={up && !closing ? 'auto' : up ? 'box-none' : 'none'}
      style={StyleSheet.absoluteFill}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        box.w.value = width;
        box.h.value = height;
        root.current?.measureInWindow((x, y) => { origin.current = { x, y }; });
      }}
      accessibilityElementsHidden={!up}
      importantForAccessibility={up ? 'auto' : 'no-hide-descendants'}
      accessibilityViewIsModal={up && !closing}
    >
      <Reanimated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.scrim, scrimStyle]} />
      {Platform.OS === 'ios' ? <GestureDetector gesture={edgeGesture}>{windowView}</GestureDetector> : windowView}
    </View>
  );
}

const noop = () => undefined;

/** The close's one spring, toward the card (cardRect), handing on a swipe's speed `v` (points a second, along `onY`) as progress. */
function startClose(v: number, onY: boolean) {
  'worklet';
  // Not known yet (never measured): the close waits for the card's measure (MapLayer's close).
  if (cardRect.w.value <= 0 || cardRect.h.value <= 0) return;
  const m = motion;
  const f = rectOf(LAYER);
  const s0 = contentScaleOf(LAYER);
  cancelAnimation(m.q);
  m.fx.value = f.x; m.fy.value = f.y; m.fw.value = f.w; m.fh.value = f.h;
  m.tx.value = cardRect.x.value; m.ty.value = cardRect.y.value; m.tw.value = cardRect.w.value; m.th.value = cardRect.h.value;
  m.full.value = 0; m.sf.value = s0; m.st.value = 1; m.q.value = 0; m.on.value = 1;
  closingSV.value = 1;
  // Always toward the card, never more than MAX_FLING of the way a second: no dead stop, no bounce, no blip.
  const span = Math.max(1, 0.6 * (onY ? box.h.value : box.w.value));
  const qv = Math.min(MAX_FLING, Math.max(0, v) / span);
  m.q.value = withSpring(1, { ...CLOSE, velocity: qv });
}

/** A swipe let go too early: back to the whole screen on one spring, its upward speed handed on as progress (`qv` a second). */
function snapBack(qv: number) {
  'worklet';
  const m = motion;
  const f = rectOf(LAYER);
  const s0 = contentScaleOf(LAYER);
  cancelAnimation(m.q);
  m.fx.value = f.x; m.fy.value = f.y; m.fw.value = f.w; m.fh.value = f.h;
  m.full.value = 1; m.sf.value = s0; m.st.value = 1; m.q.value = 0; m.on.value = 1;
  m.q.value = withSpring(1, { ...SNAPBACK, velocity: Math.min(MAX_FLING, Math.max(0, qv)) });
}

const styleDefinitions = StyleSheet.create({
  scrim: { backgroundColor: colors.overlay },
  window: { position: 'absolute', overflow: 'hidden', backgroundColor: colors.bgElevated },
  content: { position: 'absolute', left: 0, top: 0 },
  // The still card's own frame: its hairline and corners.
  replica: { position: 'absolute', left: 0, top: 0, borderRadius: CARD_R, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
});
