import { useThemedStyles } from '@/theme/ThemeProvider';
import React from 'react';
import { Platform, StyleSheet, Text } from 'react-native';
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
        {Platform.OS === 'web' ? 'What CourtSide may use in this browser.' : 'What CourtSide may use on this phone.'}
      </Text>
      {/* Where to change an answer is said once, as a footnote under the list. */}
      <PermissionRows footnote={OFF_HINT} />
    </Screen>
  );
}

const styleDefinitions = StyleSheet.create({
  lead: { ...typography.small, color: colors.textMuted, lineHeight: 19, paddingBottom: spacing.lg },
});
