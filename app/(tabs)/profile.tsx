import { asTabRoute } from '@/features/navigation/tabFocus';
import { isDesktopBrowser } from '@/lib/browserDevice';
import { PlayerName } from '@/components/PlayerName';
import { DEFAULT_THEME, themeList, useTheme, useThemedStyles } from '@/theme/ThemeProvider';
import { ThemeTile } from '@/components/ThemeTile';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onSkippedSaved, readSkipped, type SetupStep } from '@/features/onboarding/setupProgress';
import { Image, Modal, Platform, Pressable, Share, StyleSheet, Text, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import { router } from 'expo-router';
import { GuestJoinCard } from '@/features/guest/GuestFindPlayers';
import { GuestSignIn } from '@/features/guest/GuestSignIn';
import { PhoneAppRow } from '@/features/phoneApp/PhoneAppCard';
import { ConnectCard } from '@/features/activity/ConnectCard';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Avatar, Button, EmptyState, Screen } from '@/components/ui';
import { SectionPager } from '@/components/SectionPager';
import { TileCover } from '@/components/TileCover';
import { CarouselMark } from '@/components/CarouselMark';
import { SessionTile } from '@/components/session/SessionTile';
import { hasSessionStats } from '@/features/activity/format';
import type { Post } from '@/data/types';
import Reanimated, { Easing, cancelAnimation, runOnJS, useAnimatedStyle, useSharedValue, withRepeat, withSpring, withTiming } from 'react-native-reanimated';
import { useTabUnderline } from '@/features/navigation/useTabUnderline';
import { Tappable } from '@/components/Tappable';
import { reportSection, requestSection, subscribeSectionRequest, swipeDestination } from '@/features/navigation/swipeOrder';
import { LevelPill } from '@/components/LevelPill';
import { StreakFlame } from '@/components/StreakFlame';
import { shownStreak } from '@/features/practice/streakFlame';
import { useApp } from '@/store/AppContext';
import { InboxButton, UnreadBadge } from '@/components/InboxButton';
import { unseenCount } from '@/features/activity/found';
import { PlayerCard } from '@/components/tennis/PlayerCard';
import { CardWash, cardLook } from '@/components/session/SessionCard';
import { compactNumber } from '@/lib/format';
import { TileViews } from '@/components/TileViews';
import { TilePin } from '@/components/TilePin';
import { TileRemoved } from '@/features/moderation/RemovedNote';
import { buttonShape, colors, spacing, typography, font, lift, withAlpha } from '@/theme';
import { useTourOpen, useTourTarget } from '@/features/tour/tourStore';
import { wrappedYear } from '@/features/wrapped/yearInTennis';
import { TipBubble } from '@/components/TipBubble';
import { forNewPlayer, useTip, useTipWaiting } from '@/features/tips/tips';
import { useWelcomeNote } from '@/features/welcome/welcomeNote';
import { useFirstMoveDone } from '@/features/onboarding/firstMoveDone';
import { useFirstWeek } from '@/features/onboarding/FirstWeek';
import { notKnownAdult } from '@/features/players/age';
import { useShownAt } from '@/features/navigation/shownAt';
import { useResponsive } from '@/lib/useResponsive';
import { isTaggedIn } from '@/features/activity/sessionTags';
import { studioLine } from '@/features/coaching/studioSummary';
import { useModalOpenWhile } from '@/lib/modalOpen';
import { useReducedMotion } from '@/lib/useReducedMotion';
import * as haptics from '@/lib/haptics';
import { useInstantsOn, withoutInstantRows } from '@/features/stories/instantsSwitch';
import { TextScale, oneLine } from '@/theme/textScale';
import { SwipeArea } from '@/features/navigation/swipePress';
import { corner } from '@/theme/look';

/** Edit profile and Share stand a touch taller than other compact rows (owner, Oct 24). */
const tallButton = { minHeight: buttonShape.profileHeight };

/** The messages tip's pointer from the right edge of the page's content (the header's own right edge): the menu button (38), the gap (14), then half the paper plane (35), less half the pointer (12). */
const INBOX_POINTER = 38 + 14 + 17 - 6;

/** Whether a post of yours belongs in a section of the grid: All has every one, Clips the clips, Activity those carrying a hit's or a match's numbers. */
function inSection(p: Post, section: string): boolean {
  return section === 'Clips' ? p.kind === 'clip' : section === 'Activity' ? !!p.session && hasSessionStats(p.session) : true;
}

function Profile({ previewSection }: { previewSection?: string } = {}) {
  const styles = useThemedStyles(styleDefinitions);
 const { currentUser: user, posts, questions, answers, saved, notifications, detectedActivities, currentUserId, savedAccounts, coaches, coachingRequests, coachQuestions, actions, feedGroups, feedGroupInvites, blockedIds, isGuest } = useApp();
 // A coach's studio, first of your links: what is waiting there, or how far setup has got.
 const myCoach = coaches.find((c) => c.userId === currentUserId);
 const studio = myCoach ? studioLine(myCoach, coachingRequests, coachQuestions, currentUserId) : null;
 // Nothing posted, asked or answered yet, and no move made on the page after setup (a link shared,
 // players followed: firstMoveDone): the profile offers the first move.
 const movedAfterSetup = useFirstMoveDone(currentUserId);
 // "Your first week" (R7, Oct 20 sweep): follow 3, Open to hit, a first session, a first post. While it
 // is up, "Make your first move" waits: the list's first row opens that same page.
 const firstWeek = useFirstWeek();
 const hasMoved = !currentUserId || movedAfterSetup || posts.some((p) => p.authorId === currentUserId) || questions.some((q) => q.authorId === currentUserId) || answers.some((a) => a.authorId === currentUserId);
 // Your own posts, however far back they go: the grid and the counts are
 // yours entirely, not just whichever of them the feed happens to hold.
 useEffect(() => { if (user?.id) void actions.loadPostsOf(user.id); }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
 const { width: windowWidth } = useWindowDimensions();
 // The first time a new player opens Profile on a phone, a tip at the paper plane (Oct 5: it was
 // the tutorial's last tip). Only on this tab, never a picture of it sliding in, never under the tutorial.
 // Whether this tab is on show is asked by the tip itself (InboxTip), not here (see useShownAt).
 const tourOpen = useTourOpen();
 const { isPhone } = useResponsive();
 const inboxTipEligible = isPhone && !tourOpen && previewSection === undefined && forNewPlayer(user?.joinedAt);
 // The section lives here, not in the address (see discuss.tsx for why).
 const [localTab, setLocalTab] = useState<'Posts' | 'Clips' | 'Activity' | 'Tagged'>('Posts');
 const section = previewSection ?? localTab;
 const tab = section === 'Clips' || section === 'Activity' || section === 'Tagged' ? section : 'Posts';
 const setTab = (next: string) => setLocalTab(next === 'Clips' || next === 'Activity' || next === 'Tagged' ? next : 'Posts');
 useEffect(() => subscribeSectionRequest('/profile', (next) => setLocalTab(next === 'Clips' || next === 'Activity' || next === 'Tagged' ? next : 'Posts')), []);
 if (previewSection === undefined) reportSection('/profile', tab);
 const [shareError, setShareError] = useState('');
 // Steps skipped during setup; the card below offers to finish them.
 const [skipped, setSkipped] = useState<SetupStep[]>([]);
 useEffect(() => {
  if (!user?.id) return undefined;
  const id = user.id;
  const read = () => { void readSkipped(id).then(setSkipped); };
  read();
  // Finishing setup from the card comes back to this same page: the card follows.
  return onSkippedSaved(read);
 }, [user?.id]);
 const SETUP_STEP_INDEX: Record<SetupStep, number> = { permissions: 2, body: 3, calendar: 4 };
 // The underline under All / Clips / Activity / Tagged travels with the finger during a
 // swipe and glides on a tap, instead of jumping once the page changes.
 const TABS = ['Posts', 'Clips', 'Activity', 'Tagged'] as const;
 // 'Posts' holds everything, clips included, so it is shown as All. Activity (Oct 24, owner): the posts
 // that carry a hit's or a match's numbers, the way Strava's profile shows activities.
 const LABEL: Record<(typeof TABS)[number], string> = { Posts: 'All', Clips: 'Clips', Activity: 'Activity', Tagged: 'Tagged' };
 const tabIndex = TABS.indexOf(tab);
 const [tabWidth, setTabWidth] = useState(0);
 const underline = useTabUnderline(tabIndex, TABS.length, tabWidth);
 // A post shared to a group lives in that group's feed only (migration 67).
 const own = posts.filter(p => p.authorId === user?.id && !p.archived && !p.groupId);
 const shown = (tab === 'Tagged' ? posts.filter(p => !!user && isTaggedIn(p, user.id) && !p.archived && !p.groupId) : own.filter(p => inSection(p, tab))).sort((a,b) => Date.parse(b.createdAt)-Date.parse(a.createdAt));
 // How many of each, shown beside the section names.
 const counts: Record<typeof TABS[number], number> = {
   Posts: own.length,
   Clips: own.filter(p => p.kind === 'clip').length,
   Activity: own.filter(p => inSection(p, 'Activity')).length,
   Tagged: user ? posts.filter(p => isTaggedIn(p, user.id) && !p.archived && !p.groupId).length : 0,
 };
 // People asking to join the groups you run.
 const groupsAsking = feedGroups.reduce((n, g) => n + (g.members.some((m) => m.id === currentUserId && m.admin) ? g.requests.length : 0), 0);
 // CourtSide's own welcome counts too, until Notifications is first opened (welcomeNote).
 const welcome = useWelcomeNote(user);
 // Never anything from someone you blocked (the Notifications page leaves those out too).
 // Several workouts found at once are one row there, so they count once, as on the tab bar's bell (features/activity/found).
 // Nothing about an Instant while they are hidden, as on the page (features/stories/instantsSwitch).
 const instantsOn = useInstantsOn();
 const unseen = unseenCount(withoutInstantRows(notifications.filter(n => n.userId === currentUserId && !blockedIds.includes(n.actorId)), instantsOn), detectedActivities) + (welcome.unread ? 1 : 0);
 const savedCount = saved.postIds.length + saved.questionIds.length;
 const swipe = (direction: 1 | -1) => {
   const next = swipeDestination('/profile', tab, direction);
   if (!next) return;
   if (next.pathname === '/profile') setTab(next.section);
   else { requestSection(next.pathname, next.section); router.navigate(next.pathname); }
 };
 // Tiles are sized in plain pixels from the screen width — three across the
 // page's content width — rather than by percentage-plus-aspect-ratio, which
 // the phone has been seen to lay out as nothing at all.
 // The grid's own width, once measured: on a computer the profile sits in a
 // column narrower than the window, and tiles must be a third of that.
 const [gridW, setGridW] = useState(0);
 const tileW = Math.floor((gridW || windowWidth - spacing.lg * 2) / 3);
 const tileH = Math.round((tileW * 4) / 3);
 const content = (selected: string) => {
   if (!user) return null;
   // Pinned first, then newest.
   const items = (selected === 'Tagged' ? posts.filter(p => isTaggedIn(p, user.id) && !p.archived && !p.groupId) : own.filter(p => inSection(p, selected))).sort((a,b) => Number(!!b.pinned) - Number(!!a.pinned) || Date.parse(b.createdAt)-Date.parse(a.createdAt));
   return <View style={{ minHeight: 320, backgroundColor: colors.bg }}>
     <View style={styles.grid} onLayout={(e) => { const w = Math.floor(e.nativeEvent.layout.width); if (w > 0 && w !== gridW) setGridW(w); }}>{items.map(p => <Pressable key={p.id} accessibilityRole="link" accessibilityLabel={`Open ${p.pinned && selected !== 'Tagged' ? 'pinned ' : ''}${p.kind}: ${p.body}`} onPress={() => router.push({ pathname: '/posts/[userId]', params: { userId: user.id, post: p.id, set: selected === 'Clips' ? 'clips' : selected === 'Activity' ? 'activity' : selected === 'Tagged' ? 'tagged' : 'own' } })} style={[styles.tile, { width: tileW, height: tileH }]}>
       <View style={[StyleSheet.absoluteFill, styles.tileBlank]}><Text maxFontSizeMultiplier={TextScale.CARD} numberOfLines={5} style={styles.tileText}>{p.body}</Text></View>
       {p.thumbnailUrl ? <TileCover accessibilityIgnoresInvertColors uri={p.thumbnailUrl} style={StyleSheet.absoluteFill} contentFit="cover" recyclingKey={p.id} transition={120}/> : p.session && hasSessionStats(p.session) && !p.imageUrl && !p.videoUrl ? <SessionTile session={p.session} width={tileW}/> : null}
       {/* Several photos: the stacked mark, where a clip has its play mark. */}
       <CarouselMark post={p}/>
       {/* White on a picture or a session tile; on the pale text tile, the muted ink, so it still shows. */}
       {p.kind==='clip' && (() => { const bare = !p.thumbnailUrl && !(p.session && hasSessionStats(p.session) && !p.imageUrl && !p.videoUrl); return <Ionicons name="play" size={14} color={bare ? colors.textMuted : '#FFFFFF'} style={[styles.tilePlay, bare && styles.tilePlayFlat]}/>; })()}
       {/* Views, bottom left, the way Reels and TikTok grids show them. */}
       {(p.videoUrl || p.kind === 'clip') && (p.views ?? 0) > 0 ? <TileViews views={p.views ?? 0} /> : null}
       {/* Pinned, top left; the tile's own label says "pinned" to a screen reader. */}
       {p.pinned && selected !== 'Tagged' ? <TilePin /> : null}
       {/* Taken down by an admin (migration 108): still yours to see, dimmed and marked; nobody else sees it. */}
       {p.removed ? <TileRemoved /> : null}
     </Pressable>)}</View>
     {/* Never a dead end (Oct 5): your own grid, empty, offers the first clip, unless the
         "Make your first move" card at the top of the page is already asking for it. */}
     {!items.length && <EmptyState title={selected==='Tagged'?'No tagged posts yet':selected==='Activity'?'No activity yet':`No ${selected.toLowerCase()} yet`} body={selected==='Tagged' ? 'Posts you’re tagged in will appear here.' : selected==='Activity' ? 'Hits and matches you post with their stats show up here.' : 'Your shared moments will appear here.'} action={selected==='Tagged' || !hasMoved ? undefined : selected==='Activity' ? { label: 'Log a session', onPress: () => router.push('/log-session') } : { label: 'Post your first clip', onPress: () => router.push('/compose') }}/>}
   </View>;
 };
 // The four grids are rebuilt only when the posts change, so switching
 // section (which re-renders this page) does not rebuild every tile.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 const grids = useMemo(() => TABS.map((t) => content(t)), [posts, user?.id, styles, tileW, hasMoved]);
 // A guest (guest mode, Oct 17): your profile is what an account is for.
 if (!user && isGuest) {
   return <Screen memoryKey="profile" title="Profile" wash right={<GuestSignIn />}><View style={{ paddingTop: spacing.lg }}><GuestJoinCard title="Your tennis, in one place" body="Make a free account to post your clips, log your sessions and find people to hit with." /></View></Screen>;
 }
 if (!user) {
   const remembered = savedAccounts.find((a) => a.id === currentUserId);
   return <Screen memoryKey="profile" title="Profile" wash subtitle={remembered?.handle ? `@${remembered.handle}` : ' '}><ProfileSkeleton name={remembered?.name} avatarUrl={remembered?.avatarUrl} seed={currentUserId ?? 'you'}/></Screen>;
 }
 const profile = user.profile;
 const share = () => router.push(`/share?kind=profile&id=${user.id}`);
 const page = (selected: string, live: boolean) => {
  const index = TABS.indexOf(selected as typeof TABS[number]);
  const body = <>
   {/* At the top of the page, in its flow, its pointer under the paper plane in the header: it lines up with the cards
       and covers nothing (the first-move card included), and the page eases back up once it is closed. */}
   <InboxTip eligible={inboxTipEligible} live={live} style={styles.inboxTip} />
   {firstWeek.card}
   {!hasMoved && !firstWeek.showing && !firstWeek.deciding && <Pressable accessibilityRole="link" accessibilityLabel="Make your first move" onPress={() => router.push({ pathname: '/first-move', params: { from: 'profile' } })} style={styles.setup}>
     <Ionicons name="videocam-outline" size={20} color={colors.brand}/>
     <View style={{ flex: 1 }}><Text maxFontSizeMultiplier={TextScale.CARD} style={styles.setupTitle}>Make your first move</Text><Text maxFontSizeMultiplier={TextScale.CARD} style={styles.meta}>{user && notKnownAdult(user) ? 'Add your friends, or post your first clip.' : 'Bring your hitting partners, or post your first clip.'}</Text></View>
     <Ionicons name="chevron-forward" size={16} color={colors.textMuted}/>
   </Pressable>}
   {skipped.length > 0 && <Pressable accessibilityRole="link" accessibilityLabel="Finish setting up your profile" onPress={() => router.push({ pathname: '/onboarding', params: { step: String(SETUP_STEP_INDEX[skipped[0]]), from: 'profile' } })} style={styles.setup}>
     <Ionicons name="sparkles-outline" size={20} color={colors.brand}/>
     <View style={{ flex: 1 }}><Text maxFontSizeMultiplier={TextScale.CARD} style={styles.setupTitle}>Finish setting up</Text><Text maxFontSizeMultiplier={TextScale.CARD} style={styles.meta}>{[skipped.includes('permissions') && 'camera and photos', skipped.includes('body') && 'fitness and goals', skipped.includes('calendar') && 'your next tournament'].filter(Boolean).join(', ').replace(/^./, (c) => c.toUpperCase())} — about a minute.</Text></View>
     <Ionicons name="chevron-forward" size={16} color={colors.textMuted}/>
   </Pressable>}
   {/* The website only: "Get CourtSide on your iPhone", until closed or the phone app is opened (R3, Oct 20 sweep). */}
   <PhoneAppRow />
   {/* The phone apps: "Log your hits automatically" while nothing brings sessions in (Oct 24), after the setup cards above. */}
   {hasMoved && !firstWeek.showing && !firstWeek.deciding && skipped.length === 0 && <ConnectCard />}
   {/* The picture in the middle, the name under it, and who follows whom in
       one quiet line — the post counts moved down to the Posts / Clips / Tagged row. */}
   <View style={styles.identity}>
     {/* Picture on the left, who you are beside it, the bio under — the way the apps people already use set it. */}
     <View style={styles.identityRow}>
       <Avatar name={user.name} seed={user.avatarSeed} uri={user.avatarUrl} size={80} style={{ backgroundColor: colors.brand }}/>
       <View style={styles.identityWords}>
         {/* The flame after your name is what everyone else sees there (3 days or more). A screen reader hears it once, from the streak pill under it. */}
         <View style={styles.nameLine}><PlayerName userId={user.id} style={styles.name}>{user.name}</PlayerName><StreakFlame days={shownStreak(user, currentUserId)} size="large" silent/></View>
         {/* The streak opens your sessions (only you see them); Log beside it opens the log sheet, two taps from here to a logged session. */}
         <View style={styles.nameRow}><LevelPill profile={profile}/>{user.stats.currentStreakDays >= 2 ? <Pressable accessibilityRole="link" accessibilityLabel={`${user.stats.currentStreakDays}-day streak. See your sessions`} hitSlop={6} onPress={() => router.push('/your-sessions')} style={({ pressed }) => [styles.streak, pressed && styles.pillPressed]}><Ionicons name="flame" size={12} color={colors.clay}/><Text maxFontSizeMultiplier={TextScale.CARD} style={styles.streakText}>{user.stats.currentStreakDays}-day streak</Text></Pressable> : null}<Pressable accessibilityRole="button" accessibilityLabel="Log a session" hitSlop={6} onPress={() => router.push('/log-session')} style={({ pressed }) => [styles.logPill, pressed && styles.pillPressed]}><Ionicons name="add" size={13} color={colors.textMuted}/><Text maxFontSizeMultiplier={TextScale.CHROME} style={styles.logPillText}>Log</Text></Pressable></View>
       </View>
     </View>
     {!!user.bio && <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.bio}>{user.bio}</Text>}
     <View style={styles.followRow}>
       {([['followers', user.followers, 'followers'], ['following', user.following, 'following']] as const).map(([tab, n, label], i) => <React.Fragment key={tab}>
         {i > 0 && <Text maxFontSizeMultiplier={TextScale.CHROME} style={styles.followDot}>·</Text>}
         <Pressable accessibilityRole="link" accessibilityLabel={`${n} ${label}`} onPress={() => router.push({ pathname: '/follows', params: { userId: user.id, tab } })} style={styles.follow}>
           <Text maxFontSizeMultiplier={TextScale.CHROME} style={styles.followCount}>{compactNumber(Number(n))}</Text><Text maxFontSizeMultiplier={TextScale.CARD} style={styles.meta}> {label}</Text>
         </Pressable>
       </React.Fragment>)}
     </View>
     <View style={styles.buttons}><View style={{ flex: 1 }}><Button label="Edit profile" variant="secondary" onPress={() => router.push('/edit-profile')} full size="sm" style={tallButton}/></View><View style={{ flex: 1 }}><Button label="Share" variant="secondary" onPress={share} full size="sm" style={tallButton}/></View></View>
     {!!shareError && <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.meta}>{shareError}</Text>}
   </View>
   {/* Your tennis, as the player card's banner: the whole of it opens the Tennis profile, your tennis hub. */}
   <PlayerCard user={user} variant="banner" onPress={() => router.push('/profile-details')} />
   {/* One grouped list, the way Settings reads, instead of three boxes. */}
   <View style={styles.links}>
     {studio ? <Pressable accessibilityRole="link" accessibilityLabel={`Coach studio. ${studio.line}`} onPress={() => router.push('/coach-studio')} style={({ pressed }) => [styles.linkRow, pressed && styles.linkPressed]}><Ionicons name="ribbon-outline" size={20} color={colors.brand}/><Text maxFontSizeMultiplier={TextScale.CARD} style={styles.linkText}>Coach studio</Text>{studio.waiting ? <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.linkValue}>{studio.waiting} waiting</Text> : studio.doneCount < 4 ? <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.linkValue}>{studio.doneCount} of 4</Text> : null}<Ionicons name="chevron-forward" size={16} color={colors.textFaint}/></Pressable> : null}
     <Pressable accessibilityRole="link" accessibilityLabel="Saved videos and discussions" onPress={() => router.push('/saved')} style={({ pressed }) => [styles.linkRow, studio && styles.linkLine, pressed && styles.linkPressed]}><Ionicons name="bookmark-outline" size={20} color={colors.text}/><Text maxFontSizeMultiplier={TextScale.CARD} style={styles.linkText}>Saved</Text>{savedCount ? <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.linkValue}>{savedCount}</Text> : null}<Ionicons name="chevron-forward" size={16} color={colors.textFaint}/></Pressable>
   </View>
   <View style={styles.tabs} onLayout={e => setTabWidth(e.nativeEvent.layout.width / TABS.length)}>{TABS.map(t => <Pressable key={t} accessibilityRole="tab" accessibilityState={{selected:selected===t}} accessibilityLabel={`${LABEL[t]}, ${counts[t]}`} onPress={() => setTab(t)} style={styles.tab}><Text {...oneLine(TextScale.TITLE)} style={[typography.body, selected===t ? { ...font('600'), color: colors.text } : { color: colors.textMuted }]}>{LABEL[t]}<Text style={[styles.tabCount, selected===t && { color: colors.brand }]}>  {compactNumber(counts[t])}</Text></Text></Pressable>)}
     {tabWidth > 0 && (live
       ? <Reanimated.View pointerEvents="none" style={[styles.tabIndicator, { width: tabWidth }, underline.style]} />
       : <View pointerEvents="none" style={[styles.tabIndicator, { width: tabWidth, left: index * tabWidth }]} />)}
   </View>
   {live
     // Under the tab line only the grid slides, all four grids riding side by
     // side. A swipe right from Posts is handed up to the tab row (Coaching).
     ? <SectionPager index={index} panes={grids} progress={underline.progress} depth={2} delegateRight bleed={spacing.lg} onIndex={(i) => setTab(TABS[i])} />
     : content(selected)}
  </>;
  // The top half never slides between sections: above the line, a swipe is
  // the tab row's (Profile to Coaching). Only the grid below the line changes.
  return body;
 };
 return <Screen memoryKey="profile" title="Profile" wash subtitle={`@${user.handle}`} onRefresh={previewSection === undefined && !isDesktopBrowser() ? actions.refresh : undefined} right={<View style={styles.headerActions}>
   <View style={styles.headerActions}>
     <Tappable accessibilityRole="link" accessibilityLabel={unseen ? `Notifications, ${unseen} new` : 'Notifications'} onPress={() => router.push('/notifications')} hitSlop={10} dim style={styles.headerButton}>
       <Ionicons name={unseen ? 'notifications' : 'notifications-outline'} size={27} color={colors.text}/>
       <UnreadBadge count={unseen} />
     </Tappable>
     <InboxButton size={27} />
   </View>
   <ProfileMenu groupsAsking={groupsAsking} groupCount={feedGroups.length} invites={feedGroupInvites.length} />
 </View>}>
   {page(tab, previewSection === undefined)}
 </Screen>;
}
/**
 * The paper plane's first-visit tip, while Profile is the page on show. It asks that itself, so a
 * page opening anywhere redraws this, not the whole tab (see useShownAt). Drawn only on the live
 * page (`live`), never a picture of it; asked for either way, as when Profile asked.
 */
function InboxTip({ eligible, live, style }: { eligible: boolean; live: boolean; style: StyleProp<ViewStyle> }) {
 const inboxTip = useTip('messages', useShownAt('/profile') && eligible);
 return live ? <TipBubble tip="messages" shown={inboxTip.shown} onClose={inboxTip.close} pointer="up" pointerRight={INBOX_POINTER} inline on="page" style={style} /> : null;
}
/**
 * ☰ at the top of your profile: a small menu under it with Groups (and how
 * many are asking to join the ones you run), Theme and Settings. A brand dot
 * on the ☰ while someone is asking, or while Theme is new to you (Oct 24,
 * owner: "just have a dot on the 3 lines … once they change it or go into the
 * tab the noti goes away": opening the Theme page clears it, app/theme.tsx).
 * A see-through Modal holding a card placed under the button, so it opens the
 * same on a phone and in a browser; a tap outside (or Escape, or the phone's
 * Back) closes it.
 *
 * The card grows out of the ☰ (Oct 24, owner: "the animation when you click
 * the 3 lines … has to be better", it was the Modal's own slow fade): a quick
 * spring from the button's corner, settling with the faintest overshoot, and
 * a quicker shrink back into it on close (MenuCard).
 */
function ProfileMenu({ groupsAsking, groupCount, invites }: { groupsAsking: number; groupCount: number; invites: number }) {
  // Invites to groups waiting for your answer (migration 181) light the same dot.
  const invitesWords = invites ? `${invites} ${invites === 1 ? 'invite' : 'invites'}` : '';
  const { theme } = useTheme();
  const themeLabel = themeList.find((t) => t.name === theme)?.label ?? 'CourtSide';
  // Never opened the Theme page on this phone, and still on the court a new player gets.
  const themeNew = useTipWaiting('theme') && theme === DEFAULT_THEME;
  const styles = useThemedStyles(styleDefinitions);
  const anchor = useRef<View>(null);
  const { width } = useWindowDimensions();
  // Where the card sits while it is wanted open; null once asked to close.
  const [at, setAt] = useState<{ top: number; right: number } | null>(null);
  // The Modal stays up until the card has shrunk away (MenuCard's onGone).
  const [up, setUp] = useState(false);
  const last = useRef<{ top: number; right: number } | null>(null);
  if (at) last.current = at;
  // Where the ☰ is, known before the tap (Oct 24, owner: "might be too slow"), so the card is up in the
  // tap's own frame; measured again as it opens, in case the page moved.
  const spot = useRef<{ top: number; right: number } | null>(null);
  const measure = (then?: (p: { top: number; right: number }) => void) => anchor.current?.measureInWindow((x, y, w, h) => {
    if (!w && !h) return;
    const p = { top: y + h + 6, right: Math.max(8, width - (x + w)) };
    // Kept only from a measure taken on screen: while Profile waits beside the page on show (the tabs
    // side by side), the button reads as off to the side.
    if (x >= 0 && x + w <= width + 1) spot.current = p;
    then?.(p);
  });
  const open = () => {
    haptics.tap();
    if (spot.current) { setAt(spot.current); setUp(true); measure((p) => setAt((was) => (was && (was.top !== p.top || was.right !== p.right) ? p : was))); return; }
    measure((p) => { setAt(p); setUp(true); });
  };
  const close = () => setAt(null);
  const gone = useCallback(() => setUp(false), []);
  const go = (path: '/groups' | '/theme' | '/settings') => { close(); router.push(path); };
  // Android: a message that arrives while the menu is open shows as the phone's own alert, not under it (see modalOpen).
  useModalOpenWhile(up);
  const place = at ?? last.current;
  return <>
    <View ref={anchor} collapsable={false} onLayout={() => measure()}>
      <Tappable accessibilityRole="button" accessibilityLabel={`Menu: groups, theme and settings${groupsAsking ? `. ${groupsAsking} asking to join your groups` : ''}${invitesWords ? `. ${invitesWords} to a group` : ''}${themeNew ? '. New: themes' : ''}`} onPress={open} hitSlop={10} dim style={styles.headerButton}>
        <Ionicons name="menu-outline" size={30} color={colors.text}/>
        {groupsAsking || invites || themeNew ? <View style={styles.menuDot} /> : null}
      </Tappable>
    </View>
    <Modal visible={up} transparent animationType="none" statusBarTranslucent onRequestClose={close}><SwipeArea on={false}>
      {/* The backdrop beside the menu, not around it: a button may not hold buttons in a browser. */}
      <Pressable accessibilityRole="button" accessibilityLabel="Close menu" onPress={close} disabled={!at} style={StyleSheet.absoluteFill} />
      {up && place ? <MenuCard open={!!at} onGone={gone} style={[styles.menu, { top: place.top, right: place.right }]}>
        <Pressable accessibilityRole="menuitem" accessibilityLabel={`Groups${groupsAsking ? `, ${groupsAsking} asking to join` : ''}${invitesWords ? `, ${invitesWords}` : ''}`} onPress={() => go('/groups')} style={({ pressed }) => [styles.menuRow, pressed && styles.linkPressed]}>
          <Ionicons name="people-outline" size={20} color={colors.text}/>
          <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.menuText}>Groups</Text>
          {groupsAsking || invites ? <View style={styles.menuTag}><Text maxFontSizeMultiplier={TextScale.CARD} style={styles.menuTagText}>{groupsAsking ? `${groupsAsking} asking` : invitesWords}</Text></View> : groupCount ? <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.linkValue}>{groupCount}</Text> : null}
        </Pressable>
        {/* Theme lives here only (owner, Oct 24: "make sure theme is not in the settings, but only in the 3 lines"), with the court it wears now. */}
        <Pressable accessibilityRole="menuitem" accessibilityLabel={`Theme, ${themeLabel}${themeNew ? ', new' : ''}`} onPress={() => go('/theme')} style={({ pressed }) => [styles.menuRow, styles.linkLine, pressed && styles.linkPressed]}>
          <Ionicons name="color-palette-outline" size={20} color={colors.text}/>
          <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.menuText}>Theme</Text>
          {themeNew ? <View style={styles.rowDot} /> : null}
          <ThemeTile name={theme} />
        </Pressable>
        <Pressable accessibilityRole="menuitem" accessibilityLabel="Settings" onPress={() => go('/settings')} style={({ pressed }) => [styles.menuRow, styles.linkLine, pressed && styles.linkPressed]}>
          <Ionicons name="settings-outline" size={20} color={colors.text}/>
          <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.menuText}>Settings</Text>
        </Pressable>
      </MenuCard> : null}
    </SwipeArea></Modal>
  </>;
}
/** How far the card has grown at its smallest: from the ☰'s corner, never from nothing. */
const MENU_FROM = 0.55;
/**
 * Opening: a quick spring that lands in about a fifth of a second with a small pop past full size
 * (about 2%) and back, the way the phone's own menus open (Oct 24, owner: "has to be more satisfying
 * … might be too slow"; it was a softer spring that took twice as long to settle).
 */
const MENU_SPRING = { damping: 25, stiffness: 520, mass: 0.6 };
/** Closing: quicker than the open, a short shrink and fade, so it is out of the way at once. */
const MENU_CLOSE_MS = 120;
/** How far it shrinks as it closes: a little, not all the way back into the button (it is fading). */
const MENU_TO = 0.88;
/** The card's plain open look, said once it has settled (see MenuCard). */
const MENU_REST = { opacity: 1, transform: [{ scale: 1 }, { translateY: 0 }] };
/**
 * The ☰ menu's card, built fresh for each opening. It grows from its top
 * right corner (under the ☰) with a spring and fades in over the first part of
 * it; told to close, it shrinks back and fades, then says it is gone, and only
 * then is the Modal taken down. With Reduce Motion on, a plain quick fade.
 *
 * Settled open on a phone, its open look is said by a plain style as well (as
 * Pop's and Fold's), so a dropped settled animation value can never leave an
 * open menu invisible on a later re-render; kept through the close (its own
 * values win as they run). A safety timer takes it down even if the close's
 * end is never heard, so an invisible Modal can never sit over the page.
 */
function MenuCard({ open, onGone, style, children }: { open: boolean; onGone: () => void; style: StyleProp<ViewStyle>; children: React.ReactNode }) {
  const still = useReducedMotion();
  const p = useSharedValue(0);
  // 1 while it closes: the close shrinks less and fades straight away (see MENU_TO).
  const closing = useSharedValue(0);
  const [rested, setRested] = useState(false);
  useEffect(() => {
    if (open) {
      closing.value = 0;
      p.value = still ? withTiming(1, { duration: 160 }, (done) => { if (done) runOnJS(setRested)(true); })
        : withSpring(1, MENU_SPRING, (done) => { if (done) runOnJS(setRested)(true); });
      return undefined;
    }
    closing.value = 1;
    p.value = withTiming(0, { duration: still ? 120 : MENU_CLOSE_MS, easing: Easing.in(Easing.quad) }, (done) => { if (done) runOnJS(onGone)(); });
    const t = setTimeout(onGone, MENU_CLOSE_MS + 250);
    return () => clearTimeout(t);
  }, [open, still, p, closing, onGone]);
  const look = useAnimatedStyle(() => {
    const shut = closing.value === 1;
    // Opening, seen within the first quarter of the spring, so the growth reads as the card arriving, not a ghost;
    // closing, it fades as it shrinks.
    const opacity = shut ? Math.max(0, p.value) : Math.min(1, Math.max(0, p.value * 4));
    const from = shut ? MENU_TO : MENU_FROM;
    return {
      opacity,
      transform: [{ scale: still ? 1 : from + (1 - from) * p.value }, { translateY: still || shut ? 0 : -8 * (1 - Math.min(1, p.value)) }],
    };
  });
  const resting = Platform.OS !== 'web' && rested;
  return (
    <Reanimated.View accessibilityRole="menu" pointerEvents={open ? 'auto' : 'none'} style={[style, { transformOrigin: 'top right' } as ViewStyle, look, resting && MENU_REST]}>
      {children}
    </Reanimated.View>
  );
}
/**
 * The profile page before the account has come down: your picture (kept on
 * the phone from last time) and name, and every other part of the page in
 * its place but empty. The real numbers and words then fill in.
 */
function ProfileSkeleton({ name, avatarUrl, seed }: { name?: string; avatarUrl?: string; seed: string }) {
  const styles = useThemedStyles(styleDefinitions);
  const { theme } = useTheme();
  // The banner's own colours (the session box's: cream here, the court colour on the city courts), so it fades into the real one in place.
  const look = cardLook(theme);
  const breathe = useSharedValue(0);
  useEffect(() => {
    breathe.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }), -1, true);
    return () => cancelAnimation(breathe);
  }, [breathe]);
  const pulse = useAnimatedStyle(() => ({ opacity: 0.5 + 0.3 * breathe.value }));
  const Blank = ({ w, h = 12, on }: { w: number; h?: number; on?: string }) => <Reanimated.View style={[{ width: w, height: h, borderRadius: h / 2, backgroundColor: on ?? colors.surfaceAlt }, pulse]} />;
  const ink = withAlpha(look.ink, 0.12);
  return <>
   <View style={styles.identity}>
     <View style={styles.identityRow}>
       <Avatar name={name ?? ''} seed={seed} uri={avatarUrl} size={80} style={{ backgroundColor: colors.brand }}/>
       <View style={styles.identityWords}>
         {name ? <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.name}>{name}</Text> : <Blank w={140} h={20} />}
         <Blank w={110} h={16} />
       </View>
     </View>
     <View style={styles.followRow}><Blank w={64} /><Text maxFontSizeMultiplier={TextScale.CHROME} style={styles.followDot}>·</Text><Blank w={64} /></View>
     <View style={styles.buttons}><View style={{ flex: 1 }}><Button label="Edit profile" variant="secondary" disabled onPress={() => undefined} full size="sm" style={tallButton}/></View><View style={{ flex: 1 }}><Button label="Share" variant="secondary" disabled onPress={() => undefined} full size="sm" style={tallButton}/></View></View>
   </View>
   {/* The Tennis profile banner's shape: its heading, the rating, the line under it and three numbers. */}
   <View style={[styles.bannerBlank, { backgroundColor: look.fill, borderColor: look.border, borderWidth: look.dark ? 1 : 0 }]}>
     <CardWash look={look} radius={16} />
     <Blank w={120} h={17} on={ink} />
     <View style={styles.bannerBlankHero}><Blank w={64} h={36} on={ink} /></View>
     <Blank w={140} h={14} on={ink} />
     <View style={styles.bannerBlankStrip}>{[0, 1, 2].map((i) => <View key={i} style={{ flex: 1 }}><Blank w={48} h={20} on={ink} /></View>)}</View>
   </View>
   <View style={styles.links}>
     <View style={styles.linkRow}><Ionicons name="bookmark-outline" size={20} color={colors.text}/><Text maxFontSizeMultiplier={TextScale.CARD} style={styles.linkText}>Saved</Text></View>
   </View>
   <View style={styles.tabs}>{['All', 'Clips', 'Activity', 'Tagged'].map((t, i) => <View key={t} style={styles.tab}><Text {...oneLine(TextScale.TITLE)} style={[typography.body, i === 0 ? { ...font('600'), color: colors.text } : { color: colors.textMuted }]}>{t}</Text></View>)}</View>
   <View style={styles.grid}>{[0, 1, 2].map((i) => <Reanimated.View key={i} style={[styles.tile, pulse]} />)}</View>
  </>;
}

const styleDefinitions = StyleSheet.create({
 // The messages tip, at the top of the page, lined up on the right with the cards under it.
 inboxTip:{alignItems:'flex-end',paddingTop:2},
 // The ☰ menu: a small card on the overlay's shadow (it floats over the page), rows 48 tall.
 menu:{position:'absolute',minWidth:220,borderRadius: corner(16),backgroundColor:colors.surface,borderWidth:StyleSheet.hairlineWidth,borderColor:colors.border,overflow:'hidden',boxShadow:'0px 6px 16px rgba(0, 0, 0, 0.18)'},
 menuRow:{flexDirection:'row',alignItems:'center',gap:12,minHeight:48,paddingHorizontal:16},
 menuText:{...typography.body,color:colors.text,flex:1},
 menuTag:{paddingHorizontal:7,paddingVertical:3,borderRadius:6,backgroundColor:colors.brandDim},
 menuTagText:{...typography.caption,letterSpacing:0.2,color:colors.brand},
 menuDot:{position:'absolute',top:5,right:3,width:9,height:9,borderRadius:5,backgroundColor:colors.brand,borderWidth:1.5,borderColor:colors.bg},rowDot:{width:8,height:8,borderRadius:4,backgroundColor:colors.brand},
 // The banner's shape while the account loads.
 bannerBlank:{padding:16,borderRadius: corner(16),gap:10,overflow:'hidden'},
 bannerBlankHero:{paddingVertical:2},
 bannerBlankStrip:{flexDirection:'row',marginTop:6},
 setup:{marginTop:16,marginHorizontal:0,padding:14,borderRadius:corner(16),backgroundColor:colors.brandDim,flexDirection:'row',alignItems:'center',gap:12},setupTitle:{...typography.smallStrong,fontSize:14,color:colors.text},identity:{gap:12,paddingTop:16,paddingBottom:20,alignItems:'stretch'},identityRow:{flexDirection:'row',alignItems:'center',gap:16},identityWords:{flex:1,gap:6,minWidth:0},meta:{fontSize:12,color:colors.textMuted,lineHeight:19},nameRow:{flexDirection:'row',gap:10,alignItems:'center',flexWrap:'wrap'},nameLine:{flexDirection:'row',alignItems:'center',gap:6,minWidth:0},name:{...typography.title,fontSize:22,color:colors.text,flexShrink:1},bio:{...typography.body,lineHeight:22,color:colors.text},followRow:{flexDirection:'row',alignItems:'center',gap:10},follow:{flexDirection:'row',alignItems:'baseline'},followCount:{...typography.bodyStrong,color:colors.text},followDot:{color:colors.textFaint,fontSize:14},tabCount:{...typography.smallStrong,fontSize:12,color:colors.textFaint},buttons:{flexDirection:'row',gap:8,alignSelf:'stretch',marginTop:6},settings:{borderWidth:1,borderColor:colors.border,borderRadius:10,padding:10,justifyContent:'center'},streak:{flexDirection:'row',alignItems:'center',gap:3,paddingHorizontal:8,paddingVertical:2,borderRadius:999,backgroundColor:colors.bgElevated},streakText:{...typography.caption,letterSpacing:0,fontWeight:'600',color:colors.clay},
 // "Log" beside the streak: the streak pill's size, in plain ink, so the streak stays the louder of the two.
 logPill:{flexDirection:'row',alignItems:'center',gap:2,paddingLeft:6,paddingRight:9,paddingVertical:2,borderRadius:999,borderWidth:StyleSheet.hairlineWidth,borderColor:colors.borderStrong},logPillText:{...typography.caption,letterSpacing:0,fontWeight:'600',color:colors.textMuted},pillPressed:{opacity:0.6},
 links:{...lift,marginTop:12,borderRadius:corner(20),backgroundColor:colors.surface,overflow:'hidden'},linkRow:{flexDirection:'row',alignItems:'center',gap:12,minHeight:52,paddingVertical:11,paddingHorizontal:16},linkLine:{borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:colors.border},linkPressed:{backgroundColor:colors.surfaceAlt},linkText:{...typography.body,color:colors.text,flex:1},linkValue:{...typography.body,color:colors.textMuted},headerActions:{flexDirection:'row',alignItems:'center',gap:14},headerButton:{padding:4},tabs:{flexDirection:'row',marginTop:16,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:colors.border},tab:{flex:1,alignItems:'center',paddingVertical:18},tabIndicator:{position:'absolute',left:0,bottom:-2,height:2,backgroundColor:colors.brand,borderRadius:1},grid:{flexDirection:'row',flexWrap:'wrap',marginHorizontal:0},
 // Instagram's grid: tall tiles, the thumbnail and nothing else on it.
 tile:{borderWidth:1,borderColor:colors.bg,backgroundColor:colors.surfaceAlt,overflow:'hidden'},
 tileBlank:{padding:10,justifyContent:'center'},
 tileText:{fontSize:11,lineHeight:15,color:colors.textMuted},
 tilePlay:{position:'absolute',top:6,right:6,textShadowColor:'rgba(0,0,0,0.6)',textShadowRadius:3},
 tilePlayFlat:{textShadowColor:'transparent',textShadowRadius:0},
 tileViews:{position:'absolute',left:6,bottom:5,flexDirection:'row',alignItems:'center',gap:3},
 tileViewsText:{fontSize:12,...font('600'),color:'#FFFFFF',textShadowColor:'rgba(0,0,0,0.6)',textShadowRadius:3},
});

export default asTabRoute<{ previewSection?: string }>(Profile, '/profile');
