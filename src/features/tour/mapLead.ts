import { useSyncExternalStore } from 'react';

/**
 * The one thing Find Players leads with right now, for the tutorial's first
 * tip to light and name (Oct 5, owner: "Do all"):
 *   invite        nobody shares a spot near a known adult yet: "You're early" and its link
 *   friends       a teen (or anyone not known to be an adult) with no friend on the map: "Bring your friends"
 *   free          players are around: "I'm free"
 *   free-friends  the same for a teen, whose ring only friends who follow them back see
 * Community says which as it draws (discuss.tsx), and puts the tutorial's
 * target on that card. Kept apart, with nothing imported, like tourHold.
 */
export type MapLead = 'invite' | 'friends' | 'free' | 'free-friends';

let lead: MapLead | null = null;
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

export function setMapLead(next: MapLead | null): void {
  if (lead === next) return;
  lead = next;
  listeners.forEach((fn) => fn());
}

export function useMapLead(): MapLead | null {
  return useSyncExternalStore(subscribe, () => lead, () => lead);
}
