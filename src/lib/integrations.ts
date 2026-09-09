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

/** Summary the AI coach reads. Derived only from connected sources. */
export function healthSignal(history: DailyHealth[], integrations: Integration[]) {
  const wearable = integrations.some((i) => i.category === 'wearable' && i.connected);
  const nutrition = integrations.some((i) => i.category === 'nutrition' && i.connected);
  const recent = history.slice(0, 3);

  return {
    hasWearable: wearable,
    hasNutrition: nutrition,
    recovery: wearable && recent.length ? Math.round(mean(recent.map((d) => d.recovery))) : undefined,
    sleepHours: wearable && recent.length ? round1(mean(recent.map((d) => d.sleepHours))) : undefined,
    hrvMs: wearable && recent.length ? Math.round(mean(recent.map((d) => d.hrvMs))) : undefined,
    calories: nutrition && recent.length ? Math.round(mean(recent.map((d) => d.calories))) : undefined,
    proteinGrams: nutrition && recent.length ? Math.round(mean(recent.map((d) => d.proteinGrams))) : undefined,
  };
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
