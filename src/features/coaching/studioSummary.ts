import type { Coach, CoachingRequest, CoachQuestion, ID } from '@/data/types';
import { isOpen } from './bookings';

/**
 * The studio's four steps to being bookable (your page, services, payouts,
 * listed), worked out one way for the studio's checklist and for the ways
 * into the studio (the Coaching tab's card, the Profile row).
 */
export function studioSetup(coach: Coach) {
  const offered = coach.services.filter((s) => (s as { active?: boolean }).active !== false);
  const page = !!coach.headline.trim() && coach.specialties.length > 0;
  const services = offered.length > 0;
  const payouts = !!coach.payoutsReady;
  const listed = !!coach.listed;
  return { offered, page, services, payouts, listed, doneCount: [page, services, payouts, listed].filter(Boolean).length };
}

/** Paid (or free) bookings for this coach that still need an answer. */
export function openBookingCount(coach: Coach, requests: CoachingRequest[], currentUserId: ID | null) {
  return requests.filter((r) => (r.paidAt || !r.priceCents) && (r.coachId === coach.id || r.coachUserId === currentUserId) && isOpen(r)).length;
}

/** Free questions from players that nobody has answered yet. */
export function waitingQuestionCount(questions: CoachQuestion[]) {
  return questions.filter((q) => !q.resolved && q.replyIds.length === 0).length;
}

/**
 * One short line on where the studio stands, for the ways into it:
 * "2 bookings waiting · 1 question", "Setup 2 of 4 done", or "All caught up".
 */
export function studioLine(coach: Coach, requests: CoachingRequest[], questions: CoachQuestion[], currentUserId: ID | null) {
  const bookings = openBookingCount(coach, requests, currentUserId);
  const asked = waitingQuestionCount(questions);
  const { doneCount } = studioSetup(coach);
  const parts: string[] = [];
  if (bookings) parts.push(`${bookings} ${bookings === 1 ? 'booking' : 'bookings'} waiting`);
  if (asked) parts.push(`${asked} ${asked === 1 ? 'question' : 'questions'}`);
  if (doneCount < 4) parts.push(`Setup ${doneCount} of 4 done`);
  return { line: parts.length ? parts.join(' · ') : 'All caught up', waiting: bookings + asked, doneCount };
}
