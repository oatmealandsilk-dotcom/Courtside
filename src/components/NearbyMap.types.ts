import type { TaggedCourt, User } from '@/data/types';
import type { FoundPlace } from '@/features/places/geocode';
import type { LatLng } from '@/features/players/positions';

export interface NearbyMapProps {
  me: User; players: User[]; onOpen: (id: string) => void;
  /** Tapping the still card opens the full map. */
  onExpand?: () => void;
  /** The whole page is the map, with the controls laid over it. */
  expanded?: boolean;
  fullscreen?: boolean;
  onBack?: () => void;
  /** Where the device says you are; without it you sit at the centre of your city. */
  at?: LatLng | null;
  onLocate?: () => void;
  locationOn?: boolean;
  locating?: boolean;
  onToggleLocation?: () => void;
  /** Opened from a post's tagged court: the map starts there with that court's card up. */
  focusCourt?: TaggedCourt | null;
  /** Opened on an open hit (?hit=…): the map goes to it with its card up. */
  focusHit?: string | null;
  /** Opened on a player (?user=…, from an alert): their card comes up once their pin is in. */
  focusUser?: string | null;
  /** Opened on a spot (?lat=…&lng=…, from an alert): the map starts there. */
  focusSpot?: LatLng | null;
  /** Opened on a place picked in Find Players' search (?place=…): the map starts there with that place's courts listed. */
  focusPlace?: FoundPlace | null;
  /** "Who can see you on the map?" is up (or about to be) over the full map: its first pins wait to come in until it has gone. */
  holdPins?: boolean;
}
