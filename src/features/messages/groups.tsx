import React from 'react';
import { StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Avatar } from '@/components/ui';
import type { User } from '@/data/types';
import { colors, radius } from '@/theme';
import { useThemedStyles } from '@/theme/ThemeProvider';

// The rules (who is in, names, mute, the unread badge, event lines, "Seen
// by") live in ./groupRules so the store can use them too; screens keep
// importing everything from here.
export {
  GROUP_CAP,
  MAX_PINNED_CHATS,
  MUTED_FOREVER,
  eventText,
  findDirectChat,
  groupName,
  hasGroupControls,
  holdsHitSpot,
  isDirectChat,
  isGroupAdmin,
  isGroupChat,
  isMuted,
  isMutedFor,
  leaveGroupMessage,
  messageSummary,
  photoWords,
  nameList,
  removeMemberMessage,
  named,
  chatLockNote,
  groupLockNote,
  othersIn,
  seenByLabel,
  unreadChatCount,
} from './groupRules';

/**
 * A group's picture in the space one avatar takes: its own photo when it has
 * one; otherwise two smaller faces set corner to corner, the front one ringed
 * in the page's colour (iMessage's and Instagram's group picture). The face
 * behind shows no initials, which the front one would cut in half. With one
 * other person left it is just their face, and with nobody else a plain
 * people mark.
 */
export function GroupAvatar({ people, size, photoUrl, name }: { people: User[]; size: number; photoUrl?: string; name?: string }) {
  const styles = useThemedStyles(styleDefinitions);
  if (photoUrl) return <Avatar name={name ?? 'Group'} seed={photoUrl} uri={photoUrl} size={size} />;
  const [a, b] = people;
  if (!a) {
    return (
      <View style={[styles.empty, { width: size, height: size }]}>
        <Ionicons name="people-outline" size={Math.round(size * 0.46)} color={colors.textMuted} />
      </View>
    );
  }
  if (!b) return <Avatar name={a.name} seed={a.avatarSeed} uri={a.avatarUrl} size={size} />;
  const small = Math.round(size * 0.66);
  const ring = Math.max(1.5, Math.round(size / 24));
  return (
    <View style={{ width: size, height: size }}>
      <Avatar name={b.name} seed={b.avatarSeed} uri={b.avatarUrl} size={small} plain style={[styles.back, { left: 0, top: 0 }]} />
      <View style={[styles.front, { right: -ring, bottom: -ring, padding: ring, borderRadius: small / 2 + ring }]}>
        <Avatar name={a.name} seed={a.avatarSeed} uri={a.avatarUrl} size={small} />
      </View>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  back: { position: 'absolute' },
  front: { position: 'absolute', backgroundColor: colors.bg },
  empty: { borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
});
