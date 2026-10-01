import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Glass } from '@/components/ui/Glass';
import { requestScrollToTop } from '@/features/navigation/scrollToTop';
import { useToast, type ToastMessage } from '@/lib/toast';
import { colors, spacing, typography } from '@/theme';

const SHOW_MS = 2800;
// A toast with a button ("Undo") waits longer: long enough to read it,
// realise the tap was a mistake and reach the button.
const ACTION_MS = 5000;
// With VoiceOver or TalkBack on, getting to the button takes a few swipes.
const ACTION_SCREEN_READER_MS = 10000;
const IN = Easing.out(Easing.cubic);
const OUT = Easing.in(Easing.cubic);

/**
 * The note that appears at the top when something goes through — a post,
 * a follow, a save. Drawn the way the phone draws its own (Silent Mode,
 * AirPods): a small glass capsule, centred, as wide as its words, a plain
 * glyph beside them. Eases down, settles, lifts away on its own or with a
 * flick up. Tap it to open what it is about. Some carry a button on the
 * right ("Undo") that takes back what was just done.
 */
export function Toast() {
  const styles = useThemedStyles(styleDefinitions);
  const insets = useSafeAreaInsets();
  const incoming = useToast();
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const y = useSharedValue(-24);
  const shown = useSharedValue(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const screenReader = useRef(false);

  // Only the phone is asked: a browser cannot tell, and always answers yes.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    void AccessibilityInfo.isScreenReaderEnabled().then((on) => { screenReader.current = on; });
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', (on: boolean) => { screenReader.current = on; });
    return () => sub.remove();
  }, []);

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
    timer.current = setTimeout(hide, incoming.action ? (screenReader.current ? ACTION_SCREEN_READER_MS : ACTION_MS) : SHOW_MS);
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
  const action = toast.action;
  return (
    <GestureDetector gesture={flick}>
      <Animated.View pointerEvents="box-none" style={[styles.wrap, { top: insets.top + spacing.xs }, style]}>
        <View style={styles.shadow}>
          <Glass radius={22} style={styles.card}>
            <View style={styles.row}>
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
                style={[styles.info, action && styles.infoBeforeAction]}
              >
                <Ionicons name={icon} size={16} color={colors.text} />
                <View style={styles.words}>
                  <Text style={styles.title} numberOfLines={1}>{toast.title}</Text>
                  {toast.body ? <Text style={styles.body} numberOfLines={1}>{toast.body}</Text> : null}
                </View>
              </Pressable>
              {/* Its own button beside the words, not part of them, so a tap on
                  the words still only opens what the toast is about. */}
              {action ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${action.label}: ${toast.title}`}
                  hitSlop={{ top: 6, bottom: 6, right: 6 }}
                  onPress={() => { hide(); action.onPress(); }}
                  style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
                >
                  <Text style={styles.actionLabel}>{action.label}</Text>
                </Pressable>
              ) : null}
            </View>
          </Glass>
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

const styleDefinitions = StyleSheet.create({
  wrap: { position: 'absolute', left: spacing.lg, right: spacing.lg, zIndex: 50, alignItems: 'center' },
  // The shadow on a rounded layer of its own, so it follows the capsule's corners.
  shadow: { maxWidth: 340, borderRadius: 22, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  card: { borderWidth: StyleSheet.hairlineWidth, borderColor: `${colors.borderStrong}55` },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  info: { flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 10, paddingHorizontal: 16, minHeight: 44 },
  // Beside a button the words stop short, and the button keeps the capsule's edge.
  infoBeforeAction: { paddingRight: spacing.xs },
  // As tall as the capsule, so the whole right end is the button.
  action: { alignSelf: 'stretch', justifyContent: 'center', paddingLeft: spacing.md, paddingRight: 16 },
  actionPressed: { opacity: 0.55 },
  actionLabel: { ...typography.smallStrong, color: colors.brand, letterSpacing: -0.1 },
  words: { flexShrink: 1, alignItems: 'flex-start' },
  title: { ...typography.smallStrong, color: colors.text, letterSpacing: -0.1 },
  body: { ...typography.caption, fontSize: 12, letterSpacing: 0, color: colors.textMuted, marginTop: 1 },
});
