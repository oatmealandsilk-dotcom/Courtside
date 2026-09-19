import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated as RNAnimated, Image, PanResponder, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { isDesktopBrowser } from '@/lib/browserDevice';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, useAnimatedStyle, useFrameCallback, useSharedValue, withTiming } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';

import type { PickedMedia } from '@/components/MediaPicker';
import { VideoSurface, type VideoSurfaceHandle } from '@/components/VideoSurface';
import { framesAt, type Frame } from '@/features/compose/frames';
import { editPhotoRect, measureForEdit } from '@/features/compose/photoEdit';
import { clampCrop, cropLayer } from '@/lib/crop';
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
  /** A zoom and shift inside the frame — cuts black edges out of a recording. */
  crop?: MediaCrop;
}

const HANDLE = 18;
const CURSOR = 34;
const MIN_CLIP_SECONDS = 1;
const clock = (s: number) => `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;

/**
 * The step between picking something and writing the caption — the media
 * fills the screen, sound plays, and the baseline edits sit underneath:
 * trim and cover for a video, turn and crop for a photo. Nothing is
 * re-encoded; a trim is remembered and honoured at playback, so it is
 * instant and never touches the original.
 */
// A computer's browser: the stage is wide, so a portrait post gets a phone-shaped box in the middle.
const desktopWeb = Platform.OS === 'web' && isDesktopBrowser();


export function MediaEditor({ media, onBack, onDone, portraitRatio = 9 / 16 }: {
  media: PickedMedia;
  onBack: () => void;
  onDone: (result: EditedMedia) => void;
  /** Width over height of a portrait frame: 4:5 for a post (as the feed shows it), 9:16 for a full-screen clip. Landscape is 16:9. */
  portraitRatio?: number;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  // The editor's own width: on a computer it sits in a sheet narrower than the window, and every strip is sized to it.
  const [ownWidth, setOwnWidth] = useState(0);
  const width = ownWidth || windowWidth;
  const isVideo = media.kind === 'video';

  /* ----------------------------------- video ---------------------------------- */
  const player = useRef<VideoSurfaceHandle>(null);
  const [duration, setDuration] = useState(0);
  const [range, setRange] = useState<[number, number]>([0, 0]);
  const [frames, setFrames] = useState<Frame[]>([]);
  const [cover, setCover] = useState<string | undefined>(media.thumbnailUrl);
  const [muted, setMuted] = useState(false);
  const [tool, setTool] = useState<'trim' | 'cover' | 'crop'>('trim');
  // Choosing a cover happens on a still: the video holds on whichever frame
  // is picked, and only plays again when you go back to trimming.
  const [frozenAt, setFrozenAt] = useState<number | null>(null);
  const switchTool = (next: 'trim' | 'cover' | 'crop') => {
    // Leaving Crop: the framed picture grows out of where the crop box was
    // until it fills the frame, the way iPhone Photos closes a crop, instead
    // of jumping from the whole picture to the framed one.
    if (isVideo && tool === 'crop' && next !== 'crop') {
      zoomX.value = cropPx.l + cropPx.w / 2 - (boxOff.x + box.w / 2);
      zoomY.value = cropPx.t + cropPx.h / 2 - (boxOff.y + box.h / 2);
      zoomS.value = Math.max(0.1, Math.min(1, cropPx.w / Math.max(1, box.w)));
      zoomP.value = 0;
      zoomP.value = withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) });
    }
    setTool(next);
    if (next === 'crop') { holding.current = false; setFrozenAt(null); startPlayer(); return; }
    if (next === 'cover') {
      holding.current = true;
      stopPlayer();
      // Cover opens on the moment you were watching, and that frame becomes
      // the cover, so the still on screen is always the cover you will get.
      const lo = range[0];
      const hi = range[1] > lo ? range[1] : Number.POSITIVE_INFINITY;
      const at = frozenAt ?? Math.max(lo, Math.min(hi, head.value));
      setFrozenAt(at);
      coverAtRef.current = at;
      setCoverAt(at);
      head.value = at;
      player.current?.seek(at);
      if (frozenAt === null) settleCover(at);
    } else {
      // Back from a cover still: play on from the cover's frame.
      // Back from Crop: the video just carries on where it was.
      if (frozenAt !== null) {
        head.value = frozenAt;
        player.current?.seek(frozenAt);
      }
      setFrozenAt(null);
      startPlayer();
      setTimeout(() => { holding.current = false; }, 250);
    }
  };
  const zoomP = useSharedValue(1);
  const zoomX = useSharedValue(0);
  const zoomY = useSharedValue(0);
  const zoomS = useSharedValue(1);
  const framed = tool !== 'crop';
  const zoomStyle = useAnimatedStyle(() => {
    if (!framed) return { transform: [{ translateX: 0 }, { translateY: 0 }, { scale: 1 }] };
    const p = zoomP.value;
    return { transform: [{ translateX: zoomX.value * (1 - p) }, { translateY: zoomY.value * (1 - p) }, { scale: zoomS.value + (1 - zoomS.value) * p }] };
  }, [framed]);
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
    let next = head.value + dt;
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
    setDuration((d) => {
      if (d) return d;
      setRange([0, seconds]);
      return seconds;
    });
  }, []);
  useEffect(() => {
    if (!isVideo || !media.uri || !duration) return;
    let cancelled = false;
    const times = Array.from({ length: 8 }, (_, i) => (duration * i) / 8);
    framesAt(media.uri, times).then((got) => { if (!cancelled) setFrames(got); });
    return () => { cancelled = true; };
  }, [isVideo, media.uri, duration]);

  // The trim strip: two handles over a row of frames, dragged in pixels and
  // turned into seconds. PanResponder is enough here — it is a small strip,
  // not a page — and works the same in the browser.
  const stripWidth = width - spacing.lg * 2 - HANDLE * 2;
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
      if (!isSpace(e) || typing(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      e.preventDefault();
      e.stopPropagation();
      spaceAt = Date.now();
      const focused = document.activeElement as HTMLElement | null;
      if (focused && focused !== document.body) focused.blur();
      if (!e.repeat) toggleRef.current();
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
  const startAt = useRef(0);
  const makeHandle = (side: 0 | 1) => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => { scrubbing.current = true; startAt.current = rangeRef.current[side]; stopPlayer(); },
    onPanResponderMove: (_, g) => {
      const [a, b] = rangeRef.current;
      const raw = startAt.current + g.dx * secondsPerPx;
      const next: [number, number] = side === 0
        ? [Math.max(0, Math.min(raw, b - MIN_CLIP_SECONDS)), b]
        : [a, Math.min(duration, Math.max(raw, a + MIN_CLIP_SECONDS))];
      setRange(next);
      const at = side === 0 ? next[0] : next[1];
      head.value = at;
      player.current?.seek(at);
    },
    onPanResponderRelease: () => {
      const from = rangeRef.current[0];
      head.value = from;
      player.current?.seek(from);
      startPlayer();
      // The seek's own report lands a beat later; ignore it too.
      setTimeout(() => { scrubbing.current = false; }, 250);
    },
    onPanResponderTerminate: () => { scrubbing.current = false; },
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
  const [coverAt, setCoverAt] = useState(0);
  const coverAtRef = useRef(0);
  const settleCover = (time: number) => {
    if (!media.uri) return;
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
  const coverScrub = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => {
      scrubbing.current = true;
      stopPlayer();
      scrubTo(e.nativeEvent.locationX * secondsPerPx);
    },
    onPanResponderMove: (e) => scrubTo(e.nativeEvent.locationX * secondsPerPx),
    onPanResponderRelease: () => { settleCover(coverAtRef.current); setTimeout(() => { scrubbing.current = false; }, 250); },
    onPanResponderTerminate: () => { settleCover(coverAtRef.current); scrubbing.current = false; },
  }), [secondsPerPx]); // eslint-disable-line react-hooks/exhaustive-deps
  const lo = range[0];
  const hi = range[1];
  const headStyle = useAnimatedStyle(() => {
    const at = Math.max(lo, Math.min(hi, head.value));
    return { transform: [{ translateX: duration ? (at / duration) * stripWidth : 0 }] };
  }, [lo, hi, duration, stripWidth]);

  /* ----------------------------------- crop ----------------------------------- */
  // Zoom in and slide the picture inside the frame, for cutting black edges
  // out of a screen recording. The stage shows exactly what the feed will.
  const [crop, setCrop] = useState<MediaCrop>({ scale: 1, x: 0, y: 0 });
  const cropRef = useRef(crop);
  cropRef.current = crop;
  const [box, setBox] = useState({ w: 1, h: 1 });
  // The stage's size. The frame sits centred on it (in a landscape post, or
  // on a computer), and the crop box is drawn on the stage, so it is moved
  // by the same margins. Worked out from the two sizes rather than read from
  // the frame's position, which is not re-reported when only the position
  // changes (switching to Crop makes the stage shorter).
  const [stageSize, setStageSize] = useState({ w: 0, h: 0 });
  const boxOff = { x: stageSize.w ? Math.max(0, (stageSize.w - box.w) / 2) : 0, y: stageSize.h ? Math.max(0, (stageSize.h - box.h) / 2) : 0 };
  const boxRef = useRef(box);
  boxRef.current = box;
  const dragStart = useRef<MediaCrop>(crop);
  const cropDrag = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => { dragStart.current = cropRef.current; },
    onPanResponderMove: (_e, g) => {
      const s = dragStart.current;
      setCrop(clampCrop({ scale: s.scale, x: s.x + g.dx / boxRef.current.w, y: s.y + g.dy / boxRef.current.h }));
    },
  }), []);
  const ZOOM_MAX = 2.5;
  const zoomStripWidth = width - spacing.lg * 2;
  // Cropping a clip: the whole picture is shown, and a box in the frame's
  // shape says what to keep. Pinch to size it, drag it, or pull a corner.
  // The box lives in fractions of the picture as displayed (cx, cy, w).
  const [vidSize, setVidSize] = useState<{ w: number; h: number } | null>(null);
  const onVidSize = useCallback((w: number, h: number) => setVidSize({ w, h }), []);
  const [cropBox, setCropBox] = useState({ cx: 0.5, cy: 0.5, w: 1 });
  const fa = box.w / Math.max(1, box.h);
  const va = vidSize ? vidSize.w / vidSize.h : fa;
  // The picture as shown whole inside the frame.
  const disp = va > fa ? { w: box.w, h: box.w / va } : { w: box.h * va, h: box.h };
  const dispOff = { x: (box.w - disp.w) / 2, y: (box.h - disp.h) / 2 };
  const wMax = Math.min(1, (disp.h * fa) / Math.max(1, disp.w));
  const boxH = (w: number) => (w * disp.w) / fa / Math.max(1, disp.h); // height as a fraction of the shown picture
  const clampBox = (b: { cx: number; cy: number; w: number }) => {
    const w = Math.max(0.2, Math.min(wMax, b.w));
    const h = boxH(w);
    return { w, cx: Math.max(w / 2, Math.min(1 - w / 2, b.cx)), cy: Math.max(h / 2, Math.min(1 - h / 2, b.cy)) };
  };
  const boxRef2 = useRef(cropBox); boxRef2.current = cropBox;
  const startBox = useRef(cropBox);
  const dispRef = useRef(disp); dispRef.current = disp;
  const clampBoxRef = useRef(clampBox); clampBoxRef.current = clampBox;
  // A new frame shape or clip size can leave the box bigger than the picture
  // (a clip wider than the frame); it is fitted back inside whenever they change.
  useEffect(() => {
    setCropBox((b) => { const c = clampBoxRef.current(b); return c.w === b.w && c.cx === b.cx && c.cy === b.cy ? b : c; });
  }, [wMax, disp.w, disp.h]);
  const moveBox = useMemo(() => Gesture.Pan().runOnJS(true).minDistance(2)
    .onStart(() => { startBox.current = boxRef2.current; })
    .onUpdate((e) => { const d = dispRef.current; setCropBox(clampBoxRef.current({ ...startBox.current, cx: startBox.current.cx + e.translationX / Math.max(1, d.w), cy: startBox.current.cy + e.translationY / Math.max(1, d.h) })); }), []);
  const pinchBox = useMemo(() => Gesture.Pinch().runOnJS(true)
    .onStart(() => { startBox.current = boxRef2.current; })
    .onUpdate((e) => { setCropBox(clampBoxRef.current({ ...startBox.current, w: startBox.current.w / Math.max(0.2, e.scale) })); }), []);
  const boxGestures = useMemo(() => Gesture.Simultaneous(moveBox, pinchBox), [moveBox, pinchBox]);
  // A corner pulls its own corner; the opposite one stays put.
  const cornerGesture = (sx: number, sy: number) => Gesture.Pan().runOnJS(true).minDistance(1)
    .onStart(() => { startBox.current = boxRef2.current; })
    .onUpdate((e) => {
      const d = dispRef.current; const s = startBox.current;
      const w = Math.max(0.2, Math.min(wMax, s.w + (sx * e.translationX) / Math.max(1, d.w)));
      const h0 = boxH(s.w); const h = boxH(w);
      const cx = sx > 0 ? (s.cx - s.w / 2) + w / 2 : (s.cx + s.w / 2) - w / 2;
      const cy = sy > 0 ? (s.cy - h0 / 2) + h / 2 : (s.cy + h0 / 2) - h / 2;
      setCropBox(clampBoxRef.current({ cx, cy, w }));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const cornerGestures = useMemo(() => [cornerGesture(-1, -1), cornerGesture(1, -1), cornerGesture(-1, 1), cornerGesture(1, 1)], [wMax, disp.w, disp.h]);
  // The box, turned into the zoom-and-shift the feed plays.
  useEffect(() => {
    if (!isVideo || !vidSize) return;
    const coverK = Math.max(box.w / Math.max(1, disp.w), box.h / Math.max(1, disp.h));
    const rw = cropBox.w * disp.w;
    const scale = Math.min(ZOOM_MAX * 2, (box.w / Math.max(1, rw)) / coverK);
    const ox = (cropBox.cx - 0.5) * disp.w;
    const oy = (cropBox.cy - 0.5) * disp.h;
    const next = clampCrop({ scale: scale <= 1.005 ? 1 : scale, x: scale <= 1.005 ? 0 : (-ox * coverK * scale) / Math.max(1, box.w), y: scale <= 1.005 ? 0 : (-oy * coverK * scale) / Math.max(1, box.h) });
    setCrop(next);
  }, [cropBox, vidSize, box.w, box.h, isVideo]); // eslint-disable-line react-hooks/exhaustive-deps
  // A trackpad pinch in the browser arrives as a wheel with the control key.
  const stageEl = useRef<View>(null);
  useEffect(() => {
    if (Platform.OS !== 'web' || tool !== 'crop') return;
    const node = stageEl.current as unknown as HTMLElement | null;
    if (!node || typeof node.addEventListener !== 'function') return;
    const onWheel = (e: WheelEvent) => { if (!e.ctrlKey) return; e.preventDefault(); setCropBox((b) => clampBoxRef.current({ ...b, w: b.w * (1 + e.deltaY / 300) })); };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, [tool]);
  // In pixels, for drawing.
  const cropPx = { l: boxOff.x + dispOff.x + (cropBox.cx - cropBox.w / 2) * disp.w, t: boxOff.y + dispOff.y + (cropBox.cy - boxH(cropBox.w) / 2) * disp.h, w: cropBox.w * disp.w, h: boxH(cropBox.w) * disp.h };
  const zoomTo = (x: number) => {
    const t = Math.max(0, Math.min(1, x / zoomStripWidth));
    setCrop((c) => clampCrop({ ...c, scale: 1 + t * (ZOOM_MAX - 1) }));
  };
  const zoomDrag = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => zoomTo(e.nativeEvent.locationX),
    onPanResponderMove: (e) => zoomTo(e.nativeEvent.locationX),
  }), [zoomStripWidth]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ----------------------------------- photo ---------------------------------- */
  // Nothing is cut until Next: the stage shows the turn, the shape, the zoom
  // and where you dragged it, all live, and the photo is cut once at the end.
  const [turns, setTurns] = useState(0);
  // The picture swings to each quarter turn rather than snapping.
  const spin = useRef(new RNAnimated.Value(0)).current;
  useEffect(() => { RNAnimated.spring(spin, { toValue: turns * 90, useNativeDriver: true, damping: 16, stiffness: 180 }).start(); }, [turns, spin]);
  // How the post is framed in the feed: Portrait (the post's own portrait
  // shape) or Landscape (16:9). Picked from the picture's own shape and
  // changeable here. A photo is cropped to exactly that shape.
  const [frame, setFrame] = useState<'portrait' | 'landscape'>(media.orientation ?? 'portrait');
  const [frameTouched, setFrameTouched] = useState(false);
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
  // The zoom level shows for a moment while it changes, then fades.
  const [zoomShown, setZoomShown] = useState(false);
  const zoomTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const zoomPhotoTo = (z: number) => {
    const next = Math.max(1, Math.min(PHOTO_ZOOM_MAX, z));
    setZoom(next);
    setPan((p) => clampRef.current(p, next));
    setZoomShown(true);
    if (zoomTimer.current) clearTimeout(zoomTimer.current);
    zoomTimer.current = setTimeout(() => setZoomShown(false), 900);
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
  // A trackpad pinch in the browser arrives as a wheel with the control key
  // held (Chrome, Edge, Firefox) or as Safari's own gesture events.
  const stageRoot = useRef<View>(null);
  useEffect(() => {
    if (Platform.OS !== 'web' || isVideo) return;
    const node = stageRoot.current as unknown as HTMLElement | null;
    if (!node || typeof node.addEventListener !== 'function') return;
    const onWheel = (e: WheelEvent) => { if (!e.ctrlKey) return; e.preventDefault(); zoomPhotoRef.current(zoomRef.current * Math.exp(-e.deltaY / 100)); };
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
  const photoTouched = turns !== 0 || zoom > 1.001 || pan.x !== 0 || pan.y !== 0 || Math.abs(RW / RH - cropRatio) > 0.01;
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
        crop: crop.scale > 1.01 ? { scale: Number(crop.scale.toFixed(3)), x: Number(crop.x.toFixed(4)), y: Number(crop.y.toFixed(4)) } : undefined,
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

  // The stage always fills, the way Instagram's does; how the post is framed
  // in the feed is the Portrait / Landscape choice on the next step.

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} onLayout={(e) => { const w = Math.round(e.nativeEvent.layout.width); if (w > 0 && w !== ownWidth) setOwnWidth(w); }}>
      <View style={styles.bar}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" hitSlop={10} onPress={onBack}><Ionicons name="chevron-back" size={26} color="white" /></Pressable>
        <Text style={styles.title}>{isVideo ? 'Edit clip' : 'Edit photo'}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Next" onPress={() => { void done(); }} disabled={busy} style={[styles.next, busy && { opacity: 0.5 }]}><Text style={styles.nextText}>Next</Text></Pressable>
      </View>

      <View ref={stageRoot} style={styles.stage} onLayout={(e) => { const l = e.nativeEvent.layout; setStageSize((st) => (st.w === l.width && st.h === l.height ? st : { w: l.width, h: l.height })); }}>
        {/* A clip is shown in its post's shape; a photo gets the whole stage, so it can be as big as the screen allows. */}
        {/* A post's portrait frame is its own shape (4:5), sized to fit the stage, so what you frame here is what the feed shows. */}
        <View style={!isVideo ? StyleSheet.absoluteFill : frame === 'landscape' ? styles.wideFrame : postPortrait || desktopWeb ? styles.tallFrame : StyleSheet.absoluteFill}>
          <Animated.View style={[!isVideo ? StyleSheet.absoluteFill : frame === 'landscape' ? styles.wideBox : postPortrait ? postBox : desktopWeb ? styles.tallBox : StyleSheet.absoluteFill, isVideo && zoomStyle]} onLayout={(e) => setBox({ w: Math.max(1, e.nativeEvent.layout.width), h: Math.max(1, e.nativeEvent.layout.height) })}>
            {isVideo && media.uri ? (
              <View style={tool === 'crop' ? StyleSheet.absoluteFill : cropLayer(crop)}>
                <VideoSurface ref={player} uri={media.uri} muted={muted} fit={tool === 'crop' ? 'contain' : 'cover'} from={range[0]} to={duration ? range[1] : undefined} paused={frozenAt !== null || userPaused} onTime={onTime} onDuration={onDuration} onSize={onVidSize} />
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
          </Animated.View>
        </View>
        {isVideo && tool === 'trim' ? (
          // A tap anywhere on the picture pauses or plays; a play sign sits in the middle while paused.
          <Pressable accessibilityRole="button" accessibilityLabel={userPaused ? 'Play' : 'Pause'} onPress={togglePause} style={styles.tapToPause}>
            {userPaused ? <View pointerEvents="none" style={styles.pausedBadge}><Ionicons name="play" size={34} color="white" style={{ marginLeft: 4 }} /></View> : null}
          </Pressable>
        ) : null}
        {isVideo ? (
          <Pressable accessibilityRole="button" accessibilityLabel={muted ? 'Sound off' : 'Sound on'} onPress={() => setMuted((m) => !m)} style={styles.sound}>
            <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={16} color="white" />
            <Text style={styles.soundText}>{muted ? 'Sound off' : 'Sound on'}</Text>
          </Pressable>
        ) : null}
        {isVideo && tool === 'crop' ? (
          <View ref={stageEl} style={StyleSheet.absoluteFill}>
            {/* Everything outside the box is dimmed. */}
            <View pointerEvents="none" style={[styles.dimPane, { top: 0, left: 0, right: 0, height: cropPx.t }]} />
            <View pointerEvents="none" style={[styles.dimPane, { top: cropPx.t + cropPx.h, left: 0, right: 0, bottom: 0 }]} />
            <View pointerEvents="none" style={[styles.dimPane, { top: cropPx.t, left: 0, width: cropPx.l, height: cropPx.h }]} />
            <View pointerEvents="none" style={[styles.dimPane, { top: cropPx.t, left: cropPx.l + cropPx.w, right: 0, height: cropPx.h }]} />
            <GestureDetector gesture={boxGestures}>
              <View style={[styles.cropBox, { left: cropPx.l, top: cropPx.t, width: cropPx.w, height: cropPx.h }]}>
                {[1, 2].map((i) => <View key={`v${i}`} pointerEvents="none" style={[styles.gridLine, { left: `${(i / 3) * 100}%`, top: 0, bottom: 0, width: 1 }]} />)}
                {[1, 2].map((i) => <View key={`h${i}`} pointerEvents="none" style={[styles.gridLine, { top: `${(i / 3) * 100}%`, left: 0, right: 0, height: 1 }]} />)}
                {cornerGestures.map((g, i) => (
                  <GestureDetector key={i} gesture={g}>
                    <View style={[styles.corner, i % 2 === 0 ? { left: -14 } : { right: -14 }, i < 2 ? { top: -14 } : { bottom: -14 }]}>
                      <View style={[styles.cornerMark, i % 2 === 0 ? { borderLeftWidth: 3 } : { borderRightWidth: 3 }, i < 2 ? { borderTopWidth: 3 } : { borderBottomWidth: 3 }]} />
                    </View>
                  </GestureDetector>
                ))}
              </View>
            </GestureDetector>
          </View>
        ) : null}
        {isVideo && duration ? <Text style={styles.time}>{frozenAt !== null ? `Cover · ${clock(frozenAt)}` : `${clock(now)} / ${clock(range[1] - range[0])}`}</Text> : null}
        {busy ? <View style={styles.busy}><Text style={styles.busyText}>Cutting…</Text></View> : null}
      </View>

      <View style={[styles.tools, { paddingBottom: insets.bottom + spacing.md }]}>
        <View style={styles.tabs}>
          {(['portrait', 'landscape'] as const).map((o) => (
            <Pressable key={o} accessibilityRole="button" accessibilityState={{ selected: frame === o }} onPress={() => { setFrameTouched(true); setFrame(o); }} style={[styles.tab, frame === o && styles.tabOn]}>
              <Ionicons name={o === 'portrait' ? 'phone-portrait-outline' : 'phone-landscape-outline'} size={15} color={frame === o ? colors.brandInk : 'white'} />
              <Text style={[styles.tabText, frame === o && { color: colors.brandInk }]}>{o === 'portrait' ? 'Portrait' : 'Landscape'}</Text>
            </Pressable>
          ))}
        </View>
        {isVideo ? (
          <>
            <View style={styles.tabs}>
              {(['trim', 'cover', 'crop'] as const).map((t) => (
                <Pressable key={t} accessibilityRole="tab" accessibilityState={{ selected: tool === t }} onPress={() => switchTool(t === 'crop' && tool === 'crop' ? 'trim' : t)} style={[styles.tab, tool === t && styles.tabOn]}>
                  <Ionicons name={t === 'trim' ? 'cut-outline' : t === 'cover' ? 'image-outline' : 'crop-outline'} size={15} color={tool === t ? colors.brandInk : 'white'} />
                  <Text style={[styles.tabText, tool === t && { color: colors.brandInk }]}>{t === 'trim' ? 'Trim' : t === 'cover' ? 'Cover' : 'Crop'}</Text>
                </Pressable>
              ))}
              {duration ? <Text style={styles.rangeText}>{clock(range[0])} – {clock(range[1])}</Text> : null}
            </View>
            {tool === 'crop' ? (
              <View style={[styles.zoomRow, { justifyContent: 'space-between' }]}>
                <Text style={styles.zoomText}>{crop.scale > 1.01 ? `${crop.scale.toFixed(1)}×` : 'Whole clip'}</Text>
                {cropBox.w < wMax - 0.001 || Math.abs(cropBox.cx - 0.5) > 0.001 || Math.abs(cropBox.cy - 0.5) > 0.001 ? <Pressable accessibilityRole="button" accessibilityLabel="Reset crop" onPress={() => { setCropBox(clampBox({ cx: 0.5, cy: 0.5, w: 1 })); setCrop({ scale: 1, x: 0, y: 0 }); }} style={styles.tab}><Text style={styles.tabText}>Reset</Text></Pressable> : null}
              </View>
            ) : tool === 'trim' ? (
              <View ref={stripRef} style={[styles.strip, { marginHorizontal: HANDLE }]}>
                <View style={styles.frames} {...(duration ? headScrub.panHandlers : {})}>
                  {frames.map((f) => <Image key={f.time} accessibilityIgnoresInvertColors source={{ uri: f.uri }} style={styles.frame} resizeMode="cover" />)}
                </View>
                {duration ? (
                  <>
                    <View pointerEvents="none" style={[styles.dim, { left: 0, width: px(range[0]) }]} />
                    <View pointerEvents="none" style={[styles.dim, { right: 0, width: stripWidth - px(range[1]) }]} />
                    <View pointerEvents="none" style={[styles.window, { left: px(range[0]), width: Math.max(0, px(range[1]) - px(range[0])) }]} />
                    <Animated.View pointerEvents="none" style={[styles.playhead, headStyle]} />
                    <View {...startHandle.panHandlers} style={[styles.handle, { left: px(range[0]) - HANDLE }]}><View style={styles.grip} /></View>
                    <View {...endHandle.panHandlers} style={[styles.handle, { left: px(range[1]) }]}><View style={styles.grip} /></View>
                  </>
                ) : null}
              </View>
            ) : (
              <View style={[styles.strip, { marginHorizontal: HANDLE }]} {...coverScrub.panHandlers}>
                <View style={styles.frames}>
                  {frames.map((f) => <Image key={f.time} accessibilityIgnoresInvertColors source={{ uri: f.uri }} style={styles.frame} resizeMode="cover" />)}
                </View>
                {duration ? (
                  <>
                    <View pointerEvents="none" style={[styles.dim, { left: 0, width: px(range[0]) }]} />
                    <View pointerEvents="none" style={[styles.dim, { right: 0, width: stripWidth - px(range[1]) }]} />
                    <View pointerEvents="none" style={[styles.cursor, { left: px(coverAt) - CURSOR / 2 }]} />
                  </>
                ) : null}
                {!frames.length ? <View style={styles.reading}><Text style={styles.hint}>Reading frames…</Text></View> : null}
              </View>
            )}
            {/* Two lines kept for the hint whatever the tool, so switching never makes the picture above jump in size. */}
            <Text numberOfLines={2} style={[styles.hint, styles.hintTwoLines]}>{tool === 'trim' ? 'Drag the ends to trim. The clip plays the part you keep.' : tool === 'cover' ? 'Drag along the strip to the frame you want as the cover.' : 'Pinch to size the box, drag it, or pull a corner. What is inside the box is what posts.'}</Text>
          </>
        ) : (
          <>
            <View style={styles.tabs}>
              <Pressable accessibilityRole="button" accessibilityLabel="Rotate" onPress={() => setTurns((t) => t + 1)} style={styles.tab}>
                <Ionicons name="refresh-outline" size={15} color="white" /><Text style={styles.tabText}>Rotate</Text>
              </Pressable>
              {turns !== 0 || zoom > 1.001 || pan.x !== 0 || pan.y !== 0 ? (
                <Pressable accessibilityRole="button" accessibilityLabel="Reset edits" onPress={() => { setTurns(0); setZoom(1); setPan({ x: 0, y: 0 }); setCropS(1); }} style={styles.tab}>
                  <Text style={styles.tabText}>Reset</Text>
                </Pressable>
              ) : null}
            </View>
            <Text style={styles.hint}>Drag the photo to place it, pinch to zoom, or pull a corner in to crop closer. Nothing is cut until Next.</Text>
          </>
        )}
        {error ? <Text style={[styles.hint, { color: colors.danger }]}>{error}</Text> : null}
      </View>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  title: { ...typography.bodyStrong, color: 'white' },
  next: { paddingHorizontal: spacing.lg, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.brand },
  nextText: { ...typography.smallStrong, color: colors.brandInk },
  stage: { flex: 1, backgroundColor: '#000', overflow: 'hidden' },
  wideFrame: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center' },
  wideBox: { width: '100%', aspectRatio: 16 / 9, overflow: 'hidden' },
  // A computer's stage is wide and short: a portrait post shows in a phone-shaped box in the middle rather than cropped to the whole stage.
  tallFrame: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  tallBox: { height: '100%', aspectRatio: 9 / 16, maxWidth: '100%', overflow: 'hidden', backgroundColor: '#000' },
  sound: { position: 'absolute', right: 12, top: 12, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: 'rgba(0,0,0,0.55)' },
  soundText: { ...typography.caption, color: 'white', letterSpacing: 0 },
  time: { position: 'absolute', left: 12, bottom: 12, color: 'white', ...typography.caption, letterSpacing: 0, backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.pill },
  busy: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.35)' },
  busyText: { ...typography.smallStrong, color: 'white' },
  tools: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.md, backgroundColor: '#000' },
  tabs: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)' },
  tabOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  tabText: { ...typography.smallStrong, color: 'white' },
  rangeText: { ...typography.caption, color: 'rgba(255,255,255,0.7)', marginLeft: 'auto', letterSpacing: 0 },
  strip: { height: 56, borderRadius: radius.sm, overflow: 'visible' },
  cropEdge: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)' },
  dimPane: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.55)' },
  cropBox: { position: 'absolute', borderWidth: 1.5, borderColor: 'white' },
  photoStage: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  photoWindow: { overflow: 'visible', backgroundColor: '#000' },
  photoDim: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.6)' },
  zoomBadge: { position: 'absolute', top: 10, alignSelf: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: 'rgba(0,0,0,0.55)' },
  zoomBadgeText: { ...typography.caption, color: 'white', letterSpacing: 0 },
  corner: { position: 'absolute', width: 36, height: 36, alignItems: 'center', justifyContent: 'center', zIndex: 3 },
  cornerMark: { width: 22, height: 22, borderColor: 'white' },
  gridLine: { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.55)' },
  zoomRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, height: 56 },
  zoomStrip: { flex: 1, height: 32, justifyContent: 'center' },
  zoomTrack: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden' },
  zoomFill: { height: 4, backgroundColor: colors.brand },
  zoomKnob: { position: 'absolute', top: 7, marginLeft: -9, width: 18, height: 18, borderRadius: 9, backgroundColor: 'white' },
  zoomText: { ...typography.smallStrong, color: 'white', minWidth: 36, textAlign: 'right' },
  frames: { flexDirection: 'row', height: 56, borderRadius: radius.sm, overflow: 'hidden', backgroundColor: '#222' },
  frame: { flex: 1, height: 56 },
  dim: { position: 'absolute', top: 0, height: 56, backgroundColor: 'rgba(0,0,0,0.55)' },
  window: { position: 'absolute', top: 0, height: 56, borderWidth: 2, borderColor: colors.brand, borderRadius: 4 },
  playhead: { position: 'absolute', left: 0, top: -4, width: 2, height: 64, backgroundColor: 'white' },
  tapToPause: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  pausedBadge: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)' },
  handle: { position: 'absolute', top: 0, width: HANDLE, height: 56, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', borderRadius: 4 },
  grip: { width: 3, height: 22, borderRadius: 2, backgroundColor: colors.brandInk },
  cursor: { position: 'absolute', top: -3, width: CURSOR, height: 62, borderRadius: 6, borderWidth: 2.5, borderColor: 'white', backgroundColor: 'rgba(255,255,255,0.12)' },
  reading: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  hint: { ...typography.caption, color: 'rgba(255,255,255,0.6)', letterSpacing: 0 },
  hintTwoLines: { minHeight: 30 },
});
