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
  fitbit: {
    provider: 'fitbit',
    authMethod: 'oauth2',
    docsUrl: 'https://dev.fitbit.com/build/reference/web-api/',
    todo: 'Live through the trackers function (migration 69) once its keys are set: tennis sessions only.',
  },
  oura: {
    provider: 'oura',
    authMethod: 'oauth2',
    docsUrl: 'https://cloud.ouraring.com/v2/docs',
    todo: 'Live through the trackers function (migration 69) once its keys are set: tennis sessions only.',
  },
  polar: {
    provider: 'polar',
    authMethod: 'oauth2',
    docsUrl: 'https://www.polar.com/accesslink-api/',
    todo: 'Live through the trackers function (migration 69) once its keys are set: tennis sessions only.',
  },
  garmin: {
    provider: 'garmin',
    authMethod: 'oauth2',
    docsUrl: 'https://developer.garmin.com/gc-developer-program/health-api/',
    todo: 'Through Apple Health on iPhone (Garmin Connect writes workouts there). Garmin\'s own API needs a business application.',
  },
  strava: {
    provider: 'strava',
    authMethod: 'oauth2',
    docsUrl: 'https://developers.strava.com/',
    todo: 'OAuth2 + activity webhook to capture cross-training volume.',
  },
};

/**
 * Every source the Health screen lists, none connected: what each one is,
 * independent of any account. A signed-in account's connections (the
 * health_connections rows) are laid over this list, so a source shows on the
 * Health screen whether or not the server has a row for it.
 */
export const INTEGRATION_CATALOG: readonly Integration[] = [
  { provider: 'apple-health', label: 'Apple Health', category: 'wearable', connected: false, provides: ['Sleep', 'HRV', 'Resting heart rate', 'Steps', 'Active energy'] },
  { provider: 'whoop', label: 'WHOOP', category: 'wearable', connected: false, provides: ['Recovery', 'HRV', 'Resting heart rate', 'Sleep', 'Strain'] },
  // Tennis sessions only (migration 69), so 'activity' rather than 'wearable':
  // the coach's recovery numbers never come from these.
  { provider: 'fitbit', label: 'Fitbit', category: 'activity', connected: false, provides: ['Tennis sessions', 'Heart rate'] },
  { provider: 'oura', label: 'Oura', category: 'activity', connected: false, provides: ['Tennis sessions', 'Heart rate'] },
  { provider: 'polar', label: 'Polar', category: 'activity', connected: false, provides: ['Tennis sessions', 'Heart rate'] },
  // No connection of its own: on an iPhone it comes in through Apple Health.
  { provider: 'garmin', label: 'Garmin', category: 'activity', connected: false, provides: ['Tennis sessions'] },
  { provider: 'cronometer', label: 'Cronometer', category: 'nutrition', connected: false, provides: ['Calories', 'Protein', 'Carbs', 'Fat'] },
  { provider: 'myfitnesspal', label: 'MyFitnessPal', category: 'nutrition', connected: false, provides: ['Calories', 'Protein', 'Carbs', 'Fat'] },
];

/**
 * The catalog with `list`'s entries in place of the matching ones (and any
 * extra entry kept at the end), so no source is ever missing: a real account
 * that opened from its saved copy, before the demo list had loaded, used to
 * end up with an empty list and an empty "Your trackers".
 */
export function withCatalog(list: readonly Integration[]): Integration[] {
  const known = new Set(INTEGRATION_CATALOG.map((i) => i.provider));
  return [
    ...INTEGRATION_CATALOG.map((c) => list.find((i) => i.provider === c.provider) ?? { ...c, provides: [...c.provides] }),
    ...list.filter((i) => !known.has(i.provider)),
  ];
}

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
