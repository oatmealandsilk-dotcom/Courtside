import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

export interface VideoSurfaceHandle {
  seek: (seconds: number) => void;
  play: () => void;
  pause: () => void;
}

/** The browser twin of VideoSurface, on a plain video element. */
export const VideoSurface = forwardRef<VideoSurfaceHandle, {
  uri: string;
  muted?: boolean;
  fit?: 'cover' | 'contain';
  from?: number;
  to?: number;
  /** Hold on the current frame; looping and auto-play stand down. */
  paused?: boolean;
  onTime?: (seconds: number) => void;
  onDuration?: (seconds: number) => void;
}>(function VideoSurface({ uri, muted = false, fit = 'contain', from = 0, to, paused = false, onTime, onDuration }, ref) {
  const el = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = el.current;
    if (!video) return;
    const onMeta = () => { if (Number.isFinite(video.duration)) onDuration?.(video.duration); };
    const onTick = () => {
      onTime?.(video.currentTime);
      if (paused) return;
      if (to !== undefined && video.currentTime >= to) video.currentTime = from;
      else if (video.currentTime < from - 0.5) video.currentTime = from;
    };
    video.addEventListener('loadedmetadata', onMeta);
    video.addEventListener('timeupdate', onTick);
    if (Number.isFinite(video.duration) && video.duration > 0) onMeta();
    // Browsers only let a video start on its own when it is silent; a tap on
    // the sound button lifts that.
    if (paused) video.pause(); else video.play().catch(() => undefined);
    return () => { video.removeEventListener('loadedmetadata', onMeta); video.removeEventListener('timeupdate', onTick); video.pause(); };
  }, [from, to, paused, onTime, onDuration]);
  useImperativeHandle(ref, () => ({
    seek: (seconds) => { if (el.current) el.current.currentTime = seconds; },
    play: () => { el.current?.play().catch(() => undefined); },
    pause: () => el.current?.pause(),
  }), []);
  return <video ref={el} src={uri} muted={muted} loop playsInline style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: fit, background: '#000' }} />;
});
