import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { goBack } from '@/lib/goBack';

import { Avatar, Button, EmptyState, Screen, SegmentedControl } from '@/components/ui';
import type { AdminReport } from '@/data/remote';
import { relativeTime } from '@/lib/format';
import { useApp } from '@/store/AppContext';
import { colors, radius, spacing, typography } from '@/theme';

type Tab = 'open' | 'done';
type Decision = 'remove' | 'restore' | 'suspend' | 'unsuspend' | 'dismiss';

/**
 * Reports, for admins only (the database will not hand them to anyone else).
 * Each one shows what was reported and by whom; from it an admin can remove
 * the post or hit (hidden from everyone, but kept), suspend the account (no
 * posting, commenting, replying or messaging), or dismiss the report. Both
 * removing and suspending can be undone from the same card.
 */
export default function AdminReports() {
  const styles = useThemedStyles(styleDefinitions);
  const { users, currentUser, actions } = useApp();
  const [tab, setTab] = useState<Tab>('open');
  const [reports, setReports] = useState<AdminReport[] | null>(null);
  const [items, setItems] = useState<Record<string, { body: string; picture?: string; removed: boolean } | null>>({});
  // Suspensions decided here, before the next app open brings them in.
  const [suspended, setSuspended] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const list = await actions.loadReports();
    setReports(list);
    const wanted = list.filter((r) => r.kind !== 'profile' && r.targetId);
    const got = await Promise.all(wanted.map((r) => actions.loadReportedItem(r.kind as 'post' | 'hit', r.targetId!)));
    setItems(Object.fromEntries(wanted.map((r, i) => [r.id, got[i]])));
  }, [actions]);
  useEffect(() => { void load(); }, [load]);

  const decide = async (report: AdminReport, decision: Decision) => {
    setBusy(`${report.id}:${decision}`);
    const ok = await actions.decideReport(report.id, decision);
    if (ok && report.userId && (decision === 'suspend' || decision === 'unsuspend')) setSuspended((s) => ({ ...s, [report.userId!]: decision === 'suspend' }));
    await load();
    setBusy(null);
  };

  if (!currentUser?.isAdmin) {
    return (
      <Screen title="Reports" compactTitle onBack={() => goBack()}>
        <EmptyState icon="lock-closed-outline" title="Only admins can see reports" body="An admin is set from Supabase." />
      </Screen>
    );
  }

  const open = (reports ?? []).filter((r) => r.status === 'open');
  const done = (reports ?? []).filter((r) => r.status !== 'open');
  const shown = tab === 'open' ? open : done;

  return (
    <Screen title="Reports" compactTitle onBack={() => goBack()}>
      <View style={styles.tabs}>
        <SegmentedControl<Tab>
          value={tab}
          onChange={setTab}
          segments={[{ value: 'open', label: `Open${open.length ? ` (${open.length})` : ''}` }, { value: 'done', label: 'Done' }]}
        />
      </View>
      {reports === null ? (
        <Text style={styles.muted}>Loading reports…</Text>
      ) : shown.length === 0 ? (
        <EmptyState icon="flag-outline" title={tab === 'open' ? 'Nothing to review' : 'No decisions yet'} body={tab === 'open' ? 'New reports show up here, and you get a notification for each one.' : 'Reports you act on move here.'} />
      ) : (
        shown.map((report) => {
          const reporter = users.find((u) => u.id === report.reporterId);
          const person = report.userId ? users.find((u) => u.id === report.userId) : undefined;
          const item = items[report.id];
          const isSuspended = report.userId ? suspended[report.userId] ?? !!person?.suspended : false;
          const openTarget = () => {
            if (report.kind === 'post' && report.targetId) router.push(`/post/${report.targetId}`);
            else if (report.kind === 'hit' && report.targetId) router.push(`/hits/${report.targetId}`);
            else if (report.userId) router.push(`/user/${report.userId}`);
          };
          const waiting = (d: Decision) => busy === `${report.id}:${d}`;
          return (
            <View key={report.id} style={styles.card}>
              <View style={styles.head}>
                <View style={styles.kind}><Text style={styles.kindText}>{report.kind === 'post' ? 'Post' : report.kind === 'hit' ? 'Hit' : 'Profile'}</Text></View>
                <Text style={styles.muted}>{relativeTime(report.createdAt)}</Text>
                {report.status !== 'open' ? <Text style={styles.status}>{report.status === 'removed' ? 'Removed' : report.status === 'suspended' ? 'Suspended' : 'Dismissed'}</Text> : null}
              </View>

              <Pressable accessibilityRole="link" accessibilityLabel="Open what was reported" onPress={openTarget} style={styles.target}>
                {report.kind === 'profile' || !item ? (
                  <>
                    <Avatar name={person?.name ?? '?'} seed={person?.avatarSeed ?? report.userId ?? 'x'} uri={person?.avatarUrl} size={44} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.name} numberOfLines={1}>{person?.name ?? 'Unknown account'}</Text>
                      <Text style={styles.muted} numberOfLines={1}>{person ? `@${person.handle}` : report.kind === 'profile' ? '' : 'This post is gone'}</Text>
                    </View>
                  </>
                ) : (
                  <>
                    {item.picture ? <Image source={{ uri: item.picture }} style={styles.thumb} accessibilityIgnoresInvertColors /> : <View style={[styles.thumb, styles.noThumb]}><Ionicons name="document-text-outline" size={18} color={colors.textMuted} /></View>}
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={styles.body} numberOfLines={2}>{item.body || 'No caption'}</Text>
                      <Text style={styles.muted} numberOfLines={1}>{person ? `by @${person.handle}` : ''}{item.removed ? ' · Removed' : ''}</Text>
                    </View>
                  </>
                )}
                <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
              </Pressable>

              <Text style={styles.muted}>Reported by {reporter ? `@${reporter.handle}` : 'someone'}{report.reason ? ` · ${report.reason}` : ''}</Text>

              <View style={styles.actions}>
                {report.kind !== 'profile' && item ? (
                  item.removed
                    ? <Button label="Restore" variant="secondary" loading={waiting('restore')} onPress={() => void decide(report, 'restore')} />
                    : <Button label="Remove" variant="danger" loading={waiting('remove')} onPress={() => void decide(report, 'remove')} />
                ) : null}
                {report.userId ? (
                  isSuspended
                    ? <Button label="Unsuspend" variant="secondary" loading={waiting('unsuspend')} onPress={() => void decide(report, 'unsuspend')} />
                    : <Button label="Suspend" variant="secondary" loading={waiting('suspend')} onPress={() => void decide(report, 'suspend')} />
                ) : null}
                {report.status === 'open' ? <Button label="Dismiss" variant="ghost" loading={waiting('dismiss')} onPress={() => void decide(report, 'dismiss')} /> : null}
              </View>
            </View>
          );
        })
      )}
    </Screen>
  );
}

const styleDefinitions = StyleSheet.create({
  tabs: { paddingBottom: spacing.md },
  card: { gap: spacing.sm, padding: spacing.md, marginBottom: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  kind: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: colors.brandDim },
  kindText: { ...typography.caption, color: colors.brand },
  status: { ...typography.smallStrong, color: colors.textMuted, marginLeft: 'auto' },
  target: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  thumb: { width: 44, height: 55, borderRadius: radius.sm, backgroundColor: colors.border },
  noThumb: { alignItems: 'center', justifyContent: 'center' },
  name: { ...typography.bodyStrong, color: colors.text },
  body: { ...typography.body, color: colors.text },
  muted: { ...typography.small, color: colors.textMuted },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
