import type { ID } from '@/data/types';
import { afterReport } from '@/features/moderation/reportThanks';
import { confirmReport } from '@/lib/confirm';

/** What the admin's card says about a reported group: its name, and what it says it is about. */
export function groupReportNote(name: string, description?: string): string {
  const about = description?.replace(/\s+/g, ' ').trim();
  return `Group “${name.trim()}”${about ? ` · ${about}` : ''}`.slice(0, 300);
}

/**
 * Reporting a group (App Review 1.2, Oct 6), from its page's "…" or a hold
 * on its row in Find groups: asked the same way as any report, then thanks
 * once it is in (or that it didn't send).
 *
 * It goes in as "group:<id>", naming whoever the app knows runs it (an
 * admin, seen from inside), and the group's name and about line for the
 * admin's card. The database fills in its creator itself (migration 145);
 * before that runs it keeps the admin named here, and a group seen from
 * outside names nobody, its name and id still on the card.
 */
export function reportGroup(
  report: (userId: ID | null | undefined, target: string, note?: string) => Promise<boolean>,
  group: { id: ID; name: string; description?: string; ownerId?: ID | null },
  fromMenu = false,
) {
  confirmReport('group', () => afterReport(report(group.ownerId ?? null, `group:${group.id}`, groupReportNote(group.name, group.description))), fromMenu);
}
