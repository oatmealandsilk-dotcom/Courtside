import { Platform } from 'react-native';
import { Easing, ReduceMotion, cancelAnimation, makeMutable, withSpring, withTiming } from 'react-native-reanimated';

import { useSyncExternalStore } from 'react';

import { useApp } from '@/store/AppContext';
import { liquidGlass } from '@/components/ui/Glass';
import { isSupabaseConfigured } from '@/lib/supabase';

/**
 * The simulator's proof only (simDriver's "barlook on=0|1|switch"): the admin bar look forced off or on
 * whoever is signed in, so one build can be timed both ways. Null everywhere else (the switches and the admin flag decide).
 */
let barForced: boolean | null = null;
const barListeners = new Set<() => void>();
const readBarForced = () => barForced;
const subscribeBarForced = (fn: () => void) => { barListeners.add(fn); return () => { barListeners.delete(fn); }; };
export function forceBarLook(on: boolean | null) {
  if (barForced === on) return;
  barForced = on;
  barListeners.forEach((fn) => fn());
}

/**
 * The lens under the lit tab (Oct 26, owner: "Also can we experiment with building Liquid Glass for
 * our bottom bar. Like Instagram and Strava where a Liquid Glass circle shows the tab we are on";
 * and, about tab changes: "could be even more seamless, as well as tab switching").
 *
 * A rounded capsule sits behind the lit tab's icon and word, a little in from the bar's edges
 * (components/TabBarLooks): a quiet capsule a step darker than the bar (a step lighter on a dark
 * court and over a clip), inside the bar's own Liquid Glass on iOS 26, as iOS 26's own tab bar marks
 * its tab at rest. Never on the round +.
 *
 * It only ever moves sideways (a transform, on the animation thread; never a fade, never a redraw
 * per frame):
 *   - A tap: it slides to the tab from the moment the finger comes down, in step with the tab
 *     lighting there, on a calm spring that never overshoots the tab.
 *   - A swipe between tabs: it rides the tab row frame by frame under the finger (the phone's
 *     TabsPager, the browser's swipe), and lands with the page. Picked up mid-slide, it eases onto
 *     the row from where it stands instead of jumping.
 *
 * On the quiet pill, not built: a finger sliding along the bar dragging the lens, as iOS 26's own bar
 * does. The new bar has it (BAR_SLIDE, below).
 *
 * None of it can be seen on an iPhone before it ships (no simulator here), so admins
 * (@oatmealandsilk, @mrdinosaur62) get it first. Turned on for everyone by setting this to true and
 * shipping an over-the-air update: no database change, no new native code. In the web demo,
 * ?admin=1 makes the demo's player an admin. The same pattern as SWIPE_FOLLOW_FOR_EVERYONE.
 * Off, the bar is exactly as before.
 */
export const BAR_LENS_FOR_EVERYONE = false;

/** Whether this person's bar shows the lens. */
export function useBarLens(): boolean {
  const { currentUser } = useApp();
  const forced = useSyncExternalStore(subscribeBarForced, readBarForced, readBarForced);
  return forced ?? (BAR_LENS_FOR_EVERYONE || !!currentUser?.isAdmin);
}

/**
 * The new bar (tabBarLook's NEW_BAR; Oct 28, owner: "Also the Liquid Glass tab the bottom Should look
 * better look at Instagram and stravas", then "We just want our bar to look more like there's not exact
 * replica. Also the animation is inportant for tab switching"): a full capsule on lighter glass, the lit
 * tab in the brand's colour on a soft capsule of its own, and the capsule travelling between tabs as
 * iOS 26's own does (it lifts at the touch, stretches as it goes, settles without a wobble).
 *
 * Admins first, as the lens: nobody can see it on an iPhone before it ships. Turned on for everyone by
 * setting this to true and shipping an over-the-air update (no database change, no new native code).
 * Off, everyone else's bar is exactly today's.
 */
export const BAR_IG_FOR_EVERYONE = false;

/**
 * The new bar's press and slide (TabBarLooks' `slide`): a finger that comes down on the bar and moves
 * along it drags the lens across the tabs and lifting opens the one it is on, as iOS 26's own bar. It
 * starts only after 12 points sideways inside the Feed tab's hold time, so the hold that opens the
 * Feed's windows (a still finger for 400 ms) keeps the finger whenever it is the one that starts.
 * Off here: the new bar without it, everything else the same.
 */
export const BAR_SLIDE = true;

/** Whether this person's bar is the new one (it always has the lens). */
export function useBarIg(): boolean {
  const { currentUser } = useApp();
  const forced = useSyncExternalStore(subscribeBarForced, readBarForced, readBarForced);
  return forced ?? (BAR_IG_FOR_EVERYONE || !!currentUser?.isAdmin);
}

/**
 * Nov 2, owner: "Let's make the bottom bar even more like instagrams Liquid Glass. The animation especially."
 * Two ways, each with its own switch, both iPhone only (the website keeps today's bar):
 *
 *   A. Apple's own iOS 26 tab bar (components/NativeBar): the real Liquid Glass and Apple's own tab-switch
 *      motion, press and slide included, drawn by the phone itself. Our solid round + sits on top of its
 *      middle slot. Off for everyone, admins included, until he has seen it (BAR_NATIVE_FOR_ADMINS); its
 *      native code is already in the app (react-native-screens' tabs and expo-font's icon pictures, both in
 *      every build since Sep 12), so turning it on is an over-the-air update.
 *   B. The new bar's own motion rebuilt after Apple's (LENS_MOTION 'apple', StretchLens): at the touch the
 *      capsule swells into a bubble a little bigger than the bar, travels stretched like a drop of gel,
 *      wobbles a hair as it lands and sinks back into the flat capsule once the finger is up; the icon
 *      under it grows as under a lens. Admins first, on the iPhone (BAR_APPLE_MOTION_FOR_EVERYONE).
 *
 * With A on, B is not drawn (A replaces the bar). In a demo build for the iPhone Simulator (no Supabase:
 * the made-up demo data), EXPO_PUBLIC_SIM_BAR=native|apple|liquid picks one for the recording, the switches
 * here staying as they are; a store build or an over-the-air update never reads it.
 */
export const BAR_NATIVE_FOR_EVERYONE = false;
export const BAR_NATIVE_FOR_ADMINS = false;
export const BAR_APPLE_MOTION_FOR_EVERYONE = false;

/** The demo build's pick for the Simulator's recording (see above); undefined everywhere else. */
const SIM_BAR = !isSupabaseConfigured && Platform.OS !== 'web'
  ? (process.env.EXPO_PUBLIC_SIM_BAR as 'native' | 'apple' | 'liquid' | undefined)
  : undefined;

/** Whether this person's bar is Apple's own (A): iOS 26 only, where the phone has Liquid Glass. */
export function useBarNative(): boolean {
  const { currentUser } = useApp();
  if (Platform.OS !== 'ios' || !liquidGlass) return false;
  const admin = !!currentUser?.isAdmin;
  if (SIM_BAR) return SIM_BAR === 'native' && admin;
  return BAR_NATIVE_FOR_EVERYONE || (BAR_NATIVE_FOR_ADMINS && admin);
}

/** Whether the new bar's capsule moves Apple's way (B): on an iPhone only. */
export function useBarAppleMotion(): boolean {
  const { currentUser } = useApp();
  if (Platform.OS !== 'ios') return false;
  const admin = !!currentUser?.isAdmin;
  if (SIM_BAR) return SIM_BAR !== 'liquid' && admin;
  return BAR_APPLE_MOTION_FOR_EVERYONE || admin;
}

/**
 * On iOS 26: 'fill', the quiet capsule as everywhere else, inside the bar's Liquid Glass; 'glass', a
 * second piece of Apple's glass inside the bar's own. 'fill' by default (review, Oct 26): Apple's own
 * advice is never to lay glass on glass (glass cannot see through other glass, so a lens of it inside
 * the bar's can turn flat, muddy or blank, and the lens's copies laid over the bar during a followed
 * swipe are plain fills, so a glass lens would not match them), and things on glass are fills. The
 * glass lens is kept one line away for a look on the phone.
 */
export const LENS_LOOK = 'fill' as 'glass' | 'fill';

/** The four tabs in the row's order (the bar's, TabsPager's TAB_PATHS): a tab's place is its index here. */
export const LENS_TABS = ['discuss', 'index', 'coaches', 'profile'] as const;
const LAST = LENS_TABS.length - 1;

/** A tab's place in the row by its route name; -1 for anything else. */
export function lensPlace(route: string | undefined): number {
  return route ? (LENS_TABS as readonly string[]).indexOf(route) : -1;
}

/**
 * The spring a tap moves it on: critically damped (no bounce, never past the tab), carrying on from
 * however it is moving when a second tap retargets it.
 */
const LENS_SPRING = { dampingRatio: 1, duration: 420, overshootClamping: true } as const;
/**
 * How the new bar's capsule travels between tabs (Oct 28, owner, after the first video: "The new bottom is
 * better, still could be better animation"). Three, one line apart (TabBarLooks' StretchLens draws them):
 *
 *   'liquid'  its two ends ride two springs, the leading one quicker (about 250 ms) than the trailing one
 *             (about 330 ms): it stretches like a drop of liquid toward the tab, a touch flatter while
 *             stretched, and the back catches up as it lands. No bounce, never past the tab.
 *   'lens'    at the touch it swells into a glassier lens (bigger, a brighter rim, a highlight riding on
 *             it), travels a little stretched, and shrinks back as it lands, as iOS 26's own tab bar.
 *   'tuned'   the first version made snappier (about 240 ms, a short stretch, a small lift): the baseline.
 *
 * In all three the lit colour follows the capsule (a tab tints by how near it is), a soft tap as it lands
 * (on a phone), and Reduce Motion is a quick plain slide.
 *
 *   'apple'   (Nov 2, B above; iPhone only, by useBarAppleMotion, never through LENS_MOTION) Apple's iOS 26 tab
 *             bar, step by step: at the touch the capsule swells into a bubble a little bigger than the bar
 *             (out past its top and bottom edge, on a quick spring with a touch of give), slides to the tab on a
 *             spring of about 380 ms, stretched like gel by its own speed (its back chases its front on a soft
 *             spring, so it runs a hair past as it stops: the wobble), the icon under it a size bigger as
 *             under a lens; once the finger is up and it has landed it sinks back into the flat capsule.
 */
export type LensMotion = 'liquid' | 'lens' | 'tuned' | 'apple';
export const LENS_MOTION = 'liquid' as LensMotion;
const MOTIONS: readonly LensMotion[] = ['tuned', 'liquid', 'lens', 'apple'];
let motionChosen: LensMotion | null = null;
/**
 * The motion in use: LENS_MOTION, or in the web demo one picked with ?barmotion=liquid|lens|tuned (kept for
 * the visit), so the three can be filmed side by side from one build. `apple`: B's switch is on for this
 * person (useBarAppleMotion, an iPhone's), which decides it whatever LENS_MOTION says.
 */
export function lensMotion(apple = false): LensMotion {
  if (apple) return 'apple';
  if (motionChosen) return motionChosen;
  motionChosen = LENS_MOTION;
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      // (Not 'apple': the website keeps today's bar.)
      const asked = new URLSearchParams(window.location.search).get('barmotion') as LensMotion | null;
      if (asked && asked !== 'apple' && MOTIONS.includes(asked)) { window.sessionStorage.setItem('courtside-barmotion', asked); motionChosen = asked; }
      else {
        const kept = window.sessionStorage.getItem('courtside-barmotion') as LensMotion | null;
        if (kept && kept !== 'apple' && MOTIONS.includes(kept)) motionChosen = kept;
      }
    } catch { /* no storage: the default */ }
  }
  return motionChosen;
}
/** The motion as a number the animation thread reads (MOTIONS' order: 0 tuned, 1 liquid, 2 lens, 3 apple). Set by the bar on show. */
export const lensKind = makeMutable(1);
export function lensKindOf(motion: LensMotion): number {
  return MOTIONS.indexOf(motion);
}
/** The 'apple' motion's place in MOTIONS (lensKind's number for it). */
export const APPLE_KIND = 3;
/**
 * Each motion's leading spring (the first three critically damped: no bounce, never past the tab). Apple's
 * (UIKit's own springs are about this: a response near 0.38 s, damped to 0.86) ends half a point past the tab
 * at most, too little to see as a bounce; its give is in the shape (StretchLens), not the place.
 */
const NEW_SPRINGS = [
  { dampingRatio: 1, duration: 240, overshootClamping: true },
  { dampingRatio: 1, duration: 250, overshootClamping: true },
  { dampingRatio: 1, duration: 320, overshootClamping: true },
  { dampingRatio: 0.86, duration: 380, overshootClamping: false },
] as const;
/** Apple's spring (NEW_SPRINGS' last) for a way `places` tabs long: its time for one tab, and this much more for each further tab. */
const APPLE_MORE_MS = 150;
function appleSpring(places: number) {
  'worklet';
  const one = NEW_SPRINGS[APPLE_KIND];
  return { dampingRatio: one.dampingRatio, overshootClamping: one.overshootClamping, duration: one.duration + APPLE_MORE_MS * Math.max(0, Math.min(3, places) - 1) };
}
/** 1 from the moment a tap or a slide along the bar sends the new bar's lens to a tab until it lands there (its soft tap on landing). */
export const lensLanding = makeMutable(0);
/** Reduce Motion (lensFeel 2): a quick plain slide, no stretch, no lift. Run even with the setting on (it is the calm version already). */
const CALM_SLIDE = { duration: 160, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.Never } as const;

/** How the lens moves: 0 today's (the quiet pill's lens), 1 the new bar's, 2 the new bar's with Reduce Motion. Set by the bar on show. */
export const lensFeel = makeMutable(0);
/**
 * The new bar's trailing edge, as a place in the row (-1 not placed): it chases where the lens is drawn,
 * so the capsule stretches toward where it is going and gathers up as it lands (TabBarLooks' StretchLens).
 */
export const lensTrail = makeMutable(-1);
/** The new bar's lift, 0 to 1: up at the touch, back down once the finger is up and the lens has landed. */
export const lensLift = makeMutable(0);
/** 1 while a finger is down on one of the new bar's tabs. */
export const lensPress = makeMutable(0);

/**
 * The lens on its way to `to` from `from` (where it stands: the callers pass it, as lensAt is made further down
 * and so is not yet there for this function), on the bar's own move.
 */
function lensMove(to: number, from: number) {
  'worklet';
  const feel = lensFeel.value;
  // Apple's (B): the longer the way, the longer it takes, as Apple's own bar (Nov 2, measured on it, option A, in
  // the Simulator: one tab over in about a tenth of a second, the first tab to the last in about three; ours took
  // the same short time for both).
  if (feel === 1 && lensKind.value === APPLE_KIND) return withSpring(to, appleSpring(Math.abs(to - from)));
  return feel === 2 ? withTiming(to, CALM_SLIDE) : withSpring(to, feel === 1 ? NEW_SPRINGS[lensKind.value] ?? NEW_SPRINGS[1] : LENS_SPRING);
}
/** Picked up by a finger mid-slide: how long it takes to ease onto the row from where it stood. */
const CATCH_MS = 200;

/** Where the lens stands on its own (a tap, the tab on show), as a place in the row: fractional while it moves; -1 not placed yet. */
export const lensAt = makeMutable(-1);
/** The tab it is heading for, or has landed on (-1 none). */
export const lensGoal = makeMutable(-1);
/** 1 while the lens rides the tab row: from a finger picking the row up until the row lands. */
export const lensRides = makeMutable(0);
/** 1 while that finger is still down (a tab lit meanwhile is the swipe's own business, not a tap's). */
export const lensHeld = makeMutable(0);
/** Where the row the lens rides stands, as a place (fractional while it moves): written by whatever moves the row. */
export const lensRow = makeMutable(0);
/** How far the lens stood from the row as it started riding, eased to nothing so it never jumps. */
export const lensLag = makeMutable(0);

function clampRow(at: number) {
  'worklet';
  return Math.max(0, Math.min(LAST, at));
}

/**
 * Where the lens is drawn right now, as a place in the row (`fallback` until it has been placed).
 * The lens's own style reads the same values by name (TabBarLooks' Lens): a style is redrawn only
 * for values its own code reads.
 */
export function lensShown(fallback: number) {
  'worklet';
  if (lensRides.value) return clampRow(lensRow.value) + lensLag.value;
  return lensAt.value < 0 ? fallback : lensAt.value;
}

/** A finger picked the row up (standing at `rowAt`): the lens rides it from where it stands now. */
export function lensRide(rowAt: number) {
  'worklet';
  lensHeld.value = 1;
  if (lensAt.value < 0) return;
  const shown = lensShown(lensAt.value);
  cancelAnimation(lensAt);
  cancelAnimation(lensRow);
  lensRow.value = rowAt;
  const lag = shown - clampRow(rowAt);
  lensRides.value = 1;
  lensLag.value = lag;
  if (Math.abs(lag) > 0.001) lensLag.value = withTiming(0, { duration: CATCH_MS, easing: Easing.out(Easing.cubic) });
}

/** The finger lifted: the row is settling on `to`, which the lens is now heading for with it. */
export function lensLetGo(to: number) {
  'worklet';
  lensHeld.value = 0;
  if (lensRides.value) lensGoal.value = to;
}

/** The row landed on `to` (or the lens stops riding it there): the lens stays exactly where it is drawn and finishes there on its own. */
export function lensLand(to: number) {
  'worklet';
  lensHeld.value = 0;
  if (!lensRides.value) return;
  const shown = lensShown(to);
  lensRides.value = 0;
  cancelAnimation(lensLag);
  lensLag.value = 0;
  lensGoal.value = to;
  lensAt.value = shown;
  if (Math.abs(shown - to) > 0.001) lensAt.value = lensMove(to, shown);
}

/**
 * The lit tab is `to` (-1 none): the lens goes there. Placed straight there the first time (and after
 * no tab was lit), so it never slides in from an old spot. While a finger has the row, the swipe
 * decides; once it lifts and the row settles, only a tap on the bar (`tap`) takes the lens over from
 * where it stands. Anything else lit meanwhile is the swipe's own word reaching the bar late (review,
 * Oct 26: the tab a drag headed for, told to the bar after the finger had already let the row spring
 * back, sent the lens off the row to that tab and back again), and the row lands where it says.
 */
export function lensTo(to: number, tap = false) {
  'worklet';
  if (to < 0) {
    cancelAnimation(lensAt);
    lensAt.value = -1;
    lensGoal.value = -1;
    lensRides.value = 0;
    return;
  }
  if (lensRides.value && (lensHeld.value || !tap)) return;
  if (lensAt.value < 0 || lensGoal.value < 0) {
    cancelAnimation(lensAt);
    lensAt.value = to;
    lensGoal.value = to;
    return;
  }
  // Already heading there: on its own, or riding the row as it settles there.
  if (lensGoal.value === to) return;
  const shown = lensShown(to);
  if (lensRides.value) {
    lensRides.value = 0;
    cancelAnimation(lensLag);
    lensLag.value = 0;
    lensAt.value = shown;
  }
  lensGoal.value = to;
  // A tap on the bar: a soft tap when it lands (the new bar's; never for a tab lit any other way).
  if (tap && lensFeel.value !== 0) lensLanding.value = 1;
  lensAt.value = lensMove(to, lensAt.value);
}

/** The bar went away: the next one places its lens afresh. */
export function lensReset() {
  'worklet';
  cancelAnimation(lensAt);
  cancelAnimation(lensRow);
  cancelAnimation(lensLag);
  lensAt.value = -1;
  lensGoal.value = -1;
  lensRides.value = 0;
  lensHeld.value = 0;
  lensLag.value = 0;
  cancelAnimation(lensTrail);
  cancelAnimation(lensLift);
  lensTrail.value = -1;
  lensLift.value = 0;
  lensPress.value = 0;
  lensLanding.value = 0;
}

/** The row's own curve as it settles after a swipe (TabsPager's EASE, the browser swipe's cubic-bezier). */
const ROW_EASE = Easing.bezier(0.22, 0.61, 0.36, 1);

/** A finger moved the row to `rowAt`. Called where the row moves: on the phone, on the animation thread. */
export function lensFollow(rowAt: number) {
  'worklet';
  if (!lensRides.value) return;
  lensRow.value = rowAt;
}

/** The finger lifted: the row settles on `to` over `ms` on its own curve, and the lens lands with it. */
export function lensSettle(to: number, ms: number) {
  'worklet';
  lensLetGo(to);
  if (!lensRides.value) return;
  lensRow.value = withTiming(to, { duration: ms, easing: ROW_EASE }, (finished) => {
    if (finished) lensLand(to);
  });
}
