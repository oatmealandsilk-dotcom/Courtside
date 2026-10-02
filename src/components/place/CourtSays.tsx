import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { summarizeCourt } from '@/features/players/courtSummary';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, radius, spacing, typography } from '@/theme';

/**
 * What players say about a court, as the map's card shows it: their facts
 * (lights, surface, nets, how busy), their photos of it, the latest thing
 * someone wrote, how many said it, and a way to add yours. The page loads the notes and shows
 * this only once someone has said something.
 */
export function CourtSays({ courtId, name }: { courtId: string; name: string }) {
  const styles = useThemedStyles(styleDefinitions);
  const { courtNotes, currentUserId } = useApp();
  const notes = courtNotes[courtId] ?? [];
  const said = summarizeCourt(notes);
  const mine = notes.some((n) => n.userId === currentUserId);
  const add = () => router.push({ pathname: '/court-report', params: { id: courtId, name } });
  return (
    <View style={styles.wrap}>
      {said.facts.length ? (
        <View style={styles.facts}>
          {said.facts.map((f) => (
            <View key={f.label} style={styles.fact}>
              <Ionicons name={f.icon} size={13} color={colors.textMuted} />
              <Text style={styles.factText}>{f.label}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {said.photos.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photos}>
          {said.photos.map((uri) => <ExpoImage key={uri} source={{ uri }} style={styles.photo} contentFit="cover" cachePolicy="memory-disk" accessibilityLabel="A player's photo of the court" />)}
        </ScrollView>
      ) : null}
      {said.latest ? <Text style={styles.quote} numberOfLines={2}>“{said.latest}”</Text> : null}
      <Text style={styles.source}>
        {said.players ? `From ${said.players} ${said.players === 1 ? 'player' : 'players'} · ` : ''}
        <Text accessibilityRole="link" accessibilityLabel={mine ? `Update what you said about ${name}` : `Add what you know about ${name}`} onPress={add} style={styles.link}>{mine ? 'Update yours' : 'Add what you know'}</Text>
      </Text>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  wrap: { gap: spacing.sm },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  fact: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, height: 28, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt },
  factText: { ...typography.smallStrong, color: colors.text },
  photos: { gap: spacing.sm },
  photo: { width: 96, height: 72, borderRadius: 12, backgroundColor: colors.surfaceAlt },
  quote: { ...typography.small, color: colors.textMuted, lineHeight: 19 },
  source: { ...typography.small, color: colors.textMuted, lineHeight: 19 },
  link: { ...typography.smallStrong, color: colors.brand },
});
