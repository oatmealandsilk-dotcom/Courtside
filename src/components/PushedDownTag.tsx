import { useThemedStyles } from '@/theme/ThemeProvider';
import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useDemotedPosts } from '@/features/feed/demoted';
import { useApp } from '@/store/AppContext';
import { colors, radius, typography } from '@/theme';

/**
 * "Pushed down", in small grey letters on a post an admin pushed to the
 * bottom of feeds (migration 152), so the admins can tell at a glance. Only
 * ever drawn for an admin, and never on their own post: for everyone else,
 * its author included, there is nothing here at all. Frosted over a clip,
 * outlined on the page, as "New to CourtSide" is.
 */
export function PushedDownTag({ post, onMedia = false, style }: { post: { id: string; authorId: string }; onMedia?: boolean; style?: StyleProp<ViewStyle> }) {
  const styles = useThemedStyles(styleDefinitions);
  const { currentUser, currentUserId } = useApp();
  const demoted = useDemotedPosts();
  if (!currentUser?.isAdmin || post.authorId === currentUserId || !demoted.has(post.id)) return null;
  return (
    <View style={[styles.tag, onMedia && styles.frost, style]} accessible accessibilityLabel="Pushed to the bottom of feeds. Only admins see this.">
      <Ionicons name="arrow-down" size={10} color={onMedia ? 'rgba(255,255,255,0.85)' : colors.textMuted} />
      <Text style={[styles.text, onMedia && styles.textOnMedia]} maxFontSizeMultiplier={1.2}>Pushed down</Text>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  tag: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceAlt },
  frost: { backgroundColor: 'rgba(12,14,12,0.48)', borderColor: 'rgba(255,255,255,0.22)' },
  text: { ...typography.caption, letterSpacing: 0.2, color: colors.textMuted },
  textOnMedia: { color: 'rgba(255,255,255,0.85)' },
});
