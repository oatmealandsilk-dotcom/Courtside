import { PlayerName } from '@/components/PlayerName';
import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Avatar, Button, EmptyState, Screen } from '@/components/ui';
import Coaches from './coaches';
import { SwipeSurface } from '@/components/SwipeSurface';
import { Tappable } from '@/components/Tappable';
import { swipeDestination } from '@/features/navigation/swipeOrder';
import { LevelPill } from '@/components/LevelPill';
import { useApp } from '@/store/AppContext';
import { playStyleLabel, surfaceLabel } from '@/lib/badges';
import { compactNumber } from '@/lib/format';
import { colors } from '@/theme';

export default function Profile({ previewSection }: { previewSection?: string } = {}) {
  const styles = useThemedStyles(styleDefinitions);
 const { currentUser: user, posts, saved, conversations, notifications, currentUserId } = useApp();
 const params = useLocalSearchParams<{ section?: string }>();
 const section = previewSection ?? params.section;
 const tab = section === 'Clips' || section === 'Tagged' ? section : 'Posts';
 const setTab = (section: string) => router.setParams({ section });
 const [shareError, setShareError] = useState('');
 // The underline under Posts / Clips / Tagged travels with the finger during a
 // swipe and glides on a tap, instead of jumping once the page changes.
 const TABS = ['Posts', 'Clips', 'Tagged'] as const;
 const tabIndex = TABS.indexOf(tab);
 const indicator = useRef(new Animated.Value(tabIndex)).current;
 const [tabWidth, setTabWidth] = useState(0);
 useEffect(() => {
   Animated.timing(indicator, { toValue: tabIndex, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
 }, [tabIndex, indicator]);
 const onProgress = (fraction: number) => {
   const target = tabIndex + fraction;
   if (target < 0 || target > TABS.length - 1) return;
   indicator.setValue(target);
 };
 if (!user) return <Screen memoryKey="profile" title="Profile"><EmptyState title="Loading your profile"/></Screen>;
 const own = posts.filter(p => p.authorId === user.id && !p.archived);
 const shown = (tab === 'Tagged' ? posts.filter(p => p.taggedUserIds?.includes(user.id) && !p.archived) : own.filter(p => tab !== 'Clips' || p.kind === 'clip')).sort((a,b) => Date.parse(b.createdAt)-Date.parse(a.createdAt));
 const profile = user.profile;
 const share = () => router.push(`/share?kind=profile&id=${user.id}`);
 const unread = conversations.reduce((sum, c) => sum + c.unreadCount, 0);
 const unseen = notifications.filter(n => n.userId === currentUserId && !n.read).length;
 const savedCount = saved.postIds.length + saved.questionIds.length;
 const swipe = (direction: 1 | -1) => {
   const next = swipeDestination('/profile', tab, direction);
   if (next) router.navigate({ pathname: next.pathname, params: { section: next.section } });
 };
 const content = (selected: string) => {
   const items = (selected === 'Tagged' ? posts.filter(p => p.taggedUserIds?.includes(user.id) && !p.archived) : own.filter(p => selected !== 'Clips' || p.kind === 'clip')).sort((a,b) => Date.parse(b.createdAt)-Date.parse(a.createdAt));
   return <View style={{ minHeight: 320, backgroundColor: colors.bg }}>
     <View style={styles.grid}>{items.map(p => <Pressable key={p.id} accessibilityRole="link" accessibilityLabel={`Open ${p.kind}: ${p.body}`} onPress={() => router.push({ pathname: '/posts/[userId]', params: { userId: user.id, post: p.id, set: selected === 'Clips' ? 'clips' : selected === 'Tagged' ? 'tagged' : 'own' } })} style={styles.tile}>{p.thumbnailUrl ? <><Image accessibilityIgnoresInvertColors source={{uri:p.thumbnailUrl}} style={StyleSheet.absoluteFill} resizeMode="cover"/><View pointerEvents="none" style={styles.tileScrim}/></> : null}<Ionicons name={p.kind==='clip'?'play':'document-text-outline'} size={18} color={p.thumbnailUrl ? '#FFFFFF' : colors.text} style={{alignSelf:'flex-end'}}/><Text numberOfLines={4} style={[styles.tileText, {color: p.thumbnailUrl ? '#FFFFFF' : colors.text}]}>{p.body}</Text><View style={styles.tileFoot}><Text style={[styles.tileLabel, {color: p.thumbnailUrl ? '#FFFFFF' : colors.textMuted}]}>{p.kind==='match'?'SET PLAY':p.kind.toUpperCase()}</Text><View style={styles.tileViews}><Ionicons name={p.kind==='clip'?'play':'stats-chart'} size={p.kind==='clip'?10:9} color={p.thumbnailUrl ? '#FFFFFF' : colors.textMuted}/><Text style={[styles.tileLabel, {color: p.thumbnailUrl ? '#FFFFFF' : colors.textMuted}]}>{compactNumber(p.views ?? 0)}</Text></View></View></Pressable>)}</View>
     {!items.length && <EmptyState title={selected==='Tagged'?'No tagged posts yet':`No ${selected.toLowerCase()} yet`} body="Your shared moments will appear here."/>}
   </View>;
 };
 return <Screen memoryKey="profile" title="Profile" subtitle={`@${user.handle}`} right={<View style={styles.headerActions}>
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
   <SwipeSurface fill={false} enabled={!previewSection} onSwipe={direction => { if (direction === -1) router.navigate('/coaches'); }} renderPreview={direction => direction === -1 ? <Coaches/> : null}>
   <View style={styles.identity}>
     <View style={styles.stats}><Avatar name={user.name} seed={user.avatarSeed} size={72} style={{ backgroundColor: colors.brand }}/>{[[own.length,'Posts'],[user.followers,'Followers'],[user.following,'Following']].map(([n,label]) => label === 'Posts'
       ? <View key={label} style={styles.stat}><Text style={styles.count}>{compactNumber(Number(n))}</Text><Text style={styles.meta}>{label}</Text></View>
       : <Pressable key={label} accessibilityRole="link" accessibilityLabel={`${n} ${label}`} onPress={() => router.push({ pathname: '/follows', params: { userId: user.id, tab: label === 'Followers' ? 'followers' : 'following' } })} style={styles.stat}><Text style={styles.count}>{compactNumber(Number(n))}</Text><Text style={styles.meta}>{label}</Text></Pressable>)}</View>
     <View style={styles.nameRow}><PlayerName userId={user.id} style={styles.name}>{user.name}</PlayerName><LevelPill profile={profile}/></View>
     <Text style={styles.bio}>{user.bio}</Text>
     {profile.constraints.filter(c => c.active && c.kind === 'injury').map(c => <Text key={c.id} style={styles.injury}>⚕ {c.label}</Text>)}
     <View style={styles.buttons}><View style={{ flex: 1 }}><Button label="Edit Profile" variant="secondary" onPress={() => router.push('/edit-profile')} full/></View><View style={{ flex: 1 }}><Button label="Share" variant="secondary" onPress={share} full/></View></View>
     {!!shareError && <Text style={styles.meta}>{shareError}</Text>}
   </View>
   <Pressable accessibilityRole="link" onPress={() => router.push('/profile-details')} style={styles.tennis}>
     <Text style={styles.eyebrow}>TENNIS PROFILE</Text>
     <View style={styles.details}>{[['Style',playStyleLabel[profile.playStyle]],['Surface',surfaceLabel[profile.preferredSurface]],['Availability',`${profile.sessionsPerWeek} sessions / week`],['Goal',profile.goals[0]?.label ?? 'Set your next goal']].map(([label,value]) => <View key={label} style={styles.detail}><Text style={styles.meta}>{label}</Text><Text style={styles.value}>{value}</Text></View>)}</View>
   </Pressable>
   <Pressable accessibilityRole="link" accessibilityLabel="Saved videos and discussions" onPress={() => router.push('/saved')} style={styles.health}><Ionicons name="bookmark-outline" size={20} color={colors.brand}/><Text style={[styles.meta,{flex:1}]}>Saved{savedCount ? ` · ${savedCount}` : ''}</Text><Ionicons name="chevron-forward" size={16} color={colors.textMuted}/></Pressable>
   <Pressable accessibilityRole="link" onPress={() => router.push('/health')} style={styles.health}><Ionicons name="flash-outline" size={20} color={colors.warning}/><Text style={[styles.meta,{flex:1}]}>Apple Health · Whoop · Cronometer</Text><Ionicons name="chevron-forward" size={16} color={colors.textMuted}/></Pressable>
   </SwipeSurface>
   <View style={styles.tabs} onLayout={e => setTabWidth(e.nativeEvent.layout.width / TABS.length)}>{TABS.map(t => <Pressable key={t} accessibilityRole="tab" accessibilityState={{selected:tab===t}} onPress={() => setTab(t)} style={styles.tab}><Text style={{color:tab===t?colors.brand:colors.textMuted,fontWeight:tab===t?'700':'400'}}>{t}</Text></Pressable>)}
     {tabWidth > 0 && <Animated.View pointerEvents="none" style={[styles.tabIndicator, { width: tabWidth, transform: [{ translateX: Animated.multiply(indicator, tabWidth) }] }]} />}
   </View>
   <SwipeSurface fill={false} enabled={!previewSection} onSwipe={swipe} onProgress={onProgress} renderPreview={direction => {
     const next = swipeDestination('/profile', tab, direction);
     if (next?.pathname === '/profile') return content(next.section);
     // From Posts, a swipe right leaves the profile for Coaching.
     return next?.pathname === '/coaches' ? <Coaches/> : null;
   }}>{content(tab)}</SwipeSurface>
 </Screen>;
}
const styleDefinitions = StyleSheet.create({
 identity:{gap:14,paddingTop:22,paddingBottom:24,paddingHorizontal:12},stats:{flexDirection:'row',alignItems:'center',gap:18,marginBottom:12},stat:{flex:1,alignItems:'center',gap:5},count:{fontSize:20,fontWeight:'700',color:colors.text},meta:{fontSize:12,color:colors.textMuted,lineHeight:19},nameRow:{flexDirection:'row',gap:10,alignItems:'center',flexWrap:'wrap'},name:{fontSize:18,fontWeight:'700',color:colors.text},bio:{fontSize:14,lineHeight:21,color:colors.textMuted},injury:{fontSize:13,color:colors.danger},buttons:{flexDirection:'row',gap:8},settings:{borderWidth:1,borderColor:colors.border,borderRadius:10,padding:10,justifyContent:'center'},tennis:{padding:12,borderWidth:1,borderColor:colors.border,borderRadius:12,backgroundColor:colors.surface,gap:8},eyebrow:{letterSpacing:1.2,fontSize:11,fontWeight:'700',color:colors.textMuted},details:{flexDirection:'row',flexWrap:'wrap',gap:8},detail:{width:'46%',gap:2},value:{fontSize:13,color:colors.text,lineHeight:19},health:{padding:15,marginTop:12,borderWidth:1,borderColor:colors.border,borderRadius:12,flexDirection:'row',alignItems:'center',gap:10},headerActions:{flexDirection:'row',alignItems:'center',gap:14},headerButton:{padding:4},headerBadge:{position:'absolute',top:-1,right:-2,minWidth:18,height:18,borderRadius:9,paddingHorizontal:5,backgroundColor:colors.danger,alignItems:'center',justifyContent:'center',borderWidth:2,borderColor:colors.bg},headerBadgeText:{color:'white',fontSize:10,fontWeight:'800'},tabs:{flexDirection:'row',marginTop:16,borderBottomWidth:2,borderBottomColor:colors.border},tab:{flex:1,alignItems:'center',paddingVertical:18},tabIndicator:{position:'absolute',left:0,bottom:-2,height:2,backgroundColor:colors.brand,borderRadius:1},grid:{flexDirection:'row',flexWrap:'wrap',marginHorizontal:0},tile:{width:'33.333333%',aspectRatio:1,borderWidth:1,borderColor:colors.bg,backgroundColor:colors.surfaceAlt,padding:10,justifyContent:'space-between'},tileScrim:{position:'absolute',top:0,left:0,right:0,bottom:0,backgroundColor:colors.overlay},tileFoot:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:4},tileViews:{flexDirection:'row',alignItems:'center',gap:3},tileText:{fontSize:11,lineHeight:15,color:colors.text},tileLabel:{fontSize:8,color:colors.textMuted,letterSpacing:1},
});
