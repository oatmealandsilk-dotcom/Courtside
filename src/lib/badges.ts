import { colors } from '@/theme';
import type { Achievement, AchievementTier, PlayerProfile, PlayerStats, User } from '@/data/types';
import { achievements } from '@/data/mock/achievements';

export interface LevelBadge {
  label: string;
  tint: string;
  ink: string;
  /** 0-1, how far up the ladder this player sits. Drives the profile meter. */
  progress: number;
}

const NTRP_MIN = 1.0;
const NTRP_MAX = 7.0;
const UTR_MAX = 16;

export function levelBadge(profile: PlayerProfile): LevelBadge {
  const { skillSystem, rating } = profile;

  if (skillSystem === 'UTR') {
    const progress = clamp01(rating / UTR_MAX);
    return { label: `UTR ${rating.toFixed(1)}`, ...tintFor(progress), progress };
  }

  if (skillSystem === 'ITF') {
    const progress = clamp01((4 - rating) / 3);
    return { label: `ITF ${Math.round(rating)}`, ...tintFor(progress), progress };
  }

  const progress = clamp01((rating - NTRP_MIN) / (NTRP_MAX - NTRP_MIN));
  return { label: `NTRP ${rating.toFixed(1)}`, ...tintFor(progress), progress };
}

function tintFor(progress: number): { tint: string; ink: string } {
  if (progress >= 0.78) return { tint: colors.brand, ink: colors.brandInk };
  if (progress >= 0.58) return { tint: colors.hard, ink: '#04122E' };
  if (progress >= 0.38) return { tint: colors.court, ink: '#04170D' };
  return { tint: colors.surfaceAlt, ink: colors.text };
}

export function tierColor(tier: AchievementTier): string {
  switch (tier) {
    case 'platinum':
      return '#BFD4E8';
    case 'gold':
      return '#F2C14E';
    case 'silver':
      return '#C3CCDA';
    default:
      return '#C08457';
  }
}

export interface AchievementProgress {
  achievement: Achievement;
  unlocked: boolean;
  /** 0-1 toward the threshold, for locked achievements. */
  progress: number;
}

/**
 * Evaluates every achievement against a player's stats.
 * The `rule` string on each achievement is documentation; the thresholds
 * live here so the check stays typed.
 */
export function evaluateAchievements(user: User): AchievementProgress[] {
  const s: PlayerStats = user.stats;
  const tournamentsRegistered = user.profile.tournaments.filter((t) => t.registered).length;
  const unlockedIds = new Set(user.achievementIds);

  const thresholds: Record<string, { current: number; target: number }> = {
    'ach-first-serve': { current: s.sessionsLogged, target: 1 },
    'ach-ten-sessions': { current: s.sessionsLogged, target: 10 },
    'ach-fifty-sessions': { current: s.sessionsLogged, target: 50 },
    'ach-streak-7': { current: s.currentStreakDays, target: 7 },
    'ach-streak-30': { current: s.longestStreakDays, target: 30 },
    'ach-first-win': { current: s.matchesWon, target: 1 },
    'ach-ten-wins': { current: s.matchesWon, target: 10 },
    'ach-hundred-hours': { current: s.hoursOnCourt, target: 100 },
    'ach-helper': { current: unlockedIds.has('ach-helper') ? 1 : 0, target: 1 },
    'ach-tournament': { current: tournamentsRegistered, target: 1 },
  };

  return achievements.map((achievement) => {
    const t = thresholds[achievement.id] ?? { current: 0, target: 1 };
    const progress = clamp01(t.current / t.target);
    return {
      achievement,
      unlocked: unlockedIds.has(achievement.id) || progress >= 1,
      progress,
    };
  });
}

export function winRate(stats: PlayerStats): number {
  if (stats.matchesPlayed === 0) return 0;
  return Math.round((stats.matchesWon / stats.matchesPlayed) * 100);
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

export const playStyleLabel: Record<PlayerProfile['playStyle'], string> = {
  'aggressive-baseliner': 'Aggressive baseliner',
  counterpuncher: 'Counterpuncher',
  'all-court': 'All-court player',
  'serve-and-volley': 'Serve and volley',
  pusher: 'Retriever',
};

export const fitnessLabel: Record<PlayerProfile['fitnessLevel'], string> = {
  beginner: 'Beginner',
  recreational: 'Recreational',
  competitive: 'Competitive',
  elite: 'Elite',
};

export const surfaceLabel: Record<PlayerProfile['preferredSurface'], string> = {
  hard: 'Hard',
  clay: 'Clay',
  grass: 'Grass',
  indoor: 'Indoor',
};
