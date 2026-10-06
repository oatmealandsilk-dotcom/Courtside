import React, { useMemo } from 'react';
import { Image, Platform, StyleSheet, Text, View, type TextStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';

import { BrandMark } from '@/components/BrandMark';
import type { SessionDetail } from '@/data/types';
import { overlayStats, type FigurePiece } from '@/features/share/storyOverlay';
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

/** A figure ("1h 24m", "612 cal", "6–4 6–3") on one baseline: the units at half size, in a quieter white. */
function Figure({ pieces, size, shade }: { pieces: FigurePiece[]; size: number; shade: TextStyle }) {
  return (
    <Text allowFontScaling={false} numberOfLines={1} style={[{ ...font('600'), fontSize: size, lineHeight: Math.round(size * 1.1), letterSpacing: -0.04 * size, color: WHITE, fontVariant: ['tabular-nums'] }, shade]}>
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
  // A long score ("6–4 3–6 10–8") takes both figures down a size, so the two columns still fit.
  const long = !!numbers?.stats.some((st) => st.value.reduce((n, p) => n + p.text.length, 0) > 9);
  const size = (long ? 21 : 26) * u;
  const shade: TextStyle = { textShadowColor: 'rgba(0,0,0,0.45)', textShadowOffset: { width: 0, height: 0.5 * u }, textShadowRadius: 5 * u };
  const mark = 24 * u;
  return (
    <View style={{ maxWidth: MAX_W * u }}>
      {numbers ? (
        <>
          <View style={[styles.row, { alignItems: 'flex-start', gap: 20 * u }]}>
            {numbers.stats.map((st) => (
              <View key={st.label} style={{ flexShrink: st === numbers.stats[0] ? 0 : 1 }}>
                <Text allowFontScaling={false} numberOfLines={1} style={[{ ...font('500'), fontSize: 11 * u, lineHeight: 14 * u, color: MUTED, marginBottom: 1 * u }, shade]}>{st.label}</Text>
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
 * The story-sized picture the overlay is photographed in, 9:16 at `width`.
 *
 * - No `photo`: a see-through canvas the size of the story, with the overlay
 *   at its lower left. Instagram places a shared sticker in the middle of the
 *   story and gives no way to say where (mediaStory.ts), so a sticker as big
 *   as the story itself is how the overlay lands low and to the left, out of
 *   the way, while it can still be moved, pinched or deleted there.
 * - With `photo`: the photo filling the story (cropped to 9:16, as the
 *   session's Photo design does), a faint shade low down, and the overlay
 *   drawn onto it, so Instagram gets one finished picture and no sticker.
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
  const height = Math.round((width * 16) / 9);
  // One source object per photo: a new one each draw would load it again.
  const source = useMemo(() => (photo ? { uri: photo } : undefined), [photo]);
  return (
    <View collapsable={false} style={{ width, height, overflow: 'hidden' }}>
      {source ? (
        <>
          <Image source={source} resizeMode="cover" style={StyleSheet.absoluteFill} onLoad={() => onPhotoLoad?.(true)} onError={() => onPhotoLoad?.(false)} />
          <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.28)']} style={[styles.shade, { height: height * 0.38 }]} />
        </>
      ) : null}
      <View style={{ position: 'absolute', left: OVERLAY_INSET.left * u, bottom: OVERLAY_INSET.bottom * u }}>
        <StoryOverlay handle={handle} session={session} place={place} u={u} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  shade: { position: 'absolute', left: 0, right: 0, bottom: 0 },
});
