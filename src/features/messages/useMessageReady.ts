import { useEffect } from 'react';

import type { ID } from '@/data/types';
import { usePressV2 } from '@/features/navigation/pressV2';
import { useActions } from '@/store/AppContext';

/**
 * A page with a Message button (a player's, a coach's) asks the server once, as it opens, the
 * same question Message would ask on the tap: do they follow you now, and are they open to a
 * chat from you. The answers land in the app's state, so for anyone who is open the tap finds
 * it already settled and the chat opens at once, instead of waiting on two server calls with a
 * spinner (Oct 24, owner: "Buttons need to be way more responsive. They are way to delayed when
 * I click them").
 *
 * The rules are the same ones, decided the same way: for someone still locked (a teen who does
 * not follow you, a stranger who is not open), the tap still asks the server itself and that
 * answer is the final word. Asked once per visit, and only when the app cannot already tell.
 *
 * With the quicker press feel only (pressV2: admins first): it is new server traffic on every
 * such page, and its answers redraw the app while the page is still sliding in, which no web
 * check can time, so everyone else keeps asking on the tap, as before.
 */
export function useMessageReady(userId: ID | null | undefined) {
  const { canMessage, reachNow } = useActions();
  const quick = usePressV2();
  useEffect(() => {
    if (!quick || !userId || canMessage(userId)) return;
    void reachNow(userId).catch(() => undefined);
    // Once per page, for this person: not again on every change of the app's state.
  }, [userId, quick]); // eslint-disable-line react-hooks/exhaustive-deps
}
