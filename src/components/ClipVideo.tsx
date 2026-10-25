import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { AppState, Platform, StyleSheet, View } from 'react-native';
import { VideoView, createVideoPlayer, type SurfaceType, type VideoPlayer } from 'expo-video';
import { videoSource } from '@/lib/videoSource';
import { linkState, noteClipLoad } from '@/lib/netSpeed';
import { useIsFocused } from '@/lib/useIsFocused';
import { useWindowsHeld } from '@/features/feed/feedWindows';
import { forgetLeft, noteLeft, peekLeft, takeLeft } from '@/features/feed/clipResume';
import { usePageLeaving } from '@/features/feed/pageLeaving';
import {
  EARLY_STALL_MS, PRELOAD_SECONDS, STALL_CONFIRM_MS, decideStart, heavyTrack, noteEarlyStall, noteOpeningCached,
  openingCached, quickStartOn, stalledEarly, type StartProbe, type TrackInfo,
} from '@/features/feed/quickStart';

/**
 * A clip on a phone. Plays on its own and loops, the way a feed expects —
 * `active` is the only control the page has over it. A trimmed clip loops
 * over the part its author kept.
 */
export interface ClipVideoHandle {
  seek: (seconds: number) => void;
  /** The native player, for a second view of the same stream (full screen). */
  player: VideoPlayer | null;
  /**
   * Shows the player here again after a second view of it has gone (Android):
   * there a player is drawn in one view at a time, and the full-screen view
   * took it away from this one without handing it back.
   */
  reattach: () => void;
}

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

/** Android's default drawing surface for a clip (an iPhone ignores it). */
const ANDROID_SURFACE: SurfaceType | undefined = Platform.OS === 'android' ? 'textureView' : undefined;

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
  // On a feed page a swipe has just been decided away from, it stops (silent
  // first) as the finger lifts, before the next page has landed (pageLeaving).
  // The Feed's windows up: held on this frame, and on from it when they close (features/feed/feedWindows).
  const windowsHeld = useWindowsHeld();
  const onTop = (useIsFocused() && !windowsHeld) || held;
  const leaving = usePageLeaving();
  const active = wanted && onTop && !leaving;
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
  // Whether this clip's opening was on the phone before this player asked for it (primed ahead,
  // or fetched by an earlier page this session): read once, as the player is made, so its own
  // fetch never counts (features/feed/quickStart).
  const openingWasIn = useMemo(() => openingCached(uri), [uri]);
  // Whether its picture is heavy (HDR, or a camera file's data rate), once the player says.
  const track = useRef<'unknown' | 'light' | 'heavy'>('unknown');
  const noteTrack = (info: TrackInfo | null | undefined) => {
    if (!info || track.current === 'heavy') return;
    track.current = heavyTrack(info) ? 'heavy' : 'light';
  };
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
    track.current = 'unknown';
    const report = (info: (TrackInfo & { size?: { width: number; height: number } }) | null | undefined) => {
      noteTrack(info);
      const size = info?.size;
      if (size && size.width > 0 && size.height > 0) latestSize.current?.(size.width, size.height);
    };
    safely(() => report((player as unknown as { videoTrack?: (TrackInfo & { size?: { width: number; height: number } }) | null }).videoTrack));
    const a = player.addListener('sourceLoad', ({ availableVideoTracks }) => report(availableVideoTracks?.[0]));
    const b = player.addListener('videoTrackChange', ({ videoTrack }) => report(videoTrack));
    return () => { a.remove(); b.remove(); };
  }, [player]); // eslint-disable-line react-hooks/exhaustive-deps
  // A clip is "ready" only once its first seconds are actually fetched, not
  // merely once the player can name it. Clips straight off a phone's camera
  // are heavy (a 13 Mb/s HDR file was seen), and starting one on a thin
  // buffer ran the small sound track while the picture stalled on its first
  // frame. So a clip counts as loaded once its first three seconds are in.
  // The one on screen may start sooner, once about a second is in, where that
  // is safe: a quick link or its opening already on the phone, a light clip,
  // and no early stall this session (the quick rule, admins first:
  // features/feed/quickStart). A page waiting off screen still reports ready
  // only once its three seconds are in, so the Feed's next fetches wait for it
  // as before. The wish to play is kept, and honoured the moment enough is in.
  const wantPlay = useRef(false);
  const begin = useRef<() => void>(() => undefined);
  // Where the clip waits before it plays, and so where its first seconds are fetched from.
  const placedAt = useRef(trimStart);
  /** What the player says right now: its state, length and how far it is fetched; null if it cannot say. */
  const probe = (): StartProbe | null => {
    let now: StartProbe | null = null;
    safely(() => { now = { status: player.status, length: player.duration || 0, buffered: player.bufferedPosition, from: placedAt.current }; });
    return now;
  };
  // Its first three seconds (or all of it) are in.
  const loadedRef = useRef(false);
  const readyRef = useRef(false);
  // When it last started on the quick rule, before its three seconds were in (0: it did not): a
  // stall soon after says the link cannot keep up with a quick start (below).
  const quickFrom = useRef(0);
  // The readiness check, run at once when the clip comes on screen or the app comes back, not at the next tick.
  const checkNow = useRef<() => void>(() => undefined);
  useEffect(() => {
    readyRef.current = false;
    loadedRef.current = false;
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
      if (track.current === 'unknown' && quickStartOn()) safely(() => noteTrack((player as unknown as { videoTrack?: TrackInfo | null }).videoTrack));
      // Off screen: ready once its three seconds are in, as before. On screen: sooner, on the quick
      // rule, where it applies. Once ready it stays ready (features/feed/quickStart).
      const { loaded, opening, ready } = decideStart({
        probe: probe(), failed, wanted: wantPlay.current, wasReady: readyRef.current,
        on: quickStartOn(), link: linkState(), cached: openingWasIn, heavy: track.current === 'heavy', stalledBefore: stalledEarly(),
      });
      // Its first second is in: from now on a page built for this clip finds its opening on the phone.
      if (opening) noteOpeningCached(uri);
      loadedRef.current = loaded;
      if (ready !== readyRef.current) {
        readyRef.current = ready;
        latestReady.current?.(ready);
      }
      // How long its three seconds took is the phone's best measure of the connection, whenever it started.
      if ((loaded || failed) && !measured) { measured = true; noteClipLoad(Date.now() - askedAt); }
      if (ready && wantPlay.current) begin.current();
      if (loaded || failed) { clearInterval(timer); }
    };
    checkNow.current = check;
    const timer = setInterval(check, 150);
    check();
    const sub = player.addListener('statusChange', check);
    return () => { clearInterval(timer); sub.remove(); checkNow.current = () => undefined; };
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
  // Android: a new view takes the player back (see reattach).
  const [viewKey, setViewKey] = useState(0);
  useImperativeHandle(ref, () => ({
    seek: (seconds) => {
      safely(() => { player.currentTime = seconds; });
      if (!started.current) playFromHere.current = true;
    },
    player,
    reattach: () => { if (Platform.OS === 'android') setViewKey((k) => k + 1); },
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
      quickFrom.current = 0;
      forgetLeft(uri);
      safely(() => player.play());
      return;
    }
    // Back within a few seconds of swiping away: on from where it was, even
    // on a player rebuilt meanwhile. Later, or a first play: the trim's start.
    const target = takeLeft(uri, wantedAt.current) ?? trimStart;
    // Starting before its three seconds are in, from where they were being fetched: the quick
    // rule's start, watched for an early stall (below). A jump elsewhere is not its test.
    quickFrom.current = !loadedRef.current && Math.abs(target - placedAt.current) < 0.5 ? Date.now() : 0;
    // Only a real move is a seek; the first play of a clip sitting at its start is a plain play.
    safely(() => { if (Math.abs(player.currentTime - target) > 0.05) player.currentTime = target; });
    safely(() => player.play());
  };
  // A clip that started on the quick rule and stalls in its first seconds (its player waiting for
  // more of it while it should be playing) shows this link cannot keep up with a quick start: every
  // clip waits for its three seconds again for the rest of the session (features/feed/quickStart).
  // The stall itself is handled as any stall is: the picture holds until the player has more.
  useEffect(() => {
    let confirm: ReturnType<typeof setTimeout> | undefined;
    const sub = player.addListener('statusChange', ({ status }) => {
      if (status !== 'loading' || !quickFrom.current) return;
      if (Date.now() - quickFrom.current > EARLY_STALL_MS) { quickFrom.current = 0; return; }
      if (confirm) clearTimeout(confirm);
      // A wait that has not cleared this much later is a stall, not the player's instant check on play.
      confirm = setTimeout(() => {
        confirm = undefined;
        safely(() => {
          if (quickFrom.current && wantPlay.current && started.current && !away() && player.status === 'loading') { quickFrom.current = 0; noteEarlyStall(); }
        });
      }, STALL_CONFIRM_MS);
    });
    return () => { if (confirm) clearTimeout(confirm); sub.remove(); };
  }, [player]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (active && !paused) {
      if (!wantPlay.current) wantedAt.current = Date.now();
      wantPlay.current = true;
      // Ready (or able to start on the quick rule right now): it starts at once.
      if (readyRef.current) begin.current(); else checkNow.current();
    } else if (active || !onTop || leaving) {
      // Paused by the viewer, or covered: a page pushed over the feed (the
      // comments, a profile) or its tab slid away. Neither is a swipe, so it
      // holds right here and picks up from this spot however long that took.
      // So does a swipe decided away from it (pageLeaving) until the feed has
      // landed elsewhere: turned round, however slowly, it carries on from
      // here (and a pause the viewer chose stays); landed elsewhere, the
      // swipe rule below takes over from then.
      if (started.current) playFromHere.current = true;
      wantPlay.current = false;
      started.current = false;
      quickFrom.current = 0;
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
      quickFrom.current = 0;
      // Each native call stands on its own: a position read that fails must
      // never take the pause down with it, or the clip plays on after the swipe.
      safely(() => player.pause());
    }
  }, [player, active, paused, trimStart, onTop, leaving]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { livePlayers.add(player); return () => { livePlayers.delete(player); }; }, [player]);
  // The app leaves the front (home, lock, the app switcher, Control Centre, a
  // call): the clip stops right there, picture and sound, where it stood.
  // Back in front, the clip that was playing carries on from that spot, and
  // it alone makes sound; one that was still loading when you left starts
  // now. A clip you had paused yourself stays paused, and one that is no
  // longer the clip on screen (wantPlay is false for it) stays still.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') { quickFrom.current = 0; safely(() => player.pause()); return; }
      if (state !== 'active' || !wantPlay.current) return;
      if (!started.current) { if (readyRef.current) begin.current(); else checkNow.current(); return; }
      for (const other of livePlayers) if (other !== player) { try { other.pause(); } catch { /* released */ } }
      safely(() => player.play());
    });
    return () => sub.remove();
  }, [player]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <View style={StyleSheet.absoluteFill}>
      {/* Android draws on a texture unless told otherwise: a "surface" is punched through the
          window, so rounded corners, a crop's zoom and fades would not apply to it (Oct 5). */}
      <VideoView key={viewKey} player={player} style={StyleSheet.absoluteFill} contentFit={fit} nativeControls={false} allowsPictureInPicture={false} surfaceType={surfaceType ?? ANDROID_SURFACE} />
    </View>
  );
});
