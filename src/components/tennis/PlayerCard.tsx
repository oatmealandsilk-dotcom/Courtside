import { PRESS_SHRINK } from '@/theme/press';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SwipePressable } from '@/components/SwipePressable';
import Ionicons from '@expo/vector-icons/Ionicons';

import { BrandMark } from '@/components/BrandMark';
import { Avatar } from '@/components/ui';
import { CardWash, boxLook, cardLook, quietBox, type CardLook } from '@/components/session/SessionCard';
import { CountUp } from '@/components/session/CountUp';
import type { SurfacePreference, User } from '@/data/types';
import { mixHex } from '@/features/activity/zones';
import { playStyleLabel } from '@/lib/badges';
import { useReducedMotion } from '@/lib/useReducedMotion';
import {
  cityOf, daysUntil, factsList, handsLine, ratingText, shortDate, stripItems, surfaceSlot, surfaceWord, tournamentName, type StripItem,
} from '@/features/players/tennisProfile';
import { usePerWeek } from '@/features/players/usePerWeek';
import { isOfficial } from '@/features/players/official';
import { OfficialCheck } from '@/components/OfficialCheck';
import { useTheme } from '@/theme/ThemeProvider';
import { LinearGradient } from 'expo-linear-gradient';
import Reanimated, { Easing, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { SCALES } from '@/features/players/ratingScales';
import { colors, font, lift } from '@/theme';
import { LESS_AI, LESS_AI_ROUND2, corner } from '@/theme/look';


/**
 * How Clean's light Tennis profile banner stands out: 'now' as it is; 'A' soft green wash; 'B' green edge + green rating;
 * 'C' lifted with a thin green top line + green rating; 'D' in between A and C (owner, Oct 25: "For card in between a and c"):
 * A's soft wash, lifted a little off the page, the rating in green, no hard line.
 */
const BANNER_POP = 'D' as 'now' | 'A' | 'B' | 'C' | 'D';

/** The rating's count: once per player per time the app is open, never on every visit. */
const played = new Set<string>();

/**
 * A player's card: the session box's twin, coloured by the very same look
 * (cardLook) and fade (CardWash) in every court, so the two always match
 * (Oct 5, owner: "The tennis profile card should be the same as activity
 * card. Like the colors and stuff"): each court's shirt (Oct 6), the cream
 * one on the CourtSide court, the shirt's own colour and lettering on the
 * city courts. On it the rating once, big, its system beside it, how they
 * play, and the few numbers worth knowing. `full` heads the Tennis profile
 * page; `banner` is the smaller one on a profile, the whole of it a link to
 * the page.
 *
 * Oct 5, owner: no level words under the rating ("Advanced junior / D3"),
 * and no ruler of ticks under it: the number and its system say it.
 */
export function PlayerCard({ user, variant, onPress, setup }: {
  user: User;
  variant: 'full' | 'banner' | 'setup';
  /** The banner's link. */
  onPress?: () => void;
  /** The setup card's draft (variant 'setup'): what has been answered so far. */
  setup?: SetupDraft;
}) {
  if (variant === 'setup') return <SetupCard user={user} draft={setup ?? { rated: false, years: null }} />;
  return <ShownCard user={user} variant={variant} onPress={onPress} />;
}

/**
 * What the sign-up's live card knows (variant 'setup'): whether the rating typed is a real one yet, the years
 * played (0 is under a year; null not said yet), and whether to show how they play (Your game).
 */
export interface SetupDraft { rated: boolean; years: number | null; game?: boolean }

function ShownCard({ user, variant, onPress }: { user: User; variant: 'full' | 'banner'; onPress?: () => void }) {
  const { theme } = useTheme();
  // The banner on a profile, on Clean, is drawn like the stats sheet (Oct 25, "D all for less ai", item 1; his
  // Oct 24 rule "On clean, the color card should not be green"): boxLook, the session box's own in-app look.
  // On the other courts but Night both cards are the quiet box near the page (Oct 25, owner: "I meant the tennis
  // profile card and the activity cards"), as the session boxes are: boxLook. Night's full card keeps its own. Clean's
  // full card (the Tennis profile page) now matches its banner (Oct 29, owner: "This needs to match the other card on
  // clean theme").
  const look = (LESS_AI_ROUND2 && (variant === 'banner' || theme === 'clean')) || quietBox(theme) ? boxLook(theme) : cardLook(theme);
  // The rating in the court's accent on a light card drawn as the stats sheet (the quiet box; Clean's banner below);
  // London's in its purple (look.touch, Oct 25).
  const ratingInk = look.plain ? look.touch ?? colors.brand : look.figure;
  const reduced = useReducedMotion();
  const week = usePerWeek(user);
  const key = `${variant}:${user.id}`;
  // Decided once, on the first draw: a later redraw never starts it over.
  const [play] = useState(() => variant === 'full' && !reduced && !played.has(key));
  useEffect(() => { played.add(key); }, [key]);
  const p = user.profile;
  const system = p.skillSystem;
  // An official CourtSide account shows no rating (features/players/official): no big number, none said aloud.
  const official = isOfficial(user.id);
  const rated = official ? '' : ` ${system} ${ratingText(p)}`;
  // The system's name in the card's small ink (the deeper green on cream, the muted ink on a dark page): the level pill
  // beside the name already wears the system's own colour, and NTRP green beside New York's yellow figures fought them.
  const systemInk = look.eyebrow;
  const filled = look.filled;

  if (variant === 'banner') {
    // Clean's light banner, made to stand out a little more (Oct 25, owner: "For the tennis card. Give it a slight
    // maybe gradient or just something to make it pop more"). BANNER_POP picks how; only where the banner is light.
    const pop = look.plain ? BANNER_POP : 'now';
    const next = upcoming(user)[0];
    const items: StripItem[] = next ? [...stripItems(user, 2, week), nextItem(next)] : stripItems(user, 3, week);
    const spoken = `${user.name}'s tennis profile.${rated ? `${rated}.` : ''} ${playStyleLabel[p.playStyle]}, ${surfaceWord[p.preferredSurface]}. ${items.map((i) => i.spoken).join(', ')}`;
    return (
      <SwipePressable accessibilityRole="link" accessibilityLabel={spoken} onPress={onPress} style={({ pressed }) => [styles.banner, { backgroundColor: look.fill, borderColor: look.border }, look.dark && styles.bordered, (pop === 'A' || pop === 'D') && { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }, (pop === 'C' || pop === 'D') && [lift, styles.popLift], pressed && styles.pressed]}>
        <CardWash look={look} radius={corner(16)} />
        {/* A: a soft wash of the court's pale accent from the top corner (the quiet box's own tint), fading to the card by the middle. */}
        {pop === 'A' || pop === 'D' ? <LinearGradient pointerEvents="none" colors={[look.tint ?? colors.brandDim, colors.surface]} locations={[0, 0.75]} start={{ x: 0, y: 0 }} end={{ x: 0.9, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: corner(16) }]} /> : null}
        {/* B: a green edge down the left side. C: a thin green line along the top. */}
        {pop === 'B' ? <View pointerEvents="none" style={[styles.popEdge, { backgroundColor: colors.brand }]} /> : null}
        {pop === 'C' ? <View pointerEvents="none" style={[styles.popTop, { backgroundColor: colors.brand }]} /> : null}
        <View style={styles.headRow}>
          <Text style={[styles.bannerTitle, { color: look.ink }]}>Tennis profile</Text>
          <Ionicons name="chevron-forward" size={15} color={look.muted} />
        </View>
        {official ? null : <View style={[styles.heroRow, styles.bannerHero]}>
          <Text maxFontSizeMultiplier={1.3} style={[styles.bannerFigure, { color: pop === 'now' || pop === 'A' ? look.figure : look.touch ?? colors.brand }]}>{ratingText(p)}</Text>
          <Text maxFontSizeMultiplier={1.3} style={[styles.system, styles.bannerSystem, { color: systemInk }]}>{system}</Text>
        </View>}
        <View style={styles.inline}>
          <Text style={[styles.small, { color: look.muted }]}>{playStyleLabel[p.playStyle]} · </Text>
          <Swatch surface={p.preferredSurface} look={look} />
          <Text numberOfLines={1} style={[styles.small, styles.shrink, { color: look.muted }]}>{surfaceWord[p.preferredSurface]}</Text>
        </View>
        {items.length ? <Strip items={items} look={look} size={20} filled={filled} caps={look.plain} /> : null}
      </SwipePressable>
    );
  }

  const items = stripItems(user, 4, week);
  const facts = factsList(p, items);
  // Clean's full card wears the banner's own wash (BANNER_POP A or D), so the Tennis profile page matches the Profile tab.
  const fullPop = look.plain && theme === 'clean' && (BANNER_POP === 'A' || BANNER_POP === 'D');
  const spoken = [
    `${user.name},${rated}.`,
    `${playStyleLabel[p.playStyle]}, ${surfaceWord[p.preferredSurface].toLowerCase()}, ${handsLine(p).replace(' · ', ', ').toLowerCase()}.`,
    facts.length ? `${facts.join(', ')}.` : '',
    items.length ? `${items.map((i) => i.spoken).join(', ')}.` : '',
  ].filter(Boolean).join(' ');
  return (
    <View accessible accessibilityRole="summary" accessibilityLabel={spoken} style={[styles.card, { backgroundColor: look.fill, borderColor: look.border }, look.dark && styles.bordered, fullPop && [{ borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, borderRadius: corner(16) }, lift, styles.popLift]]}>
      <CardWash look={look} radius={fullPop ? corner(16) : corner(20)} />
      {/* Clean: the same soft wash as the Profile tab's banner, so the two cards match (Oct 29, owner). */}
      {fullPop ? <LinearGradient pointerEvents="none" colors={[look.tint ?? colors.brandDim, colors.surface]} locations={[0, 0.75]} start={{ x: 0, y: 0 }} end={{ x: 0.9, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: corner(16) }]} /> : null}
      <View style={styles.identity}>
        {/* The brand disc their profile page gives them, so the same person wears one colour; on a filled card,
            a deeper shade of the card instead (a brand disc would vanish into it). */}
        <Avatar name={user.name} seed={user.avatarSeed} uri={user.avatarUrl} size={52} ring={user.isCoach} style={{ backgroundColor: filled ? mixHex(look.fill, colors.text, 0.35) : colors.brand }} />
        <View style={styles.identityWords}>
          <View style={styles.nameLine}><Text numberOfLines={1} style={[styles.name, styles.shrink, { color: look.ink }]}>{user.name}</Text><OfficialCheck userId={user.id} size={17} /></View>
          <Text numberOfLines={1} style={[styles.small, { color: look.muted }]}>@{user.handle}{user.location ? ` · ${cityOf(user.location)}` : ''}{user.isCoach ? ' · Coach' : ''}</Text>
        </View>
        {LESS_AI ? null : <View style={styles.mark}><BrandMark size={22} color={ratingInk} /></View>}
      </View>

      {official ? null : <View style={[styles.heroRow, styles.hero]}>
        <CountUp value={Number(ratingText(p))} part={system === 'ITF' ? 'int' : 'dec1'} play={play} duration={700} maxFontSizeMultiplier={1.3} style={[styles.figure, { color: ratingInk }]} />
        <Text maxFontSizeMultiplier={1.3} style={[styles.system, styles.heroSystem, { color: systemInk }]}>{system}</Text>
      </View>}

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

      {items.length ? <Strip items={items} look={look} size={24} filled={filled} caps={fullPop} /> : null}
    </View>
  );
}

/**
 * The sign-up's live card (ONBOARDING_V2, Oct 29, owner: "3 and 5 specifically need to push more for ppl to put in
 * information"): the player's own card building as they type, in the Profile tab banner's look on every court
 * (boxLook, CardWash, Clean's soft wash and lift), so what they fill in is visibly what other players will see.
 * Display only: nothing here saves. A part not answered yet shows as a faint stand-in at the same size, so the card
 * never changes height as it fills. The rating gives one small scale-up the moment it becomes a real rating, and
 * nothing else moves.
 */
function SetupCard({ user, draft }: { user: User; draft: SetupDraft }) {
  const { theme } = useTheme();
  // Chosen as the banner's is, so it is the Profile tab's card on every court.
  const look = LESS_AI_ROUND2 || quietBox(theme) ? boxLook(theme) : cardLook(theme);
  const ratingInk = look.plain ? look.touch ?? colors.brand : look.figure;
  const pop = look.plain ? BANNER_POP : 'now';
  const p = user.profile;
  const system = p.skillSystem === 'UTR' ? 'UTR' : 'NTRP';
  const name = user.name.trim();
  const town = user.location ? cityOf(user.location) : '';
  const rating = draft.rated ? ratingText(p) : '';
  const scale = SCALES[system];
  const level = draft.rated ? (scale.bands.find((b) => p.rating <= b.upTo) ?? scale.bands[scale.bands.length - 1]).label : '';
  const years = draft.years === null ? '' : draft.years === 0 ? '<1 yr' : `${draft.years} ${draft.years === 1 ? 'yr' : 'yrs'}`;
  const filled = look.filled;
  const spoken = `Your card: ${name || 'no name yet'}, ${town || 'no town yet'}, ${rating ? `${system} ${rating}` : 'no rating yet'}${draft.years === null ? '' : `, playing ${draft.years === 0 ? 'less than a year' : `${draft.years} ${draft.years === 1 ? 'year' : 'years'}`}`}.`;
  return (
    <View accessible accessibilityRole="summary" accessibilityLabel={spoken} style={[styles.setupCard, { backgroundColor: look.fill, borderColor: look.border }, look.dark && styles.bordered, (pop === 'A' || pop === 'D') && { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }, (pop === 'C' || pop === 'D') && [lift, styles.popLift]]}>
      <CardWash look={look} radius={corner(16)} />
      {pop === 'A' || pop === 'D' ? <LinearGradient pointerEvents="none" colors={[look.tint ?? colors.brandDim, colors.surface]} locations={[0, 0.75]} start={{ x: 0, y: 0 }} end={{ x: 0.9, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: corner(16) }]} /> : null}
      <View style={styles.setupTop}>
        <Avatar name={name || ' '} seed={user.avatarSeed} uri={user.avatarUrl} size={44} style={{ backgroundColor: filled ? mixHex(look.fill, colors.text, 0.35) : name ? colors.brand : look.lines }} />
        <View style={styles.identityWords}>
          <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.setupName, { color: name ? look.ink : look.faint }]}>{name || 'Your name'}</Text>
          <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.small, { color: look.muted }]}>
            @{user.handle}<Text style={{ color: town ? look.muted : look.faint }}>{` · ${town || 'Your town'}`}</Text>
          </Text>
        </View>
        <Bump token={rating}>
          <View style={styles.setupRating}>
            <Text maxFontSizeMultiplier={1.2} style={[styles.setupFigure, { color: rating ? ratingInk : look.faint }]}>{rating || '–.–'}</Text>
            <Text maxFontSizeMultiplier={1.2} style={[styles.setupSystem, { color: look.eyebrow }]}>{system}</Text>
          </View>
        </Bump>
      </View>
      {draft.game ? (
        <View style={styles.setupGame}>
          <View style={styles.inline}>
            <Text style={[styles.small, { color: look.muted }]}>{playStyleLabel[p.playStyle]} · </Text>
            <Swatch surface={p.preferredSurface} look={look} />
            <Text numberOfLines={1} style={[styles.small, styles.shrink, { color: look.muted }]}>{surfaceWord[p.preferredSurface]}</Text>
          </View>
          <Text numberOfLines={1} style={[styles.small, { color: look.muted }]}>{handsLine(p)}</Text>
        </View>
      ) : null}
      <SetupFacts look={look} cells={[{ key: 'years', figure: years, empty: '– yrs', label: 'Playing' }, { key: 'level', figure: level, empty: '–', label: 'Level', wide: true }]} />
    </View>
  );
}

/** The setup card's two facts on a hairline, Strip's look: two by two never needed (there are only two). */
function SetupFacts({ look, cells }: { look: CardLook; cells: { key: string; figure: string; empty: string; label: string; wide?: boolean }[] }) {
  return (
    <View style={[styles.setupFacts, { borderTopColor: look.lines }]}>
      {cells.map((c, i) => (
        <View key={c.key} style={[styles.cell, c.wide ? styles.setupWide : styles.setupNarrow, i > 0 && { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: look.lines, paddingLeft: 12 }]}>
          <Text numberOfLines={1} maxFontSizeMultiplier={1.25} style={[styles.setupFact, styles.tabular, { color: c.figure ? look.figure : look.faint }]}>{c.figure || c.empty}</Text>
          <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.label, look.plain && styles.capsLabel, { color: look.muted }]}>{c.label}</Text>
        </View>
      ))}
    </View>
  );
}

/** One small scale-up when `token` becomes something (a rating typed in full): no fade, then still. */
function Bump({ token, children }: { token: string; children: React.ReactNode }) {
  const reduced = useReducedMotion();
  const s = useSharedValue(1);
  const [last, setLast] = useState(token);
  useEffect(() => {
    if (token === last) return;
    setLast(token);
    if (!token || reduced) return;
    s.value = withSequence(withTiming(1.14, { duration: 140, easing: Easing.out(Easing.cubic) }), withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) }));
  }, [token, last, reduced, s]);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return <Reanimated.View style={anim}>{children}</Reanimated.View>;
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
export function Swatch({ surface, look, size = 9 }: { surface: SurfacePreference; look: Pick<CardLook, 'filled' | 'ink'>; size?: number }) {
  const ring = look.filled;
  return <View style={{ width: size, height: size, borderRadius: 2, marginRight: 5, backgroundColor: ring ? 'transparent' : colors[surfaceSlot(surface)], borderWidth: ring ? 1.5 : 0, borderColor: look.ink }} />;
}

/**
 * The card's numbers, side by side on hairlines: figures in the card's figure
 * colour (a unit after one set small, on its baseline), labels small under
 * them. With text set very large (past 1.3×) four no longer fit across, so
 * they sit two by two.
 */
function Strip({ items, look, size, filled, caps = false }: { items: StripItem[]; look: CardLook; size: number; filled: boolean; /** The labels in small grey capitals, as on the stats sheet (Clean's banner). */ caps?: boolean }) {
  const { fontScale } = useWindowDimensions();
  const grid = items.length >= 4 && fontScale > 1.3;
  return (
    <View style={[styles.strip, size < 24 && styles.stripSmall, grid && styles.stripGrid, { borderTopColor: look.lines }]}>
      {items.map((item, i) => {
        const divided = grid ? i % 2 === 1 : i > 0;
        return (
          <View key={item.key} style={[styles.cell, grid && styles.cellGrid, grid && i >= 2 && styles.cellLower, divided && { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: look.lines, paddingLeft: 12 }]}>
            <Text numberOfLines={1} maxFontSizeMultiplier={1.25} style={[item.word ? { ...font('600'), fontSize: size - 4, lineHeight: Math.round(size * 1.15), letterSpacing: -0.2 } : { ...font('600'), fontSize: size, lineHeight: Math.round(size * 1.15), letterSpacing: -0.055 * size }, styles.tabular, { color: look.figure }]}>
              {item.figure}
              {item.unit ? <Text style={[styles.unit, { fontSize: Math.round(size * 0.62) }]}>{` ${item.unit}`}</Text> : null}
            </Text>
            <View style={styles.cellLabel}>
              {item.key === 'streak' ? <Ionicons name="flame" size={11} color={filled ? look.ink : colors.clay} /> : null}
              {item.key === 'next' ? <Ionicons name="trophy-outline" size={11} color={look.muted} /> : null}
              <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.label, caps && styles.capsLabel, styles.shrink, { color: look.muted }]}>{item.label}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: corner(20), padding: 20, overflow: 'hidden' },
  // The session box's edge: a 1-point line on a dark page, none on a light one.
  bordered: { borderWidth: 1 },
  popEdge: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  popTop: { position: 'absolute', left: 0, right: 0, top: 0, height: 3 },
  popLift: { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, boxShadow: '0px 4px 16px rgba(42, 36, 24, 0.10)' },
  banner: { borderRadius: corner(16), paddingVertical: 14, paddingHorizontal: 16, overflow: 'hidden' },
  pressed: { transform: [{ scale: PRESS_SHRINK }] },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bannerTitle: { ...font('600'), fontSize: 17, letterSpacing: -0.2 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  identityWords: { flex: 1, minWidth: 0, gap: 2 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  name: { ...font('500'), fontSize: 22, lineHeight: 27, letterSpacing: -0.4 },
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
  figure: { ...font('600'), fontSize: 66, lineHeight: 66, letterSpacing: -2.2, marginVertical: -5, minWidth: 40 },
  bannerFigure: { ...font('600'), fontSize: 42, lineHeight: 46, letterSpacing: -1.3, fontVariant: ['tabular-nums'] },
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
  // The stats sheet's small capital label (SessionCard's capsLabel).
  capsLabel: { ...font('600'), fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6 },
  // A unit after a figure ("50 days"): smaller and lighter, on the figure's baseline, in its colour.
  unit: { ...font('500'), letterSpacing: 0 },
  tabular: { fontVariant: ['tabular-nums'] },
  // The sign-up's live card (variant 'setup').
  setupCard: { borderRadius: corner(16), padding: 16, overflow: 'hidden' },
  setupTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  setupName: { ...font('600'), fontSize: 17, lineHeight: 22, letterSpacing: -0.2 },
  setupRating: { flexDirection: 'row', alignItems: 'baseline', gap: 5 },
  setupFigure: { ...font('700'), fontSize: 34, lineHeight: 40, letterSpacing: -1, fontVariant: ['tabular-nums'] },
  setupSystem: { ...font('600'), fontSize: 13, letterSpacing: 1 },
  setupGame: { marginTop: 10, gap: 0 },
  setupFacts: { flexDirection: 'row', marginTop: 12, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  setupFact: { ...font('600'), fontSize: 17, lineHeight: 22, letterSpacing: -0.3 },
  setupNarrow: { flexGrow: 0, flexBasis: 96 },
  setupWide: { flexGrow: 1 },
});
