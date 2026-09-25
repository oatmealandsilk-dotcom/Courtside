import { asTabRoute } from '@/features/navigation/tabFocus';
import { PlayerName } from '@/components/PlayerName';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { Image as ExpoImage } from 'expo-image';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { readSkipped, type SetupStep } from '@/features/onboarding/setupProgress';
import { Image, Pressable, Share, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Avatar, Button, EmptyState, Screen } from '@/components/ui';
import { SectionPager } from '@/components/SectionPager';
import Reanimated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useTabUnderline } from '@/features/navigation/useTabUnderline';
import { Tappable } from '@/components/Tappable';
import { reportSection, requestSection, subscribeSectionRequest, swipeDestination } from '@/features/navigation/swipeOrder';
import { LevelPill } from '@/components/LevelPill';
import { useApp } from '@/store/AppContext';
import { playStyleLabel, surfaceLabel } from '@/lib/badges';
import { compactNumber } from '@/lib/format';
import { colors, spacing, typography, font } from '@/theme';

function Profile({ previewSection }: { previewSection?: string } = {}) {
  const styles = useThemedStyles(styleDefinitions);
 const { currentUser: user, posts, saved, conversations, notifications, currentUserId, savedAccounts, actions } = useApp();
 // Your own posts, however far back they go: the grid and the counts are
 // yours entirely, not just whichever of them the feed happens to hold.
 useEffect(() => { if (user?.id) void actions.loadPostsOf(user.id); }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
 const { width: windowWidth } = useWindowDimensions();
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
 const tabIndex = TABS.indexOf(tab);
 const [tabWidth, setTabWidth] = useState(0);
 const underline = useTabUnderline(tabIndex, TABS.length, tabWidth);
 const own = posts.filter(p => p.authorId === user?.id && !p.archived);
 const shown = (tab === 'Tagged' ? posts.filter(p => !!user && p.taggedUserIds?.includes(user.id) && !p.archived) : own.filter(p => tab !== 'Clips' || p.kind === 'clip')).sort((a,b) => Date.parse(b.createdAt)-Date.parse(a.createdAt));
 // How many of each, shown beside the section names.
 const counts: Record<typeof TABS[number], number> = {
   Posts: own.length,
   Clips: own.filter(p => p.kind === 'clip').length,
   Tagged: user ? posts.filter(p => p.taggedUserIds?.includes(user.id) && !p.archived).length : 0,
 };
 const unread = conversations.reduce((sum, c) => sum + c.unreadCount, 0);
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
   const items = (selected === 'Tagged' ? posts.filter(p => p.taggedUserIds?.includes(user.id) && !p.archived) : own.filter(p => selected !== 'Clips' || p.kind === 'clip')).sort((a,b) => Number(!!b.pinned) - Number(!!a.pinned) || Date.parse(b.createdAt)-Date.parse(a.createdAt));
   return <View style={{ minHeight: 320, backgroundColor: colors.bg }}>
     <View style={styles.grid} onLayout={(e) => { const w = Math.floor(e.nativeEvent.layout.width); if (w > 0 && w !== gridW) setGridW(w); }}>{items.map(p => <Pressable key={p.id} accessibilityRole="link" accessibilityLabel={`Open ${p.kind}: ${p.body}`} onPress={() => router.push({ pathname: '/posts/[userId]', params: { userId: user.id, post: p.id, set: selected === 'Clips' ? 'clips' : selected === 'Tagged' ? 'tagged' : 'own' } })} style={[styles.tile, { width: tileW, height: tileH }]}>
       <View style={[StyleSheet.absoluteFill, styles.tileBlank]}><Text numberOfLines={5} style={styles.tileText}>{p.body}</Text></View>
       {p.thumbnailUrl ? <ExpoImage accessibilityIgnoresInvertColors source={{uri:p.thumbnailUrl}} style={StyleSheet.absoluteFill} contentFit="cover" recyclingKey={p.id} transition={120}/> : null}
       {p.kind==='clip' && <Ionicons name="play" size={14} color="#FFFFFF" style={styles.tilePlay}/>}
       {p.pinned && selected !== 'Tagged' && <Ionicons name="pin" size={13} color="#FFFFFF" style={styles.tilePin}/>}
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
   {skipped.length > 0 && <Pressable accessibilityRole="link" accessibilityLabel="Finish setting up your profile" onPress={() => router.push({ pathname: '/onboarding', params: { step: String(SETUP_STEP_INDEX[skipped[0]]) } })} style={styles.setup}>
     <Ionicons name="sparkles-outline" size={20} color={colors.brand}/>
     <View style={{ flex: 1 }}><Text style={styles.setupTitle}>Finish setting up</Text><Text style={styles.meta}>{[skipped.includes('permissions') && 'camera and photos', skipped.includes('body') && 'fitness and goals', skipped.includes('calendar') && 'your next tournament'].filter(Boolean).join(', ').replace(/^./, (c) => c.toUpperCase())} — about a minute.</Text></View>
     <Ionicons name="chevron-forward" size={16} color={colors.textMuted}/>
   </Pressable>}
   {/* The picture in the middle, the name under it, and who follows whom in
       one quiet line — the post counts moved down to the Posts / Clips / Tagged row. */}
   <View style={styles.identity}>
     <Avatar name={user.name} seed={user.avatarSeed} uri={user.avatarUrl} size={92} style={{ backgroundColor: colors.brand, alignSelf: 'center' }}/>
     <View style={styles.nameRow}><PlayerName userId={user.id} style={styles.name}>{user.name}</PlayerName><LevelPill profile={profile}/></View>
     {!!user.bio && <Text style={styles.bio}>{user.bio}</Text>}
     {profile.constraints.filter(c => c.active && c.kind === 'injury').map(c => <Text key={c.id} style={styles.injury}>⚕ {c.label}</Text>)}
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
     <Text style={styles.eyebrow}>TENNIS PROFILE</Text>
     <View style={styles.details}>{[['Style',playStyleLabel[profile.playStyle]],['Surface',surfaceLabel[profile.preferredSurface]],['Availability',`${profile.sessionsPerWeek} sessions / week`],['Goal',profile.goals[0]?.label ?? 'Set your next goal']].map(([label,value]) => <View key={label} style={styles.detail}><Text style={styles.meta}>{label}</Text><Text style={styles.value}>{value}</Text></View>)}</View>
   </Pressable>
   <Pressable accessibilityRole="link" accessibilityLabel="Saved videos and discussions" onPress={() => router.push('/saved')} style={styles.health}><Ionicons name="bookmark-outline" size={20} color={colors.brand}/><Text style={[styles.meta,{flex:1}]}>Saved{savedCount ? ` · ${savedCount}` : ''}</Text><Ionicons name="chevron-forward" size={16} color={colors.textMuted}/></Pressable>
   <Pressable accessibilityRole="link" onPress={() => router.push('/health')} style={styles.health}><Ionicons name="flash-outline" size={20} color={colors.warning}/><Text style={[styles.meta,{flex:1}]}>Apple Health · Whoop · Cronometer</Text><Ionicons name="chevron-forward" size={16} color={colors.textMuted}/></Pressable>
   <View style={styles.tabs} onLayout={e => setTabWidth(e.nativeEvent.layout.width / TABS.length)}>{TABS.map(t => <Pressable key={t} accessibilityRole="tab" accessibilityState={{selected:selected===t}} accessibilityLabel={`${t}, ${counts[t]}`} onPress={() => setTab(t)} style={styles.tab}><Text style={[typography.body, selected===t ? { ...font('600'), color: colors.text } : { color: colors.textMuted }]}>{t}<Text style={[styles.tabCount, selected===t && { color: colors.brand }]}>  {compactNumber(counts[t])}</Text></Text></Pressable>)}
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
 return <Screen memoryKey="profile" title="Profile" wash subtitle={`@${user.handle}`} onRefresh={previewSection === undefined ? actions.refresh : undefined} right={<View style={styles.headerActions}>
   <Tappable accessibilityRole="link" accessibilityLabel={unseen ? `Notifications, ${unseen} new` : 'Notifications'} onPress={() => router.push('/notifications')} hitSlop={10} style={styles.headerButton}>
     <Ionicons name={unseen ? 'notifications' : 'notifications-outline'} size={27} color={colors.text}/>
     {unseen > 0 && <View style={styles.headerBadge}><Text style={styles.headerBadgeText}>{unseen > 9 ? '9+' : unseen}</Text></View>}
   </Tappable>
   <Tappable accessibilityRole="link" accessibilityLabel={unread ? `Messages, ${unread} unread` : 'Messages'} onPress={() => router.push('/messages')} hitSlop={10} style={styles.headerButton}>
     <Ionicons name={unread ? 'paper-plane' : 'paper-plane-outline'} size={27} color={colors.text}/>
     {unread > 0 && <View style={styles.headerBadge}><Text style={styles.headerBadgeText}>{unread > 9 ? '9+' : unread}</Text></View>}
   </Tappable>
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
     <Text style={styles.eyebrow}>TENNIS PROFILE</Text>
     <View style={styles.details}>{['Style', 'Surface', 'Availability', 'Goal'].map((label) => <View key={label} style={styles.detail}><Text style={styles.meta}>{label}</Text><View style={{ paddingVertical: 3 }}><Blank w={90} /></View></View>)}</View>
   </View>
   <View style={styles.health}><Ionicons name="bookmark-outline" size={20} color={colors.brand}/><Text style={[styles.meta,{flex:1}]}>Saved</Text><Ionicons name="chevron-forward" size={16} color={colors.textMuted}/></View>
   <View style={styles.health}><Ionicons name="flash-outline" size={20} color={colors.warning}/><Text style={[styles.meta,{flex:1}]}>Apple Health · Whoop · Cronometer</Text><Ionicons name="chevron-forward" size={16} color={colors.textMuted}/></View>
   <View style={styles.tabs}>{['Posts', 'Clips', 'Tagged'].map((t, i) => <View key={t} style={styles.tab}><Text style={[typography.body, i === 0 ? { ...font('600'), color: colors.text } : { color: colors.textMuted }]}>{t}</Text></View>)}</View>
   <View style={styles.grid}>{[0, 1, 2].map((i) => <Reanimated.View key={i} style={[styles.tile, pulse]} />)}</View>
  </>;
}

const styleDefinitions = StyleSheet.create({
 setup:{marginTop:16,marginHorizontal:0,padding:14,borderWidth:1,borderColor:colors.brand,borderRadius:12,backgroundColor:colors.brandDim,flexDirection:'row',alignItems:'center',gap:12},setupTitle:{...typography.smallStrong,fontSize:14,color:colors.text},identity:{gap:10,paddingTop:22,paddingBottom:24,paddingHorizontal:12,alignItems:'center'},meta:{fontSize:12,color:colors.textMuted,lineHeight:19},nameRow:{flexDirection:'row',gap:10,alignItems:'center',justifyContent:'center',flexWrap:'wrap',marginTop:4},name:{...typography.title,fontSize:21,color:colors.text},bio:{fontSize:14,lineHeight:21,color:colors.textMuted,textAlign:'center',maxWidth:320},followRow:{flexDirection:'row',alignItems:'center',gap:10},follow:{flexDirection:'row',alignItems:'baseline'},followCount:{...typography.bodyStrong,color:colors.text},followDot:{color:colors.textFaint,fontSize:14},tabCount:{...typography.smallStrong,fontSize:12,color:colors.textFaint},injury:{fontSize:13,color:colors.danger},buttons:{flexDirection:'row',gap:8,alignSelf:'stretch',marginTop:6},settings:{borderWidth:1,borderColor:colors.border,borderRadius:10,padding:10,justifyContent:'center'},tennis:{padding:12,borderWidth:1,borderColor:colors.border,borderRadius:12,backgroundColor:colors.surface,gap:8},eyebrow:{...typography.caption,letterSpacing:1.1,color:colors.textMuted},details:{flexDirection:'row',flexWrap:'wrap',gap:8},detail:{width:'46%',gap:2},value:{fontSize:13,color:colors.text,lineHeight:19},health:{padding:15,marginTop:12,borderWidth:1,borderColor:colors.border,borderRadius:12,flexDirection:'row',alignItems:'center',gap:10},headerActions:{flexDirection:'row',alignItems:'center',gap:14},headerButton:{padding:4},headerBadge:{position:'absolute',top:-1,right:-2,minWidth:18,height:18,borderRadius:9,paddingHorizontal:5,backgroundColor:colors.danger,alignItems:'center',justifyContent:'center',borderWidth:2,borderColor:colors.bg},headerBadgeText:{...typography.caption,fontSize:10,color:'white'},tabs:{flexDirection:'row',marginTop:16,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:colors.border},tab:{flex:1,alignItems:'center',paddingVertical:18},tabIndicator:{position:'absolute',left:0,bottom:-2,height:2,backgroundColor:colors.brand,borderRadius:1},grid:{flexDirection:'row',flexWrap:'wrap',marginHorizontal:0},
 // Instagram's grid: tall tiles, the thumbnail and nothing else on it.
 tile:{borderWidth:1,borderColor:colors.bg,backgroundColor:colors.surfaceAlt,overflow:'hidden'},
 tileBlank:{padding:10,justifyContent:'center'},
 tileText:{fontSize:11,lineHeight:15,color:colors.textMuted},
 tilePlay:{position:'absolute',top:6,right:6,textShadowColor:'rgba(0,0,0,0.6)',textShadowRadius:3},
 tilePin:{position:'absolute',top:6,left:6,textShadowColor:'rgba(0,0,0,0.6)',textShadowRadius:3},
});

export default asTabRoute<{ previewSection?: string }>(Profile);
