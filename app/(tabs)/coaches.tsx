import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Avatar, Screen } from '@/components/ui';
import { money } from '@/lib/format';
import { useApp } from '@/store/AppContext';
import { colors } from '@/theme';

export default function Coaching() {
 const { coaches, users, coachingRequests, currentUserId } = useApp();
 const requests = coachingRequests.filter(r => r.userId === currentUserId);
 return <Screen title="courtside" subtitle="Coaching">
   <View style={styles.ai}>
     <Pressable accessibilityRole="button" accessibilityLabel="Open Courtside AI Coach" onPress={() => router.push('/ai-coach')} style={{ gap: 18 }}>
       <View style={styles.row}><View style={styles.aiBadge}><Text style={styles.aiText}>AI</Text></View><View style={{ flex: 1 }}><Text style={styles.title}>Courtside AI Coach</Text><Text style={styles.available}>● Always available · Free</Text></View><Ionicons name="chevron-forward" size={18} color={colors.info}/></View>
       <Text style={styles.description}>Personalised coaching based on your playing style, goals, and health data. Build your plan and ask for advice for your next session.</Text>
     </Pressable>
     <Pressable accessibilityRole="link" onPress={() => router.push('/health')} style={styles.health}><Ionicons name="bulb-outline" size={20} color={colors.warning}/><Text style={[styles.muted, { flex: 1 }]}>Link your health data for smarter sessions</Text><Ionicons name="arrow-forward" size={19} color={colors.info}/></Pressable>
   </View>
   <View style={styles.heading}><Text style={styles.eyebrow}>CERTIFIED COACHES</Text><Text style={styles.muted}>1-on-1 guidance for your game</Text></View>
   {coaches.map(coach => {
     const user = users.find(u => u.id === coach.userId);
     const price = Math.min(...coach.services.map(s => s.priceCents));
     return <Pressable key={coach.id} accessibilityRole="link" onPress={() => router.push(`/coach/${coach.id}`)} style={styles.coach}>
       <Avatar name={user?.name ?? 'Coach'} seed={coach.id} size={48} style={{ backgroundColor: colors.borderStrong }}/>
       <View style={{ flex: 1, gap: 7 }}><Text style={styles.name}>{user?.name}</Text><Text style={styles.credential}>{coach.credentials[0]}</Text><Text style={styles.muted}>{coach.specialties.slice(0, 2).map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' & ')}</Text><Text style={styles.rating}>★ {coach.ratingAvg.toFixed(1)}  <Text style={styles.muted}>{coach.ratingCount} reviews</Text></Text></View>
       <View style={{ alignItems: 'flex-end', gap: 4 }}><Text style={styles.price}>from {money(price)}</Text><Text style={styles.small}>/service</Text></View>
     </Pressable>;
   })}
   {requests.length > 0 && <View style={{ marginTop: 24, gap: 12 }}><Text style={styles.eyebrow}>YOUR REQUESTS</Text>{requests.map(r => <Pressable key={r.id} accessibilityRole="link" onPress={() => router.push(`/coach/${r.coachId}`)} style={styles.request}><Text style={styles.name}>{r.question}</Text><Text style={styles.muted}>{r.status.replace('-', ' ')}</Text></Pressable>)}</View>}
 </Screen>;
}
const styles = StyleSheet.create({
 ai: { backgroundColor: '#EBEEEA', borderColor: '#CBD5D8', borderWidth: 1, borderRadius: 12, padding: 16, gap: 16, marginTop: 12 },
 row: { flexDirection: 'row', alignItems: 'center', gap: 12 }, aiBadge: { width: 42, height: 42, borderRadius: 30, borderColor: '#C4CED0', borderWidth: 1, alignItems: 'center', justifyContent: 'center' }, aiText: { color: colors.info, fontSize: 18, fontWeight: '700' },
 title: { fontSize: 18, fontWeight: '700', color: colors.text }, available: { color: colors.info, marginTop: 5, fontSize: 13 }, description: { borderLeftWidth: 2, borderLeftColor: colors.info, paddingLeft: 12, color: colors.textMuted, fontSize: 14, lineHeight: 23 },
 health: { borderTopWidth: 1, borderTopColor: '#D3DADB', paddingTop: 15, flexDirection: 'row', alignItems: 'center', gap: 8 },
 heading: { borderTopWidth: 1, borderTopColor: colors.border, marginTop: 24, paddingTop: 18, gap: 8 }, eyebrow: { letterSpacing: 1.6, fontWeight: '700', fontSize: 11, color: colors.textMuted },
 coach: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 24, borderBottomWidth: 1, borderBottomColor: colors.border }, name: { fontWeight: '600', color: colors.text, fontSize: 16 }, credential: { color: colors.textMuted, fontSize: 10, letterSpacing: 0.4 }, muted: { color: colors.textMuted, fontSize: 13, lineHeight: 20 }, rating: { color: colors.warning, fontSize: 14 }, price: { fontWeight: '700', color: colors.text, fontSize: 13 }, small: { color: colors.textMuted, fontSize: 11 }, request: { borderBottomWidth: 1, borderBottomColor: colors.border, padding: 12, gap: 8 },
});
