import { useCallback, useEffect, useRef } from 'react';
import type { View } from 'react-native';
import { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { PRESS_MS, PRESS_SCALE, openLayer, setCard, type CardInfo, type LayerSource, type Rect } from '@/components/map/mapWindow';
import type { CanvasMarker } from '@/components/map/pinEngine';
import type { LatLng } from '@/features/players/positions';
import * as haptics from '@/lib/haptics';

/**
 * The still card's side of the map window (mapWindow): it says what it shows
 * (centre, pins, its words), sinks a touch under the finger, and on the tap
 * hands the window its own spot on the screen to open from.
 *
 * `outer` goes on a plain View round the card (never scaled, so it measures
 * the card's true size); `style` on the View inside it that sinks.
 */
export function useLayerCard(source: LayerSource | undefined, info: { center: LatLng; markers: CanvasMarker[]; overlay: Record<string, unknown> | null; painted: boolean }) {
  const outer = useRef<View | null>(null);
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const rect = useRef<Rect | null>(null);
  const measure = useCallback(() => new Promise<Rect | null>((resolve) => {
    const node = outer.current;
    if (!node) { resolve(null); return; }
    node.measureInWindow((x, y, w, h) => resolve(w > 0 && h > 0 ? { x, y, w, h } : null));
  }), []);
  const release = useCallback(() => { scale.value = withSpring(1, { duration: 200, dampingRatio: 1 }); }, [scale]);

  // What the card shows, kept current for the window (it parks on exactly this view).
  const { center, markers, overlay, painted } = info;
  const owner = useRef({}).current;
  useEffect(() => {
    if (!source) return;
    setCard(source, owner, { center, markers, overlay, painted, measure, release } satisfies CardInfo);
  }, [source, center.lat, center.lng, markers, overlay, painted, measure, release]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => (source ? () => setCard(source, owner, null) : undefined), [source, owner]);

  const onPressIn = useCallback(() => {
    if (!source) return;
    scale.value = withTiming(PRESS_SCALE, { duration: PRESS_MS, easing: Easing.out(Easing.cubic) });
    // Measured while the finger is down, so the tap's lift opens the window in the same frame.
    void measure().then((r) => { rect.current = r; });
  }, [source, measure, scale]);
  const opened = useRef(false);
  const onPressOut = useCallback(() => {
    // The window is opening over it: the card comes back to size underneath, where it is waiting for the close.
    if (!opened.current) release();
    opened.current = false;
  }, [release]);
  /** The tap: the window opens from the card; or, with no window ready, `fallback` (the map page, as before). */
  const open = useCallback((fallback?: () => void) => {
    if (!source) { fallback?.(); return; }
    const go = (r: Rect | null) => {
      // Where the card is now, sunk as it is under the finger.
      const s = scale.value;
      const at = r ? { x: r.x + (r.w * (1 - s)) / 2, y: r.y + (r.h * (1 - s)) / 2, w: r.w * s, h: r.h * s } : null;
      if (openLayer(source, at, s)) {
        opened.current = true;
        haptics.tap();
        release();
      } else {
        release();
        fallback?.();
      }
    };
    if (rect.current) { go(rect.current); rect.current = null; } else void measure().then(go);
  }, [source, measure, release, scale]);
  return { outer, style, onPressIn, onPressOut, open };
}
