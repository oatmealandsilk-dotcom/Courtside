import React, { useMemo } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { SessionCard } from '@/components/session/SessionCard';
import type { ID } from '@/data/types';
import type { SessionStory } from '@/features/share/sessionStory';
import { useTheme } from '@/theme/ThemeProvider';
import { colors } from '@/theme';

/** The three pictures a session can be shared as, in the order they are offered. */
export type StoryDesign = 'photo' | 'card' | 'sticker';
export const STORY_DESIGNS: { key: StoryDesign; label: string }[] = [
  { key: 'photo', label: 'Photo' },
  { key: 'card', label: 'Card' },
  { key: 'sticker', label: 'Sticker' },
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
        <SessionCard {...common} width={width} aspect={9 / 16} radius={0} scale={1.14} inset={{ top: Math.round(height * 0.12), bottom: Math.round(height * 0.11) }} />
      </View>
    );
  }

  if (design === 'sticker') {
    // Small, so it sits on someone's own story without taking it over (Oct 3).
    const cardW = Math.round(width * 0.52);
    return (
      <View collapsable={false} style={[styles.centre, { width, height }]}>
        <SessionCard {...common} width={cardW} />
      </View>
    );
  }

  // Small in the corner: the photo is the story, the card is the signature (Oct 3, owner).
  const cardW = Math.round(width * 0.46);
  return (
    <View collapsable={false} style={{ width, height, overflow: 'hidden', backgroundColor: colors.court }}>
      {source ? (
        <Image source={source} resizeMode="cover" style={StyleSheet.absoluteFill} onLoad={() => onPhotoLoad?.(true)} onError={() => onPhotoLoad?.(false)} />
      ) : (
        <LinearGradient colors={[colors.court, colors.brand]} start={{ x: 0, y: 0 }} end={{ x: 0.4, y: 1 }} style={StyleSheet.absoluteFill} />
      )}
      {/* A soft shade low down, so the card reads on a bright photo too. */}
      <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.22)']} style={[styles.shade, { height: height * 0.35 }]} />
      <View style={[styles.sticker, { left: Math.round(width * 0.06), bottom: Math.round(height * 0.15), borderRadius: Math.round(20 * (cardW / 358)) }]}>
        <SessionCard {...common} width={cardW} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  centre: { alignItems: 'center', justifyContent: 'center' },
  shade: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  sticker: { position: 'absolute', boxShadow: '0px 6px 22px rgba(0, 0, 0, 0.32)' },
});
