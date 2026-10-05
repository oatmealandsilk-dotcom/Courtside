import React, { useId } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Svg, { ClipPath, Defs, Image as SvgImage, Path, Text as SvgText } from 'react-native-svg';

import { Avatar, tintFor } from '@/components/ui';
import type { User } from '@/data/types';
import { colors, font, radius } from '@/theme';
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
 * one; otherwise two smaller faces set corner to corner (iMessage's and
 * Instagram's group picture). The face behind has a bite taken out of it
 * where the front one sits, with a little room between, so the two read
 * apart on any ground (the inbox, the chat's washed header) with no ring
 * of a colour that might not match. It keeps its first initial, in the part
 * that shows. With one other person left it is just their face, and with
 * nobody else a plain people mark.
 */
export function GroupAvatar({ people, size, photoUrl, name }: { people: User[]; size: number; photoUrl?: string; name?: string }) {
  const styles = useThemedStyles(styleDefinitions);
  const clipId = `gbite${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
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
  const room = Math.max(1.5, size / 22);
  const shape = bitten(small / 2, size - small / 2, small / 2 + room);
  const letter = b.name.trim()[0]?.toUpperCase() ?? '';
  const type = Math.round(small * 0.4);
  // The letter sits a little up and to the left of the back face's middle, clear of the bite.
  const at = small / 2 - small * 0.07;
  return (
    <View style={{ width: size, height: size }} accessible={false}>
      <Svg width={small} height={small} style={styles.back}>
        <Defs>
          <ClipPath id={clipId}><Path d={shape} /></ClipPath>
        </Defs>
        <Path d={shape} fill={tintFor(b.avatarSeed)} />
        {b.avatarUrl ? (
          <SvgImage href={{ uri: b.avatarUrl }} x={0} y={0} width={small} height={small} preserveAspectRatio="xMidYMid slice" clipPath={`url(#${clipId})`} />
        ) : (
          // Android takes Inter Bold as its own family with no weight on top (a weight of 700 there falls back to the phone's own font; see textScale).
          <SvgText x={at} y={at + type * 0.36} fontSize={type} fontWeight={Platform.OS === 'android' ? 'normal' : '700'} fontFamily={font('700').fontFamily} fill={colors.onMedia} textAnchor="middle">{letter}</SvgText>
        )}
      </Svg>
      <Avatar name={a.name} seed={a.avatarSeed} uri={a.avatarUrl} size={small} style={styles.front} />
    </View>
  );
}

/**
 * The back face's outline: a circle of radius `r` (centred at r, r) with a
 * round bite of radius `bite` taken out around the front face's centre (at
 * `front`, `front`), as an SVG path: the long way round the circle between
 * the two points where they cross, then back along the bite.
 */
function bitten(r: number, front: number, bite: number): string {
  const d = Math.SQRT2 * (front - r);
  if (d >= r + bite) return `M0 ${r}A${r} ${r} 0 1 1 ${2 * r} ${r}A${r} ${r} 0 1 1 0 ${r}Z`;
  const along = (r * r - bite * bite + d * d) / (2 * d);
  const half = Math.sqrt(Math.max(0, r * r - along * along));
  const mid = r + along / Math.SQRT2;
  const off = half / Math.SQRT2;
  const p1 = `${(mid - off).toFixed(2)} ${(mid + off).toFixed(2)}`;
  const p2 = `${(mid + off).toFixed(2)} ${(mid - off).toFixed(2)}`;
  return `M${p1}A${r} ${r} 0 1 1 ${p2}A${bite.toFixed(2)} ${bite.toFixed(2)} 0 0 0 ${p1}Z`;
}

const styleDefinitions = StyleSheet.create({
  back: { position: 'absolute', left: 0, top: 0 },
  front: { position: 'absolute', right: 0, bottom: 0 },
  empty: { borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
});
