import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { DragSheet } from '@/components/DragSheet';
import { shareOutside } from '@/lib/shareOutside';
import { Avatar, Button, Field } from '@/components/ui';
import * as haptics from '@/lib/haptics';
import { useApp } from '@/store/AppContext';
import { colors, radius, spacing, typography } from '@/theme';

/**
 * Instagram-style send sheet. Pick people, add a note, send — the item lands
 * in each DM thread. "Share outside CourtSide" falls back to the OS sheet.
 */
/** Springs a tick over the sheet so a send lands instead of just vanishing. */
function SentTick() {
  const scale = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 14 }).start();
  }, [scale]);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View style={{ transform: [{ scale }] }}>
          <View style={{
            width: 86, height: 86, borderRadius: 43, backgroundColor: colors.brand,
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Ionicons name="checkmark" size={46} color={colors.brandInk} />
          </View>
        </Animated.View>
      </View>
    </View>
  );
}

export default function ShareSheet() {
  const styles = useThemedStyles(styleDefinitions);
  const params = useLocalSearchParams<{ kind?: string; id?: string }>();
  const kind = params.kind === 'profile' ? 'profile' : params.kind === 'question' ? 'question' : 'post';
  const id = params.id ?? '';

  const { users, posts, questions, conversations, currentUserId, actions } = useApp();
  const [selected, setSelected] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [search, setSearch] = useState('');
  const [sent, setSent] = useState(false);
  const [fallbackNote, setFallbackNote] = useState('');

  // The card itself (rise, dim, drag handle) is DragSheet's; this only asks it to close.
  const [closeSignal, setCloseSignal] = useState(0);
  const dismiss = () => setCloseSignal((n) => n + 1);

  const item = kind === 'profile' ? users.find(u => u.id === id) : kind === 'post' ? posts.find((p) => p.id === id) : questions.find((q) => q.id === id);
  const title = item
    ? kind === 'profile' ? (item as {name:string}).name : kind === 'post'
      ? (item as { body: string }).body
      : (item as { title: string }).title
    : 'This item is no longer available';

  const people = useMemo(
    () =>
      users
        .filter((u) => u.id !== currentUserId)
        .sort((a,b) => {
          const latest = (id:string) => Math.max(0,...conversations.filter(c=>c.participantIds.includes(id)).map(c=>new Date(c.updatedAt).getTime()));
          return latest(b.id)-latest(a.id);
        })
        .filter((u) =>
          `${u.name} ${u.handle}`.toLowerCase().includes(search.trim().toLowerCase()),
        ),
    [users, conversations, currentUserId, search],
  );

  const toggle = (userId: string) =>
    setSelected((prev) =>
      prev.includes(userId) ? prev.filter((x) => x !== userId) : [...prev, userId],
    );

  const send = () => {
    if (!selected.length || !item) return;
    actions.shareToUsers(selected, kind, id, note);
    haptics.reward();
    setSent(true);
    // Long enough to read the confirmation, short enough not to wait on it.
    setTimeout(dismiss, 900);
  };

  const url = `https://app.courtsidebase.com/${kind === 'profile' ? 'user' : kind}/${id}`;
  const shareOut = async () => {
    try { setFallbackNote(await shareOutside(title, url)); }
    catch { setFallbackNote(`Share this link: ${url}`); }
  };

  return (
    <DragSheet
      closeSignal={closeSignal}
      onDismissed={() => router.back()}
      peekFraction={0.72}
      header={
        <View style={styles.headerRow}>
          <Text style={styles.heading}>Send to</Text>
          <Pressable onPress={dismiss} accessibilityRole="button" accessibilityLabel="Close" hitSlop={10}>
            <Ionicons name="close" size={22} color={colors.textMuted} />
          </Pressable>
        </View>
      }
    >
      <View style={styles.sheet}>
        {sent ? <SentTick /> : null}

        <View style={styles.itemPreview}>
          <Ionicons
            name={kind === 'profile' ? 'person-outline' : kind === 'post' ? 'play-circle-outline' : 'chatbubbles-outline'}
            size={20}
            color={colors.brand}
          />
          <Text numberOfLines={2} style={styles.itemText}>
            {title}
          </Text>
        </View>

        <Field value={search} onChangeText={setSearch} placeholder="Search" autoCapitalize="none" />

        <Text style={styles.personHandle}>{search ? "Search results" : "Recent conversations"}</Text>
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
            disabled={!selected.length || sent || !item}
            full
          />
          <Pressable onPress={shareOut} accessibilityRole="button" style={styles.externalRow}>
            <Ionicons name="share-outline" size={18} color={colors.textMuted} />
            <Text style={styles.external}>Share outside CourtSide</Text>
          </Pressable>
          {fallbackNote ? <Text selectable style={styles.empty}>{fallbackNote}</Text> : null}
        </View>
      </View>
    </DragSheet>
  );
}

const styleDefinitions = StyleSheet.create({
  sheet: { flex: 1, padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xxl, gap: spacing.md },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
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
