import type { CourtAccess, Post, User } from '@/data/types';
import type { CourtPostsStatus } from '@/features/places/useCourtPosts';

/**
 * Everything a court's page shows, worked out once by its route
 * (app/court/[id]/index.tsx), by the court's own rules, and handed to the
 * place card (PlaceCard), which only lays it out.
 */
export interface CourtView {
  name: string;
  /** The town ("Los Angeles, CA"), once found. */
  area: string | null;
  /** How far, from where the phone is or the city on your profile ("2.1 mi"). */
  distance: string | null;
  /** The town is still being asked: its line is held, so the name does not jump. */
  areaPending: boolean;
  /** The court as the rest of the app knows it (the map's id, when there is one). */
  here: { id?: string; name: string; lat: number; lng: number };
  /** The map's id, when facts, follows and right now can be kept for it. */
  factsId?: string;
  /** The court's own life (migration 60) is on this database. */
  extras: boolean;
  access: CourtAccess;
  bookUrl?: string;
  /** Members only, or someone's home: never suggested for a hit. */
  closed: boolean;
  /** How many follow it (a count, never names). */
  followers: number;
  /** What OpenStreetMap knows; null when no court was found there. */
  map: { count: number; surface?: string | null; lit: boolean } | null;
  /** Players have said whether it has lights: then only "What players say" mentions lights. */
  playersOnLights: boolean;
  /** "4 courts · hard · lit at night": what the map knows, in one line; '' when it knows nothing. */
  factsLine: string;
  posts: Post[];
  users: User[];
  status: CourtPostsStatus;
  more: boolean;
  loadingOlder: boolean;
  /** The post Watch all opens on (a clip with a picture first). */
  lead: Post | null;
  /** The people behind the posts, newest first, you aside. */
  players: User[];
  /** "Dev and Sam", "Dev, Sam and 2 others". */
  playedBy: string;
  /** "Last post 1h ago". */
  lastPost: string | null;
  currentUserId: string | null;
  /** Bumped by a pull, so King of the Court asks again. */
  kingTick: number;
  /** Start a session here, or the session already going (live), or one finished and not yet logged. */
  session: { state: 'start' | 'live' | 'finished'; onPress: () => void };
  onDirections: () => void;
  onMap: () => void;
  onShare: () => void;
  /** Post from here; left out where a post can't be tagged (no court on the map). */
  onPost?: () => void;
  onRefresh?: () => Promise<void>;
  onOpenReel: (post: Post) => void;
  onOlder: () => void;
  onRetry: () => void;
}
