import type { Achievement } from '../types';

export const achievements: Achievement[] = [
  {
    id: 'ach-first-serve',
    name: 'First Serve',
    description: 'Logged your first session on CourtSide.',
    tier: 'bronze',
    icon: 'tennisball',
    rule: 'sessionsLogged >= 1',
  },
  {
    id: 'ach-ten-sessions',
    name: 'Grinder',
    description: 'Logged 10 practice sessions.',
    tier: 'bronze',
    icon: 'barbell',
    rule: 'sessionsLogged >= 10',
  },
  {
    id: 'ach-fifty-sessions',
    name: 'Court Rat',
    description: 'Logged 50 practice sessions.',
    tier: 'silver',
    icon: 'flame',
    rule: 'sessionsLogged >= 50',
  },
  {
    id: 'ach-streak-7',
    name: 'Seven Straight',
    description: 'Trained seven days in a row.',
    tier: 'silver',
    icon: 'calendar',
    rule: 'currentStreakDays >= 7',
  },
  {
    id: 'ach-streak-30',
    name: 'Iron Racquet',
    description: 'Thirty-day training streak.',
    tier: 'gold',
    icon: 'trophy',
    rule: 'longestStreakDays >= 30',
  },
  {
    id: 'ach-first-win',
    name: 'On the Board',
    description: 'Recorded your first match win.',
    tier: 'bronze',
    icon: 'ribbon',
    rule: 'matchesWon >= 1',
  },
  {
    id: 'ach-ten-wins',
    name: 'Closer',
    description: 'Ten match wins logged.',
    tier: 'silver',
    icon: 'medal',
    rule: 'matchesWon >= 10',
  },
  {
    id: 'ach-hundred-hours',
    name: 'Century Club',
    description: 'One hundred hours on court.',
    tier: 'gold',
    icon: 'time',
    rule: 'hoursOnCourt >= 100',
  },
  {
    id: 'ach-helper',
    name: 'Locker Room Legend',
    description: 'Had an answer accepted in Discussions.',
    tier: 'silver',
    icon: 'chatbubbles',
    rule: 'acceptedAnswers >= 1',
  },
  {
    id: 'ach-tournament',
    name: 'Draw Entrant',
    description: 'Registered for a tournament through CourtSide.',
    tier: 'gold',
    icon: 'flag',
    rule: 'tournamentsRegistered >= 1',
  },
];

export const achievementById = (id: string): Achievement | undefined =>
  achievements.find((a) => a.id === id);
