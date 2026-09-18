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
  useEffect(() => {
    const video = el.current;
    if (!video) return;
    if (active && !paused) video.play().catch(() => undefined); else video.pause();
  }, [active, paused]);
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
    const sized = () => { if (video.videoWidth && video.videoHeight) latest.current.onSize?.(video.videoWidth, video.videoHeight); };
    video.addEventListener('loadedmetadata', sized);
    if (video.videoWidth) sized();
    const busy = () => latest.current.onReady?.(false);
    video.addEventListener('timeupdate', tick);
    video.addEventListener('loadeddata', ready);
    video.addEventListener('playing', ready);
    video.addEventListener('waiting', busy);
    return () => { video.removeEventListener('timeupdate', tick); video.removeEventListener('loadedmetadata', sized); video.removeEventListener('loadeddata', ready); video.removeEventListener('playing', ready); video.removeEventListener('waiting', busy); };
  }, [trimStart, trimEnd]);
  return <video ref={el} src={uri} poster={poster} loop muted={muted} playsInline preload="metadata" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: fit, background: '#000' }} />;
});
