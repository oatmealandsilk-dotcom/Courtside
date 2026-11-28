import { useEffect, useRef } from 'react';
import { router } from 'expo-router';
import { useFrameCallback, useSharedValue } from 'react-native-reanimated';

import { SIM_DRIVER, simAction, simCheckIn, simLog, simThreadFetch, startSimPolling } from '@/lib/simDriver';
import { startJsGapWatch } from '@/lib/simTrace';
import { forceBarLook } from '@/features/navigation/barLens';
import { setBarPreview } from '@/features/navigation/barPreview';
import { requestSection } from '@/features/navigation/swipeOrder';
import { posts as demoPosts } from '@/data/mock/feed';
import { learned, TIP_WORDS, type TipKey } from '@/features/tips/tips';
import { forceTapFast } from '@/features/navigation/pressV2';
import { useApp } from '@/store/AppContext';
import { setAutoDark, themes, useTheme, type ThemeName } from '@/theme/ThemeProvider';
import { launchLookAtOpen, launchLookNow, launchLookStatus } from '@/lib/launchLook';

/**
 * The simulator proof harness's app-wide commands (simDriver: demo builds with EXPO_PUBLIC_SIM_DRIVER only; AppShell mounts
 * this only then): sign in to the demo, go to a page, go back, say yes to "Who can see you on the map?" ahead, so the
 * recording shows the move and nothing else, and set how slow Up to hit's check-in is (simCheckIn). The card's own "uth"
 * (a tap of Up to hit) is NearbyMap's. Nov 2: a court or Match phone picked, and the launch-look module's report.
 */
/** A clip's picture for the bars' pictures (clippic): a hard court under floodlights at night, from the baseline. */
const NIGHT_CLIP = `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1600" viewBox="0 0 900 1600">
<defs>
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#05080B"/><stop offset="1" stop-color="#16222A"/></linearGradient>
<radialGradient id="flA" cx="0.12" cy="0.1" r="0.55"><stop offset="0" stop-color="#FFF6DA" stop-opacity="0.55"/><stop offset="1" stop-color="#FFF6DA" stop-opacity="0"/></radialGradient>
<radialGradient id="flB" cx="0.9" cy="0.08" r="0.5"><stop offset="0" stop-color="#FFF6DA" stop-opacity="0.45"/><stop offset="1" stop-color="#FFF6DA" stop-opacity="0"/></radialGradient>
<linearGradient id="court" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2E4F6B"/><stop offset="1" stop-color="#16293A"/></linearGradient>
<linearGradient id="apron" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2D4A3A"/><stop offset="1" stop-color="#101C16"/></linearGradient>
<radialGradient id="vig" cx="0.5" cy="0.45" r="0.75"><stop offset="0.55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.55"/></radialGradient>
</defs>
<rect width="900" height="1600" fill="url(#sky)"/>
<rect x="0" y="560" width="900" height="1040" fill="url(#apron)"/>
<g stroke="#2A3A33" stroke-width="3" opacity="0.7">${Array.from({ length: 31 }, (_, i) => `<line x1="${i * 30}" y1="430" x2="${i * 30}" y2="600"/>`).join('')}</g>
<rect x="0" y="430" width="900" height="6" fill="#33463D"/>
<path d="M300 600 L600 600 L880 1600 L20 1600 Z" fill="url(#court)"/>
<g stroke="#E9EEF0" stroke-width="5" fill="none" opacity="0.85"><path d="M300 600 L600 600 L880 1600 L20 1600 Z"/><path d="M265 720 L635 720"/><path d="M450 720 L450 1100"/><path d="M160 1100 L740 1100"/><path d="M330 600 L130 1600"/><path d="M570 600 L770 1600"/></g>
<rect x="240" y="676" width="420" height="44" fill="#0B1114" opacity="0.85"/><rect x="240" y="670" width="420" height="7" fill="#F2F4F2"/>
<g fill="#0A0F12"><ellipse cx="520" cy="905" rx="34" ry="10" opacity="0.5"/><rect x="505" y="790" width="26" height="110" rx="12"/><circle cx="518" cy="772" r="17"/><rect x="528" y="800" width="60" height="9" rx="4" transform="rotate(-28 528 800)"/></g>
<circle cx="610" cy="760" r="9" fill="#E3EF5A"/>
<rect width="900" height="1600" fill="url(#flA)"/><rect width="900" height="1600" fill="url(#flB)"/>
<rect width="900" height="1600" fill="url(#vig)"/>
</svg>`)}`;

/**
 * The bottom bars' pictures (barPreview, Nov 28): the demo's clips have no picture (court cards on the page's own light
 * ground), so a bar is never seen over a clip. Bundled with EXPO_PUBLIC_SIM_CLIP_PIC=1, each gets NIGHT_CLIP, here as this
 * module is first read (before the demo's posts are copied for the app, which happens once it has drawn).
 */
if (SIM_DRIVER && process.env.EXPO_PUBLIC_SIM_CLIP_PIC === '1') {
  for (const post of demoPosts) if (post.kind === 'clip' && !post.videoUrl && !post.thumbnailUrl && !post.imageUrl) post.thumbnailUrl = NIGHT_CLIP;
}

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
  const { setTheme } = useTheme();
  const pick = useRef(setTheme);
  pick.current = setTheme;
  useEffect(() => {
    const off = [
      simAction('signin', () => { void now.current.signIn('you').then(() => router.replace('/')); }),
      // "go to=/discuss&section=players": the section asked for first, as the bar asks for Find Players (askForCommunityMap).
      simAction('go', (q) => { if (q.to) { if (q.section) requestSection(q.to, q.section); router.navigate(q.to as never); } }),
      // Every tip done, so none sits over a picture (the bottom bars' pictures, Nov 28).
      simAction('notips', () => { (Object.keys(TIP_WORDS) as TipKey[]).forEach((k) => learned(k)); simLog('[sim] notips'); }),
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
      // Another bottom bar, pictures only (barPreview, Nov 28): v=off|quiet|new|apple|1|2|3|4.
      simAction('barpreview', (q) => {
        setBarPreview(q.v);
        simLog(`[sim] barpreview ${q.v ?? 'off'}`);
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
    startJsGapWatch();
    return () => off.forEach((f) => f());
  }, []);
  return null;
}
