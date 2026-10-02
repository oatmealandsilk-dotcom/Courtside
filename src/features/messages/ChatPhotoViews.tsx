import React, { useEffect, useMemo, useRef, useState } from 'react';
import Constants from 'expo-constants';
import { Modal, Platform, Pressable, ScrollView, Share, StyleSheet, Text, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { GestureHandlerRootView, ScrollView as GestureScrollView } from 'react-native-gesture-handler';
import { Image as ExpoImage } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Directory, File, Paths } from 'expo-file-system';
import Svg, { Circle } from 'react-native-svg';
import Reanimated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ZoomableMedia, type HomeRect, type ZoomableMediaHandle } from '@/components/ZoomableMedia';
import { isLocalMedia } from '@/data/remote';
import type { ChatPhoto } from '@/data/types';
import { DemoPhoto } from '@/features/messages/DemoPhoto';
import { isDemoPhoto, photoCacheKey, useChatPhotoSource } from '@/features/messages/chatPhotos';
import { show as showToast } from '@/lib/toast';
import { colors, font, radius, spacing, typography } from '@/theme';
import { useThemedStyles } from '@/theme/ThemeProvider';

/** How wide photos sit in a chat: the same reach as a shared card. */
export const PHOTO_W = 236;
/** The thin line between photos in a grid (the page's own colour shows through). */
const GAP = 2;
/** The most tiles a grid shows; past that the last one says "+3". */
const SHOWN = 4;
/** A bubble's rounding, so photos sit in the chat like its messages. */
const ROUND = 18;

/**
 * One chat photo, filling whatever holds it: the file itself when it is on
 * this phone, else the private shelf's hour-long link (kept on the phone by
 * its shelf address, so it is fetched once). A quiet tile while the link
 * comes; a quiet picture mark if the photo can no longer be opened.
 */
export function ChatPhotoImage({ photo, fit = 'cover', recycleKey }: {
  photo: ChatPhoto; fit?: 'cover' | 'contain';
  /** Stays the same for this spot while its photo goes up (its address changes from the phone's file to the shelf's), so it is never drawn afresh. */
  recycleKey?: string;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const source = useChatPhotoSource(photo.path);
  if (isDemoPhoto(photo.path)) return <View style={StyleSheet.absoluteFill}><DemoPhoto path={photo.path} fit={fit} /></View>;
  if (source === 'unavailable') {
    return (
      <View style={[StyleSheet.absoluteFill, styles.gone]} accessibilityLabel="Photo unavailable">
        <Ionicons name="image-outline" size={22} color={colors.textFaint} />
      </View>
    );
  }
  if (!source) return <View style={[StyleSheet.absoluteFill, styles.waiting]} />;
  // A file on this phone needs no cache key. Left unset, the picture stays
  // exactly the same image when its upload lands and the address changes.
  const cacheKey = isLocalMedia(source) ? undefined : photoCacheKey(photo);
  return (
    <ExpoImage
      accessibilityIgnoresInvertColors
      source={{ uri: source, cacheKey }}
      recyclingKey={recycleKey ?? photo.path}
      style={StyleSheet.absoluteFill}
      contentFit={fit}
      cachePolicy="memory-disk"
      transition={140}
    />
  );
}

interface Tile { x: number; y: number; w: number; h: number }

/**
 * Where each photo sits: one alone at its own shape (a tall one no taller
 * than 4:3 upright, a wide one no flatter than 2:1); two side by side; more
 * in rows of two, an odd last one across the width; past four, four tiles
 * and the last says how many more.
 */
function arrange(photos: ChatPhoto[], W: number): { tiles: Tile[]; height: number } {
  const n = Math.min(photos.length, SHOWN);
  if (n <= 1) {
    const p = photos[0];
    const ratio = Math.max(0.75, Math.min(2, p ? p.w / p.h : 1));
    const h = Math.round(W / ratio);
    return { tiles: [{ x: 0, y: 0, w: W, h }], height: h };
  }
  const half = (W - GAP) / 2;
  if (n === 2) {
    const h = Math.round(half * 1.3);
    return { tiles: [{ x: 0, y: 0, w: half, h }, { x: half + GAP, y: 0, w: half, h }], height: h };
  }
  const tiles: Tile[] = [];
  let y = 0;
  for (let i = 0; i < n; i += 2) {
    const pair = i + 1 < n;
    const h = Math.round(pair ? half : half * 0.8);
    tiles.push({ x: 0, y, w: pair ? half : W, h });
    if (pair) tiles.push({ x: half + GAP, y, w: half, h });
    y += h + GAP;
  }
  return { tiles, height: y - GAP };
}

export interface TileRect { x: number; y: number; w: number; h: number }

/**
 * A photo message's pictures, the way iMessage and Instagram lay them out,
 * with rounded corners like the bubbles (the last of a run keeps the small
 * tail corner). While they go up, a ring fills over them; if they could not
 * be sent, a small mark says so (the retry is under the bubble). A tap on a
 * photo says which one and where it sits, so full screen can grow out of it.
 */
export function PhotoStack({ photos, width = PHOTO_W, mine, tail, progress, failed, idKey, sentAt, onTile, onHold }: {
  photos: ChatPhoto[];
  /** How wide they sit; narrower on a small phone. */
  width?: number;
  mine: boolean;
  tail: boolean;
  /** 0 to 1 while going up; null otherwise. */
  progress: number | null;
  failed?: boolean;
  /** The message's id: each tile keeps it as its own key while the photos go up. */
  idKey?: string;
  /** When they were sent ("9:41 AM"), for a screen reader. */
  sentAt?: string;
  /** Which photo was tapped, and where every shown photo sits (one behind "+3" has no spot), so full screen grows out of it and goes back into its own. */
  onTile: (index: number, rects: (TileRect | undefined)[]) => void;
  onHold?: () => void;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const { tiles, height } = arrange(photos, width);
  const refs = useRef<(View | null)[]>([]);
  const more = photos.length - SHOWN;
  const press = (i: number) => {
    const measure = (node: View | null | undefined) => new Promise<TileRect | undefined>((resolve) => {
      if (!node) { resolve(undefined); return; }
      node.measureInWindow((x, y, w, h) => resolve(w > 0 && h > 0 ? { x, y, w, h } : undefined));
    });
    void Promise.all(tiles.map((_, j) => measure(refs.current[j]))).then((rects) => {
      // The last tile under "+3" stands for the photos behind it, not for itself.
      onTile(i, rects.map((r, j) => (j === SHOWN - 1 && more > 0 ? undefined : r)));
    });
  };
  return (
    <View
      style={[styles.stack, { width, height }, tail && (mine ? styles.tailMine : styles.tailTheirs)]}
      accessibilityLabel={photos.length > 1 ? `${photos.length} photos` : 'Photo'}
    >
      {tiles.map((t, i) => (
        <Pressable
          // By place, not by address: a photo's address changes as its upload
          // lands, and a new key would draw the tile afresh (a blink).
          key={i}
          ref={(node) => { refs.current[i] = node; }}
          accessibilityRole="imagebutton"
          accessibilityLabel={`${photos.length > 1 ? `Photo ${i + 1} of ${photos.length}` : 'Photo'}${sentAt ? `, sent ${sentAt}` : ''}. Open`}
          onPress={() => press(i)}
          onLongPress={onHold}
          delayLongPress={320}
          style={({ pressed }) => [styles.tile, { left: t.x, top: t.y, width: t.w, height: t.h }, pressed && styles.tilePressed]}
        >
          <ChatPhotoImage photo={photos[i]} recycleKey={idKey ? `${idKey}:${i}` : undefined} />
          {i === SHOWN - 1 && more > 0 ? (
            <View style={styles.more}><Text style={styles.moreText}>+{more}</Text></View>
          ) : null}
        </Pressable>
      ))}
      {progress !== null ? (
        <Reanimated.View entering={FadeIn.duration(120)} exiting={FadeOut.duration(220)} pointerEvents="none" style={[StyleSheet.absoluteFill, styles.veil]} accessibilityLabel={`Sending, ${Math.round(progress * 100)} percent`}>
          <Ring fraction={progress} />
        </Reanimated.View>
      ) : null}
      {failed && progress === null ? (
        <View pointerEvents="none" style={styles.failedMark}><Ionicons name="alert" size={14} color={colors.brandInk} /></View>
      ) : null}
    </View>
  );
}

/** How much has gone up: a thin ring that fills clockwise from the top. */
function Ring({ fraction }: { fraction: number }) {
  const size = 40, stroke = 3.5, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.35)" strokeWidth={stroke} fill="none" />
      <Circle
        cx={size / 2} cy={size / 2} r={r} stroke="white" strokeWidth={stroke} fill="none" strokeLinecap="round"
        strokeDasharray={`${c} ${c}`} strokeDashoffset={c * (1 - Math.max(0.04, fraction))}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </Svg>
  );
}

/**
 * A chat photo, as a file on this phone the share sheet can hand on: the
 * sender's own copy as it is, anyone else's fetched once into the cache.
 */
async function photoFile(source: string): Promise<string> {
  if (source.startsWith('file:')) return source;
  const dir = new Directory(Paths.cache, 'chat-photos');
  if (!dir.exists) dir.create();
  const ext = (source.split('?')[0].match(/\.(jpe?g|png|webp|heic|heif)$/i)?.[1] ?? 'jpg').toLowerCase();
  const target = new File(dir, `courtside-photo-${Date.now().toString(36)}.${ext}`);
  return (await File.downloadFileAsync(source, target)).uri;
}

/**
 * The photo to the phone's share sheet: Messages, AirDrop, Save to Files and
 * the rest. "Save Image" (into the camera roll) is left out of the sheet for
 * now: iPhone only allows it once the app's settings carry a line asking to
 * add to the photo library, which takes a new App Store build; tapped
 * without it, the app would close. In a browser, the picture opens in a new
 * tab, where it can be saved.
 */
async function sharePhoto(source: string) {
  if (Platform.OS === 'web') { window.open(source, '_blank', 'noopener'); return; }
  const url = await photoFile(source);
  // Save Image needs the photo-library-add permission line, which builds from 11 on carry;
  // on older builds the share sheet leaves it out (it would close the app).
  const build = Number(Constants.platform?.ios?.buildNumber ?? 0);
  await Share.share({ url }, build >= 11 ? undefined : { excludedActivityTypes: ['com.apple.UIKit.activity.SaveToCameraRoll'] });
}

/**
 * A chat photo full screen: it grows out of its place in the chat, pinch to
 * look closer (it snaps back). With several, they sit in a row, as in
 * Photos and iMessage: swipe sideways for the next, or tap one in the strip
 * along the bottom. Swipe down or tap × to put it back into its place. The
 * share button hands the photo on (see sharePhoto).
 */
export function PhotoViewer({ photos, start, homes, caption, who, onClose }: {
  photos: ChatPhoto[];
  start: number;
  /** Where each photo sits in the chat, by its place in the message: the tapped one grows out of its spot, and any of them goes back into its own. */
  homes?: (TileRect | undefined)[];
  caption?: string;
  /** Who sent it and when: "Mira · Today 9:41". */
  who?: string;
  onClose: () => void;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const first = Math.max(0, Math.min(start, photos.length - 1));
  const [index, setIndex] = useState(first);
  const at = useRef(first);
  at.current = index;
  const zooms = useRef<(ZoomableMediaHandle | null)[]>([]);
  const row = useRef<ScrollView>(null);
  // A move asked for by the strip or the arrow keys: the pages it passes on the way are not "the one showing".
  const heading = useRef<number | null>(null);
  const headingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // An iPhone opens the row at the tapped photo itself; elsewhere it is moved there once laid out, and hidden until then.
  const [placed, setPlaced] = useState(first === 0 || Platform.OS === 'ios');
  const photo = photos[index];
  const source = useChatPhotoSource(photo?.path ?? '');
  // Worked out once, so each page keeps the same spot to go back to however often the viewer re-draws.
  const homeRects = useMemo(() => photos.map((_, i): HomeRect | undefined => {
    const r = homes?.[i];
    return r ? { x: r.x, y: r.y, width: r.w, height: r.h, radius: ROUND } : undefined;
  }), [homes, photos]);
  const goTo = (i: number, animated = true) => {
    const next = Math.max(0, Math.min(photos.length - 1, i));
    heading.current = next;
    if (headingTimer.current) clearTimeout(headingTimer.current);
    headingTimer.current = setTimeout(() => { heading.current = null; }, 700);
    setIndex(next);
    row.current?.scrollTo({ x: next * W, y: 0, animated });
  };
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    const i = Math.max(0, Math.min(photos.length - 1, Math.round(x / Math.max(1, W))));
    if (heading.current !== null) {
      if (i === heading.current && Math.abs(x - i * W) < 2) heading.current = null;
      return;
    }
    if (i !== at.current) setIndex(i);
  };
  const close = () => { const zoom = zooms.current[at.current]; if (zoom) zoom.close(); else onClose(); };
  useEffect(() => () => { if (headingTimer.current) clearTimeout(headingTimer.current); }, []);
  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') goTo(at.current + 1);
      else if (e.key === 'ArrowLeft') goTo(at.current - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, photos.length, W]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!photo) return null;
  const homeOf = (i: number): HomeRect | undefined => homeRects[i];
  const canShare = !!source && source !== 'unavailable' && !isDemoPhoto(photo.path);
  const share = async () => {
    if (!source || !canShare) return;
    try {
      await sharePhoto(source);
    } catch {
      showToast({ title: 'Couldn’t share this photo', body: 'Check your connection and try again.', icon: 'alert-circle-outline' });
    }
  };
  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={close} supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}>
      {/* A root of its own: a Modal is drawn apart from the app, and the row's swipe and the photo's swipe down must hear each other. */}
      <GestureHandlerRootView style={styles.viewer}>
        <Pager
          ref={row}
          horizontal
          pagingEnabled
          bounces={photos.length > 1}
          scrollEnabled={photos.length > 1}
          showsHorizontalScrollIndicator={false}
          contentOffset={{ x: first * W, y: 0 }}
          onScroll={onScroll}
          scrollEventThrottle={16}
          // Turned sideways, the row keeps the same photo in view.
          onLayout={() => { row.current?.scrollTo({ x: at.current * W, y: 0, animated: false }); if (!placed) requestAnimationFrame(() => setPlaced(true)); }}
          style={[StyleSheet.absoluteFill, !placed && styles.hidden]}
        >
          {photos.map((p, i) => (
            // By place: the same page stays put, so the opening growth plays once, for the tapped photo only.
            <View key={i} style={{ width: W, height: H }}>
              <ZoomableMedia ref={(z) => { zooms.current[i] = z; }} home={homeOf(i)} grow={i === first} dismissOn="down" onDismiss={onClose}>
                <ChatPhotoImage photo={p} fit="contain" />
              </ZoomableMedia>
            </View>
          ))}
        </Pager>
        <Reanimated.View entering={FadeIn.delay(120).duration(180)} pointerEvents="box-none" style={[styles.top, { paddingTop: insets.top + 8 }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={8} onPress={close} style={({ pressed }) => [styles.round, pressed && styles.roundPressed]}>
            <Ionicons name="close" size={22} color="white" />
          </Pressable>
          <View style={styles.topMiddle} pointerEvents="none">
            {who ? <Text style={styles.who} numberOfLines={1}>{who}</Text> : null}
            {photos.length > 1 ? <Text style={styles.count}>{index + 1} of {photos.length}</Text> : null}
          </View>
          {canShare ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Share this photo" hitSlop={8} onPress={() => { void share(); }} style={({ pressed }) => [styles.round, pressed && styles.roundPressed]}>
              <Ionicons name="share-outline" size={20} color="white" />
            </Pressable>
          ) : <View style={styles.roundSpace} />}
        </Reanimated.View>
        {caption || photos.length > 1 ? (
          <Reanimated.View entering={FadeIn.delay(120).duration(180)} pointerEvents="box-none" style={[styles.bottom, { paddingBottom: insets.bottom + 12 }]}>
            {caption ? <Text style={styles.caption} numberOfLines={4}>{caption}</Text> : null}
            {photos.length > 1 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
                {photos.map((p, i) => (
                  <Pressable key={i} accessibilityRole="button" accessibilityLabel={`Photo ${i + 1} of ${photos.length}`} accessibilityState={{ selected: i === index }} onPress={() => goTo(i)} style={[styles.stripTile, i === index && styles.stripTileOn]}>
                    <ChatPhotoImage photo={p} />
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}
          </Reanimated.View>
        ) : null}
      </GestureHandlerRootView>
    </Modal>
  );
}

/**
 * The row of full-screen photos. On a phone it is the gesture library's own
 * scroll view, so a sideways swipe moves the row and a downward one (the
 * photo's own) closes it, each giving way to the other at once.
 */
const Pager = (Platform.OS === 'web' ? ScrollView : GestureScrollView) as typeof ScrollView;

/** A photo picked to send, still on this phone. */
export interface TrayPhoto { uri: string; width: number; height: number }

/**
 * The photos picked to send, above the message box, the way iMessage holds
 * them before Send: small tiles, each with a × to take it out, and a + to
 * pick more (up to `max`). The box below becomes the caption.
 */
export function PhotoTray({ photos, max, onRemove, onAdd }: { photos: TrayPhoto[]; max: number; onRemove: (index: number) => void; onAdd: () => void }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.tray}>
      {photos.map((p, i) => (
        <Reanimated.View key={p.uri} entering={FadeIn.duration(160)} style={styles.trayTile}>
          <ExpoImage accessibilityIgnoresInvertColors source={{ uri: p.uri }} style={styles.trayImage} contentFit="cover" />
          <Pressable accessibilityRole="button" accessibilityLabel={`Remove photo ${i + 1}`} hitSlop={8} onPress={() => onRemove(i)} style={({ pressed }) => [styles.trayRemove, pressed && { opacity: 0.7 }]}>
            <Ionicons name="close" size={13} color={colors.text} />
          </Pressable>
        </Reanimated.View>
      ))}
      {photos.length < max ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Add more photos" onPress={onAdd} style={({ pressed }) => [styles.trayAdd, pressed && { opacity: 0.6 }]}>
          <Ionicons name="add" size={24} color={colors.textMuted} />
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const styleDefinitions = StyleSheet.create({
  gone: { backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  waiting: { backgroundColor: colors.surfaceAlt },
  stack: { borderRadius: ROUND, overflow: 'hidden', backgroundColor: colors.bg },
  tailMine: { borderBottomRightRadius: 6 },
  tailTheirs: { borderBottomLeftRadius: 6 },
  tile: { position: 'absolute', overflow: 'hidden', backgroundColor: colors.surfaceAlt },
  tilePressed: { opacity: 0.88 },
  more: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.42)', alignItems: 'center', justifyContent: 'center' },
  moreText: { ...font('600'), fontSize: 22, color: 'white', letterSpacing: -0.4 },
  veil: { backgroundColor: 'rgba(0,0,0,0.32)', alignItems: 'center', justifyContent: 'center' },
  failedMark: { position: 'absolute', top: 8, right: 8, width: 24, height: 24, borderRadius: 12, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.bg },
  viewer: { flex: 1, backgroundColor: 'transparent' },
  hidden: { opacity: 0 },
  top: { position: 'absolute', left: 0, right: 0, top: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, gap: spacing.md },
  topMiddle: { flex: 1, alignItems: 'center', gap: 1 },
  who: { ...typography.smallStrong, color: 'white', textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 6, textShadowOffset: { width: 0, height: 1 } },
  count: { ...typography.caption, letterSpacing: 0.2, color: 'rgba(255,255,255,0.8)' },
  round: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  roundPressed: { backgroundColor: 'rgba(0,0,0,0.7)' },
  roundSpace: { width: 38, height: 38 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.lg, gap: spacing.md, alignItems: 'center' },
  caption: { ...typography.body, color: 'white', textAlign: 'center', maxWidth: 520, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md, backgroundColor: 'rgba(0,0,0,0.45)', overflow: 'hidden' },
  strip: { gap: 6, paddingHorizontal: 2 },
  stripTile: { width: 44, height: 44, borderRadius: 8, overflow: 'hidden', opacity: 0.6, borderWidth: 2, borderColor: 'transparent' },
  stripTileOn: { opacity: 1, borderColor: 'white' },
  tray: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: 2 },
  trayTile: { width: 66, height: 66 },
  trayImage: { width: 66, height: 66, borderRadius: 14, backgroundColor: colors.surfaceAlt },
  trayRemove: {
    position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: 11,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center',
  },
  trayAdd: { width: 66, height: 66, borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
});
