import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, FadeInDown, cancelAnimation, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { Avatar } from '@/components/ui';
import { WrappedCard } from '@/components/WrappedCard';
import { shareCard } from '@/features/share/shareCard';
import { wrappedYear, yearInTennis } from '@/features/wrapped/yearInTennis';
import { compactNumber } from '@/lib/format';
import { goBack } from '@/lib/goBack';
import * as haptics from '@/lib/haptics';
import { useApp } from '@/store/AppContext';
import { lightColors as brand, fontFamily } from '@/theme';

type Slide = { key: string; tint: string; big?: string; title: string; sub?: string; extra?: React.ReactNode; /** Replaces the number, title and line for a slide with its own layout. */ content?: React.ReactNode };
const SLIDE_MS = 5200;

/**
 * A tennis court in faint lines behind each slide, larger than the screen so
 * only part of it shows, and in a new place on every slide: the same court,
 * seen from somewhere else as the story moves on.
 */
function CourtLines({ index, width, height }: { index: number; width: number; height: number }) {
  const W = Math.max(width, 380) * 1.15;
  const H = W * 2.17;
  // Chosen so the net (the brightest line) sits near the top or the bottom, never through the words.
  const spots = [[0.35, -0.5], [-0.5, 0.3], [0.3, -0.48], [-0.25, 0.28], [0.45, -0.52]];
  const [x, y] = spots[index % spots.length];
  const line = 'rgba(255,255,255,0.08)';
  const alley = W * 0.125;
  const service = H * 0.23;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: width * x, top: height * y, width: W, height: H, borderWidth: 2, borderColor: line }}>
      <View style={{ position: 'absolute', top: 0, bottom: 0, left: alley, right: alley, borderLeftWidth: 2, borderRightWidth: 2, borderColor: line }} />
      <View style={{ position: 'absolute', left: alley, right: alley, top: service, bottom: service, borderTopWidth: 2, borderBottomWidth: 2, borderColor: line }} />
      <View style={{ position: 'absolute', left: W / 2 - 1, width: 2, top: service, bottom: service, backgroundColor: line }} />
      <View style={{ position: 'absolute', left: -20, right: -20, top: H / 2 - 2, height: 4, backgroundColor: 'rgba(255,255,255,0.12)' }} />
    </View>
  );
}

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
      const post = data.topPost;
      const cover = post.thumbnailUrl || post.imageUrl;
      const likes = `${post.likedBy.length} ${post.likedBy.length === 1 ? 'like' : 'likes'}`;
      const shot = post.kind === 'clip' || !!post.videoUrl;
      out.push({
        key: 'top', tint: brand.grass, title: shot ? 'Your most-liked shot' : 'Your most-liked post',
        // A picture is a print laid on the page, a little askew, its likes pinned to the corner;
        // words are the words themselves, set large like a pull quote.
        content: cover ? (
          <View style={styles.topWrap}>
            <Text style={styles.eyebrow}>{shot ? 'Your most-liked shot' : 'Your most-liked post'}</Text>
            <View style={styles.print}>
              <Image source={{ uri: cover }} style={styles.printImage} resizeMode="cover" />
              <View style={styles.likePill}><Ionicons name="heart" size={15} color="white" /><Text style={styles.likePillText}>{post.likedBy.length}</Text></View>
            </View>
            {post.body ? <Text style={styles.printCaption} numberOfLines={2}>{post.body}</Text> : null}
          </View>
        ) : (
          <View style={styles.topWrap}>
            <Text style={styles.eyebrow}>Your most-liked post</Text>
            <Text style={styles.quoteMark}>“</Text>
            <Text style={[styles.quote, post.body.length > 140 && styles.quoteLong]} numberOfLines={7}>{post.body}</Text>
            <View style={styles.likeRow}><Ionicons name="heart" size={20} color="white" /><Text style={styles.likeRowText}>{likes}</Text></View>
          </View>
        ),
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
      {last ? null : <CourtLines index={index} width={width} height={height} />}
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
        <Animated.View key={slide.key} entering={FadeInDown.duration(420).easing(Easing.out(Easing.cubic))} pointerEvents="none" style={[styles.body, { paddingTop: insets.top + 70, paddingBottom: insets.bottom + 70 }]}>
          {slide.content ?? (
            <>
              {slide.extra}
              {slide.big ? <Text style={[styles.big, slide.big.length > 4 && { fontSize: 88, lineHeight: 92 }]} adjustsFontSizeToFit numberOfLines={1}>{slide.big}</Text> : null}
              <Text style={styles.title}>{slide.title}</Text>
              {slide.sub ? <Text style={styles.sub}>{slide.sub}</Text> : null}
            </>
          )}
        </Animated.View>
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
  topWrap: { gap: 14, maxWidth: 440 },
  eyebrow: { fontFamily: fontFamily.semibold, fontWeight: '600', fontSize: 17, color: 'rgba(255,255,255,0.78)' },
  quoteMark: { fontFamily: fontFamily.bold, fontWeight: '700', fontSize: 110, lineHeight: 96, height: 62, color: 'rgba(255,255,255,0.35)', marginTop: 8 },
  quote: { fontFamily: fontFamily.bold, fontWeight: '700', fontSize: 31, lineHeight: 37, letterSpacing: -0.7, color: 'white' },
  quoteLong: { fontSize: 25, lineHeight: 31, letterSpacing: -0.4 },
  likeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, alignSelf: 'flex-start', paddingHorizontal: 16, height: 42, borderRadius: 21, backgroundColor: 'rgba(255,255,255,0.14)' },
  likeRowText: { fontFamily: fontFamily.semibold, fontWeight: '600', fontSize: 17, color: 'white' },
  print: { marginTop: 8, alignSelf: 'flex-start', padding: 7, borderRadius: 22, backgroundColor: 'white', transform: [{ rotate: '-3deg' }], boxShadow: '0px 18px 40px rgba(0, 0, 0, 0.45)' },
  printImage: { width: 220, height: 290, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.2)' },
  likePill: { position: 'absolute', right: -14, bottom: 22, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 38, borderRadius: 19, backgroundColor: brand.clay, boxShadow: '0px 6px 16px rgba(0, 0, 0, 0.35)' },
  likePillText: { fontFamily: fontFamily.bold, fontWeight: '700', fontSize: 17, color: 'white', fontVariant: ['tabular-nums'] },
  printCaption: { fontFamily: fontFamily.medium, fontSize: 17, lineHeight: 24, color: 'rgba(255,255,255,0.8)', marginTop: 10 },
  people: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  finale: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 14, paddingHorizontal: 24 },
  cardFrame: { borderRadius: 18, overflow: 'hidden', boxShadow: '0px 10px 36px rgba(0, 0, 0, 0.45)' },
  shareButton: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 50, paddingHorizontal: 26, borderRadius: 999, backgroundColor: 'white', marginTop: 6 },
  shareText: { fontFamily: fontFamily.semibold, fontWeight: '600', fontSize: 16, color: brand.text },
  note: { fontFamily: fontFamily.regular, fontSize: 13, color: 'rgba(255,255,255,0.7)', textAlign: 'center' },
  again: { fontFamily: fontFamily.semibold, fontWeight: '600', fontSize: 14, color: 'white', paddingVertical: 4 },
});
