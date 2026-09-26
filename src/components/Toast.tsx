import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Glass } from '@/components/ui/Glass';
import { requestScrollToTop } from '@/features/navigation/scrollToTop';
import { useToast, type ToastMessage } from '@/lib/toast';
import { colors, spacing, typography } from '@/theme';

const SHOW_MS = 2800;
const IN = Easing.out(Easing.cubic);
const OUT = Easing.in(Easing.cubic);

/**
 * The note that appears at the top when something goes through — a post,
 * a follow, a save. A glass capsule that eases down and settles, no bounce;
 * it lifts away on its own, or with a flick up. Tap it to open what it is
 * about.
 */
export function Toast() {
  const styles = useThemedStyles(styleDefinitions);
  const insets = useSafeAreaInsets();
  const incoming = useToast();
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const y = useSharedValue(-24);
  const shown = useSharedValue(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hide = () => {
    if (timer.current) clearTimeout(timer.current);
    y.value = withTiming(-24, { duration: 200, easing: OUT });
    shown.value = withTiming(0, { duration: 200, easing: OUT }, (done) => { if (done) runOnJS(setToast)(null); });
  };

  useEffect(() => {
    if (!incoming) return;
    setToast(incoming);
    if (timer.current) clearTimeout(timer.current);
    y.value = -24;
    shown.value = 0;
    y.value = withTiming(0, { duration: 320, easing: IN });
    shown.value = withTiming(1, { duration: 260, easing: IN });
    timer.current = setTimeout(hide, SHOW_MS);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [incoming]); // eslint-disable-line react-hooks/exhaustive-deps

  // A flick up sends it away early; a drag down just resists.
  const flick = Gesture.Pan()
    .activeOffsetY([-6, 6])
    .onUpdate((e) => { y.value = e.translationY < 0 ? e.translationY : e.translationY * 0.15; })
    .onEnd((e) => {
      if (e.translationY < -16 || e.velocityY < -400) runOnJS(hide)();
      else y.value = withTiming(0, { duration: 200, easing: IN });
    });

  const style = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [{ translateY: y.value }, { scale: 0.96 + shown.value * 0.04 }],
  }));

  if (!toast) return null;
  const icon = (toast.icon ?? 'checkmark') as keyof typeof Ionicons.glyphMap;
  return (
    <GestureDetector gesture={flick}>
      <Animated.View pointerEvents="box-none" style={[styles.wrap, { top: insets.top + spacing.xs }, style]}>
        <View style={styles.shadow}>
          <Glass radius={22} style={styles.card}>
            <Pressable
              accessibilityRole={toast.href ? 'link' : 'text'}
              accessibilityLiveRegion="polite"
              accessibilityLabel={toast.body ? `${toast.title}. ${toast.body}` : toast.title}
              onPress={() => {
                if (!toast.href) return;
                hide();
                // Home is a tab, not a page to push: go there and put the feed at the top.
                if (toast.href === '/') { router.navigate('/'); requestScrollToTop('/'); }
                else router.push(toast.href as never);
              }}
              style={styles.row}
            >
              <View style={styles.icon}>
                <Ionicons name={icon} size={15} color={colors.brand} />
              </View>
              <View style={styles.words}>
                <Text style={styles.title} numberOfLines={1}>{toast.title}</Text>
                {toast.body ? <Text style={styles.body} numberOfLines={1}>{toast.body}</Text> : null}
              </View>
              {toast.href ? <Ionicons name="chevron-forward" size={14} color={colors.textFaint} /> : null}
            </Pressable>
          </Glass>
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

const styleDefinitions = StyleSheet.create({
  wrap: { position: 'absolute', left: spacing.lg, right: spacing.lg, zIndex: 50, alignItems: 'center' },
  // The shadow on a rounded layer of its own, so it follows the capsule's corners.
  shadow: { maxWidth: 420, borderRadius: 22, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 18, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  card: { borderWidth: StyleSheet.hairlineWidth, borderColor: `${colors.borderStrong}55` },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, paddingLeft: 9, paddingRight: 14, minHeight: 44 },
  icon: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.brandDim, alignItems: 'center', justifyContent: 'center' },
  words: { flexShrink: 1 },
  title: { ...typography.smallStrong, color: colors.text },
  body: { ...typography.caption, letterSpacing: 0, color: colors.textMuted, marginTop: 1 },
});
