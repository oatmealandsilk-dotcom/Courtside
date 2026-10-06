import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { BrandMark } from '@/components/BrandMark';
import { Avatar } from '@/components/ui';
import { CardWash, cardLook, type CardLook } from '@/components/session/SessionCard';
import { CountUp } from '@/components/session/CountUp';
import type { SurfacePreference, User } from '@/data/types';
import { mixHex } from '@/features/activity/zones';
import { playStyleLabel } from '@/lib/badges';
import { useReducedMotion } from '@/lib/useReducedMotion';
import {
  cityOf, daysUntil, factsList, handsLine, ratingText, shortDate, stripItems, surfaceSlot, surfaceWord, tournamentName, type StripItem,
} from '@/features/players/tennisProfile';
import { usePerWeek } from '@/features/players/usePerWeek';
import { useTheme } from '@/theme/ThemeProvider';
import { colors, font } from '@/theme';

/** The rating's count: once per player per time the app is open, never on every visit. */
const played = new Set<string>();

/**
 * A player's card: the session box's twin, coloured by the very same look
 * (cardLook) and fade (CardWash) in every court, so the two always match
 * (Oct 5, owner: "The tennis profile card should be the same as activity
 * card. Like the colors and stuff"): cream on the CourtSide court, the brand
 * colour on the light city courts, the raised surface with brand figures on
 * a dark page. On it the rating once, big, its system beside it, how they
 * play, and the few numbers worth knowing. `full` heads the Tennis profile
 * page; `banner` is the smaller one on a profile, the whole of it a link to
 * the page.
 *
 * Oct 5, owner: no level words under the rating ("Advanced junior / D3"),
 * and no ruler of ticks under it: the number and its system say it.
 */
export function PlayerCard({ user, variant, onPress }: {
  user: User;
  variant: 'full' | 'banner';
  /** The banner's link. */
  onPress?: () => void;
}) {
  const { theme } = useTheme();
  const look = cardLook(theme);
  const reduced = useReducedMotion();
  const week = usePerWeek(user);
  const key = `${variant}:${user.id}`;
  // Decided once, on the first draw: a later redraw never starts it over.
  const [play] = useState(() => variant === 'full' && !reduced && !played.has(key));
  useEffect(() => { played.add(key); }, [key]);
  const p = user.profile;
  const system = p.skillSystem;
  // The system's name in the card's small ink (the deeper green on cream, the muted ink on a dark page): the level pill
  // beside the name already wears the system's own colour, and NTRP green beside New York's yellow figures fought them.
  const systemInk = look.eyebrow;
  const filled = look.wash === 'brand';

  if (variant === 'banner') {
    const next = upcoming(user)[0];
    const items: StripItem[] = next ? [...stripItems(user, 2, week), nextItem(next)] : stripItems(user, 3, week);
    const spoken = `${user.name}'s tennis profile. ${system} ${ratingText(p)}. ${playStyleLabel[p.playStyle]}, ${surfaceWord[p.preferredSurface]}. ${items.map((i) => i.spoken).join(', ')}`;
    return (
      <Pressable accessibilityRole="link" accessibilityLabel={spoken} onPress={onPress} style={({ pressed }) => [styles.banner, { backgroundColor: look.fill, borderColor: look.border }, look.dark && styles.bordered, pressed && styles.pressed]}>
        <CardWash look={look} radius={16} />
        <View style={styles.headRow}>
          <Text style={[styles.bannerTitle, { color: look.ink }]}>Tennis profile</Text>
          <Ionicons name="chevron-forward" size={15} color={look.muted} />
        </View>
        <View style={[styles.heroRow, styles.bannerHero]}>
          <Text maxFontSizeMultiplier={1.3} style={[styles.bannerFigure, { color: look.figure }]}>{ratingText(p)}</Text>
          <Text maxFontSizeMultiplier={1.3} style={[styles.system, styles.bannerSystem, { color: systemInk }]}>{system}</Text>
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

  const items = stripItems(user, 4, week);
  const facts = factsList(p, items);
  const spoken = [
    `${user.name}, ${system} ${ratingText(p)}.`,
    `${playStyleLabel[p.playStyle]}, ${surfaceWord[p.preferredSurface].toLowerCase()}, ${handsLine(p).replace(' · ', ', ').toLowerCase()}.`,
    facts.length ? `${facts.join(', ')}.` : '',
    items.length ? `${items.map((i) => i.spoken).join(', ')}.` : '',
  ].filter(Boolean).join(' ');
  return (
    <View accessible accessibilityRole="summary" accessibilityLabel={spoken} style={[styles.card, { backgroundColor: look.fill, borderColor: look.border }, look.dark && styles.bordered]}>
      <CardWash look={look} radius={20} />
      <View style={styles.identity}>
        {/* The brand disc their profile page gives them, so the same person wears one colour; on a filled card,
            a deeper shade of the card instead (a brand disc would vanish into it). */}
        <Avatar name={user.name} seed={user.avatarSeed} uri={user.avatarUrl} size={52} ring={user.isCoach} style={{ backgroundColor: filled ? mixHex(look.fill, colors.text, 0.35) : colors.brand }} />
        <View style={styles.identityWords}>
          <Text numberOfLines={1} style={[styles.name, { color: look.ink }]}>{user.name}</Text>
          <Text numberOfLines={1} style={[styles.small, { color: look.muted }]}>@{user.handle}{user.location ? ` · ${cityOf(user.location)}` : ''}{user.isCoach ? ' · Coach' : ''}</Text>
        </View>
        <View style={styles.mark}><BrandMark size={22} color={look.figure} /></View>
      </View>

      <View style={[styles.heroRow, styles.hero]}>
        <CountUp value={Number(ratingText(p))} part={system === 'ITF' ? 'int' : 'dec1'} play={play} duration={700} maxFontSizeMultiplier={1.3} style={[styles.figure, { color: look.figure }]} />
        <Text maxFontSizeMultiplier={1.3} style={[styles.system, styles.heroSystem, { color: systemInk }]}>{system}</Text>
      </View>

      <View style={styles.play}>
        <View style={styles.inline}>
          <Text style={[styles.style, { color: look.ink }]}>{playStyleLabel[p.playStyle]} · </Text>
          <Swatch surface={p.preferredSurface} look={look} />
          <Text numberOfLines={1} style={[styles.style, styles.surface, styles.shrink, { color: look.ink }]}>{surfaceWord[p.preferredSurface]}</Text>
        </View>
        <Text style={[styles.small, { color: look.muted }]}>{handsLine(p)}</Text>
        {/* One phrase to a piece, so a line only breaks between two of them, never inside one. */}
        {facts.length ? (
          <View style={styles.facts}>
            {facts.map((f, i) => <Text key={f} style={[styles.small, { color: look.muted }]}>{f}{i < facts.length - 1 ? ' · ' : ''}</Text>)}
          </View>
        ) : null}
      </View>

      {items.length ? <Strip items={items} look={look} size={24} filled={filled} /> : null}
    </View>
  );
}

/** A player's tournaments still to come, soonest first. Whatever the data layer shares: other players' only reach here when they may be seen. */
export function upcoming(user: Pick<User, 'profile'>, now = new Date()) {
  return user.profile.tournaments.filter((t) => daysUntil(t.startsAt, now) >= 0).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

/**
 * The banner's countdown to the next tournament: "50 days" over the
 * tournament's name with a trophy before it, so it reads as a tournament
 * and not as a word of its own ("50d" over "Rrc" did not). "Today" on the
 * day, and from 100 days out the date itself.
 */
function nextItem(t: User['profile']['tournaments'][number]): StripItem {
  const days = daysUntil(t.startsAt);
  const name = tournamentName(t.name);
  const when = days === 0 ? 'today' : days >= 100 ? `on ${shortDate(t.startsAt)}` : `in ${days} ${days === 1 ? 'day' : 'days'}`;
  const spoken = `Next tournament, ${name}, ${when}`;
  if (days === 0) return { key: 'next', figure: 'Today', label: name, word: true, spoken };
  if (days >= 100) return { key: 'next', figure: shortDate(t.startsAt), label: name, word: true, spoken };
  return { key: 'next', figure: String(days), unit: days === 1 ? 'day' : 'days', label: name, spoken };
}

/** A court surface's colour as a small square; on a filled card, a ring in the card's own ink (the surface colours would fight the fill). */
export function Swatch({ surface, look, size = 9 }: { surface: SurfacePreference; look: Pick<CardLook, 'wash' | 'ink'>; size?: number }) {
  const ring = look.wash === 'brand';
  return <View style={{ width: size, height: size, borderRadius: 2, marginRight: 5, backgroundColor: ring ? 'transparent' : colors[surfaceSlot(surface)], borderWidth: ring ? 1.5 : 0, borderColor: look.ink }} />;
}

/**
 * The card's numbers, side by side on hairlines: figures in the card's figure
 * colour (a unit after one set small, on its baseline), labels small under
 * them. With text set very large (past 1.3×) four no longer fit across, so
 * they sit two by two.
 */
function Strip({ items, look, size, filled }: { items: StripItem[]; look: CardLook; size: number; filled: boolean }) {
  const { fontScale } = useWindowDimensions();
  const grid = items.length >= 4 && fontScale > 1.3;
  return (
    <View style={[styles.strip, size < 24 && styles.stripSmall, grid && styles.stripGrid, { borderTopColor: look.lines }]}>
      {items.map((item, i) => {
        const divided = grid ? i % 2 === 1 : i > 0;
        return (
          <View key={item.key} style={[styles.cell, grid && styles.cellGrid, grid && i >= 2 && styles.cellLower, divided && { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: look.lines, paddingLeft: 12 }]}>
            <Text numberOfLines={1} maxFontSizeMultiplier={1.25} style={[item.word ? { ...font('600'), fontSize: size - 4, lineHeight: Math.round(size * 1.15), letterSpacing: -0.4 } : { ...font('600'), fontSize: size, lineHeight: Math.round(size * 1.15), letterSpacing: -0.055 * size }, styles.tabular, { color: look.figure }]}>
              {item.figure}
              {item.unit ? <Text style={[styles.unit, { fontSize: Math.round(size * 0.62) }]}>{` ${item.unit}`}</Text> : null}
            </Text>
            <View style={styles.cellLabel}>
              {item.key === 'streak' ? <Ionicons name="flame" size={11} color={filled ? look.ink : colors.clay} /> : null}
              {item.key === 'next' ? <Ionicons name="trophy-outline" size={11} color={look.muted} /> : null}
              <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.label, styles.shrink, { color: look.muted }]}>{item.label}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, padding: 20, overflow: 'hidden' },
  // The session box's edge: a 1-point line on a dark page, none on a light one.
  bordered: { borderWidth: 1 },
  banner: { borderRadius: 16, paddingVertical: 14, paddingHorizontal: 16, overflow: 'hidden' },
  pressed: { transform: [{ scale: 0.98 }] },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bannerTitle: { ...font('600'), fontSize: 17, letterSpacing: -0.3 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  identityWords: { flex: 1, minWidth: 0, gap: 2 },
  name: { ...font('500'), fontSize: 22, lineHeight: 27, letterSpacing: -0.66 },
  mark: { alignSelf: 'flex-start' },
  small: { ...font('400'), fontSize: 13, lineHeight: 19 },
  /*
   * The rating and its system as one lockup: the system set small in spaced
   * capitals beside the number, its capitals' tops on the number's (Inter's
   * capitals stand 0.727 of the size above the baseline, the line box centred
   * on 1.21 of it), so the pair reads as one mark with nothing hanging under it.
   */
  heroRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 7 },
  hero: { marginTop: 20 },
  bannerHero: { marginTop: 6 },
  // The rating, set big and tight; its line box trimmed so the words under it sit close.
  figure: { ...font('600'), fontSize: 66, lineHeight: 66, letterSpacing: -3.6, marginVertical: -5, minWidth: 40 },
  bannerFigure: { ...font('600'), fontSize: 42, lineHeight: 46, letterSpacing: -2.2, fontVariant: ['tabular-nums'] },
  system: { ...font('600'), letterSpacing: 1.2 },
  heroSystem: { fontSize: 13, lineHeight: 16, marginTop: 1 },
  bannerSystem: { fontSize: 11, lineHeight: 14, letterSpacing: 1, marginTop: 5 },
  play: { marginTop: 14, gap: 2 },
  facts: { flexDirection: 'row', flexWrap: 'wrap' },
  inline: { flexDirection: 'row', alignItems: 'center', marginTop: 4, minWidth: 0 },
  style: { ...font('600'), fontSize: 15, lineHeight: 21, letterSpacing: -0.15 },
  surface: { ...font('500') },
  shrink: { flexShrink: 1 },
  strip: { flexDirection: 'row', marginTop: 18, paddingTop: 16, borderTopWidth: StyleSheet.hairlineWidth },
  stripSmall: { marginTop: 14, paddingTop: 12 },
  // Columns share the width by what they hold (a record is wider than a streak), so none is cut short.
  cell: { flexGrow: 1, flexShrink: 1, flexBasis: 'auto', minWidth: 0, gap: 2 },
  cellLabel: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  stripGrid: { flexWrap: 'wrap' },
  cellGrid: { flexGrow: 0, flexBasis: '50%', width: '50%' },
  cellLower: { marginTop: 12 },
  label: { ...font('400'), fontSize: 12, lineHeight: 16 },
  // A unit after a figure ("50 days"): smaller and lighter, on the figure's baseline, in its colour.
  unit: { ...font('500'), letterSpacing: 0 },
  tabular: { fontVariant: ['tabular-nums'] },
});
