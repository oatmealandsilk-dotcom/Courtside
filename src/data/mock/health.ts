import { isoDaysAgo } from '@/lib/format';
import type { DailyHealth, Integration } from '../types';

export const integrations: Integration[] = [
  {
    provider: 'cronometer',
    label: 'Cronometer',
    category: 'nutrition',
    connected: true,
    lastSyncedAt: isoDaysAgo(0, 2),
    provides: ['Calories', 'Macros', 'Micronutrients', 'Hydration'],
  },
  {
    provider: 'myfitnesspal',
    label: 'MyFitnessPal',
    category: 'nutrition',
    connected: false,
    provides: ['Calories', 'Macros', 'Meal timing'],
  },
  {
    provider: 'whoop',
    label: 'WHOOP',
    category: 'wearable',
    connected: true,
    lastSyncedAt: isoDaysAgo(0, 5),
    provides: ['Recovery', 'HRV', 'Resting heart rate', 'Sleep'],
  },
  {
    provider: 'apple-health',
    label: 'Apple Health',
    category: 'wearable',
    connected: false,
    provides: ['Workouts', 'Heart rate', 'Steps', 'Sleep'],
  },
  {
    provider: 'garmin',
    label: 'Garmin',
    category: 'wearable',
    connected: false,
    provides: ['Training load', 'VO2 max', 'Sleep'],
  },
  {
    provider: 'strava',
    label: 'Strava',
    category: 'activity',
    connected: false,
    provides: ['Runs', 'Rides', 'Cross-training volume'],
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
