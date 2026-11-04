import { useEffect, useRef } from 'react';
import { router } from 'expo-router';
import { useFrameCallback, useSharedValue } from 'react-native-reanimated';

import { simAction, simCheckIn, simLog, simThreadFetch, startSimPolling } from '@/lib/simDriver';
import { startJsGapWatch } from '@/lib/simTrace';
import { forceBarLook } from '@/features/navigation/barLens';
import { forceTapFast } from '@/features/navigation/pressV2';
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
  // "fwatch ms=3000": the animation thread's and the app's own thread's frames for that long, every gap of 25 ms or more
  // as start+length (wall clock), into sim-log.txt ([fwatch] ui ... / js ...). For timing a move against a recording.
  const ui = useSharedValue({ end: 0, last: 0, n: 0, gaps: [] as number[][] });
  const frame = useFrameCallback(() => {
    'worklet';
    const st = ui.value;
    if (!st.end) return;
    const t = Date.now();
    const g = st.last ? t - st.last : 0;
    const gaps = g >= 25 && st.gaps.length < 60 ? [...st.gaps, [st.last, g]] : st.gaps;
    ui.value = { end: st.end, last: t, n: st.n + 1, gaps };
  }, false);
  const fwatch = (ms: number) => {
    const end = Date.now() + ms;
    ui.value = { end, last: 0, n: 0, gaps: [] };
    frame.setActive(true);
    const js: number[][] = [];
    let last = 0;
    let n = 0;
    const step = () => {
      const t = Date.now();
      if (last && t - last >= 25) js.push([last, t - last]);
      last = t;
      n += 1;
      if (t < end) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    setTimeout(() => {
      frame.setActive(false);
      const st = ui.value;
      ui.value = { end: 0, last: 0, n: 0, gaps: [] };
      simLog(`[fwatch] ui ${st.n}f ${st.gaps.map(([a, g]) => `${a}+${g}`).join(',')}`);
      simLog(`[fwatch] js ${n}f ${js.map(([a, g]) => `${a}+${g}`).join(',')}`);
    }, ms + 50);
  };
  const fwatchNow = useRef(fwatch);
  fwatchNow.current = fwatch;
  useEffect(() => {
    const off = [
      simAction('signin', () => { void now.current.signIn('you').then(() => router.replace('/')); }),
      simAction('go', (q) => { if (q.to) router.navigate(q.to as never); }),
      simAction('fwatch', (q) => fwatchNow.current(Number(q.ms) || 3000)),
      // How long the live app's reply fetch takes when a thread opens (simThreadFetch): ms=0 never, as the demo always was.
      simAction('threadfetch', (q) => { simThreadFetch.ms = Number(q.ms) || 0; simLog(`[sim] threadfetch ${simThreadFetch.ms}`); }),
      simAction('back', () => { if (router.canGoBack()) router.back(); }),
      simAction('mapvis', () => { void now.current.setMapVisibility('mutuals'); }),
      // Taps answering sooner (pressV2's TAP_FAST) off or on for this build, whoever is signed in, so the tap timing
      // (tapTiming) can time the same build both ways: on=0, on=1, or on=switch (back to the switch and the admin flag).
      simAction('tapfast', (q) => {
        forceTapFast(q.on === '1' ? true : q.on === '0' ? false : null);
        simLog(`[sim] tapfast ${q.on ?? 'switch'}`);
      }),
      // The admin bar look (barLens: the lens and the new bar) off or on for this build, or back to the switch.
      simAction('barlook', (q) => {
        forceBarLook(q.on === '1' ? true : q.on === '0' ? false : null);
        simLog(`[sim] barlook ${q.on ?? 'switch'}`);
      }),
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
    ];
    startSimPolling();
    startJsGapWatch();
    return () => off.forEach((f) => f());
  }, []);
  return null;
}
