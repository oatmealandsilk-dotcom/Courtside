import { useEffect, useRef } from 'react';
import { router } from 'expo-router';

import { simAction, startSimPolling } from '@/lib/simDriver';
import { useApp } from '@/store/AppContext';

/**
 * The simulator proof harness's app-wide commands (simDriver: demo builds with EXPO_PUBLIC_SIM_DRIVER only; AppShell mounts
 * this only then): sign in to the demo, go to a page, go back, and say yes to "Who can see you on the map?" ahead, so the
 * recording shows the move and nothing else. The card's own "uth" (a tap of Up to hit) is NearbyMap's.
 */
export function SimDriverHost() {
  const { actions } = useApp();
  const now = useRef(actions);
  now.current = actions;
  useEffect(() => {
    const off = [
      simAction('signin', () => { void now.current.signIn('you').then(() => router.replace('/')); }),
      simAction('go', (q) => { if (q.to) router.navigate(q.to as never); }),
      simAction('back', () => { if (router.canGoBack()) router.back(); }),
      simAction('mapvis', () => { void now.current.setMapVisibility('mutuals'); }),
    ];
    startSimPolling();
    return () => off.forEach((f) => f());
  }, []);
  return null;
}
