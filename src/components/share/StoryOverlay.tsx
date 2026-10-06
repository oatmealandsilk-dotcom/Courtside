import React, { useEffect, useMemo, useState } from 'react';
import { Image, Platform, StyleSheet, Text, View, type TextStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';

import { BrandMark } from '@/components/BrandMark';
import type { SessionDetail } from '@/data/types';
import { FIGURE_TRACKING, LABEL_SIZE, overlayFit, overlayStats, storyFill, type FigurePiece } from '@/features/share/storyOverlay';
import { font } from '@/theme';

/*
 * The CourtSide overlay on a clip or photo shared to an Instagram story
 * (Oct 5, owner: "Can't be in the middle of the screen", then "Make it better
 * like how like Strava would do"). No box: white type with a soft shadow, so
 * it reads on any footage, the way Strava's, Nike Run Club's and WHOOP's
 * story overlays do. With a session on the post, Strava's stats sticker
 * comes first (a small label over each big figure: what it was and how long,
 * then the score or one other number, where it was played), then a fine rule
 * and the signature: the CourtSide mark beside "@handle" over "on CourtSide".
 * Without one, the signature alone.
 *
 * White on purpose, whatever the court theme: it sits on someone's video,
 * not on a CourtSide page (as the session share page's Overlay design does).
 *
 * Everything is in units of a 360-wide story (`u`), the way SessionStoryArt
 * draws, so the picture is the same on every phone.
 */

const WHITE = '#FFFFFF';
const SOFT = 'rgba(255,255,255,0.88)';
const MUTED = 'rgba(255,255,255,0.85)';

/** The overlay's corner on a 360 × 640 story: in from the left, and clear of Instagram's reply bar below. */
export const OVERLAY_INSET = { left: 24, bottom: 100 } as const;
/** At most a little over half the story's width (Strava's sticker is about that). */
const MAX_W = 200;

/**
 * How big Instagram shows the 1080 × 1920 see-through sticker, as a share of
 * the story: 1 is filling it. Meta does not say; 1 is assumed until it is
 * measured on a phone (docs/instagram-stories.md, "Measuring the sticker").
 * Set lower, the overlay is drawn bigger and further out on the sticker, so
 * that once Instagram shrinks it about the middle it lands at about the same
 * size and spot (as near the corner as the sticker's own edge allows).
 */
export const STICKER_SHOWN_AT = 1;

/** Instagram's name and progress bar across the top of a story, in units of a 640-high story (12%). */
const TOP_BAR = 72;

/** A figure ("1h 24m", "612 cal", "6–4 6–3") on one baseline: the units at half size, in a quieter white. */
function Figure({ pieces, size, shade }: { pieces: FigurePiece[]; size: number; shade: TextStyle }) {
  return (
    // Sized to fit by overlayFit; shrinking to fit is only a last resort, never "…".
    <Text allowFontScaling={false} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={[{ ...font('600'), fontSize: size, lineHeight: Math.round(size * 1.1), letterSpacing: FIGURE_TRACKING * size, color: WHITE, fontVariant: ['tabular-nums'] }, shade]}>
      {pieces.map((p, i) => (p.unit
        ? <Text key={i} style={{ ...font('500'), fontSize: size * 0.5, letterSpacing: 0, color: MUTED }}>{p.text}</Text>
        : <Text key={i}>{p.text}</Text>))}
    </Text>
  );
}

/**
 * The mark in white with a soft shadow under it. iPhone draws a view's shadow
 * from its own shapes when it has no background; Android cannot (and its
 * snapshot skips the blur effects that could), so there a faint dark copy sits
 * just under it instead.
 */
function Mark({ size, u }: { size: number; u: number }) {
  if (Platform.OS === 'ios') {
    return (
      <View style={{ shadowColor: '#000000', shadowOpacity: 0.45, shadowRadius: 2.5 * u, shadowOffset: { width: 0, height: 0.5 * u } }}>
        <BrandMark size={size} color={WHITE} />
      </View>
    );
  }
  return (
    <View style={{ width: size, height: size }}>
      <View style={{ position: 'absolute', left: 0, top: 0.8 * u }}>
        <BrandMark size={size} color="rgba(0,0,0,0.32)" />
      </View>
      <BrandMark size={size} color={WHITE} />
    </View>
  );
}

/**
 * The overlay itself, sized to what it says (at most `MAX_W` of 360). Drawn
 * by StoryOverlayCanvas at the story's lower left.
 */
export function StoryOverlay({ handle, session, place, u }: {
  handle: string;
  /** The post's session; only what overlayStats keeps is shown. */
  session?: SessionDetail;
  /** The court or place, already cleared for this person (storyFromPost: adults only). */
  place?: string;
  /** One unit of a 360-wide story. */
  u: number;
}) {
  const numbers = overlayStats(session);
  // Side by side at the largest size that fits; a long score ("6–4 3–6 10–7") one above the other (overlayFit).
  const fit = numbers ? overlayFit(numbers.stats, MAX_W) : null;
  const size = (fit?.size ?? 26) * u;
  const shade: TextStyle = { textShadowColor: 'rgba(0,0,0,0.45)', textShadowOffset: { width: 0, height: 0.5 * u }, textShadowRadius: 5 * u };
  const mark = 24 * u;
  return (
    <View style={{ maxWidth: MAX_W * u }}>
      {numbers && fit ? (
        <>
          <View style={fit.stacked ? { gap: 6 * u } : [styles.row, { alignItems: 'flex-start', gap: fit.gap * u }]}>
            {numbers.stats.map((st, i) => (
              <View key={st.label} style={fit.stacked ? undefined : { flexShrink: i === 0 ? 0 : 1 }}>
                <Text allowFontScaling={false} numberOfLines={1} style={[{ ...font('500'), fontSize: LABEL_SIZE * u, lineHeight: 14 * u, color: MUTED, marginBottom: 1 * u }, shade]}>{st.label}</Text>
                <Figure pieces={st.value} size={size} shade={shade} />
              </View>
            ))}
          </View>
          {place ? (
            <View style={[styles.row, { gap: 3 * u, marginTop: 4 * u }]}>
              <Ionicons name="location-outline" size={12 * u} color={SOFT} allowFontScaling={false} style={shade} />
              <Text allowFontScaling={false} numberOfLines={1} style={[{ ...font('500'), fontSize: 12 * u, lineHeight: 15 * u, color: SOFT, flexShrink: 1 }, shade]}>{place}</Text>
            </View>
          ) : null}
          {numbers.source ? (
            <Text allowFontScaling={false} numberOfLines={1} style={[{ ...font('500'), fontSize: 10.5 * u, lineHeight: 13 * u, color: 'rgba(255,255,255,0.75)', marginTop: 2 * u }, shade]}>{numbers.source}</Text>
          ) : null}
          <View style={{ height: Math.max(StyleSheet.hairlineWidth, 1 * u), backgroundColor: 'rgba(255,255,255,0.55)', marginTop: 11 * u, marginBottom: 10 * u }} />
        </>
      ) : null}
      <View style={[styles.row, { gap: 7 * u }]}>
        {/* Pulled left by the mark's own margin, so its first line sits under the words above. */}
        <View style={{ marginLeft: -3 * u }}><Mark size={mark} u={u} /></View>
        <View style={{ flexShrink: 1 }}>
          <Text allowFontScaling={false} numberOfLines={1} style={[{ ...font('700'), fontSize: 14.5 * u, lineHeight: 17 * u, color: WHITE }, shade]}>@{handle}</Text>
          <Text allowFontScaling={false} numberOfLines={1} style={[{ ...font('600'), fontSize: 11 * u, lineHeight: 14 * u, color: SOFT }, shade]}>on CourtSide</Text>
        </View>
      </View>
    </View>
  );
}

/**
 * The photo's width over its height, once known: Image.getSize, before the
 * photo is drawn, so it is laid out the right way from the start. null when
 * it could not be read (the photo is then filled in, and most likely will
 * not load either); undefined while it is still being read.
 */
function usePhotoShape(photo: string | undefined): number | null | undefined {
  const [shape, setShape] = useState<{ photo: string; aspect: number | null } | null>(null);
  useEffect(() => {
    if (!photo) return undefined;
    let live = true;
    Image.getSize(
      photo,
      (w, h) => { if (live) setShape({ photo, aspect: w > 0 && h > 0 ? w / h : null }); },
      () => { if (live) setShape({ photo, aspect: null }); },
    );
    return () => { live = false; };
  }, [photo]);
  return photo && shape?.photo === photo ? shape.aspect : undefined;
}

/**
 * The story-sized picture the overlay is photographed in, 9:16 at `width`.
 *
 * - No `photo`: a see-through canvas the size of the story, with the overlay
 *   at its lower left. Instagram places a shared sticker in the middle of the
 *   story and gives no way to say where (mediaStory.ts), so a sticker as big
 *   as the story itself is how the overlay lands low and to the left, out of
 *   the way, while it can still be moved, pinched or deleted there.
 * - With `photo`: the overlay drawn onto the photo, so Instagram gets one
 *   finished picture and no sticker. A tall photo fills the story (cropped
 *   to 9:16, as the session's Photo design does) with a faint shade low
 *   down. A landscape or square one would lose most of its width that way
 *   (a 16:9 photo keeps only its middle third), so it is shown whole, the
 *   full width of the story, over the same two court colours a clip gets
 *   (storyFill), between Instagram's top bar and the overlay.
 */
export function StoryOverlayCanvas({ width, handle, session, place, photo, onPhotoLoad }: {
  width: number;
  handle: string;
  session?: SessionDetail;
  place?: string;
  photo?: string;
  /** Told when the photo has drawn (or failed), so it is only photographed once it is there. */
  onPhotoLoad?: (ok: boolean) => void;
}) {
  const u = width / 360;
  // Exactly 9:16, unrounded: the hidden stage it is photographed in is 1080 × 1920 pixels in the
  // page's units (stageSize), and a rounded height left a thin black line along a photo's foot on
  // phones whose pixel ratio is not a whole number.
  const height = (width * 16) / 9;
  // One source object per photo: a new one each draw would load it again.
  const source = useMemo(() => (photo ? { uri: photo } : undefined), [photo]);
  const aspect = usePhotoShape(photo);

  // The sticker: Instagram shows it shrunk by STICKER_SHOWN_AT about the middle, so the overlay is
  // drawn that much bigger and further out (up to the sticker's own edge) to land where it should.
  const k = photo ? 1 : Math.min(1, Math.max(0.5, STICKER_SHOWN_AT));
  const ou = u / k;
  const left = Math.max(8, 180 - (180 - OVERLAY_INSET.left) / k) * u;
  const bottom = Math.max(8, 320 - (320 - OVERLAY_INSET.bottom) / k) * u;

  // A photo shown whole when it fits, the full width, between Instagram's top bar and the overlay
  // (the signature, and the numbers when there are any); filling the story otherwise.
  const reserve = (OVERLAY_INSET.bottom + (overlayStats(session) ? 150 : 34) + 14) * u;
  const photoH = aspect ? width / aspect : 0;
  const whole = !!aspect && photoH <= height - reserve - TOP_BAR * u;
  const photoTop = Math.max(TOP_BAR * u, Math.min((height - photoH) / 2, height - reserve - photoH));
  const fill = photo ? storyFill() : null;

  return (
    // A solid dark ground behind a photo, so nothing see-through can reach the JPEG (it comes out black there).
    <View collapsable={false} style={{ width, height, overflow: 'hidden', backgroundColor: fill?.bottom }}>
      {/* The photo once its shape is known. fadeDuration 0: Android fades a downloaded picture in over
          300 ms after it loads, and the picture is taken two frames after (iPhone ignores it). */}
      {source && aspect !== undefined ? (
        whole && fill ? (
          <>
            <LinearGradient colors={[fill.top, fill.bottom]} style={StyleSheet.absoluteFill} />
            <Image source={source} resizeMode="cover" fadeDuration={0} style={{ position: 'absolute', left: 0, top: photoTop, width, height: photoH }} onLoad={() => onPhotoLoad?.(true)} onError={() => onPhotoLoad?.(false)} />
          </>
        ) : (
          <>
            <Image source={source} resizeMode="cover" fadeDuration={0} style={StyleSheet.absoluteFill} onLoad={() => onPhotoLoad?.(true)} onError={() => onPhotoLoad?.(false)} />
            <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.28)']} style={[styles.shade, { height: height * 0.38 }]} />
          </>
        )
      ) : null}
      <View style={{ position: 'absolute', left, bottom }}>
        <StoryOverlay handle={handle} session={session} place={place} u={ou} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  shade: { position: 'absolute', left: 0, right: 0, bottom: 0 },
});
