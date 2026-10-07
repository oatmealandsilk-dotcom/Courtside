import type Ionicons from '@expo/vector-icons/Ionicons';

import type { DetectedActivity } from '@/data/types';
import { duration } from '@/lib/format';

/*
 * Workouts other than tennis (owner, Oct 5: "My brother is going to run
 * now…"): a run, a walk, a bike ride, strength training, HIIT, yoga, a swim,
 * as the Health app saved them. Each is kept as a short name ('run',
 * 'strength'), the same on the phone, on the server (migration 107's
 * workout_name has this very list) and in a post, and put into words here.
 */

/** Apple Health's own name for a workout type (as react-native-health hands it over) → CourtSide's short name. */
const HK_TO_SLUG: Record<string, string> = {
  Tennis: 'tennis',
  Running: 'run',
  WheelchairRunPace: 'wheelchair',
  WheelchairWalkPace: 'wheelchair',
  Walking: 'walk',
  Cycling: 'ride',
  HandCycling: 'ride',
  Hiking: 'hike',
  Swimming: 'swim',
  TraditionalStrengthTraining: 'strength',
  FunctionalStrengthTraining: 'functional-strength',
  HighIntensityIntervalTraining: 'hiit',
  CoreTraining: 'core',
  Yoga: 'yoga',
  Pilates: 'pilates',
  Barre: 'barre',
  Flexibility: 'stretching',
  Cooldown: 'cooldown',
  PreparationAndRecovery: 'recovery',
  MindAndBody: 'mind-body',
  Elliptical: 'elliptical',
  Rowing: 'rowing',
  StairClimbing: 'stairs',
  Stairs: 'stairs',
  StepTraining: 'stairs',
  JumpRope: 'jump-rope',
  MixedCardio: 'cardio',
  MixedMetabolicCardioTraining: 'cardio',
  CrossTraining: 'cross-training',
  Dance: 'dance',
  CardioDance: 'dance',
  SocialDance: 'dance',
  DanceInspiredTraining: 'dance',
  Boxing: 'boxing',
  Kickboxing: 'kickboxing',
  MartialArts: 'martial-arts',
  Pickleball: 'pickleball',
  TableTennis: 'table-tennis',
  Squash: 'squash',
  Badminton: 'badminton',
  Racquetball: 'racquetball',
  PaddleSports: 'paddling',
  Soccer: 'soccer',
  Basketball: 'basketball',
  Volleyball: 'volleyball',
  Golf: 'golf',
  Climbing: 'climbing',
  SkatingSports: 'skating',
  CrossCountrySkiing: 'skiing',
  DownhillSkiing: 'skiing',
  Snowboarding: 'snowboarding',
  SurfingSports: 'surfing',
  TrackAndField: 'track',
  Other: 'workout',
};

/** The short name's words. The same list as the server's workout_name (migration 107): keep the two in step. */
const NAMES: Record<string, string> = {
  tennis: 'Tennis',
  run: 'Run',
  walk: 'Walk',
  ride: 'Bike ride',
  hike: 'Hike',
  swim: 'Swim',
  strength: 'Strength training',
  // The Watch's two strength types read the same: a longer name pushed the day off a story picture.
  'functional-strength': 'Strength training',
  hiit: 'HIIT',
  core: 'Core training',
  yoga: 'Yoga',
  pilates: 'Pilates',
  barre: 'Barre',
  stretching: 'Stretching',
  cooldown: 'Cooldown',
  recovery: 'Recovery',
  'mind-body': 'Mind and body',
  elliptical: 'Elliptical',
  rowing: 'Rowing',
  stairs: 'Stair climbing',
  'jump-rope': 'Jump rope',
  cardio: 'Cardio',
  'cross-training': 'Cross training',
  dance: 'Dance',
  boxing: 'Boxing',
  kickboxing: 'Kickboxing',
  'martial-arts': 'Martial arts',
  pickleball: 'Pickleball',
  'table-tennis': 'Table tennis',
  squash: 'Squash',
  badminton: 'Badminton',
  racquetball: 'Racquetball',
  padel: 'Padel',
  soccer: 'Soccer',
  basketball: 'Basketball',
  volleyball: 'Volleyball',
  golf: 'Golf',
  climbing: 'Climbing',
  skating: 'Skating',
  skiing: 'Skiing',
  snowboarding: 'Snowboarding',
  surfing: 'Surfing',
  paddling: 'Paddling',
  track: 'Track and field',
  wheelchair: 'Wheelchair workout',
  workout: 'Workout',
  // Fitness logged by hand as "Gym" (Log a session). Not a Health type, and not on the
  // server's list: its fallback writes it the same way ("Gym").
  gym: 'Gym',
};

/** A short name the server takes: lower-case letters, numbers and dashes, 2 to 40 long, starting with a letter. */
export const SLUG = /^[a-z][a-z0-9-]{1,39}$/;

/** Apple Health's workout type as a short name: 48 (or "Tennis") is tennis; an unlisted one, its own name ("WaterPolo" → 'water-polo'). */
export function slugOfAppleWorkout(activityId: number | undefined, activityName: string | undefined): string {
  if (activityId === 48 || activityName === 'Tennis') return 'tennis';
  const name = (activityName ?? '').trim();
  const known = HK_TO_SLUG[name];
  if (known) return known;
  const kebab = name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 40).replace(/-+$/, '');
  return SLUG.test(kebab) ? kebab : 'workout';
}

/** "Run", "Strength training", "HIIT"; one not on the list says itself in words ("water-polo" → "Water polo"). */
export function workoutName(slug: string | undefined | null): string {
  const s = (slug ?? '').trim().toLowerCase();
  if (!s) return 'Workout';
  const known = NAMES[s];
  if (known) return known;
  const words = s.replace(/-/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Tennis (any tracker's), as against a workout of another kind. A row from before migration 107 has no other sport. */
export const isTennisActivity = (a: Pick<DetectedActivity, 'sport'>) => !a.sport || a.sport === 'tennis';

/** A small picture for a workout, from the icon set the app already uses. */
export function workoutIcon(slug: string | undefined): keyof typeof Ionicons.glyphMap {
  switch (slug) {
    case 'run': case 'walk': case 'hike': case 'track': case 'wheelchair': return 'walk-outline';
    case 'ride': return 'bicycle-outline';
    case 'swim': case 'paddling': case 'surfing': case 'rowing': return 'water-outline';
    case 'strength': case 'functional-strength': case 'core': case 'cross-training': case 'gym': return 'barbell-outline';
    case 'yoga': case 'pilates': case 'barre': case 'stretching': case 'cooldown': case 'recovery': case 'mind-body': case 'dance': return 'body-outline';
    case 'tennis': case 'pickleball': case 'table-tennis': case 'squash': case 'badminton': case 'racquetball': case 'padel': return 'tennisball-outline';
    case 'soccer': return 'football-outline';
    case 'basketball': case 'volleyball': return 'basketball-outline';
    case 'golf': return 'golf-outline';
    default: return 'fitness-outline';
  }
}

/** Metres as miles, the way the rest of the app says distance: "3.1 mi", "0.8 mi", "12 mi". Null under a tenth of a mile. */
export function formatDistance(m: number | undefined | null): string | null {
  if (!m || m <= 0) return null;
  const miles = m / 1609.344;
  if (miles < 0.1) return null;
  return miles < 10 ? `${miles.toFixed(1)} mi` : `${Math.round(miles).toLocaleString()} mi`;
}

/** The same distance as a number with its unit, for big figures: 3.1 and "mi". */
export function distanceFigure(m: number | undefined | null): { value: number; unit: string } | null {
  if (!m || m <= 0) return null;
  const miles = m / 1609.344;
  if (miles < 0.1) return null;
  return { value: miles < 10 ? Math.round(miles * 10) / 10 : Math.round(miles), unit: 'mi' };
}

/** A name inside a sentence: "Saturday run", "Saturday strength training", but "Saturday HIIT". */
export function inSentence(name: string): string {
  return name.length > 1 && name === name.toUpperCase() ? name : name.charAt(0).toLowerCase() + name.slice(1);
}

/** "Run · 32 min · 3.1 mi": what a workout was, how long, and how far when Health said. */
export function workoutLine(a: Pick<DetectedActivity, 'sport' | 'minutes' | 'distanceM'>): string {
  return [workoutName(a.sport), duration(a.minutes), formatDistance(a.distanceM)].filter(Boolean).join(' · ');
}

/**
 * What CourtSide says before Apple Health's own sheet, when asking for every
 * workout (migration 107): on the Health page, and in the offer to someone
 * who so far turned on tennis sessions only. Their own yes, never carried
 * over from the tennis one.
 */
export const WORKOUTS_ASK = {
  title: 'Workouts from Apple Health',
  message: 'CourtSide reads your workouts (tennis, runs, rides, the gym and more) and your heart rate during them, so you can log and post them, plus sleep, HRV, resting heart rate, steps, active energy and food (calories, protein, carbs, fat) for your Health page. Nothing is posted unless you choose to.',
} as const;

/** The same for WHOOP (migration 135), to someone whose WHOOP so far brings in tennis only. WHOOP already shares workouts, so no sign-in follows. */
export const WHOOP_WORKOUTS_ASK = {
  title: 'Workouts from WHOOP',
  message: 'CourtSide reads your WHOOP workouts (tennis, runs, rides, the gym and more) and your heart rate during them, so you can log and post them. The past week’s show up in Notifications. Nothing is posted unless you choose to.',
} as const;
