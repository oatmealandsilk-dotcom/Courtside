/**
 * The first-run tour, as words. Five short tips, one thing each, every one
 * pointing at something already on Home, so the tour never has to leave it.
 * This is the only place the tour's copy lives.
 *
 * "Phone" is the bottom-bar layout (the iPhone app, and a phone-width
 * browser). "Wide" is the sidebar layout (a computer or tablet browser),
 * where every row already has a label, so the words name the place instead.
 */
export type TourTargetId = 'tab-discuss' | 'create' | 'tab-coaches' | 'tab-profile' | 'side-messages';

/** The shape of the lit window: round-ended for a tab, a circle for the +, a soft box for a sidebar row. */
export type HoleShape = 'pill' | 'circle' | 'row';

type Words = { title: string; body: string };

export interface TourStep {
  key: 'feed' | 'community' | 'create' | 'coaching' | 'you';
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
    key: 'feed',
    target: { phone: null, wide: null },
    phone: { title: 'Swipe up for more', body: 'Clips, photos and threads from players. Double-tap a clip to like it.' },
    wide: { title: 'Scroll for more', body: 'Clips, photos and threads from players. Double-click a clip to like it.' },
    screenReader: { title: 'Your feed', body: 'Clips, photos and threads from players, one at a time.' },
  },
  {
    key: 'community',
    target: { phone: { id: 'tab-discuss', shape: 'pill' }, wide: { id: 'tab-discuss', shape: 'row' } },
    phone: { title: 'Find your people', body: 'Threads, questions and players to hit with. Or swipe left from Home.' },
    wide: { title: 'Find your people', body: 'Community: threads, questions and players near you to hit with.' },
    screenReader: { title: 'Find your people', body: 'Community: threads, questions and players near you to hit with.' },
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
 * The last tip's button, which hands the player back to the feed. Not "Start
 * watching": the last tip is about messages, and the first thing on the feed
 * is as often a post or a thread as a clip.
 */
export const LAST_BUTTON = 'Got it';
