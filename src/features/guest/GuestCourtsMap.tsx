import type { PeekHit } from '@/data/types';
import type { LatLng } from '@/features/players/positions';

/** How many open hits Find Players asks the peek for (GuestFindPlayers): a list this long may have more behind it. */
export const GUEST_PEEK_LIMIT = 30;

export interface GuestCourtsMapProps {
  near: LatLng | null;
  hits: PeekHit[] | null | undefined;
  locating: boolean;
  failed: 'denied' | 'unavailable' | null;
  onLocate: () => void;
}

/**
 * The guest's courts map is the website's (GuestCourtsMap.web.tsx): guest
 * mode is a browser's way in, and the phone apps never have a guest.
 */
export function GuestCourtsMap(_props: GuestCourtsMapProps) {
  return null;
}
