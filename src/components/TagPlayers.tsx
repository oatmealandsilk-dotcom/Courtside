import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Avatar, Field } from '@/components/ui';
import { FormRow } from '@/components/FormRow';
import { useRevealOnFocus } from '@/lib/keyboardScroll';
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
 *
 * `variant="row"` is the composer's look: one line of its settings list
 * ("Tag players   Maya, Jonah ›") that opens into the search in place, with
 * the tagged people as chips only while it is open.
 *
 * With session stats on the post, the players tagged in that session
 * (`fromSession`) are listed apart, "From your session · Waiting" or
 * "Accepted", and are left out of the search: they are asked to accept
 * there, and their name goes on the post only once they do, so they are
 * never tagged straight onto it here instead.
 */
export function TagPlayers({ tagged, onChange, variant = 'button', line = false, fromSession = [] }: {
  tagged: string[];
  onChange: (ids: string[]) => void;
  variant?: 'button' | 'row';
  /** As a row: the thin line above it (any row but the first). */
  line?: boolean;
  /** The session's tagged players and whether each has accepted (migration 62). */
  fromSession?: { id: string; accepted: boolean }[];
}) {
  const styles = useThemedStyles(styleDefinitions);
  const { users } = useApp();
  const candidates = useMentionCandidates();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const fromIds = new Set(fromSession.map((f) => f.id));
  // Tagged people stay in the list, checked, so a second tap can untag them.
  const matches = open ? candidates(query, 8 + fromIds.size).filter(({ user }) => !fromIds.has(user.id)).slice(0, 8) : [];
  const close = () => { setOpen(false); setQuery(''); };
  const tag = (id: string) => {
    haptics.tap();
    onChange(tagged.includes(id) ? tagged.filter((t) => t !== id) : [...tagged, id]);
  };
  const search = useRef<TextInput>(null);
  const block = useRef<View>(null);
  const reveal = useRevealOnFocus();
  // As a row, the search takes the keyboard as it opens, and once names are
  // listed the whole block (box, chips, names) is lifted above the keys.
  useEffect(() => {
    if (!open || variant !== 'row') return undefined;
    const t = setTimeout(() => search.current?.focus(), 60);
    return () => clearTimeout(t);
  }, [open, variant]);
  useEffect(() => {
    if (open && variant === 'row' && matches.length) reveal(block.current);
  }, [open, variant, matches.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const chips = tagged.length ? (
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
  ) : null;
  const results = matches.map(({ user, reason }) => {
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
  });
  const empty = !matches.length ? <Text style={styles.tagHandle}>{query ? 'No one by that name.' : 'Start typing a name.'}</Text> : null;
  // The session's players: shown, not tappable; they answer their own tag.
  const sessionPeople = fromSession.length ? (
    <View style={styles.fromSession}>
      <Text style={styles.fromTitle}>From your session · asked to accept</Text>
      {fromSession.map(({ id, accepted }) => {
        const who = users.find((u) => u.id === id);
        if (!who) return null;
        return (
          <View key={id} style={styles.fromRow} accessible accessibilityLabel={`${who.name}, from your session. ${accepted ? 'Accepted' : 'Waiting'}`}>
            <Avatar name={who.name} seed={who.avatarSeed} uri={who.avatarUrl} size={28} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.tagName} numberOfLines={1}>{who.name}</Text>
              <Text style={styles.tagHandle} numberOfLines={1}>@{who.handle} · {accepted ? 'Accepted' : 'Waiting'}</Text>
            </View>
            <Ionicons name={accepted ? 'checkmark-circle' : 'time-outline'} size={16} color={accepted ? colors.brand : colors.textFaint} />
          </View>
        );
      })}
    </View>
  ) : null;

  if (variant === 'row') {
    if (!open) {
      // First names: "Maya", "Maya, Jonah", then "Maya, Jonah +1".
      const names = tagged.map((id) => users.find((u) => u.id === id)?.name.split(' ')[0]).filter((n): n is string => !!n);
      const summary = names.length > 2 ? `${names.slice(0, 2).join(', ')} +${names.length - 2}` : names.join(', ');
      return <FormRow line={line} icon="pricetag-outline" label="Tag players" value={summary || undefined} chevron onPress={() => { setOpen(true); setQuery(''); }} />;
    }
    return (
      <View ref={block} style={[styles.rowBlock, line && styles.rowLine]}>
        <View style={styles.searchRow}>
          <View style={{ flex: 1 }}><Field inputRef={search} value={query} onChangeText={setQuery} placeholder="Search players" accessibilityLabel="Search for players to tag" autoCapitalize="none" autoCorrect={false} /></View>
          <Pressable accessibilityRole="button" accessibilityLabel="Done tagging" onPress={close} hitSlop={8}>
            <Text style={styles.cancel}>Done</Text>
          </Pressable>
        </View>
        {chips}
        {sessionPeople}
        <View style={styles.resultsBox}>
          <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" contentContainerStyle={styles.resultsInner}>
            {results}
            {empty}
          </ScrollView>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.tagBlock}>
      {/* Closed: one box button. Open: the search box, with Done beside it. */}
      {open ? (
        <View style={styles.searchRow}>
          <View style={{ flex: 1 }}><Field value={query} onChangeText={setQuery} placeholder="Search" /></View>
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
      {chips}
      {open ? sessionPeople : null}
      {open ? (
        <View style={styles.tagSearch}>
          {results}
          {empty}
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
  // The open row: the search, the chips, then at most 240 of names that scroll.
  rowBlock: { gap: spacing.sm, paddingVertical: spacing.sm },
  rowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  resultsBox: { maxHeight: 240, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: 'hidden' },
  resultsInner: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  fromSession: { gap: 2 },
  fromTitle: { ...typography.small, color: colors.textFaint, paddingBottom: 2 },
  fromRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 4 },
});
