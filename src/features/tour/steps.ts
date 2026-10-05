import type { PageStop } from '@/features/navigation/pageSlide';
import type { MapLead } from './mapLead';

/**
 * The first-run tutorial, as words. Three short tips, one thing each (Oct 5,
 * owner: "Do all"): the one thing to do on the map the app opens on, then
 * swiping, which slides the pages on to Discussions, then the + over the
 * Feed. When it ends the pages glide back to the map (TourOverlay). Asking a
 * coach and where messages live are no longer tips here: each is a small
 * tip the first time a new player opens that place (features/tips), so
 * Settings → Tips turns them off too. This is the only place the
 * tutorial's copy lives, and where each tip sits.
 *
 * "Phone" is the bottom-bar layout (the iPhone app, and a phone-width
 * browser). "Wide" is the sidebar layout (a computer or tablet browser),
 * where every row already has a label, so the words name the place instead.
 */
export type TourTargetId =
  | 'tab-discuss' | 'tab-home' | 'create' | 'tab-coaches' | 'tab-profile' | 'side-messages'
  // On the map page: the one thing to do there (see mapLead.ts).
  | 'map-lead';

/**
 * The shape of a lit window: round-ended for a tab, a circle for the +, a
 * soft box for a sidebar row; on a page, round-ended with a little air
 * around a row of buttons, or a soft box with air around a block.
 */
export type HoleShape = 'pill' | 'circle' | 'row' | 'round' | 'box';

export type TourSpot = { id: TourTargetId; shape: HoleShape };

type Words = { title: string; body: string };

export interface TourStep {
  key: 'map' | 'swipe' | 'create';
  /** The window in the bar (the sidebar on a computer); null is no window there. */
  target: {
    phone: TourSpot | null;
    wide: TourSpot | null;
  };
  /**
   * A second window, on the page itself, so the tip shows the very thing it
   * names. The card points at this one. It is found once the pages have slid
   * there; if it can't be found, the tip still shows, on the bar's window.
   */
  onPage?: {
    phone: TourSpot | null;
    wide: TourSpot | null;
  };
  phone: Words;
  /** null: the tip is left out of that layout. */
  wide: Words | null;
  /** For VoiceOver and TalkBack, where "swipe up" means something else. */
  screenReader?: Words;
  /**
   * Words for the one thing the map page leads with right now (mapLead.ts):
   * in a new city, sharing your link; for a teen, bringing friends; where
   * players already are, "I'm free". The same in both layouts.
   */
  byLead?: Partial<Record<MapLead, Words>>;
  /** The page under the tip as it comes up; the tutorial slides the pages there. Left out, they stay where the last tip left them. */
  page?: PageStop;
  /** Where the pages slide on their own while the tip is up, the way a swipe would. */
  slidesTo?: PageStop;
}

const MAP: PageStop = { pathname: '/discuss', section: 'players' };
const THREADS: PageStop = { pathname: '/discuss', section: 'discussions' };
const FEED: PageStop = { pathname: '/', section: '' };

export const TOUR_STEPS: TourStep[] = [
  {
    // The page the app opens on. The bar's Community button is lit (you are
    // here), and on the page the one thing to do: the invite card in a city
    // where nobody shares a spot yet, the friends card for a teen, "I'm
    // free" where players already are. Not found (a search open, a small
    // screen), the tip still shows, on the bar's button.
    key: 'map',
    target: { phone: { id: 'tab-discuss', shape: 'pill' }, wide: { id: 'tab-discuss', shape: 'row' } },
    onPage: { phone: { id: 'map-lead', shape: 'box' }, wide: { id: 'map-lead', shape: 'box' } },
    page: MAP,
    phone: { title: 'Your map', body: 'Courts near you, and the players who shared their spot.' },
    wide: { title: 'Your map', body: 'Courts near you, and the players who shared their spot.' },
    byLead: {
      invite: { title: 'Bring your players', body: 'You’re early here. Send your link, and the map fills up with the people you play with.' },
      friends: { title: 'Bring your friends', body: 'Send your link. Friends who join can follow you, and you can follow them back.' },
      free: { title: 'Up for a hit?', body: 'Tap I’m free, and players nearby see your green ring on the map.' },
      'free-friends': { title: 'Up for a hit?', body: 'Tap I’m free, and friends who follow you back see your green ring.' },
    },
  },
  {
    // The pages slide from the map to Discussions on their own under this
    // tip, while a fingertip above the card shows the swipe that does it.
    key: 'swipe',
    target: { phone: null, wide: null },
    page: MAP,
    slidesTo: THREADS,
    phone: { title: 'Swipe for more', body: 'Swipe left for Discussions, then your Feed of clips.' },
    // A computer has no swipe: its sidebar already names every page.
    wide: null,
    screenReader: { title: 'Pages side by side', body: 'The map, Discussions and your Feed sit side by side. The bar at the bottom moves between them.' },
  },
  {
    // On to the Feed, with the + lit in the bar: the same on every page.
    key: 'create',
    target: { phone: { id: 'create', shape: 'circle' }, wide: { id: 'create', shape: 'row' } },
    page: FEED,
    phone: { title: 'Share your tennis', body: 'Post a clip, log a session, or ask a question.' },
    wide: { title: 'Share your tennis', body: 'Post a clip, log a session, or ask a question.' },
  },
];

/**
 * The page a tip sits over: its own, or the last one an earlier tip set.
 * A tip that slides the pages itself still begins on its own page, so the
 * slide is seen.
 */
export function tourPageAt(steps: TourStep[], at: number): PageStop | null {
  for (let i = Math.min(at, steps.length - 1); i >= 0; i -= 1) {
    const page = steps[i].page;
    if (page) return page;
  }
  return null;
}

/** The last tip's button: a plain "Got it", and the pages glide back to the map the app opens on. */
export const LAST_BUTTON = 'Got it';
