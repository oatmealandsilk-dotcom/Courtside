import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import Ionicons from '@expo/vector-icons/Ionicons';

import { CourtSpinner } from '@/components/CourtSpinner';
import { EmptyState, Screen, SegmentedControl } from '@/components/ui';
import { demoLinkStats } from '@/data/mock/linkStats';
import { remote, type LinkStatRow } from '@/data/remote';
import { goBack } from '@/lib/goBack';
import * as haptics from '@/lib/haptics';
import { isSupabaseConfigured } from '@/lib/supabase';
import { show as showToast } from '@/lib/toast';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, radius, spacing, typography } from '@/theme';

type Range = '7' | '30' | 'all';

/**
 * The owner's own link, always at the top with Copy (Oct 16, owner: "ok im
 * gonna start promoting on facebook and msg people, but i want a new link to
 * track the leads", then "just make one link"): fb, for posts and messages
 * alike. fbdm and fbgroup stay reserved labels (migration 161) should he
 * ever want them apart.
 */
const MY_LINKS: { label: string; title: string }[] = [
  { label: 'fb', title: 'Facebook' },
];
/**
 * The links to copy: the usual one (opens CourtSide on the web, where a guest
 * can read and sign up), and one that goes straight to the iPhone app (Oct 18,
 * owner: "so how will we tell if courtside is coming from Facebook"). Both
 * count for fb: the second counts the visit and an app tap, then opens the app.
 */
const COPY_LINKS: { label: string; title: string; path: string }[] = [
  { label: 'fb', title: 'Facebook', path: 'courtsidebase.com/?ref=fb' },
  { label: 'fb', title: 'Facebook, straight to the app', path: 'courtsidebase.com/?ref=fb&go=app' },
];

/** The five numbers for the range picked. */
const numbersOf = (row: LinkStatRow, range: Range) => (range === 'all'
  ? { visitors: row.visitorsAll, app: row.appTapsAll, web: row.webTapsAll, emails: row.emailsAll, signups: row.signupsAll }
  : { visitors: row.visitors, app: row.appTaps, web: row.webTaps, emails: row.emails, signups: row.signups });

/**
 * Admin: what each website link brought (migration 161). One row per ?ref=
 * label (our own like fb, fbdm, instagram, or a player's handle): people who
 * opened the page through it, taps on "Get the app" and "Use CourtSide on the
 * web", emails left, and (Oct 18, migration 165) new accounts made on the
 * website after coming through it. Counted by the website without knowing who anyone
 * is: a visitor is one browser, counted once a day. The demo shows made-up
 * numbers and never asks the database.
 */
export default function AdminLinks() {
  const styles = useThemedStyles(styleDefinitions);
  const { currentUser } = useApp();
  const [range, setRange] = useState<Range>('7');
  // The 7-day and 30-day answers; all-time numbers come with either.
  const [week, setWeek] = useState<LinkStatRow[] | null>(null);
  const [month, setMonth] = useState<LinkStatRow[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    if (!isSupabaseConfigured) {
      setWeek(demoLinkStats(7));
      setMonth(demoLinkStats(30));
      return;
    }
    try {
      const [w, m] = await Promise.all([remote.fetchLinkStats(7), remote.fetchLinkStats(30)]);
      setWeek(w);
      setMonth(m);
    } catch (e) {
      setWeek([]);
      setMonth([]);
      setError(e instanceof Error ? e.message : 'Could not load the links.');
    }
  }, []);
  useEffect(() => { if (currentUser?.isAdmin) void load(); }, [currentUser?.isAdmin, load]);

  const source = range === '7' ? week : month;
  // His Facebook links first, even before anyone came; then whatever brought someone, busiest first.
  const rows = useMemo(() => {
    if (!source) return null;
    const total = (r: LinkStatRow) => { const n = numbersOf(r, range); return n.visitors + n.emails + n.signups; };
    const mine = MY_LINKS.map((l) => source.find((r) => r.label === l.label)
      ?? { label: l.label, visitors: 0, appTaps: 0, webTaps: 0, emails: 0, signups: 0, visitorsAll: 0, appTapsAll: 0, webTapsAll: 0, emailsAll: 0, signupsAll: 0 });
    const rest = source
      .filter((r) => !MY_LINKS.some((l) => l.label === r.label) && total(r) + numbersOf(r, range).app + numbersOf(r, range).web > 0)
      .sort((a, b) => total(b) - total(a));
    return [...mine, ...rest];
  }, [source, range]);

  if (!currentUser?.isAdmin) {
    return <Screen title="Links" compactTitle onBack={() => goBack()}><EmptyState icon="lock-closed-outline" title="Admins only" /></Screen>;
  }

  const copy = async (path: string, title: string) => {
    try {
      await Clipboard.setStringAsync(`https://${path}`);
      haptics.tap();
      showToast({ title: `Copied the ${title} link`, icon: 'link-outline' });
    } catch {
      // A browser that refuses the clipboard: the address stays on screen to copy by hand.
      showToast({ title: 'Couldn’t copy. Hold the link to copy it.', icon: 'alert-circle-outline' });
    }
  };

  return (
    <Screen title="Links" compactTitle onBack={() => goBack()} onRefresh={load}>
      <Text style={styles.lead}>
        Who came through each link. Visitors: phones or computers that opened it (each counted once). App: tapped Get the app. Web: tapped Use CourtSide on the web. Emails: left their email. Sign-ups: made a new account on the website.
      </Text>

      <Text style={styles.section}>Your Facebook links</Text>
      <View style={styles.list}>
        {COPY_LINKS.map((l, index) => (
          <View key={l.path} style={[styles.linkRow, index > 0 && styles.rowLine]}>
            <View style={styles.words}>
              <Text style={styles.name} numberOfLines={1}>{l.title}</Text>
              <Text style={styles.meta} numberOfLines={1} selectable>{l.path}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Copy the ${l.title} link`}
              hitSlop={8}
              onPress={() => void copy(l.path, l.title)}
              style={({ pressed }) => [styles.copy, pressed && { backgroundColor: colors.border }]}
            >
              <Ionicons name="copy-outline" size={14} color={colors.text} />
              <Text style={styles.copyText}>Copy</Text>
            </Pressable>
          </View>
        ))}
      </View>

      <View style={styles.range}>
        <SegmentedControl<Range>
          value={range}
          onChange={setRange}
          accessibilityLabel="How far back"
          segments={[
            { value: '7', label: '7 days' },
            { value: '30', label: '30 days' },
            { value: 'all', label: 'All time' },
          ]}
        />
      </View>

      {error ? <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text> : null}
      {rows === null ? (
        <View style={styles.loading}><CourtSpinner size={28} /></View>
      ) : (
        <View style={styles.list}>
          <View style={[styles.statRow, styles.headRow]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Text style={[styles.headText, styles.labelCol]}>Link</Text>
            {['Visitors', 'App', 'Web', 'Emails', 'Sign-ups'].map((h) => <Text key={h} numberOfLines={1} style={[styles.headText, styles.numCol]}>{h}</Text>)}
          </View>
          {rows.map((row) => {
            const n = numbersOf(row, range);
            const mine = MY_LINKS.find((l) => l.label === row.label);
            return (
              <View
                key={row.label}
                style={[styles.statRow, styles.rowLine]}
                accessible
                accessibilityLabel={`${row.label}${mine ? `, ${mine.title}` : ''}: ${n.visitors} visitors, ${n.app} app taps, ${n.web} web taps, ${n.emails} emails, ${n.signups} sign-ups`}
              >
                <View style={styles.labelCol}>
                  <Text style={styles.name} numberOfLines={1}>{row.label}</Text>
                  {mine ? <Text style={styles.meta} numberOfLines={1}>{mine.title}</Text> : null}
                </View>
                <Text style={[styles.num, styles.numCol, n.visitors > 0 && styles.numStrong]}>{n.visitors}</Text>
                <Text style={[styles.num, styles.numCol]}>{n.app}</Text>
                <Text style={[styles.num, styles.numCol]}>{n.web}</Text>
                <Text style={[styles.num, styles.numCol]}>{n.emails}</Text>
                <Text style={[styles.num, styles.numCol, n.signups > 0 && styles.numStrong]}>{n.signups}</Text>
              </View>
            );
          })}
        </View>
      )}
      <Text style={styles.foot}>
        Counting started when this page came out (Oct 16), sign-ups on Oct 18; emails go back further. The straight-to-the-app link counts its taps under App. Nothing here says who anyone is.
      </Text>
    </Screen>
  );
}

const styleDefinitions = StyleSheet.create({
  lead: { ...typography.small, color: colors.textMuted, lineHeight: 20, paddingBottom: spacing.lg },
  section: { ...typography.caption, color: colors.textFaint, textTransform: 'uppercase', paddingBottom: spacing.sm },
  error: { ...typography.small, color: colors.danger, paddingBottom: spacing.md },
  loading: { paddingVertical: spacing.xxl, alignItems: 'center' },
  list: { borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: 'hidden' },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
  rowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  words: { flex: 1, gap: 1, minWidth: 0 },
  name: { ...typography.bodyStrong, color: colors.text },
  meta: { ...typography.small, color: colors.textMuted },
  copy: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 32, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.surfaceAlt },
  copyText: { ...typography.smallStrong, color: colors.text },
  range: { paddingTop: spacing.xl, paddingBottom: spacing.md },
  statRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.md, paddingHorizontal: spacing.md },
  headRow: { paddingVertical: spacing.sm, backgroundColor: colors.surfaceAlt },
  headText: { ...typography.caption, letterSpacing: 0, color: colors.textMuted },
  labelCol: { flex: 1, minWidth: 0 },
  numCol: { width: 46, textAlign: 'right' },
  num: { ...typography.bodyStrong, color: colors.textMuted, fontVariant: ['tabular-nums'] },
  numStrong: { color: colors.text },
  foot: { ...typography.small, color: colors.textFaint, lineHeight: 18, paddingTop: spacing.md },
});
