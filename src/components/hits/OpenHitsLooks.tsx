import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { SwipePressable } from '@/components/SwipePressable';
import { clockWords } from '@/features/players/openToHit';
import { playHereParams } from '@/features/players/courtLink';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { chipCorner, corner } from '@/theme/look';
import { PRESS_DIM } from '@/theme/press';
import { TextScale, colors, spacing, typography } from '@/theme';
import type { OpenHitsLook } from './openHitsLook';

type Court = { id?: string; name: string; lat: number; lng: number };
type Time = { day: number; hour: number; label: string; a11y: string };

/** The hit form, with this court (when there is one) and this time (look C) already picked. */
function postHit(court: Court | null, time?: Time) {
  if (!court && !time) { router.push('/hit-request/new'); return; }
  router.push({ pathname: '/hit-request/new', params: { ...(court ? playHereParams(court) : {}), ...(time ? { day: String(time.day), hour: String(time.hour) } : {}) } });
}

const clock = (hour: number) => { const d = new Date(); d.setHours(hour, 0, 0, 0); return clockWords(d); };

/**
 * Look C's two times, the ones people play at: this evening (6pm, or the
 * next hour once 6 has gone, until 8), then the next day at 9am on a
 * weekend or 6pm after work. Past 8pm, tomorrow and the day after. Only
 * hours the hit form offers (6am to 9pm, and today only those still ahead).
 */
export function quickTimes(now = new Date()): Time[] {
  const out: Time[] = [];
  const tonight = Math.max(18, now.getHours() + 1);
  if (tonight <= 20) out.push({ day: 0, hour: tonight, label: `Today ${clock(tonight)}`, a11y: `today at ${clock(tonight)}` });
  for (let day = 1; out.length < 2; day += 1) {
    const d = new Date(now); d.setDate(d.getDate() + day);
    const hour = d.getDay() === 0 || d.getDay() === 6 ? 9 : 18;
    const name = day === 1 ? 'Tomorrow' : d.toLocaleDateString([], { weekday: 'short' });
    out.push({ day, hour, label: `${name} ${clock(hour)}`, a11y: `${day === 1 ? 'tomorrow' : d.toLocaleDateString([], { weekday: 'long' })} at ${clock(hour)}` });
  }
  return out;
}

/**
 * The top of Open hits in looks A, B and C (openHitsLook.ts): its title, the
 * one line when nothing is open, and the way to post one, in fewer words
 * than today's field and sentence. With nothing open and a public court
 * close by, posting starts at that court, as today.
 */
export function OpenHitsTop({ look, count, forFriends, court }: { look: Exclude<OpenHitsLook, 'now'>; count: number; forFriends: boolean; court: Court | null }) {
  const styles = useThemedStyles(styleDefinitions);
  const a11y = court ? `Post a hit at ${court.name}` : 'Post a hit';
  const none = forFriends ? 'No open hits from friends yet' : 'No open hits nearby';
  const title = <Text maxFontSizeMultiplier={TextScale.CARD} accessibilityRole="header" style={styles.title} numberOfLines={1}>Open hits</Text>;
  const counted = count ? <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.count}>{count}</Text> : null;

  if (look === 'A') {
    return (
      <View style={styles.head}>
        <View style={styles.headRow}>
          <View style={styles.headTitle}>{title}{counted}</View>
          <SwipePressable accessibilityRole="button" accessibilityLabel={a11y} hitSlop={10} onPress={() => postHit(court)} style={({ pressed }) => [styles.link, pressed && styles.pressed]}>
            <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.linkText}>Post a hit</Text>
            <Ionicons name="chevron-forward" size={15} color={colors.brand} />
          </SwipePressable>
        </View>
        {count ? null : <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.sub}>{none}</Text>}
      </View>
    );
  }

  if (look === 'B') {
    return (
      <>
        <View style={[styles.head, styles.headTitle]}>
          {title}
          <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.titleTail} numberOfLines={1}>{count ? `· ${count}` : forFriends ? '· none from friends' : '· none nearby'}</Text>
        </View>
        <SwipePressable accessibilityRole="button" accessibilityLabel={a11y} onPress={() => postHit(court)} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
          <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.rowText} numberOfLines={1}>{court ? `Post a time at ${court.name}` : 'Post a time and place'}</Text>
          <Ionicons name="chevron-forward" size={17} color={colors.textFaint} />
        </SwipePressable>
      </>
    );
  }

  const times = quickTimes();
  return (
    <>
      <View style={styles.head}>
        <View style={styles.headTitle}>{title}{counted}</View>
        {count ? null : <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.sub}>{none}</Text>}
      </View>
      <View style={styles.times}>
        <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.timesLead}>Post a hit</Text>
        {times.map((t) => (
          <SwipePressable key={t.label} accessibilityRole="button" accessibilityLabel={`${a11y} ${t.a11y}`} onPress={() => postHit(court, t)} style={({ pressed }) => [styles.time, pressed && styles.pressed]}>
            <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.timeText} numberOfLines={1}>{t.label}</Text>
          </SwipePressable>
        ))}
        <SwipePressable accessibilityRole="button" accessibilityLabel={`${a11y} at another time`} hitSlop={8} onPress={() => postHit(court)} style={({ pressed }) => [styles.other, pressed && styles.pressed]}>
          <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.linkText}>Other</Text>
          <Ionicons name="chevron-forward" size={15} color={colors.brand} />
        </SwipePressable>
      </View>
    </>
  );
}

const styleDefinitions = StyleSheet.create({
  // The same title and muted line as Find Players' other sections ("Courts near you", "Near you").
  head: { gap: 3, paddingTop: spacing.sm },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headTitle: { flexShrink: 1, flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  title: { ...typography.title, color: colors.text, flexShrink: 1 },
  count: { ...typography.bodyStrong, color: colors.textFaint, fontVariant: ['tabular-nums'] },
  titleTail: { ...typography.body, color: colors.textFaint, flexShrink: 1 },
  sub: { ...typography.small, color: colors.textMuted },
  pressed: { opacity: PRESS_DIM },
  // A: the action on the title's right, the court page's "New hit ›".
  link: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: 2 },
  linkText: { ...typography.smallStrong, fontSize: 14, color: colors.brand },
  // B: one plain row, a hit card's corner and a hairline, no icon and no button.
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 50, paddingHorizontal: spacing.lg,
    borderRadius: corner(16), borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong, backgroundColor: colors.surface,
  },
  rowText: { ...typography.body, fontSize: 16, color: colors.text, flex: 1 },
  // C: the times as outlined chips after a muted lead, then Other.
  times: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: spacing.sm, rowGap: spacing.sm },
  timesLead: { ...typography.small, color: colors.textMuted, marginRight: 2 },
  time: { height: 34, justifyContent: 'center', paddingHorizontal: 13, borderRadius: chipCorner, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  timeText: { ...typography.smallStrong, fontSize: 14, color: colors.text },
  other: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: 6, paddingLeft: 2 },
});
