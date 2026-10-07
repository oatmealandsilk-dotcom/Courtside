import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { CourtSpinner } from '@/components/CourtSpinner';
import { TileCover } from '@/components/TileCover';
import { Avatar, Button, EmptyState, Screen } from '@/components/ui';
import type { DemotedPost } from '@/data/types';
import { relativeTime } from '@/lib/format';
import { goBack } from '@/lib/goBack';
import { useApp } from '@/store/AppContext';
import { colors, radius, spacing, typography } from '@/theme';

/**
 * Settings → Admin → Pushed-down posts, for admins only (the database hands
 * this list to nobody else): every post pushed to the bottom of feeds
 * (migration 152), newest first. Each card says what it is, who posted it,
 * who pushed it down and when. "Undo" puts it back in its usual place in
 * feeds: the card leaves at once, and comes back if the server says no.
 * Nobody is told either way.
 */
export default function AdminPushedDown() {
  const styles = useThemedStyles(styleDefinitions);
  const { users, currentUser, actions } = useApp();
  const [items, setItems] = useState<DemotedPost[] | 'not_ready' | 'failed' | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // Cards undone on this page, kept off a list that loads again before the server has caught up.
  const undone = useRef(new Set<string>());

  const load = useCallback(async () => {
    const got = await actions.loadDemotedPosts();
    setItems(got === null ? 'failed' : got === 'not_ready' ? got : got.filter((x) => !undone.current.has(x.postId)));
  }, [actions]);
  // Again each time the page comes back into view (after a push from a post's … menu, say).
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  if (!currentUser?.isAdmin) {
    return (
      <Screen title="Pushed-down posts" compactTitle onBack={() => goBack()}>
        <EmptyState icon="lock-closed-outline" title="Only admins can see this" />
      </Screen>
    );
  }

  const undo = async (item: DemotedPost) => {
    setBusy(item.postId);
    // Off the list at once; back in its place if the server says no.
    const at = Array.isArray(items) ? items.findIndex((x) => x.postId === item.postId) : -1;
    setItems((list) => (Array.isArray(list) ? list.filter((x) => x.postId !== item.postId) : list));
    undone.current.add(item.postId);
    const result = await actions.setPostDemoted(item.postId, false);
    if (result !== 'done') {
      undone.current.delete(item.postId);
      setItems((list) => {
        if (!Array.isArray(list) || list.some((x) => x.postId === item.postId)) return list;
        const next = [...list];
        next.splice(at < 0 ? 0 : Math.min(at, next.length), 0, item);
        return next;
      });
    }
    setBusy(null);
  };

  return (
    <Screen title="Pushed-down posts" compactTitle onBack={() => goBack()} onRefresh={load}>
      <Text style={styles.intro}>These sit at the very bottom of everyone’s feeds. They still show on their author’s profile and open from links. Only admins see this list, and nobody is told.</Text>
      {items === null ? (
        <View style={styles.wait}><CourtSpinner size={28} /></View>
      ) : items === 'not_ready' ? (
        <EmptyState icon="construct-outline" title="Not switched on yet" body="The server needs a quick update first. Check back soon." />
      ) : items === 'failed' ? (
        <EmptyState icon="cloud-offline-outline" title="Couldn’t load the list" body="Check your connection, then pull down to try again." />
      ) : items.length === 0 ? (
        <EmptyState icon="arrow-down-circle-outline" title="Nothing pushed down" body="Use “Push to bottom” in the … menu of a post or clip." />
      ) : (
        items.map((item) => {
          const author = item.authorId ? users.find((u) => u.id === item.authorId) : undefined;
          const handle = author?.handle ?? item.authorHandle;
          const admin = item.demotedBy ? users.find((u) => u.id === item.demotedBy) : undefined;
          const byWho = item.demotedBy === currentUser.id ? 'by you' : admin ? `by @${admin.handle}` : 'by an admin';
          return (
            <View key={item.postId} style={styles.card}>
              <View style={styles.head}>
                <View style={styles.kind}><Text style={styles.kindText}>{item.kind === 'clip' ? 'Clip' : 'Post'}</Text></View>
                <Text style={[styles.muted, styles.when]}>{relativeTime(item.demotedAt)}</Text>
              </View>

              <Pressable accessibilityRole="link" accessibilityLabel="Open the post" onPress={() => router.push(`/post/${item.postId}`)} style={({ pressed }) => [styles.target, pressed && styles.targetPressed]}>
                {item.picture ? (
                  <TileCover uri={item.picture} style={styles.thumb} accessibilityIgnoresInvertColors />
                ) : (
                  <View style={[styles.thumb, styles.noThumb]}><Ionicons name="document-text-outline" size={18} color={colors.textMuted} /></View>
                )}
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.body} numberOfLines={3}>{item.preview.trim() || 'No words with it'}</Text>
                  <View style={styles.byRow}>
                    {author ? <Avatar name={author.name} seed={author.avatarSeed} uri={author.avatarUrl} size={18} /> : null}
                    <Text style={styles.muted} numberOfLines={1}>{handle ? `by @${handle}` : 'by an account that’s gone'}</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
              </Pressable>

              <View style={{ gap: 2 }}>
                {item.note ? <Text style={styles.note}>“{item.note}”</Text> : null}
                <Text style={styles.muted}>Pushed down {byWho}</Text>
              </View>

              <View style={styles.actions}>
                <Button size="sm" label="Undo" variant="secondary" loading={busy === item.postId} onPress={() => { void undo(item); }} />
              </View>
            </View>
          );
        })
      )}
    </Screen>
  );
}

const styleDefinitions = StyleSheet.create({
  intro: { ...typography.small, color: colors.textMuted, lineHeight: 20, paddingBottom: spacing.md },
  wait: { paddingTop: spacing.xxxl, alignItems: 'center' },
  card: { gap: spacing.sm, padding: spacing.md, marginBottom: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  when: { marginLeft: 'auto' },
  // The same small tag as Removed and Reports.
  kind: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: colors.brandDim },
  kindText: { ...typography.caption, fontSize: 12, letterSpacing: 0.2, color: colors.textMuted },
  target: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  targetPressed: { opacity: 0.75 },
  thumb: { width: 44, height: 55, borderRadius: radius.sm, backgroundColor: colors.border },
  noThumb: { alignItems: 'center', justifyContent: 'center' },
  byRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  body: { ...typography.body, color: colors.text },
  note: { ...typography.small, color: colors.text, fontStyle: 'italic' },
  muted: { ...typography.small, color: colors.textMuted },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
