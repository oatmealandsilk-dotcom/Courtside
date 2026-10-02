import React, { useEffect } from 'react';
import { AccessibilityInfo, Platform, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { colors, radius, spacing, typography } from '@/theme';
import { useThemedStyles } from '@/theme/ThemeProvider';

/**
 * The small lock on a face in a picker: this person can't be picked by you
 * right now. The same look as the Send-to sheet's locked tiles (a grey disc
 * on the face's lower right, ringed in the page colour), so a lock means the
 * same thing everywhere. Put it inside a View that wraps the Avatar.
 */
export function LockBadge({ size = 22 }: { size?: number }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={[styles.badge, { width: size, height: size, borderRadius: size / 2 }]} accessibilityElementsHidden importantForAccessibility="no">
      <Ionicons name="lock-closed" size={Math.round(size * 0.45)} color={colors.textMuted} />
    </View>
  );
}

/**
 * Why something can't be done, said in a box that stays on screen until it
 * is closed or no longer true, instead of a toast that slips away before it
 * can be read. `tone="alert"` for a refusal that just happened.
 */
export function LockNote({ text, onClose, tone = 'lock', style }: { text: string; onClose?: () => void; tone?: 'lock' | 'alert'; style?: StyleProp<ViewStyle> }) {
  const styles = useThemedStyles(styleDefinitions);
  // VoiceOver doesn't read a box that appears, whatever its role says, so on
  // an iPhone the words are spoken as they show (and again if they change).
  // Android's TalkBack reads it by itself, from accessibilityLiveRegion below.
  useEffect(() => { if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(text); }, [text]);
  return (
    <View style={[styles.note, style]} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <Ionicons name={tone === 'alert' ? 'alert-circle-outline' : 'lock-closed-outline'} size={17} color={colors.textMuted} style={styles.icon} />
      <Text style={styles.text}>{text}</Text>
      {onClose ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Close this note" hitSlop={10} onPress={onClose} style={styles.close}>
          <Ionicons name="close" size={16} color={colors.textFaint} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  badge: {
    position: 'absolute', right: -2, bottom: -2,
    backgroundColor: colors.surfaceAlt, borderWidth: 2, borderColor: colors.bg, alignItems: 'center', justifyContent: 'center',
  },
  note: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
    paddingVertical: spacing.md, paddingLeft: spacing.md, paddingRight: spacing.sm,
    borderRadius: radius.md, backgroundColor: colors.bgElevated, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
  },
  // Level with the first line of words.
  icon: { marginTop: 1 },
  text: { ...typography.small, color: colors.text, lineHeight: 19, flex: 1 },
  close: { paddingHorizontal: 2, paddingTop: 1 },
});
