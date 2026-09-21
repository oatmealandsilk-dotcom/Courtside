import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { goBack } from '@/lib/goBack';

import { Button, EmptyState, Screen, SegmentedControl } from '@/components/ui';
import type { SiteFeedback, WaitlistEntry } from '@/data/remote';
import { relativeTime } from '@/lib/format';
import { useApp } from '@/store/AppContext';
import { colors, radius, spacing, typography } from '@/theme';

type Tab = 'list' | 'feedback';

/**
 * The waitlist page's two inboxes, for admins only (the database hands them
 * to nobody else): who asked for early access, where they came from, and the
 * notes left in the feedback box. "Copy all emails" is how the list gets into
 * an email tool until the page sends signups there itself.
 */
export default function AdminWaitlist() {
  const styles = useThemedStyles(styleDefinitions);
  const { currentUser, actions } = useApp();
  const [tab, setTab] = useState<Tab>('list');
  const [entries, setEntries] = useState<WaitlistEntry[] | null>(null);
  const [notes, setNotes] = useState<SiteFeedback[] | null>(null);
  const [copied, setCopied] = useState('');
  const [removing, setRemoving] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [list, feedback] = await Promise.all([actions.loadWaitlist(), actions.loadSiteFeedback()]);
    setEntries(list);
    setNotes(feedback);
  }, [actions]);
  useEffect(() => { void load(); }, [load]);

  // Which posts are working: signups counted by the ?ref= on the link they came from.
  const sources = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of entries ?? []) counts.set(e.source ?? 'direct', (counts.get(e.source ?? 'direct') ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [entries]);

  // Someone asked to come off the list (the privacy policy promises it), or a test row.
  const remove = async (table: 'waitlist' | 'site_feedback', id: string) => {
    setRemoving(id);
    const ok = await actions.removeFromWaitlistPage(table, id);
    setRemoving(null);
    if (!ok) return;
    if (table === 'waitlist') setEntries((list) => list?.filter((e) => e.id !== id) ?? null);
    else setNotes((list) => list?.filter((n) => n.id !== id) ?? null);
  };

  const copyAll = async () => {
    if (!entries?.length) return;
    await Clipboard.setStringAsync(entries.map((e) => e.email).join('\n'));
    setCopied(`Copied ${entries.length} email${entries.length === 1 ? '' : 's'}.`);
  };

  if (!currentUser?.isAdmin) {
    return (
      <Screen title="Waitlist" compactTitle onBack={() => goBack()}>
        <EmptyState icon="lock-closed-outline" title="Only admins can see the waitlist" body="An admin is set from Supabase." />
      </Screen>
    );
  }

  return (
    <Screen title="Waitlist" compactTitle onBack={() => goBack()}>
      <View style={styles.tabs}>
        <SegmentedControl<Tab>
          value={tab}
          onChange={setTab}
          segments={[
            { value: 'list', label: `Waitlist${entries?.length ? ` (${entries.length})` : ''}` },
            { value: 'feedback', label: `Feedback${notes?.length ? ` (${notes.length})` : ''}` },
          ]}
        />
      </View>

      {tab === 'list' ? (
        entries === null ? (
          <Text style={styles.muted}>Loading the waitlist…</Text>
        ) : entries.length === 0 ? (
          <EmptyState icon="mail-outline" title="Nobody on the list yet" body="Signups from the waitlist page show up here, newest first." />
        ) : (
          <>
            <View style={styles.summary}>
              <Text style={styles.summaryText}>
                {sources.map(([name, n]) => `${n} from ${name}`).join(' · ')}
              </Text>
              <Button label="Copy all emails" variant="secondary" onPress={() => void copyAll()} />
              {copied ? <Text style={styles.muted} accessibilityLiveRegion="polite">{copied}</Text> : null}
            </View>
            <View style={styles.list}>
              {entries.map((entry, index) => (
                <View key={entry.id} style={[styles.row, index > 0 && styles.rowDivider]}>
                  <View style={styles.rowWords}>
                    <Text style={styles.email} numberOfLines={1} selectable>{entry.email}</Text>
                    <Text style={styles.muted} numberOfLines={1}>
                      {[entry.name, entry.source ? `from ${entry.source}` : null, relativeTime(entry.createdAt)].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${entry.email} from the waitlist`} disabled={removing === entry.id} onPress={() => void remove('waitlist', entry.id)} hitSlop={8}>
                    <Text style={styles.remove}>{removing === entry.id ? 'Removing…' : 'Remove'}</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          </>
        )
      ) : notes === null ? (
        <Text style={styles.muted}>Loading feedback…</Text>
      ) : notes.length === 0 ? (
        <EmptyState icon="chatbox-ellipses-outline" title="No feedback yet" body="Notes from the waitlist page's feedback box show up here." />
      ) : (
        <View style={styles.list}>
          {notes.map((note, index) => (
            <View key={note.id} style={[styles.row, index > 0 && styles.rowDivider]}>
              <View style={styles.rowWords}>
                <Text style={styles.body} selectable>{note.message}</Text>
                <Text style={styles.muted} numberOfLines={1} selectable>
                  {[note.email ?? 'No email left', relativeTime(note.createdAt)].join(' · ')}
                </Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Remove this feedback note" disabled={removing === note.id} onPress={() => void remove('site_feedback', note.id)} hitSlop={8}>
                <Text style={styles.remove}>{removing === note.id ? 'Removing…' : 'Remove'}</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styleDefinitions = StyleSheet.create({
  tabs: { paddingBottom: spacing.md },
  summary: { gap: spacing.sm, paddingBottom: spacing.lg, alignItems: 'flex-start' },
  summaryText: { ...typography.smallStrong, color: colors.textMuted },
  list: { borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
  rowWords: { flex: 1, gap: 3, minWidth: 0 },
  remove: { ...typography.smallStrong, color: colors.danger },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  email: { ...typography.bodyStrong, color: colors.text },
  body: { ...typography.body, color: colors.text },
  muted: { ...typography.small, color: colors.textMuted },
});
