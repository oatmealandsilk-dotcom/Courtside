import { useCallback, useEffect, useState } from 'react';

import { remote } from '@/data/remote';
import { supabase } from '@/lib/supabase';
import { useApp } from '@/store/AppContext';

/**
 * Whether you agreed to the AI coach. The coach is powered by Claude, made
 * by Anthropic, and answering means sending Anthropic your questions, your
 * tennis profile (injury and schedule notes included) and, when connected,
 * recent sleep and HRV from Apple Health. Apple's rules (5.1.2(i), 5.1.3)
 * want a clear yes in the app before any of that leaves it, so nothing is
 * sent until you agree here, and the server refuses too until it has your
 * yes on record (migration 115 and the ai-coach function). Taking it back
 * stops it.
 *
 * The demo build (no Supabase, or a demo account) sends nothing anywhere, so
 * it counts as agreed.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** The last answer, and whose: someone else signing in on this phone is asked afresh. */
let known: { user: string; agreed: boolean } | null = null;

export function useAiCoachConsent(): { agreed: boolean | undefined; agree: () => Promise<boolean>; withdraw: () => Promise<boolean> } {
  const { currentUserId } = useApp();
  const demo = !supabase || !currentUserId || !UUID.test(currentUserId);
  const [agreed, setAgreed] = useState<boolean | undefined>(demo ? true : known?.user === currentUserId ? known.agreed : undefined);
  useEffect(() => {
    if (demo || !currentUserId) { setAgreed(true); return; }
    if (known?.user === currentUserId) { setAgreed(known.agreed); return; }
    let current = true;
    void remote.aiCoachConsent(currentUserId).then((yes) => {
      known = { user: currentUserId, agreed: yes };
      if (current) setAgreed(yes);
    });
    return () => { current = false; };
  }, [demo, currentUserId]);
  const set = useCallback(async (yes: boolean) => {
    if (demo || !currentUserId) { setAgreed(true); return true; }
    const ok = await remote.setAiCoachConsent(currentUserId, yes);
    if (ok) { known = { user: currentUserId, agreed: yes }; setAgreed(yes); }
    return ok;
  }, [demo, currentUserId]);
  return { agreed, agree: () => set(true), withdraw: () => set(false) };
}
