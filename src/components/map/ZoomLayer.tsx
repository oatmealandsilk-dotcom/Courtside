import React, { useEffect, useRef, useState } from 'react';
import { AppState, Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import Reanimated, { Easing, useAnimatedStyle, useFrameCallback, useSharedValue, withTiming } from 'react-native-reanimated';

import { MapCanvas, type CanvasMarker, type MapCanvasHandle } from '@/components/map/MapCanvas';
import { CardCredit, PreviewOverlay } from '@/components/map/MapChrome';
import type { Look } from '@/components/map/look';
import type { ClusterTemplates } from '@/components/map/pinEngine';
import { ZoomChromeCopy } from '@/components/NearbyMap';
import { swoopCancel } from '@/features/players/checkInZoom';
import { GrowAwayContext, endGrow, growT } from '@/features/players/mapGrow';
import type { LatLng } from '@/features/players/positions';
import { zoomFile, zoomNote, zoomPage } from '@/features/players/zoomTiming';
import { simAction, simLog } from '@/lib/simDriver';
import { V7, bez, useV7Card, useV7Chrome, useV7Overlay, v7Arrived, v7Bar, v7Chrome, v7Flying, v7ForceHand, v7Geo, v7Hold, v7Lock, v7MemoryHold, v7Move, v7Pushed, v7RegisterLayer, v7Scale, v7SetFlying, v7SetLanded, v7StopTimers, v7Ui, type V7Card, type V7PageMsg } from '@/features/players/zoomV7';

/** Where the full-screen page's camera must be so that the card's middle `K` (its own points) shows `city` at `z0`. */
function aimed(city: LatLng, z0: number, K: { x: number; y: number }, W: number, H: number): LatLng {
  const Wz = 512 * 2 ** z0;
  const s = Math.sin((Math.max(-85, Math.min(85, city.lat)) * Math.PI) / 180);
  const x = ((city.lng + 180) / 360) * Wz - (K.x - W / 2);
  const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * Wz - (K.y - H / 2);
  const n = Math.PI - (2 * Math.PI * y) / Wz;
  return { lng: (x / Wz) * 360 - 180, lat: (180 / Math.PI) * Math.atan(Math.sinh(n)) };
}

/**
 * The web view's corner, so the card's map box (inside its 1 pt edge) falls on whole points of the page, as it does in the
 * card's own page: the map rounds its pins to whole points of its page, so only then are they where the card's are. A
 * point spare all round the screen.
 */
const frac = (v: number) => { 'worklet'; return v - Math.floor(v); };
const cornerOf = (r: { x: number; y: number }) => ({ x: frac(r.x + 1) - 1, y: frac(r.y + 1) - 1 });
/** Where the card's middle is in the web view's own points: the page's camera is aimed so that it shows the card's view. */
const startOf = (k: V7Card, r: V7Card['rect'], W: number, H: number) => {
  const c = cornerOf(r);
  return aimed(k.city, k.zoom, { x: r.x + r.w / 2 - c.x, y: r.y + r.h / 2 - c.y }, W + 2, H + 2);
};
/** The tab bar's slide away with the move (AppShell's own is 180 ms, ease out). */
const BAR_MS = 180;
/** After the full map has taken over, the layer is aimed back at the card this long after (out of sight, at rest). */
const RESET_AFTER_HAND_MS = 1500;

/**
 * The check-in zoom's layer on the iPhone (v7, zoomV7): over every page (AppShell, after the pages), never seen and never
 * touched until a move. While the Community card is on show (and admins have the zoom), a full-screen map is drawn here
 * ahead of time at exactly the card's view, hidden, its animations paused; a move shows it through a window that is the
 * card and flies it, and copies of the full map's buttons slide in over it as it lands. After a move it is kept, and aimed
 * back at the card once the card is on show again. It is let go once Find Players has been out of view for a while, when
 * the app goes to the background, and when the phone is short of memory. Never on the website (ZoomLayer.web) or Android.
 */
export function ZoomLayer() {
  const card = useV7Card();
  const [away, setAway] = useState(() => AppState.currentState === 'background');
  useEffect(() => {
    if (Platform.OS !== 'ios') return undefined;
    const app = AppState.addEventListener('change', (s) => {
      if (s === 'background') setAway(true);
      else if (s === 'active') setAway(false);
    });
    const memory = AppState.addEventListener('memoryWarning', () => { zoomNote('memory'); v7MemoryHold(); });
    return () => { app.remove(); memory.remove(); };
  }, []);
  if (Platform.OS !== 'ios' || !card || away) return null;
  // A new town is a new page (it is drawn ahead again), never one moved there under the card.
  return <Layer key={`${card.city.lat},${card.city.lng},${card.zoom}`} card={card} />;
}

function Layer({ card }: { card: V7Card }) {
  const { width: W, height: H } = useWindowDimensions();
  const size = useRef({ W, H });
  size.current = { W, H };
  const canvas = useRef<MapCanvasHandle | null>(null);
  const painted = useRef(false);
  const [rect, setRect] = useState(card.rect);
  const rectNow = useRef(rect);
  const cardNow = useRef(card);
  cardNow.current = card;
  // Nothing the card says reaches the layer's page while it flies (each new list kept its page busy, and frames dropped):
  // its pins are the ones it had as the move began. A ref, not state: nothing on the JS thread may redraw as the move starts.
  const frozen = useRef<unknown[] | null>(null);
  // A move has been flown in this page: it is put back at the card's view before the next one (resetPage).
  const spent = useRef(false);
  // While it flies the screen takes no touches (the page under it is on its way out).
  const [flying, setFlying] = useState(false);
  const [paintTick, setPaintTick] = useState(0);
  const [start] = useState(() => startOf(card, card.rect, W, H));
  const R = useSharedValue(card.rect);
  useEffect(() => { R.value = rect; }, [rect]); // eslint-disable-line react-hooks/exhaustive-deps
  // The simulator's proof only (simDriver, demo builds): the layer shown at rest through the card, or through part of its
  // width (`f`), to compare it with the card itself pixel by pixel; 1 everywhere else.
  const split = useSharedValue(1);
  useEffect(() => {
    const off = [
      simAction('v7reveal', (q) => { split.value = Math.min(1, Math.max(0.05, Number(q.f) || 1)); if (!v7Flying()) v7Move.value = { ...v7Move.value, hidden: 0 }; }),
      simAction('v7hide', () => { split.value = 1; if (!v7Flying()) v7Move.value = { ...v7Move.value, hidden: 1 }; }),
    ];
    return () => off.forEach((f) => f());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // The move, on the UI thread: the page's scale from the one ease and the wall clock (the web view runs the same function),
  // the tab bar sliding away from the first frame, and the map's buttons sliding in over the last stretch.
  const frame = useFrameCallback(() => {
    'worklet';
    const m = v7Move.value;
    if (!m.on) return;
    const now = Date.now();
    const ms = now - m.t0;
    if (ms >= 0 && ms <= m.D) {
      const st = v7Ui.value;
      const g = st.last ? now - st.last : 0;
      const gaps = g >= 30 && st.gaps.length < 10 ? [...st.gaps, [ms - g, g]] : st.gaps;
      v7Ui.value = { n: st.n + 1, gap: Math.max(st.gap, g), last: now, first: st.first < 0 ? ms : st.first, at: g > st.gap ? ms : st.at, gaps };
    }
    // In step with the map (v7Lock): on a phone drawing at 120, only on the map's frames (or the ones after), each to where
    // the map's last frame put it. Never two frames running skipped (a phone at 60 moves every frame).
    let at = ms;
    const L = v7Lock.value;
    if (L.slot >= 0 && L.at > 0) {
      const P60 = 1000 / 60;
      const d = (((now - L.at) % P60) + P60) % P60;
      const after = d > P60 / 4 && d < (P60 * 3) / 4;
      if ((after !== (L.slot === 1)) && L.last && now - L.last < 14) return;
      v7Lock.value = { ...L, last: now };
      at = ms - d;
    }
    const u = Math.max(0, Math.min(1, at / m.D));
    const s = Math.min(Math.pow(2, m.dz * bez(u, m.x1, m.y1, m.x2, m.y2)), m.S);
    v7Scale.value = s;
    // The Community page pushes in by the same scale (mapGrow's push-in, round P), and covers the screen until the hand-over.
    growT.value = s <= 1 ? 0.000001 : Math.log(s) / Math.log(m.S);
    const b = Math.max(0, Math.min(1, at / BAR_MS));
    v7Bar.value = 1 - (1 - b) * (1 - b) * (1 - b);
    const c = Math.max(0, Math.min(1, (at - (m.D - m.cMs)) / m.cMs));
    v7Chrome.value = 1 - (1 - c) * (1 - c) * (1 - c);
  }, false);
  const frameNow = useRef(frame);
  frameNow.current = frame;

  // Never left showing: a move that has not been handed over by now is put away (the page under it back as it was).
  const guard = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hide = () => {
    if (guard.current) { clearTimeout(guard.current); guard.current = null; }
    frameNow.current.setActive(false);
    v7Move.value = { ...v7Move.value, on: 0, hidden: 1 };
    v7Scale.value = 1;
    v7Chrome.value = 0;
    setFlying(false);
    v7SetFlying(false);
  };
  const hideNow = useRef(hide);
  hideNow.current = hide;

  // The full map's pins, sent ahead as data (the page makes only the ones the landing needs, as the card covers the screen).
  const sendItems = () => {
    const k = cardNow.current;
    if (frozen.current || !painted.current) return;
    canvas.current?.v7(`window.__cs.v7items(${JSON.stringify({ items: k.fullMarkers, tpl: k.tpl })})`);
  };
  const sendItemsNow = useRef(sendItems);
  sendItemsNow.current = sendItems;
  useEffect(() => { sendItemsNow.current(); }, [card.fullMarkers, card.tpl, paintTick]);

  // After a move: the page as it was before it (the card's own pins, at rest), its camera back at the card's view, ready
  // again once it has drawn there. Never while a move is under way.
  const resetPage = () => {
    if (v7Flying()) return;
    spent.current = false;
    frozen.current = null;
    painted.current = false;
    canvas.current?.v7(`window.__cs.v7reset(${JSON.stringify({ items: cardNow.current.markers, tpl: cardNow.current.tpl })})`);
    const { W: w, H: h } = size.current;
    canvas.current?.jump(startOf(cardNow.current, rectNow.current, w, h), cardNow.current.zoom);
    zoomNote('reaimed');
  };
  const resetNow = useRef(resetPage);
  resetNow.current = resetPage;
  // The card offering itself again (on show a moment after Back): a page spent by a move is put back now.
  useEffect(() => { if (spent.current) resetNow.current(); }, [card]);

  // The card is somewhere else now (the page scrolled): drawn again where it is (out of sight), and ready once it has.
  const aim = (r: V7Card['rect']) => {
    const was = rectNow.current;
    if (v7Flying() || (Math.abs(r.x - was.x) < 0.01 && Math.abs(r.y - was.y) < 0.01 && Math.abs(r.w - was.w) < 0.01 && Math.abs(r.h - was.h) < 0.01)) return;
    rectNow.current = r;
    setRect(r);
    if (spent.current) { resetNow.current(); return; }
    painted.current = false;
    const { W: w, H: h } = size.current;
    canvas.current?.jump(startOf(cardNow.current, r, w, h), cardNow.current.zoom);
    zoomNote('reaim');
  };
  const aimNow = useRef(aim);
  aimNow.current = aim;
  // Each time the card hands over where it is (it measures itself as it does).
  useEffect(() => { aimNow.current(card.rect); }, [card.rect.x, card.rect.y, card.rect.w, card.rect.h]);

  // A move stopped part way (the server said no, or it ran out of time before a full map was there): hidden, the page under
  // it back as it was, and this page put back at the card's view a moment later (the card is on show again).
  const stopMove = (why: string) => {
    zoomNote(why);
    v7StopTimers();
    canvas.current?.v7('window.__cs.v7stop()');
    hideNow.current();
    v7Bar.value = withTiming(0, { duration: 200, easing: Easing.out(Easing.cubic) });
    endGrow();
    swoopCancel();
    v7Arrived();
    v7Hold(false);
    // Its timing row goes now (nothing more of the move will come).
    zoomFile();
    setTimeout(() => { if (spent.current) resetNow.current(); }, 600);
  };
  const stopNow = useRef(stopMove);
  stopNow.current = stopMove;

  useEffect(() => {
    v7RegisterLayer({
      ready: () => painted.current && !spent.current && !v7Flying(),
      aim: (r) => aimNow.current(r),
      go: (p) => {
        frozen.current = cardNow.current.markers;
        spent.current = true;
        v7SetFlying(true);
        // Touches off on the JS thread's next turn: a redraw now would hold up the move's start (its first frames).
        setTimeout(() => { if (v7Flying()) setFlying(true); }, 0);
        // In the web view's own points (its corner at the card's fraction of a point, a point spare all round).
        const c = cornerOf(rectNow.current);
        const q = { ...p, W: p.W + 2, H: p.H + 2, K: { x: p.K.x - c.x, y: p.K.y - c.y }, P: { x: p.P.x - c.x, y: p.P.y - c.y } };
        canvas.current?.v7(`window.__cs.v7go(${JSON.stringify(q)})`);
        frameNow.current.setActive(true);
        if (guard.current) clearTimeout(guard.current);
        guard.current = setTimeout(() => {
          guard.current = null;
          if (!v7Flying()) return;
          zoomNote('stuck');
          // The full map is there: it takes over now. Not there: the move stops and the page goes back.
          if (v7ForceHand()) return;
          stopNow.current('guard');
        }, p.t0 - Date.now() + p.D + V7.handMaxLoading + 2000);
      },
      retarget: (to) => canvas.current?.v7(`window.__cs.v7re(${to.lat},${to.lng})`),
      warm: (at, z) => canvas.current?.warm(at, z),
      stop: () => stopNow.current('serverNo'),
      handed: () => {
        hideNow.current();
        v7Bar.value = 0;
        // Put back at the card's view once the full map has settled (its first moments never share the phone with this
        // page's redraw), so a tap after Back finds it ready.
        setTimeout(() => { if (spent.current && !v7Flying()) resetNow.current(); }, RESET_AFTER_HAND_MS);
      },
    });
    return () => {
      v7RegisterLayer(null);
      if (guard.current) clearTimeout(guard.current);
      // Let go part way (the app put away): the move stops; the page under it goes back, unless the full map has opened
      // over it already (it takes over at once then, by itself).
      if (v7Flying()) {
        v7StopTimers();
        v7Move.value = { ...v7Move.value, on: 0, hidden: 1 };
        v7Scale.value = 1;
        v7Chrome.value = 0;
        v7Bar.value = 0;
        v7SetFlying(false);
        if (!v7Pushed()) { endGrow(); swoopCancel(); v7Arrived(); }
        v7Hold(false);
        zoomNote('stopped');
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // The window: the card's own box (its corners, its 1 pt edge drawn over what is in it, its fill under it), grown by its
  // real frame as the page pushes in (never by a transform: a rounded clip renders what is in it at the clip's own size, so a
  // scaled one showed the map enlarged, blurry). Its corners go once it covers the screen. Shown and hidden in one frame.
  const r0 = card.radius;
  const windowStyle = useAnimatedStyle(() => {
    const s = v7Scale.value;
    const g = v7Geo.value;
    const q = R.value;
    const m = v7Move.value;
    const covered = m.on === 1 && s >= m.S - 1e-4;
    return {
      opacity: m.hidden ? 0 : 1,
      left: g.px + (q.x - g.px) * s,
      top: g.py + (q.y - g.py) * s,
      width: q.w * s * split.value,
      height: q.h * s,
      borderRadius: covered ? 0 : r0 * s,
      borderWidth: s,
    };
  });
  // What is inside the window stays put on the screen however the window grows.
  const fixedStyle = useAnimatedStyle(() => {
    const s = v7Scale.value;
    const g = v7Geo.value;
    const q = R.value;
    return { left: -(g.px + (q.x - g.px) * s) - s, top: -(g.py + (q.y - g.py) * s) - s };
  });
  // The web view's corner: at the card's fraction of a point at rest; on whole points once the card covers the screen (under a
  // point's move, unseen mid-move), so at the landing its pins round exactly as the full map's do. On the UI thread.
  const cornerStyle = useAnimatedStyle(() => {
    const q = R.value;
    const m = v7Move.value;
    const covered = m.on === 1 && v7Scale.value >= m.S - 1e-4;
    return { left: covered ? -1 : frac(q.x + 1) - 1, top: covered ? -1 : frac(q.y + 1) - 1 };
  });
  // The card's own words, pill, weather and credit, drawn again over the layer's map: the same views as the card's, moved
  // by the same values (the page's push-in round P; each keeps its size and slips out of the card's edge, as on the card).
  const chromeStyle = useAnimatedStyle(() => {
    const s = v7Scale.value;
    const g = v7Geo.value;
    const m = v7Move.value;
    // Slipped out of the card well before it covers the screen; from then on off the screen altogether, so nothing of the
    // card's can ever show over the full-screen map.
    const away = m.on === 1 && s >= m.S - 1e-4 ? 100000 : 0;
    return { transform: [{ translateX: (g.px - g.kx) * (1 - s) + away }, { translateY: (g.py - g.ky) * (1 - s) }, { scale: s }] };
  });
  // The full map's buttons drawn over the layer: shown with the window (and hidden with it, in the same frame).
  const buttonsShown = useAnimatedStyle(() => ({ opacity: v7Move.value.hidden ? 0 : 1 }));

  const overlay = useV7Overlay();
  const buttons = useV7Chrome();
  return (
    <View
      pointerEvents={flying ? 'auto' : 'none'}
      onStartShouldSetResponder={() => flying}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={StyleSheet.absoluteFill}
    >
      <Reanimated.View style={[styles.window, { borderColor: card.border, backgroundColor: card.bg }, windowStyle]}>
        <Reanimated.View style={[{ position: 'absolute', width: W, height: H }, fixedStyle]}>
          <Reanimated.View style={[{ position: 'absolute', width: W + 2, height: H + 2 }, cornerStyle]}>
            <MapCanvas
              ref={canvas}
              layer
              phaseLock
              center={start}
              zoom={card.zoom}
              look={card.fullLook as Look}
              interactive={false}
              markers={(frozen.current ?? card.markers) as CanvasMarker[]}
              tpl={card.tpl as ClusterTemplates}
              onPainted={() => { painted.current = true; setPaintTick((n) => n + 1); simLog('[v7] layer ready'); }}
              onLost={() => {
                painted.current = false;
                // A fresh page is on its way, at the card's view: nothing of a move is left in it.
                spent.current = false;
                if (!v7Flying()) return;
                // The phone stopped the page mid-move: the full map takes over if it is there, else the move stops.
                if (v7Pushed() && v7ForceHand()) { zoomNote('lost'); return; }
                stopNow.current('lost');
              }}
              onV7={(msg: V7PageMsg) => {
                if (msg.type === 'v7tick') { if (typeof msg.at === 'number') v7Lock.value = { ...v7Lock.value, at: msg.at }; }
                else if (msg.type === 'v7landed') { zoomPage(msg); v7SetLanded(); }
                else zoomNote(`page ${msg.e ?? ''}`);
              }}
            />
          </Reanimated.View>
        </Reanimated.View>
        {overlay ? (
          <Reanimated.View pointerEvents="none" style={[{ position: 'absolute', width: W, height: H }, fixedStyle]}>
            <Reanimated.View style={[{ position: 'absolute', left: rect.x, top: rect.y, width: rect.w, height: rect.h }, styles.chrome, chromeStyle]}>
              <View style={StyleSheet.absoluteFill}>
                <GrowAwayContext.Provider value>
                  <PreviewOverlay {...(overlay as React.ComponentProps<typeof PreviewOverlay>)} copy />
                  <CardCredit />
                </GrowAwayContext.Provider>
              </View>
            </Reanimated.View>
          </Reanimated.View>
        ) : null}
      </Reanimated.View>
      {buttons ? (
        <Reanimated.View pointerEvents="none" style={[StyleSheet.absoluteFill, buttonsShown]}>
          <ZoomChromeCopy p={buttons} slide={v7Chrome} />
        </Reanimated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  window: { position: 'absolute', overflow: 'hidden' },
  // The card's 1 pt edge, unseen: what sits on the card is laid out inside it, as on the card.
  chrome: { borderWidth: 1, borderColor: 'transparent' },
});
