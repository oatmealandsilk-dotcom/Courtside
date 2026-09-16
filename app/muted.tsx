import { useThemedStyles } from '@/theme/ThemeProvider';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { goBack } from '@/lib/goBack';

import { Avatar, Button, EmptyState, Screen } from '@/components/ui';
import { useApp } from '@/store/AppContext';
import { colors, spacing, typography } from '@/theme';

/** Everyone you have muted, with a way to hear from them again. */
export default function Muted() {
  const styles = useThemedStyles(styleDefinitions);
  const { users, mutedIds, actions } = useApp();
  const muted = mutedIds.map((id) => users.find((u) => u.id === id)).filter((u): u is NonNullable<typeof u> => Boolean(u));

  return (
    <Screen title="Muted" compactTitle onBack={() => goBack()}>
      <Text style={styles.note}>Muted players stay followed; their posts just stop showing up for you. They are not told.</Text>
      {muted.length === 0 ? (
        <EmptyState icon="volume-mute-outline" title="Nobody muted" body="Mute someone from the menu on one of their posts." />
      ) : (
        muted.map((user) => (
          <View key={user.id} style={styles.row}>
            <Avatar name={user.name} seed={user.avatarSeed} uri={user.avatarUrl} size={44} />
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{user.name}</Text>
              <Text style={styles.handle}>@{user.handle}</Text>
            </View>
            <Button label="Unmute" variant="secondary" onPress={() => actions.toggleMute(user.id)} />
          </View>
        ))
      )}
    </Screen>
  );
}

const styleDefinitions = StyleSheet.create({
  note: { ...typography.small, color: colors.textMuted, lineHeight: 20, paddingBottom: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  name: { ...typography.bodyStrong, color: colors.text },
  handle: { ...typography.small, color: colors.textFaint },
});
