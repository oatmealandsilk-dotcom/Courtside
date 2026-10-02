import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { VideoView, createVideoPlayer, type SurfaceType, type VideoPlayer } from 'expo-video';
import { videoSource } from '@/lib/videoSource';
import { noteClipLoad } from '@/lib/netSpeed';
import { useIsFocused } from '@/lib/useIsFocused';
import { forgetLeft, noteLeft, peekLeft, takeLeft } from '@/features/feed/clipResume';

/** How many seconds of a clip are fetched before it counts as loaded and may start. */
const PRELOAD_SECONDS = 3;

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

/**
 * The app is not in front: on its way to the background, or covered by the
 * phone itself — the app switcher, Control Centre, Notification Centre, Siri,
 * a call taking the whole screen. The toolkit stops its players only once
 * the app is fully in the background, so until then a clip would carry on,
 * sound and all, behind whatever the phone is showing. An unknown state (the
 * first instant of a launch) counts as in front, so nothing waits on it.
 */
const away = () => AppState.currentState === 'background' || AppState.currentState === 'inactive';

export const ClipVideo = forwardRef<ClipVideoHandle, {
  uri: string; poster?: string; active?: boolean; muted?: boolean; paused?: boolean; fit?: 'cover' | 'contain';
  trimStart?: number; trimEnd?: number; speed?: number; volume?: number;
  onProgress?: (fraction: number, seconds: number, length: number) => void;
  onReady?: (ready: boolean) => void;
  onSize?: (width: number, height: number) => void;
  onGone?: () => void;
  held?: boolean;
  surfaceType?: SurfaceType;
}>(function ClipVideo({ uri, active: wanted = true, muted = true, paused = false, fit = 'cover', trimStart = 0, trimEnd, speed, volume, onProgress, onReady, onSize, onGone, held = false, surfaceType }: {
  uri: string; poster?: string; active?: boolean; muted?: boolean; paused?: boolean; fit?: 'cover' | 'contain';
  trimStart?: number; trimEnd?: number;
  /** The author's playback edits, honoured by the player rather than cut into the file: a rate (1 is normal) and a level (0–1). */
  speed?: number; volume?: number;
  /** How far through the clip it is, 0..1, a few times a second. */
  onProgress?: (fraction: number, seconds: number, length: number) => void;
  /** True once the clip has its first frame and can play; false while it fetches. */
  onReady?: (ready: boolean) => void;
  /** The video's own width and height in pixels, once known. */
  onSize?: (width: number, height: number) => void;
  /** Its player was freed (the page left, or the clip changed): whatever it had fetched is gone with it. */
  onGone?: () => void;
  /**
   * The clip is on the comments stage: it counts as on top although the
   * comments page is over it, so it plays on, shrunk above the sheet.
   */
  held?: boolean;
  /** Android only: 'textureView' can be shrunk and moved smoothly (the comments stage); the default can't. */
  surfaceType?: SurfaceType;
}, ref) {
  // Plays only on the screen you are looking at: a page pushed over this one
  // (a profile, a thread, the comments) or a tab slid off screen holds it,
  // whatever the page that drew it asked for, and it carries on when you
  // come back. A clip's own page needs to say nothing for this. The one
  // exception is the comments stage, which keeps its clip playing above it.
  const onTop = useIsFocused() || held;
  const active = wanted && onTop;
  // The player is made and freed by hand rather than by the toolkit's hook:
  // the hook freed a still-playing player when a page left the feed, and
  // its sound could run on after. Here it is silenced and stopped first,
  // then freed.
  const player = useMemo(() => {
    const p = createVideoPlayer(videoSource(uri));
    // Looping is done by hand below, so a trimmed clip loops back to the
    // start its author kept rather than to the very beginning.
    p.loop = false;
    p.muted = true;
    p.timeUpdateEventInterval = 0.2;
    return p;
  }, [uri]);
  // The viewer paused the clip on the page itself, moved it by hand while it
  // was stopped, or a page was pushed over it: the next play carries on from
  // exactly where it stands instead of following the swipe rule (clipResume).
  const playFromHere = useRef(false);
  // Whether the current wish to play has already been honoured: the
  // readiness clock and the status event can both fire, and a second start
  // must not seek the clip back to its beginning.
  const started = useRef(false);
  // When the clip last came on screen: the swipe rule counts from then, even
  // if the player was still loading and only starts a moment later.
  const wantedAt = useRef(0);
  const latestGone = useRef(onGone);
  latestGone.current = onGone;
  useEffect(() => () => {
    // Freed while it was the clip on screen (the feed rebuilt its pages, or a
    // page above yours went away): its spot is kept, so the player built in
    // its place carries on from there rather than starting over.
    if (started.current || playFromHere.current) { try { noteLeft(uri, player.currentTime); } catch { /* already freed */ } }
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
  // Where the clip waits before it plays, and so where its first seconds are fetched from.
  const placedAt = useRef(trimStart);
  const isReady = () => {
    let ready = false;
    safely(() => {
      if (player.status !== 'readyToPlay') return;
      const length = player.duration || 0;
      const need = Math.min(PRELOAD_SECONDS, Math.max(0.5, length - 0.1));
      const buffered = player.bufferedPosition;
      ready = length > 0 && (buffered >= placedAt.current + need || buffered >= length - 0.1);
    });
    return ready;
  };
  const readyRef = useRef(false);
  useEffect(() => {
    readyRef.current = false;
    placedAt.current = trimStart;
    const askedAt = Date.now();
    // Only the first time this player is in says anything about the
    // connection: a later stall, or the wait after a loop's jump back, would
    // record the whole time since the page was built and make a fast
    // connection look slow.
    let measured = false;
    // A trimmed clip waits at the start its author kept, not at the very
    // beginning: that is the frame it shows before it plays, the part it
    // fetches ahead, and where it starts without a jump. Done once, as soon
    // as the player can take a move. A player built while its clip is already
    // the one on screen, coming back within the swipe rule's few seconds (the
    // feed rebuilt its pages under you), waits at the spot it is about to
    // carry on from instead, so it fetches from there and starts without a
    // second wait. A page built off screen still waits at the start.
    let placed = false;
    // Checked on a short clock until it is in; the player has no event for buffering progress.
    const check = () => {
      if (!placed && !started.current && !playFromHere.current) {
        safely(() => {
          if (player.status !== 'readyToPlay') return;
          placed = true;
          const at = (wantPlay.current ? peekLeft(uri, wantedAt.current) : null) ?? trimStart;
          placedAt.current = at;
          if (Math.abs(player.currentTime - at) > 0.05) player.currentTime = at;
        });
      }
      // A video that cannot load (a link that only ever worked on the phone
      // that made it) counts as arrived: the page shows, with its poster,
      // instead of holding the reader on a placeholder for good.
      let failed = false;
      try { failed = player.status === 'error'; } catch { /* player already released */ }
      const ready = isReady() || failed;
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
  // A clip that is not the one on screen is silent, whatever it was asked for.
  useEffect(() => {
    safely(() => { player.muted = muted || !active; });
  }, [player, muted, active]);
  // Speed keeps the voice's pitch; a level under full is the author's choice, silence is `muted`.
  // On an iPhone, giving the player a speed also sets it playing (the phone's
  // player treats any speed above zero as "play"): a clip built while it was
  // already the one on screen started from its very first frame, with sound,
  // before it had loaded or found its place. So the speed is set only when it
  // actually changes, and a clip that is not meant to be playing right now
  // (still loading, paused, off screen, or the app is away) is stopped again
  // at once. The next play keeps the new speed.
  useEffect(() => {
    safely(() => {
      player.preservesPitch = true;
      const rate = speed ?? 1;
      if (player.playbackRate === rate) return;
      player.playbackRate = rate;
      if (!wantPlay.current || !started.current || away()) player.pause();
    });
  }, [player, speed]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { safely(() => { player.volume = volume ?? 1; }); }, [player, volume]);
  // Every clip keeps a few seconds buffered ahead — enough for a page
  // waiting off screen to start the instant it arrives, without pulling whole
  // videos down. Set once: changing it as a page went live made the player
  // re-buffer, a blip of the loading disc over a clip already playing.
  useEffect(() => {
    safely(() => { player.bufferOptions = { preferredForwardBufferDuration: PRELOAD_SECONDS }; });
  }, [player]);
  // The end of the clip starts it over from the trim's start — and, if the
  // app has just left the front, waits there instead of playing on.
  useEffect(() => {
    const sub = player.addListener('playToEnd', () => {
      if (!wantPlay.current) return;
      safely(() => { player.currentTime = trimStart; if (!away()) player.play(); });
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
  useImperativeHandle(ref, () => ({
    seek: (seconds) => {
      safely(() => { player.currentTime = seconds; });
      if (!started.current) playFromHere.current = true;
    },
    player,
  }), [player]); // eslint-disable-line react-hooks/exhaustive-deps
  begin.current = () => {
    // Not while the app is out of the front: the wish is kept, and coming
    // back (below) starts it. A clip that finished loading just after you
    // left must not start playing behind the phone's home screen.
    if (started.current || away()) return;
    started.current = true;
    for (const other of livePlayers) if (other !== player) { try { other.pause(); } catch { /* released */ } }
    if (playFromHere.current) {
      playFromHere.current = false;
      forgetLeft(uri);
      safely(() => player.play());
      return;
    }
    // Back within a few seconds of swiping away: on from where it was, even
    // on a player rebuilt meanwhile. Later, or a first play: the trim's start.
    const target = takeLeft(uri, wantedAt.current) ?? trimStart;
    // Only a real move is a seek; the first play of a clip sitting at its start is a plain play.
    safely(() => { if (Math.abs(player.currentTime - target) > 0.05) player.currentTime = target; });
    safely(() => player.play());
  };
  useEffect(() => {
    if (active && !paused) {
      if (!wantPlay.current) wantedAt.current = Date.now();
      wantPlay.current = true;
      if (readyRef.current) begin.current();
    } else if (active || !onTop) {
      // Paused by the viewer, or covered: a page pushed over the feed (the
      // comments, a profile) or its tab slid away. Neither is a swipe, so it
      // holds right here and picks up from this spot however long that took.
      if (started.current) playFromHere.current = true;
      wantPlay.current = false;
      started.current = false;
      safely(() => player.pause());
    } else {
      // Swiped away (or uncovered on a feed that has moved on meanwhile). A
      // resume point only for a clip that had actually played (even if it was
      // paused just before the swipe): a page that mounted off screen would
      // otherwise "resume" at zero and then jump to its trimmed start a moment
      // into the sound.
      if (started.current || playFromHere.current) {
        safely(() => noteLeft(uri, player.currentTime));
        playFromHere.current = false;
      }
      wantPlay.current = false;
      started.current = false;
      // Each native call stands on its own: a position read that fails must
      // never take the pause down with it, or the clip plays on after the swipe.
      safely(() => player.pause());
    }
  }, [player, active, paused, trimStart, onTop]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { livePlayers.add(player); return () => { livePlayers.delete(player); }; }, [player]);
  // The app leaves the front (home, lock, the app switcher, Control Centre, a
  // call): the clip stops right there, picture and sound, where it stood.
  // Back in front, the clip that was playing carries on from that spot, and
  // it alone makes sound; one that was still loading when you left starts
  // now. A clip you had paused yourself stays paused, and one that is no
  // longer the clip on screen (wantPlay is false for it) stays still.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') { safely(() => player.pause()); return; }
      if (state !== 'active' || !wantPlay.current) return;
      if (!started.current) { if (readyRef.current) begin.current(); return; }
      for (const other of livePlayers) if (other !== player) { try { other.pause(); } catch { /* released */ } }
      safely(() => player.play());
    });
    return () => sub.remove();
  }, [player]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <View style={StyleSheet.absoluteFill}>
      <VideoView player={player} style={StyleSheet.absoluteFill} contentFit={fit} nativeControls={false} allowsPictureInPicture={false} surfaceType={surfaceType} />
    </View>
  );
});
