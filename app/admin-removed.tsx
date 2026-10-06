import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { CourtSpinner } from '@/components/CourtSpinner';
import { TileCover } from '@/components/TileCover';
import { Avatar, Button, EmptyState, Screen } from '@/components/ui';
import type { RemovedItem, TakedownKind } from '@/data/types';
import { KIND_WORD, reasonLabel } from '@/features/moderation/reasons';
import { confirm } from '@/lib/confirm';
import { relativeTime } from '@/lib/format';
import { goBack } from '@/lib/goBack';
import { useApp } from '@/store/AppContext';
import { colors, radius, spacing, typography } from '@/theme';

/** What each kind is called on its card. */
const KIND_LABEL: Record<TakedownKind, string> = {
  post: 'Post',
  hit: 'Instant',
  comment: 'Comment',
  'hit-comment': 'Comment on an Instant',
  question: 'Thread',
  answer: 'Thread reply',
  'coach-question': 'Coach question',
  'coach-reply': 'Coach reply',
};

/** Where a removed thing opens: its own page, or the page it sits on (a comment its post's comments, a reply its thread). */
function openRemoved(item: RemovedItem) {
  switch (item.kind) {
    case 'post': router.push(`/post/${item.id}`); return;
    case 'hit': router.push(`/hits/${item.id}`); return;
    case 'comment': if (item.parentId) router.push({ pathname: '/comments', params: { kind: 'post', id: item.parentId, at: item.id } }); return;
    case 'hit-comment': if (item.parentId) router.push({ pathname: '/comments', params: { kind: 'hit', id: item.parentId, at: item.id } }); return;
    case 'question': router.push(`/question/${item.id}`); return;
    case 'answer': if (item.parentId) router.push(`/question/${item.parentId}`); return;
    case 'coach-question': router.push(`/coach-question/${item.id}`); return;
    case 'coach-reply': if (item.parentId) router.push(`/coach-question/${item.parentId}`); return;
  }
}

/**
 * Settings → Admin → Removed, for admins only (the database hands this list
 * to nobody else): everything taken down, newest first. Each card says what
 * it was, who posted it, why it came down (and the note, for "Something
 * else"), who took it down and when. "Restore" puts it back exactly as it
 * was: the card leaves at once, and comes back if the server says no.
 */
export default function AdminRemoved() {
  const styles = useThemedStyles(styleDefinitions);
  const { users, currentUser, actions } = useApp();
  const [items, setItems] = useState<RemovedItem[] | 'not_ready' | 'failed' | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // Cards restored on this page, kept off a list that loads again before the server has caught up.
  const restored = useRef(new Set<string>());

  const load = useCallback(async () => {
    const got = await actions.loadRemoved();
    setItems(got === null ? 'failed' : got === 'not_ready' ? got : got.filter((x) => !restored.current.has(`${x.kind}:${x.id}`)));
  }, [actions]);
  // Again each time the page comes back into view (after a take-down elsewhere, say).
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  if (!currentUser?.isAdmin) {
    return (
      <Screen title="Removed" compactTitle onBack={() => goBack()}>
        <EmptyState icon="lock-closed-outline" title="Only admins can see this" />
      </Screen>
    );
  }

  const restore = (item: RemovedItem) => confirm({
    // "Restore this Instant?", "Restore this comment?": the kind's own word, capitals kept.
    title: `Restore this ${KIND_WORD[item.kind]}?`,
    message: 'Everyone who could see it before sees it again. Its author isn’t told.',
    confirmLabel: 'Restore',
    onConfirm: async () => {
      const key = `${item.kind}:${item.id}`;
      setBusy(key);
      // Off the list at once; back in its place if the server says no.
      const at = Array.isArray(items) ? items.findIndex((x) => x.kind === item.kind && x.id === item.id) : -1;
      setItems((list) => (Array.isArray(list) ? list.filter((x) => !(x.kind === item.kind && x.id === item.id)) : list));
      restored.current.add(key);
      const result = await actions.restoreContent(item.kind, item.id);
      if (result !== 'done') {
        restored.current.delete(key);
        setItems((list) => {
          if (!Array.isArray(list) || list.some((x) => x.kind === item.kind && x.id === item.id)) return list;
          const next = [...list];
          next.splice(at < 0 ? 0 : Math.min(at, next.length), 0, item);
          return next;
        });
      }
      setBusy(null);
    },
  });

  return (
    <Screen title="Removed" compactTitle onBack={() => goBack()} onRefresh={load}>
      <Text style={styles.intro}>Taken down for breaking CourtSide’s rules. Only the author and admins see these, and nothing is deleted.</Text>
      {items === null ? (
        <View style={styles.wait}><CourtSpinner size={28} /></View>
      ) : items === 'not_ready' ? (
        <EmptyState icon="construct-outline" title="Not switched on yet" body="Check back soon." />
      ) : items === 'failed' ? (
        <EmptyState icon="cloud-offline-outline" title="Couldn’t load the list" body="Check your connection, then pull down to try again." />
      ) : items.length === 0 ? (
        <EmptyState icon="eye-off-outline" title="Nothing taken down" body="Use “Take down” in the … menu of a post, clip or Instant, or hold a comment or reply." />
      ) : (
        items.map((item) => {
          const author = users.find((u) => u.id === item.authorId);
          const admin = item.removedBy ? users.find((u) => u.id === item.removedBy) : undefined;
          const byWho = item.removedBy === currentUser.id ? 'by you' : admin ? `by @${admin.handle}` : item.removedBy ? 'by an admin' : 'from Reports';
          const key = `${item.kind}:${item.id}`;
          return (
            <View key={key} style={styles.card}>
              <View style={styles.head}>
                <View style={styles.kind}><Text style={styles.kindText}>{KIND_LABEL[item.kind]}</Text></View>
                <Text style={styles.muted}>{relativeTime(item.removedAt)}</Text>
              </View>

              <Pressable accessibilityRole="link" accessibilityLabel={`Open the removed ${KIND_WORD[item.kind]}`} onPress={() => openRemoved(item)} style={({ pressed }) => [styles.target, pressed && styles.targetPressed]}>
                {item.picture ? (
                  <TileCover uri={item.picture} style={styles.thumb} accessibilityIgnoresInvertColors />
                ) : (
                  <View style={[styles.thumb, styles.noThumb]}><Ionicons name="document-text-outline" size={18} color={colors.textMuted} /></View>
                )}
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.body} numberOfLines={3}>{item.preview.trim() || 'No words with it'}</Text>
                  <View style={styles.byRow}>
                    {author ? <Avatar name={author.name} seed={author.avatarSeed} uri={author.avatarUrl} size={18} /> : null}
                    <Text style={styles.muted} numberOfLines={1}>{author ? `by @${author.handle}` : 'by an account that’s gone'}</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
              </Pressable>

              {/* Why, then who: the date is in the card's top line already. Restore sits beside it, compact. */}
              <View style={styles.foot}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.reason}>{reasonLabel(item.reason)}</Text>
                  {item.note ? <Text style={styles.note}>“{item.note}”</Text> : null}
                  <Text style={styles.muted}>Taken down {byWho}</Text>
                </View>
                <Button size="sm" label="Restore" variant="secondary" loading={busy === key} onPress={() => restore(item)} />
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
  // The same small tag as Reports: dark enough to read on the tint in every court.
  kind: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: colors.brandDim },
  kindText: { ...typography.caption, fontSize: 12, letterSpacing: 0.2, color: colors.textMuted },
  target: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  targetPressed: { opacity: 0.75 },
  thumb: { width: 44, height: 55, borderRadius: radius.sm, backgroundColor: colors.border },
  noThumb: { alignItems: 'center', justifyContent: 'center' },
  byRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  body: { ...typography.body, color: colors.text },
  reason: { ...typography.smallStrong, color: colors.danger },
  note: { ...typography.small, color: colors.text, fontStyle: 'italic' },
  muted: { ...typography.small, color: colors.textMuted },
  foot: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
});
