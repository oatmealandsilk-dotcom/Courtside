/**
 * The latest animated value always wins (Nov 1, owner's iPhone: Find Players
 * "just loaded without the bottom", and stayed that way through a refresh
 * until the app was closed).
 *
 * Reanimated 4 copies an animated value that has sat still for a second into
 * the view's own style ("settled" props), and never takes that copy back (its
 * own TODO: "revert changes when animated styles are detached"). It copies
 * every half second, from the app's own thread, and forgets a value two
 * seconds after it was set: a phone busy for longer than a second right then
 * (opening, Low Power Mode) never copied the newer value, so the older one
 * (see-through, here) won for good once Reanimated forgot the newer one.
 *
 * So no copying: the timer that does it never starts. Reanimated then never
 * forgets a view's animated values while the view is up, so the latest one
 * always wins, as in Reanimated 3; a view that goes away is still cleaned up
 * by Reanimated itself. Nothing on the screen looks any different. Imported
 * first thing (app/_layout.tsx), before any animated view is built.
 *
 * The same module Reanimated's own views use (its source, which is what the
 * app is built from), reached by path: it is not part of Reanimated's public
 * surface, so if an update moves it this says so in the log and changes nothing.
 */
type Collector = { registerInterval?: () => void; intervalId?: unknown };

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PropsRegistryGarbageCollector: collector } = require('react-native-reanimated/src/PropsRegistryGarbageCollector') as { PropsRegistryGarbageCollector?: Collector };
  if (collector && typeof collector.registerInterval === 'function' && collector.intervalId == null) collector.registerInterval = () => {};
  else console.warn('[animated values] Reanimated changed: settled props left as they are');
} catch {
  console.warn('[animated values] Reanimated changed: settled props left as they are');
}

export {};
