import { router } from 'expo-router';

import type { LiveSession } from '@/data/types';
import { confirm } from '@/lib/confirm';
import type { LiveSessionActions } from '@/store/liveSession';
import { liveState, tooShort } from './liveSession';

/**
 * The log for a finished live session (Oct 7, owner: "This should function
 * exactly like how our current sessions are logged once you click finish"):
 * the "Log it" composer a tracker's session opens, filled in from the clock
 * (app/compose?live=1), where a photo or a clip goes on and it is posted or
 * saved privately.
 */
export function openLiveLog(how: 'push' | 'replace' = 'push') {
  const to = { pathname: '/compose', params: { live: '1' } } as const;
  if (how === 'replace') router.replace(to);
  else router.push(to);
}

/**
 * Finish, from wherever it is tapped (the live page, the bar, "Still
 * playing?"), and "Log it" once finished: stops the clock and opens the log
 * (`open`, openLiveLog unless the caller has its own way out).
 *
 * Under five minutes on the clock (the shortest a session can be logged,
 * migration 39) it opens nothing: that is almost always a Start tapped by
 * accident, so the app's own small card asks instead, "That was under 5
 * minutes" with Discard (straight away, no second question: there is next
 * to nothing to lose) or Keep going (the clock runs on, from a pause too).
 */
export function finishLive(
  s: LiveSession,
  actions: Pick<LiveSessionActions, 'finishLiveSession' | 'resumeLiveSession' | 'discardLiveSession'>,
  { open = () => openLiveLog(), onDiscard }: { open?: () => void; onDiscard?: () => void } = {},
) {
  if (tooShort(s)) {
    confirm({
      title: 'That was under 5 minutes',
      message: 'Sessions count from 5 minutes.',
      confirmLabel: 'Discard',
      destructive: true,
      cancelLabel: 'Keep going',
      onCancel: () => actions.resumeLiveSession(),
      onConfirm: () => { actions.discardLiveSession(); onDiscard?.(); },
    });
    return;
  }
  if (liveState(s) !== 'finished') actions.finishLiveSession();
  open();
}
