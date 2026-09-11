import { PlayerName } from '@/components/PlayerName';
import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useState } from 'react';
import { Image, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Avatar, Button, EmptyState, Screen } from '@/components/ui';
import Coaches from './coaches';
import { SwipeSurface } from '@/components/SwipeSurface';
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
 const tab = section === 'Reels' || section === 'Tagged' ? section : 'Posts';
 const setTab = (section: string) => router.setParams({ section });
 const [shareError, setShareError] = useState('');
 if (!user) return <Screen title="Profile"><EmptyState title="Loading your profile"/></Screen>;
 const own = posts.filter(p => p.authorId === user.id);
 const shown = (tab === 'Tagged' ? posts.filter(p => p.taggedUserIds?.includes(user.id)) : own.filter(p => tab !== 'Reels' || p.kind === 'reel')).sort((a,b) => Date.parse(b.createdAt)-Date.parse(a.createdAt));
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
   const items = (selected === 'Tagged' ? posts.filter(p => p.taggedUserIds?.includes(user.id)) : own.filter(p => selected !== 'Reels' || p.kind === 'reel')).sort((a,b) => Date.parse(b.createdAt)-Date.parse(a.createdAt));
   return <View style={{ minHeight: 320, backgroundColor: colors.bg }}>
     <View style={styles.grid}>{items.map(p => <Pressable key={p.id} accessibilityRole="link" accessibilityLabel={`Open ${p.kind}: ${p.body}`} onPress={() => router.push(`/post/${p.id}`)} style={styles.tile}>{p.thumbnailUrl ? <><Image accessibilityIgnoresInvertColors source={{uri:p.thumbnailUrl}} style={StyleSheet.absoluteFill} resizeMode="cover"/><View pointerEvents="none" style={styles.tileScrim}/></> : null}<Ionicons name={p.kind==='reel'?'play':'document-text-outline'} size={18} color="#D7DDCB" style={{alignSelf:'flex-end'}}/><Text numberOfLines={4} style={styles.tileText}>{p.body}</Text><Text style={styles.tileLabel}>{p.kind==='match'?'SET PLAY':p.kind.toUpperCase()}</Text></Pressable>)}</View>
     {!items.length && <EmptyState title={selected==='Tagged'?'No tagged posts yet':`No ${selected.toLowerCase()} yet`} body="Your shared moments will appear here."/>}
   </View>;
 };
 return <SwipeSurface enabled={!previewSection} onSwipe={direction => { if (direction === -1) router.navigate('/coaches'); }} renderPreview={direction => direction === -1 ? <Coaches/> : null}><Screen title="Profile" subtitle={`@${user.handle}`} right={<View style={styles.headerActions}>
   <Pressable accessibilityRole="link" accessibilityLabel={unseen ? `Notifications, ${unseen} new` : 'Notifications'} onPress={() => router.push('/notifications')} hitSlop={8}>
     <Ionicons name={unseen ? 'notifications' : 'notifications-outline'} size={23} color={colors.text}/>
     {unseen > 0 && <View style={styles.headerBadge}><Text style={styles.headerBadgeText}>{unseen > 9 ? '9+' : unseen}</Text></View>}
   </Pressable>
   <Pressable accessibilityRole="link" accessibilityLabel={unread ? `Messages, ${unread} unread` : 'Messages'} onPress={() => router.push('/messages')} hitSlop={8}>
     <Ionicons name="paper-plane-outline" size={23} color={colors.text}/>
     {unread > 0 && <View style={styles.headerBadge}><Text style={styles.headerBadgeText}>{unread > 9 ? '9+' : unread}</Text></View>}
   </Pressable>
   <Pressable accessibilityRole="link" accessibilityLabel="Settings" onPress={() => router.push('/settings')} hitSlop={8}>
     <Ionicons name="menu-outline" size={26} color={colors.text}/>
   </Pressable>
 </View>}>
   <View style={styles.identity}>
     <View style={styles.stats}><Avatar name={user.name} seed={user.avatarSeed} size={72} style={{ backgroundColor: colors.brand }}/>{[[own.length,'Posts'],[user.followers,'Followers'],[user.following,'Following']].map(([n,label]) => <View key={label} style={styles.stat}><Text style={styles.count}>{compactNumber(Number(n))}</Text><Text style={styles.meta}>{label}</Text></View>)}</View>
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
   <View style={styles.tabs}>{(['Posts','Reels','Tagged'] as const).map(t => <Pressable key={t} accessibilityRole="tab" accessibilityState={{selected:tab===t}} onPress={() => setTab(t)} style={[styles.tab,tab===t && {borderBottomColor:colors.brand}]}><Text style={{color:tab===t?colors.brand:colors.textMuted,fontWeight:tab===t?'700':'400'}}>{t}</Text></Pressable>)}</View>
   <SwipeSurface fill={false} enabled={!previewSection} delegateRight={tab === 'Posts'} onSwipe={swipe} renderPreview={direction => {
     const next = swipeDestination('/profile', tab, direction);
     return next?.pathname === '/profile' ? content(next.section) : null;
   }}>{content(tab)}</SwipeSurface>
 </Screen></SwipeSurface>;
}
const styleDefinitions = StyleSheet.create({
 identity:{gap:14,paddingTop:22,paddingBottom:24,paddingHorizontal:12},stats:{flexDirection:'row',alignItems:'center',gap:18,marginBottom:12},stat:{flex:1,alignItems:'center',gap:5},count:{fontSize:20,fontWeight:'700',color:colors.text},meta:{fontSize:12,color:colors.textMuted,lineHeight:19},nameRow:{flexDirection:'row',gap:10,alignItems:'center',flexWrap:'wrap'},name:{fontSize:18,fontWeight:'700',color:colors.text},bio:{fontSize:14,lineHeight:21,color:colors.textMuted},injury:{fontSize:13,color:colors.danger},buttons:{flexDirection:'row',gap:8},settings:{borderWidth:1,borderColor:colors.border,borderRadius:10,padding:10,justifyContent:'center'},tennis:{padding:12,borderWidth:1,borderColor:colors.border,borderRadius:12,backgroundColor:colors.surface,gap:8},eyebrow:{letterSpacing:1.2,fontSize:11,fontWeight:'700',color:colors.textMuted},details:{flexDirection:'row',flexWrap:'wrap',gap:8},detail:{width:'46%',gap:2},value:{fontSize:13,color:colors.text,lineHeight:19},health:{padding:15,marginTop:12,borderWidth:1,borderColor:colors.border,borderRadius:12,flexDirection:'row',alignItems:'center',gap:10},headerActions:{flexDirection:'row',alignItems:'center',gap:18},headerBadge:{position:'absolute',top:-4,right:-7,minWidth:16,height:16,borderRadius:8,paddingHorizontal:4,backgroundColor:colors.danger,alignItems:'center',justifyContent:'center'},headerBadgeText:{color:'white',fontSize:9,fontWeight:'700'},tabs:{flexDirection:'row',marginTop:16},tab:{flex:1,alignItems:'center',paddingVertical:18,borderBottomWidth:2,borderBottomColor:colors.border},grid:{flexDirection:'row',flexWrap:'wrap',marginHorizontal:0},tile:{width:'33.333333%',aspectRatio:1,borderWidth:1,borderColor:colors.bg,backgroundColor:'#1E3828',padding:10,justifyContent:'space-between'},tileScrim:{...StyleSheet.absoluteFillObject,backgroundColor:'rgba(20, 32, 24, 0.42)'},tileText:{fontSize:11,lineHeight:15,color:'#E6E7D9'},tileLabel:{fontSize:8,color:'#C2CCB4',letterSpacing:1},
});
