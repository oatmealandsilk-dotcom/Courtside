import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { goBack } from '@/lib/goBack';
import { Ionicons } from '@expo/vector-icons';

import { LevelPill } from '@/components/LevelPill';
import { PostCard } from '@/components/PostCard';
import { Tappable } from '@/components/Tappable';
import { Avatar, Button, Card, Chip, EmptyState, Screen, StatTile } from '@/components/ui';
import { evaluateAchievements, playStyleLabel, tierColor } from '@/lib/badges';
import { compactNumber, formatDate } from '@/lib/format';
import { useApp } from '@/store/AppContext';
import { colors, radius, spacing, typography } from '@/theme';

export default function UserProfile() {
  const styles = useThemedStyles(styleDefinitions);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { users, posts, coaches, currentUserId, followingIds, mutedIds, blockedIds, alertIds, actions } = useApp();
  const [menuOpen, setMenuOpen] = useState(false);
  const [notice, setNotice] = useState('');

  const user = users.find((u) => u.id === id);

  if (!user) {
    return (
      <Screen title="Player" compactTitle onBack={() => goBack()}>
        <EmptyState icon="person-outline" title="No such player" />
      </Screen>
    );
  }

  const isMe = currentUserId === user.id;
  const following = followingIds.includes(user.id);
  const muted = mutedIds.includes(user.id);
  const blocked = blockedIds.includes(user.id);
  const alerts = alertIds.includes(user.id);
  const coach = coaches.find((c) => c.userId === user.id);
  const theirPosts = posts
    .filter((p) => p.authorId === user.id && !p.archived)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const unlocked = evaluateAchievements(user).filter((a) => a.unlocked);

  const say = (text: string) => {
    setNotice(text);
    setTimeout(() => setNotice(''), 2200);
  };

  const menu: { icon: keyof typeof Ionicons.glyphMap; label: string; danger?: boolean; onPress: () => void }[] = blocked
    ? [{ icon: 'checkmark-circle-outline', label: 'Unblock', onPress: () => { actions.toggleBlock(user.id); say(`Unblocked ${user.name}`); } }]
    : [
        { icon: following ? 'person-remove-outline' : 'person-add-outline', label: following ? 'Unfollow' : 'Follow', onPress: () => actions.toggleFollow(user.id) },
        { icon: alerts ? 'notifications-off-outline' : 'notifications-outline', label: alerts ? 'Turn off notifications' : 'Turn on notifications', onPress: () => { actions.toggleAlerts(user.id); say(alerts ? 'You will not be told about new posts' : `You will be told when ${user.name.split(' ')[0]} posts`); } },
        { icon: muted ? 'volume-high-outline' : 'volume-mute-outline', label: muted ? 'Unmute' : 'Mute', onPress: () => { actions.toggleMute(user.id); say(muted ? 'Posts are back in your feed' : 'Posts hidden from your feed'); } },
        { icon: 'flag-outline', label: 'Report', danger: true, onPress: () => { actions.reportUser(user.id, 'profile'); say('Thanks — a person will review this'); } },
        { icon: 'ban-outline', label: 'Block', danger: true, onPress: () => { actions.toggleBlock(user.id); say(`Blocked ${user.name}`); } },
      ];

  return (
    <Screen
      title={user.name}
      compactTitle
      onBack={() => goBack()}
      right={
        isMe ? undefined : (
          <Tappable accessibilityLabel="More options" onPress={() => setMenuOpen(true)} hitSlop={10} style={styles.more}>
            <Ionicons name="ellipsis-horizontal" size={24} color={colors.text} />
          </Tappable>
        )
      }
    >
      <Card style={styles.identity}>
        <View style={styles.identityRow}>
          <Avatar name={user.name} seed={user.avatarSeed} size={62} ring={user.isCoach} />
          <View style={styles.identityText}>
            <Text style={styles.name}>{user.name}</Text>
            <Text style={styles.handle}>
              @{user.handle} · {user.location}
            </Text>
            <View style={styles.pillRow}>
              <LevelPill profile={user.profile} small />
              <Chip label={playStyleLabel[user.profile.playStyle]} small />
            </View>
          </View>
        </View>
        <Text style={styles.bio}>{user.bio}</Text>
        <View style={styles.followRow}>
          <Text style={styles.followText}>
            <Text style={styles.followCount}>{compactNumber(user.followers)}</Text> followers
          </Text>
          <Text style={styles.followText}>Joined {formatDate(user.joinedAt)}</Text>
          {muted ? <Text style={styles.followText}>· Muted</Text> : null}
        </View>
        {blocked ? (
          <View style={styles.blockedBox}>
            <Ionicons name="ban-outline" size={18} color={colors.danger} />
            <Text style={styles.blockedText}>You have blocked {user.name.split(' ')[0]}. They cannot see your posts or message you.</Text>
          </View>
        ) : !isMe ? (
          <View style={styles.buttonRow}>
            <View style={{ flex: 1 }}>
              <Button label={following ? 'Following' : 'Follow'} variant={following ? 'secondary' : 'primary'} onPress={() => actions.toggleFollow(user.id)} full />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="Message" variant="secondary" onPress={() => router.push(`/messages/${actions.openConversationWith(user.id)}`)} full />
            </View>
          </View>
        ) : null}
        {coach && !blocked ? (
          <Button label="See coaching services" onPress={() => router.push(`/coach/${coach.id}`)} full />
        ) : null}
      </Card>

      {!!notice && <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text>}

      {blocked ? null : (
        <>
          <View style={styles.tileRow}>
            <StatTile label="Sessions" value={String(user.stats.sessionsLogged)} />
            <StatTile label="Hours" value={String(user.stats.hoursOnCourt)} />
          </View>

          {unlocked.length > 0 ? (
            <Pressable accessibilityRole="button" accessibilityLabel={`${unlocked.length} achievements`} style={styles.achievements}>
              <View style={styles.badgeRow}>
                {unlocked.slice(0, 6).map(({ achievement }) => {
                  const tint = tierColor(achievement.tier);
                  return (
                    <View key={achievement.id} style={[styles.badge, { backgroundColor: `${tint}22`, borderColor: `${tint}66` }]}>
                      <Ionicons name={achievement.icon as keyof typeof Ionicons.glyphMap} size={14} color={tint} />
                    </View>
                  );
                })}
              </View>
              <Text style={styles.achievementText}>
                {unlocked.length} {unlocked.length === 1 ? 'achievement' : 'achievements'}
                {unlocked[0] ? ` · latest: ${unlocked[0].achievement.name}` : ''}
              </Text>
            </Pressable>
          ) : null}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Posts</Text>
            {theirPosts.length === 0 ? (
              <Text style={styles.muted}>Nothing posted yet.</Text>
            ) : (
              <View style={styles.postList}>
                {theirPosts.map((post) => (
                  <PostCard
                    key={post.id}
                    post={post}
                    author={user}
                    liked={Boolean(currentUserId && post.likedBy.includes(currentUserId))}
                    onToggleLike={() => actions.toggleLike(post.id)}
                    onPress={() => router.push({ pathname: '/posts/[userId]', params: { userId: user.id, post: post.id, set: 'own' } })}
                  />
                ))}
              </View>
            )}
          </View>
        </>
      )}

      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        {/* The backdrop is a plain surface, not a button: a button here would
            wrap the menu's buttons, which the web refuses to nest. */}
        <Pressable accessibilityLabel="Close menu" onPress={() => setMenuOpen(false)} style={styles.backdrop}>
          <View style={styles.sheet}>
            <View style={styles.grabber} />
            <Text style={styles.sheetTitle}>{user.name}</Text>
            {menu.map((item, index) => (
              <Pressable
                key={item.label}
                accessibilityRole="button"
                onPress={() => { setMenuOpen(false); item.onPress(); }}
                style={({ pressed }) => [styles.menuRow, index > 0 && styles.menuBorder, pressed && { backgroundColor: colors.surfaceAlt }]}
              >
                <Ionicons name={item.icon} size={21} color={item.danger ? colors.danger : colors.text} />
                <Text style={[styles.menuLabel, item.danger && { color: colors.danger }]}>{item.label}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </Screen>
  );
}

const styleDefinitions = StyleSheet.create({
  more: { padding: 4 },
  identity: { gap: spacing.md },
  identityRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  identityText: { flex: 1, gap: 4 },
  name: { ...typography.title, color: colors.text },
  handle: { ...typography.small, color: colors.textFaint },
  pillRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', paddingTop: 2 },
  bio: { ...typography.small, color: colors.textMuted, lineHeight: 20 },
  followRow: { flexDirection: 'row', gap: spacing.lg, flexWrap: 'wrap' },
  followText: { ...typography.small, color: colors.textFaint },
  followCount: { color: colors.text, fontWeight: '700' },
  buttonRow: { flexDirection: 'row', gap: spacing.sm },
  blockedBox: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.bgElevated,
  },
  blockedText: { ...typography.small, color: colors.textMuted, flex: 1, lineHeight: 19 },
  notice: { ...typography.small, color: colors.brand, textAlign: 'center', paddingVertical: spacing.sm },
  tileRow: { flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.lg },
  achievements: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingVertical: spacing.sm, paddingBottom: spacing.lg,
  },
  badgeRow: { flexDirection: 'row', gap: 4 },
  badge: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  achievementText: { ...typography.small, color: colors.textMuted, flex: 1 },
  section: { gap: spacing.md, paddingBottom: spacing.xl },
  sectionTitle: { ...typography.heading, color: colors.text },
  muted: { ...typography.small, color: colors.textFaint },
  postList: { gap: spacing.lg },
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingBottom: spacing.xxl,
    paddingTop: spacing.sm,
    maxWidth: 520,
    width: '100%',
    alignSelf: 'center',
  },
  grabber: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, alignSelf: 'center', marginBottom: spacing.md },
  sheetTitle: { ...typography.caption, color: colors.textFaint, textAlign: 'center', paddingBottom: spacing.sm },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, paddingHorizontal: spacing.xl, paddingVertical: spacing.lg },
  menuBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  menuLabel: { ...typography.body, color: colors.text },
});
