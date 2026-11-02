import { useEffect, useRef } from 'react';
import { router } from 'expo-router';

import { simAction, simCheckIn, simLog, startSimPolling } from '@/lib/simDriver';
import { useApp } from '@/store/AppContext';
import { setAutoDark, themes, useTheme, type ThemeName } from '@/theme/ThemeProvider';
import { launchLookAtOpen, launchLookNow, launchLookStatus } from '@/lib/launchLook';

/**
 * The simulator proof harness's app-wide commands (simDriver: demo builds with EXPO_PUBLIC_SIM_DRIVER only; AppShell mounts
 * this only then): sign in to the demo, go to a page, go back, say yes to "Who can see you on the map?" ahead, so the
 * recording shows the move and nothing else, and set how slow Up to hit's check-in is (simCheckIn). The card's own "uth"
 * (a tap of Up to hit) is NearbyMap's. Nov 2: a court or Match phone picked, and the launch-look module's report.
 */
export function SimDriverHost() {
  const { actions } = useApp();
  const now = useRef(actions);
  now.current = actions;
  const { setTheme } = useTheme();
  const pick = useRef(setTheme);
  pick.current = setTheme;
  useEffect(() => {
    const off = [
      simAction('signin', () => { void now.current.signIn('you').then(() => router.replace('/')); }),
      simAction('go', (q) => { if (q.to) router.navigate(q.to as never); }),
      simAction('back', () => { if (router.canGoBack()) router.back(); }),
      simAction('mapvis', () => { void now.current.setMapVisibility('mutuals'); }),
      // Location off (Settings' "Use my location"): the Community card goes back to the profile's city.
      simAction('locoff', () => { void now.current.setLocationEnabled(false); }),
      // How Up to hit's check-in behaves from now on (simCheckIn): fix=ms, server=ms, shift=m, fail=1.
      simAction('checkin', (q) => {
        if (q.fix !== undefined) simCheckIn.fixMs = Number(q.fix) || 0;
        if (q.server !== undefined) simCheckIn.serverMs = Number(q.server) || 0;
        if (q.shift !== undefined) simCheckIn.shiftM = Number(q.shift) || 0;
        if (q.fail !== undefined) simCheckIn.fail = q.fail === '1';
        simLog(`[sim] checkin fix ${simCheckIn.fixMs} server ${simCheckIn.serverMs} shift ${simCheckIn.shiftM} fail ${simCheckIn.fail}`);
      }),
      // The launch screen in the look picked (Nov 2, src/lib/launchLook.ts): pick a court (name=night, clean, us-open …)
      // or Match phone (on=1/0) as the Theme page would, then read what the launch-look module did (sync=1: put iOS's
      // saved pictures right first) into sim-log.txt.
      simAction('theme', (q) => { if (q.name && q.name in themes) pick.current(q.name as ThemeName); }),
      simAction('matchphone', (q) => { setAutoDark(q.on === '1'); }),
      simAction('launchlook', (q) => {
        void launchLookStatus(q.sync === '1').then((status) => {
          simLog(`[sim] launchlook atOpen ${launchLookAtOpen() ?? 'phone'} now ${launchLookNow() ?? 'phone'} ${JSON.stringify(status)}`);
        });
      }),
    ];
    startSimPolling();
    return () => off.forEach((f) => f());
  }, []);
  return null;
}
