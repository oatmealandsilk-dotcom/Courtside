import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { requestScrollToTop } from '@/features/navigation/scrollToTop';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useToast, type ToastMessage } from '@/lib/toast';
import { colors, radius, spacing, typography } from '@/theme';

const SHOW_MS = 2600;

/**
 * The banner that drops in from the top when something goes through — a
 * post, a hit, a question. Slides down with a spring, the tick pops in a beat
 * later, then it lifts away on its own. Tap it to open what you just made.
 */
export function Toast() {
  const styles = useThemedStyles(styleDefinitions);
  const insets = useSafeAreaInsets();
  const incoming = useToast();
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const slide = useRef(new Animated.Value(-120)).current;
  const tick = useRef(new Animated.Value(0)).current;
  // The ball: drops in from above the banner and bounces once into the badge.
  const drop = useRef(new Animated.Value(-70)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!incoming) return;
    setToast(incoming);
    if (timer.current) clearTimeout(timer.current);
    slide.setValue(-120);
    tick.setValue(0);
    drop.setValue(-70);
    Animated.sequence([Animated.delay(140), Animated.spring(drop, { toValue: 0, useNativeDriver: true, speed: 14, bounciness: 18 })]).start();
    Animated.sequence([
      Animated.spring(slide, { toValue: 0, useNativeDriver: true, speed: 18, bounciness: 9 }),
      Animated.spring(tick, { toValue: 1, useNativeDriver: true, speed: 24, bounciness: 14 }),
    ]).start();
    timer.current = setTimeout(() => {
      Animated.timing(slide, { toValue: -120, duration: 260, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(({ finished }) => {
        if (finished) setToast(null);
      });
    }, SHOW_MS);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [incoming, slide, tick]);

  if (!toast) return null;
  return (
    <Animated.View pointerEvents="box-none" style={[styles.wrap, { top: insets.top + spacing.sm, transform: [{ translateY: slide }] }]}>
      <Pressable
        accessibilityRole={toast.href ? 'link' : 'text'}
        accessibilityLiveRegion="polite"
        onPress={() => {
          if (!toast.href) return;
          setToast(null);
          // Home is a tab, not a page to push: go there and put the feed at the top.
          if (toast.href === '/') { router.navigate('/'); requestScrollToTop('/'); }
          else router.push(toast.href);
        }}
        style={styles.card}
      >
        <View style={styles.badge}>
          <Animated.View style={{ transform: [{ translateY: drop }] }}>
            <Ionicons name="tennisball" size={20} color={colors.brandInk} />
          </Animated.View>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>{toast.title}</Text>
          {toast.body ? <Text style={styles.body} numberOfLines={1}>{toast.body}</Text> : null}
        </View>
        {toast.href ? <Ionicons name="chevron-forward" size={16} color={colors.textFaint} /> : null}
      </Pressable>
    </Animated.View>
  );
}

const styleDefinitions = StyleSheet.create({
  wrap: { position: 'absolute', left: spacing.lg, right: spacing.lg, zIndex: 50, alignItems: 'center' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    width: '100%',
    maxWidth: 440,
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  badge: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  title: { ...typography.bodyStrong, color: colors.text },
  body: { ...typography.small, color: colors.textMuted },
});
