import { isoDaysAgo } from '@/lib/format';
import type { DailyHealth, Integration } from '../types';

export const integrations: Integration[] = [
  {
    provider: 'apple-health',
    label: 'Apple Health',
    category: 'wearable',
    connected: false,
    provides: ['Sleep', 'HRV', 'Resting heart rate', 'Steps', 'Active energy'],
    readsWorkouts: true,
  },
  {
    provider: 'whoop',
    label: 'WHOOP',
    category: 'wearable',
    connected: true,
    lastSyncedAt: isoDaysAgo(0, 5),
    provides: ['Recovery', 'HRV', 'Resting heart rate', 'Sleep', 'Strain'],
    readsWorkouts: true,
  },
  // Tennis sessions only (migration 69), so 'activity' rather than 'wearable':
  // the coach's recovery numbers never come from these.
  {
    provider: 'fitbit',
    label: 'Fitbit',
    category: 'activity',
    connected: false,
    provides: ['Tennis sessions', 'Heart rate'],
  },
  {
    provider: 'oura',
    label: 'Oura',
    category: 'activity',
    connected: false,
    provides: ['Tennis sessions', 'Heart rate'],
  },
  {
    provider: 'polar',
    label: 'Polar',
    category: 'activity',
    connected: false,
    provides: ['Tennis sessions', 'Heart rate'],
  },
  // No connection of its own: on an iPhone it comes in through Apple Health.
  {
    provider: 'garmin',
    label: 'Garmin',
    category: 'activity',
    connected: false,
    provides: ['Tennis sessions'],
  },
  {
    provider: 'cronometer',
    label: 'Cronometer',
    category: 'nutrition',
    connected: true,
    lastSyncedAt: isoDaysAgo(0, 2),
    provides: ['Calories', 'Protein', 'Carbs', 'Fat'],
  },  {
    provider: 'myfitnesspal',
    label: 'MyFitnessPal',
    category: 'nutrition',
    connected: false,
    provides: ['Calories', 'Protein', 'Carbs', 'Fat'],
  },
];

function day(offset: number, over: Partial<DailyHealth>): DailyHealth {
  return {
    date: isoDaysAgo(offset),
    calories: 2650,
    proteinGrams: 145,
    carbGrams: 300,
    fatGrams: 82,
    restingHeartRate: 52,
    hrvMs: 78,
    sleepHours: 7.4,
    recovery: 72,
    steps: 9200,
    ...over,
  };
}

/** Most recent day first. */
export const healthHistory: DailyHealth[] = [
  day(0, { recovery: 58, hrvMs: 61, sleepHours: 6.1, calories: 2410, proteinGrams: 128, steps: 11400 }),
  day(1, { recovery: 81, hrvMs: 88, sleepHours: 8.2, calories: 2780, proteinGrams: 158 }),
  day(2, { recovery: 66, hrvMs: 70, sleepHours: 6.9, calories: 2510, proteinGrams: 132 }),
  day(3, { recovery: 74, hrvMs: 79, sleepHours: 7.6 }),
  day(4, { recovery: 88, hrvMs: 94, sleepHours: 8.4, calories: 2900, proteinGrams: 165 }),
  day(5, { recovery: 63, hrvMs: 67, sleepHours: 6.5, calories: 2300, proteinGrams: 119 }),
  day(6, { recovery: 79, hrvMs: 84, sleepHours: 7.9 }),
];
