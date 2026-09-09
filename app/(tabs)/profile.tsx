import React, { useState } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Avatar, Button, EmptyState, Screen } from '@/components/ui';
import { LevelPill } from '@/components/LevelPill';
import { useApp } from '@/store/AppContext';
import { playStyleLabel, surfaceLabel } from '@/lib/badges';
import { compactNumber } from '@/lib/format';
import { colors } from '@/theme';

export default function Profile() {
 const { currentUser: user, posts } = useApp();
 const params = useLocalSearchParams<{ section?: string }>();
 const tab = params.section === 'Reels' || params.section === 'Tagged' ? params.section : 'Posts';
 const setTab = (section: string) => router.setParams({ section });
 const [shareError, setShareError] = useState('');
 if (!user) return <Screen title="Me"><EmptyState title="Loading your profile"/></Screen>;
 const own = posts.filter(p => p.authorId === user.id);
 const shown = (tab === 'Tagged' ? posts.filter(p => p.taggedUserIds?.includes(user.id)) : own.filter(p => tab !== 'Reels' || p.kind === 'reel')).sort((a,b) => Date.parse(b.createdAt)-Date.parse(a.createdAt));
 const profile = user.profile;
 const share = async () => { try { await Share.share({ message: `${user.name} (@${user.handle}) on Courtside · ${profile.skillSystem} ${profile.rating}\n${user.bio}` }); } catch { setShareError('Sharing is unavailable in this browser. Your handle is @' + user.handle); } };
 return <Screen title="courtside" subtitle={`@${user.handle}`}>
   <View style={styles.identity}>
     <View style={styles.stats}><Avatar name={user.name} seed={user.avatarSeed} size={72} style={{ backgroundColor: colors.brand }}/>{[[own.length,'Posts'],[user.followers,'Followers'],[user.following,'Following']].map(([n,label]) => <View key={label} style={styles.stat}><Text style={styles.count}>{compactNumber(Number(n))}</Text><Text style={styles.meta}>{label}</Text></View>)}</View>
     <View style={styles.nameRow}><Text style={styles.name}>{user.name}</Text><LevelPill profile={profile}/></View>
     <Text style={styles.bio}>{user.bio}</Text>
     {profile.constraints.filter(c => c.active && c.kind === 'injury').map(c => <Text key={c.id} style={styles.injury}>⚕ {c.label}</Text>)}
     <View style={styles.buttons}><View style={{ flex: 1 }}><Button label="Edit Profile" variant="secondary" onPress={() => router.push('/edit-profile')} full/></View><View style={{ flex: 1 }}><Button label="Share" variant="secondary" onPress={share} full/></View><Pressable accessibilityRole="button" accessibilityLabel="Profile settings and game details" onPress={() => router.push('/profile-details')} style={styles.settings}><Ionicons name="settings-outline" size={23} color={colors.textMuted}/></Pressable></View>
     {!!shareError && <Text style={styles.meta}>{shareError}</Text>}
   </View>
   <Pressable accessibilityRole="link" onPress={() => router.push('/profile-details')} style={styles.tennis}>
     <Text style={styles.eyebrow}>TENNIS PROFILE</Text>
     <View style={styles.details}>{[['Style',playStyleLabel[profile.playStyle]],['Surface',surfaceLabel[profile.preferredSurface]],['Availability',`${profile.sessionsPerWeek} sessions / week`],['Goal',profile.goals[0]?.label ?? 'Set your next goal']].map(([label,value]) => <View key={label} style={styles.detail}><Text style={styles.meta}>{label}</Text><Text style={styles.value}>{value}</Text></View>)}</View>
   </Pressable>
   <Pressable accessibilityRole="link" onPress={() => router.push('/health')} style={styles.health}><Ionicons name="flash-outline" size={20} color={colors.warning}/><Text style={[styles.meta,{flex:1}]}>Apple Health · Whoop · Cronometer</Text><Ionicons name="chevron-forward" size={16} color={colors.textMuted}/></Pressable>
   <View style={styles.tabs}>{(['Posts','Reels','Tagged'] as const).map(t => <Pressable key={t} accessibilityRole="tab" accessibilityState={{selected:tab===t}} onPress={() => setTab(t)} style={[styles.tab,tab===t && {borderBottomColor:colors.brand}]}><Text style={{color:tab===t?colors.brand:colors.textMuted,fontWeight:tab===t?'700':'400'}}>{t}</Text></Pressable>)}</View>
   <View style={styles.grid}>{shown.map(p => <Pressable key={p.id} accessibilityRole="link" accessibilityLabel={`Open ${p.kind}: ${p.body}`} onPress={() => router.push(`/post/${p.id}`)} style={styles.tile}><Ionicons name={p.kind==='reel'?'play':'document-text-outline'} size={18} color="#D7DDCB" style={{alignSelf:'flex-end'}}/><Text numberOfLines={4} style={styles.tileText}>{p.body}</Text><Text style={styles.tileLabel}>{p.kind==='match'?'SET PLAY':p.kind.toUpperCase()}</Text></Pressable>)}</View>
   {!shown.length && <EmptyState title={tab==='Tagged'?'No tagged posts yet':`No ${tab.toLowerCase()} yet`} body="Your shared moments will appear here."/>}
 </Screen>;
}
const styles=StyleSheet.create({
 identity:{gap:12,paddingTop:16,paddingBottom:20},stats:{flexDirection:'row',alignItems:'center',gap:12,marginBottom:8},stat:{flex:1,alignItems:'center',gap:5},count:{fontSize:20,fontWeight:'700',color:colors.text},meta:{fontSize:12,color:colors.textMuted,lineHeight:19},nameRow:{flexDirection:'row',gap:10,alignItems:'center',flexWrap:'wrap'},name:{fontSize:18,fontWeight:'700',color:colors.text},bio:{fontSize:14,lineHeight:21,color:colors.textMuted},injury:{fontSize:13,color:colors.danger},buttons:{flexDirection:'row',gap:8},settings:{borderWidth:1,borderColor:colors.border,borderRadius:10,padding:10,justifyContent:'center'},tennis:{padding:16,borderWidth:1,borderColor:colors.border,borderRadius:12,backgroundColor:colors.surface,gap:16},eyebrow:{letterSpacing:1.2,fontSize:11,fontWeight:'700',color:colors.textMuted},details:{flexDirection:'row',flexWrap:'wrap',gap:16},detail:{width:'46%',gap:5},value:{fontSize:13,color:colors.text,lineHeight:19},health:{padding:15,marginTop:12,borderWidth:1,borderColor:colors.border,borderRadius:12,flexDirection:'row',alignItems:'center',gap:10},tabs:{flexDirection:'row',marginTop:16},tab:{flex:1,alignItems:'center',paddingVertical:18,borderBottomWidth:2,borderBottomColor:colors.border},grid:{flexDirection:'row',flexWrap:'wrap',marginHorizontal:-16},tile:{width:'33.333333%',aspectRatio:1,borderWidth:1,borderColor:colors.bg,backgroundColor:'#1E3828',padding:10,justifyContent:'space-between'},tileText:{fontSize:11,lineHeight:15,color:'#E6E7D9'},tileLabel:{fontSize:8,color:'#C2CCB4',letterSpacing:1},
});
