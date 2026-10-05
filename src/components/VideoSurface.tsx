import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { AppState, Platform, StyleSheet, View } from 'react-native';
import { VideoView, createVideoPlayer } from 'expo-video';
import { videoSource } from '@/lib/videoSource';

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
  /** How fast it plays (1 is normal) and how loud its own sound is (0–1), previewed live. */
  rate?: number;
  volume?: number;
  onTime?: (seconds: number) => void;
  onDuration?: (seconds: number) => void;
  /** The video's own width and height in pixels, once known. */
  onSize?: (width: number, height: number) => void;
}>(function VideoSurface({ uri, muted = false, fit = 'contain', from = 0, to, paused = false, rate, volume, onTime, onDuration, onSize }, ref) {
  // Made and freed by hand, the same way the feed's clips are: the toolkit's
  // hook freed a still-playing player when the editor closed, and on iPhone
  // its sound could run on and pop up later. Here it is silenced and stopped
  // first, then freed. Looping is by hand too (the built-in loop froze the
  // picture on a first pass).
  const player = useMemo(() => {
    const p = createVideoPlayer(videoSource(uri));
    p.loop = false;
    p.muted = muted;
    p.timeUpdateEventInterval = 0.1;
    return p;
  }, [uri]); // eslint-disable-line react-hooks/exhaustive-deps
  // Every call goes through this guard so a late call on a freed player is a no-op, not a crash.
  const safely = (work: () => void) => { try { work(); } catch { /* player already released */ } };
  // Set while the editor holds the picture still by hand (its own pause(), as
  // when a finger is on a trim handle or along the strip), cleared by its
  // play(). The player reports its time after every seek, even when paused;
  // a seek onto the end of the kept part would read as "playback ran past
  // the end" and loop back to the start, so the picture flickered between
  // the first frame and the handle on a slow drag. While held, it stays put.
  const held = useRef(false);
  useEffect(() => () => {
    safely(() => { player.muted = true; player.pause(); });
    safely(() => player.release());
  }, [player]);
  useEffect(() => {
    const sub = player.addListener('playToEnd', () => { if (!paused && !held.current) safely(() => { player.currentTime = from; player.play(); }); });
    return () => sub.remove();
  }, [player, from, paused]);
  useEffect(() => { safely(() => { player.muted = muted; }); }, [player, muted]);
  // Speed and level are settings on the player, kept apart from the listener
  // effect so changing one never pauses and replays the picture.
  useEffect(() => { safely(() => { player.playbackRate = rate ?? 1; player.preservesPitch = true; }); }, [player, rate]);
  useEffect(() => { safely(() => { player.volume = volume ?? 1; }); }, [player, volume]);
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
      if (paused || held.current) return;
      safely(() => {
        if (to !== undefined && currentTime >= to) player.currentTime = from;
        else if (currentTime < from - 0.5) player.currentTime = from;
      });
    });
    safely(() => { if (player.duration > 0) onDuration?.(player.duration); });
    return () => { status.remove(); time.remove(); };
  }, [player, from, to, paused, onTime, onDuration]);
  useEffect(() => {
    // Told to play by the editor's paused setting: any hold by hand ends too,
    // or a clip left held after a tap-to-pause would play on without looping.
    if (!paused) held.current = false;
    // Not while the app is out of the front; coming back starts it (below).
    safely(() => { if (paused) player.pause(); else if (AppState.currentState !== 'background' && AppState.currentState !== 'inactive') player.play(); });
    return () => safely(() => player.pause());
  }, [player, paused]);
  // The app leaves the front (home, lock, the app switcher, Control Centre, a
  // call): the preview stops where it is, and plays on from there when the
  // app is back — unless it was meant to be holding still.
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') safely(() => player.pause());
      else if (state === 'active' && !pausedRef.current) { held.current = false; safely(() => player.play()); }
    });
    return () => sub.remove();
  }, [player]); // eslint-disable-line react-hooks/exhaustive-deps
  useImperativeHandle(ref, () => ({
    seek: (seconds) => safely(() => { player.currentTime = seconds; }),
    // Not while the app is out of the front (a touch the phone took away
    // can ask for play just as Control Centre opens); coming back starts it.
    play: () => {
      held.current = false;
      if (AppState.currentState === 'background' || AppState.currentState === 'inactive') return;
      safely(() => player.play());
    },
    pause: () => { held.current = true; safely(() => player.pause()); },
  }), [player]);
  return (
    <View style={StyleSheet.absoluteFill}>
      {/* Android: on a texture, so the editor's zoom, its crop and the rounded frames apply to the picture (Oct 5). */}
      <VideoView player={player} style={StyleSheet.absoluteFill} contentFit={fit} nativeControls={false} allowsPictureInPicture={false} surfaceType={Platform.OS === 'android' ? 'textureView' : undefined} />
    </View>
  );
});
