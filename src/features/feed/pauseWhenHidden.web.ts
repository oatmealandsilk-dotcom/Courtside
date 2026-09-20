import { useEffect } from 'react';

/**
 * A browser tab you have switched away from keeps playing: the clip carries
 * on, out of sight, and all you hear is tennis coming from somewhere on your
 * computer. Phones stop on their own when the app goes away; browsers do not.
 *
 * So everything playing is paused when the tab goes to the back, and exactly
 * those are started again when it comes to the front — not whatever happens
 * to be on screen by then, and nothing the viewer had paused themselves.
 */
export function usePauseWhenHidden() {
  useEffect(() => {
    const held = new Set<HTMLVideoElement>();
    const changed = () => {
      if (document.hidden) {
        for (const video of document.querySelectorAll('video')) {
          if (!video.paused) { held.add(video); video.pause(); }
        }
        return;
      }
      for (const video of held) {
        // A page torn down while the tab was away has nothing to start again.
        if (video.isConnected) void video.play().catch(() => {});
      }
      held.clear();
    };
    document.addEventListener('visibilitychange', changed);
    return () => { document.removeEventListener('visibilitychange', changed); held.clear(); };
  }, []);
}
