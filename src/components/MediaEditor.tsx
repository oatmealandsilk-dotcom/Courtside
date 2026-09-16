import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, PanResponder, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

import type { PickedMedia } from '@/components/MediaPicker';
import { VideoSurface, type VideoSurfaceHandle } from '@/components/VideoSurface';
import { framesAt, type Frame } from '@/features/compose/frames';
import { editPhoto, type Aspect } from '@/features/compose/photoEdit';
import { colors, radius, spacing, typography } from '@/theme';

/** What leaves the editor: the media to post and how to play it. */
export interface EditedMedia {
  media: PickedMedia;
  orientation: 'portrait' | 'landscape';
  trimStart?: number;
  trimEnd?: number;
  /** Posted without sound. */
  muted?: boolean;
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
export function MediaEditor({ media, onBack, onDone }: {
  media: PickedMedia;
  onBack: () => void;
  onDone: (result: EditedMedia) => void;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isVideo = media.kind === 'video';

  /* ----------------------------------- video ---------------------------------- */
  const player = useRef<VideoSurfaceHandle>(null);
  const [duration, setDuration] = useState(0);
  const [range, setRange] = useState<[number, number]>([0, 0]);
  const [frames, setFrames] = useState<Frame[]>([]);
  const [cover, setCover] = useState<string | undefined>(media.thumbnailUrl);
  const [muted, setMuted] = useState(false);
  const [tool, setTool] = useState<'trim' | 'cover'>('trim');
  // Choosing a cover happens on a still: the video holds on whichever frame
  // is picked, and only plays again when you go back to trimming.
  const [frozenAt, setFrozenAt] = useState<number | null>(null);
  const switchTool = (next: 'trim' | 'cover') => {
    setTool(next);
    if (next === 'cover') {
      holding.current = true;
      player.current?.pause();
      const at = frozenAt ?? range[0];
      setFrozenAt(at);
      coverAtRef.current = at;
      setCoverAt(at);
      head.value = at;
      player.current?.seek(at);
      if (!cover) settleCover(at);
    } else {
      setFrozenAt(null);
      head.value = range[0];
      player.current?.seek(range[0]);
      player.current?.play();
      setTimeout(() => { holding.current = false; }, 250);
    }
  };
  const [now, setNow] = useState(0);
  // The playhead glides on the animation thread. The player only reports its
  // time a few times a second; each report starts a short straight-line run
  // to where the video will be at the next one, so the line never hops.
  const TICK = 0.1;
  const head = useSharedValue(0);
  // While a handle is being dragged, or the picture is frozen on a cover
  // frame, the line sits exactly where it is put — the player's own reports
  // (it fires one after every seek) would otherwise yank it around.
  const scrubbing = useRef(false);
  const holding = useRef(false);
  const onTime = useCallback((seconds: number) => {
    setNow(seconds);
    if (scrubbing.current || holding.current) return;
    head.value = withTiming(seconds + TICK, { duration: TICK * 1000, easing: Easing.linear });
  }, [head]);
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
  const startAt = useRef(0);
  const makeHandle = (side: 0 | 1) => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => { scrubbing.current = true; startAt.current = rangeRef.current[side]; player.current?.pause(); },
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
      player.current?.play();
      // The seek's own report lands a beat later; ignore it too.
      setTimeout(() => { scrubbing.current = false; }, 250);
    },
    onPanResponderTerminate: () => { scrubbing.current = false; },
  });
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
    framesAt(media.uri, [time]).then((got) => { if (got[0]) setCover(got[0].uri); });
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
      player.current?.pause();
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

  /* ----------------------------------- photo ---------------------------------- */
  const [turns, setTurns] = useState(0);
  const [aspect, setAspect] = useState<Aspect>('original');
  const [photoUri, setPhotoUri] = useState(media.uri);
  const [photoShape, setPhotoShape] = useState<'portrait' | 'landscape'>(media.orientation ?? 'portrait');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // How the post is framed in the feed. Picked from the picture's own shape
  // and changeable here; a landscape frame shows black either side.
  const [frame, setFrame] = useState<'portrait' | 'landscape'>(media.orientation ?? 'portrait');
  const [frameTouched, setFrameTouched] = useState(false);
  useEffect(() => { if (!frameTouched) setFrame(isVideo ? media.orientation ?? 'portrait' : photoShape); }, [isVideo, media.orientation, photoShape, frameTouched]);
  useEffect(() => {
    if (isVideo || !media.uri) return;
    if (!turns && aspect === 'original') { setPhotoUri(media.uri); setPhotoShape(media.orientation ?? 'portrait'); return; }
    let cancelled = false;
    setBusy(true);
    editPhoto(media.uri, turns, aspect)
      .then((out) => { if (!cancelled) { setPhotoUri(out.uri); setPhotoShape(out.width > out.height ? 'landscape' : 'portrait'); } })
      .catch(() => { if (!cancelled) setError('Could not apply that edit.'); })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [isVideo, media.uri, media.orientation, turns, aspect]);

  const done = async () => {
    if (isVideo) {
      const trimmed = duration && (range[0] > 0.05 || range[1] < duration - 0.05);
      let poster = cover ?? media.thumbnailUrl;
      if (!poster && media.uri) poster = (await framesAt(media.uri, [range[0]]))[0]?.uri;
      onDone({
        media: { ...media, thumbnailUrl: poster },
        orientation: frame,
        trimStart: trimmed ? Number(range[0].toFixed(2)) : undefined,
        trimEnd: trimmed ? Number(range[1].toFixed(2)) : undefined,
        muted: muted || undefined,
      });
    } else {
      onDone({ media: { ...media, uri: photoUri, thumbnailUrl: photoUri, orientation: photoShape }, orientation: frame });
    }
  };

  // The stage always fills, the way Instagram's does; how the post is framed
  // in the feed is the Portrait / Landscape choice on the next step.

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.bar}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" hitSlop={10} onPress={onBack}><Ionicons name="chevron-back" size={26} color="white" /></Pressable>
        <Text style={styles.title}>{isVideo ? 'Edit clip' : 'Edit photo'}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Next" onPress={() => { void done(); }} disabled={busy} style={[styles.next, busy && { opacity: 0.5 }]}><Text style={styles.nextText}>Next</Text></Pressable>
      </View>

      <View style={styles.stage}>
        <View style={frame === 'landscape' ? styles.wideFrame : StyleSheet.absoluteFill}>
          <View style={frame === 'landscape' ? styles.wideBox : StyleSheet.absoluteFill}>
            {isVideo && media.uri ? (
              <VideoSurface ref={player} uri={media.uri} muted={muted} fit="cover" from={range[0]} to={duration ? range[1] : undefined} paused={frozenAt !== null} onTime={onTime} onDuration={onDuration} />
            ) : photoUri ? (
              <Image accessibilityIgnoresInvertColors source={{ uri: photoUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            ) : null}
          </View>
        </View>
        {isVideo ? (
          <Pressable accessibilityRole="button" accessibilityLabel={muted ? 'Sound off' : 'Sound on'} onPress={() => setMuted((m) => !m)} style={styles.sound}>
            <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={16} color="white" />
            <Text style={styles.soundText}>{muted ? 'Sound off' : 'Sound on'}</Text>
          </Pressable>
        ) : null}
        {isVideo && duration ? <Text style={styles.time}>{frozenAt !== null ? `Cover · ${clock(frozenAt)}` : `${clock(now)} / ${clock(range[1] - range[0])}`}</Text> : null}
        {busy ? <View style={styles.busy}><Text style={styles.busyText}>Applying…</Text></View> : null}
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
              {(['trim', 'cover'] as const).map((t) => (
                <Pressable key={t} accessibilityRole="tab" accessibilityState={{ selected: tool === t }} onPress={() => switchTool(t)} style={[styles.tab, tool === t && styles.tabOn]}>
                  <Ionicons name={t === 'trim' ? 'cut-outline' : 'image-outline'} size={15} color={tool === t ? colors.brandInk : 'white'} />
                  <Text style={[styles.tabText, tool === t && { color: colors.brandInk }]}>{t === 'trim' ? 'Trim' : 'Cover'}</Text>
                </Pressable>
              ))}
              {duration ? <Text style={styles.rangeText}>{clock(range[0])} – {clock(range[1])}</Text> : null}
            </View>
            {tool === 'trim' ? (
              <View style={[styles.strip, { marginHorizontal: HANDLE }]}>
                <View style={styles.frames}>
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
            <Text style={styles.hint}>{tool === 'trim' ? 'Drag the ends to trim. The clip plays the part you keep.' : 'Drag along the strip to the frame you want as the cover.'}</Text>
          </>
        ) : (
          <>
            <View style={styles.tabs}>
              <Pressable accessibilityRole="button" accessibilityLabel="Turn" onPress={() => setTurns((t) => t + 1)} style={styles.tab}>
                <Ionicons name="refresh-outline" size={15} color="white" /><Text style={styles.tabText}>Turn</Text>
              </Pressable>
              {(['original', '9:16', '4:5', '1:1'] as Aspect[]).map((a) => (
                <Pressable key={a} accessibilityRole="button" accessibilityState={{ selected: aspect === a }} onPress={() => setAspect(a)} style={[styles.tab, aspect === a && styles.tabOn]}>
                  <Text style={[styles.tabText, aspect === a && { color: colors.brandInk }]}>{a === 'original' ? 'Original' : a}</Text>
                </Pressable>
              ))}
              {turns || aspect !== 'original' ? (
                <Pressable accessibilityRole="button" accessibilityLabel="Reset edits" onPress={() => { setTurns(0); setAspect('original'); }} style={styles.tab}>
                  <Text style={styles.tabText}>Reset</Text>
                </Pressable>
              ) : null}
            </View>
            <Text style={styles.hint}>Turn the photo, or cut it to a shape. Edits always start from the original.</Text>
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
  sound: { position: 'absolute', right: 12, top: 12, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: 'rgba(0,0,0,0.55)' },
  soundText: { ...typography.caption, color: 'white', letterSpacing: 0 },
  time: { position: 'absolute', left: 12, bottom: 12, color: 'white', ...typography.caption, letterSpacing: 0, backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.pill },
  busy: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.35)' },
  busyText: { ...typography.smallStrong, color: 'white' },
  tools: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.md, backgroundColor: '#000' },
  tabs: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill, borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)' },
  tabOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  tabText: { ...typography.smallStrong, color: 'white' },
  rangeText: { ...typography.caption, color: 'rgba(255,255,255,0.7)', marginLeft: 'auto', letterSpacing: 0 },
  strip: { height: 56, borderRadius: radius.sm, overflow: 'visible' },
  frames: { flexDirection: 'row', height: 56, borderRadius: radius.sm, overflow: 'hidden', backgroundColor: '#222' },
  frame: { flex: 1, height: 56 },
  dim: { position: 'absolute', top: 0, height: 56, backgroundColor: 'rgba(0,0,0,0.55)' },
  window: { position: 'absolute', top: 0, height: 56, borderWidth: 2, borderColor: colors.brand, borderRadius: 4 },
  playhead: { position: 'absolute', left: 0, top: -4, width: 2, height: 64, backgroundColor: 'white' },
  handle: { position: 'absolute', top: 0, width: HANDLE, height: 56, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', borderRadius: 4 },
  grip: { width: 3, height: 22, borderRadius: 2, backgroundColor: colors.brandInk },
  cursor: { position: 'absolute', top: -3, width: CURSOR, height: 62, borderRadius: 6, borderWidth: 2.5, borderColor: 'white', backgroundColor: 'rgba(255,255,255,0.12)' },
  reading: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  hint: { ...typography.caption, color: 'rgba(255,255,255,0.6)', letterSpacing: 0 },
});
