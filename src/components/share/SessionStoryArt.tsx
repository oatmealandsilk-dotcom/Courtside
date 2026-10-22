import React, { useMemo } from 'react';
import { Image, StyleSheet, Text, View, type TextStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { SessionCard } from '@/components/session/SessionCard';
import { SessionStamp } from '@/components/share/SessionStamp';
import { HeartRateOverlay, heartRateOf } from '@/components/share/HeartRateOverlay';
import { ShadedMark, type Halo } from '@/components/share/ShadedMark';
import { useShareDensity } from '@/components/share/density';
import { duration } from '@/lib/format';
import { scoreLine } from '@/features/activity/format';
import { scoreScale } from '@/features/activity/score';
import { formatDistance } from '@/features/activity/workouts';
import type { ID } from '@/data/types';
import type { SessionStory } from '@/features/share/sessionStory';
import { useTheme } from '@/theme/ThemeProvider';
import { colors, font } from '@/theme';
import { TextScale } from '@/theme/textScale';

/** The pictures a session can be shared as, in the order they are offered. */
export type StoryDesign = 'photo' | 'card' | 'sticker' | 'overlay' | 'heart';
export const STORY_DESIGNS: { key: StoryDesign; label: string }[] = [
  { key: 'photo', label: 'Photo' },
  { key: 'card', label: 'Card' },
  { key: 'sticker', label: 'Sticker' },
  // Clear is no longer a design of its own but the first colour dot (Oct 15, owner: "there should not be
  // multiple of same formats"): Sticker under it was the very same picture.
  { key: 'overlay', label: 'Overlay' },
];

/**
 * The designs laid over a story of your own as a see-through sticker:
 * everything but Photo and Card, and Card too when the Clear colour dot is
 * picked (`clear`: it has nothing filled then).
 */
export const seeThrough = (design: StoryDesign, clear = false) => design !== 'photo' && (design !== 'card' || clear);

/** The designs drawn in a court's colours, which the share screen's colour dots change: Photo, Card and Sticker. */
export const themed = (design: StoryDesign) => design === 'photo' || design === 'card' || design === 'sticker';

/**
 * The designs offered for this session: the four, and "Heart rate"
 * (HeartRateOverlay.tsx) after the Overlay for a post that shares both its
 * zones and its heart rate (Oct 10, owner), for everyone, on a phone and on
 * the web. A session never posted, or posted without them, has the four.
 */
export function storyDesigns(story: SessionStory | null): { key: StoryDesign; label: string }[] {
  if (!story || !heartRateOf(story.session)) return STORY_DESIGNS;
  return [...STORY_DESIGNS, { key: 'heart', label: 'Heart rate' }];
}

/**
 * A session as an Instagram story, 9:16, drawn at any width (everything
 * scales with it). All three are the session card the composer shows (the
 * brand's colour on this court, its wash and faint court lines, the time as
 * the headline), with the CourtSide lockup and courtsidebase.com on it:
 *
 * - 'photo': your post's photo (or clip's cover, or one you choose) edge to
 *   edge, the card small over its lower left, clear of Instagram's buttons;
 * - 'card':  the card itself filling the story;
 * - 'sticker': the card alone on a see-through ground, to lay over a story
 *   of your own;
 * - 'overlay': the numbers and the logo alone, white on nothing;
 * - 'heart': the time and calories over one bar per heart-rate zone, white
 *   on nothing like the Overlay, only for a post that shares its zones and
 *   heart rate (HeartRateOverlay.tsx).
 *
 * `clear` is the share screen's Clear colour dot (Oct 15, owner: "make clear
 * also a dot, and make it the first one", where the screen now starts): Photo,
 * Card and Sticker with nothing filled and in no court's colours, white words
 * and the mark in CourtSide's bright green. Each stays its own shape, so no
 * two pictures are the same (owner: "there should not be multiple of same
 * formats"): the Card's whole-story layout, the Sticker's small stamp, the
 * stamp in the corner of the photo.
 *
 * Only what `story` carries is drawn: its maker (sessionStory.ts) has
 * already left out health numbers that were not shared and a teen's court.
 */
export function SessionStoryArt({ design, story, width, photo, hidden = [], onPhotoLoad, clear = false }: {
  design: StoryDesign;
  story: SessionStory;
  width: number;
  /** The background for 'photo': the post's own, or one picked here. */
  photo?: string;
  hidden?: ID[];
  /** Told when the photo has drawn (or failed), so the picture waits for it. */
  onPhotoLoad?: (ok: boolean) => void;
  /** The Clear colour dot: Photo, Card and Sticker with nothing filled. */
  clear?: boolean;
}) {
  useTheme();
  // Fixed-point shadows grow with a sharper copy (density.ts), so it looks the same.
  const d = useShareDensity();
  // One source object per photo: a new one each draw makes a browser load it again.
  const source = useMemo(() => (photo ? { uri: photo } : undefined), [photo]);
  const height = Math.round((width * 16) / 9);
  const common = { session: story.session, eyebrow: story.eyebrow, place: story.place, hidden, brand: true, play: false, picture: true } as const;

  if (design === 'card') {
    return (
      <View collapsable={false} style={{ width, height }}>
        {/* Instagram's own buttons cover roughly the top 13% and the bottom 17%: the numbers keep clear of both. */}
        {/* The session's saved score is on it by itself (Oct 6): added or changed in the session's edit, never here. */}
        <SessionCard {...common} width={width} aspect={9 / 16} radius={0} scale={1.14} inset={{ top: Math.round(height * 0.12), bottom: Math.round(height * 0.11) }} clear={clear} />
      </View>
    );
  }

  if (design === 'heart') {
    // The zones as bars under the time and calories (Oct 10, owner): only when the post shares them;
    // else (never offered then, but asked for anyway) the Overlay below.
    const hr = heartRateOf(story.session);
    if (hr) return <HeartRateOverlay hr={hr} width={width} />;
  }

  if (design === 'overlay' || design === 'heart') {
    // Strava's overlay (Oct 4): just the numbers and the mark in white on nothing, to lay over any story.
    const s = story.session;
    const score = scoreLine(s);
    const stats = [
      score ? { label: 'Score', value: score } : null,
      { label: 'Time', value: duration(s.minutes) },
      // A workout's distance (migration 107); tennis never has one.
      s.workout && formatDistance(s.distanceM) ? { label: 'Distance', value: formatDistance(s.distanceM)! } : null,
      s.kcal ? { label: 'Calories', value: `${s.kcal}` } : null,
      // Max HR is the number worth showing; Avg HR only when there is no max (an average typed in by hand):
      // fewer, bigger numbers read better on a story (Oct 17, owner: "Drop avg hr"). It stays on Heart rate and the post.
      s.avgHr && s.maxHr == null ? { label: 'Avg HR', value: `${s.avgHr} bpm` } : null,
      s.maxHr != null ? { label: 'Max HR', value: `${s.maxHr} bpm` } : null,
    ].filter((x): x is { label: string; value: string } => !!x);
    const u = width / 360;
    // A soft dark shadow under the logo, as the white numbers have (Oct 9, owner: "the white shadow is off putting").
    const halo: Halo = 'dark';
    return (
      // Centred on what Instagram leaves clear (its buttons cover about 13% at the top and 17% at the
      // foot), so the bigger logo under the numbers stays clear of the reply bar.
      <View collapsable={false} style={[styles.centre, { width, height, gap: 14 * u, paddingBottom: 26 * u }]}>
        {stats.map((st) => {
          // A long score (tiebreak points since Oct 10, like 7–6(5) 6–7(3) (10–7)) a little smaller, so it stays on
          // one line across the story; a longer one still (five sets with tiebreaks) goes onto a second line, centred.
          const k = st.label === 'Score' ? scoreScale(st.value, 15) : 1;
          return (
            <View key={st.label} style={styles.centre}>
              <Text maxFontSizeMultiplier={TextScale.CHROME} style={[styles.overLabel, { fontSize: 15 * u, lineHeight: 20 * u, textShadowRadius: 6 * d }]}>{st.label}</Text>
              <Text maxFontSizeMultiplier={TextScale.CHROME} style={[styles.overValue, { textShadowRadius: 8 * d, fontSize: 36 * u * k, lineHeight: 42 * u * k, maxWidth: 320 * u, textAlign: 'center' }]}>{st.value}</Text>
            </View>
          );
        })}
        {/* The logo in CourtSide's own colour (Oct 4, owner), half as big again (Oct 9, owner: "our logo rn
            is good. lets just make it bigger more prominent"): the wordmark as the sign-in page sets it, a
            little under the numbers' size. Its soft light edge is wider and brighter, so the deep green
            stands off a green, blue or night court; the bright green, the same on
            every court (Oct 10, owner), gets a soft dark shadow instead, as the white numbers have. */}
        <View style={[styles.overBrand, { gap: 8 * u, marginTop: 12 * u }]}>
          <ShadedMark size={33 * u} u={u} color={colors.brandBright} halo={halo} weight={1.5} sideWeight={1.05} />
          <Text maxFontSizeMultiplier={TextScale.CHROME} style={[styles.overWord, { fontSize: 30 * u, lineHeight: 36 * u, letterSpacing: -0.9 * u, color: colors.brandBright }, wordHalo(halo, u)]}>CourtSide</Text>
        </View>
      </View>
    );
  }

  if (clear && design === 'sticker') {
    // The Sticker without its card: white on nothing, no shadow round a box that is not there. Bigger than the
    // filled Sticker (Oct 15, owner: "make the clear one more visable"): with no box to frame it, its words need the room.
    const cardW = Math.round(width * 0.84);
    return (
      <View collapsable={false} style={[styles.centre, { width, height }]}>
        <SessionStamp session={story.session} eyebrow={story.eyebrow} place={story.place} hidden={hidden} width={cardW} clear />
      </View>
    );
  }

  if (design === 'sticker') {
    // The stamp alone, so it sits on someone's own story without taking it over (Oct 3, Oct 4).
    const cardW = Math.round(width * 0.62);
    return (
      <View collapsable={false} style={[styles.centre, { width, height }]}>
        <View style={[styles.sticker, { borderRadius: Math.round(20 * (cardW / 300)) }, d !== 1 && dropShadow(d)]}>
          <SessionStamp session={story.session} eyebrow={story.eyebrow} place={story.place} hidden={hidden} width={cardW} />
        </View>
      </View>
    );
  }

  // Small in the corner: the photo is the story, the card is the signature (Oct 3, owner).
  const cardW = Math.round(width * 0.58);
  return (
    <View collapsable={false} style={{ width, height, overflow: 'hidden', backgroundColor: colors.court }}>
      {source ? (
        <Image source={source} resizeMode="cover" style={StyleSheet.absoluteFill} onLoad={() => onPhotoLoad?.(true)} onError={() => onPhotoLoad?.(false)} />
      ) : (
        <LinearGradient colors={[colors.court, colors.brand]} start={{ x: 0, y: 0 }} end={{ x: 0.4, y: 1 }} style={StyleSheet.absoluteFill} />
      )}
      {/* A soft shade low down, so the card reads on a bright photo too. */}
      <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.22)']} style={[styles.shade, { height: height * 0.35 }]} />
      {clear ? (
        // The Clear dot: the stamp with nothing filled straight on the photo, a little bigger so its words carry.
        <View style={[styles.corner, { left: Math.round(width * 0.06), bottom: Math.round(height * 0.17) }]}>
          <SessionStamp session={story.session} eyebrow={story.eyebrow} place={story.place} hidden={hidden} width={Math.round(width * 0.68)} clear />
        </View>
      ) : (
        <View style={[styles.sticker, { left: Math.round(width * 0.06), bottom: Math.round(height * 0.17), borderRadius: Math.round(20 * (cardW / 300)) }]}>
          <SessionStamp session={story.session} eyebrow={story.eyebrow} place={story.place} hidden={hidden} width={cardW} />
        </View>
      )}
    </View>
  );
}

/** The stamp's drop shadow (styles.sticker) for a copy drawn `d` times finer: its points grow with it. */
const dropShadow = (d: number) => ({ boxShadow: `0px ${6 * d}px ${22 * d}px rgba(0, 0, 0, 0.32)` });

/** The wordmark's halo, matching the mark's (ShadedMark): a glow all round, or a shadow a touch below. */
function wordHalo(halo: Halo, u: number): TextStyle {
  return halo === 'light'
    ? { textShadowColor: 'rgba(255,255,255,0.8)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 8 * u }
    : { textShadowColor: 'rgba(0,0,0,0.55)', textShadowOffset: { width: 0, height: 0.8 * u }, textShadowRadius: 7 * u };
}

const styles = StyleSheet.create({
  centre: { alignItems: 'center', justifyContent: 'center' },
  overLabel: { color: '#FFFFFF', ...font('600'), textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 6 },
  overValue: { color: '#FFFFFF', ...font('700'), letterSpacing: -0.3, textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 8 },
  overBrand: { flexDirection: 'row', alignItems: 'center' },
  // Inter ExtraBold: the logo was "too thin" over a photo, Black a tiny bit too thick (Oct 9, owner).
  overWord: { ...font('900') },
  shade: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  sticker: { position: 'absolute', boxShadow: '0px 6px 22px rgba(0, 0, 0, 0.32)' },
  corner: { position: 'absolute' },
});
