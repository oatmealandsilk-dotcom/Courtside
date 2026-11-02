import { useEffect, useRef } from 'react';
import { router } from 'expo-router';
import { useFrameCallback, useSharedValue } from 'react-native-reanimated';

import { simAction, simCheckIn, simLog, startSimPolling } from '@/lib/simDriver';
import { setMapOpenSmoothSim, setMapOpenUiWatch } from '@/features/players/mapOpenSmooth';
import { useApp } from '@/store/AppContext';

/**
 * The simulator proof harness's app-wide commands (simDriver: demo builds with EXPO_PUBLIC_SIM_DRIVER only; AppShell mounts
 * this only then): sign in to the demo, go to a page, go back, say yes to "Who can see you on the map?" ahead, so the
 * recording shows the move and nothing else, and set how slow Up to hit's check-in is (simCheckIn). The card's own "uth"
 * (a tap of Up to hit) and "openmap" (a tap of the card) are NearbyMap's. "mapsmooth on=1|0|auto": the full map made
 * after its slide or as before (mapOpenSmooth), in the same build, to compare.
 */
export function SimDriverHost() {
  const { actions } = useApp();
  const now = useRef(actions);
  now.current = actions;
  // The UI thread's frames for a map opening's timing row (mapOpenSmooth): every gap of 25 ms or more as [ms after the tap, gap].
  const ui = useSharedValue({ t0: 0, last: 0, n: 0, first: -1, max: 0, gaps: [] as number[][] });
  const frame = useFrameCallback(() => {
    'worklet';
    const st = ui.value;
    if (!st.t0) return;
    const t = Date.now();
    const g = st.last ? t - st.last : 0;
    const gaps = g >= 25 && st.gaps.length < 40 ? [...st.gaps, [st.last - st.t0, g]] : st.gaps;
    ui.value = { t0: st.t0, last: t, n: st.n + 1, first: st.first < 0 ? t - st.t0 : st.first, max: Math.max(st.max, g), gaps };
  }, false);
  useEffect(() => {
    setMapOpenUiWatch({
      start: (t0) => { ui.value = { t0, last: 0, n: 0, first: -1, max: 0, gaps: [] }; frame.setActive(true); },
      stop: () => {
        frame.setActive(false);
        const st = ui.value;
        ui.value = { ...st, t0: 0 };
        return { n: st.n, first: st.first, max: st.max, gaps: st.gaps };
      },
    });
    return () => setMapOpenUiWatch(null);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
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
      // The full map made after its slide (1), as before (0), or as the switch says for this player (auto).
      simAction('mapsmooth', (q) => { setMapOpenSmoothSim(q.on === '1' ? true : q.on === '0' ? false : null); }),
    ];
    startSimPolling();
    return () => off.forEach((f) => f());
  }, []);
  return null;
}
