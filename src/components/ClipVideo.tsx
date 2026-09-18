import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { VideoView, createVideoPlayer, type VideoPlayer } from 'expo-video';
import { noteClipLoad } from '@/lib/netSpeed';

/** How many seconds of a clip are fetched before it counts as loaded and may start. */
const PRELOAD_SECONDS = 3;
/** Swipe away and back within this long and the clip picks up where it was; longer and it starts over. */
const RESUME_WINDOW_MS = 3000;

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
  onGone?: () => void;
}>(function ClipVideo({ uri, active = true, muted = true, paused = false, fit = 'cover', trimStart = 0, trimEnd, onProgress, onReady, onSize, onGone }: {
  uri: string; poster?: string; active?: boolean; muted?: boolean; paused?: boolean; fit?: 'cover' | 'contain';
  trimStart?: number; trimEnd?: number;
  /** How far through the clip it is, 0..1, a few times a second. */
  onProgress?: (fraction: number, seconds: number, length: number) => void;
  /** True once the clip has its first frame and can play; false while it fetches. */
  onReady?: (ready: boolean) => void;
  /** The video's own width and height in pixels, once known. */
  onSize?: (width: number, height: number) => void;
  /** Its player was freed (the page left, or the clip changed): whatever it had fetched is gone with it. */
  onGone?: () => void;
}, ref) {
  // The player is made and freed by hand rather than by the toolkit's hook:
  // the hook freed a still-playing player when a page left the feed, and
  // its sound could run on after. Here it is silenced and stopped first,
  // then freed.
  const player = useMemo(() => {
    const p = createVideoPlayer(uri);
    // Looping is done by hand below, so a trimmed clip loops back to the
    // start its author kept rather than to the very beginning.
    p.loop = false;
    p.muted = true;
    p.timeUpdateEventInterval = 0.2;
    return p;
  }, [uri]);
  const latestGone = useRef(onGone);
  latestGone.current = onGone;
  useEffect(() => () => {
    try { player.muted = true; player.pause(); } catch { /* already freed */ }
    try { player.release(); } catch { /* already freed */ }
    // The feed shows the page's cover again if it is rebuilt: a new player starts its fetch from nothing.
    latestGone.current?.();
  }, [player]);
  // The native player can be freed before a late effect reaches it; a call
  // on a freed player must be a no-op, not a crash in the feed.
  const safely = (work: () => void) => { try { work(); } catch { /* player already released */ } };
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
  // A clip is "ready" only once its first seconds are actually fetched, not
  // merely once the player can name it. Clips straight off a phone's camera
  // are heavy (a 13 Mb/s HDR file was seen), and starting one on a thin
  // buffer ran the small sound track while the picture stalled on its first
  // frame. The wish to play is kept, and honoured the moment enough is in.
  const wantPlay = useRef(false);
  const begin = useRef<() => void>(() => undefined);
  const isReady = () => {
    let ready = false;
    safely(() => {
      if (player.status !== 'readyToPlay') return;
      const length = player.duration || 0;
      const need = Math.min(PRELOAD_SECONDS, Math.max(0.5, length - 0.1));
      const buffered = player.bufferedPosition;
      ready = length > 0 && (buffered >= trimStart + need || buffered >= length - 0.1);
    });
    return ready;
  };
  const readyRef = useRef(false);
  useEffect(() => {
    readyRef.current = false;
    const askedAt = Date.now();
    // Only the first time this player is in says anything about the
    // connection: a later stall, or the wait after a loop's jump back, would
    // record the whole time since the page was built and make a fast
    // connection look slow.
    let measured = false;
    // A trimmed clip waits at the start its author kept, not at the very
    // beginning: that is the frame it shows before it plays, the part it
    // fetches ahead, and where it starts without a jump. Done once, as soon
    // as the player can take a move.
    let placed = false;
    // Checked on a short clock until it is in; the player has no event for buffering progress.
    const check = () => {
      if (!placed && !started.current && !playFromHere.current) {
        safely(() => {
          if (player.status !== 'readyToPlay') return;
          placed = true;
          if (Math.abs(player.currentTime - trimStart) > 0.05) player.currentTime = trimStart;
        });
      }
      const ready = isReady();
      if (ready !== readyRef.current) {
        readyRef.current = ready;
        // How long this one took is the phone's best measure of the connection.
        if (ready && !measured) { measured = true; noteClipLoad(Date.now() - askedAt); }
        latestReady.current?.(ready);
      }
      if (ready && wantPlay.current) begin.current();
      if (ready) { clearInterval(timer); }
    };
    const timer = setInterval(check, 150);
    check();
    const sub = player.addListener('statusChange', check);
    return () => { clearInterval(timer); sub.remove(); };
  }, [player, trimStart]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    safely(() => { player.muted = muted; });
  }, [player, muted]);
  // Every clip keeps a few seconds buffered ahead — enough for a page
  // waiting off screen to start the instant it arrives, without pulling whole
  // videos down. Set once: changing it as a page went live made the player
  // re-buffer, a blip of the loading disc over a clip already playing.
  useEffect(() => {
    safely(() => { player.bufferOptions = { preferredForwardBufferDuration: PRELOAD_SECONDS }; });
  }, [player]);
  // The end of the clip starts it over from the trim's start.
  useEffect(() => {
    const sub = player.addListener('playToEnd', () => {
      if (!wantPlay.current) return;
      safely(() => { player.currentTime = trimStart; player.play(); });
    });
    return () => sub.remove();
  }, [player, trimStart]);
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
  // The viewer paused the clip on the page itself, or moved it by hand while
  // it was stopped: the next play carries on from exactly where it stands
  // instead of being sent back to the trim's start.
  const playFromHere = useRef(false);
  // Whether the current wish to play has already been honoured: the
  // readiness clock and the status event can both fire, and a second start
  // must not seek the clip back to its beginning.
  const started = useRef(false);
  useImperativeHandle(ref, () => ({
    seek: (seconds) => {
      safely(() => { player.currentTime = seconds; });
      if (!started.current) playFromHere.current = true;
    },
    player,
  }), [player]); // eslint-disable-line react-hooks/exhaustive-deps
  begin.current = () => {
    if (started.current) return;
    started.current = true;
    for (const other of livePlayers) if (other !== player) { try { other.pause(); } catch { /* released */ } }
    if (playFromHere.current) {
      playFromHere.current = false;
      left.current = null;
      safely(() => player.play());
      return;
    }
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
      if (readyRef.current) begin.current();
    } else if (active) {
      // Paused by the viewer, still on screen: play will pick up right here.
      if (started.current) playFromHere.current = true;
      wantPlay.current = false;
      started.current = false;
      safely(() => player.pause());
    } else {
      // Leaving the page. A resume point only for a clip that had actually
      // played (even if it was paused just before the swipe): a page that
      // mounted off screen would otherwise "resume" at zero and then jump to
      // its trimmed start a moment into the sound.
      if (started.current || playFromHere.current) {
        safely(() => { left.current = { time: player.currentTime, at: Date.now() }; });
        playFromHere.current = false;
      }
      wantPlay.current = false;
      started.current = false;
      // Each native call stands on its own: a position read that fails must
      // never take the pause down with it, or the clip plays on after the swipe.
      safely(() => player.pause());
    }
  }, [player, active, paused, trimStart]);
  useEffect(() => { livePlayers.add(player); return () => { livePlayers.delete(player); }; }, [player]);
  // Back from the background (or a phone call): the toolkit paused every
  // player on the way out and starts none of them again, so the clip that was
  // playing would sit on a still frame with no sound. It carries on from
  // where it stopped, and it alone makes sound.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || !wantPlay.current || !started.current) return;
      for (const other of livePlayers) if (other !== player) { try { other.pause(); } catch { /* released */ } }
      safely(() => player.play());
    });
    return () => sub.remove();
  }, [player]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <View style={StyleSheet.absoluteFill}>
      <VideoView player={player} style={StyleSheet.absoluteFill} contentFit={fit} nativeControls={false} allowsPictureInPicture={false} />
    </View>
  );
});
