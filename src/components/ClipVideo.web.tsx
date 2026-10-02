import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { useIsFocused } from '@/lib/useIsFocused';
import { forgetHeld, holdUntilBack, pageAway } from '@/features/feed/pauseWhenHidden';

export interface ClipVideoHandle { seek: (seconds: number) => void; player: null }

/** A clip in the browser, filling whatever holds it; `active` plays it, muted or not. */
export const ClipVideo = forwardRef<ClipVideoHandle, {
  uri: string; poster?: string; active?: boolean; muted?: boolean; paused?: boolean; fit?: 'cover' | 'contain';
  trimStart?: number; trimEnd?: number;
  /** The author's playback edits, honoured by the element rather than cut into the file: a rate (1 is normal) and a level (0–1). */
  speed?: number; volume?: number;
  onProgress?: (fraction: number, seconds: number, length: number) => void;
  onReady?: (ready: boolean) => void;
  onSize?: (width: number, height: number) => void;
  /** The clip left the page (or was swapped for another): whatever it had fetched is gone with it. */
  onGone?: () => void;
  /** On the comments stage: it plays on although the comments page is over it (see the phone's ClipVideo). */
  held?: boolean;
  /** The phone's Android drawing mode; a browser has no such choice. */
  surfaceType?: 'textureView' | 'surfaceView';
}>(function ClipVideo({ uri, poster, active: wanted = true, muted = true, paused = false, fit = 'cover', trimStart = 0, trimEnd, speed, volume, onProgress, onReady, onSize, onGone, held = false }, ref) {
  // Plays only on the screen you are looking at, as on a phone: a page pushed
  // over this one, or a tab slid away, holds it until you come back. The
  // comments stage is the exception: its clip plays on above the sheet.
  const onTop = useIsFocused() || held;
  const active = wanted && onTop;
  const el = useRef<HTMLVideoElement>(null);
  // Rate and level are set on the element, and set again whenever it reloads
  // its file (Safari does on some seeks), so a half-speed clip stays half speed.
  const tuning = useRef({ speed, volume });
  tuning.current = { speed, volume };
  const applyTuning = (video: HTMLVideoElement) => {
    const rate = tuning.current.speed ?? 1;
    video.playbackRate = rate;
    video.defaultPlaybackRate = rate;
    video.preservesPitch = true;
    video.volume = tuning.current.volume ?? 1;
  };
  useEffect(() => { if (el.current) applyTuning(el.current); }, [speed, volume]);
  useImperativeHandle(ref, () => ({ seek: (seconds) => { if (el.current) el.current.currentTime = seconds; }, player: null }), []);
  // A trimmed clip starts on its first kept frame. Moved there before it plays
  // (and as soon as the file's length is known), so it never shows a moment
  // of the part that was cut and then jumps back.
  const trimRef = useRef({ trimStart, trimEnd });
  trimRef.current = { trimStart, trimEnd };
  const toKeptStart = (video: HTMLVideoElement) => {
    const { trimStart: from, trimEnd: to } = trimRef.current;
    if (video.currentTime < from - 0.05 || (to !== undefined && video.currentTime >= to)) video.currentTime = from;
  };
  useEffect(() => {
    const video = el.current;
    if (!video) return;
    // While the page is away (another tab, or on a phone the app switcher and
    // the like) it waits and starts once the page is back; a clip stopped
    // meanwhile is not started again then.
    if (active && !paused) { toKeptStart(video); if (pageAway()) holdUntilBack(video); else video.play().catch(() => undefined); } else { forgetHeld(video); video.pause(); }
  }, [active, paused]); // eslint-disable-line react-hooks/exhaustive-deps
  const latest = useRef({ onProgress, onReady, onSize, onGone });
  latest.current = { onProgress, onReady, onSize, onGone };
  useEffect(() => () => latest.current.onGone?.(), [uri]);
  useEffect(() => {
    const video = el.current;
    if (!video) return;
    const tick = () => {
      if ((trimEnd !== undefined && video.currentTime >= trimEnd) || video.currentTime < trimStart - 0.5) { video.currentTime = trimStart; return; }
      const end = trimEnd ?? video.duration;
      if (!Number.isFinite(end)) return;
      const length = Math.max(0.01, end - trimStart);
      latest.current.onProgress?.(Math.max(0, Math.min(1, (video.currentTime - trimStart) / length)), video.currentTime - trimStart, length);
    };
    const ready = () => latest.current.onReady?.(true);
    const sized = () => { toKeptStart(video); applyTuning(video); if (video.videoWidth && video.videoHeight) latest.current.onSize?.(video.videoWidth, video.videoHeight); };
    video.addEventListener('loadedmetadata', sized);
    if (video.videoWidth) sized();
    // The browser reports the time only about four times a second, so the
    // end of the kept part is watched every screen frame while it plays: the
    // loop back happens right on the end, not up to a quarter second past it.
    let frame = 0;
    const watchEnd = () => {
      if (trimEnd !== undefined && video.currentTime >= trimEnd) video.currentTime = trimStart;
      frame = requestAnimationFrame(watchEnd);
    };
    const startWatch = () => { cancelAnimationFrame(frame); if (trimEnd !== undefined) frame = requestAnimationFrame(watchEnd); };
    const stopWatch = () => cancelAnimationFrame(frame);
    // Without a set end the file plays to its own end; a clip that starts later loops back to its start, not to 0.
    const ended = () => { if (trimStart > 0) { video.currentTime = trimStart; video.play().catch(() => undefined); } };
    video.addEventListener('play', startWatch);
    video.addEventListener('pause', stopWatch);
    video.addEventListener('ended', ended);
    if (!video.paused) startWatch();
    const busy = () => latest.current.onReady?.(false);
    video.addEventListener('timeupdate', tick);
    video.addEventListener('loadeddata', ready);
    video.addEventListener('playing', ready);
    video.addEventListener('waiting', busy);
    // A file that fails to load counts as arrived, as it does on a phone: a spinner never waits forever.
    video.addEventListener('error', ready);
    return () => { video.removeEventListener('error', ready); stopWatch(); video.removeEventListener('play', startWatch); video.removeEventListener('pause', stopWatch); video.removeEventListener('ended', ended); video.removeEventListener('timeupdate', tick); video.removeEventListener('loadedmetadata', sized); video.removeEventListener('loadeddata', ready); video.removeEventListener('playing', ready); video.removeEventListener('waiting', busy); };
  }, [trimStart, trimEnd]);
  // The file's own loop only when nothing is trimmed off its start; otherwise the loop is done above.
  return <video ref={el} src={uri} poster={poster} loop={trimStart <= 0} muted={muted} playsInline preload="metadata" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: fit, background: '#000' }} />;
});
