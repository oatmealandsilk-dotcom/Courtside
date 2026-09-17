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

/**
 * Every live player on the phone. Only one clip may make sound at a time,
 * so the one that starts silences every other one first — whatever state
 * the others were left in by a fast flick or a feed rebuild.
 */
const livePlayers = new Set<VideoPlayer>();

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
  // Playing is asked for only once the player is ready: a seek or a play on
  // an item still loading left the sound running with the picture stuck on
  // its first frame (the first clip after signing in, or a new first clip
  // after a refresh). The wish to play is kept, and honoured the moment the
  // player reports ready.
  const wantPlay = useRef(false);
  const begin = useRef<() => void>(() => undefined);
  useEffect(() => {
    safely(() => latestReady.current?.(player.status === 'readyToPlay'));
    const sub = player.addListener('statusChange', ({ status }) => {
      latestReady.current?.(status === 'readyToPlay');
      if (status === 'readyToPlay' && wantPlay.current) begin.current();
    });
    return () => sub.remove();
  }, [player]);
  useEffect(() => {
    safely(() => { player.muted = muted; });
  }, [player, muted]);
  // Every clip keeps a few seconds buffered ahead — enough for a page
  // waiting off screen to start the instant it arrives, without pulling whole
  // videos down. Set once: changing it as a page went live made the player
  // re-buffer, a blip of the loading disc over a clip already playing.
  useEffect(() => {
    safely(() => { player.bufferOptions = { preferredForwardBufferDuration: 4 }; });
  }, [player]);
  // The first play of a clip on a phone has, some of the time, run the
  // sound with the picture stuck on its first frame; a tap to pause and play
  // again always set it going. So once the first play is confirmed under way
  // (the clock has moved), the clip is paused and played again in the same
  // breath, where it is — the same nudge, too quick to notice — once.
  const nudged = useRef(false);
  useEffect(() => {
    const sub = player.addListener('timeUpdate', ({ currentTime }) => {
      safely(() => {
        if (!nudged.current && wantPlay.current && currentTime > trimStart + 0.2) {
          nudged.current = true;
          player.pause();
          player.currentTime = currentTime;
          player.play();
        }
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
  begin.current = () => {
    for (const other of livePlayers) if (other !== player) { try { other.pause(); } catch { /* released */ } }
    const back = left.current;
    left.current = null;
    const target = !back || Date.now() - back.at > RESUME_WINDOW_MS ? trimStart : back.time;
    // Only a real move is a seek; the first play of a clip sitting at its start is a plain play.
    safely(() => { if (Math.abs(player.currentTime - target) > 0.05) player.currentTime = target; });
    safely(() => player.play());
  };
  useEffect(() => {
    if (active && !paused) {
      wantPlay.current = true;
      let ready = false;
      safely(() => { ready = player.status === 'readyToPlay'; });
      if (ready) begin.current();
    } else {
      wantPlay.current = false;
      if (!active) safely(() => { left.current = { time: player.currentTime, at: Date.now() }; });
      safely(() => player.pause());
    }
  }, [player, active, paused, trimStart]);
  // Gone from the page (flicked past, feed rebuilt): silent and stopped at once,
  // rather than left to the native release a beat later.
  useEffect(() => { livePlayers.add(player); return () => { livePlayers.delete(player); safely(() => { player.muted = true; player.pause(); }); }; }, [player]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <View style={StyleSheet.absoluteFill}>
      <VideoView player={player} style={StyleSheet.absoluteFill} contentFit={fit} nativeControls={false} allowsPictureInPicture={false} />
    </View>
  );
});
