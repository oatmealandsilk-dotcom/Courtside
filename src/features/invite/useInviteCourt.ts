import { useMemo } from 'react';

import type { useNearCourts } from '@/components/place/CourtsNear';
import type { InviteCourt } from '@/features/invite/referral';
import { labelOf, looksPublic } from '@/features/places/courtName';
import { notKnownAdult } from '@/features/players/age';
import { isClosedCourt } from '@/features/players/courts';
import { milesBetween } from '@/features/players/geo';
import { IN_TOWN_MILES } from '@/features/players/mapModel';
import type { LatLng } from '@/features/players/positions';
import { useApp } from '@/store/AppContext';

type NearCourts = ReturnType<typeof useNearCourts>;

/**
 * The court an invite link carries (Find Players' "You're early" card, and
 * the first-move page's "Bring your hitting partners"): one you follow in
 * town, else the nearest that reads as public within 5 miles, else the first
 * public one Courts near you lists (a bigger park when two are about as
 * near; never a club or someone's own court, and none that is members
 * only). Never for a teen, or anyone not known to be an adult: a poster or
 * link naming where a teen plays would put their court in front of
 * strangers.
 */
export function useInviteCourt(youAt: LatLng | null, nearCourts: NearCourts): InviteCourt | null {
  const { currentUser, followedCourts } = useApp();
  // With nothing open, a court is named only when the nearest one reads as public and is close: never just because it is nearest.
  const nearest = nearCourts.nearest;
  const promptCourt = nearest && looksPublic(nearest.c.name) && nearest.miles <= 5 ? nearest.c : null;
  return useMemo(() => {
    if (!currentUser || notKnownAdult(currentUser)) return null;
    // A court with a name only: "Hit with me at Tennis courts" tells a friend nothing.
    const mine = followedCourts?.find((c) => !isClosedCourt(c) && !!c.name && c.name !== 'Tennis courts' && (!youAt || milesBetween(youAt, c) <= IN_TOWN_MILES));
    if (mine?.name) return { id: mine.courtId, name: mine.name, lat: mine.lat, lng: mine.lng };
    const c = promptCourt ?? nearCourts.rows.find((r) => looksPublic(r.c.name) && r.miles <= IN_TOWN_MILES)?.c ?? null;
    return c ? { id: c.id, name: labelOf(c), lat: c.lat, lng: c.lng } : null;
  }, [currentUser, followedCourts, promptCourt, nearCourts.rows, youAt?.lat, youAt?.lng]); // eslint-disable-line react-hooks/exhaustive-deps
}
