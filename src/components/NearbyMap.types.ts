import type { TaggedCourt, User } from '@/data/types';
import type { FoundPlace } from '@/features/places/geocode';
import type { LatLng } from '@/features/players/positions';
import type { useAnimatedStyle } from 'react-native-reanimated';
import type { GestureType } from 'react-native-gesture-handler';
import type { CanvasMarker } from '@/components/map/pinEngine';
import type { LayerSource } from '@/components/map/mapWindow';

/** What the map window (MapLayer) can tell its map to do. */
export interface LayerMapHandle {
  ease: (to: LatLng, zoom: number, ms: number, bezier: [number, number, number, number]) => void;
  jump: (to: LatLng, zoom: number) => void;
  labels: (on: boolean, ms: number, delay: number) => void;
  setInteractive: (on: boolean) => void;
  warm: (to: LatLng, zoom: number, back: LatLng, backZoom: number) => void;
  /** Where the map opens to: where you are (or your city), at a city's zoom. */
  openTarget: () => { center: LatLng; zoom: number };
}

/** The full map inside the map window (mapWindow): shut, it is the still card's picture; open, the full map. */
export interface LayerMapControl {
  /** 'card': the still card's own pins (quiet); 'full': the full map's. */
  mode: 'card' | 'full';
  /** The card it parks on while shut. */
  parked: { center: LatLng; markers: CanvasMarker[] } | null;
  /** Open and settled: a location fix may move it, sheets and prompts may come. */
  settled: boolean;
  /** Filled in by the map. */
  handle: { current: LayerMapHandle | null };
  /** Android's Back inside the open map: puts away whatever is up, true when it did. */
  back: { current: (() => boolean) | null };
  /** The top bar and the buttons along the bottom settle into place as the window opens (a move, never a fade). */
  topStyle?: ReturnType<typeof useAnimatedStyle>;
  bottomStyle?: ReturnType<typeof useAnimatedStyle>;
  /** A swipe down on the top bar closes the window (native). */
  topGesture?: GestureType;
  onPainted?: () => void;
  onWarm?: () => void;
  /** The phone stopped the map's page (it starts again by itself): not ready to open until it has drawn again. */
  onReboot?: () => void;
  /** Puts away whatever is up on the map (a card, the list, your sheet, a search), all at once: the window has closed. */
  reset: { current: (() => void) | null };
}

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
  /** The still card opens the map window (mapWindow) from where it is, as this card ('community' or 'feed'). */
  layerSource?: LayerSource;
  /** This is the map inside the map window. */
  layer?: LayerMapControl;
}
