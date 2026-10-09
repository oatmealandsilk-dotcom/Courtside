import React, { useEffect, useMemo, useState } from 'react';
import { Image, StyleSheet, Text, View, type TextStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { ShadedMark } from '@/components/share/ShadedMark';
import { storyFill } from '@/features/share/storyOverlay';
import { font } from '@/theme';

/*
 * The CourtSide overlay on a clip or photo shared to an Instagram story
 * (Oct 5, owner: "Can't be in the middle of the screen", then "Make it better
 * like how like Strava would do"). No box: white type with a soft shadow, so
 * it reads on any footage, the way Strava's, Nike Run Club's and WHOOP's
 * story overlays do.
 *
 * The signature alone, on every clip and photo, session or not (Oct 5, owner,
 * choosing between "Clip with a match" and "Clip, no session": "Clip no
 * session"): the CourtSide mark beside "@handle" over "on CourtSide". Never a
 * session's numbers or where it was played.
 *
 * White on purpose, whatever the court theme: it sits on someone's video,
 * not on a CourtSide page (as the session share page's Overlay design does).
 *
 * Everything is in units of a 360-wide story (`u`), the way SessionStoryArt
 * draws, so the picture is the same on every phone.
 */

const WHITE = '#FFFFFF';
const SOFT = 'rgba(255,255,255,0.88)';

/** The overlay's corner on a 360 × 640 story: in from the left, and clear of Instagram's reply bar below. */
export const OVERLAY_INSET = { left: 24, bottom: 100 } as const;
/**
 * Half as big again as it was (Oct 9, owner: "our logo rn is good. lets just
 * make it bigger more prominent"): the same mark and words, in units of 360.
 */
const MARK = 36;
const HANDLE = { size: 21.5, line: 25 };
const SUB = { size: 16, line: 19 };
/** At most about two thirds of the story's width: room for a 15-letter @handle, a longer one ends in "…". */
const MAX_W = 250;
/** The overlay's height (the mark beside two lines), for laying a photo out above it. */
const OVERLAY_H = HANDLE.line + SUB.line;

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

/**
 * The overlay itself: the CourtSide mark beside "@handle" over "on
 * CourtSide", at most `MAX_W` of 360 wide. Drawn by StoryOverlayCanvas at the
 * story's lower left.
 */
export function StoryOverlay({ handle, u }: {
  handle: string;
  /** One unit of a 360-wide story. */
  u: number;
}) {
  // A little deeper and wider than it was, to go with the bigger words on a busy clip.
  const shade: TextStyle = { textShadowColor: 'rgba(0,0,0,0.55)', textShadowOffset: { width: 0, height: 0.8 * u }, textShadowRadius: 7 * u };
  return (
    <View style={{ maxWidth: MAX_W * u }}>
      <View style={[styles.row, { gap: 10 * u }]}>
        {/* Pulled left by the mark's own margin, so the mark itself, not the space round it, starts at the corner. */}
        <View style={{ marginLeft: -(MARK * 0.125) * u }}><ShadedMark size={MARK * u} u={u} color={WHITE} halo="dark" weight={1.45} sideWeight={1.05} /></View>
        <View style={{ flexShrink: 1 }}>
          <Text allowFontScaling={false} numberOfLines={1} style={[{ ...font('700'), fontSize: HANDLE.size * u, lineHeight: HANDLE.line * u, color: WHITE }, shade]}>@{handle}</Text>
          <Text allowFontScaling={false} numberOfLines={1} style={[{ ...font('700'), fontSize: SUB.size * u, lineHeight: SUB.line * u, color: SOFT }, shade]}>on CourtSide</Text>
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
export function StoryOverlayCanvas({ width, handle, photo, onPhotoLoad }: {
  width: number;
  handle: string;
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

  // A photo shown whole when it fits, the full width, between Instagram's top bar and the overlay;
  // filling the story otherwise.
  const reserve = (OVERLAY_INSET.bottom + OVERLAY_H + 14) * u;
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
        <StoryOverlay handle={handle} u={ou} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  shade: { position: 'absolute', left: 0, right: 0, bottom: 0 },
});
