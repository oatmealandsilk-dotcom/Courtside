import { useThemedStyles } from '@/theme/ThemeProvider';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Avatar } from '@/components/ui';
import type { User } from '@/data/types';
import { colors, radius, spacing, typography } from '@/theme';

const HEIGHT = 220;

/** Stable 0–1 pair from a string, so a player always lands in the same spot. */
function place(seed: string): { x: number; y: number } {
  let hash = 7;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) % 65521;
  const x = 0.12 + ((hash % 1000) / 1000) * 0.76;
  const y = 0.14 + (((hash >> 4) % 1000) / 1000) * 0.66;
  return { x, y };
}

/**
 * A schematic map of who is around you. There is no location permission in
 * this build, so players are scattered deterministically around you at the
 * centre — the shape of the real thing, without the tiles or the tracking.
 */
export function NearbyMap({ me, players, onOpen }: { me: User; players: User[]; onOpen: (id: string) => void }) {
  const styles = useThemedStyles(styleDefinitions);
  const nearby = players.slice(0, 8);
  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Ionicons name="location-outline" size={16} color={colors.brand} />
        <Text style={styles.title}>Players near {me.location.split(',')[0]}</Text>
        <Text style={styles.count}>{nearby.length}</Text>
      </View>
      <View style={styles.map} accessibilityLabel="Map of players near you">
        {[0.25, 0.5, 0.75].map((f) => (
          <React.Fragment key={f}>
            <View style={[styles.gridLine, { top: `${f * 100}%`, left: 0, right: 0, height: 1 }]} />
            <View style={[styles.gridLine, { left: `${f * 100}%`, top: 0, bottom: 0, width: 1 }]} />
          </React.Fragment>
        ))}
        <View style={[styles.road, { top: '38%', transform: [{ rotate: '-8deg' }] }]} />
        <View style={[styles.road, { top: '66%', transform: [{ rotate: '5deg' }] }]} />
        <View style={styles.ring} />
        {nearby.map((player) => {
          const { x, y } = place(player.avatarSeed);
          return (
            <Pressable
              key={player.id}
              accessibilityRole="link"
              accessibilityLabel={`${player.name}, open profile`}
              onPress={() => onOpen(player.id)}
              style={[styles.pin, { left: `${x * 100}%`, top: `${y * 100}%` }]}
            >
              <View style={[styles.pinRing, player.isCoach && { borderColor: colors.info }]}>
                <Avatar name={player.name} seed={player.avatarSeed} size={30} />
              </View>
            </Pressable>
          );
        })}
        <View style={[styles.pin, styles.mePin]}>
          <View style={styles.meDot} />
        </View>
      </View>
      <Text style={styles.hint}>Tap a player to open their profile. Blue ring means coach.</Text>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md },
  title: { ...typography.smallStrong, color: colors.text, flex: 1 },
  count: { ...typography.caption, color: colors.textFaint, letterSpacing: 0 },
  map: { height: HEIGHT, backgroundColor: colors.bgElevated, overflow: 'hidden' },
  gridLine: { position: 'absolute', backgroundColor: colors.border, opacity: 0.6 },
  road: { position: 'absolute', left: -20, right: -20, height: 6, borderRadius: 3, backgroundColor: colors.surfaceAlt },
  ring: {
    position: 'absolute', left: '50%', top: '50%', width: 150, height: 150, marginLeft: -75, marginTop: -75,
    borderRadius: 75, borderWidth: 1, borderColor: colors.brand, opacity: 0.35,
  },
  pin: { position: 'absolute', marginLeft: -17, marginTop: -17 },
  pinRing: { padding: 2, borderRadius: radius.pill, borderWidth: 2, borderColor: colors.brand, backgroundColor: colors.bg },
  mePin: { left: '50%', top: '50%', marginLeft: -9, marginTop: -9 },
  meDot: { width: 18, height: 18, borderRadius: 9, backgroundColor: colors.brand, borderWidth: 3, borderColor: colors.bg },
  hint: { ...typography.caption, color: colors.textFaint, letterSpacing: 0, padding: spacing.md, paddingTop: spacing.sm },
});
