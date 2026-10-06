import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Avatar } from '@/components/ui';
import type { FlybyPerson } from '@/data/types';
import { flybyPeople, flybyPill, openFlyby } from '@/features/flyby/flyby';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, radius, spacing } from '@/theme';

/**
 * "3 others here today", on a session of yours played at a court today or
 * yesterday (Flyby, migration 130): the faces of who else was there that
 * day, as the server allows you to see them; a tap opens the list. Nothing
 * at all when nobody was (or it could not be asked).
 *
 * Built to stand alone (a court and a day), so the Tennis profile can use it.
 */
export function FlybyPill({ courtId, courtName, day, skip = [] }: { courtId: string; courtName: string; day: string; skip?: string[] }) {
  const styles = useThemedStyles(styleDefinitions);
  const { actions, users } = useApp();
  const [list, setList] = useState<FlybyPerson[] | null>(null);
  useEffect(() => {
    let on = true;
    void actions.flyby(courtId, day).then((got) => { if (on) setList(got); });
    return () => { on = false; };
  }, [courtId, day, actions]);
  const people = flybyPeople((list ?? []).filter((p) => !skip.includes(p.userId)), users).map((x) => x.user);
  if (!people.length) return null;
  const words = flybyPill(people, day);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${words} at ${courtName}. See who`} hitSlop={4} onPress={() => openFlyby(courtId, courtName, day)} style={({ pressed }) => [styles.pill, pressed && styles.pressed]}>
      <View style={styles.faces}>
        {people.slice(0, 3).map((u, i) => (
          <View key={u.id} style={[styles.face, i > 0 && styles.faceOver]}>
            <Avatar name={u.name} seed={u.avatarSeed} uri={u.avatarUrl} size={22} />
          </View>
        ))}
      </View>
      <Text style={styles.text} numberOfLines={1}>{words}</Text>
      <Ionicons name="chevron-forward" size={14} color={colors.brand} />
    </Pressable>
  );
}

const styleDefinitions = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: spacing.sm, marginTop: 6, paddingLeft: 5, paddingRight: 10, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: colors.brandDim, maxWidth: '100%' },
  pressed: { opacity: 0.7 },
  faces: { flexDirection: 'row', alignItems: 'center' },
  face: { borderWidth: 1.5, borderColor: colors.brandDim, borderRadius: 13 },
  faceOver: { marginLeft: -7 },
  text: { ...font('600'), fontSize: 13.5, color: colors.brand, flexShrink: 1 },
});
