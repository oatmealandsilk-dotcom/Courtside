import { useEffect, useRef } from 'react';
import { router } from 'expo-router';

import { isStartTab } from '@/features/navigation/startTab';
import { peekShareTarget, takeShareTarget } from '@/features/invite/referral';
import { isSupabaseConfigured } from '@/lib/supabase';
import { show as showToast } from '@/lib/toast';
import { useApp } from '@/store/AppContext';

/**
 * Someone who opened a shared link before they had an account lands back on
 * that same thing once they are in: the first time the app reaches its start
 * page after sign-up and setup (or after signing in), the page they were
 * looking at opens over it. "I'm in" tapped on an open hit before signing up
 * joins the hit here too, so they arrive already in it.
 */
export function useShareLanding({ pathname, held }: { pathname: string; held: boolean }) {
  const { currentUserId, onboardingComplete, remoteLoaded, actions } = useApp();
  const busy = useRef(false);
  const ready = !!currentUserId && onboardingComplete && (remoteLoaded || !isSupabaseConfigured) && !held && isStartTab(pathname);
  useEffect(() => {
    if (!ready || busy.current || !peekShareTarget()) return;
    busy.current = true;
    void (async () => {
      try {
        const target = await takeShareTarget();
        if (!target) return;
        router.push(target.href as never);
        if (!target.joinHit) return;
        const result = await actions.joinHit(target.joinHit);
        if (result.error) showToast({ title: "Couldn't join the hit", body: 'It may be full or over. Find another one nearby.', icon: 'alert-circle-outline' });
        else showToast({ title: "You're in", body: 'Say hi in the hit’s chat.', icon: 'hit' });
      } finally {
        busy.current = false;
      }
    })();
  }, [ready, actions]);
}
