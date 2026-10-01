import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, { FadeOut } from 'react-native-reanimated';
import { router } from 'expo-router';

import { Avatar } from '@/components/ui';
import { LevelPill } from '@/components/LevelPill';
import { NewHereTag } from '@/components/NewHereTag';
import { isNewHere } from '@/features/feed/newHere';
import { RichText } from '@/components/RichText';
import type { Post, User } from '@/data/types';
import { openCourtOnMap } from '@/features/players/courtLink';
import { relativeTime } from '@/lib/format';
import { useApp } from '@/store/AppContext';
import { font } from '@/theme';

const LINE = 20;
/** The tight shadow every word over the picture wears: crisp edges, readable on a white frame. */
const SHADOW = { textShadowColor: 'rgba(0, 0, 0, 0.45)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 } as const;

/**
 * The words over a clip, set the way TikTok and Reels set them, so they
 * stay out of the picture's way and read at a glance:
 *   1. who: the face, the @handle and their level;
 *   2. the caption, two lines at most, with its #tags in it and "… more"
 *      at the end of the second line, never on a line of its own;
 *   3. one quiet line: when · where (opens the map) · who with.
 * Nothing else stacks up over the video.
 */
export function ReelCaption({ post, author, onAuthor }: { post: Post; author: User; onAuthor: () => void }) {
  const { users, blockedIds } = useApp();
  const tags = post.tags.length ? post.tags.map((t) => `#${t}`).join(' ') : '';
  const text = [post.body?.trim(), tags].filter(Boolean).join(' ');
  const tagged = (post.taggedUserIds ?? []).filter((id) => !blockedIds.includes(id)).map((id) => users.find((u) => u.id === id)).filter((u): u is User => !!u);
  const first = (name: string) => name.split(' ')[0];
  const withWho = tagged.length === 1 ? first(tagged[0].name) : tagged.length === 2 ? `${first(tagged[0].name)} and ${first(tagged[1].name)}` : tagged.length ? `${first(tagged[0].name)} and ${tagged.length - 1} others` : '';
  const place = post.court?.name ?? post.location ?? '';
  return (
    <View style={styles.wrap}>
      <Pressable accessibilityRole="link" accessibilityLabel={`${author.name}, open profile`} onPress={onAuthor} style={styles.who} hitSlop={4}>
        <View style={styles.avatarRing}><Avatar name={author.name} seed={author.avatarSeed} uri={author.avatarUrl} size={32} /></View>
        <Text style={styles.handle} numberOfLines={1}>{author.handle}</Text>
        <LevelPill profile={author.profile} small onMedia style={styles.level} />
        {isNewHere(post) ? <NewHereTag onMedia /> : null}
      </Pressable>
      {text ? <FoldedWords text={text} /> : null}
      <View style={styles.meta}>
        <Text style={styles.metaText}>{relativeTime(post.createdAt)}{post.editedAt ? ' · Edited' : ''}</Text>
        {place ? (
          <Pressable
            accessibilityRole={post.court ? 'link' : undefined}
            accessibilityLabel={post.court ? `${place}, open on the map` : place}
            disabled={!post.court}
            hitSlop={6}
            onPress={(e) => { e?.stopPropagation?.(); if (post.court) openCourtOnMap(post.court); }}
            style={styles.metaItem}
          >
            <Text style={styles.metaDot}>·</Text>
            <Ionicons name="location-sharp" size={12} color="rgba(255,255,255,0.92)" style={SHADOW} />
            <Text style={styles.metaText} numberOfLines={1}>{place}</Text>
          </Pressable>
        ) : null}
        {withWho ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`With ${tagged.map((u) => u.name).join(', ')}`}
            hitSlop={6}
            onPress={(e) => { e?.stopPropagation?.(); if (tagged.length === 1) router.push(`/user/${tagged[0].id}`); else router.push({ pathname: '/likes', params: { id: post.id, set: 'tagged' } }); }}
            style={[styles.metaItem, styles.metaKeep]}
          >
            <Text style={styles.metaDot}>·</Text>
            <Ionicons name="person-sharp" size={11} color="rgba(255,255,255,0.92)" style={SHADOW} />
            <Text style={styles.metaText} numberOfLines={1}>{withWho}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/**
 * Two lines, then "… more" on the end of the second, the way the big apps
 * fold a caption. A hidden copy finds, by halving, the most of the caption
 * that fits two lines with "… more" after it; tapping opens the whole of it.
 */
export function FoldedWords({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const [fullH, setFullH] = useState(0);
  // The search for the cut: lo fits, hi does not; trial is what is being measured.
  const [cut, setCut] = useState<{ lo: number; hi: number; trial: number } | null>(null);
  const folds = fullH > LINE * 2 + 2;
  useEffect(() => { setCut(null); setFullH(0); setOpen(false); }, [text]);
  useEffect(() => { if (folds && !cut) setCut({ lo: 0, hi: text.length, trial: Math.floor(text.length / 2) }); }, [folds, cut, text.length]);
  const settled = cut && cut.hi - cut.lo <= 1;
  const shown = useMemo(() => {
    if (!folds) return text;
    const at = settled ? cut!.lo : Math.min(text.length, Math.round(text.length * 0.55));
    // End on a whole word when one is close.
    const space = text.lastIndexOf(' ', at);
    return text.slice(0, space > at - 14 && space > 0 ? space : at).trimEnd();
  }, [folds, settled, cut, text]);
  const more = <Text style={styles.more} onPress={() => setOpen(true)}>{'… more'}</Text>;
  return (
    <Pressable disabled={!folds} onPress={() => setOpen((v) => !v)} accessibilityRole={folds ? 'button' : undefined} accessibilityLabel={folds ? (open ? 'Show less of the caption' : 'Show the whole caption') : undefined}>
      {open ? (
        <RichText style={styles.caption} hashtagStyle={styles.tag} mentionStyle={styles.tag} numberOfLines={10} after={<Text style={styles.more}>{'  less'}</Text>}>{text}</RichText>
      ) : (
        <RichText style={styles.caption} hashtagStyle={styles.tag} mentionStyle={styles.tag} numberOfLines={2} after={folds ? more : null}>{shown}</RichText>
      )}
      {/* Measuring, out of sight: the full height, and each trial cut with "… more" after it. */}
      <View pointerEvents="none" aria-hidden importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={styles.measure}>
        <Text style={styles.caption} onLayout={(e) => setFullH(e.nativeEvent.layout.height)}>{text}</Text>
        {cut && !settled ? (
          <Text
            key={cut.trial}
            style={styles.caption}
            onLayout={(e) => {
              const fits = e.nativeEvent.layout.height <= LINE * 2 + 2;
              setCut((c) => {
                if (!c || c.trial !== cut.trial) return c;
                const lo = fits ? c.trial : c.lo;
                const hi = fits ? c.hi : c.trial;
                return { lo, hi, trial: Math.floor((lo + hi) / 2) };
              });
            }}
          >
            {text.slice(0, cut.trial).trimEnd()}<Text style={styles.more}>{'… more'}</Text>
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

/** The who-line on its own, for an Instant: the face, the handle, and when, in the same type as a clip's. */
export function ReelWho({ author, when, onAuthor, children }: { author: User; when: string; onAuthor: () => void; children?: React.ReactNode }) {
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={`${author.name}, open profile`} onPress={onAuthor} style={styles.who} hitSlop={4}>
      <View style={styles.avatarRing}><Avatar name={author.name} seed={author.avatarSeed} uri={author.avatarUrl} size={32} /></View>
      <Text style={styles.handle} numberOfLines={1}>{author.handle}<Text style={styles.when}>{`  ${when}`}</Text></Text>
      {children}
    </Pressable>
  );
}

/** "↑ Next moment · ← Community", shown on the first clip only and only for a few seconds: a nudge, not a fixture. */
export function SwipeHint() {
  const [shown, setShown] = useState(true);
  useEffect(() => { const t = setTimeout(() => setShown(false), 4000); return () => clearTimeout(t); }, []);
  if (!shown) return null;
  return <Animated.Text exiting={FadeOut.duration(400)} style={styles.hint}>↑ Next moment   ·   ← Community</Animated.Text>;
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  who: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', maxWidth: '100%' },
  avatarRing: { borderRadius: 17, borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)' },
  // Centred on the name's line, not hung from its top.
  level: { alignSelf: 'center' },
  handle: { color: '#fff', fontSize: 15, ...font('600'), letterSpacing: -0.1, flexShrink: 1, ...SHADOW },
  when: { color: 'rgba(255,255,255,0.78)', fontSize: 13, ...font('500') },
  caption: { color: '#fff', fontSize: 14.5, lineHeight: LINE, ...font('400'), ...SHADOW },
  tag: { color: '#fff', ...font('600') },
  more: { color: 'rgba(255,255,255,0.78)', ...font('600') },
  measure: { position: 'absolute', left: 0, right: 0, top: 0, opacity: 0 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 5, minWidth: 0 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1, minWidth: 0 },
  metaKeep: { flexShrink: 0 },
  metaText: { color: 'rgba(255,255,255,0.88)', fontSize: 13, ...font('500'), flexShrink: 1, ...SHADOW },
  metaDot: { color: 'rgba(255,255,255,0.7)', fontSize: 13, ...font('500'), ...SHADOW },
  hint: { color: 'rgba(255,255,255,0.6)', fontSize: 11, ...font('500'), marginTop: 2, ...SHADOW },
});
