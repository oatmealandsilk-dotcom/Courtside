import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Avatar, EmptyState, Field, Screen } from '@/components/ui';
import { useApp } from '@/store/AppContext';
import { colors } from '@/theme';
import { useTheme } from '@/theme/ThemeProvider';
import { show as showToast } from '@/lib/toast';
export default function NewMessage() {
  useTheme();
  const { users, conversations, currentUserId, actions } = useApp();
  const [query,setQuery] = useState('');
  const term = query.trim().replace(/^@/,'').toLowerCase();
  const recent = [...conversations].sort((a,b)=>Date.parse(b.updatedAt)-Date.parse(a.updatedAt)).flatMap(c=>c.participantIds.filter(id=>id!==currentUserId));
  const matches = users.filter(u=>u.id!==currentUserId && `${u.name} ${u.handle}`.toLowerCase().includes(term))
    .sort((a,b)=>(recent.includes(a.id)?recent.indexOf(a.id):999)-(recent.includes(b.id)?recent.indexOf(b.id):999));
  return <Screen title="New message" compactTitle onBack={()=>router.back()}>
    <Field label="To" value={query} onChangeText={setQuery} placeholder="Name or username" autoCapitalize="none"/>
    <Text style={{color:colors.textMuted,fontWeight:'600',marginTop:24,marginBottom:12}}>{term?'Results':'Suggested'}</Text>
    {matches.map(user=><Pressable key={user.id} accessibilityRole="button" accessibilityLabel={`Message ${user.name}`} onPress={()=>{ if (!actions.canMessage(user.id)) { showToast({ title: `Only people ${user.name.split(' ')[0]} follows can message them`, icon: 'lock-closed-outline' }); return; } router.replace(`/messages/${actions.openConversationWith(user.id)}`); }} style={{flexDirection:'row',alignItems:'center',gap:12,paddingVertical:14}}>
      <Avatar name={user.name} seed={user.avatarSeed} size={46}/><View><Text style={{color:colors.text,fontWeight:'600'}}>{user.name}</Text><Text style={{color:colors.textMuted}}>@{user.handle}</Text></View>
    </Pressable>)}
    {!matches.length && <EmptyState title="No players found" body="Try their name or username."/>}
  </Screen>;
}
