import type { SessionDetail } from '@/data/types';

/**
 * The made-up session the app shows as an example: the welcome's second
 * moment, and sign-up's "Your tennis, logged for you" (ONBOARDING_V2), where
 * it is always marked EXAMPLE. Never anyone's real session.
 */
export const SAMPLE_SESSION: SessionDetail = {
  focus: 'Practice',
  minutes: 84,
  drills: [],
  kind: 'practice',
  activityId: 'welcome-demo',
  maxHr: 171,
  avgHr: 138,
  zones: [9, 21, 28, 19, 7],
};
