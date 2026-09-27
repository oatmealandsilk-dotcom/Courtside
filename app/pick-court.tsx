import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { CourtGlyph } from '@/components/map/MapChrome';
import { CourtSpinner } from '@/components/CourtSpinner';
import { EmptyState, Screen } from '@/components/ui';
import { fetchCourts, type Court } from '@/features/players/courts';
import { formatMiles, milesBetween } from '@/features/players/geo';
import { homeFor } from '@/features/players/positions';
import { goBack } from '@/lib/goBack';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, lift, radius, spacing, typography } from '@/theme';

/**
 * Pick a court to send in a chat: the public courts near you, nearest first,
 * with a search box. Tap one and it lands in the chat as a card with its
 * name and "Open in Maps", so everyone knows where to meet.
 */
export default function PickCourt() {
  const styles = useThemedStyles(styleDefinitions);
  const { conversation } = useLocalSearchParams<{ conversation?: string }>();
  const { currentUser, detectedCoords, actions } = useApp();
  const home = useMemo(() => (currentUser ? homeFor(currentUser, detectedCoords) : null), [currentUser, detectedCoords]);
  const [courts, setCourts] = useState<Court[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  useEffect(() => {
    if (!home) return;
    let on = true;
    fetchCourts(home).then((list) => { if (on) setCourts(list); }).catch(() => { if (on) { setFailed(true); setCourts([]); } });
    return () => { on = false; };
  }, [home]);
  const term = query.trim().toLowerCase();
  const list = (courts ?? [])
    .map((c) => ({ c, miles: home ? milesBetween(home, c) : 0 }))
    .filter(({ c }) => !term || c.name.toLowerCase().includes(term))
    .sort((a, b) => a.miles - b.miles);
  const send = (c: Court) => {
    if (!conversation) return;
    // The name as the map knows it; the distance would be from here, which means nothing to whoever reads it.
    actions.sendCourt(conversation, { name: c.name, lat: c.lat, lng: c.lng });
    goBack(`/messages/${conversation}`);
  };
  return (
    <Screen title="Send a court" compactTitle onBack={() => goBack(conversation ? `/messages/${conversation}` : '/messages')}>
      <View style={styles.search}>
        <Ionicons name="search" size={16} color={colors.textFaint} />
        <TextInput value={query} onChangeText={setQuery} placeholder="Search courts" placeholderTextColor={colors.textFaint} style={styles.searchInput} accessibilityLabel="Search courts" autoCorrect={false} />
      </View>
      {courts === null ? <View style={{ paddingVertical: 48, alignItems: 'center' }}><CourtSpinner size={28} /></View> : failed ? (
        <EmptyState icon="cloud-offline-outline" title="Couldn’t find courts" body="Check your connection and try again." />
      ) : list.length === 0 ? (
        <EmptyState icon="location-outline" title={term ? 'No courts by that name' : 'No courts found nearby'} body={term ? 'Try another word.' : 'Turn on Location in Settings for courts right where you are.'} />
      ) : (
        <View style={styles.group}>
          {list.slice(0, 40).map(({ c, miles }, i) => (
            <Pressable key={c.id} accessibilityRole="button" accessibilityLabel={`Send ${c.name}`} onPress={() => send(c)} style={({ pressed }) => [styles.row, i > 0 && styles.line, pressed && { backgroundColor: colors.surfaceAlt }]}>
              <View style={styles.icon}><CourtGlyph size={14} color={colors.brand} /></View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.name} numberOfLines={1}>{c.name}</Text>
                <Text style={styles.meta}>{formatMiles(miles)}{c.count > 1 ? ` · ${c.count} courts` : ''}{c.lit ? ' · lights' : ''}</Text>
              </View>
              <Ionicons name="paper-plane-outline" size={18} color={colors.textMuted} />
            </Pressable>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styleDefinitions = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, height: 44, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.surface, marginBottom: spacing.lg, ...lift },
  searchInput: { flex: 1, ...typography.body, color: colors.text, outlineStyle: 'none' } as object,
  group: { ...lift, borderRadius: 20, backgroundColor: colors.surface, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 12, paddingHorizontal: spacing.lg },
  line: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  icon: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.brandDim, alignItems: 'center', justifyContent: 'center' },
  name: { ...typography.bodyStrong, color: colors.text },
  meta: { ...typography.small, color: colors.textMuted },
});
