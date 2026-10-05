import { useCallback, useMemo } from 'react';

import type { ID, User } from '@/data/types';
import { useApp } from '@/store/AppContext';

/**
 * Who people search can turn up for you: the same rule for every account,
 * so a result never says anything about someone's age. Teens are found by
 * name and @handle like anyone (Instagram's teen accounts, the owner's
 * call, Oct 5); what keeps them safe stays where it always was: a private
 * account shows only its card until they approve a follow, and the server
 * decides who may message or tag them and who sees them on the map.
 *
 * Left out: you, anyone you blocked or who blocked you (the server says who,
 * migration 118), and a suspended account, whose page only says it is
 * unavailable (an admin still finds it, to review it).
 *
 * Leaving out someone who blocked you is a courtesy of this app, not a
 * protection: their profile row still reaches your phone like everyone's
 * (and a direct link still opens their profile, as the privacy policy says),
 * so a changed app or a direct request to the database would still find
 * them. What protects them is the server's own block rules (no new chat,
 * no tag, not on the map), not this list.
 */
export function useFindable() {
  const { currentUserId, currentUser, blockedIds, blockedMeIds } = useApp();
  const admin = !!currentUser?.isAdmin;
  const hidden = useMemo(() => new Set<ID>([...blockedIds, ...blockedMeIds]), [blockedIds, blockedMeIds]);
  const findable = useCallback(
    (user: User | undefined): user is User =>
      !!user && user.id !== currentUserId && !hidden.has(user.id) && (!user.suspended || admin),
    [currentUserId, hidden, admin],
  );
  return { hidden, findable };
}
