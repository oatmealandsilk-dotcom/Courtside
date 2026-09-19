import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

export interface ClipVideoHandle { seek: (seconds: number) => void; player: null }

/** A clip in the browser, filling whatever holds it; `active` plays it, muted or not. */
export const ClipVideo = forwardRef<ClipVideoHandle, {
  uri: string; poster?: string; active?: boolean; muted?: boolean; paused?: boolean; fit?: 'cover' | 'contain';
  trimStart?: number; trimEnd?: number;
  onProgress?: (fraction: number, seconds: number, length: number) => void;
  onReady?: (ready: boolean) => void;
  onSize?: (width: number, height: number) => void;
  /** The clip left the page (or was swapped for another): whatever it had fetched is gone with it. */
  onGone?: () => void;
}>(function ClipVideo({ uri, poster, active = true, muted = true, paused = false, fit = 'cover', trimStart = 0, trimEnd, onProgress, onReady, onSize, onGone }, ref) {
  const el = useRef<HTMLVideoElement>(null);
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
    if (active && !paused) { toKeptStart(video); video.play().catch(() => undefined); } else video.pause();
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
    const sized = () => { toKeptStart(video); if (video.videoWidth && video.videoHeight) latest.current.onSize?.(video.videoWidth, video.videoHeight); };
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
    return () => { stopWatch(); video.removeEventListener('play', startWatch); video.removeEventListener('pause', stopWatch); video.removeEventListener('ended', ended); video.removeEventListener('timeupdate', tick); video.removeEventListener('loadedmetadata', sized); video.removeEventListener('loadeddata', ready); video.removeEventListener('playing', ready); video.removeEventListener('waiting', busy); };
  }, [trimStart, trimEnd]);
  // The file's own loop only when nothing is trimmed off its start; otherwise the loop is done above.
  return <video ref={el} src={uri} poster={poster} loop={trimStart <= 0} muted={muted} playsInline preload="metadata" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: fit, background: '#000' }} />;
});
