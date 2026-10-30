import { useEffect, useRef } from 'react';
import { router } from 'expo-router';

import { simAction, simCheckIn, simLog, startSimPolling } from '@/lib/simDriver';
import { useApp } from '@/store/AppContext';

/**
 * The simulator proof harness's app-wide commands (simDriver: demo builds with EXPO_PUBLIC_SIM_DRIVER only; AppShell mounts
 * this only then): sign in to the demo, go to a page, go back, say yes to "Who can see you on the map?" ahead, so the
 * recording shows the move and nothing else, and set how slow Up to hit's check-in is (simCheckIn). The card's own "uth"
 * (a tap of Up to hit) is NearbyMap's.
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
      // How Up to hit's check-in behaves from now on (simCheckIn): fix=ms, server=ms, shift=m, fail=1.
      simAction('checkin', (q) => {
        if (q.fix !== undefined) simCheckIn.fixMs = Number(q.fix) || 0;
        if (q.server !== undefined) simCheckIn.serverMs = Number(q.server) || 0;
        if (q.shift !== undefined) simCheckIn.shiftM = Number(q.shift) || 0;
        if (q.fail !== undefined) simCheckIn.fail = q.fail === '1';
        simLog(`[sim] checkin fix ${simCheckIn.fixMs} server ${simCheckIn.serverMs} shift ${simCheckIn.shiftM} fail ${simCheckIn.fail}`);
      }),
    ];
    startSimPolling();
    return () => off.forEach((f) => f());
  }, []);
  return null;
}
