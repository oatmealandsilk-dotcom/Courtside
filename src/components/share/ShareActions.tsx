import { PRESS_DIM } from '@/theme/press';
import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { CourtSpinner } from '@/components/CourtSpinner';
import { canCopyStory, canSaveStory, type StoryAction } from '@/features/share/storyImage';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, spacing } from '@/theme';
import { TextScale } from '@/theme/textScale';

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
 *
 * `onSend`: a last button, Send, to send it to someone on CourtSide (a
 * session's share screen, since a post's share arrow opens it, Oct 15).
 */
export function ShareActions({ busy, onRun, steps, onSend }: { busy: StoryAction | null; onRun: (action: StoryAction) => void; steps?: string | null; onSend?: () => void }) {
  const styles = useThemedStyles(styleDefinitions);
  const save = canSaveStory();
  const shown = ACTIONS.filter((a) => (a.key !== 'save' || save) && (a.key !== 'copy' || canCopyStory()));
  // Five buttons sit a little closer, so the row still fits a small phone.
  const five = !!onSend && shown.length >= 4;
  return (
    <View style={styles.block}>
      <View style={[styles.actions, five && styles.actionsFive]}>
        {shown.map((a) => {
          const lead = a.key === 'instagram';
          return (
            <Pressable
              key={a.key}
              accessibilityRole="button"
              accessibilityLabel={a.spoken}
              accessibilityState={{ disabled: !!busy, busy: busy === a.key }}
              disabled={!!busy}
              onPress={() => onRun(a.key)}
              style={({ pressed }) => [styles.action, five && styles.actionFive, pressed && styles.pressed, !!busy && busy !== a.key && styles.dimmed]}
            >
              <View style={[styles.circle, lead && styles.lead]}>
                {busy === a.key ? <CourtSpinner size={22} ink={lead ? colors.brandInk : colors.text} /> : <Ionicons name={a.icon} size={24} color={lead ? colors.brandInk : colors.text} />}
              </View>
              <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.label} numberOfLines={1}>{a.label}</Text>
            </Pressable>
          );
        })}
        {onSend ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send to someone on CourtSide"
            accessibilityState={{ disabled: !!busy }}
            disabled={!!busy}
            onPress={onSend}
            style={({ pressed }) => [styles.action, five && styles.actionFive, pressed && styles.pressed, !!busy && styles.dimmed]}
          >
            <View style={styles.circle}>
              <Ionicons name="paper-plane-outline" size={23} color={colors.text} />
            </View>
            <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.label} numberOfLines={1}>Send</Text>
          </Pressable>
        ) : null}
      </View>
      {steps ? (
        <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.steps} accessibilityLiveRegion="polite" {...(Platform.OS === 'web' ? { role: 'status' } : {})}>{steps}</Text>
      ) : null}
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  block: { gap: spacing.md },
  actions: { flexDirection: 'row', justifyContent: 'center', gap: spacing.lg, paddingHorizontal: spacing.lg },
  actionsFive: { gap: spacing.sm, paddingHorizontal: spacing.md },
  action: { alignItems: 'center', gap: 6, width: 64 },
  actionFive: { width: 60 },
  circle: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  lead: { backgroundColor: colors.brand, borderColor: colors.brand },
  label: { ...font('500'), fontSize: 12.5, color: colors.text },
  pressed: { opacity: PRESS_DIM },
  dimmed: { opacity: 0.45 },
  // The steps: two quiet lines at most, centred under the buttons and no wider than their row.
  steps: { ...font('500'), fontSize: 13, lineHeight: 18, color: colors.textMuted, textAlign: 'center', alignSelf: 'center', maxWidth: 320, paddingHorizontal: spacing.lg },
});
