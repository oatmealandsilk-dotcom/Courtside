/**
 * The first-run tutorial, as words. Five short tips, one thing each, in the
 * strip's order: the map the app opens on, then the bar's buttons, every
 * one already on screen from Community (Find Players), so the tutorial
 * never has to leave it. This is the only place the tutorial's copy lives.
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
  key: 'map' | 'feed' | 'create' | 'coaching' | 'you';
  /** What gets the light in each layout; null is no window at all, the whole screen. */
  target: {
    phone: { id: TourTargetId; shape: HoleShape } | null;
    wide: { id: TourTargetId; shape: HoleShape } | null;
  };
  phone: Words;
  wide: Words;
  /** For VoiceOver and TalkBack, where "swipe up" means something else. */
  screenReader?: Words;
}

export const TOUR_STEPS: TourStep[] = [
  {
    // The page the app opens on, so no window: the whole screen is the subject.
    key: 'map',
    target: { phone: null, wide: null },
    phone: { title: 'Players near you', body: "The map shows who's playing nearby and open hits to join. Swipe left for threads." },
    wide: { title: 'Players near you', body: "The map shows who's playing nearby and open hits to join." },
    screenReader: { title: 'Players near you', body: "The map shows who's playing nearby and open hits to join." },
  },
  {
    key: 'feed',
    target: { phone: { id: 'tab-home', shape: 'pill' }, wide: { id: 'tab-home', shape: 'row' } },
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
 * The last tip's button, which hands the player back to the map underneath.
 * Not "Start watching" or "Start exploring": the last tip is about messages,
 * so a plain "Got it" closes it.
 */
export const LAST_BUTTON = 'Got it';
