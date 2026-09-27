import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { Avatar } from '@/components/ui';
import { WrappedCard } from '@/components/WrappedCard';
import { shareCard } from '@/features/share/shareCard';
import { wrappedYear, yearInTennis } from '@/features/wrapped/yearInTennis';
import { compactNumber } from '@/lib/format';
import { goBack } from '@/lib/goBack';
import * as haptics from '@/lib/haptics';
import { useApp } from '@/store/AppContext';
import { lightColors as brand, fontFamily } from '@/theme';

type Slide = { key: string; tint: string; big?: string; title: string; sub?: string; extra?: React.ReactNode };
const SLIDE_MS = 5200;

/**
 * Your year in tennis, told a slide at a time like a story: tap the right of
 * the screen for the next, the left for the one before; each moves on by
 * itself after a few seconds. The last is a card to share. Slides with
 * nothing in them are left out, so a quiet year is a short story, not zeros.
 */
export default function Wrapped() {
  const params = useLocalSearchParams<{ year?: string }>();
  const { currentUser, currentUserId, sessions, posts, stories, hitRequests, users } = useApp();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const year = /^\d{4}$/.test(params.year ?? '') ? Number(params.year) : wrappedYear() ?? new Date().getFullYear();
  const data = useMemo(() => (currentUserId ? yearInTennis(currentUserId, year, { sessions, posts, stories, hitRequests }) : null), [currentUserId, year, sessions, posts, stories, hitRequests]);
  const card = useRef<View>(null);
  const [sharing, setSharing] = useState(false);
  const [note, setNote] = useState('');

  const slides = useMemo<Slide[]>(() => {
    if (!data) return [];
    const out: Slide[] = [{ key: 'intro', tint: brand.brand, big: String(year), title: 'Your year in tennis', sub: 'Tap to go on' }];
    if (data.days) out.push({ key: 'days', tint: brand.hard, big: String(data.days), title: data.days === 1 ? 'day playing' : 'days playing', sub: data.busiestMonth ? `${data.busiestMonth} was your busiest month.` : undefined });
    if (data.hours) out.push({ key: 'hours', tint: brand.court, big: String(data.hours), title: data.hours === 1 ? 'hour on court' : 'hours on court', sub: `Across ${data.sessions} ${data.sessions === 1 ? 'session' : 'sessions'} you logged.` });
    if (data.clips) out.push({ key: 'clips', tint: brand.clay, big: String(data.clips), title: data.clips === 1 ? 'clip posted' : 'clips posted', sub: data.views ? `Watched ${compactNumber(data.views)} times.` : data.likes ? `${compactNumber(data.likes)} likes along the way.` : undefined });
    if (data.topPost) {
      const cover = data.topPost.thumbnailUrl || data.topPost.imageUrl;
      out.push({
        key: 'top', tint: brand.grass, title: data.topPost.kind === 'clip' || data.topPost.videoUrl ? 'Your most-liked shot' : 'Your most-liked post', sub: `${data.topPost.likedBy.length} ${data.topPost.likedBy.length === 1 ? 'like' : 'likes'}`,
        extra: cover ? <Image source={{ uri: cover }} style={styles.topCover} resizeMode="cover" /> : <View style={[styles.topCover, styles.topBlank]}><Text style={styles.topBlankText} numberOfLines={6}>{data.topPost.body}</Text></View>,
      });
    }
    if (data.matchesPlayed) out.push({ key: 'matches', tint: brand.hard, big: `${data.matchesWon}–${data.matchesPlayed - data.matchesWon}`, title: 'your match record', sub: `${data.matchesPlayed} ${data.matchesPlayed === 1 ? 'match' : 'matches'} played.` });
    if (data.longestStreak >= 2) out.push({ key: 'streak', tint: brand.clay, big: String(data.longestStreak), title: 'days in a row', sub: 'Your longest streak of the year.' });
    if (data.partners.length) {
      const people = data.partners.map((id) => users.find((u) => u.id === id)).filter((u): u is NonNullable<typeof u> => !!u);
      const names = people.map((p) => p.name.split(' ')[0]);
      if (people.length) out.push({
        key: 'people', tint: brand.brand, title: 'Your people', sub: names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}.` : `${names[0]}.`,
        extra: <View style={styles.people}>{people.map((p) => <Avatar key={p.id} name={p.name} seed={p.avatarSeed} uri={p.avatarUrl} size={72} ring />)}</View>,
      });
    }
    if (out.length === 1) out.push({ key: 'quiet', tint: brand.grass, title: 'Not much to wrap up yet', sub: 'Log your sessions and post your clips, and next December this fills up.' });
    out.push({ key: 'card', tint: '#0B120E', title: '' });
    return out;
  }, [data, year, users]);

  const [index, setIndex] = useState(0);
  const last = index === slides.length - 1;
  const progress = useSharedValue(0);
  useEffect(() => {
    cancelAnimation(progress);
    progress.value = 0;
    if (last || !slides.length) return;
    progress.value = withTiming(1, { duration: SLIDE_MS, easing: Easing.linear });
    const t = setTimeout(() => setIndex((i) => Math.min(i + 1, slides.length - 1)), SLIDE_MS);
    return () => clearTimeout(t);
  }, [index, last, slides.length, progress]);
  const barStyle = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  const go = (step: number) => { haptics.tap(); setIndex((i) => Math.max(0, Math.min(slides.length - 1, i + step))); };
  const share = async () => {
    setSharing(true);
    setNote('');
    try { const said = await shareCard(card.current, `My ${year} in tennis`); if (said) setNote(said); else haptics.commit(); }
    catch (e) { setNote(e instanceof Error && e.message ? e.message : 'The image could not be made. Try again.'); }
    finally { setSharing(false); }
  };

  const slide = slides[index];
  if (!data || !slide) return <View style={[styles.root, { backgroundColor: brand.brand }]} />;
  const cardW = Math.floor(Math.min(320, width - 64, ((height - insets.top - insets.bottom - 200) * 9) / 16));

  return (
    <View style={styles.root}>
      <LinearGradient colors={[slide.tint, '#0B120E']} start={{ x: 0.1, y: 0 }} end={{ x: 0.6, y: 1 }} style={StyleSheet.absoluteFill} />
      {last ? null : (
        <Pressable accessibilityRole="button" accessibilityLabel="Next" onPress={(e) => go(e.nativeEvent.locationX < width / 3 ? -1 : 1)} style={StyleSheet.absoluteFill} />
      )}
      <View pointerEvents="box-none" style={[styles.top, { paddingTop: insets.top + 10 }]}>
        <View style={styles.bars}>
          {slides.map((s, i) => (
            <View key={s.key} style={styles.bar}>
              {i < index ? <View style={[styles.barFill, { width: '100%' }]} /> : i === index ? <Animated.View style={[styles.barFill, last ? { width: '100%' } : barStyle]} /> : null}
            </View>
          ))}
        </View>
        <View style={styles.topRow}>
          {/* The card on the last slide carries the name itself. */}
          <Text style={[styles.brandMark, last && { opacity: 0 }]}>CourtSide</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={12} onPress={() => goBack('/')}>
            <Ionicons name="close" size={26} color="white" />
          </Pressable>
        </View>
      </View>

      {last ? (
        <View style={[styles.finale, { paddingBottom: insets.bottom + 24 }]}>
          <View ref={card} collapsable={false} style={styles.cardFrame}>
            <WrappedCard year={data} me={currentUser ?? undefined} width={cardW} />
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Share your year" disabled={sharing} onPress={() => { void share(); }} style={({ pressed }) => [styles.shareButton, (pressed || sharing) && { opacity: 0.8 }]}>
            <Ionicons name="share-outline" size={18} color={brand.text} />
            <Text style={styles.shareText}>{sharing ? 'Making the image…' : 'Share your year'}</Text>
          </Pressable>
          <Text style={styles.note}>{note || 'Made for your Instagram story.'}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Watch again" hitSlop={8} onPress={() => setIndex(0)}>
            <Text style={styles.again}>Watch again</Text>
          </Pressable>
        </View>
      ) : (
        <View pointerEvents="none" style={[styles.body, { paddingBottom: insets.bottom + 80 }]}>
          {slide.extra}
          {slide.big ? <Text style={[styles.big, slide.big.length > 4 && { fontSize: 88, lineHeight: 92 }]} adjustsFontSizeToFit numberOfLines={1}>{slide.big}</Text> : null}
          <Text style={styles.title}>{slide.title}</Text>
          {slide.sub ? <Text style={styles.sub}>{slide.sub}</Text> : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0B120E' },
  top: { position: 'absolute', left: 0, right: 0, top: 0, paddingHorizontal: 14, gap: 12 },
  bars: { flexDirection: 'row', gap: 4 },
  bar: { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.3)', overflow: 'hidden' },
  barFill: { height: 3, backgroundColor: 'white' },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  brandMark: { fontFamily: fontFamily.bold, fontWeight: '700', fontSize: 18, color: 'white', letterSpacing: -0.3 },
  body: { flex: 1, justifyContent: 'center', paddingHorizontal: 28, gap: 6 },
  big: { fontFamily: fontFamily.bold, fontWeight: '700', fontSize: 120, lineHeight: 124, letterSpacing: -5, color: 'white', fontVariant: ['tabular-nums'] },
  title: { fontFamily: fontFamily.bold, fontWeight: '700', fontSize: 32, lineHeight: 36, letterSpacing: -0.8, color: 'white' },
  sub: { fontFamily: fontFamily.medium, fontSize: 18, lineHeight: 25, color: 'rgba(255,255,255,0.78)', marginTop: 6, maxWidth: 420 },
  topCover: { width: 190, height: 250, borderRadius: 20, marginBottom: 20, backgroundColor: 'rgba(255,255,255,0.1)' },
  topBlank: { padding: 16, justifyContent: 'flex-end' },
  topBlankText: { fontFamily: fontFamily.semibold, fontSize: 15, lineHeight: 20, color: 'white' },
  people: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  finale: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 14, paddingHorizontal: 24 },
  cardFrame: { borderRadius: 18, overflow: 'hidden', boxShadow: '0px 10px 36px rgba(0, 0, 0, 0.45)' },
  shareButton: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 50, paddingHorizontal: 26, borderRadius: 999, backgroundColor: 'white', marginTop: 6 },
  shareText: { fontFamily: fontFamily.semibold, fontWeight: '600', fontSize: 16, color: brand.text },
  note: { fontFamily: fontFamily.regular, fontSize: 13, color: 'rgba(255,255,255,0.7)', textAlign: 'center' },
  again: { fontFamily: fontFamily.semibold, fontWeight: '600', fontSize: 14, color: 'white', paddingVertical: 4 },
});
