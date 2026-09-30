import { router } from 'expo-router';

import type { TaggedCourt } from '@/data/types';

/** A tagged court, opened on the map: the map goes there with the courts showing and that court's card up. */
export function openCourtOnMap(court: TaggedCourt) {
  router.push({ pathname: '/map', params: { court: court.id, lat: String(court.lat), lng: String(court.lng), name: court.name } });
}
