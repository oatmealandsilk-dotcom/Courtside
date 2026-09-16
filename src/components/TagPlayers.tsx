import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Avatar, Field } from '@/components/ui';
import { useMentionCandidates } from '@/features/mentions/useMentionCandidates';
import { useApp } from '@/store/AppContext';
import { colors, radius, spacing, typography } from '@/theme';

/**
 * "Tag players": the people in the clip, as chips. Tap + to search — people
 * you follow first, then followers — tap a name to add, × to take one off.
 * Each tagged player is told, and the post shows up on their Tagged tab.
 */
export function TagPlayers({ tagged, onChange }: { tagged: string[]; onChange: (ids: string[]) => void }) {
  const styles = useThemedStyles(styleDefinitions);
  const { users } = useApp();
  const candidates = useMentionCandidates();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const matches = open ? candidates(query, 6).filter(({ user }) => !tagged.includes(user.id)) : [];
  return (
    <View style={styles.tagBlock}>
      <View style={styles.inlineRow}>
        <Ionicons name="pricetag-outline" size={18} color={colors.textMuted} />
        <Text style={styles.inlineLabel}>Tag players</Text>
      </View>
      <View style={styles.row}>
        {tagged.map((id) => {
          const who = users.find((u) => u.id === id);
          if (!who) return null;
          return (
            <Pressable key={id} accessibilityRole="button" accessibilityLabel={`Remove ${who.name}`} onPress={() => onChange(tagged.filter((t) => t !== id))} style={styles.tagChip}>
              <Avatar name={who.name} seed={who.avatarSeed} uri={who.avatarUrl} size={22} />
              <Text style={styles.tagChipText}>{who.name}</Text>
              <Ionicons name="close" size={14} color={colors.textMuted} />
            </Pressable>
          );
        })}
        <Pressable accessibilityRole="button" accessibilityLabel={open ? 'Done tagging' : 'Add a player'} onPress={() => { setOpen((o) => !o); setQuery(''); }} style={[styles.tagChip, styles.tagAdd]}>
          <Ionicons name={open ? 'checkmark' : 'add'} size={16} color={colors.brand} />
          <Text style={[styles.tagChipText, { color: colors.brand }]}>{open ? 'Done' : tagged.length ? 'Add' : 'Add a player'}</Text>
        </Pressable>
      </View>
      {open ? (
        <View style={styles.tagSearch}>
          <Field value={query} onChangeText={setQuery} placeholder="Search by name or @handle" />
          {matches.map(({ user, reason }) => (
            <Pressable key={user.id} accessibilityRole="button" accessibilityLabel={`Tag ${user.name}`} onPress={() => { onChange([...tagged, user.id]); setQuery(''); }} style={styles.tagResult}>
              <Avatar name={user.name} seed={user.avatarSeed} uri={user.avatarUrl} size={32} />
              <View style={{ flex: 1 }}>
                <Text style={styles.tagName}>{user.name}</Text>
                <Text style={styles.tagHandle}>@{user.handle}{reason ? ` · ${reason}` : ''}</Text>
              </View>
              <Ionicons name="add-circle-outline" size={20} color={colors.brand} />
            </Pressable>
          ))}
          {!matches.length ? <Text style={styles.tagHandle}>{query ? 'No one by that name.' : 'Start typing a name.'}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  inlineRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  inlineLabel: { ...typography.small, color: colors.textMuted, flex: 1 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tagBlock: { gap: spacing.sm },
  tagChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 4, paddingRight: 10, paddingVertical: 4, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  tagAdd: { paddingLeft: 8, borderColor: colors.brand, backgroundColor: colors.brandDim },
  tagChipText: { ...typography.smallStrong, color: colors.text },
  tagSearch: { gap: spacing.xs, padding: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  tagResult: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 8 },
  tagName: { ...typography.smallStrong, color: colors.text },
  tagHandle: { ...typography.small, color: colors.textMuted },
});
