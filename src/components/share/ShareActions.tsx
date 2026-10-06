import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
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
 *
 * `steps`: what to do next in Instagram, on a line under the buttons that
 * stays put (an older iPhone build hands the picture over by the clipboard:
 * see INSTAGRAM_NOTE). A toast would come and go while Instagram was in
 * front, so the steps wait here for the person coming back (Oct 6 review).
 */
export function ShareActions({ busy, onRun, steps }: { busy: StoryAction | null; onRun: (action: StoryAction) => void; steps?: string | null }) {
  const styles = useThemedStyles(styleDefinitions);
  const save = canSaveStory();
  return (
    <View style={styles.block}>
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
      {steps ? (
        <Text style={styles.steps} accessibilityLiveRegion="polite" {...(Platform.OS === 'web' ? { role: 'status' } : {})}>{steps}</Text>
      ) : null}
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  block: { gap: spacing.md },
  actions: { flexDirection: 'row', justifyContent: 'center', gap: spacing.lg, paddingHorizontal: spacing.lg },
  action: { alignItems: 'center', gap: 6, width: 64 },
  circle: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  lead: { backgroundColor: colors.brand, borderColor: colors.brand },
  label: { ...font('500'), fontSize: 12.5, color: colors.text },
  pressed: { opacity: 0.7 },
  dimmed: { opacity: 0.45 },
  // The steps: two quiet lines at most, centred under the buttons and no wider than their row.
  steps: { ...font('500'), fontSize: 13, lineHeight: 18, color: colors.textMuted, textAlign: 'center', alignSelf: 'center', maxWidth: 320, paddingHorizontal: spacing.lg },
});
