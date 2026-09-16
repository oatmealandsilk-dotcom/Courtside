import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { VideoView, useVideoPlayer, type VideoPlayer } from 'expo-video';

/** Swipe away and back within this long and the clip picks up where it was; longer and it starts over. */
export const RESUME_WINDOW_MS = 3000;

/**
 * A clip on a phone. Plays on its own and loops, the way a feed expects —
 * `active` is the only control the page has over it. A trimmed clip loops
 * over the part its author kept.
 */
export interface ClipVideoHandle { seek: (seconds: number) => void; /** The native player, for a second view of the same stream (full screen). */ player: VideoPlayer | null }

export const ClipVideo = forwardRef<ClipVideoHandle, {
  uri: string; poster?: string; active?: boolean; muted?: boolean; paused?: boolean; fit?: 'cover' | 'contain';
  trimStart?: number; trimEnd?: number;
  onProgress?: (fraction: number, seconds: number, length: number) => void;
  onReady?: (ready: boolean) => void;
  onSize?: (width: number, height: number) => void;
}>(function ClipVideo({ uri, active = true, muted = true, paused = false, fit = 'cover', trimStart = 0, trimEnd, onProgress, onReady, onSize }: {
  uri: string; poster?: string; active?: boolean; muted?: boolean; paused?: boolean; fit?: 'cover' | 'contain';
  trimStart?: number; trimEnd?: number;
  /** How far through the clip it is, 0..1, a few times a second. */
  onProgress?: (fraction: number, seconds: number, length: number) => void;
  /** True once the clip has its first frame and can play; false while it fetches. */
  onReady?: (ready: boolean) => void;
  /** The video's own width and height in pixels, once known. */
  onSize?: (width: number, height: number) => void;
}, ref) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = true;
    p.timeUpdateEventInterval = 0.2;
  });
  // The native player can be freed before a late effect reaches it; a call
  // on a freed player must be a no-op, not a crash in the feed.
  const safely = (work: () => void) => { try { work(); } catch { /* player already released */ } };
  useImperativeHandle(ref, () => ({ seek: (seconds) => safely(() => { player.currentTime = seconds; }), player }), [player]); // eslint-disable-line react-hooks/exhaustive-deps
  const latestProgress = useRef(onProgress);
  latestProgress.current = onProgress;
  const latestReady = useRef(onReady);
  latestReady.current = onReady;
  const latestSize = useRef(onSize);
  latestSize.current = onSize;
  useEffect(() => {
    const report = (track: { size?: { width: number; height: number } } | null | undefined) => {
      const size = track?.size;
      if (size && size.width > 0 && size.height > 0) latestSize.current?.(size.width, size.height);
    };
    safely(() => report((player as unknown as { videoTrack?: { size?: { width: number; height: number } } | null }).videoTrack));
    const a = player.addListener('sourceLoad', ({ availableVideoTracks }) => report(availableVideoTracks?.[0]));
    const b = player.addListener('videoTrackChange', ({ videoTrack }) => report(videoTrack));
    return () => { a.remove(); b.remove(); };
  }, [player]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    safely(() => latestReady.current?.(player.status === 'readyToPlay'));
    const sub = player.addListener('statusChange', ({ status }) => latestReady.current?.(status === 'readyToPlay'));
    return () => sub.remove();
  }, [player]);
  useEffect(() => {
    safely(() => { player.muted = muted; });
  }, [player, muted]);
  // A page waiting off screen fetches just its first three seconds — enough
  // to start the instant it arrives, without pulling whole videos down.
  useEffect(() => {
    safely(() => { player.bufferOptions = { preferredForwardBufferDuration: active ? 0 : 3 }; });
  }, [player, active]);
  useEffect(() => {
    const sub = player.addListener('timeUpdate', ({ currentTime }) => {
      safely(() => {
        const end = trimEnd ?? player.duration;
        if ((trimEnd !== undefined && currentTime >= trimEnd) || currentTime < trimStart - 0.5) { player.currentTime = trimStart; return; }
        const length = Math.max(0.01, end - trimStart);
        latestProgress.current?.(Math.max(0, Math.min(1, (currentTime - trimStart) / length)), currentTime - trimStart, length);
      });
    });
    return () => sub.remove();
  }, [player, trimStart, trimEnd]);
  // Where the clip was when the page left, and when: a quick return resumes,
  // a slow one starts the clip over.
  const left = useRef<{ time: number; at: number } | null>(null);
  // Each native call stands on its own: a position read that fails must
  // never take the pause down with it, or the clip plays on after the swipe.
  useEffect(() => {
    if (active && !paused) {
      const back = left.current;
      left.current = null;
      safely(() => { player.currentTime = !back || Date.now() - back.at > RESUME_WINDOW_MS ? trimStart : back.time; });
      safely(() => player.play());
    } else {
      if (!active) safely(() => { left.current = { time: player.currentTime, at: Date.now() }; });
      safely(() => player.pause());
    }
  }, [player, active, paused, trimStart]);
  // Gone from the page (flicked past, feed rebuilt): silent and stopped at once,
  // rather than left to the native release a beat later.
  useEffect(() => () => { safely(() => { player.muted = true; player.pause(); }); }, [player]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <View style={StyleSheet.absoluteFill}>
      <VideoView player={player} style={StyleSheet.absoluteFill} contentFit={fit} nativeControls={false} allowsPictureInPicture={false} />
    </View>
  );
});
