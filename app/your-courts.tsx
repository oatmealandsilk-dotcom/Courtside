import { PRESS_DIM } from '@/theme/press';
import React from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { CourtGlyph } from '@/components/map/CourtGlyph';
import { CourtMapThumb } from '@/components/map/CourtMapThumb';
import { CrownGlyph } from '@/components/place/CrownGlyph';
import { Box, SectionHead } from '@/components/tennis/ProfileParts';
import { Avatar, Screen } from '@/components/ui';
import type { User } from '@/data/types';
import { Bar, BadgeDisc, CardSwatch, CourtTile, WeekDots } from '@/features/courtUnlocks/DesignParts';
import { BADGES, BADGE_EARNED, DESIGN_REGULARS, HAVE_IT, KING, MY_COURTS, NEXT_CARD, TO_UNLOCK, TO_UNLOCK_AT, WEEKS, WEEKS_IN_A_ROW, courtNumber, type DesignCourt } from '@/features/courtUnlocks/designDemo';
import { goBack } from '@/lib/goBack';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, lift, spacing, typography, withAlpha } from '@/theme';
import { corner } from '@/theme/look';
import { TextScale } from '@/theme/textScale';

/**
 * DESIGN BRANCH ONLY (design/court-unlocks): Your courts, opened from the
 * Profile tab's "Your courts" row. Your collection (every court you have
 * logged a hit or a session at), your crown, the court badges, your weeks in
 * a row and the next profile card, then the courts themselves and the
 * public courts near you still to unlock. Made-up sample data.
 */
export default function YourCourts() {
  const styles = useThemedStyles(styleDefinitions);
  const { currentUser } = useApp();
  const count = MY_COURTS.length;
  const nextBadge = BADGES.find((b) => b > count) ?? 50;
  const slots = Array.from({ length: nextBadge }, (_, i) => i < count);
  // Two cards a row on the page's 16-point gutters.
  const { width } = useWindowDimensions();
  const cardW = Math.floor((Math.min(width, 640) - spacing.lg * 2 - GRID_GAP) / 2);
  return (
    <Screen title="Your courts" compactTitle onBack={() => goBack('/profile')}>
      <View style={styles.page}>
        {/* The collection: how many, and the slots to the next badge. */}
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <Text maxFontSizeMultiplier={TextScale.TITLE} style={styles.heroNumber}>{count}</Text>
            <View style={styles.heroWords}>
              <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.heroUnit}>courts unlocked</Text>
              <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.heroSub}>In 3 cities · 1 new this week</Text>
            </View>
          </View>
          <View style={styles.slots}>
            {slots.map((on, i) => <CourtTile key={i} size={27} unlocked={on} dashed={!on} />)}
          </View>
          <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.heroNext}>{nextBadge - count} more for your {nextBadge}-court badge</Text>
        </View>

        {/* The crown: most hits logged at one court this month. */}
        <View>
          <SectionHead title="King of the Court" />
          <Box>
            <View style={styles.king}>
              <View style={styles.kingFace}>
                <View style={[styles.ring, { borderColor: withAlpha(colors.sun, 0.75) }]}>
                  {currentUser ? <Avatar name={currentUser.name} seed={currentUser.avatarSeed} uri={currentUser.avatarUrl} size={50} /> : null}
                </View>
                <View style={styles.crownOn}><CrownGlyph size={22} color={colors.sun} /></View>
              </View>
              <View style={styles.kingWords}>
                <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.kingName} numberOfLines={1}>{KING.court}</Text>
                <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.kingSub} numberOfLines={2}>Most hits logged here in {KING.month}</Text>
              </View>
              <View style={styles.kingCount}>
                <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.kingNumber}>{KING.hits}</Text>
                <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.kingUnit}>hits</Text>
              </View>
            </View>
            <View style={styles.kingFoot}>
              <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.kingFootText}>Next best has {KING.next}. Your crown shows on {KING.court}’s page and your profile until Oct 31.</Text>
            </View>
          </Box>
        </View>

        {/* The court badges. */}
        <View>
          <SectionHead title="Badges" line="One for 5, 10, 25 and 50 courts" />
          <View style={styles.badges}>
            {BADGES.map((n) => {
              const state = BADGE_EARNED[n] ? 'earned' : n === nextBadge ? 'next' : 'locked';
              return (
                <View key={n} style={styles.badge}>
                  <BadgeDisc n={n} state={state} have={count} />
                  <Text maxFontSizeMultiplier={TextScale.CARD} style={[styles.badgeName, state === 'locked' && styles.badgeNameLocked]}>{n} courts</Text>
                  <Text maxFontSizeMultiplier={TextScale.CARD} style={[styles.badgeSub, state === 'earned' && styles.badgeSubEarned]}>
                    {state === 'earned' ? BADGE_EARNED[n] : state === 'next' ? `${count} of ${n}` : ' '}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Keep it going: weeks in a row, and the next profile card. */}
        <View style={styles.twoUp}>
          <View style={styles.half}>
            <Box padded>
              <View style={styles.tileInner}>
                <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.tileLabel}>Weeks in a row</Text>
                <Text maxFontSizeMultiplier={TextScale.TITLE} style={styles.tileNumber}>{WEEKS_IN_A_ROW}</Text>
                <WeekDots weeks={WEEKS} size={12} />
                <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.tileSub}>Play once a week to keep it</Text>
              </View>
            </Box>
          </View>
          <View style={styles.half}>
            <Box padded>
              <View style={styles.tileInner}>
                <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.tileLabel}>Next card</Text>
                <View style={styles.cardRow}>
                  <CardSwatch width={24} />
                  <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.cardName} numberOfLines={2}>{NEXT_CARD.name}</Text>
                </View>
                <Bar have={NEXT_CARD.have} need={NEXT_CARD.need} />
                <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.tileSub}>{NEXT_CARD.have} of {NEXT_CARD.need} days this month</Text>
              </View>
            </Box>
          </View>
        </View>

        {/* Round 2 (owner: the second screen "could use some work"): the courts as a collection, newest first,
            each its own block of map stamped with its number; then the ones near you still to unlock, dimmed, with who has them. */}
        <View>
          <SectionHead title={`Your ${count} courts`} link={{ label: 'Map', accessibilityLabel: 'See your courts on the map', onPress: () => router.push('/map') }} />
          <View style={styles.grid}>
            {MY_COURTS.map((c) => <CourtCard key={c.name} court={c} width={cardW} />)}
          </View>
        </View>

        <View>
          <SectionHead title="Still to unlock near you" line="Log a hit or a session at one to stamp it." />
          <View style={styles.grid}>
            {TO_UNLOCK.map((c) => <LockedCard key={c.name} name={c.name} miles={c.miles} courts={c.courts} width={cardW} />)}
          </View>
        </View>

        <View style={styles.fine}>
          <Ionicons name="people-outline" size={14} color={colors.textFaint} />
          <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.fineText}>Friends see your courts and crowns, never where you are now.</Text>
        </View>
      </View>
    </Screen>
  );
}

const MAP_H = 112;
const GRID_GAP = 10;

/**
 * One of your courts in the collection: its own block of map with its mark
 * in your colour, its number (No. 6, the order you unlocked them in) and,
 * when it has one, New or your crown; under it the name and how much you
 * play there.
 */
function CourtCard({ court, width }: { court: DesignCourt; width: number }) {
  const styles = useThemedStyles(styleDefinitions);
  const n = courtNumber(court.name);
  const sub = [`${court.sessions} ${court.sessions === 1 ? 'session' : 'sessions'}`, court.since === 'Today' ? 'today' : `since ${court.since}`].join(' · ');
  const now = DESIGN_REGULARS[court.name]?.hereNow ?? 0;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${court.name}, court number ${n}. ${sub}`} onPress={() => {}} style={({ pressed }) => [styles.card, { width }, pressed && { opacity: PRESS_DIM }]}>
      <View style={[styles.cardMap, { width, height: MAP_H }]}>
        <CourtMapThumb lat={court.lat} lng={court.lng} width={width} height={MAP_H} zoom={14.6} />
        <View pointerEvents="none" style={styles.cardMarkWrap}>
          <View style={styles.cardMark}><CourtGlyph size={15} color={colors.brandInk} /></View>
        </View>
        <View style={styles.cardNo}><Text maxFontSizeMultiplier={1.1} style={styles.cardNoText}>No. {n}</Text></View>
        {court.isNew ? (
          <View style={[styles.cardFlag, styles.cardFlagNew]}><Text maxFontSizeMultiplier={1.1} style={styles.cardFlagNewText}>New</Text></View>
        ) : court.crown ? (
          <View style={styles.cardFlag}><CrownGlyph size={12} color={colors.sun} /><Text maxFontSizeMultiplier={1.1} style={styles.cardFlagText}>King · {KING.month.slice(0, 3)}</Text></View>
        ) : null}
        {/* Away from home: the city, like a stamp from a trip. People there now: a number, never who. */}
        {court.town ? (
          <View style={styles.cardFoot}><Ionicons name="airplane" size={10} color={colors.text} /><Text maxFontSizeMultiplier={1.1} style={styles.cardFlagText}>{court.town}</Text></View>
        ) : now ? <LiveCount n={now} /> : null}
      </View>
      <View style={styles.cardWords}>
        <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.courtTitle} numberOfLines={2}>{court.name}</Text>
        <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.cardSub} numberOfLines={1}>{sub}</Text>
      </View>
    </Pressable>
  );
}

/** "● 3 here now" at a card's foot: how many are at the court now, a number only. */
function LiveCount({ n }: { n: number }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={styles.cardFoot}>
      <View style={styles.liveDot} />
      <Text maxFontSizeMultiplier={1.1} style={[styles.cardFlagText, { color: colors.open }]}>{n} here now</Text>
    </View>
  );
}

/**
 * A public court near you still to unlock: the map shows through, dimmed,
 * the mark only an outline with a lock; how far, and who already has it
 * (friends by name, everyone else a number).
 */
function LockedCard({ name, miles, courts, width }: { name: string; miles: string; courts: number; width: number }) {
  const styles = useThemedStyles(styleDefinitions);
  const { users } = useApp();
  const at = TO_UNLOCK_AT[name];
  const have = HAVE_IT[name] ?? { friends: [], total: 0 };
  const friends = have.friends.map((id) => users.find((u) => u.id === id)).filter((u): u is User => !!u);
  const others = Math.max(0, have.total - friends.length);
  // The first friend by name, the rest a number: "Omar + 30 have it".
  const who = friends.length ? `${friends[0].name.split(' ')[0]} + ${have.total - 1}` : `${have.total} players`;
  const now = DESIGN_REGULARS[name]?.hereNow ?? 0;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${name}, not unlocked yet. ${miles}. ${who} have it`} onPress={() => {}} style={({ pressed }) => [styles.card, styles.cardLocked, { width }, pressed && { opacity: PRESS_DIM }]}>
      <View style={[styles.cardMap, { width, height: MAP_H }]}>
        {at ? <CourtMapThumb lat={at.lat} lng={at.lng} width={width} height={MAP_H} zoom={14.6} /> : null}
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: withAlpha(colors.bg, 0.55) }]} />
        <View pointerEvents="none" style={styles.cardMarkWrap}>
          <View style={styles.cardMarkLocked}><Ionicons name="lock-closed" size={14} color={colors.textMuted} /></View>
        </View>
        <View style={styles.cardNo}><Text maxFontSizeMultiplier={1.1} style={styles.cardNoText}>{miles}</Text></View>
        {now ? <LiveCount n={now} /> : null}
      </View>
      <View style={styles.cardWords}>
        <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.courtTitle} numberOfLines={2}>{name}</Text>
        <View style={styles.haveRow}>
          {friends.length ? (
            <View style={styles.haveFaces}>
              {friends.slice(0, 2).map((u, i) => (
                <View key={u.id} style={[styles.haveFace, i > 0 && { marginLeft: -6 }]}>
                  <Avatar name={u.name} seed={u.avatarSeed} uri={u.avatarUrl} size={18} />
                </View>
              ))}
            </View>
          ) : null}
          <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.cardSub} numberOfLines={1}><Text style={styles.haveStrong}>{who}</Text> have it</Text>
        </View>
        <Text maxFontSizeMultiplier={TextScale.CARD} style={[styles.cardSub, { marginTop: -2 }]} numberOfLines={1}>{courts} courts · public</Text>
      </View>
    </Pressable>
  );
}

const styleDefinitions = StyleSheet.create({
  page: { gap: spacing.xxl, paddingTop: spacing.md, paddingBottom: 120 },
  hero: { gap: spacing.md },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  heroNumber: { ...font('500'), fontSize: 56, lineHeight: 60, letterSpacing: -2, color: colors.text, fontVariant: ['tabular-nums'] },
  heroWords: { gap: 2, flex: 1 },
  heroUnit: { ...typography.heading, color: colors.text },
  heroSub: { ...typography.small, color: colors.textMuted },
  slots: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  heroNext: { ...typography.small, color: colors.textMuted },
  king: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 14 },
  kingFace: { width: 62, height: 68, justifyContent: 'flex-end', alignItems: 'center' },
  ring: { borderWidth: 3, borderRadius: 32, padding: 2 },
  crownOn: { position: 'absolute', top: -3, alignSelf: 'center' },
  kingWords: { flex: 1, gap: 2 },
  kingName: { ...font('600'), fontSize: 17, letterSpacing: -0.2, color: colors.text },
  kingSub: { ...typography.small, color: colors.textMuted },
  kingCount: { alignItems: 'flex-end' },
  kingNumber: { ...font('600'), fontSize: 30, lineHeight: 34, letterSpacing: -0.6, color: colors.text, fontVariant: ['tabular-nums'] },
  kingUnit: { ...typography.small, color: colors.textMuted, marginTop: -2 },
  kingFoot: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingVertical: 12 },
  kingFootText: { ...typography.small, lineHeight: 18, color: colors.textMuted },
  badges: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 },
  badge: { alignItems: 'center', gap: 6, width: 76 },
  badgeName: { ...typography.smallStrong, color: colors.text },
  badgeNameLocked: { color: colors.textMuted },
  badgeSub: { ...typography.small, fontSize: 12, color: colors.textMuted, marginTop: -4, fontVariant: ['tabular-nums'] },
  badgeSubEarned: { color: colors.brand },
  twoUp: { flexDirection: 'row', gap: spacing.md },
  half: { flex: 1 },
  tileInner: { gap: 8 },
  tileLabel: { ...typography.smallStrong, color: colors.textMuted },
  tileNumber: { ...font('500'), fontSize: 30, lineHeight: 32, letterSpacing: -0.8, color: colors.text, fontVariant: ['tabular-nums'] },
  tileSub: { ...typography.small, fontSize: 12, lineHeight: 16, color: colors.textMuted },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 33 },
  cardName: { ...typography.bodyStrong, color: colors.text, flex: 1 },
  // The collection (round 2).
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP },
  card: { ...lift, borderRadius: corner(18), backgroundColor: colors.surface, overflow: 'hidden' },
  cardLocked: { backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed', boxShadow: 'none', elevation: 0 },
  cardMap: { overflow: 'hidden', backgroundColor: colors.surfaceAlt },
  cardMarkWrap: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  cardMark: { width: 34, height: 34, borderRadius: corner(10), backgroundColor: colors.brand, borderWidth: 3, borderColor: colors.bg, alignItems: 'center', justifyContent: 'center', boxShadow: '0px 4px 10px rgba(0, 0, 0, 0.25)' },
  cardMarkLocked: { width: 34, height: 34, borderRadius: corner(10), backgroundColor: colors.bg, borderWidth: 1.5, borderColor: colors.borderStrong, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  cardNo: { position: 'absolute', top: 8, right: 8, paddingHorizontal: 7, height: 20, borderRadius: 10, backgroundColor: colors.bg, justifyContent: 'center' },
  cardNoText: { ...font('700'), fontSize: 11, color: colors.text, fontVariant: ['tabular-nums'] },
  cardFlag: { position: 'absolute', top: 8, left: 8, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, height: 20, borderRadius: 10, backgroundColor: colors.bg },
  cardFlagText: { ...font('700'), fontSize: 11, color: colors.text },
  cardFoot: { position: 'absolute', bottom: 8, left: 8, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 7, height: 20, borderRadius: 10, backgroundColor: colors.bg },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.open },
  cardFlagNew: { backgroundColor: colors.brand },
  cardFlagNewText: { ...font('700'), fontSize: 11, color: colors.brandInk },
  cardWords: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 12, gap: 4 },
  courtTitle: { ...font('600'), fontSize: 15, lineHeight: 19, letterSpacing: -0.2, color: colors.text },
  cardSub: { ...typography.small, fontSize: 12, color: colors.textMuted },
  haveRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  haveFaces: { flexDirection: 'row' },
  haveFace: { borderRadius: 11, borderWidth: 1.5, borderColor: colors.bgElevated },
  haveStrong: { ...font('600'), color: colors.text },
  fine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: -spacing.md },
  fineText: { ...typography.small, color: colors.textFaint, flexShrink: 1 },
});
