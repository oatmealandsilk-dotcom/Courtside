import AsyncStorage from '@react-native-async-storage/async-storage';
import { requireOptionalNativeModule, type EventSubscription } from 'expo-modules-core';
import * as Notifications from 'expo-notifications';
import { AppState, Platform } from 'react-native';

/*
 * "Workout detected" on the lock screen the moment Apple Health saves a
 * workout (owner, Oct 5: "like how mine gives me a notification from Apple
 * when it registers a workout"), even with CourtSide closed.
 *
 * The watching is done by the phone itself, in CourtSide's own native module
 * (modules/workout-watch, from App Store build 15): Apple Health wakes the
 * app for each new workout, and the module puts up the alert. This file is
 * the app's side of it: telling the module what the person has switched on
 * (useWorkoutWatch calls start whenever that changes and each time the app
 * opens, stop when it is switched off or they sign out), and hearing the
 * alert's tap.
 *
 * Build 14 and older have no such module: every call here then does nothing
 * (requireOptionalNativeModule finds none), so this is safe to send as an
 * instant update before build 15 is out. Android has no module either, for
 * now. Health Connect, Android's Health app, would need its own: Health
 * Connect has no "wake me when a workout is saved" (no background delivery),
 * so a phone would have to look on a schedule (WorkManager, at most every 15
 * minutes, with READ_HEALTH_DATA_IN_BACKGROUND, Android 14 and later) and
 * read changes since a saved token (getChanges). The browser has its twin,
 * workoutWatch.web.ts, which does nothing.
 */

/** What the person has switched on, as the module keeps it. */
export type WatchPrefs = {
  /** Tennis sessions from Apple Health (their switch, and flag:tennis-apple). */
  tennis: boolean;
  /** Every other workout too (their own yes to every workout, and flag:workouts-apple). */
  workouts: boolean;
  /** WHOOP sends its own tennis alert: its copy in Health gets none. */
  skipWhoopTennis: boolean;
  /** Settings' alert switch for sessions (push_activity). */
  alerts: boolean;
};

/** A workout the module announced, as its alert (or its "open on screen" note) carries it. */
export type WatchedWorkout = { id: string; startedAt: string; endedAt: string; tennis: boolean };

type Native = {
  start(tennis: boolean, workouts: boolean, skipWhoopTennis: boolean, alerts: boolean): Promise<void>;
  stop(): Promise<void>;
  addListener(event: 'onWorkout', listener: (payload: Record<string, unknown>) => void): EventSubscription;
};

let native: Native | null | undefined;
function mod(): Native | null {
  if (native !== undefined) return native;
  native = null;
  if (Platform.OS !== 'ios') return native;
  try { native = requireOptionalNativeModule<Native>('WorkoutWatch'); } catch { native = null; }
  return native;
}

/** Whether this build carries the watching (an iPhone, build 15 or later). */
export const workoutWatchAvailable = () => mod() !== null;

/** Switched on (or the app opened with it on): the module is told what to announce. Never throws. */
export async function startWorkoutWatch(p: WatchPrefs): Promise<void> {
  const m = mod();
  if (!m) return;
  try { await m.start(p.tennis, p.workouts, p.skipWhoopTennis, p.alerts); } catch { /* tried again next launch */ }
}

/** Switched off, or signed out: no more alerts, and what the module kept is forgotten. Never throws. */
export async function stopWorkoutWatch(): Promise<void> {
  const m = mod();
  if (!m) return;
  try { await m.stop(); } catch { /* tried again next launch */ }
}

/** Whether the alert can come at all: this build watches, and the phone lets CourtSide put up alerts. Never throws. */
export async function alertsAllowed(): Promise<boolean> {
  if (!mod()) return false;
  try { return (await Notifications.getPermissionsAsync()).granted; } catch { return false; }
}

/** The module's own words for a workout → what the app needs, or null when it is not one of its alerts. */
function workoutOf(data: unknown): WatchedWorkout | null {
  const d = data as Record<string, unknown> | null | undefined;
  if (!d || d.courtside !== 'workout-detected') return null;
  const { workoutId: id, startedAt, endedAt } = d;
  if (typeof id !== 'string' || !id || typeof startedAt !== 'string' || typeof endedAt !== 'string') return null;
  if (!Number.isFinite(Date.parse(startedAt)) || !Number.isFinite(Date.parse(endedAt))) return null;
  return { id, startedAt, endedAt, tennis: d.tennis === true };
}

/**
 * While the app listens (open and signed in), a workout saved to Health with
 * the app on screen comes here instead of a lock-screen alert, so the app
 * can look at once and put up its own note. Returns the way to stop listening.
 */
export function onWorkoutInFront(listener: (w: WatchedWorkout) => void): () => void {
  const m = mod();
  if (!m) return () => undefined;
  try {
    const sub = m.addListener('onWorkout', (payload) => { const w = workoutOf(payload); if (w) listener(w); });
    return () => sub.remove();
  } catch {
    return () => undefined;
  }
}

/**
 * The module's alerts still showing on the lock screen and in Notification
 * Center (the person opened CourtSide from its icon instead of tapping one):
 * each one's workout (Health's id) and the alert's own id. Empty on a build
 * without the watching. Never throws.
 */
export async function presentedWorkoutAlerts(): Promise<{ workoutId: string; alertId: string }[]> {
  if (!mod()) return [];
  try {
    const shown = await Notifications.getPresentedNotificationsAsync();
    return shown.flatMap((n) => {
      const w = workoutOf(n.request.content.data);
      return w ? [{ workoutId: w.id, alertId: n.request.identifier }] : [];
    });
  } catch {
    return [];
  }
}

/**
 * Takes these alerts off the lock screen and Notification Center (their
 * workouts are in Notifications now). Only with the app on screen: a look in
 * the background (Health woke the app, and its alert just went up) leaves
 * the alert for the person to see.
 */
export function dismissWorkoutAlerts(alertIds: string[]) {
  if (!mod() || !alertIds.length || AppState.currentState !== 'active') return;
  for (const id of alertIds) void Notifications.dismissNotificationAsync(id).catch(() => undefined);
}

/** The last alert tap handed over, kept across the app reloading itself for an instant update (as push.ts does). */
const LAST_TAP_KEY = 'courtside-last-workout-tap';

/**
 * A tap on one of the module's alerts, also when the tap is what opened the
 * app: the workout it was about, once. (The server's alerts, which carry a
 * page to open, are push.ts's; these carry a workout instead.)
 */
export function listenForWorkoutAlertTaps(listener: (w: WatchedWorkout) => void): () => void {
  if (!mod()) return () => undefined;
  let opened: string | null = null;
  const take = async (response: Notifications.NotificationResponse | null) => {
    if (!response) return;
    const w = workoutOf(response.notification.request.content.data);
    if (!w) return;
    // At launch the same tap can arrive both ways (asked for, and as an event): one is used.
    const id = `${response.notification.request.identifier}@${response.notification.date ?? ''}`;
    if (id === opened) return;
    opened = id;
    const last = await AsyncStorage.getItem(LAST_TAP_KEY).catch(() => null);
    if (last === id) return;
    void AsyncStorage.setItem(LAST_TAP_KEY, id).catch(() => undefined);
    try { Notifications.clearLastNotificationResponse(); } catch { /* an older build */ }
    listener(w);
  };
  void Notifications.getLastNotificationResponseAsync().then(take).catch(() => undefined);
  const sub = Notifications.addNotificationResponseReceivedListener((response) => { void take(response); });
  return () => sub.remove();
}
