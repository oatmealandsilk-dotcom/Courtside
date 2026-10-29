/**
 * "Why turn on alerts" in a browser: never. The website has no alerts
 * (push.web.ts), so there is nothing to ask for. See alertsWhy.ts.
 */
export const ALERTS_WHY = false;
export type AlertMoment = 'up-to-hit' | 'hit-posted' | 'hit-joined' | 'follow';
export type AlertsAsk = 'ask' | 'settings';
export interface AlertsWhyRequest { moment: AlertMoment; ask: AlertsAsk }
export async function noteAlertsLaunch(): Promise<void> { /* no alerts in a browser */ }
export async function askForAlertsAt(_moment: AlertMoment): Promise<void> { /* no alerts in a browser */ }
export function setAlertsWhyHost(_next: ((r: AlertsWhyRequest) => void) | null) { /* nothing to show */ }
export async function markAlertsWhyShown(): Promise<void> { /* nothing to count */ }
