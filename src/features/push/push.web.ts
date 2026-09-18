/**
 * Push notifications on the website: none. Browsers are left out for now,
 * and not loading the phone's notification module keeps the web build quiet.
 */
export type PushState = 'on' | 'off' | 'unavailable';
export async function registerForPush(): Promise<PushState> { return 'unavailable'; }
export async function forgetPushToken() { /* nothing to forget on the web */ }
export function listenForPushTaps(): () => void { return () => undefined; }
