import { asTabRoute } from '@/features/navigation/tabFocus';
import { isDesktopBrowser } from '@/lib/browserDevice';
import { PlayerName } from '@/components/PlayerName';
import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { readSkipped, type SetupStep } from '@/features/onboarding/setupProgress';
import { Image, Pressable, Share, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Avatar, Button, EmptyState, Screen } from '@/components/ui';
import { SectionPager } from '@/components/SectionPager';
import { TileCover } from '@/components/TileCover';
import Reanimated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useTabUnderline } from '@/features/navigation/useTabUnderline';
import { Tappable } from '@/components/Tappable';
import { reportSection, requestSection, subscribeSectionRequest, swipeDestination } from '@/features/navigation/swipeOrder';
import { LevelPill } from '@/components/LevelPill';
import { useApp } from '@/store/AppContext';
import { InboxButton, UnreadBadge } from '@/components/InboxButton';
import { playStyleLabel, surfaceLabel } from '@/lib/badges';
import { compactNumber } from '@/lib/format';
import { TileViews } from '@/components/TileViews';
import { TilePin } from '@/components/TilePin';
import { colors, spacing, typography, font, lift } from '@/theme';
import { wrappedYear } from '@/features/wrapped/yearInTennis';
import { useTourTarget } from '@/features/tour/tourStore';
import { isTaggedIn } from '@/features/activity/sessionTags';
import { studioLine } from '@/features/coaching/studioSummary';

function Profile({ previewSection }: { previewSection?: string } = {}) {
 // December to mid-January: the year's recap sits at the top of your links.
 const wrapped = wrappedYear();
  const styles = useThemedStyles(styleDefinitions);
 const { currentUser: user, posts, questions, answers, saved, notifications, currentUserId, savedAccounts, coaches, coachingRequests, coachQuestions, actions } = useApp();
 // A coach's studio, first of your links: what is waiting there, or how far setup has got.
 const myCoach = coaches.find((c) => c.userId === currentUserId);
 const studio = myCoach ? studioLine(myCoach, coachingRequests, coachQuestions, currentUserId) : null;
 // Nothing posted, asked or answered yet: the profile offers the first move.
 const hasMoved = !currentUserId || posts.some((p) => p.authorId === currentUserId) || questions.some((q) => q.authorId === currentUserId) || answers.some((a) => a.authorId === currentUserId);
 // Your own posts, however far back they go: the grid and the counts are
 // yours entirely, not just whichever of them the feed happens to hold.
 useEffect(() => { if (user?.id) void actions.loadPostsOf(user.id); }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
 const { width: windowWidth } = useWindowDimensions();
 // The tutorial's last tip lights the bell and the paper plane together, so they share one box it can find.
 const tourInbox = useTourTarget('profile-inbox');
 // The section lives here, not in the address (see discuss.tsx for why).
 const [localTab, setLocalTab] = useState<'Posts' | 'Clips' | 'Tagged'>('Posts');
 const section = previewSection ?? localTab;
 const tab = section === 'Clips' || section === 'Tagged' ? section : 'Posts';
 const setTab = (next: string) => setLocalTab(next === 'Clips' || next === 'Tagged' ? next : 'Posts');
 useEffect(() => subscribeSectionRequest('/profile', (next) => setLocalTab(next === 'Clips' || next === 'Tagged' ? next : 'Posts')), []);
 if (previewSection === undefined) reportSection('/profile', tab);
 const [shareError, setShareError] = useState('');
 // Steps skipped during setup; the card below offers to finish them.
 const [skipped, setSkipped] = useState<SetupStep[]>([]);
 useEffect(() => { if (user?.id) readSkipped(user.id).then(setSkipped); }, [user?.id]);
 const SETUP_STEP_INDEX: Record<SetupStep, number> = { permissions: 2, body: 3, calendar: 4 };
 // The underline under Posts / Clips / Tagged travels with the finger during a
 // swipe and glides on a tap, instead of jumping once the page changes.
 const TABS = ['Posts', 'Clips', 'Tagged'] as const;
 // 'Posts' holds everything, clips included, so it is shown as All.
 const LABEL: Record<(typeof TABS)[number], string> = { Posts: 'All', Clips: 'Clips', Tagged: 'Tagged' };
 const tabIndex = TABS.indexOf(tab);
 const [tabWidth, setTabWidth] = useState(0);
 const underline = useTabUnderline(tabIndex, TABS.length, tabWidth);
 const own = posts.filter(p => p.authorId === user?.id && !p.archived);
 const shown = (tab === 'Tagged' ? posts.filter(p => !!user && isTaggedIn(p, user.id) && !p.archived) : own.filter(p => tab !== 'Clips' || p.kind === 'clip')).sort((a,b) => Date.parse(b.createdAt)-Date.parse(a.createdAt));
 // How many of each, shown beside the section names.
 const counts: Record<typeof TABS[number], number> = {
   Posts: own.length,
   Clips: own.filter(p => p.kind === 'clip').length,
   Tagged: user ? posts.filter(p => isTaggedIn(p, user.id) && !p.archived).length : 0,
 };
 const unseen = notifications.filter(n => n.userId === currentUserId && !n.read).length;
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
   const items = (selected === 'Tagged' ? posts.filter(p => isTaggedIn(p, user.id) && !p.archived) : own.filter(p => selected !== 'Clips' || p.kind === 'clip')).sort((a,b) => Number(!!b.pinned) - Number(!!a.pinned) || Date.parse(b.createdAt)-Date.parse(a.createdAt));
   return <View style={{ minHeight: 320, backgroundColor: colors.bg }}>
     <View style={styles.grid} onLayout={(e) => { const w = Math.floor(e.nativeEvent.layout.width); if (w > 0 && w !== gridW) setGridW(w); }}>{items.map(p => <Pressable key={p.id} accessibilityRole="link" accessibilityLabel={`Open ${p.pinned && selected !== 'Tagged' ? 'pinned ' : ''}${p.kind}: ${p.body}`} onPress={() => router.push({ pathname: '/posts/[userId]', params: { userId: user.id, post: p.id, set: selected === 'Clips' ? 'clips' : selected === 'Tagged' ? 'tagged' : 'own' } })} style={[styles.tile, { width: tileW, height: tileH }]}>
       <View style={[StyleSheet.absoluteFill, styles.tileBlank]}><Text numberOfLines={5} style={styles.tileText}>{p.body}</Text></View>
       {p.thumbnailUrl ? <TileCover accessibilityIgnoresInvertColors uri={p.thumbnailUrl} style={StyleSheet.absoluteFill} contentFit="cover" recyclingKey={p.id} transition={120}/> : null}
       {p.kind==='clip' && <Ionicons name="play" size={14} color="#FFFFFF" style={styles.tilePlay}/>}
       {/* Views, bottom left, the way Reels and TikTok grids show them. */}
       {(p.videoUrl || p.kind === 'clip') && (p.views ?? 0) > 0 ? <TileViews views={p.views ?? 0} /> : null}
       {/* Pinned, top left; the tile's own label says "pinned" to a screen reader. */}
       {p.pinned && selected !== 'Tagged' ? <TilePin /> : null}
     </Pressable>)}</View>
     {!items.length && <EmptyState title={selected==='Tagged'?'No tagged posts yet':`No ${selected.toLowerCase()} yet`} body="Your shared moments will appear here."/>}
   </View>;
 };
 // The three grids are rebuilt only when the posts change, so switching
 // section (which re-renders this page) does not rebuild every tile.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 const grids = useMemo(() => TABS.map((t) => content(t)), [posts, user?.id, styles, tileW]);
 if (!user) {
   const remembered = savedAccounts.find((a) => a.id === currentUserId);
   return <Screen memoryKey="profile" title="Profile" wash subtitle={remembered?.handle ? `@${remembered.handle}` : ' '}><ProfileSkeleton name={remembered?.name} avatarUrl={remembered?.avatarUrl} seed={currentUserId ?? 'you'}/></Screen>;
 }
 const profile = user.profile;
 const share = () => router.push(`/share?kind=profile&id=${user.id}`);
 const page = (selected: string, live: boolean) => {
  const index = TABS.indexOf(selected as typeof TABS[number]);
  const body = <>
   {!hasMoved && <Pressable accessibilityRole="link" accessibilityLabel="Make your first move" onPress={() => router.push('/first-move')} style={styles.setup}>
     <Ionicons name="videocam-outline" size={20} color={colors.brand}/>
     <View style={{ flex: 1 }}><Text style={styles.setupTitle}>Make your first move</Text><Text style={styles.meta}>Post a clip, or answer someone's question. It's how players near you find you.</Text></View>
     <Ionicons name="chevron-forward" size={16} color={colors.textMuted}/>
   </Pressable>}
   {skipped.length > 0 && <Pressable accessibilityRole="link" accessibilityLabel="Finish setting up your profile" onPress={() => router.push({ pathname: '/onboarding', params: { step: String(SETUP_STEP_INDEX[skipped[0]]), from: 'profile' } })} style={styles.setup}>
     <Ionicons name="sparkles-outline" size={20} color={colors.brand}/>
     <View style={{ flex: 1 }}><Text style={styles.setupTitle}>Finish setting up</Text><Text style={styles.meta}>{[skipped.includes('permissions') && 'camera and photos', skipped.includes('body') && 'fitness and goals', skipped.includes('calendar') && 'your next tournament'].filter(Boolean).join(', ').replace(/^./, (c) => c.toUpperCase())} — about a minute.</Text></View>
     <Ionicons name="chevron-forward" size={16} color={colors.textMuted}/>
   </Pressable>}
   {/* The picture in the middle, the name under it, and who follows whom in
       one quiet line — the post counts moved down to the Posts / Clips / Tagged row. */}
   <View style={styles.identity}>
     {/* Picture on the left, who you are beside it, the bio under — the way the apps people already use set it. */}
     <View style={styles.identityRow}>
       <Avatar name={user.name} seed={user.avatarSeed} uri={user.avatarUrl} size={80} style={{ backgroundColor: colors.brand }}/>
       <View style={styles.identityWords}>
         <PlayerName userId={user.id} style={styles.name}>{user.name}</PlayerName>
         {/* The streak opens your sessions (only you see them); Log beside it opens the log sheet, two taps from here to a logged session. */}
         <View style={styles.nameRow}><LevelPill profile={profile}/>{user.stats.currentStreakDays >= 2 ? <Pressable accessibilityRole="link" accessibilityLabel={`${user.stats.currentStreakDays}-day streak. See your sessions`} hitSlop={6} onPress={() => router.push('/your-sessions')} style={({ pressed }) => [styles.streak, pressed && styles.pillPressed]}><Ionicons name="flame" size={12} color={colors.clay}/><Text style={styles.streakText}>{user.stats.currentStreakDays}-day streak</Text></Pressable> : null}<Pressable accessibilityRole="button" accessibilityLabel="Log a session" hitSlop={6} onPress={() => router.push('/log-session')} style={({ pressed }) => [styles.logPill, pressed && styles.pillPressed]}><Ionicons name="add" size={13} color={colors.textMuted}/><Text style={styles.logPillText}>Log</Text></Pressable>{profile.constraints.filter(c => c.active && c.kind === 'injury').map(c => <Text key={c.id} style={styles.injury}>⚕ {c.label}</Text>)}</View>
       </View>
     </View>
     {!!user.bio && <Text style={styles.bio}>{user.bio}</Text>}
     <View style={styles.followRow}>
       {([['followers', user.followers, 'followers'], ['following', user.following, 'following']] as const).map(([tab, n, label], i) => <React.Fragment key={tab}>
         {i > 0 && <Text style={styles.followDot}>·</Text>}
         <Pressable accessibilityRole="link" accessibilityLabel={`${n} ${label}`} onPress={() => router.push({ pathname: '/follows', params: { userId: user.id, tab } })} style={styles.follow}>
           <Text style={styles.followCount}>{compactNumber(Number(n))}</Text><Text style={styles.meta}> {label}</Text>
         </Pressable>
       </React.Fragment>)}
     </View>
     <View style={styles.buttons}><View style={{ flex: 1 }}><Button label="Edit Profile" variant="secondary" onPress={() => router.push('/edit-profile')} full/></View><View style={{ flex: 1 }}><Button label="Share" variant="secondary" onPress={share} full/></View></View>
     {!!shareError && <Text style={styles.meta}>{shareError}</Text>}
   </View>
   <Pressable accessibilityRole="link" onPress={() => router.push('/profile-details')} style={styles.tennis}>
     <View style={styles.eyebrowRow}><Text style={styles.eyebrow}>Tennis profile</Text><Ionicons name="chevron-forward" size={15} color={colors.textFaint}/></View>
     <View style={styles.details}>{[['Style',playStyleLabel[profile.playStyle]],['Surface',surfaceLabel[profile.preferredSurface]],...(profile.sessionsPerWeek !== undefined ? [['Availability',`${profile.sessionsPerWeek} sessions / week`]] : []),['Goal',profile.goals[0]?.label ?? 'Set your next goal'],...(profile.gear?.racket ? [['Racket',profile.gear.racket]] : [])].map(([label,value]) => <View key={label} style={styles.detail}><Text style={styles.meta}>{label}</Text><Text style={styles.value}>{value}</Text></View>)}</View>
   </Pressable>
   {/* One grouped list, the way Settings reads, instead of three boxes. */}
   <View style={styles.links}>
     {studio ? <Pressable accessibilityRole="link" accessibilityLabel={`Coach studio. ${studio.line}`} onPress={() => router.push('/coach-studio')} style={({ pressed }) => [styles.linkRow, pressed && styles.linkPressed]}><Ionicons name="ribbon-outline" size={20} color={colors.brand}/><Text style={styles.linkText}>Coach studio</Text>{studio.waiting ? <Text style={styles.linkValue}>{studio.waiting} waiting</Text> : studio.doneCount < 4 ? <Text style={styles.linkValue}>{studio.doneCount} of 4</Text> : null}<Ionicons name="chevron-forward" size={16} color={colors.textFaint}/></Pressable> : null}
     <Pressable accessibilityRole="link" accessibilityLabel="Saved videos and discussions" onPress={() => router.push('/saved')} style={({ pressed }) => [styles.linkRow, studio && styles.linkLine, pressed && styles.linkPressed]}><Ionicons name="bookmark-outline" size={20} color={colors.text}/><Text style={styles.linkText}>Saved</Text>{savedCount ? <Text style={styles.linkValue}>{savedCount}</Text> : null}<Ionicons name="chevron-forward" size={16} color={colors.textFaint}/></Pressable>
     {wrapped ? <Pressable accessibilityRole="link" accessibilityLabel={`Your ${wrapped} in tennis`} onPress={() => router.push('/wrapped')} style={({ pressed }) => [styles.linkRow, styles.linkLine, pressed && styles.linkPressed]}><Ionicons name="sparkles-outline" size={20} color={colors.brand}/><Text style={styles.linkText}>Your {wrapped} in tennis</Text><Ionicons name="chevron-forward" size={16} color={colors.textFaint}/></Pressable> : null}
     {/* Always here, streak or not: the way to every session you logged, and to post one. Only you see it. */}
     <Pressable accessibilityRole="link" accessibilityLabel="Your sessions. Only you see them" onPress={() => router.push('/your-sessions')} style={({ pressed }) => [styles.linkRow, styles.linkLine, pressed && styles.linkPressed]}><Ionicons name="stopwatch-outline" size={20} color={colors.text}/><Text style={styles.linkText}>Your sessions</Text><Ionicons name="lock-closed-outline" size={13} color={colors.textFaint}/><Ionicons name="chevron-forward" size={16} color={colors.textFaint}/></Pressable>
     <Pressable accessibilityRole="link" accessibilityLabel="Invite your hitting partners" onPress={() => router.push('/invite')} style={({ pressed }) => [styles.linkRow, styles.linkLine, pressed && styles.linkPressed]}><Ionicons name="person-add-outline" size={20} color={colors.text}/><Text style={styles.linkText}>Invite your hitting partners</Text><Ionicons name="chevron-forward" size={16} color={colors.textFaint}/></Pressable>
     <Pressable accessibilityRole="link" accessibilityLabel="Health and nutrition" onPress={() => router.push('/health')} style={({ pressed }) => [styles.linkRow, styles.linkLine, pressed && styles.linkPressed]}><Ionicons name="pulse-outline" size={20} color={colors.text}/><Text style={styles.linkText}>Health and nutrition</Text><Ionicons name="chevron-forward" size={16} color={colors.textFaint}/></Pressable>
   </View>
   <View style={styles.tabs} onLayout={e => setTabWidth(e.nativeEvent.layout.width / TABS.length)}>{TABS.map(t => <Pressable key={t} accessibilityRole="tab" accessibilityState={{selected:selected===t}} accessibilityLabel={`${LABEL[t]}, ${counts[t]}`} onPress={() => setTab(t)} style={styles.tab}><Text style={[typography.body, selected===t ? { ...font('600'), color: colors.text } : { color: colors.textMuted }]}>{LABEL[t]}<Text style={[styles.tabCount, selected===t && { color: colors.brand }]}>  {compactNumber(counts[t])}</Text></Text></Pressable>)}
     {tabWidth > 0 && (live
       ? <Reanimated.View pointerEvents="none" style={[styles.tabIndicator, { width: tabWidth }, underline.style]} />
       : <View pointerEvents="none" style={[styles.tabIndicator, { width: tabWidth, left: index * tabWidth }]} />)}
   </View>
   {live
     // Under the tab line only the grid slides, all three grids riding side by
     // side. A swipe right from Posts is handed up to the tab row (Coaching).
     ? <SectionPager index={index} panes={grids} progress={underline.progress} depth={2} delegateRight onIndex={(i) => setTab(TABS[i])} />
     : content(selected)}
  </>;
  // The top half never slides between sections: above the line, a swipe is
  // the tab row's (Profile to Coaching). Only the grid below the line changes.
  return body;
 };
 return <Screen memoryKey="profile" title="Profile" wash subtitle={`@${user.handle}`} onRefresh={previewSection === undefined && !isDesktopBrowser() ? actions.refresh : undefined} right={<View style={styles.headerActions}>
   {/* Never folded away by the phone's renderer (a plain box can be), or the tutorial could not measure it. */}
   <View ref={tourInbox} collapsable={false} style={styles.headerActions}>
     <Tappable accessibilityRole="link" accessibilityLabel={unseen ? `Notifications, ${unseen} new` : 'Notifications'} onPress={() => router.push('/notifications')} hitSlop={10} style={styles.headerButton}>
       <Ionicons name={unseen ? 'notifications' : 'notifications-outline'} size={27} color={colors.text}/>
       <UnreadBadge count={unseen} />
     </Tappable>
     <InboxButton size={27} />
   </View>
   <Tappable accessibilityRole="link" accessibilityLabel="Settings" onPress={() => router.push('/settings')} hitSlop={10} style={styles.headerButton}>
     <Ionicons name="menu-outline" size={30} color={colors.text}/>
   </Tappable>
 </View>}>
   {page(tab, previewSection === undefined)}
 </Screen>;
}
/**
 * The profile page before the account has come down: your picture (kept on
 * the phone from last time) and name, and every other part of the page in
 * its place but empty. The real numbers and words then fill in.
 */
function ProfileSkeleton({ name, avatarUrl, seed }: { name?: string; avatarUrl?: string; seed: string }) {
  const styles = useThemedStyles(styleDefinitions);
  const breathe = useSharedValue(0);
  useEffect(() => {
    breathe.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }), -1, true);
    return () => cancelAnimation(breathe);
  }, [breathe]);
  const pulse = useAnimatedStyle(() => ({ opacity: 0.5 + 0.3 * breathe.value }));
  const Blank = ({ w, h = 12 }: { w: number; h?: number }) => <Reanimated.View style={[{ width: w, height: h, borderRadius: h / 2, backgroundColor: colors.surfaceAlt }, pulse]} />;
  return <>
   <View style={styles.identity}>
     <Avatar name={name ?? ''} seed={seed} uri={avatarUrl} size={92} style={{ backgroundColor: colors.brand, alignSelf: 'center' }}/>
     <View style={styles.nameRow}>{name ? <Text style={styles.name}>{name}</Text> : <Blank w={120} h={20} />}</View>
     <View style={styles.followRow}><Blank w={64} /><Text style={styles.followDot}>·</Text><Blank w={64} /></View>
     <View style={styles.buttons}><View style={{ flex: 1 }}><Button label="Edit Profile" variant="secondary" disabled onPress={() => undefined} full/></View><View style={{ flex: 1 }}><Button label="Share" variant="secondary" disabled onPress={() => undefined} full/></View></View>
   </View>
   <View style={styles.tennis}>
     <Text style={styles.eyebrow}>Tennis profile</Text>
     <View style={styles.details}>{['Style', 'Surface', 'Availability', 'Goal'].map((label) => <View key={label} style={styles.detail}><Text style={styles.meta}>{label}</Text><View style={{ paddingVertical: 3 }}><Blank w={90} /></View></View>)}</View>
   </View>
   <View style={styles.links}>
     <View style={styles.linkRow}><Ionicons name="bookmark-outline" size={20} color={colors.text}/><Text style={styles.linkText}>Saved</Text></View>
     <View style={[styles.linkRow, styles.linkLine]}><Ionicons name="stopwatch-outline" size={20} color={colors.text}/><Text style={styles.linkText}>Your sessions</Text></View>
     <View style={[styles.linkRow, styles.linkLine]}><Ionicons name="person-add-outline" size={20} color={colors.text}/><Text style={styles.linkText}>Invite your hitting partners</Text></View>
     <View style={[styles.linkRow, styles.linkLine]}><Ionicons name="pulse-outline" size={20} color={colors.text}/><Text style={styles.linkText}>Health and nutrition</Text></View>
   </View>
   <View style={styles.tabs}>{['All', 'Clips', 'Tagged'].map((t, i) => <View key={t} style={styles.tab}><Text style={[typography.body, i === 0 ? { ...font('600'), color: colors.text } : { color: colors.textMuted }]}>{t}</Text></View>)}</View>
   <View style={styles.grid}>{[0, 1, 2].map((i) => <Reanimated.View key={i} style={[styles.tile, pulse]} />)}</View>
  </>;
}

const styleDefinitions = StyleSheet.create({
 setup:{marginTop:16,marginHorizontal:0,padding:14,borderRadius:16,backgroundColor:colors.brandDim,flexDirection:'row',alignItems:'center',gap:12},setupTitle:{...typography.smallStrong,fontSize:14,color:colors.text},identity:{gap:12,paddingTop:16,paddingBottom:20,alignItems:'stretch'},identityRow:{flexDirection:'row',alignItems:'center',gap:16},identityWords:{flex:1,gap:6,minWidth:0},meta:{fontSize:12,color:colors.textMuted,lineHeight:19},nameRow:{flexDirection:'row',gap:10,alignItems:'center',flexWrap:'wrap'},name:{...typography.title,fontSize:22,color:colors.text},bio:{...typography.body,lineHeight:22,color:colors.text},followRow:{flexDirection:'row',alignItems:'center',gap:10},follow:{flexDirection:'row',alignItems:'baseline'},followCount:{...typography.bodyStrong,color:colors.text},followDot:{color:colors.textFaint,fontSize:14},tabCount:{...typography.smallStrong,fontSize:12,color:colors.textFaint},injury:{...typography.small,color:colors.danger},buttons:{flexDirection:'row',gap:8,alignSelf:'stretch',marginTop:6},settings:{borderWidth:1,borderColor:colors.border,borderRadius:10,padding:10,justifyContent:'center'},streak:{flexDirection:'row',alignItems:'center',gap:3,paddingHorizontal:8,paddingVertical:2,borderRadius:999,backgroundColor:colors.bgElevated},streakText:{...typography.caption,letterSpacing:0,fontWeight:'600',color:colors.clay},
 // "Log" beside the streak: the streak pill's size, in plain ink, so the streak stays the louder of the two.
 logPill:{flexDirection:'row',alignItems:'center',gap:2,paddingLeft:6,paddingRight:9,paddingVertical:2,borderRadius:999,borderWidth:StyleSheet.hairlineWidth,borderColor:colors.borderStrong},logPillText:{...typography.caption,letterSpacing:0,fontWeight:'600',color:colors.textMuted},pillPressed:{opacity:0.6},
 tennis:{...lift,padding:16,borderRadius:20,backgroundColor:colors.surface,gap:10},eyebrowRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},eyebrow:{...typography.smallStrong,color:colors.textMuted},links:{...lift,marginTop:12,borderRadius:20,backgroundColor:colors.surface,overflow:'hidden'},linkRow:{flexDirection:'row',alignItems:'center',gap:12,minHeight:52,paddingVertical:11,paddingHorizontal:16},linkLine:{borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:colors.border},linkPressed:{backgroundColor:colors.surfaceAlt},linkText:{...typography.body,color:colors.text,flex:1},linkValue:{...typography.body,color:colors.textMuted},details:{flexDirection:'row',flexWrap:'wrap',gap:8},detail:{width:'46%',gap:2},value:{fontSize:13,color:colors.text,lineHeight:19},health:{padding:15,marginTop:12,borderWidth:1,borderColor:colors.border,borderRadius:12,flexDirection:'row',alignItems:'center',gap:10},headerActions:{flexDirection:'row',alignItems:'center',gap:14},headerButton:{padding:4},tabs:{flexDirection:'row',marginTop:16,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:colors.border},tab:{flex:1,alignItems:'center',paddingVertical:18},tabIndicator:{position:'absolute',left:0,bottom:-2,height:2,backgroundColor:colors.brand,borderRadius:1},grid:{flexDirection:'row',flexWrap:'wrap',marginHorizontal:0},
 // Instagram's grid: tall tiles, the thumbnail and nothing else on it.
 tile:{borderWidth:1,borderColor:colors.bg,backgroundColor:colors.surfaceAlt,overflow:'hidden'},
 tileBlank:{padding:10,justifyContent:'center'},
 tileText:{fontSize:11,lineHeight:15,color:colors.textMuted},
 tilePlay:{position:'absolute',top:6,right:6,textShadowColor:'rgba(0,0,0,0.6)',textShadowRadius:3},
 tileViews:{position:'absolute',left:6,bottom:5,flexDirection:'row',alignItems:'center',gap:3},
 tileViewsText:{fontSize:12,...font('600'),color:'#FFFFFF',textShadowColor:'rgba(0,0,0,0.6)',textShadowRadius:3},
});

export default asTabRoute<{ previewSection?: string }>(Profile);
