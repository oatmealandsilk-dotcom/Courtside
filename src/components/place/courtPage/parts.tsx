import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { HitGlyph } from '@/components/HitGlyph';
import { LiveDot } from '@/components/LiveDot';
import { Tappable } from '@/components/Tappable';
import { useCourtSaid } from '@/components/place/CourtLife';
import { BrandWash } from '@/components/ui';
import type { CourtAccess, CourtNow } from '@/data/types';
import { playHere } from '@/features/players/courtLink';
import { NOW_ICON, nowAgo, nowStatus, playingLine } from '@/features/players/courtSummary';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, pageIsDark, spacing, typography } from '@/theme';

import type { CourtView } from './view';

/*
 * The pieces a court's page (the place card, PlaceCard) is built from: one
 * head every section opens with, one green primary with its icon and its
 * whole job in words (Start a session here), round actions that each say
 * what they do under them, and one way of saying how the court is right now.
 */

export type IconName = keyof typeof Ionicons.glyphMap;

/* ------------------------------ Section head ------------------------------ */

/**
 * A section's opening, the same for every section on the page (Posts, Open
 * hits, King of the Court, Regulars, What players say): its title, a quiet
 * count beside it, one muted line under it, and on the right at most one
 * link ("Watch all", "New hit", "Add what you know") or one small control
 * of its own (King of the Court's (i)).
 */
export function SectionHead({ title, count, sub, link, accessory }: {
  title: string;
  count?: string | null;
  sub?: React.ReactNode;
  link?: { label: string; a11y: string; onPress: () => void } | null;
  /** A small control on the right in place of a link. */
  accessory?: React.ReactNode;
}) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={styles.head}>
      <View style={styles.headRow}>
        <View style={styles.headTitle}>
          <Text accessibilityRole="header" style={styles.title} numberOfLines={1}>{title}</Text>
          {count ? <Text style={styles.count}>{count}</Text> : null}
        </View>
        {link ? (
          <Pressable accessibilityRole="button" accessibilityLabel={link.a11y} hitSlop={10} onPress={link.onPress} style={({ pressed }) => [styles.headLink, pressed && styles.pressed]}>
            <Text style={styles.headLinkText}>{link.label}</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.brand} />
          </Pressable>
        ) : accessory ?? null}
      </View>
      {sub ? (typeof sub === 'string' ? <Text style={styles.sub}>{sub}</Text> : sub) : null}
    </View>
  );
}

/* ------------------------------ The primary ------------------------------ */

/** Start a session here, and its two other states: the words and the icon. */
export function sessionLook(state: CourtView['session']['state']): { label: string; a11y: string; icon: IconName | 'live' } {
  if (state === 'live') return { label: 'Session in progress', a11y: 'Session in progress. Open it', icon: 'live' };
  if (state === 'finished') return { label: 'Log your session', a11y: 'Log your session', icon: 'checkmark-done' };
  return { label: 'Start a session here', a11y: 'Start a session here', icon: 'stopwatch-outline' };
}

/**
 * The page's one primary action, full width: the brand's fill and its own
 * lift (DESIGN.md, the One Shadow Rule), the stopwatch and the whole job in
 * words, so nobody has to guess what a circle called "Start" starts.
 */
export function PrimaryBar({ session, height = 50 }: { session: CourtView['session']; height?: number }) {
  const styles = useThemedStyles(styleDefinitions);
  const look = sessionLook(session.state);
  return (
    <Tappable accessibilityLabel={look.a11y} onPress={session.onPress} scaleTo={0.98} hoverTo={1.02} style={[styles.primary, { height, borderRadius: height / 2 }, pageIsDark() ? styles.liftDark : styles.lift]}>
      <BrandWash radius={height / 2} />
      <View style={styles.primaryInner}>
        {look.icon === 'live' ? <LiveDot size={9} color={colors.brandInk} /> : <Ionicons name={look.icon} size={19} color={colors.brandInk} />}
        <Text style={styles.primaryLabel} numberOfLines={1}>{look.label}</Text>
      </View>
    </Tappable>
  );
}

/* ---------------------------- Round actions ---------------------------- */

/**
 * One of the court's actions: a round button with its word under it, the
 * way a place card labels Directions and Share, so what each one does is
 * never a guess. `on` is a switch that is on (Following): only its icon
 * fills, so the row of words stays one colour.
 */
export function RoundAction({ icon = 'ellipse-outline', glyph, iconOn, label, onPress, accessibilityLabel, on }: {
  icon?: IconName;
  /** A drawn glyph of the app's own in place of an icon (the hit glyph). */
  glyph?: React.ReactNode;
  /** The icon while on (a filled heart). */
  iconOn?: IconName;
  label: string;
  onPress: () => void;
  accessibilityLabel: string;
  /** A switch, and whether it is on; left out for a plain action. */
  on?: boolean;
}) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={on === undefined ? undefined : { selected: on }}
      onPress={onPress}
      hitSlop={4}
      style={styles.act}
    >
      {({ pressed }) => (
        <>
          <View style={[styles.disc, pressed && styles.discPressed]}>
            {glyph ?? <Ionicons name={on && iconOn ? iconOn : icon} size={22} color={colors.brand} />}
          </View>
          <Text style={styles.actLabel} numberOfLines={1}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

/**
 * The court's round actions: Directions, Follow, Play here, Post, Share.
 * Follow only where the court can carry it (a court on the map, on a
 * database with courts' own life); Play here never at a members-only or
 * private court (never suggested for a hit); Post only where a post can be
 * tagged. The map has no button of its own: the map at the top of the page
 * is one, and says so.
 */
export function CourtActions({ view }: { view: CourtView }) {
  const styles = useThemedStyles(styleDefinitions);
  const { courtFollows, actions } = useApp();
  const { name, factsId, extras, here, access } = view;
  const following = !!(factsId && courtFollows[factsId]?.following);
  return (
    <View style={styles.acts}>
      <RoundAction icon="car-outline" label="Directions" accessibilityLabel={`Directions to ${name}`} onPress={view.onDirections} />
      {extras && factsId ? (
        <RoundAction
          icon="heart-outline"
          iconOn="heart"
          on={following}
          label={following ? 'Following' : 'Follow'}
          accessibilityLabel={following ? `Following ${name}. Unfollow` : `Follow ${name}`}
          onPress={() => actions.toggleCourtFollow({ id: factsId, name, lat: here.lat, lng: here.lng, access })}
        />
      ) : null}
      {!view.closed ? <RoundAction glyph={<HitGlyph size={23} color={colors.brand} />} label="Play here" accessibilityLabel={`Play here. Post a hit at ${name}`} onPress={() => playHere(here)} /> : null}
      {view.onPost ? <RoundAction icon="add" label="Post" accessibilityLabel={`Post a clip or photo from ${name}`} onPress={view.onPost} /> : null}
      <RoundAction icon="paper-plane-outline" label="Share" accessibilityLabel={`Share ${name} in a chat`} onPress={view.onShare} />
    </View>
  );
}

/* ------------------------------ Right now ------------------------------ */

const NOW_WORD: Record<CourtNow, string> = { free: 'Free', wait: 'A wait', full: 'Full', wet: 'Wet', locked: 'Locked' };

/**
 * How the court is right now, in words for one row, by the same rules as
 * the map card's tags (NowTags): the latest answer and how long ago, who is
 * on court now as much as the server lets you see (playingLine: names only
 * of people who follow each other with you, else a count of two or more
 * adults; words, never faces), and whether you are checked in here.
 * Nothing at someone's home.
 */
export function useCourtNow(courtId: string | undefined, access: CourtAccess) {
  const { courtNow, users } = useApp();
  const now = courtId && access !== 'private' ? courtNow[courtId] : undefined;
  const standing = nowStatus(now);
  const playing = playingLine(now, users);
  const said = !!standing;
  const title = standing ? `${NOW_WORD[standing.status]} · ${nowAgo(now!.statusAt!)}` : playing ?? 'How is it right now?';
  const sub = standing ? playing : playing ? 'How is it? Tell players' : 'Free, a wait, wet or full: tell players';
  const icon: IconName | 'live' = standing ? NOW_ICON[standing.status] : playing ? 'live' : 'pulse';
  const a11y = standing
    ? `Right now: ${standing.line}${playing ? `, ${playing}` : ''}. Update it`
    : playing ? `${playing}. Say how it is` : 'How is it right now? Tell players';
  return { now, standing, playing, said, title, sub, icon, a11y, youHere: !!now?.youHere };
}

/** The status's own mark on a dim tile: its icon (Free, A wait, Full, Wet, Locked), the live dot when only who's playing is known, else the pulse. */
export function NowMark({ icon, size = 40 }: { icon: IconName | 'live'; size?: number }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={[styles.nowMark, { width: size, height: size, borderRadius: size * 0.3 }]}>
      {icon === 'live' ? <LiveDot size={9} /> : <Ionicons name={icon} size={Math.round(size * 0.48)} color={colors.brand} />}
    </View>
  );
}

/* --------------------------- What players say --------------------------- */

/** One fact's icon, as summarizeFacts names it. */
const FACT_ICON = { 'bulb-outline': 'bulb-outline', 'people-outline': 'people-outline', 'layers-outline': 'layers-outline', 'grid-outline': 'grid-outline' } as const;

/** "Lights" alone reads like a label; said as a fact, it is "Has lights" (and "No lights" stays as it is). */
const factWords = (label: string) => (label === 'Lights' ? 'Has lights' : label);

/**
 * What players say, as plain rows, each fact on its own line with its icon
 * (Has lights, Usually busy weekday evenings, Cracked surface, Good nets),
 * then the newest note (an adult's, never named) with its flag to report it.
 */
export function PlayersSayRows({ courtId, name, inset = spacing.lg }: { courtId: string; name: string; inset?: number }) {
  const styles = useThemedStyles(styleDefinitions);
  const { said, quoted, canReport, reportNote } = useCourtSaid(courtId);
  return (
    <View>
      {said.facts.map((f, i) => (
        <View key={f.label} style={[styles.factRow, { paddingHorizontal: inset }]}>
          <View style={styles.factIcon}><Ionicons name={FACT_ICON[f.icon]} size={17} color={colors.brand} /></View>
          <View style={[styles.factWords, i > 0 && styles.factLine]}>
            <Text style={styles.factText}>{factWords(f.label)}</Text>
          </View>
        </View>
      ))}
      {quoted ? (
        <View style={[styles.factRow, { paddingHorizontal: inset }]}>
          <View style={styles.factIcon}><Ionicons name="chatbubble-ellipses-outline" size={17} color={colors.brand} /></View>
          <View style={[styles.factWords, styles.noteWords, said.facts.length > 0 && styles.factLine]}>
            <Text style={styles.noteText} numberOfLines={3}>“{quoted.text}”</Text>
            {canReport ? (
              <Pressable accessibilityRole="button" accessibilityLabel={`Report this note about ${name}`} hitSlop={12} onPress={reportNote} style={({ pressed }) => [styles.noteFlag, pressed && styles.pressed]}>
                <Ionicons name="flag-outline" size={14} color={colors.textFaint} />
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

/** What players are asked about, said as plain words (not chips: they are not buttons). */
export const ASK_ABOUT = 'Lights, nets, busy times, the surface, house rules';

const styleDefinitions = StyleSheet.create({
  pressed: { opacity: 0.6 },
  // The one head every section opens with.
  head: { gap: 3 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 26 },
  // The title and its count share a baseline.
  headTitle: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  title: { ...typography.heading, color: colors.text, flexShrink: 1 },
  count: { ...typography.bodyStrong, color: colors.textFaint, fontVariant: ['tabular-nums'] },
  headLink: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: 2 },
  headLinkText: { ...typography.smallStrong, fontSize: 14, color: colors.brand },
  sub: { ...typography.small, color: colors.textMuted, lineHeight: 18, flexShrink: 1 },
  // The primary.
  primary: { alignSelf: 'stretch', backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', overflow: 'visible' },
  primaryInner: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: spacing.xl },
  primaryLabel: { ...typography.bodyStrong, fontSize: 16, color: colors.brandInk },
  // The one shadow on the page: the primary action, in its own colour (plain dark on a dark page).
  lift: { shadowColor: colors.brand, shadowOpacity: 0.28, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 3 },
  liftDark: { shadowColor: '#000000', shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 3 },
  // The round actions.
  // A phone's full width; on a computer, a row no wider than a phone's, centred under the primary.
  acts: { flexDirection: 'row', alignItems: 'flex-start', alignSelf: 'center', width: '100%', maxWidth: 440 },
  act: { flex: 1, minWidth: 0, alignItems: 'center', gap: 7 },
  // Fully round, so it reads as pressable (DESIGN.md, the Pill Rule); the raised surface and a hairline keep it off the page on every court.
  disc: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong },
  discPressed: { backgroundColor: colors.bgElevated, transform: [{ scale: 0.95 }] },
  actLabel: { ...font('500'), fontSize: 12, lineHeight: 15, letterSpacing: -0.1, color: colors.text },
  // Right now.
  nowMark: { backgroundColor: colors.brandDim, alignItems: 'center', justifyContent: 'center' },
  // What players say: the hairline runs from the words, not the icon.
  factRow: { flexDirection: 'row', alignItems: 'stretch', gap: spacing.md },
  factIcon: { width: 30, height: 30, borderRadius: 9, backgroundColor: colors.brandDim, alignItems: 'center', justifyContent: 'center', marginVertical: 12 },
  factWords: { flex: 1, minWidth: 0, justifyContent: 'center', paddingVertical: 12 },
  factLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  factText: { ...typography.body, color: colors.text },
  noteWords: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  noteText: { ...typography.body, fontSize: 14, lineHeight: 20, color: colors.textMuted, flex: 1, minWidth: 0 },
  noteFlag: { paddingTop: 3 },
});
