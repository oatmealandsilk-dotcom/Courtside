import React from 'react';

/**
 * A page that goes back when dragged to the right from anywhere on it, not
 * just from the screen's left edge (Oct 22, the Messages inbox).
 *
 * On the phone the native stack does the dragging itself: on iOS 26 a
 * stack page already goes back from a rightward drag anywhere on it (the
 * system's own content swipe, on by default in react-native-screens), with
 * the page underneath showing. All this needs is that nothing on the page
 * takes a rightward drag first (SwipeRow lets go of one). Older iOS keeps
 * the edge swipe: the stack's full-screen option there is a pan that also
 * starts on leftward drags and could steal a row's swipe to Mute/Delete. The browser's version, which drags
 * the page itself, is PageSwipeBack.web.tsx.
 */
export function PageSwipeBack({ children }: { children: React.ReactNode; onBack: () => void }) {
  return <>{children}</>;
}
