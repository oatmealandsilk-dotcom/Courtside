import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

/*
 * The launch screen in the look the player picked (Nov 2, owner: "if someone selects night, then the
 * opening screen is always night, if it's day it's always day. If it's whatever mode phone on then it
 * responds according too. It shouldn't ever load black and load into white or vise versa.").
 *
 * The launch screen has two looks, white and dark (Oct 25). Until now every frame of it followed the
 * phone's light or dark mode, whatever the theme, so Night on a light phone opened white and then
 * turned dark at the curtain, and Clean on a dark phone the other way round. Now, where it is on:
 *   - a light court (Clean, CourtSide, Melbourne, Paris, London): white;
 *   - a dark one (Night, and New York's navy: the themes whose page is dark): dark;
 *   - Match phone, and anyone signed out (who sees Clean or Night by the phone): the phone's mode, as before.
 * (launchLookWanted in src/theme/ThemeProvider.tsx; LaunchLookGate saves it.)
 *
 * The look is saved for the next open, where it is read before anything is drawn:
 *   - iPhone: by the app's own native module (modules/launch-look: a new App Store build), which gives
 *     the launch's native copies that look and, where it can, puts it in iOS's own saved picture of the
 *     launch screen too, the very first frame. It says which look this open's copies are in (`applied`).
 *     Builds without the module: nothing changes (the phone's mode, as before).
 *   - The website: in the browser's storage, read by the loader in public/index.html before it draws.
 *   - Android: nothing yet (its launch screen is drawn by Android from the phone's mode; the way to change
 *     that would also change what the app reads as the phone's mode, which Match phone needs).
 * The app's own copies of the launch screen (src/components/LaunchMark.tsx: the loading screen, the
 * curtain) draw the look this open's launch was drawn in, so nothing ever changes look at a hand-over.
 */

/** One of the launch screen's two looks. */
export type LaunchLook = 'light' | 'dark';
/** What the launch screen follows: one of the two looks, or the phone's own light or dark mode (as before). */
export type LaunchLookSetting = LaunchLook | 'phone';

/**
 * Admins first (@oatmealandsilk, @mrdinosaur62): the iPhone part can only be seen on a store build
 * carrying the module, and is to be proved in the simulator before anyone else gets it. For everyone
 * by setting this to true and shipping an over-the-air update (no database change; the native part
 * must already be in the store build).
 *
 * To roll it back: set this to false (and LAUNCH_SNAPSHOTS to 'off' if iOS's pictures are the trouble)
 * by update, and keep LaunchLookGate: it puts every non-admin back on the phone's mode and iOS's own
 * pictures back. Never undo the gate itself while store builds with the module are out: the module would
 * keep the last look saved while the app's own copies follow the phone. (Should that happen anyway, the
 * module drops a look its code has not confirmed for two opens in a row, so it heals by the third.)
 */
export const LAUNCH_FOLLOWS_THEME_FOR_EVERYONE = false;

/**
 * iOS's own saved picture of the launch screen (the very first frame, before the app runs) given the
 * look too: 'same' writes it in iOS's own picture format, only where the phone can write that format;
 * 'png' falls back to a PNG under iOS's file name (as LLDynamicLaunchScreen does); 'off' leaves iOS's
 * picture by the phone's mode (the app's own frames still follow the look picked, from a soft dissolve
 * as the app comes up). Unproved on iOS 26/27: the simulator stage decides.
 */
export const LAUNCH_SNAPSHOTS: 'off' | 'same' | 'png' = 'same';

/**
 * Where iOS's own picture was still the phone's look (just after an update, or switched off above), the
 * app's native copy starts in it and dissolves into the look picked over this long, as soon as the app
 * is on screen, rather than changing at the curtain a second later.
 */
export const LAUNCH_DISSOLVE_MS = 250;

/** The browser's storage key the website's loader reads (public/index.html, before any of the app runs). */
export const WEB_LAUNCH_KEY = 'courtside-launch-look';

type Native = {
  applied(): string | null;
  setLook(look: string | null, snapshots: string, dissolveMs: number): void;
  confirm?(): void;
  status(): Promise<Record<string, unknown>>;
  syncNow(): Promise<Record<string, unknown>>;
};

const native: Native | null = (() => {
  if (Platform.OS !== 'ios') return null;
  try {
    return requireOptionalNativeModule<Native>('CourtSideLaunchLook');
  } catch {
    return null;
  }
})();

/** Whether this copy of the app can give its launch screen a look of its own (the website; an iPhone build with the module). */
export const LAUNCH_LOOK_POSSIBLE: boolean = Platform.OS === 'web' || !!native;

const asLook = (value: unknown): LaunchLook | null => (value === 'light' || value === 'dark' ? value : null);

/** What this open's launch was drawn in, read at once as the app's code starts: null, the phone's mode. */
const atOpen: LaunchLook | null = (() => {
  try {
    if (Platform.OS === 'web') return asLook(window.localStorage.getItem(WEB_LAUNCH_KEY));
    return native ? asLook(native.applied()) : null;
  } catch {
    return null;
  }
})();

/** The look a copy of the launch screen drawn now takes (null: the phone's mode): this open's, then the last one saved. */
let latest: LaunchLook | null = atOpen;

/** The look for a copy of the launch screen drawn now; null: by the phone's mode, as before. */
export const launchLookNow = (): LaunchLook | null => latest;

/** The look this open's own launch was drawn in (null: the phone's mode). */
export const launchLookAtOpen = (): LaunchLook | null => atOpen;

let saved: string | undefined;

/**
 * The look for the next open, saved where the launch reads it (LaunchLookGate, whenever the theme, Match
 * phone, signing in or out, or the switch changes it). Copies of the launch screen drawn from now on
 * (a sign-in's loading screen) take it too; one already up keeps its own (LaunchMark's useLaunchDark).
 */
export function saveLaunchLook(setting: LaunchLookSetting) {
  if (!LAUNCH_LOOK_POSSIBLE || setting === saved) return;
  saved = setting;
  const look = setting === 'phone' ? null : setting;
  latest = look;
  try {
    if (Platform.OS === 'web') {
      if (look) window.localStorage.setItem(WEB_LAUNCH_KEY, look);
      else window.localStorage.removeItem(WEB_LAUNCH_KEY);
    } else if (native) {
      native.setLook(look, look ? LAUNCH_SNAPSHOTS : 'off', LAUNCH_DISSOLVE_MS);
    }
  } catch {
    // Not saved: the next open follows the phone, as before.
  }
}

/**
 * Tells the iPhone's module that this copy of the app's code keeps the launch look (LaunchLookGate, at
 * every open, whoever is signed in). Two opens in a row without it (an update that took this code away),
 * the module drops the look saved, so a launch never stays in a look the app's own copies no longer draw.
 */
export function confirmLaunchLook() {
  try {
    native?.confirm?.();
  } catch {
    // Nothing: a saved look is then dropped after two opens, and saved again by the next save.
  }
}

/** What happened at this open and to iOS's saved pictures (iPhone builds with the module), for the simulator checks. */
export async function launchLookStatus(syncFirst = false): Promise<Record<string, unknown> | null> {
  if (!native) return null;
  try {
    return await (syncFirst ? native.syncNow() : native.status());
  } catch {
    return null;
  }
}
