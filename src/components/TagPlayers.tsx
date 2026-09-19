import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Avatar, Field } from '@/components/ui';
import { useMentionCandidates } from '@/features/mentions/useMentionCandidates';
import { useApp } from '@/store/AppContext';
import * as haptics from '@/lib/haptics';
import { colors, radius, spacing, typography } from '@/theme';

/**
 * "Tag players": the people in the clip, as chips. Tap the button to search —
 * people you follow first, then followers. A tap on a name checks it and
 * tags them; the list stays open so you can tag several in a row, and a
 * second tap unchecks. Done closes the search. × on a chip takes one off.
 * Each tagged player is told, and the post shows up on their Tagged tab.
 */
export function TagPlayers({ tagged, onChange }: { tagged: string[]; onChange: (ids: string[]) => void }) {
  const styles = useThemedStyles(styleDefinitions);
  const { users } = useApp();
  const candidates = useMentionCandidates();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  // Tagged people stay in the list, checked, so a second tap can untag them.
  const matches = open ? candidates(query, 8) : [];
  const close = () => { setOpen(false); setQuery(''); };
  const tag = (id: string) => {
    haptics.tap();
    onChange(tagged.includes(id) ? tagged.filter((t) => t !== id) : [...tagged, id]);
  };
  return (
    <View style={styles.tagBlock}>
      {/* Closed: one box button. Open: the search box, with Done beside it. */}
      {open ? (
        <View style={styles.searchRow}>
          <View style={{ flex: 1 }}><Field value={query} onChangeText={setQuery} placeholder="Search by name or @handle" /></View>
          <Pressable accessibilityRole="button" accessibilityLabel="Done tagging" onPress={close} hitSlop={8}>
            <Text style={styles.cancel}>Done</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable accessibilityRole="button" accessibilityLabel="Tag players" onPress={() => { setOpen(true); setQuery(''); }} style={styles.button}>
          <Ionicons name="pricetag-outline" size={18} color={colors.brand} />
          <Text style={styles.buttonText}>Tag players</Text>
          {tagged.length ? <Text style={styles.count}>{tagged.length}</Text> : null}
        </Pressable>
      )}
      {tagged.length ? (
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
        </View>
      ) : null}
      {open ? (
        <View style={styles.tagSearch}>
          {matches.map(({ user, reason }) => {
            const on = tagged.includes(user.id);
            return (
              <Pressable key={user.id} accessibilityRole="button" accessibilityState={{ checked: on }} accessibilityLabel={on ? `Untag ${user.name}` : `Tag ${user.name}`} onPress={() => tag(user.id)} style={styles.tagResult}>
                <Avatar name={user.name} seed={user.avatarSeed} uri={user.avatarUrl} size={32} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.tagName}>{user.name}</Text>
                  <Text style={styles.tagHandle}>@{user.handle}{reason ? ` · ${reason}` : ''}</Text>
                </View>
                <View style={[styles.check, on && styles.checkOn]}>{on ? <Ionicons name="checkmark" size={15} color={colors.brandInk} /> : null}</View>
              </Pressable>
            );
          })}
          {!matches.length ? <Text style={styles.tagHandle}>{query ? 'No one by that name.' : 'Start typing a name.'}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  button: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: spacing.sm, paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.brand, backgroundColor: colors.brandDim },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cancel: { ...typography.bodyStrong, color: colors.brand, paddingHorizontal: 4 },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  buttonText: { ...typography.smallStrong, color: colors.brand },
  count: { ...typography.smallStrong, color: colors.brandInk, backgroundColor: colors.brand, minWidth: 20, textAlign: 'center', borderRadius: 10, paddingHorizontal: 6, overflow: 'hidden' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tagBlock: { gap: spacing.sm },
  tagChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 4, paddingRight: 10, paddingVertical: 4, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  tagChipText: { ...typography.smallStrong, color: colors.text },
  tagSearch: { gap: spacing.xs, padding: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  tagResult: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 8 },
  tagName: { ...typography.smallStrong, color: colors.text },
  tagHandle: { ...typography.small, color: colors.textMuted },
});
