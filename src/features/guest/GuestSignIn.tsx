import { PRESS_DIM } from '@/theme/press';
import { useThemedStyles } from '@/theme/ThemeProvider';
import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { router } from 'expo-router';

import { buttonShape, colors, radius, typography } from '@/theme';
import { noBoxes } from '@/features/noBoxes/noBoxes';

/** No boxes (demo only, features/noBoxes): the sign-up ask's own word, Log in. */
const PLAIN = noBoxes();

/**
 * Where a tab's bell, chats and search sit for someone signed in, a guest
 * (guest mode, Oct 17) has one quiet way in: Sign in. Never a pop-up.
 */
export function GuestSignIn({ onMedia = false }: { onMedia?: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={PLAIN ? 'Log in' : 'Sign in'} hitSlop={8} onPress={() => router.push({ pathname: '/sign-in', params: { mode: 'sign-in' } })} style={({ pressed }) => [styles.pill, onMedia && styles.onMedia, pressed && styles.pressed]}>
      <Text style={[styles.text, onMedia && styles.onMediaText]}>{PLAIN ? 'Log in' : 'Sign in'}</Text>
    </Pressable>
  );
}

const styleDefinitions = StyleSheet.create({
  pill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: buttonShape.smallRadius, ...buttonShape.curve, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.surface },
  onMedia: { backgroundColor: colors.overlay, borderColor: colors.overlay },
  text: { ...typography.smallStrong, color: colors.brand },
  onMediaText: { color: colors.onMedia },
  pressed: { opacity: PRESS_DIM },
});
