import type { TaggedCourt, User } from '@/data/types';
import type { FoundPlace } from '@/features/places/geocode';
import type { LatLng } from '@/features/players/positions';
import type { GrowPlan } from '@/features/players/mapGrow';

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
  /**
   * The still card's "N open hits nearby", as the Open hits list under it counts
   * them (places only typed included, which have no flag). Used while the card
   * counts from where you are; otherwise the card counts its own town's.
   */
  hitCount?: number;
  /**
   * The "You're early" card is right under the still card (Find Players, a
   * known adult with nobody sharing nearby): it already asks for the first
   * players, so the card's own "Be the first player on the map" stays out.
   */
  inviting?: boolean;
  /** "Who can see you on the map?" is up (or about to be) over the full map: its first pins wait to come in until it has gone. */
  holdPins?: boolean;
  /**
   * The still card's height, when not Find Players' own (CARD_HEIGHT): in
   * For you it fits the room a short post leaves (FeedFindPlayers). Its
   * "N players around" counts the faces on a card this tall.
   */
  cardHeight?: number;
  /** Shown in its own screen (a pager page that can be swiped away): false while that page is hidden, so its load clocks wait. */
  visible?: boolean;
  /**
   * Whether any of the card is in view right now, asked at the moment its map
   * finishes drawing (Community: false only while Find Players is wholly off
   * to the side, read from where the section row actually is, so a card
   * already sliding in under a finger counts as in view). A still card whose
   * map finishes drawing out of view is simply there when it slides in; one
   * in view, even part way, fades its cover off as usual.
   */
  inView?: () => boolean;
  /**
   * The still card holds the opening curtain until it shows its map (useStartMapHold). Off for a copy
   * of the card that is not what the app opens on (the feed's FeedFindPlayers), so it never slows it.
   */
  holdCurtain?: boolean;
  /**
   * The check-in zoom (mapGrow): the still card on the Community tab grows into the full map once you are up
   * (the page around it pushing in), rather than the full map sliding in. Only where the page can push in.
   */
  grow?: boolean;
  /** The full map, opened by the card growing into it: where it starts (the grown card's own view); on a phone, opened early and hidden (mapGrow v6). */
  growFrom?: GrowPlan | null;
  /** The grown card has handed over to the full map (it is now just the full map): told once. */
  onGrown?: () => void;
}
