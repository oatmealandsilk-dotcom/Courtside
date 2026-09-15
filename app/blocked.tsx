import { useThemedStyles } from '@/theme/ThemeProvider';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { goBack } from '@/lib/goBack';

import { Avatar, Button, EmptyState, Screen } from '@/components/ui';
import { useApp } from '@/store/AppContext';
import { colors, spacing, typography } from '@/theme';

export default function Blocked() {
  const styles = useThemedStyles(styleDefinitions);
  const { users, blockedIds, actions } = useApp();
  const blocked = blockedIds.map((id) => users.find((u) => u.id === id)).filter((u): u is NonNullable<typeof u> => Boolean(u));

  return (
    <Screen title="Blocked" compactTitle onBack={() => goBack()}>
      <Text style={styles.note}>
        Blocked players cannot see your posts, message you, or find your profile. They are not told.
      </Text>
      {blocked.length === 0 ? (
        <EmptyState icon="shield-checkmark-outline" title="Nobody blocked" body="Block someone from the menu on their profile." />
      ) : (
        blocked.map((user) => (
          <View key={user.id} style={styles.row}>
            <Avatar name={user.name} seed={user.avatarSeed} size={44} />
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{user.name}</Text>
              <Text style={styles.handle}>@{user.handle}</Text>
            </View>
            <Button label="Unblock" variant="secondary" onPress={() => actions.toggleBlock(user.id)} />
          </View>
        ))
      )}
    </Screen>
  );
}

const styleDefinitions = StyleSheet.create({
  note: { ...typography.small, color: colors.textMuted, lineHeight: 20, paddingBottom: spacing.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  name: { ...typography.bodyStrong, color: colors.text },
  handle: { ...typography.small, color: colors.textFaint },
});
