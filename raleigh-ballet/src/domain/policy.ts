/**
 * The studio's rules as plain functions — no database, no clock of their own —
 * so each one can be tested exactly.
 */
import { hoursMs, daysMs } from "@/lib/time";

export class RuleError extends Error {
  constructor(
    message: string,
    public code: string = "rule",
  ) {
    super(message);
  }
}

/* ── Cancellation window ── */
export function cancellationCutoff(startsAt: Date, cutoffHours: number): Date {
  return new Date(startsAt.getTime() - hoursMs(cutoffHours));
}
/** Free to cancel strictly before the cutoff; at or after it is a late cancel. */
export function isFreeCancel(now: Date, startsAt: Date, cutoffHours: number): boolean {
  return now.getTime() < cancellationCutoff(startsAt, cutoffHours).getTime();
}

/* ── Credits: soonest-expiring first ── */
export type LotLike = { id: string; creditsRemaining: number; expiresAt: Date | null; purchasedAt: Date };

export function usableLots<T extends LotLike>(lots: T[], now: Date): T[] {
  return lots
    .filter((l) => l.creditsRemaining > 0 && (!l.expiresAt || l.expiresAt.getTime() > now.getTime()))
    .sort((a, b) => {
      const ax = a.expiresAt?.getTime() ?? Infinity;
      const bx = b.expiresAt?.getTime() ?? Infinity;
      return ax !== bx ? ax - bx : a.purchasedAt.getTime() - b.purchasedAt.getTime();
    });
}
export const balanceOf = (lots: LotLike[], now: Date) => usableLots(lots, now).reduce((n, l) => n + l.creditsRemaining, 0);

/** Which lots to take `cost` credits from. Throws if the balance is too low. */
export function planDeduction(lots: LotLike[], cost: number, now: Date): { lotId: string; take: number }[] {
  const plan: { lotId: string; take: number }[] = [];
  let left = cost;
  for (const lot of usableLots(lots, now)) {
    if (left <= 0) break;
    const take = Math.min(lot.creditsRemaining, left);
    plan.push({ lotId: lot.id, take });
    left -= take;
  }
  if (left > 0) throw new RuleError("Not enough class credits.", "insufficient_credits");
  return plan;
}

/* ── Attendance follow-up state machine ── */
export type FollowupStatus = "booked" | "pending_confirmation" | "attended_confirmed" | "no_show_excused" | "no_show_charged" | "absent" | "checked_in";
export type FollowupEvent =
  | { type: "class_ended_unchecked"; applyNoShowPolicy: boolean }
  | { type: "reply"; response: "attended" | "did_not_attend" }
  | { type: "response_window_closed" };

/** The only legal moves. Anything else returns null (ignored — e.g. a second click on an email link). */
export function followupTransition(status: FollowupStatus, event: FollowupEvent): FollowupStatus | null {
  if (status === "booked" && event.type === "class_ended_unchecked") return event.applyNoShowPolicy ? "pending_confirmation" : "absent";
  if (status === "pending_confirmation" && event.type === "reply") return event.response === "attended" ? "attended_confirmed" : "no_show_excused";
  if (status === "pending_confirmation" && event.type === "response_window_closed") return "no_show_charged";
  return null;
}
export const followupDue = (endsAt: Date, now: Date, delayMinutes: number) => now.getTime() >= endsAt.getTime() + delayMinutes * 60_000;
export const followupExpired = (sentAt: Date, now: Date, responseHours: number) => now.getTime() >= sentAt.getTime() + hoursMs(responseHours);
/** What happens to the class credit in each final state. */
export const creditOutcome = (status: string): "kept" | "returned" =>
  status === "cancelled" || status === "no_show_excused" ? "returned" : "kept";

/* ── Automatic archiving ── */
export function shouldArchive(
  p: { status: string; lastActivityAt: Date; hasActiveSubscription: boolean; hasUnexpiredCredits: boolean; isStaff?: boolean },
  now: Date,
  archiveAfterDays: number,
): boolean {
  if (p.status !== "active") return false;
  if (p.hasActiveSubscription || p.hasUnexpiredCredits || p.isStaff) return false;
  return now.getTime() - p.lastActivityAt.getTime() > daysMs(archiveAfterDays);
}

/* ── Tuition invoices ── */
/** `today` and `dueDate` are "YYYY-MM-DD" in studio time. Due today is still on time. */
export function invoiceStatus(inv: { status: string; dueDate: string }, today: string): "open" | "paid" | "void" | "overdue" {
  if (inv.status === "paid" || inv.status === "void") return inv.status;
  return today > inv.dueDate ? "overdue" : "open";
}
/** Reminders go out 3 and 7 days after the due date (once each). */
export function overdueReminderDue(inv: { dueDate: string; remindersSent: number }, today: string): boolean {
  const days = Math.floor((Date.parse(today) - Date.parse(inv.dueDate)) / 86400_000);
  return (days >= 3 && inv.remindersSent < 1) || (days >= 7 && inv.remindersSent < 2);
}
export function tuitionAmount(planCents: number, discountPct: number): number {
  return Math.round((planCents * (100 - discountPct)) / 100);
}
/** The oldest enrolled child pays full price; each further child gets the sibling discount. */
export function siblingDiscountFor(indexInHousehold: number, pct: number): number {
  return indexInHousehold > 0 ? pct : 0;
}
