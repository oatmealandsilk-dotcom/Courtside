import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated as RNAnimated, PanResponder, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { isDesktopBrowser } from '@/lib/browserDevice';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, FadeIn, FadeInUp, FadeOut, ReduceMotion, useAnimatedStyle, useFrameCallback, useSharedValue, withTiming } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';

import type { PickedMedia } from '@/components/MediaPicker';
import { VideoSurface, type VideoSurfaceHandle } from '@/components/VideoSurface';
import { framesAt, type Frame } from '@/features/compose/frames';
import { editPhotoRect, measureForEdit } from '@/features/compose/photoEdit';
import { cropLayer } from '@/lib/crop';
import * as haptics from '@/lib/haptics';
import { useReducedMotion } from '@/lib/useReducedMotion';
import type { MediaCrop } from '@/data/types';
import { colors, radius, spacing, typography } from '@/theme';

/** What leaves the editor: the media to post and how to play it. */
export interface EditedMedia {
  media: PickedMedia;
  orientation: 'portrait' | 'landscape';
  trimStart?: number;
  trimEnd?: number;
  /** Posted without sound. */
  muted?: boolean;
  /** How loud its own sound plays, 0–1; left out at full. Silence is `muted`, never 0. */
  volume?: number;
  /** How fast it plays — 0.5, 1.5 or 2; left out at normal speed. Honoured by the player, never cut into the file. */
  speed?: number;
  /** A zoom and shift inside the frame — cuts black edges out of a recording. */
  crop?: MediaCrop;
  /** The moment the cover was taken from, so a return to the editor reopens Cover on it. Never stored with the post. */
  coverAt?: number;
}

/** What an earlier pass decided, so stepping back from the caption finds it all still here. */
export interface EditorInitial {
  trimStart?: number;
  trimEnd?: number;
  muted?: boolean;
  volume?: number;
  speed?: number;
  crop?: MediaCrop;
  orientation?: 'portrait' | 'landscape';
  cover?: string;
  coverAt?: number;
}

const HANDLE = 16;
const STRIP_H = 64;
const MIN_CLIP_SECONDS = 1;
/** A handle this close to the clip's own start or end snaps onto it. */
const SNAP_S = 0.15;
const HANDLE_SLOP = { top: 8, bottom: 8, left: 14, right: 14 };
const SPEEDS = [0.5, 1, 1.5, 2] as const;
type Speed = (typeof SPEEDS)[number];
type Tool = 'trim' | 'cover' | 'crop' | 'speed' | 'sound';
const TOOLS: { key: Tool; label: string }[] = [
  { key: 'trim', label: 'Trim' }, { key: 'cover', label: 'Cover' }, { key: 'crop', label: 'Crop' }, { key: 'speed', label: 'Speed' }, { key: 'sound', label: 'Sound' },
];
const clock = (s: number) => `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
/** A length, to the nearest second: 5.9s reads "0:06", not "0:05". The running clock keeps the floor so it never ticks early. */
const clockRound = (s: number) => clock(Math.round(s));
/** To a tenth, for the chip over a held handle: "0:03.4". */
const clockTenths = (s: number) => {
  const t = Math.floor(Math.max(0, s) * 10) / 10;
  const m = Math.floor(t / 60);
  return `${m}:${(t - m * 60).toFixed(1).padStart(4, '0')}`;
};
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// A computer's browser: the stage is wide, so a portrait post gets a phone-shaped box in the middle.
const desktopWeb = Platform.OS === 'web' && isDesktopBrowser();
// The one authored moment is a change of tool: the strip fades out while the
// next rises four pixels into place, and the rail's underline slides over.
const zoneOut = FadeOut.duration(120).reduceMotion(ReduceMotion.System);
const zoneIn = FadeInUp.duration(160).withInitialValues({ transform: [{ translateY: 4 }] }).reduceMotion(ReduceMotion.System);
const frameIn = FadeIn.duration(180).reduceMotion(ReduceMotion.System);
const discIn = FadeIn.duration(120).reduceMotion(ReduceMotion.System);

/**
 * The step between picking something and writing the caption. The picture
 * fills the screen; one word at a time along the rail — Trim, Cover, Crop,
 * Speed, Sound — changes the strip under it, and the rows never change
 * height so the picture never jumps. Nothing is re-encoded: every edit is
 * remembered and honoured at playback, so it is instant and never touches
 * the original. A photo gets a turn, a frame and a crop, cut once on Next.
 */
export function MediaEditor({ media, initial, onBack, onDone, portraitRatio = 9 / 16 }: {
  media: PickedMedia;
  /** An earlier pass's decisions, restored on the way back from the caption. */
  initial?: EditorInitial;
  onBack: () => void;
  onDone: (result: EditedMedia) => void;
  /** Width over height of a portrait frame: 4:5 for a post (as the feed shows it), 9:16 for a full-screen clip. Landscape is 16:9. */
  portraitRatio?: number;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const reduced = useReducedMotion();
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;
  // The editor's own width. On a computer the stage is the whole window, so
  // the bar and the tools take the picture's width instead (panelWidth,
  // below) and sit under it, sharing its two edges.
  const [ownWidth, setOwnWidth] = useState(0);
  const width = ownWidth || windowWidth;
  const isVideo = media.kind === 'video';
  const initialRef = useRef(initial);

  /* ----------------------------------- stage ---------------------------------- */
  // The frame's size, and the stage's. The frame sits centred on the stage
  // (in a landscape post, or on a computer), and the crop box is drawn on the
  // stage, so it is moved by the same margins. Worked out from the two sizes
  // rather than read from the frame's position, which is not re-reported when
  // only the position changes.
  const [box, setBox] = useState({ w: 1, h: 1 });
  const [stageSize, setStageSize] = useState({ w: 0, h: 0 });
  const boxOff = { x: stageSize.w ? Math.max(0, (stageSize.w - box.w) / 2) : 0, y: stageSize.h ? Math.max(0, (stageSize.h - box.h) / 2) : 0 };
  const boxRef = useRef(box);
  boxRef.current = box;
  const boxOffRef = useRef(boxOff);
  boxOffRef.current = boxOff;
  // On a computer the tools are as wide as the picture: a phone-shaped clip
  // gets a strip the width of its box, not one that runs the whole window.
  const panelWidth = desktopWeb ? clamp(box.w > 1 ? box.w : width, 320, 960) : width;
  const column = desktopWeb ? { width: panelWidth, alignSelf: 'center' as const } : null;
  // Room to centre the rail's words with air between them; a narrow column spreads them edge to edge instead.
  const roomy = desktopWeb && panelWidth >= 400;
  const stripWidth = Math.max(1, panelWidth - spacing.lg * 2 - HANDLE * 2);

  /* ----------------------------------- video ---------------------------------- */
  const player = useRef<VideoSurfaceHandle>(null);
  const [duration, setDuration] = useState(0);
  const durationRef = useRef(0);
  const [range, setRange] = useState<[number, number]>([0, 0]);
  const [frames, setFrames] = useState<Frame[]>([]);
  const [cover, setCover] = useState<string | undefined>(initial?.cover ?? media.thumbnailUrl);
  const [muted, setMuted] = useState(!!initial?.muted);
  // How loud the clip's own sound plays. Dragged down to nothing it is muted,
  // and the level it had waits for the next unmute.
  const [volume, setVolume] = useState(() => (initial?.volume !== undefined && initial.volume > 0 && initial.volume <= 1 ? initial.volume : 1));
  const lastLevel = useRef(volume);
  const [speed, setSpeed] = useState<Speed>(() => SPEEDS.find((v) => v === initial?.speed) ?? 1);
  // The playhead's clock runs at the same rate as the picture.
  const rateSV = useSharedValue(1);
  useEffect(() => { rateSV.value = speed; }, [speed, rateSV]);
  const [tool, setTool] = useState<Tool>('trim');
  // Choosing a cover happens on a still: the video holds on whichever frame
  // is picked, and only plays again when you leave Cover.
  const [frozenAt, setFrozenAt] = useState<number | null>(null);
  const switchTool = (next: Tool) => {
    if (next === tool) return;
    setTool(next);
    if (next === 'crop') { holding.current = false; setFrozenAt(null); startPlayer(); return; }
    if (next === 'cover') {
      holding.current = true;
      stopPlayer();
      // Cover opens on the moment you were watching, and that frame becomes
      // the cover, so the still on screen is always the cover you will get.
      // Back from the caption with a cover already chosen, it opens on that
      // moment instead and leaves the chosen picture alone.
      const lo = range[0];
      const hi = range[1] > lo ? range[1] : Number.POSITIVE_INFINITY;
      const kept = initialRef.current?.coverAt;
      const at = frozenAt ?? (kept !== undefined && !coverRepicked.current ? Math.max(lo, Math.min(hi, kept)) : Math.max(lo, Math.min(hi, head.value)));
      setFrozenAt(at);
      coverAtRef.current = at;
      setCoverAt(at);
      head.value = at;
      player.current?.seek(at);
      if (frozenAt === null && !(kept !== undefined && !coverRepicked.current && at === kept)) settleCover(at);
    } else {
      // Back from a cover still: play on from the cover's frame.
      // From Crop: the video just carries on where it was.
      if (frozenAt !== null) {
        head.value = frozenAt;
        player.current?.seek(frozenAt);
      }
      setFrozenAt(null);
      startPlayer();
      setTimeout(() => { holding.current = false; }, 250);
    }
  };
  const [now, setNow] = useState(0);
  // Paused by you: a tap on the video, or the space bar on a computer.
  const [userPaused, setUserPaused] = useState(false);
  const userPausedRef = useRef(false);
  userPausedRef.current = userPaused;
  // The playhead runs on its own clock, one step every screen frame, while
  // the video is playing. The player only reports its time a few times a
  // second (a browser about four); those reports just nudge the line back
  // into step, so it glides instead of inching from report to report.
  const head = useSharedValue(0);
  const rolling = useSharedValue(true);
  // Seconds since the video last reported a new time. A video that stalls
  // (loading, or paused) stops reporting, and the line stops with it.
  const sinceReport = useSharedValue(1);
  const keepFrom = useSharedValue(0);
  const keepTo = useSharedValue(0);
  useFrameCallback((frame) => {
    const dt = (frame.timeSincePreviousFrame ?? 0) / 1000;
    sinceReport.value += dt;
    if (!rolling.value || sinceReport.value > 0.6 || dt <= 0 || dt > 0.25) return;
    const a = keepFrom.value;
    const b = keepTo.value;
    if (b - a < 0.05) return;
    let next = head.value + dt * rateSV.value;
    // Past the end of the kept part the video loops back to its start; so does the line.
    if (next >= b) next = a + Math.min(next - b, 0.1);
    head.value = next;
  });
  const stopPlayer = () => { rolling.value = false; player.current?.pause(); };
  const startPlayer = () => {
    if (userPausedRef.current) return;
    rolling.value = true;
    player.current?.play();
  };
  // While a handle is being dragged, or the picture is frozen on a cover
  // frame, the line sits exactly where it is put — the player's own reports
  // (it fires one after every seek) would otherwise yank it around.
  const scrubbing = useRef(false);
  const holding = useRef(false);
  const lastReported = useRef(-1);
  const onTime = useCallback((seconds: number) => {
    setNow(seconds);
    if (seconds !== lastReported.current) { lastReported.current = seconds; sinceReport.value = 0; }
    if (scrubbing.current || holding.current) return;
    const [a, b] = rangeRef.current;
    // The line has already looped round and the video is a beat from doing
    // the same: a last report from the end would only pull the line back.
    if (b > a && seconds > b - 0.35 && head.value < a + 0.35) return;
    const drift = seconds - head.value;
    head.value = Math.abs(drift) > 0.3 ? seconds : head.value + drift * 0.3;
  }, [head, sinceReport]); // eslint-disable-line react-hooks/exhaustive-deps
  const onDuration = useCallback((seconds: number) => {
    if (durationRef.current || !(seconds > 0)) return;
    durationRef.current = seconds;
    // An earlier trim comes back with the clip, as long as it still fits it.
    const init = initialRef.current;
    const a = clamp(init?.trimStart ?? 0, 0, seconds);
    const b = clamp(init?.trimEnd ?? seconds, 0, seconds);
    const kept: [number, number] = b >= a + MIN_CLIP_SECONDS ? [a, b] : [0, seconds];
    setDuration(seconds);
    setRange(kept);
    if (kept[0] > 0) { head.value = kept[0]; player.current?.seek(kept[0]); }
  }, [head]);
  // A clip whose length never arrives (a file the player cannot read) is
  // said so; Next still works and posts it as it is.
  const [readFailed, setReadFailed] = useState(false);
  useEffect(() => {
    if (!isVideo) return;
    if (duration) { setReadFailed(false); return; }
    const t = setTimeout(() => setReadFailed(true), 6000);
    return () => clearTimeout(t);
  }, [isVideo, duration]);
  // Frames sampled at the middle of each cell of the strip, as many cells as
  // fit at 48px, once the clip's length is known.
  const cells = Math.max(8, Math.min(Platform.OS === 'web' ? 12 : 10, Math.floor(stripWidth / 48)));
  const cellsRef = useRef(cells);
  cellsRef.current = cells;
  useEffect(() => {
    if (!isVideo || !media.uri || !duration) return;
    let cancelled = false;
    const count = cellsRef.current;
    const times = Array.from({ length: count }, (_, i) => (duration * (i + 0.5)) / count);
    framesAt(media.uri, times).then((got) => { if (!cancelled) setFrames(got); });
    return () => { cancelled = true; };
  }, [isVideo, media.uri, duration]);

  // The trim strip: two handles over a row of frames, dragged in pixels and
  // turned into seconds. PanResponder is enough here — it is a small strip,
  // not a page — and works the same in the browser.
  const secondsPerPx = duration ? duration / stripWidth : 0;
  const rangeRef = useRef(range);
  rangeRef.current = range;
  useEffect(() => { keepFrom.value = range[0]; keepTo.value = range[1]; }, [range, keepFrom, keepTo]);
  useEffect(() => { rolling.value = frozenAt === null && !userPaused; }, [frozenAt, userPaused, rolling]);
  // Pause and play: tap the video, or press the space bar on a computer.
  // Choosing a cover already holds on a still, so there it does nothing.
  const togglePause = () => {
    if (!isVideo || tool === 'cover' || frozenAt !== null) return;
    setUserPaused((p) => !p);
  };
  const toggleRef = useRef(togglePause);
  toggleRef.current = togglePause;
  // Which handle is under a finger, for the time chip over it.
  const [held, setHeld] = useState<0 | 1 | null>(null);
  const [chipW, setChipW] = useState(56);
  const snapped = useRef(false);
  const startAt = useRef(0);
  const makeHandle = (side: 0 | 1) => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {
      scrubbing.current = true;
      startAt.current = rangeRef.current[side];
      // Already on the clip's edge: no tap for merely touching it.
      snapped.current = side === 0 ? rangeRef.current[0] < SNAP_S : rangeRef.current[1] > duration - SNAP_S;
      setHeld(side);
      stopPlayer();
    },
    onPanResponderMove: (_, g) => {
      const [a, b] = rangeRef.current;
      const raw = startAt.current + g.dx * secondsPerPx;
      const next: [number, number] = side === 0
        ? [Math.max(0, Math.min(raw, b - MIN_CLIP_SECONDS)), b]
        : [a, Math.min(duration, Math.max(raw, a + MIN_CLIP_SECONDS))];
      // The clip's own start and end pull the handle the last fraction of a
      // second onto them, with one tap as it lands — never one per move.
      const onEdge = side === 0 ? next[0] < SNAP_S : next[1] > duration - SNAP_S;
      if (onEdge) {
        if (side === 0) next[0] = 0; else next[1] = duration;
        if (!snapped.current) { snapped.current = true; haptics.tap(); }
      } else snapped.current = false;
      setRange(next);
      const at = side === 0 ? next[0] : next[1];
      head.value = at;
      player.current?.seek(at);
    },
    onPanResponderRelease: () => {
      setHeld(null);
      const from = rangeRef.current[0];
      head.value = from;
      player.current?.seek(from);
      startPlayer();
      // The seek's own report lands a beat later; ignore it too.
      setTimeout(() => { scrubbing.current = false; }, 250);
    },
    onPanResponderTerminate: () => { setHeld(null); scrubbing.current = false; },
  });
  // Dragging along the frames (the white line follows) skips to wherever the
  // finger is, within the kept part; letting go plays on from there.
  const stripRef = useRef<View>(null);
  const stripLeft = useRef(0);
  const headScrub = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => {
      scrubbing.current = true;
      stopPlayer();
      const pageX = e.nativeEvent.pageX;
      const seekAt = (x: number) => {
        const [a, b] = rangeRef.current;
        const at = Math.max(a, Math.min(b, (x - stripLeft.current) * secondsPerPx));
        head.value = at;
        player.current?.seek(at);
      };
      stripRef.current?.measureInWindow((x) => { stripLeft.current = x; seekAt(pageX); });
    },
    onPanResponderMove: (e) => {
      const [a, b] = rangeRef.current;
      const at = Math.max(a, Math.min(b, (e.nativeEvent.pageX - stripLeft.current) * secondsPerPx));
      head.value = at;
      player.current?.seek(at);
    },
    onPanResponderRelease: () => {
      startPlayer();
      setTimeout(() => { scrubbing.current = false; }, 250);
    },
    onPanResponderTerminate: () => { scrubbing.current = false; },
  }), [duration, stripWidth]); // eslint-disable-line react-hooks/exhaustive-deps
  const startHandle = useMemo(() => makeHandle(0), [duration, stripWidth]); // eslint-disable-line react-hooks/exhaustive-deps
  const endHandle = useMemo(() => makeHandle(1), [duration, stripWidth]); // eslint-disable-line react-hooks/exhaustive-deps
  const px = (s: number) => (duration ? (s / duration) * stripWidth : 0);
  // Choosing a cover is a scrub, the way TikTok does it: drag along the
  // strip and the frozen picture follows your finger; let go and that frame
  // is the cover. A tap anywhere on the strip jumps there too.
  const [coverAt, setCoverAt] = useState(initial?.coverAt ?? 0);
  const coverAtRef = useRef(initial?.coverAt ?? 0);
  // Once a cover is picked in this session, the one brought back from an earlier pass no longer holds.
  const coverRepicked = useRef(false);
  const settleCover = (time: number) => {
    if (!media.uri) return;
    coverRepicked.current = true;
    framesAt(media.uri, [time], 1080).then((got) => { if (got[0]) setCover(got[0].uri); });
  };
  const scrubTo = (time: number) => {
    const [a, b] = rangeRef.current;
    const at = Math.max(a, Math.min(b, time));
    coverAtRef.current = at;
    setCoverAt(at);
    setFrozenAt(at);
    head.value = at;
    player.current?.seek(at);
  };
  // Measured from the window like the trim scrub, so a browser's per-frame
  // positions never make the window jump from cell to cell.
  const coverScrub = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => {
      scrubbing.current = true;
      stopPlayer();
      const pageX = e.nativeEvent.pageX;
      stripRef.current?.measureInWindow((x) => { stripLeft.current = x; scrubTo((pageX - x) * secondsPerPx); });
    },
    onPanResponderMove: (e) => scrubTo((e.nativeEvent.pageX - stripLeft.current) * secondsPerPx),
    onPanResponderRelease: () => { settleCover(coverAtRef.current); setTimeout(() => { scrubbing.current = false; }, 250); },
    onPanResponderTerminate: () => { settleCover(coverAtRef.current); scrubbing.current = false; },
  }), [secondsPerPx]); // eslint-disable-line react-hooks/exhaustive-deps
  const lo = range[0];
  const hi = range[1];
  const headStyle = useAnimatedStyle(() => {
    const at = Math.max(lo, Math.min(hi, head.value));
    return { transform: [{ translateX: duration ? (at / duration) * stripWidth : 0 }] };
  }, [lo, hi, duration, stripWidth]);

  /* ----------------------------------- sound ---------------------------------- */
  // One switch for the disc on the picture, the glyph in the Sound row and
  // the M key: off remembers the level, on brings it back.
  const toggleSound = () => {
    if (muted) { setMuted(false); setVolume(lastLevel.current || 1); }
    else { lastLevel.current = volume; setMuted(true); }
  };
  // The level line: a finger anywhere along it sets the level, with the ends
  // snapping to nothing and to full. Nothing at all is `muted`.
  const trackRef = useRef<View>(null);
  const trackGeom = useRef({ left: 0, w: 1 });
  const applyLevel = (f: number) => {
    if (f <= 0) { setMuted(true); return; }
    const level = Math.round(clamp(f, 0, 1) * 100) / 100;
    lastLevel.current = level;
    setMuted(false);
    setVolume(level);
  };
  const levelAt = (pageX: number) => {
    let f = clamp((pageX - trackGeom.current.left) / Math.max(1, trackGeom.current.w), 0, 1);
    if (f < 0.03) f = 0; else if (f > 0.97) f = 1;
    applyLevel(f);
  };
  // A screen reader's step along the level: a tenth at a time, down to off.
  const stepLevel = (dir: 1 | -1) => applyLevel(Math.round(((muted ? 0 : volume) + dir * 0.1) * 10) / 10);
  const levelDrag = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => {
      const pageX = e.nativeEvent.pageX;
      trackRef.current?.measureInWindow((x, _y, w) => { trackGeom.current = { left: x, w }; levelAt(pageX); });
    },
    onPanResponderMove: (e) => levelAt(e.nativeEvent.pageX),
  }), []); // eslint-disable-line react-hooks/exhaustive-deps
  const level = muted ? 0 : volume;
  const levelText = muted ? 'Off' : `${Math.round(volume * 100)}%`;

  /* ----------------------------------- crop ----------------------------------- */
  // Zoom in and slide the picture inside the frame, for cutting black edges
  // out of a screen recording. The stage shows exactly what the feed will.
  const [crop, setCrop] = useState<MediaCrop>(initial?.crop ?? { scale: 1, x: 0, y: 0 });
  const cropRef = useRef(crop);
  cropRef.current = crop;
  const dragStart = useRef<MediaCrop>(crop);
  // Cropping a clip works like cropping a photo: the frame stays put in the
  // post's shape and the video moves under it in any direction; two fingers
  // (or a trackpad) zoom the video in; pulling a corner in crops closer. The
  // parts outside the frame show dimmed. The crop is kept the way the feed
  // plays it: a zoom, and a shift of the video's middle in fractions of the frame.
  const [vidSize, setVidSize] = useState<{ w: number; h: number } | null>(null);
  const onVidSize = useCallback((w: number, h: number) => setVidSize({ w, h }), []);
  const vw = vidSize?.w ?? box.w;
  const vh = vidSize?.h ?? box.h;
  const vidRef = useRef({ vw, vh });
  vidRef.current = { vw, vh };
  // The video as big as it is drawn at a zoom: filling the frame (no black bars), times the zoom.
  const vidDrawn = (z: number, b: { w: number; h: number }, v: { vw: number; vh: number }) => {
    const k0 = Math.max(b.w / Math.max(1, v.vw), b.h / Math.max(1, v.vh));
    return { w: v.vw * k0 * z, h: v.vh * k0 * z };
  };
  // A shift can go as far as the video reaches past the frame, and no further.
  const clampVid = (c: MediaCrop): MediaCrop => {
    const b = boxRef.current;
    const d = vidDrawn(c.scale, b, vidRef.current);
    const rx = Math.max(0, (d.w - b.w) / 2 / Math.max(1, b.w));
    const ry = Math.max(0, (d.h - b.h) / 2 / Math.max(1, b.h));
    return { scale: c.scale, x: Math.max(-rx, Math.min(rx, c.x)), y: Math.max(-ry, Math.min(ry, c.y)) };
  };
  const clampVidRef = useRef(clampVid);
  clampVidRef.current = clampVid;
  // Only once the video's own size is known: before that the frame stands in
  // for it, and a crop brought back from an earlier pass would be clamped to
  // the wrong room. Every gesture still clamps as it goes.
  useEffect(() => { if (isVideo && vidSize) setCrop((c) => clampVidRef.current(c)); }, [box.w, box.h, vw, vh, isVideo, vidSize]);
  const VIDEO_ZOOM_MAX = 4;
  // The zoom level shows for a moment while it changes, then fades.
  const [zoomShown, setZoomShown] = useState(false);
  const zoomTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showZoom = () => {
    setZoomShown(true);
    if (zoomTimer.current) clearTimeout(zoomTimer.current);
    zoomTimer.current = setTimeout(() => setZoomShown(false), 900);
  };
  const zoomVideoTo = (z: number) => {
    setCrop((c) => clampVidRef.current({ ...c, scale: Math.max(1, Math.min(VIDEO_ZOOM_MAX, z)) }));
    showZoom();
  };
  const zoomVideoRef = useRef(zoomVideoTo);
  zoomVideoRef.current = zoomVideoTo;
  const vZoomStart = useRef(1);
  // A corner pulled in shrinks the frame around its middle (vCropS, 1 = full);
  // let go, it grows back while the video zooms in to match.
  const [vCropS, setVCropS] = useState(1);
  const vCropSRef = useRef(1);
  vCropSRef.current = vCropS;
  const vCropSStart = useRef(1);
  const vDragCorner = useRef<readonly [number, number] | null>(null);
  const [vDragging, setVDragging] = useState(false);
  const vFillFromCorner = (s0: number) => {
    if (s0 > 0.995) { setVCropS(1); return; }
    const c0 = cropRef.current;
    const z1 = Math.min(VIDEO_ZOOM_MAX, c0.scale / s0);
    const f = z1 / c0.scale;
    const c1 = clampVidRef.current({ scale: z1, x: c0.x * f, y: c0.y * f });
    // Less motion asked for: straight to where it ends up.
    if (reducedRef.current) { setCrop(c1); setVCropS(1); return; }
    const t0 = Date.now();
    const step = () => {
      const t = Math.min(1, (Date.now() - t0) / 260);
      const e = 1 - Math.pow(1 - t, 3);
      setCrop({ scale: c0.scale + (c1.scale - c0.scale) * e, x: c0.x + (c1.x - c0.x) * e, y: c0.y + (c1.y - c0.y) * e });
      setVCropS(s0 + (1 - s0) * e);
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  const vFillRef = useRef(vFillFromCorner);
  vFillRef.current = vFillFromCorner;
  // Which corner of the frame a point on the stage is on, if any.
  const cornerAt = (x: number, y: number) => {
    const b = boxRef.current;
    const o = boxOffRef.current;
    const sz = vCropSRef.current;
    const bw = b.w * sz;
    const bh = b.h * sz;
    const l = o.x + (b.w - bw) / 2;
    const t = o.y + (b.h - bh) / 2;
    const spots = [[l, t, -1, -1], [l + bw, t, 1, -1], [l, t + bh, -1, 1], [l + bw, t + bh, 1, 1]] as const;
    const hit = spots.find(([sx, sy]) => Math.hypot(x - sx, y - sy) < 32);
    return hit ? [hit[2], hit[3]] as const : null;
  };
  // Whether the drag got going: a tap that moved a few pixels is a drag, not a pause.
  const panMoved = useRef(false);
  const videoCropGestures = useMemo(() => Gesture.Simultaneous(
    Gesture.Pan().runOnJS(true).minDistance(1)
      .onBegin((e) => { panMoved.current = false; vDragCorner.current = cornerAt(e.x, e.y); })
      .onStart(() => {
        panMoved.current = true;
        if (vDragCorner.current) vCropSStart.current = vCropSRef.current;
        else dragStart.current = cropRef.current;
        setVDragging(true);
      })
      .onUpdate((e) => {
        const corner = vDragCorner.current;
        const b = boxRef.current;
        if (corner) {
          const [sx, sy] = corner;
          const inward = Math.max((-sx * e.translationX * 2) / Math.max(1, b.w), (-sy * e.translationY * 2) / Math.max(1, b.h));
          setVCropS(Math.max(0.3, Math.min(1, vCropSStart.current - inward)));
        } else {
          const st = dragStart.current;
          setCrop(clampVidRef.current({ scale: st.scale, x: st.x + e.translationX / Math.max(1, b.w), y: st.y + e.translationY / Math.max(1, b.h) }));
        }
      })
      .onFinalize(() => {
        setVDragging(false);
        if (vDragCorner.current) vFillRef.current(vCropSRef.current);
        vDragCorner.current = null;
      }),
    Gesture.Pinch().runOnJS(true)
      .onStart(() => { vZoomStart.current = cropRef.current.scale; })
      .onUpdate((e) => zoomVideoRef.current(vZoomStart.current * e.scale)),
    // A clean tap on the picture (not on a corner) pauses and plays, as it does in the other tools.
    Gesture.Tap().maxDistance(6).runOnJS(true)
      .onEnd((e, success) => { if (success && !panMoved.current && !cornerAt(e.x, e.y)) toggleRef.current(); }),
  ), []); // eslint-disable-line react-hooks/exhaustive-deps
  // Instagram's grid: on for a moment as Crop opens, then only while something is being moved.
  const grid = useSharedValue(0);
  const gridStyle = useAnimatedStyle(() => ({ opacity: grid.value }));
  const wasDragging = useRef(false);
  useEffect(() => {
    if (tool !== 'crop') { grid.value = 0; wasDragging.current = false; return; }
    if (vDragging) { grid.value = 1; wasDragging.current = true; return; }
    if (reducedRef.current) { grid.value = 0; return; }
    const hold = wasDragging.current ? 0 : 600;
    wasDragging.current = false;
    grid.value = 1;
    const t = setTimeout(() => { grid.value = withTiming(0, { duration: 200, reduceMotion: ReduceMotion.System }); }, hold);
    return () => clearTimeout(t);
  }, [tool, vDragging, grid]);
  // A trackpad in the browser: two fingers sliding move the video; a pinch
  // (a wheel with the control key in Chrome, Edge, Firefox, or Safari's own
  // gesture events) zooms it.
  const stageEl = useRef<View>(null);
  useEffect(() => {
    if (Platform.OS !== 'web' || tool !== 'crop') return;
    const node = stageEl.current as unknown as HTMLElement | null;
    if (!node || typeof node.addEventListener !== 'function') return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey) { zoomVideoRef.current(cropRef.current.scale * Math.exp(-e.deltaY / 100)); return; }
      // Two fingers sliding on a trackpad move the video with them, any direction.
      const b = boxRef.current;
      setCrop((c) => clampVidRef.current({ ...c, x: c.x - e.deltaX / Math.max(1, b.w), y: c.y - e.deltaY / Math.max(1, b.h) }));
    };
    let from = 1;
    const onGestureStart = (e: Event) => { e.preventDefault(); from = cropRef.current.scale; };
    const onGestureChange = (e: Event) => { e.preventDefault(); zoomVideoRef.current(from * ((e as unknown as { scale?: number }).scale ?? 1)); };
    node.addEventListener('wheel', onWheel, { passive: false });
    node.addEventListener('gesturestart', onGestureStart);
    node.addEventListener('gesturechange', onGestureChange);
    return () => {
      node.removeEventListener('wheel', onWheel);
      node.removeEventListener('gesturestart', onGestureStart);
      node.removeEventListener('gesturechange', onGestureChange);
    };
  }, [tool]);
  // In Crop the video is drawn whole, at the crop's zoom and shift, spilling past the frame.
  const drawn = vidDrawn(crop.scale, box, { vw, vh });
  const drawnStyle = { position: 'absolute' as const, width: drawn.w, height: drawn.h, left: (box.w - drawn.w) / 2 + crop.x * box.w, top: (box.h - drawn.h) / 2 + crop.y * box.h };
  const cropChanged = crop.scale > 1.001 || Math.abs(crop.x) > 0.001 || Math.abs(crop.y) > 0.001;

  /* ----------------------------------- photo ---------------------------------- */
  // Nothing is cut until Next: the stage shows the turn, the shape, the zoom
  // and where you dragged it, all live, and the photo is cut once at the end.
  const [turns, setTurns] = useState(0);
  // The picture swings to each quarter turn rather than snapping — unless less motion is asked for.
  const spin = useRef(new RNAnimated.Value(0)).current;
  useEffect(() => {
    if (reduced) { spin.setValue(turns * 90); return; }
    RNAnimated.spring(spin, { toValue: turns * 90, useNativeDriver: true, damping: 16, stiffness: 180 }).start();
  }, [turns, spin, reduced]);
  // How the post is framed in the feed: Portrait (the post's own portrait
  // shape) or Landscape (16:9). Picked from the picture's own shape, or
  // brought back from an earlier pass, and changeable here. A photo is cropped to exactly that shape.
  const [frame, setFrame] = useState<'portrait' | 'landscape'>(initial?.orientation ?? media.orientation ?? 'portrait');
  const [frameTouched, setFrameTouched] = useState(!!initial?.orientation);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [nat, setNat] = useState<{ width: number; height: number } | null>(null);
  useEffect(() => { if (!isVideo && media.uri) measureForEdit(media.uri).then(setNat).catch(() => setNat(null)); }, [isVideo, media.uri]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // The turned picture's size, the window's shape, and how it all lays out on the stage.
  const odd = ((turns % 4) + 4) % 4 % 2 === 1;
  const RW = nat ? (odd ? nat.height : nat.width) : 1;
  const RH = nat ? (odd ? nat.width : nat.height) : 1;
  const photoShape: 'portrait' | 'landscape' = RW / RH > 1 ? 'landscape' : 'portrait';
  const cropRatio = frame === 'landscape' ? 16 / 9 : portraitRatio;
  // A post's portrait video frame: its own shape, as large as the stage allows.
  const postPortrait = isVideo && Math.abs(portraitRatio - 9 / 16) > 0.01;
  const postBoxW = stageSize.w && stageSize.h ? Math.min(stageSize.w, stageSize.h * portraitRatio) : 0;
  const postBox = { width: postBoxW, height: postBoxW / portraitRatio, overflow: 'hidden' as const };
  // The room the photo has: the whole stage less a small margin all round.
  const PHOTO_MARGIN = 14;
  const room = { w: Math.max(1, box.w - PHOTO_MARGIN * 2), h: Math.max(1, box.h - PHOTO_MARGIN * 2) };
  const win = room.w / room.h > cropRatio ? { w: room.h * cropRatio, h: room.h } : { w: room.w, h: room.w / cropRatio };
  const winRef = useRef(win);
  winRef.current = win;
  // Pulling a corner in shrinks the crop box around its middle, keeping its
  // shape; letting go, the box grows back to full size and the photo zooms
  // in to match, the way iPhone Photos does it. cropS is the box's size, 1 = full.
  const [cropS, setCropS] = useState(1);
  const cropSRef = useRef(1);
  cropSRef.current = cropS;
  const cropSStart = useRef(1);
  const fillFromCorner = useRef<(s: number) => void>(() => undefined);
  // Which corner a drag started on, if any: set the moment a finger lands.
  const dragCorner = useRef<readonly [number, number] | null>(null);
  const k = Math.max(win.w / RW, win.h / RH) * zoom;
  const shown = { rw: RW * k, rh: RH * k, uw: (nat?.width ?? 1) * k, uh: (nat?.height ?? 1) * k };
  const clampPan = (p: { x: number; y: number }, z = zoom) => {
    const kk = Math.max(win.w / RW, win.h / RH) * z;
    const roomX = Math.max(0, (RW * kk - win.w) / 2);
    const roomY = Math.max(0, (RH * kk - win.h) / 2);
    return { x: Math.max(-roomX, Math.min(roomX, p.x)), y: Math.max(-roomY, Math.min(roomY, p.y)) };
  };
  const panRef = useRef(pan);
  panRef.current = pan;
  const panStart = useRef(pan);
  const clampRef = useRef(clampPan);
  clampRef.current = clampPan;
  // One finger drags the photo; two fingers pinch to zoom (and drag while
  // they pinch). On a computer a trackpad pinch zooms too (below).
  const PHOTO_ZOOM_MAX = 4;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const zoomStart = useRef(1);
  const zoomPhotoTo = (z: number) => {
    const next = Math.max(1, Math.min(PHOTO_ZOOM_MAX, z));
    setZoom(next);
    setPan((p) => clampRef.current(p, next));
    showZoom();
  };
  const zoomPhotoRef = useRef(zoomPhotoTo);
  zoomPhotoRef.current = zoomPhotoTo;
  // A corner let go: the box grows back to full size while the photo zooms in
  // by the same amount about the middle, so what was inside the box fills it.
  fillFromCorner.current = (s0: number) => {
    if (s0 > 0.995) { setCropS(1); return; }
    const z0 = zoomRef.current;
    const p0 = panRef.current;
    const z1 = Math.min(PHOTO_ZOOM_MAX, z0 / s0);
    const f = z1 / z0;
    const p1 = clampRef.current({ x: p0.x * f, y: p0.y * f }, z1);
    if (reducedRef.current) { setZoom(z1); setPan(p1); setCropS(1); return; }
    const t0 = Date.now();
    const step = () => {
      const t = Math.min(1, (Date.now() - t0) / 260);
      const e = 1 - Math.pow(1 - t, 3);
      setZoom(z0 + (z1 - z0) * e);
      setPan({ x: p0.x + (p1.x - p0.x) * e, y: p0.y + (p1.y - p0.y) * e });
      setCropS(s0 + (1 - s0) * e);
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  // One drag for the whole stage. Landing on a corner of the crop box pulls
  // that corner (the box shrinks around its middle, keeping its shape);
  // landing anywhere else moves the photo. Two fingers pinch to zoom.
  const photoGestures = useMemo(() => Gesture.Simultaneous(
    Gesture.Pan().runOnJS(true).minDistance(1)
      .onBegin((e) => {
        const w = winRef.current;
        const b = boxRef.current;
        const sz = cropSRef.current;
        const bw = w.w * sz;
        const bh = w.h * sz;
        const l = (b.w - bw) / 2;
        const t = (b.h - bh) / 2;
        const spots = [[l, t, -1, -1], [l + bw, t, 1, -1], [l, t + bh, -1, 1], [l + bw, t + bh, 1, 1]] as const;
        const hit = spots.find(([x, y]) => Math.hypot(e.x - x, e.y - y) < 32);
        dragCorner.current = hit ? [hit[2], hit[3]] as const : null;
      })
      .onStart(() => {
        if (dragCorner.current) cropSStart.current = cropSRef.current;
        else panStart.current = panRef.current;
        setDragging(true);
      })
      .onUpdate((e) => {
        const corner = dragCorner.current;
        if (corner) {
          const [sx, sy] = corner;
          const w = winRef.current;
          const inward = Math.max((-sx * e.translationX * 2) / Math.max(1, w.w), (-sy * e.translationY * 2) / Math.max(1, w.h));
          setCropS(Math.max(0.3, Math.min(1, cropSStart.current - inward)));
        } else {
          setPan(clampRef.current({ x: panStart.current.x + e.translationX, y: panStart.current.y + e.translationY }, zoomRef.current));
        }
      })
      .onFinalize(() => {
        setDragging(false);
        if (dragCorner.current) fillFromCorner.current(cropSRef.current);
        dragCorner.current = null;
      }),
    Gesture.Pinch().runOnJS(true)
      .onStart(() => { zoomStart.current = zoomRef.current; })
      .onUpdate((e) => zoomPhotoRef.current(zoomStart.current * e.scale)),
  ), []); // eslint-disable-line react-hooks/exhaustive-deps
  // A trackpad in the browser: two fingers sliding move the photo; a pinch
  // (a wheel with the control key in Chrome, Edge, Firefox, or Safari's own
  // gesture events) zooms it.
  const stageRoot = useRef<View>(null);
  useEffect(() => {
    if (Platform.OS !== 'web' || isVideo) return;
    const node = stageRoot.current as unknown as HTMLElement | null;
    if (!node || typeof node.addEventListener !== 'function') return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey) { zoomPhotoRef.current(zoomRef.current * Math.exp(-e.deltaY / 100)); return; }
      // Two fingers sliding on a trackpad move the photo with them, any direction.
      setPan((p) => clampRef.current({ x: p.x - e.deltaX, y: p.y - e.deltaY }, zoomRef.current));
    };
    let from = 1;
    const onGestureStart = (e: Event) => { e.preventDefault(); from = zoomRef.current; };
    const onGestureChange = (e: Event) => { e.preventDefault(); zoomPhotoRef.current(from * ((e as unknown as { scale?: number }).scale ?? 1)); };
    node.addEventListener('wheel', onWheel, { passive: false });
    node.addEventListener('gesturestart', onGestureStart);
    node.addEventListener('gesturechange', onGestureChange);
    return () => {
      node.removeEventListener('wheel', onWheel);
      node.removeEventListener('gesturestart', onGestureStart);
      node.removeEventListener('gesturechange', onGestureChange);
    };
  }, [isVideo, nat]);
  // Cut on Next whenever anything was changed, or the photo is not already the post's shape.
  const photoEdited = turns !== 0 || zoom > 1.001 || pan.x !== 0 || pan.y !== 0;
  const photoTouched = photoEdited || Math.abs(RW / RH - cropRatio) > 0.01;
  useEffect(() => { setPan((p) => clampRef.current(p)); }, [frame, turns, box.w, box.h]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!frameTouched) setFrame(isVideo ? media.orientation ?? 'portrait' : nat ? photoShape : media.orientation ?? 'portrait'); }, [isVideo, media.orientation, photoShape, frameTouched, nat]);

  const done = async () => {
    if (isVideo) {
      const trimmed = duration && (range[0] > 0.05 || range[1] < duration - 0.05);
      let poster = cover ?? media.thumbnailUrl;
      if (!poster && media.uri) poster = (await framesAt(media.uri, [range[0]], 1080))[0]?.uri;
      onDone({
        media: { ...media, thumbnailUrl: poster },
        orientation: frame,
        trimStart: trimmed ? Number(range[0].toFixed(2)) : undefined,
        trimEnd: trimmed ? Number(range[1].toFixed(2)) : undefined,
        muted: muted || undefined,
        // A level of nothing leaves as `muted`, never as a volume of 0.
        volume: !muted && volume > 0 && volume < 1 ? Number(volume.toFixed(2)) : undefined,
        speed: speed !== 1 ? speed : undefined,
        crop: cropChanged ? { scale: Number(crop.scale.toFixed(3)), x: Number(crop.x.toFixed(4)), y: Number(crop.y.toFixed(4)) } : undefined,
        coverAt: cover !== media.thumbnailUrl ? coverAt : undefined,
      });
    } else {
      if (!photoTouched || !nat || !media.uri) {
        onDone({ media: { ...media, uri: media.uri, thumbnailUrl: media.uri, orientation: media.orientation ?? 'portrait' }, orientation: frame });
        return;
      }
      // The window, in the turned picture's own pixels.
      const cw = win.w / k;
      const ch = win.h / k;
      const cx = RW / 2 - pan.x / k;
      const cy = RH / 2 - pan.y / k;
      const rect = { originX: Math.min(RW - cw, Math.max(0, cx - cw / 2)), originY: Math.min(RH - ch, Math.max(0, cy - ch / 2)), width: Math.min(cw, RW), height: Math.min(ch, RH) };
      setBusy(true);
      try {
        const out = await editPhotoRect(media.uri, turns, rect);
        onDone({ media: { ...media, uri: out.uri, thumbnailUrl: out.uri, orientation: out.width > out.height ? 'landscape' : 'portrait' }, orientation: frame });
      } catch {
        setError('Could not cut that photo.');
        setBusy(false);
      }
    }
  };

  /* --------------------------------- keyboard --------------------------------- */
  // On a computer: space plays and pauses, the arrows step a tenth of a
  // second (a whole one with shift), I and O set the kept part's ends where
  // the line is, M is the sound, Enter is Next and Escape is Back.
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nudge = (delta: number) => {
    if (!durationRef.current) return;
    const [a, b] = rangeRef.current;
    const at = clamp(head.value + delta, a, b);
    if (tool === 'cover') {
      scrubTo(at);
      // The cover is cut once the keys stop, not on every press.
      if (settleTimer.current) clearTimeout(settleTimer.current);
      settleTimer.current = setTimeout(() => settleCover(coverAtRef.current), 250);
      return;
    }
    head.value = at;
    setNow(at);
    player.current?.seek(at);
  };
  const setIn = () => { if (!durationRef.current) return; const [, b] = rangeRef.current; setRange([clamp(head.value, 0, b - MIN_CLIP_SECONDS), b]); };
  const setOut = () => { if (!durationRef.current) return; const [a] = rangeRef.current; setRange([a, clamp(head.value, a + MIN_CLIP_SECONDS, durationRef.current)]); };
  // A screen reader's way to move a handle: half a second at a time, inside
  // the same limits a drag has, and the picture jumps to the handle as it does.
  const stepHandle = (side: 0 | 1, delta: number) => {
    const d = durationRef.current;
    if (!d) return;
    const [a, b] = rangeRef.current;
    const next: [number, number] = side === 0 ? [clamp(a + delta, 0, b - MIN_CLIP_SECONDS), b] : [a, clamp(b + delta, a + MIN_CLIP_SECONDS, d)];
    setRange(next);
    const at = side === 0 ? next[0] : next[1];
    head.value = at;
    setNow(at);
    player.current?.seek(at);
  };
  // And along the cover strip: one cell of frames at a time, cut as it lands.
  const stepCover = (dir: 1 | -1) => {
    if (!durationRef.current) return;
    scrubTo(coverAtRef.current + (dir * durationRef.current) / cellsRef.current);
    settleCover(coverAtRef.current);
  };
  const stepActions = [{ name: 'increment' }, { name: 'decrement' }];
  const onStep = (step: (dir: 1 | -1) => void) => (e: { nativeEvent: { actionName: string } }) => {
    if (e.nativeEvent.actionName === 'increment') step(1);
    else if (e.nativeEvent.actionName === 'decrement') step(-1);
  };
  const keys = useRef({ togglePause, nudge, setIn, setOut, toggleSound, next: () => undefined as void, back: onBack });
  keys.current = { togglePause, nudge, setIn, setOut, toggleSound, next: () => { if (!busy) void done(); }, back: onBack };
  useEffect(() => {
    if (Platform.OS !== 'web' || !isVideo || typeof window === 'undefined') return;
    const isSpace = (e: KeyboardEvent) => e.code === 'Space' || e.key === ' ';
    const typing = (target: EventTarget | null) => {
      const el = target as HTMLElement | null;
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
    };
    // Caught before anything else on the page, so the space bar never also
    // presses whichever button was clicked last (the video itself, after a
    // click on it, which would pause and play again at once), or scrolls.
    let spaceAt = 0;
    const down = (e: KeyboardEvent) => {
      if (typing(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = keys.current;
      // A handled key also drops the browser's focus from whatever was clicked last, so no focus ring appears on it.
      const take = () => {
        e.preventDefault();
        e.stopPropagation();
        const focused = document.activeElement as HTMLElement | null;
        if (focused && focused !== document.body) focused.blur();
      };
      if (isSpace(e)) {
        take();
        spaceAt = Date.now();
        if (!e.repeat) k.togglePause();
        return;
      }
      switch (e.key) {
        case 'ArrowLeft': take(); k.nudge(e.shiftKey ? -1 : -0.1); return;
        case 'ArrowRight': take(); k.nudge(e.shiftKey ? 1 : 0.1); return;
        case 'i': case 'I': take(); k.setIn(); return;
        case 'o': case 'O': take(); k.setOut(); return;
        case 'm': case 'M': take(); if (!e.repeat) k.toggleSound(); return;
        case 'Enter': take(); if (!e.repeat) k.next(); return;
        case 'Escape': take(); if (!e.repeat) k.back(); return;
        default: return;
      }
    };
    const up = (e: KeyboardEvent) => {
      if (!isSpace(e) || typing(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
    };
    // A click the keyboard made (it has no mouse position count) just after a space is the same press again.
    const click = (e: MouseEvent) => {
      if (e.detail === 0 && Date.now() - spaceAt < 600) { e.preventDefault(); e.stopPropagation(); }
    };
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up, true);
    window.addEventListener('click', click, true);
    return () => {
      window.removeEventListener('keydown', down, true);
      window.removeEventListener('keyup', up, true);
      window.removeEventListener('click', click, true);
    };
  }, [isVideo]);

  /* ----------------------------------- rail ----------------------------------- */
  // One underline for the whole rail, slid to whichever word is on. The word
  // is measured against the rail whenever the tool changes or the rail is
  // laid out again — a browser only re-reports a word when its own size
  // changes, not when the row around it does.
  const railX = useSharedValue(0);
  const railOn = useSharedValue(0);
  const railRef = useRef<View>(null);
  const wordRefs = useRef<Partial<Record<Tool, View | null>>>({});
  const placeLine = (slide: boolean) => {
    const rail = railRef.current;
    const word = wordRefs.current[tool];
    if (!rail || !word) return;
    word.measureLayout(rail, (x, _y, w) => {
      const target = x + w / 2 - 10;
      // First placement, or the row re-laid out under the line: straight there.
      if (!slide || railOn.value === 0) { railX.value = target; railOn.value = 1; return; }
      railX.value = withTiming(target, { duration: 220, easing: Easing.out(Easing.exp), reduceMotion: ReduceMotion.System });
    }, () => undefined);
  };
  const placeRef = useRef(placeLine);
  placeRef.current = placeLine;
  useEffect(() => { placeRef.current(true); }, [tool]);
  const railLineStyle = useAnimatedStyle(() => ({ opacity: railOn.value, transform: [{ translateX: railX.value }] }));

  /* ---------------------------------- pieces ---------------------------------- */
  const pressable = (base: object) => ({ pressed }: { pressed: boolean }) => [base, pressed && styles.pressed];
  // Portrait · Landscape: the feed's frame shape, in the one tool it belongs to.
  const frameWords = (
    <View style={styles.words}>
      {(['portrait', 'landscape'] as const).map((o) => (
        <Pressable key={o} accessibilityRole="radio" accessibilityLabel={o === 'portrait' ? 'Portrait' : 'Landscape'} accessibilityState={{ checked: frame === o }} onPress={() => { setFrameTouched(true); setFrame(o); }} style={pressable(styles.word)}>
          <Text style={[styles.wordText, frame === o && styles.wordTextOn]}>{o === 'portrait' ? 'Portrait' : 'Landscape'}</Text>
          {frame === o ? <View style={styles.wordLine} /> : null}
        </Pressable>
      ))}
    </View>
  );
  const frameImages = frames.map((f) => <Animated.Image key={f.time} entering={frameIn} accessibilityIgnoresInvertColors source={{ uri: f.uri }} style={styles.frame} resizeMode="cover" />);
  const reading = !frames.length ? <View pointerEvents="none" style={styles.reading}><Text style={styles.readingText}>Reading frames…</Text></View> : null;
  const keptW = Math.max(0, px(range[1]) - px(range[0]));
  const dims = duration ? (
    <>
      <View pointerEvents="none" style={[styles.dim, { left: 0, width: px(range[0]) }]} />
      <View pointerEvents="none" style={[styles.dim, { left: px(range[1]), width: Math.max(0, stripWidth - px(range[1])) }]} />
    </>
  ) : null;
  const cursorW = stripWidth / (frames.length || cells);
  // One glyph for the sound, wherever it shows: the disc on the picture and the Sound row agree.
  const soundGlyph = muted || volume === 0 ? 'volume-mute' : volume < 0.5 ? 'volume-low' : 'volume-high';
  let zone: React.ReactNode;
  if (!isVideo) {
    zone = (
      <View style={styles.zoneRow}>
        {frameWords}
        <Pressable accessibilityRole="button" accessibilityLabel="Rotate" onPress={() => setTurns((t) => t + 1)} style={pressable(styles.action)}><Text style={styles.actionText}>Rotate</Text></Pressable>
      </View>
    );
  } else if (tool === 'trim') {
    zone = (
      <View ref={stripRef} style={styles.strip}>
        <View style={styles.frames} {...(duration ? headScrub.panHandlers : {})}>
          {frameImages}
          {reading}
        </View>
        {duration ? (
          <>
            {dims}
            <View pointerEvents="none" style={[styles.bracket, { top: 0, left: px(range[0]), width: keptW }]} />
            <View pointerEvents="none" style={[styles.bracket, { bottom: 0, left: px(range[0]), width: keptW }]} />
            <Animated.View pointerEvents="none" style={[styles.playhead, headStyle]} />
            <View {...startHandle.panHandlers} hitSlop={HANDLE_SLOP} accessibilityRole="adjustable" accessibilityLabel="Start of clip" accessibilityValue={{ text: clockRound(range[0]) }} accessibilityActions={stepActions} onAccessibilityAction={onStep((dir) => stepHandle(0, dir * 0.5))} style={[styles.handle, styles.handleLeft, { left: px(range[0]) - HANDLE }]}><View style={styles.grip} /></View>
            <View {...endHandle.panHandlers} hitSlop={HANDLE_SLOP} accessibilityRole="adjustable" accessibilityLabel="End of clip" accessibilityValue={{ text: clockRound(range[1]) }} accessibilityActions={stepActions} onAccessibilityAction={onStep((dir) => stepHandle(1, dir * 0.5))} style={[styles.handle, styles.handleRight, { left: px(range[1]) }]}><View style={styles.grip} /></View>
            {held !== null ? (
              <View pointerEvents="none" onLayout={(e) => setChipW(e.nativeEvent.layout.width)} style={[styles.chip, { left: clamp(px(range[held]) - chipW / 2, 0, Math.max(0, stripWidth - chipW)) }]}>
                <Text style={styles.chipText}>{clockTenths(range[held])}</Text>
              </View>
            ) : null}
          </>
        ) : null}
      </View>
    );
  } else if (tool === 'cover') {
    zone = (
      <View ref={stripRef} style={styles.strip} {...(duration ? coverScrub.panHandlers : {})} accessibilityRole="adjustable" accessibilityLabel="Cover frame" accessibilityValue={{ text: clock(coverAt) }} accessibilityActions={stepActions} onAccessibilityAction={onStep(stepCover)}>
        <View style={styles.frames}>
          {frameImages}
          {reading}
        </View>
        {dims}
        {duration ? <View pointerEvents="none" style={[styles.coverWindow, { width: cursorW, left: clamp(px(coverAt) - cursorW / 2, 0, Math.max(0, stripWidth - cursorW)) }]} /> : null}
      </View>
    );
  } else if (tool === 'crop') {
    zone = (
      <View style={styles.zoneRow}>
        {frameWords}
        {cropChanged || vCropS < 1 ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Reset crop" onPress={() => { setCrop({ scale: 1, x: 0, y: 0 }); setVCropS(1); }} style={pressable(styles.action)}><Text style={styles.actionText}>Reset</Text></Pressable>
        ) : null}
      </View>
    );
  } else if (tool === 'speed') {
    zone = (
      <View style={[styles.speedRow, roomy && styles.speedRowDesktop]}>
        {SPEEDS.map((v) => (
          <Pressable key={v} accessibilityRole="radio" accessibilityLabel={`${v}×`} accessibilityState={{ checked: speed === v }} onPress={() => setSpeed(v)} style={pressable(styles.speedHit)}>
            <View style={[styles.speedPill, speed === v && styles.speedPillOn]}><Text style={[styles.speedText, speed === v && styles.speedTextOn]}>{v}×</Text></View>
          </Pressable>
        ))}
      </View>
    );
  } else {
    zone = (
      <View style={styles.soundRow}>
        <Pressable accessibilityRole="button" accessibilityLabel={muted ? 'Sound off' : 'Sound on'} onPress={toggleSound} style={styles.soundGlyph}>
          <Ionicons name={soundGlyph} size={22} color="white" />
        </Pressable>
        <View ref={trackRef} accessibilityRole="adjustable" accessibilityLabel="Sound level" accessibilityValue={{ text: levelText }} accessibilityActions={stepActions} onAccessibilityAction={onStep(stepLevel)} style={styles.levelHit} {...levelDrag.panHandlers}>
          <View style={styles.levelTrack}><View style={[styles.levelFill, { width: `${level * 100}%` }]} /></View>
          <View pointerEvents="none" style={[styles.levelKnob, { left: `${level * 100}%` }]} />
        </View>
        <Text style={styles.levelText}>{levelText}</Text>
      </View>
    );
  }
  // The readout row: the moment on the left, the tool's one figure on the right.
  const kept = Math.max(0, range[1] - range[0]);
  const plays = clockRound(kept / speed);
  const readoutLeft = isVideo ? (tool === 'cover' ? clock(coverAt) : clock(now)) : zoom > 1.001 ? `${zoom.toFixed(1)}×` : '';
  let readoutRight: React.ReactNode = null;
  if (isVideo) {
    const unread = readFailed && !duration;
    // The one figure on the right is always white, even when it is a problem: the sentence says so, on a stage where a colour would not.
    const text = unread ? 'Could not read that clip.'
      : tool === 'trim' ? (duration ? (speed !== 1 ? `${clockRound(kept)} kept · plays ${plays}` : `${clockRound(kept)} kept`) : '')
      : tool === 'speed' ? (duration ? `plays ${plays}` : '')
      : tool === 'crop' ? (crop.scale > 1.01 ? `${crop.scale.toFixed(1)}×` : cropChanged ? 'Moved' : 'As filmed')
      : '';
    readoutRight = <Text style={styles.readoutStrong}>{text}</Text>;
  } else if (photoEdited) {
    readoutRight = (
      <Pressable accessibilityRole="button" accessibilityLabel="Reset edits" hitSlop={10} onPress={() => { setTurns(0); setZoom(1); setPan({ x: 0, y: 0 }); setCropS(1); }} style={pressable({})}>
        <Text style={styles.actionText}>Reset</Text>
      </Pressable>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} onLayout={(e) => { const w = Math.round(e.nativeEvent.layout.width); if (w > 0 && w !== ownWidth) setOwnWidth(w); }}>
      <View style={[styles.bar, column]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" hitSlop={10} onPress={onBack}><Ionicons name="chevron-back" size={26} color="white" /></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Next" accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => { void done(); }} style={({ pressed }) => [styles.next, busy && { opacity: 0.5 }, pressed && !busy && styles.pressed]}><Text style={styles.nextText}>Next</Text></Pressable>
      </View>

      <View ref={stageRoot} style={styles.stage} onLayout={(e) => { const l = e.nativeEvent.layout; setStageSize((st) => (st.w === l.width && st.h === l.height ? st : { w: l.width, h: l.height })); }}>
        {/* A clip is shown in its post's shape; a photo gets the whole stage, so it can be as big as the screen allows. */}
        {/* A post's portrait frame is its own shape (4:5), sized to fit the stage, so what you frame here is what the feed shows. */}
        <View style={!isVideo ? StyleSheet.absoluteFill : frame === 'landscape' ? styles.wideFrame : postPortrait || desktopWeb ? styles.tallFrame : StyleSheet.absoluteFill}>
          <View style={[!isVideo ? StyleSheet.absoluteFill : frame === 'landscape' ? styles.wideBox : postPortrait ? postBox : desktopWeb ? styles.tallBox : StyleSheet.absoluteFill, isVideo && tool === 'crop' && { overflow: 'visible' as const }]} onLayout={(e) => setBox({ w: Math.max(1, e.nativeEvent.layout.width), h: Math.max(1, e.nativeEvent.layout.height) })}>
            {isVideo && media.uri ? (
              <View style={tool === 'crop' ? drawnStyle : cropLayer(crop)}>
                <VideoSurface ref={player} uri={media.uri} muted={muted} volume={volume} rate={speed} fit={tool === 'crop' ? 'contain' : 'cover'} from={range[0]} to={duration ? range[1] : undefined} paused={frozenAt !== null || userPaused} onTime={onTime} onDuration={onDuration} onSize={onVidSize} />
              </View>
            ) : media.uri && nat ? (
              // The whole stage takes the drag and the pinch, not only the box;
              // the photo shows past the box, dimmed, so you see what is cut.
              <GestureDetector gesture={photoGestures}>
              <View style={styles.photoStage}>
                <View style={[styles.photoWindow, { width: win.w, height: win.h }]}>
                  <RNAnimated.Image
                    accessibilityIgnoresInvertColors
                    source={{ uri: media.uri }}
                    resizeMode="cover"
                    style={{ position: 'absolute', width: shown.uw, height: shown.uh, left: (win.w - shown.uw) / 2 + pan.x, top: (win.h - shown.uh) / 2 + pan.y, transform: [{ rotate: spin.interpolate({ inputRange: [0, 360], outputRange: ['0deg', '360deg'] }) }] }}
                  />
                </View>
                {(() => {
                  // The crop box on the stage: the window, shrunk around its middle while a corner is pulled.
                  const bw = win.w * cropS;
                  const bh = win.h * cropS;
                  const l = (box.w - bw) / 2;
                  const t = (box.h - bh) / 2;
                  return (
                    <>
                      <View pointerEvents="none" style={[styles.photoDim, { top: 0, left: 0, right: 0, height: t }]} />
                      <View pointerEvents="none" style={[styles.photoDim, { top: t + bh, left: 0, right: 0, bottom: 0 }]} />
                      <View pointerEvents="none" style={[styles.photoDim, { top: t, left: 0, width: l, height: bh }]} />
                      <View pointerEvents="none" style={[styles.photoDim, { top: t, left: l + bw, right: 0, height: bh }]} />
                      <View pointerEvents="box-none" style={{ position: 'absolute', left: l, top: t, width: bw, height: bh }}>
                        {/* The thirds grid, while the picture or a corner is being moved. */}
                        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: dragging ? 1 : 0 }]}>
                          {[1, 2].map((i) => <View key={`v${i}`} style={[styles.gridLine, { left: `${(i / 3) * 100}%`, top: 0, bottom: 0, width: 1 }]} />)}
                          {[1, 2].map((i) => <View key={`h${i}`} style={[styles.gridLine, { top: `${(i / 3) * 100}%`, left: 0, right: 0, height: 1 }]} />)}
                        </View>
                        <View pointerEvents="none" style={styles.cropEdge} />
                        {[0, 1, 2, 3].map((i) => (
                          <View key={i} pointerEvents="none" accessibilityLabel="Crop corner" style={[styles.corner, i % 2 === 0 ? { left: -14 } : { right: -14 }, i < 2 ? { top: -14 } : { bottom: -14 }]}>
                            <View style={[styles.cornerMark, i % 2 === 0 ? { borderLeftWidth: 3 } : { borderRightWidth: 3 }, i < 2 ? { borderTopWidth: 3 } : { borderBottomWidth: 3 }]} />
                          </View>
                        ))}
                        {zoomShown ? <View pointerEvents="none" style={styles.zoomBadge}><Text style={styles.zoomBadgeText}>{zoom.toFixed(1)}×</Text></View> : null}
                      </View>
                    </>
                  );
                })()}
              </View>
              </GestureDetector>
            ) : null}
          </View>
        </View>
        {isVideo && (tool === 'trim' || tool === 'speed' || tool === 'sound') ? (
          // A tap anywhere on the picture pauses or plays.
          <Pressable accessibilityRole="button" accessibilityLabel={userPaused ? 'Play' : 'Pause'} onPress={togglePause} style={StyleSheet.absoluteFill} />
        ) : null}
        {isVideo && tool === 'crop' ? (
          // The whole stage takes the drag and the pinch. The frame (shrunk
          // while a corner is pulled) stays put; outside it is dimmed.
          <GestureDetector gesture={videoCropGestures}>
          <View ref={stageEl} style={StyleSheet.absoluteFill}>
            {(() => {
              const bw = box.w * vCropS;
              const bh = box.h * vCropS;
              const l = boxOff.x + (box.w - bw) / 2;
              const t = boxOff.y + (box.h - bh) / 2;
              return (
                <>
                  <View pointerEvents="none" style={[styles.dimPane, { top: 0, left: 0, right: 0, height: t }]} />
                  <View pointerEvents="none" style={[styles.dimPane, { top: t + bh, left: 0, right: 0, bottom: 0 }]} />
                  <View pointerEvents="none" style={[styles.dimPane, { top: t, left: 0, width: l, height: bh }]} />
                  <View pointerEvents="none" style={[styles.dimPane, { top: t, left: l + bw, right: 0, height: bh }]} />
                  <View pointerEvents="none" style={[styles.cropBox, { left: l, top: t, width: bw, height: bh }]}>
                    <Animated.View style={[StyleSheet.absoluteFill, gridStyle]}>
                      {[1, 2].map((i) => <View key={`v${i}`} style={[styles.gridLine, { left: `${(i / 3) * 100}%`, top: 0, bottom: 0, width: 1 }]} />)}
                      {[1, 2].map((i) => <View key={`h${i}`} style={[styles.gridLine, { top: `${(i / 3) * 100}%`, left: 0, right: 0, height: 1 }]} />)}
                    </Animated.View>
                    {/* Drawn inside the frame's edge, the way Photos does it: on a phone the frame is the whole stage wide, so a mark outside it would be cut off. */}
                    {[0, 1, 2, 3].map((i) => (
                      <View key={i} accessibilityLabel="Crop corner" style={[styles.corner, i % 2 === 0 ? { left: -7 } : { right: -7 }, i < 2 ? { top: -7 } : { bottom: -7 }]}>
                        <View style={[styles.cornerMark, i % 2 === 0 ? { borderLeftWidth: 3 } : { borderRightWidth: 3 }, i < 2 ? { borderTopWidth: 3 } : { borderBottomWidth: 3 }]} />
                      </View>
                    ))}
                  </View>
                </>
              );
            })()}
          </View>
          </GestureDetector>
        ) : null}
        {isVideo && userPaused ? (
          <Animated.View pointerEvents="none" entering={discIn} style={styles.centre}>
            <View style={styles.pausedDisc}><Ionicons name="play" size={30} color="white" style={{ marginLeft: 4 }} /></View>
          </Animated.View>
        ) : null}
        {isVideo && zoomShown ? <View pointerEvents="none" style={[styles.zoomBadge, { top: boxOff.y + 10 }]}><Text style={styles.zoomBadgeText}>{crop.scale.toFixed(1)}×</Text></View> : null}
        {isVideo ? (
          // The feed's own sound disc, in the picture's own corner.
          <Pressable accessibilityRole="button" accessibilityLabel={muted ? 'Sound off' : 'Sound on'} onPress={toggleSound} style={[styles.soundHit, { right: boxOff.x + 16, top: boxOff.y + 12 }]}>
            <View style={styles.soundDisc}><Ionicons name={soundGlyph} size={19} color="white" /></View>
          </Pressable>
        ) : null}
        {busy ? <View style={styles.busy}><Text style={styles.busyText}>Cutting…</Text></View> : null}
      </View>

      {/* Three rows of fixed height under the picture, so the picture never resizes when the tool changes. */}
      <View style={[styles.tools, { paddingBottom: insets.bottom + spacing.sm }, column]}>
        <View style={styles.stripZone}>
          <Animated.View key={isVideo ? tool : 'photo'} entering={zoneIn} exiting={zoneOut} style={StyleSheet.absoluteFill}>
            {zone}
          </Animated.View>
        </View>
        <View style={styles.readoutRow}>
          <Text style={styles.readout}>{readoutLeft}</Text>
          {readoutRight}
        </View>
        {isVideo ? (
          <View ref={railRef} onLayout={() => placeRef.current(false)} style={[styles.rail, roomy && styles.railDesktop]}>
            {TOOLS.map(({ key, label }) => (
              <Pressable key={key} ref={(node) => { wordRefs.current[key] = node; }} accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected: tool === key }} onPress={() => switchTool(key)} style={pressable(styles.word)}>
                <Text style={[styles.wordText, tool === key && styles.wordTextOn]}>{label}</Text>
              </Pressable>
            ))}
            <Animated.View pointerEvents="none" style={[styles.railLine, railLineStyle]} />
          </View>
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  bar: { height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg },
  next: { paddingHorizontal: spacing.lg, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.brand },
  nextText: { ...typography.smallStrong, color: colors.brandInk },
  pressed: { transform: [{ scale: 0.97 }] },
  stage: { flex: 1, backgroundColor: '#000', overflow: 'hidden' },
  wideFrame: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center' },
  wideBox: { width: '100%', aspectRatio: 16 / 9, overflow: 'hidden' },
  // A computer's stage is wide and short: a portrait post shows in a phone-shaped box in the middle rather than cropped to the whole stage.
  tallFrame: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  tallBox: { height: '100%', aspectRatio: 9 / 16, maxWidth: '100%', overflow: 'hidden', backgroundColor: '#000' },
  centre: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  soundHit: { position: 'absolute', right: 16, top: 12, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  soundDisc: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  pausedDisc: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  busy: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.35)' },
  busyText: { ...typography.smallStrong, color: 'white' },
  zoomBadge: { position: 'absolute', top: 10, alignSelf: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: 'rgba(0,0,0,0.55)' },
  zoomBadgeText: { ...typography.caption, color: 'white', letterSpacing: 0 },
  cropEdge: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)' },
  dimPane: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.55)' },
  cropBox: { position: 'absolute', borderWidth: 1.5, borderColor: 'white' },
  photoStage: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  photoWindow: { overflow: 'visible', backgroundColor: '#000' },
  photoDim: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.6)' },
  corner: { position: 'absolute', width: 36, height: 36, alignItems: 'center', justifyContent: 'center', zIndex: 3 },
  cornerMark: { width: 22, height: 22, borderColor: 'white' },
  gridLine: { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.55)' },
  tools: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, backgroundColor: '#000' },
  stripZone: { height: STRIP_H },
  zoneRow: { height: STRIP_H, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  strip: { height: STRIP_H, marginHorizontal: HANDLE, overflow: 'visible' },
  // Rounded to match the handles' outer corners, so no notch shows where they meet the first and last frame.
  frames: { flexDirection: 'row', height: STRIP_H, borderRadius: 4, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.08)' },
  frame: { flex: 1, height: STRIP_H },
  reading: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  readingText: { ...typography.small, color: 'rgba(255,255,255,0.6)' },
  dim: { position: 'absolute', top: 0, height: STRIP_H, backgroundColor: 'rgba(0,0,0,0.55)' },
  bracket: { position: 'absolute', height: 2, backgroundColor: 'white' },
  playhead: { position: 'absolute', left: 0, top: -4, width: 2, height: STRIP_H + 8, backgroundColor: 'white' },
  handle: { position: 'absolute', top: 0, width: HANDLE, height: STRIP_H, backgroundColor: 'white', alignItems: 'center', justifyContent: 'center', cursor: 'ew-resize' as never },
  handleLeft: { borderTopLeftRadius: 4, borderBottomLeftRadius: 4 },
  handleRight: { borderTopRightRadius: 4, borderBottomRightRadius: 4 },
  grip: { width: 2, height: 18, borderRadius: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  chip: { position: 'absolute', bottom: STRIP_H + 8, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: 'rgba(0,0,0,0.8)' },
  chipText: { ...typography.caption, color: 'white', letterSpacing: 0, fontVariant: ['tabular-nums'] },
  coverWindow: { position: 'absolute', top: 0, height: STRIP_H, borderWidth: 2, borderColor: 'white', borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.12)', cursor: 'ew-resize' as never },
  words: { flexDirection: 'row', alignItems: 'center', gap: spacing.xl },
  word: { minWidth: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  wordText: { ...typography.smallStrong, color: 'rgba(255,255,255,0.55)' },
  wordTextOn: { color: 'white' },
  wordLine: { position: 'absolute', bottom: 6, width: 20, height: 2, borderRadius: 1, backgroundColor: 'white' },
  action: { minWidth: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  actionText: { ...typography.smallStrong, color: 'white' },
  speedRow: { height: STRIP_H, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly' },
  speedRowDesktop: { justifyContent: 'center', gap: spacing.xxl },
  speedHit: { height: 44, alignItems: 'center', justifyContent: 'center' },
  // The one chip on the screen: a selector, fully round because it is the pressed one.
  speedPill: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: radius.pill },
  speedPillOn: { backgroundColor: 'white' },
  speedText: { ...typography.smallStrong, color: 'rgba(255,255,255,0.7)', fontVariant: ['tabular-nums'] },
  speedTextOn: { color: '#000' },
  soundRow: { height: STRIP_H, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  soundGlyph: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  levelHit: { flex: 1, height: 44, justifyContent: 'center' },
  levelTrack: { height: 2, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.25)' },
  levelFill: { height: 2, backgroundColor: 'white' },
  levelKnob: { position: 'absolute', top: 13, marginLeft: -9, width: 18, height: 18, borderRadius: 9, backgroundColor: 'white' },
  levelText: { ...typography.smallStrong, color: 'white', minWidth: 44, textAlign: 'right', fontVariant: ['tabular-nums'] },
  readoutRow: { height: 24, marginTop: spacing.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  readout: { ...typography.small, color: 'rgba(255,255,255,0.7)', fontVariant: ['tabular-nums'] },
  readoutStrong: { ...typography.smallStrong, color: 'white', fontVariant: ['tabular-nums'] },
  rail: { height: 44, marginTop: spacing.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  railDesktop: { justifyContent: 'center', gap: spacing.xxl },
  railLine: { position: 'absolute', left: 0, bottom: 6, width: 20, height: 2, borderRadius: 1, backgroundColor: 'white' },
  // White like everything else on the stage: the theme's red does not read on black.
  error: { ...typography.caption, color: 'white', letterSpacing: 0, marginTop: spacing.sm },
});
