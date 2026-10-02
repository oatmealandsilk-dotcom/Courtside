import type { PageStop } from '@/features/navigation/pageSlide';

/**
 * The first-run tutorial, as words. Six short tips, one thing each, in the
 * strip's order, and the pages slide along under them to every page they
 * talk about: the map the app opens on, then swiping, which slides the pages
 * on to the threads, then the Feed and the +, then Coaching, then Profile.
 * When it ends the pages glide back to the map (TourOverlay). This is the
 * only place the tutorial's copy lives, and where each tip sits.
 *
 * "Phone" is the bottom-bar layout (the iPhone app, and a phone-width
 * browser). "Wide" is the sidebar layout (a computer or tablet browser),
 * where every row already has a label, so the words name the place instead.
 */
export type TourTargetId =
  | 'tab-discuss' | 'tab-home' | 'create' | 'tab-coaches' | 'tab-profile' | 'side-messages'
  // On the pages themselves: the Ask a coach box with its note, and the bell and paper plane at the top of Profile.
  | 'coach-ask' | 'profile-inbox';

/**
 * The shape of a lit window: round-ended for a tab, a circle for the +, a
 * soft box for a sidebar row; on a page, round-ended with a little air
 * around a row of buttons, or a soft box with air around a block.
 */
export type HoleShape = 'pill' | 'circle' | 'row' | 'round' | 'box';

export type TourSpot = { id: TourTargetId; shape: HoleShape };

type Words = { title: string; body: string };

export interface TourStep {
  key: 'map' | 'swipe' | 'feed' | 'create' | 'coaching' | 'you';
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
  /** The page under the tip as it comes up; the tutorial slides the pages there. Left out, they stay where the last tip left them. */
  page?: PageStop;
  /** Where the pages slide on their own while the tip is up, the way a swipe would. */
  slidesTo?: PageStop;
}

const MAP: PageStop = { pathname: '/discuss', section: 'players' };
const THREADS: PageStop = { pathname: '/discuss', section: 'discussions' };
const FEED: PageStop = { pathname: '/', section: '' };
const COACHING: PageStop = { pathname: '/coaches', section: '' };
const PROFILE: PageStop = { pathname: '/profile', section: 'Posts' };

export const TOUR_STEPS: TourStep[] = [
  {
    // The page the app opens on, so no window: the whole screen is the subject.
    key: 'map',
    target: { phone: null, wide: null },
    page: MAP,
    phone: { title: 'Players near you', body: "The map shows who's playing nearby and open hits to join." },
    wide: { title: 'Players near you', body: "The map shows who's playing nearby and open hits to join." },
  },
  {
    // The pages slide from the map to the threads on their own under this
    // tip, while a fingertip above the card shows the swipe that does it.
    key: 'swipe',
    target: { phone: null, wide: null },
    page: MAP,
    slidesTo: THREADS,
    phone: { title: 'Swipe between pages', body: 'Swipe left and right to move between the map, threads and your feed.' },
    // A computer has no swipe: its sidebar already names every page.
    wide: null,
    screenReader: { title: 'Pages side by side', body: 'The map, threads and your feed sit side by side. The bar at the bottom moves between them.' },
  },
  {
    // The pages slide on to the Feed as this tip comes up, so it is what's underneath.
    key: 'feed',
    target: { phone: { id: 'tab-home', shape: 'pill' }, wide: { id: 'tab-home', shape: 'row' } },
    page: FEED,
    phone: { title: 'Your feed', body: 'Clips, photos and posts from players. Swipe up for more; double-tap a clip to like it.' },
    wide: { title: 'Your feed', body: 'Clips, photos and posts from players. Double-click a clip to like it.' },
    screenReader: { title: 'Your feed', body: 'Clips, photos and threads from players, one at a time.' },
  },
  {
    // Still over the Feed: the + is in the bar, the same on every page.
    key: 'create',
    target: { phone: { id: 'create', shape: 'circle' }, wide: { id: 'create', shape: 'row' } },
    // "A photo after you play" is the Create menu's own line for an Instant.
    phone: { title: 'Share your tennis', body: 'Clips, posts, threads, or an Instant: a photo after you play.' },
    wide: { title: 'Share your tennis', body: 'Clips, posts, threads, or an Instant: a photo after you play.' },
  },
  {
    // On to Coaching. The box you type a question in (and the line under it
    // saying who answers) gets the light, and the bar's Coaching button stays
    // lit with it, so you know where you are.
    key: 'coaching',
    target: { phone: { id: 'tab-coaches', shape: 'pill' }, wide: { id: 'tab-coaches', shape: 'row' } },
    onPage: { phone: { id: 'coach-ask', shape: 'box' }, wide: { id: 'coach-ask', shape: 'box' } },
    page: COACHING,
    phone: { title: 'Ask a coach', body: 'Type your question here. It goes to our coaches, and asking is free.' },
    wide: { title: 'Ask a coach', body: 'Type your question here. It goes to our coaches, and asking is free.' },
  },
  {
    // On to Profile, where messages really live: the bell and the paper plane
    // in its top-right corner get the light, with the bar's Profile button.
    // A computer's sidebar has its own Messages row, so there that row is lit.
    key: 'you',
    target: { phone: { id: 'tab-profile', shape: 'pill' }, wide: { id: 'side-messages', shape: 'row' } },
    onPage: { phone: { id: 'profile-inbox', shape: 'round' }, wide: null },
    page: PROFILE,
    phone: { title: 'Messages live here', body: 'The paper plane opens your chats. The bell shows your alerts.' },
    wide: { title: 'Messages and alerts', body: 'Chats with players and coaches. Alerts sit just above.' },
    screenReader: { title: 'Messages live here', body: 'At the top of your profile: Notifications, then Messages for your chats.' },
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

/**
 * The last tip's button. Not "Start watching" or "Start exploring": the last
 * tip is about messages, so a plain "Got it" closes it, and the pages glide
 * back to the map the app opens on.
 */
export const LAST_BUTTON = 'Got it';
