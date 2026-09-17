import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';

export interface VideoSurfaceHandle {
  seek: (seconds: number) => void;
  play: () => void;
  pause: () => void;
}

/**
 * A video the editor can drive: seek it, play it, hear from it as time
 * passes and once its length is known. The feed's own player stays separate;
 * this one exists so a trim can be previewed live.
 */
export const VideoSurface = forwardRef<VideoSurfaceHandle, {
  uri: string;
  muted?: boolean;
  fit?: 'cover' | 'contain';
  /** Loop back to `from` once playback passes `to`. */
  from?: number;
  to?: number;
  /** Hold on the current frame; looping and auto-play stand down. */
  paused?: boolean;
  onTime?: (seconds: number) => void;
  onDuration?: (seconds: number) => void;
  /** The video's own width and height in pixels, once known. */
  onSize?: (width: number, height: number) => void;
}>(function VideoSurface({ uri, muted = false, fit = 'contain', from = 0, to, paused = false, onTime, onDuration, onSize }, ref) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = muted;
    p.timeUpdateEventInterval = 0.1;
  });
  // expo-video frees the native player the moment this unmounts — sometimes
  // before React runs the effect clean-ups below. Every call goes through
  // this guard so a late pause on a freed player is a no-op, not a crash.
  const safely = (work: () => void) => { try { work(); } catch { /* player already released */ } };
  useEffect(() => { safely(() => { player.muted = muted; }); }, [player, muted]);
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
    const status = player.addListener('statusChange', ({ status }) => {
      if (status === 'readyToPlay' && player.duration > 0) onDuration?.(player.duration);
    });
    const time = player.addListener('timeUpdate', ({ currentTime }) => {
      onTime?.(currentTime);
      if (paused) return;
      safely(() => {
        if (to !== undefined && currentTime >= to) player.currentTime = from;
        else if (currentTime < from - 0.5) player.currentTime = from;
      });
    });
    safely(() => { if (player.duration > 0) onDuration?.(player.duration); });
    return () => { status.remove(); time.remove(); };
  }, [player, from, to, paused, onTime, onDuration]);
  useEffect(() => {
    safely(() => { if (paused) player.pause(); else player.play(); });
    return () => safely(() => player.pause());
  }, [player, paused]);
  useImperativeHandle(ref, () => ({
    seek: (seconds) => safely(() => { player.currentTime = seconds; }),
    play: () => safely(() => player.play()),
    pause: () => safely(() => player.pause()),
  }), [player]);
  return (
    <View style={StyleSheet.absoluteFill}>
      <VideoView player={player} style={StyleSheet.absoluteFill} contentFit={fit} nativeControls={false} allowsPictureInPicture={false} />
    </View>
  );
});
