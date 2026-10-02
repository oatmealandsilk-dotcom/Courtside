import type { PageStop } from '@/features/navigation/pageSlide';

/**
 * The first-run tutorial, as words. Six short tips, one thing each, in the
 * strip's order: the map the app opens on, then swiping, which slides the
 * pages along to the threads, then the bar's buttons from the Feed. This is
 * the only place the tutorial's copy lives, and where each tip sits.
 *
 * "Phone" is the bottom-bar layout (the iPhone app, and a phone-width
 * browser). "Wide" is the sidebar layout (a computer or tablet browser),
 * where every row already has a label, so the words name the place instead.
 */
export type TourTargetId = 'tab-discuss' | 'tab-home' | 'create' | 'tab-coaches' | 'tab-profile' | 'side-messages';

/** The shape of the lit window: round-ended for a tab, a circle for the +, a soft box for a sidebar row. */
export type HoleShape = 'pill' | 'circle' | 'row';

type Words = { title: string; body: string };

export interface TourStep {
  key: 'map' | 'swipe' | 'feed' | 'create' | 'coaching' | 'you';
  /** What gets the light in each layout; null is no window at all, the whole screen. */
  target: {
    phone: { id: TourTargetId; shape: HoleShape } | null;
    wide: { id: TourTargetId; shape: HoleShape } | null;
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

export const TOUR_STEPS: TourStep[] = [
  {
    // The page the app opens on, so no window: the whole screen is the subject.
    key: 'map',
    target: { phone: null, wide: null },
    page: MAP,
    // What the map always has, even in a new city: courts, the players who shared their spot, open hits.
    phone: { title: 'Your map', body: 'Courts near you, players who shared their spot, and open hits to join.' },
    wide: { title: 'Your map', body: 'Courts near you, players who shared their spot, and open hits to join.' },
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
    key: 'create',
    target: { phone: { id: 'create', shape: 'circle' }, wide: { id: 'create', shape: 'row' } },
    // "A photo after you play" is the Create menu's own line for an Instant.
    phone: { title: 'Share your tennis', body: 'Clips, posts, threads, or an Instant: a photo after you play.' },
    wide: { title: 'Share your tennis', body: 'Clips, posts, threads, or an Instant: a photo after you play.' },
  },
  {
    key: 'coaching',
    target: { phone: { id: 'tab-coaches', shape: 'pill' }, wide: { id: 'tab-coaches', shape: 'row' } },
    phone: { title: 'Ask a coach', body: 'Real coaches, approved one by one. Asking a question is free.' },
    wide: { title: 'Ask a coach', body: 'Real coaches, approved one by one. Asking a question is free.' },
  },
  {
    key: 'you',
    target: { phone: { id: 'tab-profile', shape: 'pill' }, wide: { id: 'side-messages', shape: 'row' } },
    // The bell and the paper plane are the two buttons in the Profile page's top-right corner.
    phone: { title: 'Messages live here', body: 'Your profile. Chats and alerts sit in its top-right corner.' },
    wide: { title: 'Messages and alerts', body: 'Chats with players and coaches. Alerts sit just above.' },
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
 * The last tip's button. The player stays on the Feed underneath, where the
 * bar's tips played out. Not "Start watching" or "Start exploring": the last
 * tip is about messages, so a plain "Got it" closes it.
 */
export const LAST_BUTTON = 'Got it';
