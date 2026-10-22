import React from 'react';

/**
 * A page that goes back when dragged to the right from anywhere on it, not
 * just from the screen's left edge (Oct 22, the Messages inbox).
 *
 * On the phone the native stack does the dragging itself: the page's
 * `fullScreenGestureEnabled` (see app/_layout.tsx) lets the whole screen
 * follow the finger with the page underneath showing, as iOS's own back
 * swipe does. All this needs is that nothing on the page takes a rightward
 * drag first (SwipeRow lets go of one). The browser's version, which drags
 * the page itself, is PageSwipeBack.web.tsx.
 */
export function PageSwipeBack({ children }: { children: React.ReactNode; onBack: () => void }) {
  return <>{children}</>;
}
