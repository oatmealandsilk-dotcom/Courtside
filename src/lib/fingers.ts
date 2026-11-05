import { Platform, type GestureResponderEvent } from 'react-native';

/*
 * Every finger in the app, as it lands and lifts (Nov 4, map ready ahead v3): heard by AppShell's frame before any
 * button, list, map or the system's swipe back gets it, so work nobody sees (mapWarm's hidden copy of the full map)
 * can start only after a pause with no finger down, and stop the instant one lands. It only notes the time and the
 * count; nothing is ever drawn or changed from here. iPhone only (the only place that work runs).
 */

/** Fingers on the screen now, as last heard. */
let down = 0;
/**
 * When a finger last landed or lifted. A finger down counts as down until its end or cancel comes, however long it is held
 * (review: with a time limit, one held or dragging past it read as quiet). One whose end never came is put right by the next
 * touch (land and lift count the fingers afresh); meanwhile nothing starts, which is only ever the safe side.
 */
let lastAt = 0;
const landers = new Set<() => void>();

/** The touches still on the screen after this event (whichever way the platform counts the one that just lifted). */
function still(e: GestureResponderEvent): number {
  const gone = new Set((e.nativeEvent.changedTouches ?? []).map((t) => t.identifier));
  return (e.nativeEvent.touches ?? []).filter((t) => !gone.has(t.identifier)).length;
}
function land(e: GestureResponderEvent) {
  down = Math.max(1, (e.nativeEvent.touches ?? []).length);
  lastAt = Date.now();
  landers.forEach((fn) => fn());
}
function lift(e: GestureResponderEvent) {
  down = still(e);
  lastAt = Date.now();
}

/** For AppShell's outermost view (capture: before anything inside it), only for someone with mapWarm. Nothing on the website or Android. */
export const fingerTouches = Platform.OS === 'ios'
  ? { onTouchStartCapture: land, onTouchEndCapture: lift, onTouchCancelCapture: lift }
  : null;

/** How long the screen has been free of fingers (ms); 0 while one is down. Before any touch at all: a very long time. */
export function fingersQuietMs(): number {
  const now = Date.now();
  if (down > 0) return 0;
  return now - lastAt;
}

/** Told the moment any finger lands anywhere in the app. */
export function onFingerDown(fn: () => void): () => void {
  landers.add(fn);
  return () => { landers.delete(fn); };
}
