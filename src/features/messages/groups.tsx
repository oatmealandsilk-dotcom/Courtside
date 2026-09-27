import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/ui';
import type { Conversation, ID, User } from '@/data/types';
import { colors } from '@/theme';
import { useThemedStyles } from '@/theme/ThemeProvider';

/** A group chat: marked as one, or simply more than two people in it. */
export const isGroupChat = (c: Conversation) => !!c.isGroup || c.participantIds.length > 2;

/** The others in a chat, as people. */
export const othersIn = (c: Conversation, users: User[], me: ID | null) =>
  c.participantIds.filter((id) => id !== me).map((id) => users.find((u) => u.id === id)).filter((u): u is User => !!u);

/** A group's name: the one it was given, or its people ("Mira, Dev & Nadia", "Mira, Dev + 3"). */
export function groupName(c: Conversation, users: User[], me: ID | null): string {
  if (c.title) return c.title;
  const first = othersIn(c, users, me).map((u) => u.name.split(' ')[0]);
  if (first.length <= 1) return first[0] ?? 'Group';
  if (first.length <= 3) return `${first.slice(0, -1).join(', ')} & ${first[first.length - 1]}`;
  return `${first.slice(0, 2).join(', ')} + ${first.length - 2}`;
}

/** Two of the group's faces, one over the other, in the space one avatar takes. */
export function GroupAvatar({ people, size }: { people: User[]; size: number }) {
  const styles = useThemedStyles(styleDefinitions);
  const small = Math.round(size * 0.72);
  const [a, b] = people;
  return (
    <View style={{ width: size, height: size }}>
      {b ? <Avatar name={b.name} seed={b.avatarSeed} uri={b.avatarUrl} size={small} style={[styles.back, { left: 0, top: 0 }]} /> : null}
      {a ? <Avatar name={a.name} seed={a.avatarSeed} uri={a.avatarUrl} size={small} style={[styles.front, { right: 0, bottom: 0, borderRadius: small / 2 + 2 }]} /> : null}
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  back: { position: 'absolute' },
  front: { position: 'absolute', borderWidth: 2, borderColor: colors.bg },
});
