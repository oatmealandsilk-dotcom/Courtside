import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, Share as RNShare, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Avatar, Button, Field } from '@/components/ui';
import { useApp } from '@/store/AppContext';
import { colors, radius, spacing, typography } from '@/theme';

/**
 * Instagram-style send sheet. Pick people, add a note, send — the item lands
 * in each DM thread. "Share outside CourtSide" falls back to the OS sheet.
 */
export default function ShareSheet() {
  const params = useLocalSearchParams<{ kind?: string; id?: string }>();
  const kind = params.kind === 'question' ? 'question' : 'post';
  const id = params.id ?? '';

  const { users, posts, questions, currentUserId, actions } = useApp();
  const [selected, setSelected] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [search, setSearch] = useState('');
  const [sent, setSent] = useState(false);
  const [fallbackNote, setFallbackNote] = useState('');

  const item = kind === 'post' ? posts.find((p) => p.id === id) : questions.find((q) => q.id === id);
  const title = item
    ? kind === 'post'
      ? (item as { body: string }).body
      : (item as { title: string }).title
    : 'This item is no longer available';

  const people = useMemo(
    () =>
      users
        .filter((u) => u.id !== currentUserId)
        .filter((u) =>
          `${u.name} ${u.handle}`.toLowerCase().includes(search.trim().toLowerCase()),
        ),
    [users, currentUserId, search],
  );

  const toggle = (userId: string) =>
    setSelected((prev) =>
      prev.includes(userId) ? prev.filter((x) => x !== userId) : [...prev, userId],
    );

  const send = () => {
    if (!selected.length || !item) return;
    actions.shareToUsers(selected, kind, id, note);
    setSent(true);
    setTimeout(() => router.back(), 700);
  };

  const shareOut = async () => {
    try {
      await RNShare.share({ message: `${title}\n\nShared from CourtSide` });
    } catch {
      setFallbackNote('Your browser blocked the share sheet — copy the text above instead.');
    }
  };

  return (
    <View style={styles.backdrop}>
      <Pressable
        style={styles.dismissArea}
        accessibilityRole="button"
        accessibilityLabel="Close share sheet"
        onPress={() => router.back()}
      />
      <View style={styles.sheet}>
        <View style={styles.grabber} />

        <View style={styles.headerRow}>
          <Text style={styles.heading}>Send to</Text>
          <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Close">
            <Ionicons name="close" size={22} color={colors.textMuted} />
          </Pressable>
        </View>

        <View style={styles.itemPreview}>
          <Ionicons
            name={kind === 'post' ? 'play-circle-outline' : 'chatbubbles-outline'}
            size={20}
            color={colors.brand}
          />
          <Text numberOfLines={2} style={styles.itemText}>
            {title}
          </Text>
        </View>

        <Field value={search} onChangeText={setSearch} placeholder="Search" autoCapitalize="none" />

        <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
          {people.map((user) => {
            const on = selected.includes(user.id);
            return (
              <Pressable
                key={user.id}
                onPress={() => toggle(user.id)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                style={styles.person}
              >
                <Avatar name={user.name} seed={user.avatarSeed} size={44} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.personName}>{user.name}</Text>
                  <Text style={styles.personHandle}>@{user.handle}</Text>
                </View>
                <View style={[styles.check, on && styles.checkOn]}>
                  {on ? <Ionicons name="checkmark" size={16} color={colors.brandInk} /> : null}
                </View>
              </Pressable>
            );
          })}
          {!people.length ? <Text style={styles.empty}>No one matches “{search}”.</Text> : null}
        </ScrollView>

        {selected.length ? (
          <Field value={note} onChangeText={setNote} placeholder="Write a message…" />
        ) : null}

        <View style={styles.footer}>
          <Button
            label={sent ? 'Sent ✓' : selected.length ? `Send to ${selected.length}` : 'Send'}
            onPress={send}
            disabled={!selected.length || sent}
            full
          />
          <Pressable onPress={shareOut} accessibilityRole="button" style={styles.externalRow}>
            <Ionicons name="share-outline" size={18} color={colors.textMuted} />
            <Text style={styles.external}>Share outside CourtSide</Text>
          </Pressable>
          {fallbackNote ? <Text style={styles.empty}>{fallbackNote}</Text> : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay },
  dismissArea: { flex: 1 },
  sheet: {
    maxHeight: '86%',
    width: '100%',
    maxWidth: 620,
    alignSelf: 'center',
    backgroundColor: colors.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
    alignSelf: 'center',
    marginBottom: spacing.xs,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heading: { ...typography.title, color: colors.text },
  itemPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  itemText: { ...typography.small, color: colors.textMuted, flex: 1, lineHeight: 19 },
  list: { maxHeight: 300 },
  person: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  personName: { ...typography.bodyStrong, color: colors.text },
  personHandle: { ...typography.small, color: colors.textFaint },
  check: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  empty: { ...typography.small, color: colors.textFaint, paddingVertical: spacing.md },
  footer: { gap: spacing.md },
  externalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  external: { ...typography.smallStrong, color: colors.textMuted },
});
