import { useThemedStyles } from '@/theme/ThemeProvider';
import React from 'react';
import { Platform, StyleSheet, Text } from 'react-native';
import { router } from 'expo-router';
import { goBack } from '@/lib/goBack';

import { PermissionRows } from '@/components/PermissionRows';
import { OFF_HINT } from '@/features/permissions/devicePermissions';
import { Screen } from '@/components/ui';
import { colors, spacing, typography } from '@/theme';

export default function Permissions() {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <Screen title="Permissions" compactTitle onBack={() => goBack()}>
      <Text style={styles.lead}>
        {Platform.OS === 'web' ? 'What CourtSide may use in this browser. ' : 'What CourtSide may use on this phone. '}{OFF_HINT}
      </Text>
      <PermissionRows />
    </Screen>
  );
}

const styleDefinitions = StyleSheet.create({
  lead: { ...typography.small, color: colors.textMuted, lineHeight: 20, paddingBottom: spacing.lg },
});
