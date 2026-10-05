import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { requireOptionalNativeModule } from 'expo-modules-core';

/*
 * "Rate CourtSide" (build 15, Oct 5): Apple's and Google's own star-rating
 * box, asked for at a happy moment (useRatePrompt says when). It is the only
 * way Apple allows an app to ask for a rating inside the app (App Review
 * Guideline 5.6.1), and the phone, not the app, decides whether
 * the box really shows: Apple shows it at most three times in 365 days
 * whatever the app asks (and never in TestFlight), Google keeps its own
 * quota. On top of that CourtSide asks at most once in 60 days on a phone,
 * and once per open of the app.
 *
 * Only builds that carry expo-store-review (15 on) have the box. On older
 * builds the package is never loaded (its first line would close the app
 * there), so this is safe to send as an instant update: it does nothing.
 */

const KEY = 'courtside:rate-asked-at';
/** CourtSide's own gap between asks, on one phone. */
export const RATE_GAP_DAYS = 60;
const DAY_MS = 86_400_000;

/** Whether this build carries the rating box: an iPhone or Android build from 15 on. */
export function canAskForRating(): boolean {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return false;
  try {
    return !!requireOptionalNativeModule('ExpoStoreReview');
  } catch {
    return false;
  }
}

async function askedRecently(): Promise<boolean> {
  const raw = await AsyncStorage.getItem(KEY).catch(() => null);
  const at = raw ? Date.parse(raw) : NaN;
  return Number.isFinite(at) && Date.now() - at < RATE_GAP_DAYS * DAY_MS;
}

/**
 * Asks the phone for its rating box, unless this phone was asked in the last
 * 60 days. True when it was asked (whether the box then showed is the
 * phone's call, and the app is never told).
 */
export async function askForRating(): Promise<boolean> {
  if (!canAskForRating() || (await askedRecently())) return false;
  try {
    const StoreReview = require('expo-store-review') as typeof import('expo-store-review');
    if (!(await StoreReview.isAvailableAsync())) return false;
    await StoreReview.requestReview();
    await AsyncStorage.setItem(KEY, new Date().toISOString()).catch(() => undefined);
    return true;
  } catch {
    // No window to show it in (the app went to the background meanwhile): a later happy moment tries again.
    return false;
  }
}
