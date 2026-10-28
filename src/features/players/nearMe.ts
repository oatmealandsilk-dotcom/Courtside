import { useEffect, useMemo } from 'react';

import type { User } from '@/data/types';
import { useFindable } from '@/features/people/findable';
import { useApp } from '@/store/AppContext';

/*
 * Near me (Oct 27, owner: "Near me should show people that have their
 * location set in the area, like the city"). Apple (Guideline 5.1.2(i))
 * keeps the map itself friends only and Check in only (migration 189), so
 * this is a list, never a pin: players whose own profile town is yours,
 * shown by that town ("Raleigh"), never a spot or a distance.
 *
 * Who is listed is the server's to say (players_in_town, migration 190):
 * your town is the one on your profile; someone is in it within 30 miles
 * by the towns' centres, or by the same town's name. Friends who follow
 * each other with you, any age; anyone else only a known adult, and only
 * to a known adult. So a teen is never listed to a stranger, and a teen
 * sees only friends here. The demo works it out the same way (api.ts).
 * On the phone it also leaves out anyone blocked either way and suspended
 * accounts (useFindable), as the server already does.
 */

/** "Raleigh, NC" → "Raleigh": the town a player chose for their profile, as it is shown. */
export const townLabel = (location: string | undefined) => (location ?? '').split(',')[0].trim();

/** A player in your town, by the town on their profile only. */
export interface TownPlayer { user: User; town: string }

/**
 * The players in your town for Near me, most recently active first. Asks the
 * server as it is first used (and again for a new town on your profile, at
 * most once a minute). `on`: false asks nothing and lists nobody.
 */
export function useTownPlayers(on = true): TownPlayer[] {
  const { townPlayers, users, currentUserId, currentUser, actions } = useApp();
  const { findable } = useFindable();
  const { loadTownPlayers } = actions;
  const myTown = (currentUser?.location ?? '').trim().toLowerCase();
  const myAtLat = currentUser?.cityAt?.lat;
  const myAtLng = currentUser?.cityAt?.lng;
  useEffect(() => { if (on && currentUserId) void loadTownPlayers(); }, [on, currentUserId, myTown, myAtLat, myAtLng, loadTownPlayers]);
  return useMemo(() => {
    if (!on || !townPlayers) return [];
    const byId = new Map(users.map((u) => [u.id, u]));
    return townPlayers.flatMap((id) => {
      const user = byId.get(id);
      const town = townLabel(user?.location);
      return findable(user) && town ? [{ user, town }] : [];
    });
  }, [on, townPlayers, users, findable]);
}
