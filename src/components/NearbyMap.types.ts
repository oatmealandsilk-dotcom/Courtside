import type { TaggedCourt, User } from '@/data/types';
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
}
