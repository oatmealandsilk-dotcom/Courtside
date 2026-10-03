import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Button, Field, Screen, SegmentedControl } from '@/components/ui';
import { goBack } from '@/lib/goBack';
import { useApp } from '@/store/AppContext';
import { MAX_GROUPS } from '@/store/feedGroups';
import { colors, radius, spacing, typography } from '@/theme';
import { useThemedStyles } from '@/theme/ThemeProvider';

/*
 * Groups (migration 67): the ones you are in, the ones you asked to join,
 * and a short form to start one. Reached from the "+" at the end of the
 * Feed's top row, and from Profile.
 */

type JoinMode = 'open' | 'ask';

export default function Groups() {
  const styles = useThemedStyles(styleDefinitions);
  const { feedGroups, feedGroupsAsked, feedGroupsOn, currentUserId, actions } = useApp();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [mode, setMode] = useState<JoinMode>('open');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (currentUserId) void actions.loadFeedGroups(); }, [currentUserId]); // eslint-disable-line react-hooks/exhaustive-deps

  const full = feedGroups.length >= MAX_GROUPS;
  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const id = await actions.createFeedGroup({ name, description, ask: mode === 'ask' });
      setName(''); setDescription(''); setMode('open');
      router.push({ pathname: '/g/[id]', params: { id } });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn’t go through.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="Groups" compactTitle onBack={() => goBack()}>
      <Text style={styles.note}>
        A group has a feed of its own. What you share there, only the group sees. You can be in up to {MAX_GROUPS} groups.
      </Text>

      {feedGroupsOn === false ? (
        <Text style={styles.note}>Groups aren’t switched on yet. Check back soon.</Text>
      ) : null}

      <Text style={styles.section}>Your groups</Text>
      {feedGroups.length === 0 ? (
        <Text style={styles.empty}>You’re not in a group yet. Start one below, or open a group’s invite link.</Text>
      ) : (
        <View style={styles.list}>
          {feedGroups.map((g, i) => {
            const admin = g.members.some((m) => m.id === currentUserId && m.admin);
            return (
              <Pressable
                key={g.id}
                accessibilityRole="link"
                accessibilityLabel={`${g.name}, ${g.members.length} ${g.members.length === 1 ? 'member' : 'members'}${admin && g.requests.length ? `, ${g.requests.length} asking to join` : ''}`}
                onPress={() => router.push({ pathname: '/g/[id]', params: { id: g.id } })}
                style={({ pressed }) => [styles.row, i > 0 && styles.rowLine, pressed && styles.pressed]}
              >
                <View style={styles.tile}><Ionicons name="people" size={18} color={colors.brand} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name} numberOfLines={1}>{g.name}</Text>
                  <Text style={styles.meta}>{g.members.length} {g.members.length === 1 ? 'member' : 'members'}{admin ? ' · You’re the admin' : ''}</Text>
                </View>
                {admin && g.requests.length ? <View style={styles.badge}><Text style={styles.badgeText}>{g.requests.length} asking</Text></View> : null}
                <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
              </Pressable>
            );
          })}
        </View>
      )}

      {feedGroupsAsked.length ? (
        <>
          <Text style={styles.section}>Waiting for a yes</Text>
          <View style={styles.list}>
            {feedGroupsAsked.map((a, i) => (
              <View key={a.id} style={[styles.row, i > 0 && styles.rowLine]}>
                <View style={styles.tile}><Ionicons name="time-outline" size={18} color={colors.textMuted} /></View>
                <Text style={[styles.name, { flex: 1 }]} numberOfLines={1}>{a.name}</Text>
                <Button label="Cancel" variant="ghost" onPress={() => { void actions.leaveFeedGroup(a.id).catch(() => undefined); }} />
              </View>
            ))}
          </View>
        </>
      ) : null}

      <Text style={styles.section}>Start a group</Text>
      {full ? (
        <Text style={styles.empty}>You’re in {MAX_GROUPS} groups, the most anyone can be in. Leave one to start another.</Text>
      ) : (
        <View style={styles.form}>
          <Field label="Name" value={name} onChangeText={(t) => setName(t.slice(0, 40))} placeholder="Wakefield crew" autoCapitalize="words" />
          <Field label="About (optional)" value={description} onChangeText={(t) => setDescription(t.slice(0, 140))} placeholder="Saturday doubles, then coffee" multiline minHeight={64} />
          <View style={{ gap: spacing.xs }}>
            <Text style={styles.label}>Who can join</Text>
            <SegmentedControl<JoinMode> segments={[{ value: 'open', label: 'Anyone with the link' }, { value: 'ask', label: 'Ask to join' }]} value={mode} onChange={setMode} />
            <Text style={styles.meta}>{mode === 'open' ? 'Anyone with the invite link joins straight away.' : 'You say yes to each person first.'}</Text>
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button label="Start group" onPress={create} disabled={!name.trim() || busy || feedGroupsOn === false} loading={busy} full />
        </View>
      )}
    </Screen>
  );
}

const styleDefinitions = StyleSheet.create({
  note: { ...typography.small, color: colors.textMuted, lineHeight: 20, paddingBottom: spacing.md },
  section: { ...typography.smallStrong, color: colors.textMuted, marginTop: spacing.lg, marginBottom: spacing.sm },
  empty: { ...typography.small, color: colors.textMuted, lineHeight: 20 },
  list: { borderRadius: radius.lg, backgroundColor: colors.surface, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, paddingHorizontal: spacing.md },
  rowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  pressed: { backgroundColor: colors.surfaceAlt },
  tile: { width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.brandDim, alignItems: 'center', justifyContent: 'center' },
  name: { ...typography.bodyStrong, color: colors.text },
  meta: { ...typography.small, color: colors.textMuted },
  label: { ...typography.smallStrong, color: colors.text },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: colors.brand },
  badgeText: { ...typography.smallStrong, fontSize: 12, color: colors.brandInk },
  form: { gap: spacing.md },
  error: { ...typography.small, color: colors.danger },
});
