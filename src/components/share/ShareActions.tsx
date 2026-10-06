import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { CourtSpinner } from '@/components/CourtSpinner';
import { canCopyStory, canSaveStory, type StoryAction } from '@/features/share/storyImage';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, spacing } from '@/theme';

const ACTIONS: { key: StoryAction; label: string; spoken: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { key: 'instagram', label: 'Stories', spoken: 'Share to Instagram Stories', icon: 'logo-instagram' },
  { key: 'copy', label: 'Copy', spoken: 'Copy the picture', icon: 'copy-outline' },
  { key: 'save', label: 'Save', spoken: 'Save the picture', icon: 'download-outline' },
  { key: 'more', label: 'More', spoken: 'More ways to share', icon: 'share-outline' },
];

/**
 * Strava's row of round buttons, in CourtSide's colours (Oct 4): Instagram
 * Stories leads in the brand's green, then Copy, Save and More where this
 * phone or browser can do them. The same row on every share page (a
 * session's picture, a post's), so sharing looks and works one way.
 */
export function ShareActions({ busy, onRun }: { busy: StoryAction | null; onRun: (action: StoryAction) => void }) {
  const styles = useThemedStyles(styleDefinitions);
  const save = canSaveStory();
  return (
    <View style={styles.actions}>
      {ACTIONS.filter((a) => (a.key !== 'save' || save) && (a.key !== 'copy' || canCopyStory())).map((a) => {
        const lead = a.key === 'instagram';
        return (
          <Pressable
            key={a.key}
            accessibilityRole="button"
            accessibilityLabel={a.spoken}
            accessibilityState={{ disabled: !!busy, busy: busy === a.key }}
            disabled={!!busy}
            onPress={() => onRun(a.key)}
            style={({ pressed }) => [styles.action, pressed && styles.pressed, !!busy && busy !== a.key && styles.dimmed]}
          >
            <View style={[styles.circle, lead && styles.lead]}>
              {busy === a.key ? <CourtSpinner size={22} ink={lead ? colors.brandInk : colors.text} /> : <Ionicons name={a.icon} size={24} color={lead ? colors.brandInk : colors.text} />}
            </View>
            <Text style={styles.label} numberOfLines={1}>{a.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  actions: { flexDirection: 'row', justifyContent: 'center', gap: spacing.lg, paddingHorizontal: spacing.lg },
  action: { alignItems: 'center', gap: 6, width: 64 },
  circle: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  lead: { backgroundColor: colors.brand, borderColor: colors.brand },
  label: { ...font('500'), fontSize: 12.5, color: colors.text },
  pressed: { opacity: 0.7 },
  dimmed: { opacity: 0.45 },
});
