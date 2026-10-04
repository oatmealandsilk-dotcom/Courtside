import { useTheme } from '@/theme/ThemeProvider';
import { useSoundMuted } from '@/features/feed/sound';
import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useContext, useEffect, useRef, useState, memo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/theme';
import { onSpaceBar } from '@/features/feed/keyboard';
import { forgetHeld, holdUntilBack, pageAway } from '@/features/feed/pauseWhenHidden';
import { CourtSpinner } from './CourtSpinner';
import { TOP_SHADE } from './ReelCaption';
import { cropCss } from '@/lib/crop';
import type { MediaCrop } from '@/data/types';
import { useIsFocused } from '@/lib/useIsFocused';
import { forgetLeft, noteLeft, takeLeft } from '@/features/feed/clipResume';
import { TopBandContext } from '@/features/feed/topBand';

/** The feed's top shade (see TOP_SHADE) as a browser gradient. */
const TOP_SHADE_CSS = `linear-gradient(${TOP_SHADE.colors.map((c, i) => `${c} ${TOP_SHADE.locations[i] * 100}%`).join(', ')})`;

function ClipPlaybackInner({ uri, poster, active: wanted, preload = false, warmOnly = false, onDoubleTap, fit = 'cover', trimStart = 0, trimEnd, speed, volume, silent = false, bare = false, discInk, discPinned = false, letterbox = false, onReady, crop, held = false, onStage = false }: {
  uri: string; poster?: string; active: boolean; preload?: boolean; onDoubleTap?: () => void; fit?: 'cover' | 'contain'; trimStart?: number; trimEnd?: number; silent?: boolean;
  /** Built ahead on a page not opened yet (the Feed warming up out of sight): fetch only the clip's opening, not the whole file. */
  warmOnly?: boolean;
  /** The author's rate (1 is normal) and level (0–1), honoured at playback. */
  speed?: number; volume?: number;
  /** Nothing over the picture at all: no sound disc, no length line. */
  bare?: boolean;
  /**
   * Colour of the sound icon; with it the disc wears the page colour, like the
   * mark's tile. Only the feed passes it, and only the feed has the mark and
   * the disc over the top of the picture, so it also brings the light top
   * shade that keeps them readable on a bright sky.
   */
  discInk?: string;
  /** Keep the sound disc showing instead of fading it — the very first reel, so it is found. */
  discPinned?: boolean;
  /** A landscape clip: the picture sits in a wide box mid-screen with black around; the disc and line keep to the screen's edges. */
  letterbox?: boolean;
  /**
   * True once the first frame is in and it can play; the feed uses this to
   * know a page is warm. False only when the clip leaves the page, so a
   * rebuilt page is known to be fetching again (a stall mid-play is not reported).
   */
  onReady?: (ready: boolean) => void;
  /** A zoom and shift inside the frame, chosen in the editor. */
  crop?: MediaCrop;
  /** On the comments stage: plays on, shrunk above the sheet, although the comments page is on top. */
  held?: boolean;
  /** Its page is on the comments stage, held or not (a page opened over the comments holds it still): a pause the viewer chose stays. */
  onStage?: boolean;
}) {
  // Hears a theme change, so its own colours never lag the page's.
  useTheme();
  // Plays only on the screen you are looking at: a page pushed over this one,
  // or a tab slid away, holds it until you come back (the phone's player does
  // the same in ClipVideo). The comments stage keeps its clip playing.
  const onTop = useIsFocused() || held;
  const active = wanted && onTop;
  const insets = useSafeAreaInsets();
  // Under the Feed's top row the disc steps down out of its band (features/feed/topBand).
  const drop = useContext(TopBandContext);
  const video = useRef<HTMLVideoElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const lastTap = useRef(0);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Whether the clip has been started since it came on screen, and whether
  // its next play carries on from exactly where it stands (the viewer paused
  // it, or a page was pushed over it) rather than following the swipe rule.
  const started = useRef(false);
  const fromHere = useRef(false);
  // Whether it is the clip playing on screen right now, for a refusal that arrives after it has gone.
  const onScreen = useRef(false);
  const [paused, setPaused] = useState(false);
  // Hold the right side of a clip and it plays at double speed until you let
  // go, the way Instagram's Reels do. A drag (the feed scrolling) cancels it.
  const [fast, setFast] = useState(false);
  const hold = useRef<{ timer: ReturnType<typeof setTimeout>; x: number; y: number } | null>(null);
  const swallowClick = useRef(false);
  const endHold = () => {
    if (hold.current) { clearTimeout(hold.current.timer); hold.current = null; }
    if (fast) setFast(false);
  };
  // Sound is one switch for every clip; a clip posted without sound stays silent regardless.
  const [muted, setMuted] = useSoundMuted();
  const [ready, setReadyState] = useState(false);
  const setReady = (ok: boolean) => { setReadyState(ok); if (ok) onReady?.(true); };
  // A video that cannot load is a fact, not a wait: the page shows its poster
  // and a line saying so, rather than a placeholder that never clears.
  const [failed, setFailed] = useState(false);
  const fail = () => { setFailed(true); setReadyState(false); onReady?.(true); };
  const latestReady = useRef(onReady);
  latestReady.current = onReady;
  // Gone from the page (or given another clip): what it had fetched goes with it.
  useEffect(() => () => latestReady.current?.(false), [uri]);
  // The sound disc eases in when the clip starts and fades out quickly; a
  // tap up there toggles the sound and brings it back the same way.
  const [discOn, setDiscOn] = useState(false);
  const discTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showDisc = () => { setDiscOn(true); if (discTimer.current) clearTimeout(discTimer.current); discTimer.current = setTimeout(() => setDiscOn(false), 1800); };
  useEffect(() => {
    if (discPinned) { setDiscOn(true); return; }
    if (active && !silent && !bare) showDisc();
    return () => { if (discTimer.current) clearTimeout(discTimer.current); };
  }, [active, silent, bare, discPinned]); // eslint-disable-line react-hooks/exhaustive-deps

  // Swiped away and back within a few seconds, it picks up where it was (even
  // if its page was rebuilt meanwhile); later, it starts over (clipResume).
  // A tap to pause, or a page on top, is not a swipe: it carries on from right there.
  useEffect(() => {
    const el = video.current;
    if (!el) return;
    onScreen.current = active && !paused;
    let place: (() => void) | null = null;
    if (active && !paused) {
      if (fromHere.current) { fromHere.current = false; forgetLeft(uri); }
      else {
        const at = takeLeft(uri) ?? trimStart;
        el.currentTime = at;
        // A video rebuilt a moment ago may not know its own length yet. Browsers
        // are meant to keep the spot and start there once it does; one that
        // drops it is given it again then, before anything has played.
        if (el.readyState < 1) {
          const settle = () => { if (Math.abs(el.currentTime - at) > 0.05) el.currentTime = at; };
          place = settle;
          el.addEventListener('loadedmetadata', settle, { once: true });
        }
      }
      started.current = true;
      // The page is away (another tab, or on a phone the app switcher and the
      // like): it waits there and starts once the page is back.
      if (pageAway()) holdUntilBack(el);
      // Browsers refuse a video that starts with sound until the page has been tapped: fall back to silent, and the disc says so.
      // Only that refusal: a play cut short by a pause (a swipe that crosses the middle and comes straight back) is not
      // a reason to silence every clip, nor to start this one again off screen.
      else el.play().catch((e: unknown) => {
        if ((e as { name?: string } | null)?.name !== 'NotAllowedError' || !onScreen.current) return;
        el.muted = true; setMuted(true); el.play().catch(() => setPaused(true));
      });
    } else if (active || !onTop) {
      // Paused by the viewer, or covered (a page pushed over the feed, another tab): held right here.
      if (started.current) fromHere.current = true;
      started.current = false;
      // Stopped by the app or the viewer: the page coming back to the front does not start it again.
      forgetHeld(el);
      el.pause();
    } else {
      // Swiped away (or uncovered on a feed that has moved on): only a clip that had played has a spot to come back to.
      if (started.current || fromHere.current) noteLeft(uri, el.currentTime);
      started.current = false;
      fromHere.current = false;
      forgetHeld(el);
      el.pause();
    }
    return () => { if (place) el.removeEventListener('loadedmetadata', place); el.pause(); };
  }, [active, paused, trimStart, onTop]); // eslint-disable-line react-hooks/exhaustive-deps
  // Taken off the page while it was the clip on screen (the feed rebuilt its
  // pages): its spot is kept, so the page built in its place carries on from there.
  const latestUri = useRef(uri);
  latestUri.current = uri;
  useEffect(() => {
    const el = video.current;
    return () => { if (el && (started.current || fromHere.current)) noteLeft(latestUri.current, el.currentTime); };
  }, []);
  // The author's speed and level, on the element; pitch is kept so voices stay voices.
  useEffect(() => {
    const el = video.current;
    if (!el) return;
    el.playbackRate = (speed ?? 1) * (fast ? 2 : 1);
    el.defaultPlaybackRate = speed ?? 1;
    el.preservesPitch = true;
    el.volume = volume ?? 1;
  }, [speed, volume, fast]);
  // Swiped away or covered, a pause is forgotten; held still under a page
  // opened over the comments stage, a pause the viewer chose is kept.
  useEffect(() => { if (!active && !onStage) setPaused(false); }, [active, onStage]);
  // Space bar on a computer: play / pause the clip on screen.
  useEffect(() => { if (!active) return; return onSpaceBar(() => setPaused((p) => !p)); }, [active]);

  // A trimmed clip loops over the part its author kept; the bottom line
  // follows along, eased over each report so it glides rather than steps.
  useEffect(() => {
    const el = video.current;
    if (!el) return;
    const tick = () => {
      if ((trimEnd !== undefined && el.currentTime >= trimEnd) || el.currentTime < trimStart - 0.5) { el.currentTime = trimStart; return; }
      const end = trimEnd ?? el.duration;
      if (!Number.isFinite(end) || !bar.current) return;
      const length = Math.max(0.01, end - trimStart);
      const fraction = Math.max(0, Math.min(1, (el.currentTime - trimStart) / length));
      bar.current.style.transition = fraction < 0.02 ? 'none' : 'width 260ms linear';
      bar.current.style.width = `${Math.min(100, (fraction + 0.25 / length) * 100)}%`;
    };
    el.addEventListener('timeupdate', tick);
    return () => el.removeEventListener('timeupdate', tick);
  }, [trimStart, trimEnd]);

  return <div style={{ position: 'absolute', inset: 0, background: letterbox ? '#000' : undefined, display: 'flex', alignItems: 'center' }}>
    <div style={{ ...cropCss(crop), display: 'flex', alignItems: 'center' }}>
      <video ref={video} src={uri} poster={poster} loop muted={muted || silent} playsInline preload={active || preload ? (warmOnly && !active ? 'metadata' : 'auto') : 'none'} onError={fail} onLoadedData={() => setReady(true)} onCanPlay={() => setReady(true)} onWaiting={() => setReady(false)} onPlaying={() => setReady(true)} style={{ width: '100%', height: '100%', objectFit: letterbox ? 'contain' : fit, pointerEvents: 'none' }} />
      {failed ? <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}><span style={{ padding: '8px 14px', borderRadius: 999, background: 'rgba(0,0,0,0.55)', color: 'white', font: '600 13px Inter_600SemiBold, system-ui, sans-serif' }}>This video didn’t load</span></div> : null}
    </div>
    {/* Over the picture, under the disc: the top shade darkens the video, never the disc. */}
    {discInk && !bare ? <div aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, top: 0, height: insets.top + TOP_SHADE.below, background: TOP_SHADE_CSS, pointerEvents: 'none' }} /> : null}
    <button aria-label={paused ? 'Play clip' : 'Pause clip'}
      onPointerDown={(e) => {
        const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
        if (paused || e.clientX - box.left < box.width * 0.66) return;
        const start = { x: e.clientX, y: e.clientY };
        hold.current = { ...start, timer: setTimeout(() => { swallowClick.current = true; setFast(true); }, 250) };
      }}
      onPointerMove={(e) => { if (hold.current && Math.hypot(e.clientX - hold.current.x, e.clientY - hold.current.y) > 10) endHold(); }}
      onPointerUp={endHold}
      onPointerCancel={endHold}
      onPointerLeave={endHold}
      onContextMenu={(e) => { if (fast || hold.current) e.preventDefault(); }}
      onClick={() => {
      // The click that ends a hold is not a tap.
      if (swallowClick.current) { swallowClick.current = false; return; }
      // One tap plays or pauses, two likes. The pause is held back until the
      // double-tap window closes, or every like would also stop the video.
      const now = Date.now();
      if (onDoubleTap && now - lastTap.current < 280) { lastTap.current = 0; if (pending.current) { clearTimeout(pending.current); pending.current = null; } onDoubleTap(); return; }
      lastTap.current = now;
      if (pending.current) clearTimeout(pending.current);
      pending.current = setTimeout(() => { pending.current = null; setPaused((v) => !v); }, onDoubleTap ? 280 : 0);
    }} style={{ position: 'absolute', inset: 0, width: '100%', background: 'transparent', border: 0, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {paused && ready ? <span style={{ width: 64, height: 64, borderRadius: 32, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', paddingLeft: 4 }}><Ionicons name="play" size={30} color="white" /></span> : null}
    </button>
    {/* A feed disc fades with the words as its page goes onto the comments stage (data-stage-chrome, see useStageMotion.web). */}
    {silent || bare ? null : <div data-stage-chrome={discInk ? '' : undefined}><button aria-label={muted ? 'Unmute clip' : 'Mute clip'} onClick={() => { setMuted((v) => !v); if (!discPinned) showDisc(); }} style={{
      position: 'absolute', right: 18, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxSizing: 'border-box',
      // In the feed: the phone's tile, the same rounded square as the mark's at the other corner, centred level with it,
      // nearly solid so its icon stays crisp, with a hairline so it holds on a white sky. Elsewhere: a small dark disc.
      ...(discInk
        ? { top: insets.top + drop + 30, width: 36, height: 36, borderRadius: 18, background: 'rgba(16,18,17,0.34)', border: '0.5px solid rgba(255,255,255,0.28)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', boxShadow: '0 2px 10px rgba(0,0,0,0.18)' }
        : { top: insets.top + drop + 22, width: 30, height: 30, borderRadius: 15, background: 'rgba(0,0,0,0.55)', border: 0 }),
      opacity: discOn ? 1 : 0, transform: discOn ? 'scale(1)' : 'scale(0.86)', transition: discOn ? 'opacity 160ms ease-out, transform 160ms ease-out' : 'opacity 140ms ease-in, transform 140ms ease-in',
    }}><Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={17} color="white" /></button></div>}
    {bare ? null : <div aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 2, background: 'rgba(255,255,255,0.25)' }}>
      <div ref={bar} style={{ height: 2, width: '0%', background: 'rgba(255,255,255,0.9)' }} />
    </div>}
    {!ready && active ? <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}><CourtSpinner ink={discInk ?? 'white'} /></div> : null}
    {fast ? <div aria-live="polite" style={{ position: 'absolute', left: 0, right: 0, top: insets.top + drop + 24, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 999, background: 'rgba(0,0,0,0.55)', color: 'white', font: '700 14px Inter_700Bold, system-ui, sans-serif' }}><Ionicons name="play-forward" size={13} color="white" />2×</span>
    </div> : null}
  </div>;
}

/** Re-renders only when a shown value changes; the handlers passed in read fresh values through their own props, so a new function alone is no reason to rebuild. */
export const ClipPlayback = memo(ClipPlaybackInner, (a, b) => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const x = (a as Record<string, unknown>)[k]; const y = (b as Record<string, unknown>)[k];
    if (typeof x === 'function' && typeof y === 'function') continue;
    if (x !== y) return false;
  }
  return true;
});
