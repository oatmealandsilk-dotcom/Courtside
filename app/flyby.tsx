import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { CourtSpinner } from '@/components/CourtSpinner';
import { DragSheet } from '@/components/DragSheet';
import { FollowPill } from '@/components/FollowPill';
import { Avatar } from '@/components/ui';
import { confirmUnfollow } from '@/lib/confirm';
import { SheetTitle } from '@/components/sheet/SheetForm';
import type { FlybyPerson } from '@/data/types';
import { andList, firstName } from '@/features/activity/sessionTags';
import { flybyDay, flybyPeople, partWords } from '@/features/flyby/flyby';
import { isMapCourtId } from '@/features/places/courtName';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, spacing, typography } from '@/theme';

/**
 * Flyby's list (owner, Oct 5: "Flyby is good"): who else was at a court on
 * a day of yours, from the "3 others were at Alder Park today" note or a
 * session's pill. Each with Follow, and what they did there, by the part of
 * the day only ("Posted this morning", "Checked in this evening"), never a
 * time. The people you played that day are not listed (they are on your
 * session already); the sheet says so by first name ("You played with
 * Mira."). Only people the server lets you see (flyby, migration 130), said
 * under the list: friends, and public players who posted there; a check-in
 * only to friends.
 *
 * Opened with ?court= (the map's id), ?name= and ?day= ('YYYY-MM-DD').
 */
export default function FlybySheet() {
  const styles = useThemedStyles(styleDefinitions);
  const params = useLocalSearchParams<{ court?: string; name?: string; day?: string }>();
  const { actions, users, sessions, sessionTags, currentUserId, followingIds } = useApp();
  const courtId = isMapCourtId(params.court) ? params.court : null;
  const day = params.day && /^\d{4}-\d{2}-\d{2}$/.test(params.day) ? params.day : null;
  const name = params.name?.trim() || 'this court';
  const [closeSignal, setCloseSignal] = useState(0);
  // The list's own height, so a short one opens a short sheet (open-to-hit's way), never one mostly empty.
  const [contentH, setContentH] = useState(0);
  const [list, setList] = useState<FlybyPerson[] | null | undefined>(undefined);
  useEffect(() => {
    if (!courtId || !day) { setList(null); return undefined; }
    let on = true;
    void actions.flyby(courtId, day).then((got) => { if (on) setList(got); });
    return () => { on = false; };
  }, [courtId, day, actions]);

  // The people you played that day: on your session already, so not in the list (the server leaves them out too).
  const played = useMemo(() => {
    if (!day || !currentUserId) return [];
    const mine = new Set(sessions.filter((s) => s.userId === currentUserId && s.day === day && (!courtId || !s.courtId || s.courtId === courtId)).map((s) => s.id));
    const ids = new Set(sessionTags.filter((t) => t.status !== 'declined' && t.status !== 'removed' && !t.dropped && (mine.has(t.sessionId) || (t.taggedId === currentUserId && t.day === day)))
      .map((t) => (t.taggerId === currentUserId ? t.taggedId : t.taggerId)));
    return users.filter((u) => ids.has(u.id));
  }, [day, currentUserId, courtId, sessions, sessionTags, users]);
  const people = flybyPeople((list ?? []).filter((p) => !played.some((u) => u.id === p.userId)), users);
  const when = day ? flybyDay(day) : 'today';
  const close = () => setCloseSignal((n) => n + 1);
  // One short line under the title, only when there is someone to count: with nobody, the sheet's body says so once.
  const line = list === undefined ? 'Looking…'
    : people.length === 1 ? '1 other player was here'
      : people.length ? `${people.length} other players were here`
        : undefined;
  // The people you played that day are on your session already: one quiet line says why they aren't here.
  const playedNote = played.length ? `You played with ${andList(played.map((u) => firstName(u.name)))}.` : null;

  return (
    <DragSheet fitContent closeSignal={closeSignal} onDismissed={() => router.back()} peekFraction={0.7} contentHeight={contentH || undefined}
      header={<SheetTitle title={`At ${name} ${when}`} line={line} lines={2} onClose={close} />}>
      <ScrollView contentContainerStyle={styles.body} onContentSizeChange={(_, h) => { const r = Math.ceil(h); if (r !== contentH) setContentH(r); }}>
        {list === undefined ? (
          <View style={styles.wait}><CourtSpinner size={24} /></View>
        ) : people.length ? (
          <View>
            {people.map(({ person, user }, i) => {
              const following = followingIds.includes(user.id);
              const what = `${person.via === 'checkin' ? 'Checked in' : 'Posted'} ${day ? partWords(person.part, day) : person.part}`;
              return (
                // The row opens their profile; Follow sits beside it, not inside it (no button inside a button in a browser).
                <View key={user.id} style={[styles.row, i > 0 && styles.rule]}>
                  <Pressable accessibilityRole="link" accessibilityLabel={`${user.name}, @${user.handle}. ${what}. Open profile`} onPress={() => router.push(`/user/${user.id}`)} style={({ pressed }) => [styles.who, pressed && styles.pressed]}>
                    <Avatar name={user.name} seed={user.avatarSeed} uri={user.avatarUrl} size={44} />
                    <View style={styles.words}>
                      <Text style={styles.name} numberOfLines={1}>{user.name}</Text>
                      {/* One line, like Strava's list: the name is above it already. */}
                      <Text style={styles.meta} numberOfLines={1}>{what}</Text>
                    </View>
                  </Pressable>
                  <FollowPill small following={following} userId={user.id} name={user.name}
                    onPress={() => { if (following) confirmUnfollow(user, () => actions.toggleFollow(user.id)); else actions.toggleFollow(user.id); }} />
                </View>
              );
            })}
          </View>
        ) : (
          <Text style={styles.none}>Nobody else you can see was here {when}.</Text>
        )}
        {playedNote ? (
          <View style={styles.fine}>
            <Ionicons name="people-outline" size={13} color={colors.textFaint} />
            <Text style={styles.fineText}>{playedNote}</Text>
          </View>
        ) : null}
        <View style={[styles.fine, playedNote ? styles.fineNext : null]}>
          <Ionicons name="lock-closed-outline" size={13} color={colors.textFaint} />
          <Text style={styles.fineText}>You see friends, and public players who posted here. Check-ins show to friends only.</Text>
        </View>
      </ScrollView>
    </DragSheet>
  );
}

const styleDefinitions = StyleSheet.create({
  body: { paddingBottom: spacing.xl, gap: spacing.md },
  wait: { paddingVertical: spacing.xl, alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: 10 },
  rule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  who: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  pressed: { opacity: 0.7 },
  words: { flex: 1, minWidth: 0, gap: 2 },
  name: { ...font('500'), fontSize: 16, color: colors.text },
  meta: { ...typography.small, color: colors.textMuted },
  none: { ...typography.body, color: colors.textMuted, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  fine: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  // The second of two notes sits close under the first.
  fineNext: { paddingTop: 0, marginTop: -spacing.xs },
  fineText: { flex: 1, ...typography.small, color: colors.textFaint, lineHeight: 18 },
});
