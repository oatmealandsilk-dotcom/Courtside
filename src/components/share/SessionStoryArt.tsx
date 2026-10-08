import React, { useMemo } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { BrandMark } from '@/components/BrandMark';
import { SessionCard } from '@/components/session/SessionCard';
import { SessionStamp } from '@/components/share/SessionStamp';
import { duration } from '@/lib/format';
import { scoreLine } from '@/features/activity/format';
import { formatDistance } from '@/features/activity/workouts';
import type { ID } from '@/data/types';
import type { SessionStory } from '@/features/share/sessionStory';
import { useTheme } from '@/theme/ThemeProvider';
import { colors, font } from '@/theme';

/** The three pictures a session can be shared as, in the order they are offered. */
export type StoryDesign = 'photo' | 'card' | 'sticker' | 'overlay';
export const STORY_DESIGNS: { key: StoryDesign; label: string }[] = [
  { key: 'photo', label: 'Photo' },
  { key: 'card', label: 'Card' },
  { key: 'sticker', label: 'Sticker' },
  { key: 'overlay', label: 'Overlay' },
];

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
 *   of your own.
 *
 * Only what `story` carries is drawn: its maker (sessionStory.ts) has
 * already left out health numbers that were not shared and a teen's court.
 */
export function SessionStoryArt({ design, story, width, photo, hidden = [], onPhotoLoad }: {
  design: StoryDesign;
  story: SessionStory;
  width: number;
  /** The background for 'photo': the post's own, or one picked here. */
  photo?: string;
  hidden?: ID[];
  /** Told when the photo has drawn (or failed), so the picture waits for it. */
  onPhotoLoad?: (ok: boolean) => void;
}) {
  useTheme();
  // One source object per photo: a new one each draw makes a browser load it again.
  const source = useMemo(() => (photo ? { uri: photo } : undefined), [photo]);
  const height = Math.round((width * 16) / 9);
  const common = { session: story.session, eyebrow: story.eyebrow, place: story.place, hidden, brand: true, play: false, picture: true } as const;

  if (design === 'card') {
    return (
      <View collapsable={false} style={{ width, height }}>
        {/* Instagram's own buttons cover roughly the top 13% and the bottom 17%: the numbers keep clear of both. */}
        {/* The session's saved score is on it by itself (Oct 6): added or changed in the session's edit, never here. */}
        <SessionCard {...common} width={width} aspect={9 / 16} radius={0} scale={1.14} inset={{ top: Math.round(height * 0.12), bottom: Math.round(height * 0.11) }} />
      </View>
    );
  }

  if (design === 'overlay') {
    // Strava's overlay (Oct 4): just the numbers and the mark in white on nothing, to lay over any story.
    const s = story.session;
    const score = scoreLine(s);
    const stats = [
      score ? { label: 'Score', value: score } : null,
      { label: 'Time', value: duration(s.minutes) },
      // A workout's distance (migration 107); tennis never has one.
      s.workout && formatDistance(s.distanceM) ? { label: 'Distance', value: formatDistance(s.distanceM)! } : null,
      s.kcal ? { label: 'Calories', value: `${s.kcal}` } : null,
      s.avgHr ? { label: 'Avg HR', value: `${s.avgHr} bpm` } : null,
      s.maxHr != null ? { label: 'Max HR', value: `${s.maxHr} bpm` } : null,
    ].filter((x): x is { label: string; value: string } => !!x);
    const u = width / 360;
    return (
      <View collapsable={false} style={[styles.centre, { width, height, gap: 14 * u }]}>
        {stats.map((st) => (
          <View key={st.label} style={styles.centre}>
            <Text style={[styles.overLabel, { fontSize: 15 * u, lineHeight: 20 * u }]}>{st.label}</Text>
            <Text style={[styles.overValue, { fontSize: 36 * u, lineHeight: 42 * u }]}>{st.value}</Text>
          </View>
        ))}
        <View style={[styles.overBrand, { gap: 6 * u, marginTop: 10 * u }]}>
          {/* The logo in CourtSide's own colour (Oct 4, owner), with a soft light edge so it holds on a dark photo too. */}
          <BrandMark size={22 * u} color={colors.brand} />
          <Text style={[styles.overWord, { fontSize: 20 * u, lineHeight: 26 * u, color: colors.brand }]}>CourtSide</Text>
        </View>
      </View>
    );
  }

  if (design === 'sticker') {
    // The stamp alone, so it sits on someone's own story without taking it over (Oct 3, Oct 4).
    const cardW = Math.round(width * 0.62);
    return (
      <View collapsable={false} style={[styles.centre, { width, height }]}>
        <View style={[styles.sticker, { borderRadius: Math.round(20 * (cardW / 300)) }]}>
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
      <View style={[styles.sticker, { left: Math.round(width * 0.06), bottom: Math.round(height * 0.17), borderRadius: Math.round(20 * (cardW / 300)) }]}>
        <SessionStamp session={story.session} eyebrow={story.eyebrow} place={story.place} hidden={hidden} width={cardW} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  centre: { alignItems: 'center', justifyContent: 'center' },
  overLabel: { color: '#FFFFFF', ...font('600'), textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 6 },
  overValue: { color: '#FFFFFF', ...font('700'), letterSpacing: -0.5, textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 8 },
  overBrand: { flexDirection: 'row', alignItems: 'center' },
  overWord: { ...font('700'), letterSpacing: -0.4, textShadowColor: 'rgba(255,255,255,0.55)', textShadowRadius: 8 },
  shade: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  sticker: { position: 'absolute', boxShadow: '0px 6px 22px rgba(0, 0, 0, 0.32)' },
});
