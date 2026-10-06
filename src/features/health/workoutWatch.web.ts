/*
 * The browser's twin of workoutWatch.ts: Apple Health never reaches a
 * browser, so there is nothing to watch and no alert to tap. Every call does
 * nothing, and the phone's notification module is never loaded here.
 */

export type WatchPrefs = { tennis: boolean; workouts: boolean; skipWhoopTennis: boolean; skipWhoopOther: boolean; alerts: boolean };
export type WatchedWorkout = { id: string; startedAt: string; endedAt: string; tennis: boolean };

export const workoutWatchAvailable = () => false;
export async function alertsAllowed(): Promise<boolean> { return false; }
export async function startWorkoutWatch(_p: WatchPrefs): Promise<void> { /* nothing to watch in a browser */ }
export async function stopWorkoutWatch(): Promise<void> { /* nothing to stop */ }
export async function presentedWorkoutAlerts(): Promise<{ workoutId: string; alertId: string }[]> { return []; }
export function dismissWorkoutAlerts(_alertIds: string[]) { /* no alerts in a browser */ }
export function onWorkoutInFront(_listener: (w: WatchedWorkout) => void): () => void { return () => undefined; }
export function listenForWorkoutAlertTaps(_listener: (list: WatchedWorkout[], grouped: boolean) => void): () => void { return () => undefined; }
