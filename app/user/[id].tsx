import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { show as showToast } from '@/lib/toast';
import { Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { RisingSheet } from '@/components/RisingSheet';
import { router, useLocalSearchParams } from 'expo-router';
import { goBack } from '@/lib/goBack';
import { requestSection } from '@/features/navigation/swipeOrder';
import { goToTab } from '@/features/navigation/startTab';
import Ionicons from '@expo/vector-icons/Ionicons';

import { LevelPill } from '@/components/LevelPill';
import { SectionPager } from '@/components/SectionPager';
import Reanimated from 'react-native-reanimated';
import { useTabUnderline } from '@/features/navigation/useTabUnderline';
import { TileCover } from '@/components/TileCover';
import { CarouselMark } from '@/components/CarouselMark';
import { SessionTile } from '@/components/session/SessionTile';
import { hasSessionStats } from '@/features/activity/format';
import { PlayerName } from '@/components/PlayerName';
import { StreakFlame } from '@/components/StreakFlame';
import { shownStreak } from '@/features/practice/streakFlame';
import { Tappable } from '@/components/Tappable';
import { Avatar, Button, EmptyState, Screen } from '@/components/ui';
import { PlayerCard } from '@/components/tennis/PlayerCard';
import { compactNumber } from '@/lib/format';
import { TileViews } from '@/components/TileViews';
import { TilePin } from '@/components/TilePin';
import { TileRemoved } from '@/features/moderation/RemovedNote';
import { SuggestedPlayers } from '@/components/SuggestedPlayers';
import { HeadToHeadCard } from '@/components/HeadToHeadCard';
import { PartnerStreakCard, PartnerStreakLine } from '@/components/PartnerStreak';
import { LESS_AI, LESS_AI_ROUND2 } from '@/theme/look';
import { useApp } from '@/store/AppContext';
import { buttonShape, colors, radius, spacing, typography, font } from '@/theme';
import { TextScale, oneLine } from '@/theme/textScale';
import { useStillLoading } from '@/lib/useStillLoading';
import { useArrived } from '@/lib/useArrived';
import { useMessageReady } from '@/features/messages/useMessageReady';
import type { Post } from '@/data/types';
import { afterMenu, confirmBlock, confirmReport, confirmUnfollow } from '@/lib/confirm';
import { afterReport } from '@/features/moderation/reportThanks';
import { CourtSpinner } from '@/components/CourtSpinner';
import { ProfileSkeleton } from '@/components/Skeleton';
import { isDesktopBrowser } from '@/lib/browserDevice';
import { isTaggedIn } from '@/features/activity/sessionTags';
import { publicRoute } from '@/features/share/publicRoute';
import { useModalSheetBottom } from '@/lib/modalSheet';

// Activity (Oct 24, owner): their posts that carry a hit's or a match's numbers, as on your own profile.
const TABS = ['Posts', 'Activity', 'Clips', 'Tagged'] as const; // Activity second (Oct 25, owner: yes to All · Activity · Clips · Tagged).

/**
 * Someone else's profile, laid out like your own: picture in the middle, name
 * and level, followers · following, Follow and Message, their tennis profile
 * card, then a grid of what they have posted. A private account shows only
 * the top until they have let you follow.
 */
/** A player who is gone is not a dead end: on to Find Players. */
const findPlayers = { label: 'Find players', onPress: () => { requestSection('/discuss', 'players'); goToTab('/discuss'); } };

function UserProfile() {
  const styles = useThemedStyles(styleDefinitions);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { users, posts, coaches, currentUser, currentUserId, followingIds, followRequests, mutedIds, blockedIds, alertIds, actions } = useApp();
  const loading = useStillLoading();
  // Their posts come in when their profile is opened, so the grid and the
  // counts are whole however old the posts are.
  useEffect(() => { if (id) void actions.loadPostsOf(id); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  // Their next tournament shows on the banner only while you follow each other (migration 123): asked again on
  // opening, as their Tennis profile does, so an unfollow since the app opened hides it.
  const otherId = id && id !== currentUserId ? id : null;
  const { loadTournamentPlans } = actions;
  useEffect(() => { if (otherId) void loadTournamentPlans(); }, [otherId, loadTournamentPlans]);
  // Message's server check, asked as the page opens, so the tap is not kept waiting on it (useMessageReady).
  useMessageReady(otherId && !blockedIds.includes(otherId) ? otherId : null);
  const [menuOpen, setMenuOpen] = useState(false);
  // Message waits on a server check; a second tap meanwhile must not open the chat twice.
  const opening = useRef(false);
  const [openingChat, setOpeningChat] = useState(false);
  // The menu clears Android's navigation bar, and a message meanwhile shows as the phone's own alert (modalSheet).
  const menuBottom = useModalSheetBottom(menuOpen, spacing.xxl);
  const [notice, setNotice] = useState('');
  const [tab, setTab] = useState<typeof TABS[number]>('Posts');
  // The green line under Posts / Clips / Tagged rides with the swipe and glides on a tap, as on your own profile (Oct 22).
  const [tabWidth, setTabWidth] = useState(0);
  const underline = useTabUnderline(TABS.indexOf(tab), TABS.length, tabWidth);
  const { width: windowWidth } = useWindowDimensions();
  const [gridW, setGridW] = useState(0);
  const tileW = Math.floor((gridW || windowWidth - spacing.lg * 2) / 3);
  const tileH = Math.round((tileW * 4) / 3);

  const user = users.find((u) => u.id === id);
  const userId = user?.id;

  // Their four grids' posts, worked out once each time their posts change, as your own Profile
  // does, not twice per grid on every redraw (Oct 24, owner: "Buttons need to be way more
  // responsive. They are way to delayed when I click them"): a page can only start to slide in
  // once all of it is built.
  const lists = useMemo(() => {
    if (!userId) return { Posts: [], Clips: [], Activity: [], Tagged: [] } as Record<(typeof TABS)[number], Post[]>;
    const newestFirst = (a: Post, b: Post) => Number(!!b.pinned) - Number(!!a.pinned) || Date.parse(b.createdAt) - Date.parse(a.createdAt);
    // A post shared to a group lives in that group's feed only (migration 67).
    const own = posts.filter((p) => p.authorId === userId && !p.archived && !p.groupId);
    return {
      Posts: [...own].sort(newestFirst),
      Clips: own.filter((p) => p.kind === 'clip').sort(newestFirst),
      Activity: own.filter((p) => !!p.session && hasSessionStats(p.session)).sort(newestFirst),
      Tagged: posts.filter((p) => isTaggedIn(p, userId) && !p.archived && !p.groupId).sort(newestFirst),
    } as Record<(typeof TABS)[number], Post[]>;
  }, [posts, userId]);

  // The grid you open on is built with the page; the other three once it has slid in (useArrived),
  // off screen beside it, so nothing shows filling in. Each stays built once it has been.
  const arrived = useArrived();
  const built = useRef(new Set<(typeof TABS)[number]>()).current;
  built.add(tab);
  if (arrived) TABS.forEach((t) => built.add(t));
  const builtKey = TABS.filter((t) => built.has(t)).join();

  const grid = (section: (typeof TABS)[number]) => {
    const items = lists[section];
    return (
        <View style={{ minHeight: 320 }}>
            <View style={styles.grid} onLayout={(e) => { const w = Math.floor(e.nativeEvent.layout.width); if (w > 0 && w !== gridW) setGridW(w); }}>
              {items.map((p) => (
                <Pressable key={p.id} accessibilityRole="link" accessibilityLabel={`Open ${p.pinned && section !== 'Tagged' ? 'pinned ' : ''}${p.kind}: ${p.body}`} onPress={() => router.push({ pathname: '/posts/[userId]', params: { userId: userId ?? '', post: p.id, set: section === 'Clips' ? 'clips' : section === 'Activity' ? 'activity' : section === 'Tagged' ? 'tagged' : 'own' } })} style={[styles.tile, { width: tileW, height: tileH }]}>
                  <View style={[StyleSheet.absoluteFill, styles.tileBlank]}><Text numberOfLines={5} style={styles.tileText}>{p.body}</Text></View>
                  {p.thumbnailUrl ? <TileCover accessibilityIgnoresInvertColors uri={p.thumbnailUrl} style={StyleSheet.absoluteFill} contentFit="cover" recyclingKey={p.id} transition={120} /> : p.session && hasSessionStats(p.session) && !p.imageUrl && !p.videoUrl ? <SessionTile session={p.session} width={tileW} /> : null}
                  {/* Several photos: the stacked mark, where a clip has its play mark. */}
                  <CarouselMark post={p} />
                  {/* White on a picture or a session tile; on the pale text tile, the muted ink, so it still shows. */}
                  {p.kind === 'clip' && (() => { const bare = !p.thumbnailUrl && !(p.session && hasSessionStats(p.session) && !p.imageUrl && !p.videoUrl); return <Ionicons name="play" size={14} color={bare ? colors.textMuted : '#FFFFFF'} style={[styles.tilePlay, bare && styles.tilePlayFlat]} />; })()}
                  {(p.videoUrl || p.kind === 'clip') && (p.views ?? 0) > 0 ? <TileViews views={p.views ?? 0} /> : null}
                  {/* Pinned, top left; the tile's own label says "pinned" to a screen reader. */}
                  {p.pinned && section !== 'Tagged' ? <TilePin /> : null}
                  {/* Taken down (migration 108): only admins ever see someone else's, dimmed and marked. */}
                  {p.removed ? <TileRemoved /> : null}
                </Pressable>
              ))}
            </View>
            {!items.length && <EmptyState title={section === 'Tagged' ? 'No tagged posts yet' : section === 'Activity' ? 'No activity yet' : `No ${section.toLowerCase()} yet`} body={section === 'Activity' ? 'Hits and matches they post with their stats show up here.' : 'Their shared moments will appear here.'} />}
        </View>
    );
  };
  // Built again only when what they show changes, not on every redraw of the page (a Follow, the menu).
  const panes = useMemo(
    () => TABS.map((section) => (built.has(section) ? grid(section) : <View style={{ minHeight: 320 }} />)),
    [lists, builtKey, gridW, tileW, tileH, styles, userId], // eslint-disable-line react-hooks/exhaustive-deps
  );

  if (!user) {
    return (
      <Screen title="Player" compactTitle onBack={() => goBack()}>
        {loading ? <ProfileSkeleton /> : <EmptyState icon="person-outline" title="No such player" body="They may have deleted their account." action={findPlayers} />}
      </Screen>
    );
  }

  const isMe = currentUserId === user.id;
  // A suspended account shows nothing but that it is unavailable (its posts are hidden by the
  // database too, migration 115). Admins still see it whole, to review and lift the suspension.
  if (user.suspended && !isMe && !currentUser?.isAdmin) {
    return (
      <Screen title="Player" compactTitle onBack={() => goBack()}>
        <EmptyState icon="person-outline" title="This account is unavailable" body="You can’t see this account right now." action={findPlayers} />
      </Screen>
    );
  }
  const following = followingIds.includes(user.id);
  const requested = !!currentUserId && followRequests.some((r) => r.fromId === currentUserId && r.toId === user.id);
  const muted = mutedIds.includes(user.id);
  const blocked = blockedIds.includes(user.id);
  const alerts = alertIds.includes(user.id);
  const coach = coaches.find((c) => c.userId === user.id);
  // What a private account keeps behind the door until they say yes.
  const locked = !!user.isPrivate && !isMe && !following;
  const counts = { Posts: lists.Posts.length, Clips: lists.Clips.length, Activity: lists.Activity.length, Tagged: lists.Tagged.length };
  const profile = user.profile;

  const say = (text: string) => {
    setNotice(text);
    setTimeout(() => setNotice(''), 2200);
  };

  // One word, as on every app: a private account's Follow sends an ask, and the button then says so.
  const followLabel = following ? 'Following' : requested ? 'Requested' : 'Follow';
  // Unblock, notifications and mute announce themselves, in a toast with Undo.
  const menu: { icon: keyof typeof Ionicons.glyphMap; label: string; danger?: boolean; onPress: () => void }[] = blocked
    ? [{ icon: 'checkmark-circle-outline', label: 'Unblock', onPress: () => actions.toggleBlock(user.id) }]
    : [
        { icon: following ? 'person-remove-outline' : 'person-add-outline', label: following ? 'Unfollow' : requested ? 'Cancel request' : followLabel, onPress: following ? () => confirmUnfollow(user, () => actions.toggleFollow(user.id), true) : () => actions.toggleFollow(user.id) },
        { icon: alerts ? 'notifications-off-outline' : 'notifications-outline', label: alerts ? 'Turn off notifications' : 'Turn on notifications', onPress: () => actions.toggleAlerts(user.id) },
        // Instagram's two: their profile into any of your chats, or them into one of your groups. Each opens its sheet once this menu has gone.
        { icon: 'paper-plane-outline', label: 'Send profile…', onPress: () => afterMenu(() => router.push({ pathname: '/share', params: { kind: 'profile', id: user.id } })) },
        { icon: 'people-outline', label: 'Add to group…', onPress: () => afterMenu(() => router.push({ pathname: '/pick-group', params: { user: user.id } })) },
        { icon: muted ? 'volume-high-outline' : 'volume-mute-outline', label: muted ? 'Unmute' : 'Mute', onPress: () => actions.toggleMute(user.id) },
        // Asked first, the same question as everywhere else; then thanks, with Block offered too.
        { icon: 'flag-outline', label: 'Report', danger: true, onPress: () => confirmReport('profile', () => afterReport(actions.reportUser(user.id, `profile:${user.id}`), user, actions), true) },
        { icon: 'ban-outline', label: 'Block', danger: true, onPress: () => confirmBlock(user, () => { if (!actions.isBlocked(user.id)) actions.toggleBlock(user.id); say(`Blocked ${user.name}`); }, true) },
      ];

  return (
    <Screen
      onRefresh={isDesktopBrowser() ? undefined : actions.refresh}
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
      <View style={[styles.identity, LESS_AI_ROUND2 && styles.identityLeft]}>
        {LESS_AI_ROUND2 ? (
          // Left-aligned like your own Profile (Oct 25, "D all for less ai", item 12): the picture at the left, the name
          // and level beside it, the bio and counts under, rather than everything centred like a landing page.
          <View style={styles.identityRow}>
            <Avatar name={user.name} seed={user.avatarSeed} uri={user.avatarUrl} size={80} ring={user.isCoach} style={{ backgroundColor: colors.brand }} />
            <View style={styles.identityWords}>
              <View style={styles.nameLine}>
                <PlayerName userId={user.id} style={[styles.name, styles.nameLeft]}>{user.name}</PlayerName>
                <StreakFlame days={shownStreak(user, currentUserId)} size="large" />
              </View>
              <View style={styles.levelRow}>
                {user.isPrivate ? <Ionicons name="lock-closed" size={14} color={colors.textMuted} /> : null}
                <LevelPill profile={profile} />
              </View>
            </View>
          </View>
        ) : <>
        <Avatar name={user.name} seed={user.avatarSeed} uri={user.avatarUrl} size={92} ring={user.isCoach} style={{ backgroundColor: colors.brand, alignSelf: 'center' }} />
        <View style={styles.nameRow}>
          {/* The name and, close after it, their streak's flame (3 days or more). */}
          <View style={styles.nameLine}>
            <PlayerName userId={user.id} style={styles.name}>{user.name}</PlayerName>
            <StreakFlame days={shownStreak(user, currentUserId)} size="large" />
          </View>
          {user.isPrivate ? <Ionicons name="lock-closed" size={14} color={colors.textMuted} /> : null}
          <LevelPill profile={profile} />
        </View>
        </>}
        {!!user.bio && <Text style={[styles.bio, LESS_AI_ROUND2 && styles.bioLeft]}>{user.bio}</Text>}
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
        {/* gap: the identity block's own gap (10), carried inside the line's fold. */}
        {/* Your streak with them as one line (item 12), in place of the card under Head to head. */}
        {(LESS_AI || LESS_AI_ROUND2) && !isMe && !blocked ? <PartnerStreakLine userId={user.id} gap={LESS_AI_ROUND2 ? 12 : 10} left={LESS_AI_ROUND2} /> : null}
        {blocked ? (
          <View style={styles.blockedBox}>
            <Ionicons name="ban-outline" size={18} color={colors.danger} />
            <Text style={styles.blockedText}>You have blocked {user.name.split(' ')[0]}. They cannot see your posts or message you.</Text>
          </View>
        ) : !isMe ? (
          <View style={styles.buttons}>
            <View style={{ flex: 1 }}>
              <Button label={followLabel} variant={following || requested ? 'secondary' : 'primary'} onPress={following ? () => confirmUnfollow(user, () => actions.toggleFollow(user.id)) : () => actions.toggleFollow(user.id)} full size="sm" />
            </View>
            <View style={{ flex: 1 }}>
              {/* Locked, it asks the server again first (they may have followed you
                  since the app opened), then says why in a note that stays to be read. */}
              <Button label="Message" variant="secondary" onPress={async () => { if (opening.current) return; opening.current = true; setOpeningChat(true); try { const lock = await actions.messageLock(user.id); if (lock) { showToast({ title: lock, icon: 'lock-closed-outline', long: true }); return; } router.push(`/messages/${actions.openConversationWith(user.id)}`); } finally { opening.current = false; setOpeningChat(false); } }} loading={openingChat} full size="sm" />
            </View>
          </View>
        ) : (
          <View style={styles.buttons}><View style={{ flex: 1 }}><Button label="Edit profile" variant="secondary" onPress={() => router.push('/edit-profile')} full size="sm" style={{ minHeight: buttonShape.profileHeight }} /></View></View>
        )}
        {coach && !blocked && !locked ? (
          <Button label="See coaching services" onPress={() => router.push(`/coach/${coach.id}`)} full />
        ) : null}
      </View>

      {!!notice && <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text>}

      {/* Your record against them, from scored matches you are both confirmed on (migration 91); nothing with none, or with a block. */}
      {!isMe && !blocked ? <HeadToHeadCard userId={user.id} name={user.name} /> : null}
      {/* Your weekly streak with them (sweep R12, migration 180): only the two of you see it, and only while the teen rules let you see each other. */}
      {!isMe && !blocked ? <PartnerStreakCard userId={user.id} name={user.name} /> : null}

      {blocked ? null : locked ? (
        <>
          <View style={styles.lockedBox}>
            <Ionicons name="lock-closed-outline" size={26} color={colors.textMuted} />
            <Text style={styles.lockedTitle}>This account is private</Text>
            <Text style={styles.lockedBody}>{requested ? `Requested. You’ll see their posts once ${user.name.split(' ')[0]} accepts.` : 'Follow to see their posts.'}</Text>
          </View>
          {/* Players you might know, so a private account's page is never just a lock. */}
          <SuggestedPlayers near={user.location} exclude={[user.id]} />
        </>
      ) : (
        <>
          {/* Their tennis, as the player card's banner: the whole of it opens their Tennis profile. */}
          <PlayerCard user={user} variant="banner" onPress={() => router.push(isMe ? { pathname: '/profile-details' } : { pathname: '/profile-details', params: { userId: user.id } })} />

          <View style={styles.tabs} onLayout={(e) => setTabWidth(e.nativeEvent.layout.width / TABS.length)}>
            {TABS.map((t) => (
              <Pressable key={t} accessibilityRole="tab" accessibilityState={{ selected: tab === t }} accessibilityLabel={`${t}, ${counts[t]}`} onPress={() => setTab(t)} style={styles.tab}>
                <Text {...oneLine(TextScale.TITLE)} style={{ color: tab === t ? colors.brand : colors.textMuted, ...font(tab === t ? '700' : '400') }}>{t}<Text style={[styles.tabCount, tab === t && { color: colors.brand }]}>  {compactNumber(counts[t])}</Text></Text>
              </Pressable>
            ))}
            {tabWidth > 0 ? <Reanimated.View pointerEvents="none" style={[styles.tabLine, { width: tabWidth }, underline.style]} /> : null}
          </View>
          {/* Posts, Clips, Activity and Tagged side by side: a swipe slides between them,
              the way your own profile does, instead of landing on a tile as a tap. */}
          <SectionPager index={TABS.indexOf(tab)} panes={panes} progress={underline.progress} depth={1} delegateRight bleed={spacing.lg} onIndex={(i) => setTab(TABS[i])} />
        </>
      )}

      <RisingSheet visible={menuOpen} onClose={() => setMenuOpen(false)} closeLabel="Close menu" sheetStyle={[styles.sheet, { paddingBottom: menuBottom }]}>
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
      </RisingSheet>
    </Screen>
  );
}

const styleDefinitions = StyleSheet.create({
  more: { padding: 4 },
  identity: { gap: 10, paddingTop: 10, paddingBottom: 20, paddingHorizontal: 12, alignItems: 'center' },
  // Left-aligned, as your own Profile sets it (LESS_AI_ROUND2): its gaps, its row of picture and words.
  identityLeft: { gap: 12, paddingTop: 16, paddingHorizontal: 0, alignItems: 'stretch' },
  identityRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  identityWords: { flex: 1, gap: 6, minWidth: 0 },
  levelRow: { flexDirection: 'row', gap: 10, alignItems: 'center', flexWrap: 'wrap' },
  nameLeft: { fontSize: 22 },
  bioLeft: { ...typography.body, lineHeight: 22, color: colors.text, textAlign: 'left', maxWidth: undefined },
  nameRow: { flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', marginTop: 4 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1, minWidth: 0 },
  name: { fontSize: 20, ...font('700'), color: colors.text, flexShrink: 1 },
  bio: { fontSize: 14, lineHeight: 21, color: colors.textMuted, textAlign: 'center', maxWidth: 320 },
  meta: { fontSize: 12, color: colors.textMuted, lineHeight: 19 },
  followRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  follow: { flexDirection: 'row', alignItems: 'baseline' },
  followCount: { fontSize: 15, ...font('700'), color: colors.text },
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
  tabs: { flexDirection: 'row', marginTop: 16, borderBottomWidth: 2, borderBottomColor: colors.border },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 18 },
  // Drawn over the row's grey rule, exactly where the selected tab's own green edge used to sit.
  // 3 pt, as on your own profile (Oct 24: the 2 pt line was too thin to see).
  tabLine: { position: 'absolute', left: 0, bottom: -2, height: 3, backgroundColor: colors.brand, borderRadius: 1.5 },
  tabCount: { fontSize: 12, ...font('600'), color: colors.textFaint },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: 0, minHeight: 120, paddingBottom: spacing.xl },
  tile: { borderWidth: 1, borderColor: colors.bg, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  tileBlank: { padding: 10, justifyContent: 'center' },
  tileText: { fontSize: 11, lineHeight: 15, color: colors.textMuted },
  tilePlay: { position: 'absolute', top: 6, right: 6, textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 3 },
  tilePlayFlat: { textShadowColor: 'transparent', textShadowRadius: 0 },
  tileViews: { position: 'absolute', left: 6, bottom: 5, flexDirection: 'row', alignItems: 'center', gap: 3 },
  tileViewsText: { fontSize: 12, ...font('600'), color: '#FFFFFF', textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 3 },
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

// A link shared outside the app opens here for anyone; signed out, it shows the public look (see SharedPage).
export default publicRoute('profile', UserProfile);
