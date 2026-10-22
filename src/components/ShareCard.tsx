import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BrandMark } from '@/components/BrandMark';

import { Avatar } from '@/components/ui';
import { ScoreSticker, matchSets } from '@/components/session/ScoreBoard';
import type { Post, User } from '@/data/types';
import { lightColors as brand, fontFamily } from '@/theme';
import { TextScale } from '@/theme/textScale';

/**
 * The score as the ScoreBoard's sticker (T1, Oct 22): the calm light court
 * card of the viewer's court, the author on top, the opponent under.
 */
function Scoreboard({ post, author, u }: { post: Post; author?: User; u: number }) {
  const match = post.match!;
  const sets = matchSets(match);
  // Sets that don't read as a score: the result and the words as written, rather than no score at all.
  if (!sets.length) {
    return (
      <Text maxFontSizeMultiplier={TextScale.CHROME} style={{ fontFamily: fontFamily.semibold, fontSize: 15 * u, color: 'white' }}>
        {match.won ? 'Won' : 'Lost'} vs {match.opponentName}
        <Text style={{ fontFamily: fontFamily.medium, color: 'rgba(255,255,255,0.75)' }}>{` · ${match.sets.join(' ')}`}</Text>
      </Text>
    );
  }
  return (
    <ScoreSticker
      sets={sets}
      you={author?.name ?? 'Me'}
      them={match.opponentName}
      youWon={match.won}
      eyebrow={`Match${match.surface ? ` · ${match.surface} court` : ''}`}
      scale={u}
    />
  );
}

/** A court from above in thin lines, for a card with no picture of its own. */
function CourtArt({ u }: { u: number }) {
  const line = 'rgba(255,255,255,0.22)';
  const W = 250 * u;
  const H = 540 * u;
  const alley = W * 0.125;
  const service = H * 0.23;
  return (
    <View style={[StyleSheet.absoluteFill, { alignItems: 'center', paddingTop: 70 * u }]}>
      <View style={{ width: W, height: H, borderWidth: 1.5, borderColor: line }}>
        <View style={{ position: 'absolute', top: 0, bottom: 0, left: alley, right: alley, borderLeftWidth: 1.5, borderRightWidth: 1.5, borderColor: line }} />
        <View style={{ position: 'absolute', left: alley, right: alley, top: service, bottom: service, borderTopWidth: 1.5, borderBottomWidth: 1.5, borderColor: line }} />
        <View style={{ position: 'absolute', left: W / 2 - 0.75, width: 1.5, top: service, bottom: service, backgroundColor: line }} />
        <View style={{ position: 'absolute', left: -12 * u, right: -12 * u, top: H / 2 - 1.5, height: 3, backgroundColor: 'rgba(255,255,255,0.4)' }} />
      </View>
    </View>
  );
}

/**
 * A post as a picture for Instagram Stories and the like: 9:16, the clip's
 * cover (or a court in thin lines) edge to edge, the CourtSide name at the top,
 * and at the bottom the score if there is one, the caption and who posted it.
 * Drawn at any width; everything inside scales with it. Fixed brand colours,
 * not the viewer's theme, so every shared card looks like CourtSide.
 */
export function ShareCard({ post, author, width }: { post: Post; author?: User; width: number }) {
  const u = width / 360;
  const cover = post.thumbnailUrl || post.imageUrl;
  return (
    <View collapsable={false} style={{ width, height: Math.round((width * 16) / 9), overflow: 'hidden', backgroundColor: '#1D3524' }}>
      {cover ? (
        <Image source={{ uri: cover }} resizeMode="cover" style={StyleSheet.absoluteFill} />
      ) : (
        <>
          <LinearGradient colors={[brand.brand, '#1D3524']} start={{ x: 0, y: 0 }} end={{ x: 0.4, y: 1 }} style={StyleSheet.absoluteFill} />
          <CourtArt u={u} />
        </>
      )}
      <LinearGradient colors={['rgba(0,0,0,0.42)', 'rgba(0,0,0,0)']} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 130 * u }} />
      <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.82)']} locations={[0, 0.45, 1]} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 380 * u }} />
      {/* The lockup, quietly: the mark and the name the way the app and the waitlist set them now (Inter at 600, not the old heavy 800). */}
      <View style={{ position: 'absolute', top: 24 * u, left: 22 * u, flexDirection: 'row', alignItems: 'center', gap: 7 * u, opacity: 0.94 }}>
        <BrandMark size={Math.round(24 * u)} color="#FFFFFF" />
        <Text maxFontSizeMultiplier={TextScale.CHROME} style={{ fontFamily: fontFamily.semibold, fontWeight: '600', fontSize: 18 * u, letterSpacing: -0.45 * u, color: 'white', textShadowColor: 'rgba(0,0,0,0.25)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 }}>CourtSide</Text>
      </View>
      <View style={{ position: 'absolute', left: 22 * u, right: 22 * u, bottom: 24 * u, gap: 14 * u }}>
        {post.match?.sets?.length ? <Scoreboard post={post} author={author} u={u} /> : null}
        {post.body ? <Text maxFontSizeMultiplier={TextScale.CHROME} numberOfLines={post.match ? 3 : 5} style={{ fontFamily: fontFamily.semibold, fontWeight: '600', fontSize: 17 * u, lineHeight: 23 * u, color: 'white' }}>{post.body}</Text> : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 * u }}>
          <Avatar name={author?.name ?? 'Player'} seed={author?.avatarSeed ?? post.authorId} uri={author?.avatarUrl} size={Math.round(34 * u)} />
          <View style={{ flex: 1 }}>
            <Text maxFontSizeMultiplier={TextScale.CHROME} numberOfLines={1} style={{ fontFamily: fontFamily.semibold, fontWeight: '600', fontSize: 14 * u, color: 'white' }}>{author?.name ?? 'A player'}</Text>
            {author?.handle ? <Text maxFontSizeMultiplier={TextScale.CHROME} numberOfLines={1} style={{ fontFamily: fontFamily.regular, fontSize: 12 * u, color: 'rgba(255,255,255,0.7)' }}>@{author.handle} on CourtSide</Text> : null}
          </View>
        </View>
        <Text maxFontSizeMultiplier={TextScale.CHROME} style={{ fontFamily: fontFamily.medium, fontSize: 11 * u, letterSpacing: 0.2 * u, color: 'rgba(255,255,255,0.6)' }}>courtsidebase.com</Text>
      </View>
    </View>
  );
}
