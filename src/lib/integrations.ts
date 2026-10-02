/**
 * Health / nutrition integration seam.
 *
 * Nothing here talks to a real service yet. Each provider has a documented
 * hook-up path so the swap is mechanical when the backend exists.
 */

import type { DailyHealth, Integration, IntegrationProvider } from '@/data/types';

export interface ProviderSetup {
  provider: IntegrationProvider;
  /** How the real connection is established. */
  authMethod: 'oauth2' | 'healthkit' | 'file-import';
  docsUrl: string;
  /** What still needs building before this can be switched on. */
  todo: string;
}

export const providerSetup: Record<IntegrationProvider, ProviderSetup> = {
  cronometer: {
    provider: 'cronometer',
    authMethod: 'oauth2',
    docsUrl: 'https://cronometer.com/integrations/',
    todo: 'Server-side OAuth handshake + nightly pull of daily nutrition totals into DailyHealth.',
  },
  myfitnesspal: {
    provider: 'myfitnesspal',
    authMethod: 'oauth2',
    docsUrl: 'https://www.myfitnesspal.com/api',
    todo: 'Partner API access required. Until approved, support CSV export import as a fallback.',
  },
  'apple-health': {
    provider: 'apple-health',
    authMethod: 'healthkit',
    docsUrl: 'https://developer.apple.com/documentation/healthkit',
    todo: 'Needs a custom dev client (HealthKit is unavailable in Expo Go) plus read scopes for workouts, HR, sleep.',
  },
  whoop: {
    provider: 'whoop',
    authMethod: 'oauth2',
    docsUrl: 'https://developer.whoop.com/',
    todo: 'OAuth2 + webhook subscription for recovery, cycle and sleep events.',
  },
  garmin: {
    provider: 'garmin',
    authMethod: 'oauth2',
    docsUrl: 'https://developer.garmin.com/gc-developer-program/health-api/',
    todo: 'Health API program approval, then push-based daily summaries.',
  },
  strava: {
    provider: 'strava',
    authMethod: 'oauth2',
    docsUrl: 'https://developers.strava.com/',
    todo: 'OAuth2 + activity webhook to capture cross-training volume.',
  },
};

/**
 * Placeholder connect flow. Flips the local flag and stamps a sync time so the
 * UI is exercisable; a real implementation opens the provider's OAuth screen.
 */
export async function connectProvider(
  integration: Integration,
): Promise<Integration> {
  await new Promise((r) => setTimeout(r, 450));
  return { ...integration, connected: true, lastSyncedAt: new Date().toISOString() };
}

export async function disconnectProvider(integration: Integration): Promise<Integration> {
  await new Promise((r) => setTimeout(r, 250));
  return { ...integration, connected: false, lastSyncedAt: undefined };
}

/**
 * Summary the AI coach reads. Derived only from connected sources.
 * `skipSource` leaves one source's recovery, sleep and HRV out: WHOOP's terms
 * bar using its numbers for AI, so the coach is told only what another
 * source gave, and nothing when no other source gave any.
 */
export function healthSignal(history: DailyHealth[], integrations: Integration[], opts: { skipSource?: string } = {}) {
  const wearable = integrations.some((i) => i.category === 'wearable' && i.connected);
  const nutrition = integrations.some((i) => i.category === 'nutrition' && i.connected);
  const recent = history.slice(0, 3);
  // The average of one number over the recent days, from every source, or only the days another source gave it.
  const averaged = (col: string, pick: (d: DailyHealth) => number): number | undefined => {
    if (!opts.skipSource) return recent.length ? mean(recent.map(pick)) : undefined;
    const kept = recent.filter((d) => d.sources?.[col] !== opts.skipSource && pick(d) > 0).map(pick);
    return kept.length ? mean(kept) : undefined;
  };
  const recovery = averaged('recovery', (d) => d.recovery);
  const sleepHours = averaged('sleep_hours', (d) => d.sleepHours);
  const hrvMs = averaged('hrv_ms', (d) => d.hrvMs);

  return {
    hasWearable: wearable,
    hasNutrition: nutrition,
    recovery: wearable && recovery !== undefined ? Math.round(recovery) : undefined,
    sleepHours: wearable && sleepHours !== undefined ? round1(sleepHours) : undefined,
    hrvMs: wearable && hrvMs !== undefined ? Math.round(hrvMs) : undefined,
    calories: nutrition && recent.length ? Math.round(mean(recent.map((d) => d.calories))) : undefined,
    proteinGrams: nutrition && recent.length ? Math.round(mean(recent.map((d) => d.proteinGrams))) : undefined,
  };
}

/** health_days columns (the keys of DailyHealth.sources) and the field each fills. */
const FIELD: Record<string, keyof DailyHealth> = {
  recovery: 'recovery', sleep_hours: 'sleepHours', hrv_ms: 'hrvMs', resting_hr: 'restingHeartRate', calories: 'calories',
  protein_g: 'proteinGrams', carb_g: 'carbGrams', fat_g: 'fatGrams', steps: 'steps',
};

/**
 * The days with one source's numbers taken out (as 0, the app's "not given"),
 * for anything the AI coach is told or writes from: WHOOP's terms bar using
 * its numbers for AI. Other sources' numbers on the same day stay.
 */
export function withoutSource(history: DailyHealth[], source: string): DailyHealth[] {
  return history.map((d) => {
    const cols = Object.entries(d.sources ?? {}).filter(([, s]) => s === source).map(([c]) => FIELD[c]).filter(Boolean);
    if (!cols.length) return d;
    const copy: DailyHealth = { ...d };
    for (const f of cols) (copy as unknown as Record<string, number>)[f] = 0;
    return copy;
  });
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
