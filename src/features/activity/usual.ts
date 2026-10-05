import type { ID, PracticeSession } from '@/data/types';
import { localDay } from '@/features/practice/stats';

/**
 * "18m over your usual": how much longer this session ran than your average
 * logged session over the last 30 days (owner's call, Oct 2). Worked out on
 * this phone from your own log and shown to you alone, never on a post.
 *
 * Like with like (Oct 5): a tennis session is compared with your sessions
 * that are not workouts (exactly the ones it was compared with before
 * workouts could be logged), and a workout (`workout`: 'run', 'strength')
 * only with your workouts of the same kind, so a week of runs never moves
 * tennis's number and a long ride is never set against a practice.
 *
 * Null unless there are at least three other sessions to compare with and
 * the difference is at least five minutes over: a shorter one is never
 * pointed out.
 */
export function overUsual(sessions: PracticeSession[], me: ID | null, minutes: number, opts: { exclude?: ID; now?: number; workout?: string } = {}): number | null {
  if (!me || !(minutes > 0)) return null;
  const since = localDay((opts.now ?? Date.now()) - 30 * 86_400_000);
  const recent = sessions.filter((s) => s.userId === me && s.id !== opts.exclude && s.day >= since && s.minutes > 0
    && (opts.workout ? s.workout === opts.workout : !s.workout));
  if (recent.length < 3) return null;
  const average = recent.reduce((sum, s) => sum + s.minutes, 0) / recent.length;
  const over = Math.round(minutes - average);
  return over >= 5 ? over : null;
}
