import { PRESS_DIM } from '@/theme/press';
import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { BrandMark } from '@/components/BrandMark';
import { colors, radius, spacing, typography } from '@/theme';
import { IPHONE_APP_URL } from './joinAsk';
import { noteAppTap } from './campaign';

const KEY = 'courtside-app-bar-closed';
const closedThisVisit = () => { try { return sessionStorage.getItem(KEY) === '1'; } catch { return false; } };

/**
 * A slim "Get the iPhone app" strip across the top for guests on the website
 * (Oct 17, owner: "Should courtsidebase.com just be the web version of our
 * app, except it keeps pushing ppl to get it on the app store", then guest
 * mode: "rather than a automatic straight up promotion"). It takes its own
 * line above the page, so it never covers anything, and once closed it stays
 * closed for the rest of the visit.
 */
export function GetAppBar() {
  const styles = useThemedStyles(styleDefinitions);
  const [closed, setClosed] = useState(closedThisVisit);
  if (closed) return null;
  const close = () => {
    try { sessionStorage.setItem(KEY, '1'); } catch { /* private mode: closed for this page only */ }
    setClosed(true);
  };
  return (
    <View style={styles.bar} accessibilityLabel="CourtSide for iPhone">
      <Pressable accessibilityRole="button" accessibilityLabel="Close the app banner" hitSlop={10} onPress={close} style={styles.close}>
        <Ionicons name="close" size={16} color={colors.textMuted} />
      </Pressable>
      <View style={styles.mark}><BrandMark size={18} /></View>
      <View style={styles.words}>
        <Text style={styles.title} numberOfLines={1}>CourtSide for iPhone</Text>
        <Text style={styles.sub} numberOfLines={1}>Clips, hits and coaches, in your pocket</Text>
      </View>
      <Pressable accessibilityRole="link" accessibilityLabel="Get the iPhone app" onPress={() => { noteAppTap(); void Linking.openURL(IPHONE_APP_URL); }} style={({ pressed }) => [styles.get, pressed && styles.pressed]}>
        <Text style={styles.getText}>Get the app</Text>
      </Pressable>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: 8, backgroundColor: colors.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  close: { padding: 2 },
  mark: { width: 32, height: 32, borderRadius: 9, backgroundColor: colors.brandDim, alignItems: 'center', justifyContent: 'center' },
  words: { flex: 1, minWidth: 0 },
  title: { ...typography.smallStrong, color: colors.text },
  sub: { ...typography.caption, letterSpacing: 0, textTransform: 'none', color: colors.textMuted },
  get: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: colors.brand },
  getText: { ...typography.smallStrong, color: colors.brandInk },
  pressed: { opacity: PRESS_DIM },
});
