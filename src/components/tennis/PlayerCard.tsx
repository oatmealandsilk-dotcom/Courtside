import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { BrandMark } from '@/components/BrandMark';
import { SYSTEM_INK } from '@/components/LevelPill';
import { Avatar } from '@/components/ui';
import { CardWash, cardLook, type CardLook } from '@/components/session/SessionCard';
import { CountUp } from '@/components/session/CountUp';
import type { SurfacePreference, User } from '@/data/types';
import { mixHex } from '@/features/activity/zones';
import { playStyleLabel } from '@/lib/badges';
import { useReducedMotion } from '@/lib/useReducedMotion';
import {
  bandWords, cityOf, daysUntil, factsLine, handsLine, nextBand, ratingText, rulerAt, rulerScale, shortDate, stripItems, surfaceSlot, surfaceWord, type StripItem,
} from '@/features/players/tennisProfile';
import { useTheme } from '@/theme/ThemeProvider';
import { colors, font, withAlpha } from '@/theme';

/** The ruler's draw and the rating's count: once per player per time the app is open, never on every visit. */
const played = new Set<string>();
const EASE = Easing.bezier(0.22, 1, 0.36, 1);

/**
 * A player's card: the sibling of the cream session box (same fill, fade and
 * hairline from cardLook), with the rating once, big, on a ruler of its own
 * scale, how they play, and the few numbers worth knowing. `full` heads the
 * Tennis profile page; `banner` is the smaller one on a profile, the whole of
 * it a link to the page. Colour comes from the court's own look: cream on the
 * CourtSide court, the brand colour on the light city courts, the raised
 * surface with brand figures on a dark page.
 */
export function PlayerCard({ user, variant, isMe = false, onPress }: {
  user: User;
  variant: 'full' | 'banner';
  /** Your own card: the "Next band" line under the ruler. */
  isMe?: boolean;
  /** The banner's link. */
  onPress?: () => void;
}) {
  const { theme } = useTheme();
  const look = cardLook(theme);
  const reduced = useReducedMotion();
  const key = `${variant}:${user.id}`;
  // Decided once, on the first draw: a later redraw never starts it over.
  const [play] = useState(() => variant === 'full' && !reduced && !played.has(key));
  useEffect(() => { played.add(key); }, [key]);
  const p = user.profile;
  const band = bandWords(p);
  const system = p.skillSystem;
  // The system's own colour (UTR blue, NTRP green, ITF clay) on cream and dark cards; on a filled one, the card's own small ink.
  const systemInk = look.wash === 'brand' ? look.eyebrow : (look.dark ? SYSTEM_INK[system]?.dark : SYSTEM_INK[system]?.light) ?? look.eyebrow;
  const filled = look.wash === 'brand';

  if (variant === 'banner') {
    const next = upcoming(user)[0];
    const lead = stripItems(user, 2);
    const items: StripItem[] = next ? [...lead, nextItem(next)] : stripItems(user, 3);
    const spoken = `${user.name}'s tennis profile. ${system} ${ratingText(p)}${band ? `, ${band}` : ''}. ${playStyleLabel[p.playStyle]}, ${surfaceWord[p.preferredSurface]}. ${items.map((i) => i.spoken).join(', ')}`;
    return (
      <Pressable accessibilityRole="link" accessibilityLabel={spoken} onPress={onPress} style={({ pressed }) => [styles.banner, { backgroundColor: look.fill, borderColor: look.border }, look.border !== 'transparent' && styles.bordered, pressed && styles.pressed]}>
        <CardWash look={look} radius={16} />
        <View style={styles.headRow}>
          <Text style={[styles.bannerTitle, { color: look.ink }]}>Tennis profile</Text>
          <Ionicons name="chevron-forward" size={15} color={look.muted} />
        </View>
        <View style={[styles.heroRow, styles.bannerHero]}>
          <Text maxFontSizeMultiplier={1.3} style={[styles.bannerFigure, { color: look.figure }]}>{ratingText(p)}</Text>
          <View style={styles.heroWords}>
            <Text maxFontSizeMultiplier={1.3} style={[styles.system, { color: systemInk }]}>{system}</Text>
            {band ? <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={[styles.bannerBand, { color: look.ink }]}>{band}</Text> : null}
          </View>
        </View>
        <View style={styles.inline}>
          <Text style={[styles.small, { color: look.muted }]}>{playStyleLabel[p.playStyle]} · </Text>
          <Swatch surface={p.preferredSurface} look={look} />
          <Text numberOfLines={1} style={[styles.small, styles.shrink, { color: look.muted }]}>{surfaceWord[p.preferredSurface]}</Text>
        </View>
        {items.length ? <Strip items={items} look={look} size={20} filled={filled} /> : null}
      </Pressable>
    );
  }

  const items = stripItems(user, 4);
  const facts = factsLine(p, items);
  const up = isMe ? nextBand(p) : null;
  const spoken = [
    `${user.name}, ${system} ${ratingText(p)}${band ? `, ${band.toLowerCase()}` : ''}.`,
    `${playStyleLabel[p.playStyle]}, ${surfaceWord[p.preferredSurface].toLowerCase()}, ${handsLine(p).replace(' · ', ', ').toLowerCase()}.`,
    facts ? `${facts.replace(/ · /g, ', ')}.` : '',
    items.length ? `${items.map((i) => i.spoken).join(', ')}.` : '',
    up ? `Next band at ${up.at}, ${up.label.toLowerCase()}.` : '',
  ].filter(Boolean).join(' ');
  return (
    <View accessible accessibilityRole="summary" accessibilityLabel={spoken} style={[styles.card, { backgroundColor: look.fill, borderColor: look.border }, look.border !== 'transparent' && styles.bordered]}>
      <CardWash look={look} radius={20} />
      <View style={styles.identity}>
        {/* On a filled card the initials sit on a deeper shade of the card (a blue disc vanished on Melbourne's blue). */}
        <Avatar name={user.name} seed={user.avatarSeed} uri={user.avatarUrl} size={52} ring={user.isCoach} style={filled ? { backgroundColor: mixHex(look.fill, colors.text, 0.35) } : undefined} />
        <View style={styles.identityWords}>
          <Text numberOfLines={1} style={[styles.name, { color: look.ink }]}>{user.name}</Text>
          <Text numberOfLines={1} style={[styles.small, { color: look.muted }]}>@{user.handle}{user.location ? ` · ${cityOf(user.location)}` : ''}{user.isCoach ? ' · Coach' : ''}</Text>
        </View>
        <View style={styles.mark}><BrandMark size={22} color={look.figure} /></View>
      </View>

      <View style={[styles.heroRow, styles.hero]}>
        <CountUp value={Number(ratingText(p))} part={system === 'ITF' ? 'int' : 'dec1'} play={play} duration={700} maxFontSizeMultiplier={1.3} style={[styles.figure, { color: look.figure }]} />
        <View style={styles.heroWords}>
          <Text maxFontSizeMultiplier={1.3} style={[styles.system, { color: systemInk }]}>{system}</Text>
          {band ? <Text maxFontSizeMultiplier={1.3} numberOfLines={2} style={[styles.band, { color: look.ink }]}>{band}</Text> : null}
        </View>
      </View>

      <RatingRuler user={user} look={look} play={play} />
      {up ? <Text style={[styles.small, styles.next, { color: look.muted }]}>Next band at {up.at} · {up.label}</Text> : null}

      <View style={styles.play}>
        <View style={styles.inline}>
          <Text style={[styles.style, { color: look.ink }]}>{playStyleLabel[p.playStyle]} · </Text>
          <Swatch surface={p.preferredSurface} look={look} />
          <Text numberOfLines={1} style={[styles.style, styles.surface, styles.shrink, { color: look.ink }]}>{surfaceWord[p.preferredSurface]}</Text>
        </View>
        <Text style={[styles.small, { color: look.muted }]}>{handsLine(p)}</Text>
        {facts ? <Text style={[styles.small, { color: look.muted }]}>{facts}</Text> : null}
      </View>

      {items.length ? <Strip items={items} look={look} size={24} filled={filled} /> : null}
    </View>
  );
}

/** A player's tournaments still to come, soonest first. Whatever the data layer shares: other players' only reach here when they may be seen. */
export function upcoming(user: Pick<User, 'profile'>, now = new Date()) {
  return user.profile.tournaments.filter((t) => daysUntil(t.startsAt, now) >= 0).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

function nextItem(t: User['profile']['tournaments'][number]): StripItem {
  const days = daysUntil(t.startsAt);
  const figure = days === 0 ? 'Today' : days >= 100 ? shortDate(t.startsAt) : `${days}d`;
  return { key: 'next', figure, label: t.name, word: days === 0 || days >= 100, spoken: `${t.name} ${days === 0 ? 'today' : `in ${days} ${days === 1 ? 'day' : 'days'}`}` };
}

/** A court surface's colour as a small square; on a filled card, a ring in the card's own ink (the surface colours would fight the fill). */
export function Swatch({ surface, look, size = 9 }: { surface: SurfacePreference; look: Pick<CardLook, 'wash' | 'ink'>; size?: number }) {
  const ring = look.wash === 'brand';
  return <View style={{ width: size, height: size, borderRadius: 2, marginRight: 5, backgroundColor: ring ? 'transparent' : colors[surfaceSlot(surface)], borderWidth: ring ? 1.5 : 0, borderColor: look.ink }} />;
}

/**
 * Where the rating sits on its own scale: NTRP 1.5–7.0 in half points, UTR
 * 1–16.5 in whole ones, ITF reversed so better is always to the right. The
 * line fills up to the mark, and the ticks it has passed take its colour.
 * On the first visit it draws to the mark as the number counts up.
 */
function RatingRuler({ user, look, play }: { user: User; look: CardLook; play: boolean }) {
  const scale = rulerScale(user.profile.skillSystem);
  const at = rulerAt(scale, user.profile.rating);
  const [w, setW] = useState(0);
  const p = useSharedValue(play ? 0 : at);
  useEffect(() => {
    if (!play) { p.value = at; return; }
    p.value = 0;
    p.value = withDelay(60, withTiming(at, { duration: 600, easing: EASE }));
  }, [at, play, p]);
  const fill = useAnimatedStyle(() => ({ width: p.value * w }), [w]);
  const mark = useAnimatedStyle(() => ({ transform: [{ translateX: p.value * w }] }), [w]);
  const ticks: number[] = [];
  for (let v = scale.min; v <= scale.max + 1e-6; v += scale.step) ticks.push(rulerAt(scale, v));
  const ends = scale.reversed ? [scale.max, scale.min] : [scale.min, scale.max];
  const label = (n: number) => n.toFixed(scale.decimals);
  return (
    <View style={styles.ruler} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <View style={styles.track} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
        <View style={[styles.base, { backgroundColor: withAlpha(look.ink, 0.18) }]} />
        {w > 0 ? ticks.map((t, i) => (
          <View key={i} style={[styles.tick, { left: t * w - 0.75, backgroundColor: t <= at + 1e-6 ? withAlpha(look.figure, 0.55) : withAlpha(look.ink, 0.22) }]} />
        )) : null}
        <Animated.View style={[styles.fill, { backgroundColor: look.figure }, fill]} />
        {w > 0 ? (
          <Animated.View style={[styles.markWrap, mark]}>
            <View style={[styles.stem, { backgroundColor: look.figure }]} />
            <View style={[styles.dot, { backgroundColor: look.figure, borderColor: look.fill }]} />
          </Animated.View>
        ) : null}
      </View>
      <View style={styles.ends}>
        <Text style={[styles.endText, { color: look.muted }]}>{label(ends[0])}</Text>
        <Text style={[styles.endText, { color: look.muted }]}>{label(ends[1])}</Text>
      </View>
    </View>
  );
}

/** The card's numbers, side by side on hairlines: figures in the card's figure colour, labels small under them. */
function Strip({ items, look, size, filled }: { items: StripItem[]; look: CardLook; size: number; filled: boolean }) {
  return (
    <View style={[styles.strip, size < 24 && styles.stripSmall, { borderTopColor: look.lines }]}>
      {items.map((item, i) => (
        <View key={item.key} style={[styles.cell, i > 0 && { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: look.lines, paddingLeft: 12 }]}>
          <Text numberOfLines={1} maxFontSizeMultiplier={1.25} style={[item.word ? { ...font('600'), fontSize: size - 4, lineHeight: Math.round(size * 1.15), letterSpacing: -0.4 } : { ...font('600'), fontSize: size, lineHeight: Math.round(size * 1.15), letterSpacing: -0.055 * size }, styles.tabular, { color: look.figure }]}>{item.figure}</Text>
          <View style={styles.cellLabel}>
            {item.key === 'streak' ? <Ionicons name="flame" size={11} color={filled ? look.ink : colors.clay} /> : null}
            <Text numberOfLines={1} style={[styles.label, styles.shrink, { color: look.muted }]}>{item.label}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, padding: 20, overflow: 'hidden' },
  bordered: { borderWidth: StyleSheet.hairlineWidth },
  banner: { borderRadius: 16, paddingVertical: 14, paddingHorizontal: 16, overflow: 'hidden' },
  pressed: { transform: [{ scale: 0.98 }] },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bannerTitle: { ...font('600'), fontSize: 17, letterSpacing: -0.3 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  identityWords: { flex: 1, minWidth: 0, gap: 2 },
  name: { ...font('500'), fontSize: 22, lineHeight: 27, letterSpacing: -0.66 },
  mark: { alignSelf: 'flex-start' },
  small: { ...font('400'), fontSize: 13, lineHeight: 19 },
  heroRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  hero: { marginTop: 22 },
  bannerHero: { marginTop: 8 },
  // The rating, set big and tight; its line box trimmed so the words beside it sit on its baseline.
  figure: { ...font('600'), fontSize: 66, lineHeight: 66, letterSpacing: -3.6, marginVertical: -5, minWidth: 40 },
  bannerFigure: { ...font('600'), fontSize: 42, lineHeight: 46, letterSpacing: -2.2, fontVariant: ['tabular-nums'] },
  heroWords: { flex: 1, minWidth: 0, gap: 1, paddingBottom: 4 },
  system: { ...font('600'), fontSize: 11, lineHeight: 14, letterSpacing: 0.6 },
  band: { ...font('600'), fontSize: 17, lineHeight: 22, letterSpacing: -0.3 },
  bannerBand: { ...font('600'), fontSize: 15, lineHeight: 20, letterSpacing: -0.15 },
  ruler: { marginTop: 18 },
  track: { height: 22, justifyContent: 'center' },
  base: { position: 'absolute', left: 0, right: 0, top: 10.5, height: 1 },
  tick: { position: 'absolute', top: 7, width: 1.5, height: 8, borderRadius: 1 },
  fill: { position: 'absolute', left: 0, top: 10, height: 2, borderRadius: 1 },
  markWrap: { position: 'absolute', left: 0, top: 0, width: 0, height: 22, alignItems: 'center', justifyContent: 'center', overflow: 'visible' },
  stem: { position: 'absolute', width: 2.5, height: 22, borderRadius: 1.25 },
  dot: { position: 'absolute', width: 14, height: 14, borderRadius: 7, borderWidth: 2.5 },
  ends: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  endText: { ...font('400'), fontSize: 11, lineHeight: 14, fontVariant: ['tabular-nums'] },
  next: { marginTop: 8 },
  play: { marginTop: 16, gap: 2 },
  inline: { flexDirection: 'row', alignItems: 'center', marginTop: 4, minWidth: 0 },
  style: { ...font('600'), fontSize: 15, lineHeight: 21, letterSpacing: -0.15 },
  surface: { ...font('500') },
  shrink: { flexShrink: 1 },
  strip: { flexDirection: 'row', marginTop: 18, paddingTop: 16, borderTopWidth: StyleSheet.hairlineWidth },
  stripSmall: { marginTop: 14, paddingTop: 12 },
  // Columns share the width by what they hold (a record is wider than a streak), so none is cut short.
  cell: { flexGrow: 1, flexShrink: 1, flexBasis: 'auto', minWidth: 0, gap: 2 },
  cellLabel: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  label: { ...font('400'), fontSize: 12, lineHeight: 16 },
  tabular: { fontVariant: ['tabular-nums'] },
});
