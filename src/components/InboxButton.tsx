import React, { useEffect, useRef } from 'react';
import { StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import Reanimated, { Easing, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { Tappable } from '@/components/Tappable';
import { useApp } from '@/store/AppContext';
import { useWelcomeNote } from '@/features/welcome/welcomeNote';
import { blockedDirect, isGroupChat, isMuted, unreadChatCount } from '@/features/messages/groupRules';
import { colors, typography } from '@/theme';
import { useThemedStyles } from '@/theme/ThemeProvider';

/**
 * The little count in the corner of a header icon: a green pill, "9+" past
 * nine, gone at nought. When the number goes up it gives one small pop, so a
 * new message is noticed without anything flashing.
 */
export function UnreadBadge({ count, style }: { count: number; style?: StyleProp<ViewStyle> }) {
  const styles = useThemedStyles(styleDefinitions);
  const scale = useSharedValue(1);
  const last = useRef(count);
  useEffect(() => {
    if (count > last.current && count > 0) {
      scale.value = withSequence(
        withTiming(1.28, { duration: 130, easing: Easing.out(Easing.quad) }),
        withSpring(1, { damping: 9, stiffness: 260 }),
      );
    }
    last.current = count;
  }, [count]); // eslint-disable-line react-hooks/exhaustive-deps
  const pop = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  if (count <= 0) return null;
  return (
    <Reanimated.View pointerEvents="none" style={[styles.badge, style, pop]}>
      <Text style={styles.badgeText}>{count > 9 ? '9+' : count}</Text>
    </Reanimated.View>
  );
}

/**
 * The paper plane that opens your chats, with the number of chats that have
 * something new (Instagram's count; a muted chat never counts). The same
 * button sits on Community, Feed and Profile.
 *
 * `plain` is the bare icon for a page header. `tile` puts it on the pale
 * rounded square the Feed's mark and sound button wear, so it reads over a
 * clip, a bright sky or a written post scrolling underneath.
 */
export function InboxButton({ variant = 'plain', size = 24, ink, style, coaching = false }: {
  variant?: 'plain' | 'tile';
  size?: number;
  /** The icon's colour; the page's text colour unless given. */
  ink?: string;
  style?: StyleProp<ViewStyle>;
  /**
   * On the Coaching tab (Oct 5, owner): opens your chats on Coaches (Clients, for a coach), and
   * its number counts only those chats, so it matches where it takes you.
   */
  coaching?: boolean;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const { conversations, users, currentUserId, currentUser, blockedIds } = useApp();
  const coach = !!currentUser?.isCoach;
  const unread = coaching
    ? conversations.filter((c) => {
      if (isGroupChat(c) || isMuted(c) || !(c.unreadCount > 0 || c.markedUnread) || blockedDirect(c, currentUserId, blockedIds)) return false;
      const other = users.find((u) => u.id === c.participantIds.find((id) => id !== currentUserId));
      return !!other && (coach ? !other.isCoach : !!other.isCoach);
    }).length
    : unreadChatCount(conversations, currentUserId, blockedIds);
  const tile = variant === 'tile';
  // At least 44 points to aim at, however small the icon is drawn.
  const box = tile ? 40 : size + 8;
  const slop = Math.max(8, Math.ceil((44 - box) / 2));
  return (
    <Tappable
      accessibilityRole="link"
      accessibilityLabel={unread ? `Messages, ${unread} unread` : 'Messages'}
      onPress={() => router.push(coaching ? { pathname: '/messages', params: { section: coach ? 'clients' : 'coaches' } } : '/messages')}
      hitSlop={slop}
      style={[tile ? styles.tile : styles.plain, style]}
    >
      <Ionicons name={unread ? 'paper-plane' : 'paper-plane-outline'} size={tile ? 21 : size} color={ink ?? colors.text} />
      <UnreadBadge count={unread} style={tile ? styles.tileBadge : undefined} />
    </Tappable>
  );
}

/**
 * The bell that opens your notifications, with how many are new. On Profile
 * and, since Oct 4 (owner), on Community too, the page the app opens on, so
 * new likes and follows are seen without going looking.
 */
export function NotificationButton({ size = 24 }: { size?: number }) {
  const styles = useThemedStyles(styleDefinitions);
  const { notifications, currentUserId, currentUser, blockedIds } = useApp();
  // CourtSide's own welcome counts too, until Notifications is first opened (welcomeNote).
  const welcome = useWelcomeNote(currentUser);
  // Never anything from someone you blocked (the Notifications page leaves those out too).
  const unseen = notifications.filter((n) => n.userId === currentUserId && !n.read && !blockedIds.includes(n.actorId)).length + (welcome.unread ? 1 : 0);
  const slop = Math.max(8, Math.ceil((44 - (size + 8)) / 2));
  return (
    <Tappable accessibilityRole="link" accessibilityLabel={unseen ? `Notifications, ${unseen} new` : 'Notifications'} onPress={() => router.push('/notifications')} hitSlop={slop} style={styles.plain}>
      <Ionicons name={unseen ? 'notifications' : 'notifications-outline'} size={size} color={colors.text} />
      <UnreadBadge count={unseen} />
    </Tappable>
  );
}

const styleDefinitions = StyleSheet.create({
  plain: { padding: 4 },
  // The Feed's tile: nearly solid page colour with a hairline, so it holds on anything.
  tile: { width: 40, height: 40, borderRadius: 12, backgroundColor: `${colors.bg}E6`, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: -1, right: -2, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.bg },
  tileBadge: { top: -6, right: -6 },
  badgeText: { ...typography.caption, fontSize: 10, color: colors.brandInk },
});
