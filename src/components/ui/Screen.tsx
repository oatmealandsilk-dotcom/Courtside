import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Animated, Dimensions, KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import * as haptics from '@/lib/haptics';
import { CourtSpinner } from '@/components/CourtSpinner';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePathname } from 'expo-router';
import { isPageDragging, subscribePageDragging } from '@/features/navigation/swipeLock';
import { KeyboardScrollContext, afterKeyboard, currentKeyboardHeight, type Measurable } from '@/lib/keyboardScroll';
import { TAB_FOR_KEY, subscribeScrollToTop } from '@/features/navigation/scrollToTop';
import { barCompact } from '@/features/navigation/barShrink';
import Reanimated, { runOnJS, useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

import { LAYOUT, useResponsive } from '@/lib/useResponsive';
import { colors, spacing, typography } from '@/theme';

/**
 * How far down each route was left, kept outside React so it survives the
 * screen being unmounted and rebuilt — which is exactly what happens when you
 * swipe to another tab and back.
 */
const scrollMemory = new Map<string, number>();

/**
 * Browsers decide per touch whether a gesture is theirs to scroll with, by
 * intersecting touch-action from the finger's target up to the nearest
 * scrolling ancestor — which here is this screen's own ScrollView, not the
 * page-level swipe surface wrapped around it. Buttons allow horizontal pans,
 * so a sideways swipe that starts on one (the section tabs, say) is taken by
 * the browser and cancelled instead of reaching the swipe surface. Declaring
 * vertical-only here, beneath the scroller, keeps those swipes ours.
 */
const verticalOnlyTouch = Platform.OS === 'web' ? ({ touchAction: 'pan-y' } as unknown as ViewStyle) : null;

interface Props {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  scroll?: boolean;
  right?: ReactNode;
  padded?: boolean;
  onBack?: () => void;
  compactTitle?: boolean;
  /** Desktop-only right-hand column, Instagram style. Ignored below the desktop breakpoint. */
  rail?: ReactNode;
  headerWrapper?: (header: ReactNode) => ReactNode;
  /**
   * Which screen this is, for remembering scroll position. Needed because a
   * screen drawn as a swipe preview sees the route you are leaving, not its
   * own — without this, Coaching's position would be applied to Profile.
   */
  memoryKey?: string;
  /** Hands the caller the scroller, for jumping to a particular child. */
  scrollRef?: React.MutableRefObject<ScrollView | null>;
  /** Pull down past the top to run this; a small "Updated" note confirms it. */
  onRefresh?: () => Promise<void> | void;
}

export function Screen({
  children,
  title,
  subtitle,
  scroll = true,
  right,
  padded = true,
  onBack,
  compactTitle = false,
  rail,
  headerWrapper,
  memoryKey,
  scrollRef,
  onRefresh,
}: Props) {
  const styles = useThemedStyles(styleDefinitions);
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  // While a sideways page swipe is under way, this scroller stands down.
  const swiping = useSyncExternalStore(subscribePageDragging, isPageDragging, () => false);
  const key = memoryKey ?? pathname;
  const scroller = useRef<ScrollView | null>(null);
  // Captured once so the starting offset is set before the first paint rather
  // than scrolled to afterwards, which is what made it jump into place.
  const initial = useRef(scrollMemory.get(key) ?? 0);
  const restored = useRef(initial.current === 0);
  const { isPhone, isDesktop } = useResponsive();
  // Pull-to-refresh: the spinner while it runs, then a small note that
  // slides in under the header and fades — enough to know it happened.
  const [refreshing, setRefreshing] = useState(false);
  const updated = useRef(new Animated.Value(0)).current;
  // In a browser there is no pull-to-refresh, so the page listens for the
  // pull itself: a trackpad or wheel pushed up past the top, or a finger
  // dragged down from the top, and after a short pull it refreshes.
  const refreshNowRef = useRef<() => Promise<void>>(async () => undefined);
  // How far the pull has come, 0..1: the disc rides down with it, the way the
  // phone's own does, and spins once it has come far enough.
  const pull = useRef(new Animated.Value(0)).current;
  const [pulling, setPulling] = useState(false);
  const webPull = useCallback((node: ScrollView | null) => {
    if (Platform.OS !== 'web' || !node || !onRefresh) return;
    const el = ((node as unknown as { getScrollableNode?: () => unknown }).getScrollableNode?.() ?? node) as unknown as HTMLElement;
    if (!el || typeof el.addEventListener !== 'function' || (el as unknown as { __pullWired?: boolean }).__pullWired) return;
    (el as unknown as { __pullWired?: boolean }).__pullWired = true;
    const THRESHOLD = 110;
    let pulled = 0;
    let idle: ReturnType<typeof setTimeout> | null = null;
    let touchStart: number | null = null;
    const show = (amount: number) => { pulled = amount; setPulling(amount > 0); pull.setValue(Math.min(1, amount / THRESHOLD)); };
    const fire = () => { pulled = 0; void refreshNowRef.current(); };
    // Letting go past the line refreshes; short of it, the disc springs back — the way a finger does.
    const letGo = () => {
      if (pulled >= THRESHOLD) { fire(); return; }
      if (pulled > 0) { Animated.timing(pull, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => setPulling(false)); pulled = 0; }
    };
    el.addEventListener('wheel', (e: WheelEvent) => {
      if (el.scrollTop > 0 || e.deltaY >= 0) { if (pulled) letGo(); return; }
      // The pull firms up past the line, so it reads as held rather than runaway.
      show(pulled + (pulled >= THRESHOLD ? -e.deltaY * 0.25 : -e.deltaY));
      if (idle) clearTimeout(idle);
      idle = setTimeout(letGo, 220);
    }, { passive: true });
    el.addEventListener('touchstart', (e: TouchEvent) => { touchStart = el.scrollTop <= 0 ? e.touches[0].clientY : null; }, { passive: true });
    el.addEventListener('touchmove', (e: TouchEvent) => {
      if (touchStart === null) return;
      const dy = e.touches[0].clientY - touchStart;
      if (dy <= 0) return;
      show(dy * 0.8);
      if (pulled >= THRESHOLD) { touchStart = null; fire(); }
    }, { passive: true });
    el.addEventListener('touchend', () => { touchStart = null; letGo(); });
  }, [onRefresh, pull]);

  // The bottom bar ducks as this page scrolls — worked out here on the
  // animation thread, frame for frame with the finger, so it never steps.
  const lastY = useSharedValue(-1);
  const remember = useCallback((y: number) => { scrollMemory.set(key, y); }, [key]);
  const onScrollAnimated = useAnimatedScrollHandler({
    onScroll: (event) => {
      const y = event.contentOffset.y;
      runOnJS(remember)(y);
      // The first report is just where the page already sat (a tab switch
      // restoring its place): nothing to react to.
      if (lastY.value < 0) { lastY.value = y; return; }
      const dy = y - lastY.value;
      lastY.value = y;
      // Only a real move counts, in either direction; the bar carries on from wherever it is.
      if (Math.abs(dy) > 0.3 && y >= 0) barCompact.value = Math.max(0, Math.min(1, barCompact.value + dy / 150));
    },
  });

  const refreshNow = useCallback(async () => {
    if (!onRefresh || refreshing) return;
    setRefreshing(true);
    try { await onRefresh(); } finally {
      setRefreshing(false);
      Animated.timing(pull, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setPulling(false));
      haptics.untap();
      updated.setValue(0);
      Animated.sequence([
        Animated.spring(updated, { toValue: 1, useNativeDriver: true, damping: 14, stiffness: 220 }),
        Animated.delay(900),
        Animated.timing(updated, { toValue: 0, duration: 220, useNativeDriver: true }),
      ]).start();
    }
  }, [onRefresh, refreshing, updated, pull]);
  refreshNowRef.current = refreshNow;

  // A text box asks for this when it gains focus: once the keyboard is up,
  // measure where the box sits and scroll just enough to clear the keyboard.
  const reveal = useCallback((node: Measurable | null) => {
    if (!node?.measureInWindow || !scroller.current) return;
    afterKeyboard(() => {
      node.measureInWindow?.((_x, y, _w, h) => {
        const visibleBottom = Dimensions.get('window').height - currentKeyboardHeight() - 24;
        const overflow = y + h - visibleBottom;
        if (overflow <= 0) return;
        const current = scrollMemory.get(key) ?? 0;
        scroller.current?.scrollTo({ y: current + overflow, animated: true });
      });
    });
  }, [key]);

  useEffect(() => subscribeScrollToTop((tab) => {
    if (TAB_FOR_KEY[key] === tab || key === tab) scroller.current?.scrollTo({ y: 0, animated: true });
  }), [key]);

  const showRail = Boolean(rail) && isDesktop;
  // Centred column, like Instagram's 935px container.
  const columnWidth = showRail ? LAYOUT.feedColumn : LAYOUT.soloColumn;
  const containerWidth = showRail ? columnWidth + LAYOUT.rail + spacing.xxl : columnWidth;

  const constrain = (node: ReactNode) =>
    isPhone ? node : <View style={[styles.constrain, { maxWidth: containerWidth }]}>{node}</View>;

  const header =
    title || onBack ? (
      constrain(
        <View style={[styles.header, !isPhone && styles.headerWide]}>
          {onBack ? (
            <Pressable
              onPress={onBack}
              style={styles.back}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Ionicons name="chevron-back" size={22} color={colors.text} />
            </Pressable>
          ) : null}
          <View style={styles.headerText}>
            <Text style={compactTitle || !isPhone ? styles.titleCompact : styles.title}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
          {right}
        </View>,
      )
    ) : null;

  const main = (
    <View style={[padded && styles.padded, { paddingBottom: scroll ? spacing.xxxl : 0, flex: showRail || !scroll ? 1 : undefined }]}>
      {children}
    </View>
  );

  const body = constrain(
    showRail ? (
      <View style={styles.withRail}>
        <View style={[styles.column, { maxWidth: columnWidth }]}>{main}</View>
        <View style={[styles.rail, { width: LAYOUT.rail }]}>{rail}</View>
      </View>
    ) : (
      main
    ),
  );

  return (
    <KeyboardScrollContext.Provider value={scroll ? reveal : null}>
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: isPhone ? insets.top : spacing.sm }]}
      // A scrolling page moves the box itself; a fixed page lifts everything.
      behavior={Platform.OS === 'ios' && !scroll ? 'padding' : undefined}
      enabled={Platform.OS === 'ios' && !scroll}
    >
      {headerWrapper ? headerWrapper(header) : header}
      {scroll ? (
        <Reanimated.ScrollView
          ref={(node: unknown) => { scroller.current = node as unknown as ScrollView | null; if (scrollRef) scrollRef.current = node as unknown as ScrollView | null; webPull(node as unknown as ScrollView | null); }}
          style={styles.flex}
          contentContainerStyle={[styles.scrollContent, verticalOnlyTouch]}
          scrollEnabled={!swiping}
          directionalLockEnabled
          keyboardShouldPersistTaps="handled"
          // Keeps whatever box you are typing in above the keyboard.
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          // Set before the first paint, so there is no visible jump. Web ignores
          // this, which is what the fallback below is for.
          contentOffset={{ x: 0, y: initial.current }}
          onScroll={onScrollAnimated}
          refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={() => { void refreshNow(); }} tintColor="transparent" colors={['transparent']} progressBackgroundColor="transparent" /> : undefined}
          onContentSizeChange={(_width, height) => {
            if (restored.current) return;
            // Wait until the content is tall enough to hold the position,
            // otherwise the scroll clamps to the bottom of a half-built page.
            if (height > initial.current) {
              restored.current = true;
              scroller.current?.scrollTo({ y: initial.current, animated: false });
            }
          }}
        >
          {body}
        </Reanimated.ScrollView>
      ) : (
        <View style={styles.flex}>{body}</View>
      )}
      {onRefresh && Platform.OS !== 'web' && refreshing ? (
        <View pointerEvents="none" style={styles.webRefresh}><CourtSpinner size={26} /></View>
      ) : null}
      {onRefresh && Platform.OS === 'web' && (pulling || refreshing) ? (
        <Animated.View pointerEvents="none" style={[styles.webRefresh, { opacity: pull, transform: [{ translateY: pull.interpolate({ inputRange: [0, 1], outputRange: [-46, 6] }) }, { rotate: pull.interpolate({ inputRange: [0, 1], outputRange: ['-120deg', '0deg'] }) }] }]}>
          {refreshing ? <CourtSpinner size={26} /> : <View style={styles.pullArc} />}
        </Animated.View>
      ) : null}
      {onRefresh ? (
        <Animated.View pointerEvents="none" style={[styles.updated, { opacity: updated, transform: [{ translateY: updated.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }, { scale: updated.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }] }]}>
          <Ionicons name="checkmark-circle" size={14} color={colors.brand} />
          <Text style={styles.updatedText}>Updated</Text>
        </Animated.View>
      ) : null}
    </KeyboardAvoidingView>
    </KeyboardScrollContext.Provider>
  );
}

const styleDefinitions = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  pullArc: { width: 26, height: 26, borderRadius: 13, borderWidth: 2.5, borderColor: colors.brand, borderTopColor: 'transparent', opacity: 0.9 },
  webRefresh: { position: 'absolute', alignSelf: 'center', top: 6, width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  updated: { position: 'absolute', alignSelf: 'center', top: 6, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  updatedText: { ...typography.smallStrong, color: colors.text },
  constrain: { width: '100%', alignSelf: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  headerWide: { paddingTop: spacing.xl, paddingBottom: spacing.lg },
  headerText: { flex: 1, gap: 2 },
  title: { ...typography.display, color: colors.text },
  titleCompact: { ...typography.title, color: colors.text },
  back: { paddingRight: spacing.xs, paddingVertical: spacing.xs },
  subtitle: { ...typography.small, color: colors.textMuted },
  padded: { paddingHorizontal: spacing.lg },
  withRail: { flexDirection: 'row', gap: spacing.xxl, alignItems: 'flex-start' },
  column: { flex: 1 },
  rail: { paddingTop: spacing.lg, paddingRight: spacing.lg },
});
