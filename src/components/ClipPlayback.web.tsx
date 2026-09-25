import { useTheme } from '@/theme/ThemeProvider';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState, memo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/theme';
import { onSpaceBar } from '@/features/feed/keyboard';
import { CourtSpinner } from './CourtSpinner';
import { cropCss } from '@/lib/crop';
import type { MediaCrop } from '@/data/types';

/** Swipe away and back within this long and the clip picks up where it was; longer and it starts over. */
const RESUME_WINDOW_MS = 3000;

function ClipPlaybackInner({ uri, poster, active, preload = false, onDoubleTap, fit = 'cover', trimStart = 0, trimEnd, speed, volume, silent = false, bare = false, discInk, discPinned = false, letterbox = false, onReady, crop }: {
  uri: string; poster?: string; active: boolean; preload?: boolean; onDoubleTap?: () => void; fit?: 'cover' | 'contain'; trimStart?: number; trimEnd?: number; silent?: boolean;
  /** The author's rate (1 is normal) and level (0–1), honoured at playback. */
  speed?: number; volume?: number;
  /** Nothing over the picture at all: no sound disc, no length line. */
  bare?: boolean;
  /** Colour of the sound icon; with it the disc wears the page colour, like the wordmark pill. */
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
}) {
  // Hears a theme change, so its own colours never lag the page's.
  useTheme();
  const insets = useSafeAreaInsets();
  const video = useRef<HTMLVideoElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const lastTap = useRef(0);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const left = useRef<{ time: number; at: number } | null>(null);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(silent);
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

  // Where the clip was when the page left, and when: a quick return resumes,
  // a slow one starts the clip over.
  useEffect(() => {
    const el = video.current;
    if (!el) return;
    if (active && !paused) {
      const back = left.current;
      left.current = null;
      if (!back || Date.now() - back.at > RESUME_WINDOW_MS) el.currentTime = trimStart;
      else el.currentTime = back.time;
      // Browsers refuse a video that starts with sound until the page has been tapped: fall back to silent, and the disc says so.
      el.play().catch(() => { el.muted = true; setMuted(true); el.play().catch(() => setPaused(true)); });
    } else {
      if (!active) left.current = { time: el.currentTime, at: Date.now() };
      el.pause();
    }
    return () => el.pause();
  }, [active, paused, trimStart]);
  // The author's speed and level, on the element; pitch is kept so voices stay voices.
  useEffect(() => {
    const el = video.current;
    if (!el) return;
    el.playbackRate = speed ?? 1;
    el.defaultPlaybackRate = speed ?? 1;
    el.preservesPitch = true;
    el.volume = volume ?? 1;
  }, [speed, volume]);
  useEffect(() => { if (!active) setPaused(false); }, [active]);
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
      <video ref={video} src={uri} poster={poster} loop muted={muted || silent} playsInline preload={active || preload ? 'auto' : 'none'} onError={fail} onLoadedData={() => setReady(true)} onCanPlay={() => setReady(true)} onWaiting={() => setReady(false)} onPlaying={() => setReady(true)} style={{ width: '100%', height: '100%', objectFit: letterbox ? 'contain' : fit, pointerEvents: 'none' }} />
      {failed ? <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}><span style={{ padding: '8px 14px', borderRadius: 999, background: 'rgba(0,0,0,0.55)', color: 'white', font: '600 13px Inter_600SemiBold, system-ui, sans-serif' }}>This video didn’t load</span></div> : null}
    </div>
    <button aria-label={paused ? 'Play clip' : 'Pause clip'} onClick={() => {
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
    {silent || bare ? null : <button aria-label={muted ? 'Unmute clip' : 'Mute clip'} onClick={() => { setMuted((v) => !v); if (!discPinned) showDisc(); }} style={{ position: 'absolute', right: 18, top: insets.top + (discInk ? 25 : 22), width: discInk ? 34 : 30, height: discInk ? 34 : 30, border: 0, borderRadius: 17, padding: 0, background: discInk ? colors.bg : 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', opacity: discOn ? (discInk ? 0.88 : 1) : 0, transform: discOn ? 'scale(1)' : 'scale(0.86)', transition: discOn ? 'opacity 160ms ease-out, transform 160ms ease-out' : 'opacity 140ms ease-in, transform 140ms ease-in' }}><Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={17} color={discInk ?? 'white'} /></button>}
    {bare ? null : <div aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 2, background: 'rgba(255,255,255,0.25)' }}>
      <div ref={bar} style={{ height: 2, width: '0%', background: 'rgba(255,255,255,0.9)' }} />
    </div>}
    {!ready && active ? <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}><CourtSpinner ink={discInk ?? 'white'} /></div> : null}
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
