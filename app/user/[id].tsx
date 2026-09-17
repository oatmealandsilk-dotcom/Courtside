import { useThemedStyles } from '@/theme/ThemeProvider';
import { Image as ExpoImage } from 'expo-image';
import React, { useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { goBack } from '@/lib/goBack';
import { Ionicons } from '@expo/vector-icons';

import { LevelPill } from '@/components/LevelPill';
import { PlayerName } from '@/components/PlayerName';
import { Tappable } from '@/components/Tappable';
import { Avatar, Button, EmptyState, Screen } from '@/components/ui';
import { evaluateAchievements, playStyleLabel, surfaceLabel, tierColor } from '@/lib/badges';
import { compactNumber } from '@/lib/format';
import { useApp } from '@/store/AppContext';
import { colors, radius, spacing, typography } from '@/theme';

const TABS = ['Posts', 'Clips', 'Tagged'] as const;

/**
 * Someone else's profile, laid out like your own: picture in the middle, name
 * and level, followers · following, Follow and Message, their tennis profile
 * card, then a grid of what they have posted. A private account shows only
 * the top until they have let you follow.
 */
export default function UserProfile() {
  const styles = useThemedStyles(styleDefinitions);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { users, posts, coaches, currentUserId, followingIds, followRequests, mutedIds, blockedIds, alertIds, actions } = useApp();
  const [menuOpen, setMenuOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [tab, setTab] = useState<typeof TABS[number]>('Posts');
  const { width: windowWidth } = useWindowDimensions();
  const [gridW, setGridW] = useState(0);
  const tileW = Math.floor((gridW || windowWidth - spacing.lg * 2) / 3);
  const tileH = Math.round((tileW * 4) / 3);

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
  const requested = !!currentUserId && followRequests.some((r) => r.fromId === currentUserId && r.toId === user.id);
  const muted = mutedIds.includes(user.id);
  const blocked = blockedIds.includes(user.id);
  const alerts = alertIds.includes(user.id);
  const coach = coaches.find((c) => c.userId === user.id);
  // What a private account keeps behind the door until they say yes.
  const locked = !!user.isPrivate && !isMe && !following;
  const own = posts.filter((p) => p.authorId === user.id && !p.archived);
  const items = (tab === 'Tagged' ? posts.filter((p) => p.taggedUserIds?.includes(user.id) && !p.archived) : own.filter((p) => tab !== 'Clips' || p.kind === 'clip'))
    .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const counts = { Posts: own.length, Clips: own.filter((p) => p.kind === 'clip').length, Tagged: posts.filter((p) => p.taggedUserIds?.includes(user.id) && !p.archived).length };
  const unlocked = evaluateAchievements(user).filter((a) => a.unlocked);
  const profile = user.profile;

  const say = (text: string) => {
    setNotice(text);
    setTimeout(() => setNotice(''), 2200);
  };

  const followLabel = following ? 'Following' : requested ? 'Requested' : user.isPrivate ? 'Request to follow' : 'Follow';
  const menu: { icon: keyof typeof Ionicons.glyphMap; label: string; danger?: boolean; onPress: () => void }[] = blocked
    ? [{ icon: 'checkmark-circle-outline', label: 'Unblock', onPress: () => { actions.toggleBlock(user.id); say(`Unblocked ${user.name}`); } }]
    : [
        { icon: following ? 'person-remove-outline' : 'person-add-outline', label: following ? 'Unfollow' : requested ? 'Cancel request' : followLabel, onPress: () => actions.toggleFollow(user.id) },
        { icon: alerts ? 'notifications-off-outline' : 'notifications-outline', label: alerts ? 'Turn off notifications' : 'Turn on notifications', onPress: () => { actions.toggleAlerts(user.id); say(alerts ? 'You will not be told about new posts' : `You will be told when ${user.name.split(' ')[0]} posts`); } },
        { icon: muted ? 'volume-high-outline' : 'volume-mute-outline', label: muted ? 'Unmute' : 'Mute', onPress: () => { actions.toggleMute(user.id); say(muted ? 'Posts are back in your feed' : 'Posts hidden from your feed'); } },
        { icon: 'flag-outline', label: 'Report', danger: true, onPress: () => { actions.reportUser(user.id, 'profile'); say('Thanks — a person will review this'); } },
        { icon: 'ban-outline', label: 'Block', danger: true, onPress: () => { actions.toggleBlock(user.id); say(`Blocked ${user.name}`); } },
      ];

  return (
    <Screen
      title={`@${user.handle}`}
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
      <View style={styles.identity}>
        <Avatar name={user.name} seed={user.avatarSeed} uri={user.avatarUrl} size={92} ring={user.isCoach} style={{ backgroundColor: colors.brand, alignSelf: 'center' }} />
        <View style={styles.nameRow}>
          <PlayerName userId={user.id} style={styles.name}>{user.name}</PlayerName>
          {user.isPrivate ? <Ionicons name="lock-closed" size={14} color={colors.textMuted} /> : null}
          <LevelPill profile={profile} />
        </View>
        {!!user.bio && <Text style={styles.bio}>{user.bio}</Text>}
        {!!user.location && <Text style={styles.meta}>{user.location}</Text>}
        <View style={styles.followRow}>
          {([['followers', user.followers, 'followers'], ['following', user.following, 'following']] as const).map(([which, n, label], i) => (
            <React.Fragment key={which}>
              {i > 0 && <Text style={styles.followDot}>·</Text>}
              <Pressable accessibilityRole="link" accessibilityLabel={`${n} ${label}`} disabled={locked} onPress={() => router.push({ pathname: '/follows', params: { userId: user.id, tab: which } })} style={styles.follow}>
                <Text style={styles.followCount}>{compactNumber(Number(n))}</Text><Text style={styles.meta}> {label}</Text>
              </Pressable>
            </React.Fragment>
          ))}
          {muted ? <Text style={styles.meta}>· Muted</Text> : null}
        </View>
        {blocked ? (
          <View style={styles.blockedBox}>
            <Ionicons name="ban-outline" size={18} color={colors.danger} />
            <Text style={styles.blockedText}>You have blocked {user.name.split(' ')[0]}. They cannot see your posts or message you.</Text>
          </View>
        ) : !isMe ? (
          <View style={styles.buttons}>
            <View style={{ flex: 1 }}>
              <Button label={followLabel} variant={following || requested ? 'secondary' : 'primary'} onPress={() => actions.toggleFollow(user.id)} full />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="Message" variant="secondary" onPress={() => router.push(`/messages/${actions.openConversationWith(user.id)}`)} full />
            </View>
          </View>
        ) : (
          <View style={styles.buttons}><View style={{ flex: 1 }}><Button label="Edit Profile" variant="secondary" onPress={() => router.push('/edit-profile')} full /></View></View>
        )}
        {coach && !blocked && !locked ? (
          <Button label="See coaching services" onPress={() => router.push(`/coach/${coach.id}`)} full />
        ) : null}
      </View>

      {!!notice && <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text>}

      {blocked ? null : locked ? (
        <View style={styles.lockedBox}>
          <Ionicons name="lock-closed-outline" size={26} color={colors.textMuted} />
          <Text style={styles.lockedTitle}>This account is private</Text>
          <Text style={styles.lockedBody}>{requested ? `Your request is with ${user.name.split(' ')[0]}. Once they say yes, their posts, hits and tennis profile show up here.` : `Follow ${user.name.split(' ')[0]} to see their posts, hits and tennis profile.`}</Text>
        </View>
      ) : (
        <>
          <Pressable accessibilityRole="link" accessibilityLabel={`${user.name}'s tennis profile`} onPress={() => router.push({ pathname: '/profile-details', params: { userId: user.id } })} style={styles.tennis}>
            <View style={styles.eyebrowRow}><Text style={styles.eyebrow}>TENNIS PROFILE</Text><Ionicons name="chevron-forward" size={14} color={colors.textFaint} /></View>
            <View style={styles.details}>
              {[['Style', playStyleLabel[profile.playStyle]], ['Surface', surfaceLabel[profile.preferredSurface]], ['Sessions', `${user.stats.sessionsLogged} logged`], ['Hours on court', String(user.stats.hoursOnCourt)]].map(([label, value]) => (
                <View key={label} style={styles.detail}><Text style={styles.meta}>{label}</Text><Text style={styles.value}>{value}</Text></View>
              ))}
            </View>
            {unlocked.length > 0 ? (
              <View style={styles.achievements}>
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
              </View>
            ) : null}
          </Pressable>

          <View style={styles.tabs}>
            {TABS.map((t) => (
              <Pressable key={t} accessibilityRole="tab" accessibilityState={{ selected: tab === t }} accessibilityLabel={`${t}, ${counts[t]}`} onPress={() => setTab(t)} style={[styles.tab, tab === t && styles.tabOn]}>
                <Text style={{ color: tab === t ? colors.brand : colors.textMuted, fontWeight: tab === t ? '700' : '400' }}>{t}<Text style={[styles.tabCount, tab === t && { color: colors.brand }]}>  {compactNumber(counts[t])}</Text></Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.grid} onLayout={(e) => { const w = Math.floor(e.nativeEvent.layout.width); if (w > 0 && w !== gridW) setGridW(w); }}>
            {items.map((p) => (
              <Pressable key={p.id} accessibilityRole="link" accessibilityLabel={`Open ${p.kind}: ${p.body}`} onPress={() => router.push({ pathname: '/posts/[userId]', params: { userId: user.id, post: p.id, set: tab === 'Clips' ? 'clips' : tab === 'Tagged' ? 'tagged' : 'own' } })} style={[styles.tile, { width: tileW, height: tileH }]}>
                <View style={[StyleSheet.absoluteFill, styles.tileBlank]}><Text numberOfLines={5} style={styles.tileText}>{p.body}</Text></View>
                {p.thumbnailUrl ? <ExpoImage accessibilityIgnoresInvertColors source={{ uri: p.thumbnailUrl }} style={StyleSheet.absoluteFill} contentFit="cover" recyclingKey={p.id} transition={120} /> : null}
                {p.kind === 'clip' && <Ionicons name="play" size={14} color="#FFFFFF" style={styles.tilePlay} />}
                {p.pinned && tab !== 'Tagged' && <Ionicons name="pin" size={13} color="#FFFFFF" style={styles.tilePin} />}
              </Pressable>
            ))}
          </View>
          {!items.length && <EmptyState title={tab === 'Tagged' ? 'No tagged posts yet' : `No ${tab.toLowerCase()} yet`} body="Their shared moments will appear here." />}
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
  identity: { gap: 10, paddingTop: 10, paddingBottom: 20, paddingHorizontal: 12, alignItems: 'center' },
  nameRow: { flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', marginTop: 4 },
  name: { fontSize: 20, fontWeight: '700', color: colors.text },
  bio: { fontSize: 14, lineHeight: 21, color: colors.textMuted, textAlign: 'center', maxWidth: 320 },
  meta: { fontSize: 12, color: colors.textMuted, lineHeight: 19 },
  followRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  follow: { flexDirection: 'row', alignItems: 'baseline' },
  followCount: { fontSize: 15, fontWeight: '700', color: colors.text },
  followDot: { color: colors.textFaint, fontSize: 14 },
  buttons: { flexDirection: 'row', gap: 8, alignSelf: 'stretch', marginTop: 6 },
  blockedBox: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, alignSelf: 'stretch',
    padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.bgElevated,
  },
  blockedText: { ...typography.small, color: colors.textMuted, flex: 1, lineHeight: 19 },
  notice: { ...typography.small, color: colors.brand, textAlign: 'center', paddingVertical: spacing.sm },
  lockedBox: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxl, paddingHorizontal: spacing.xl },
  lockedTitle: { ...typography.heading, color: colors.text },
  lockedBody: { ...typography.small, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
  tennis: { padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.surface, gap: 8 },
  eyebrow: { letterSpacing: 1.2, fontSize: 11, fontWeight: '700', color: colors.textMuted },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  details: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  detail: { width: '46%', gap: 2 },
  value: { fontSize: 13, color: colors.text, lineHeight: 19 },
  achievements: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingTop: spacing.xs },
  badgeRow: { flexDirection: 'row', gap: 4 },
  badge: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  achievementText: { ...typography.small, color: colors.textMuted, flex: 1 },
  tabs: { flexDirection: 'row', marginTop: 16, borderBottomWidth: 2, borderBottomColor: colors.border },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 18, marginBottom: -2, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabOn: { borderBottomColor: colors.brand },
  tabCount: { fontSize: 12, fontWeight: '600', color: colors.textFaint },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: 0, minHeight: 120, paddingBottom: spacing.xl },
  tile: { borderWidth: 1, borderColor: colors.bg, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  tileBlank: { padding: 10, justifyContent: 'center' },
  tileText: { fontSize: 11, lineHeight: 15, color: colors.textMuted },
  tilePlay: { position: 'absolute', top: 6, right: 6, textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 3 },
  tilePin: { position: 'absolute', top: 6, left: 6, textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 3 },
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
