import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { CrownGlyph } from '@/components/place/CrownGlyph';
import { Box, Row, SectionHead } from '@/components/tennis/ProfileParts';
import { Avatar, Screen } from '@/components/ui';
import { Bar, BadgeDisc, CardSwatch, CourtTile, WeekDots } from '@/features/courtUnlocks/DesignParts';
import { BADGES, BADGE_EARNED, KING, MY_COURTS, NEXT_CARD, TO_UNLOCK, WEEKS, WEEKS_IN_A_ROW } from '@/features/courtUnlocks/designDemo';
import { goBack } from '@/lib/goBack';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, spacing, typography, withAlpha } from '@/theme';
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

        {/* The courts, newest first. */}
        <View>
          <SectionHead title="Courts" link={{ label: 'Map', accessibilityLabel: 'See your courts on the map', onPress: () => router.push('/map') }} />
          <Box>
            {MY_COURTS.map((c, i) => (
              <Row
                key={c.name}
                first={i === 0}
                lead={(
                  <View>
                    <CourtTile size={36} unlocked />
                    {c.crown ? <View style={styles.tileCrown}><CrownGlyph size={13} color={colors.sun} /></View> : null}
                  </View>
                )}
                title={(
                  <View style={styles.nameRow}>
                    <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.courtName} numberOfLines={1}>{c.name}</Text>
                    {c.isNew ? <View style={styles.newTag}><Text maxFontSizeMultiplier={TextScale.CARD} style={styles.newText}>New</Text></View> : null}
                  </View>
                )}
                sub={`${c.town ? `${c.town} · ` : ''}${c.since === 'Today' ? 'Unlocked today' : `Since ${c.since}`} · ${c.sessions} ${c.sessions === 1 ? 'session' : 'sessions'}`}
                chevron
                onPress={() => {}}
              />
            ))}
          </Box>
        </View>

        {/* Public courts nearby, still to unlock. */}
        <View>
          <SectionHead title="Near you to unlock" line="Log a hit or a session at one to add it." />
          <Box>
            {TO_UNLOCK.map((c, i) => (
              <Row key={c.name} first={i === 0} lead={<CourtTile size={36} unlocked={false} />} title={c.name} sub={`${c.miles} · ${c.courts} courts`} chevron onPress={() => {}} />
            ))}
          </Box>
        </View>

        <View style={styles.fine}>
          <Ionicons name="people-outline" size={14} color={colors.textFaint} />
          <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.fineText}>Friends see your courts and crowns, never where you are now.</Text>
        </View>
      </View>
    </Screen>
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
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  courtName: { ...font('500'), fontSize: 16, color: colors.text, flexShrink: 1 },
  newTag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: corner(6), backgroundColor: colors.brandDim },
  newText: { ...typography.caption, color: colors.brand },
  tileCrown: { position: 'absolute', top: -8, right: -8, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  fine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: -spacing.md },
  fineText: { ...typography.small, color: colors.textFaint, flexShrink: 1 },
});
