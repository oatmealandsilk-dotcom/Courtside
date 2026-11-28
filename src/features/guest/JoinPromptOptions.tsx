import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useMemo, useRef } from 'react';
import { Linking, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, { Easing, FadeIn, FadeOut, SlideInDown, SlideInRight, SlideOutDown, SlideOutRight } from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui';
import { setSidePanel } from '@/features/feed/sidePanel';
import { LAYOUT, useResponsive } from '@/lib/useResponsive';
import { colors, spacing, typography } from '@/theme';
import { IPHONE_APP_URL, closeJoinSheet, type JoinAsk } from './joinAsk';
import { noteAppTap } from './campaign';
import { recentPress, type JoinPromptLook } from './joinPromptLook';

/**
 * The three website options for the guest join prompt (see joinPromptLook). Website only, and only
 * behind ?jp=a|b|c: without it JoinSheet shows today's prompt. None dims or blurs the page, none
 * floats on a big shadow: hairlines and the page's own surfaces, the way the rest of the site is drawn.
 */
type Go = (create: boolean) => void;
interface Props { look: JoinPromptLook; ask: JoinAsk; go: Go }

const EASE = Easing.bezier(0.22, 1, 0.36, 1);

export function JoinPromptOption({ look, ask, go }: Props) {
  if (look === 'a') return <InlineAsk ask={ask} go={go} />;
  if (look === 'b') return <BarAsk ask={ask} go={go} />;
  return <PanelAsk ask={ask} go={go} />;
}

/** Closes on a press anywhere outside `node` (the website's own pointer events). */
function useOutsidePress(node: React.RefObject<View | null>) {
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onDown = (e: PointerEvent) => {
      const el = node.current as unknown as HTMLElement | null;
      if (el && e.target instanceof Node && el.contains(e.target)) return;
      closeJoinSheet();
    };
    // Added a frame later, so the press that opened it never closes it.
    const t = setTimeout(() => window.addEventListener('pointerdown', onDown, true), 0);
    return () => { clearTimeout(t); window.removeEventListener('pointerdown', onDown, true); };
  }, [node]);
}

const reportLink = (report: string) => () => {
  void Linking.openURL(`mailto:support@courtsidebase.com?subject=${encodeURIComponent(`Report ${report}`)}`);
  closeJoinSheet();
};

/* ---------- A · Inline: a small row beside what was tapped ---------- */

const ROW_W = 300;
const ROW_H = 48;

function InlineAsk({ ask, go }: { ask: JoinAsk; go: Go }) {
  const styles = useThemedStyles(styleDefinitions);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const node = useRef<View>(null);
  useOutsidePress(node);
  // Where the press was, taken once for this ask: beside it, on the side with room
  // (the like and comment buttons sit on the right, so most often to their left).
  const at = useMemo(() => {
    const press = recentPress();
    if (!press) return { left: Math.max(spacing.lg, (width - ROW_W) / 2), top: height - insets.bottom - ROW_H - 96 };
    const gap = 30;
    const left = press.x > width / 2 ? press.x - gap - ROW_W : press.x + gap;
    const top = press.y - ROW_H / 2;
    return {
      left: Math.min(Math.max(spacing.md, left), width - ROW_W - spacing.md),
      top: Math.min(Math.max(insets.top + spacing.md, top), height - ROW_H - spacing.md),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ask.at]);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View
        ref={node}
        key={ask.at}
        entering={FadeIn.duration(160).easing(EASE)}
        exiting={FadeOut.duration(120)}
        accessibilityRole="alert"
        style={[styles.inline, { left: at.left, top: at.top, width: ROW_W }]}
      >
        <Text numberOfLines={1} style={styles.inlineText}>Join to {ask.what}</Text>
        <Pressable accessibilityRole="link" hitSlop={8} onPress={() => go(false)} style={styles.inlineLinkHit}>
          <Text style={styles.inlineLink}>Sign in</Text>
        </Pressable>
        <Button label="Join" size="sm" onPress={() => go(true)} accessibilityLabel={`Join CourtSide to ${ask.what}`} />
      </Animated.View>
    </View>
  );
}

/* ---------- B · Bar: one line docked to the bottom of the feed ---------- */

function BarAsk({ ask, go }: { ask: JoinAsk; go: Go }) {
  const styles = useThemedStyles(styleDefinitions);
  const insets = useSafeAreaInsets();
  const { isPhone, isCompactSidebar } = useResponsive();
  // Under the page, not the window: it starts where the sidebar ends.
  const left = isPhone ? 0 : isCompactSidebar ? LAYOUT.sidebarCompact : LAYOUT.sidebar;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View
        entering={SlideInDown.duration(260).easing(EASE)}
        exiting={SlideOutDown.duration(180)}
        accessibilityRole="alert"
        style={[styles.bar, { left, paddingBottom: insets.bottom + (isPhone ? spacing.md : spacing.lg) }]}
      >
        <View style={[styles.barInner, isPhone && styles.barInnerPhone]}>
          <View style={styles.barWords}>
            <Text style={styles.barTitle} numberOfLines={isPhone ? 2 : 1}>Join CourtSide to {ask.what}</Text>
            {isPhone ? null : <Text style={styles.barBody} numberOfLines={1}>It’s free, and it’s where your clips, hits and coaches live.</Text>}
          </View>
          <View style={styles.barActions}>
            {ask.report ? (
              <Pressable accessibilityRole="link" hitSlop={8} onPress={reportLink(ask.report)}>
                <Text style={styles.quiet}>Email a report</Text>
              </Pressable>
            ) : null}
            <Pressable accessibilityRole="link" hitSlop={8} onPress={() => go(false)}>
              <Text style={styles.barLink}>Sign in</Text>
            </Pressable>
            <Button label={isPhone ? 'Join' : 'Create a free account'} size="sm" onPress={() => go(true)} />
            <Pressable accessibilityRole="button" accessibilityLabel="Not now" hitSlop={10} onPress={closeJoinSheet} style={styles.barClose}>
              <Ionicons name="close" size={18} color={colors.textMuted} />
            </Pressable>
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

/* ---------- C · Sheet: a flat panel on the right, where comments open ---------- */

const PANEL_W = 380;

function PanelAsk({ ask, go }: { ask: JoinAsk; go: Go }) {
  const styles = useThemedStyles(styleDefinitions);
  const insets = useSafeAreaInsets();
  const { isPhone } = useResponsive();
  const node = useRef<View>(null);
  useOutsidePress(node);
  // On a computer the clip moves left to stay in view beside it, as it does for comments.
  useEffect(() => {
    if (isPhone) return undefined;
    setSidePanel(PANEL_W);
    return () => setSidePanel(0);
  }, [isPhone]);
  const body = (
    <>
      <View style={styles.panelHead}>
        <Text accessibilityRole="header" style={styles.panelTitle}>Join CourtSide to {ask.what}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Not now" hitSlop={10} onPress={closeJoinSheet}>
          <Ionicons name="close" size={20} color={colors.textMuted} />
        </Pressable>
      </View>
      <Text style={styles.panelBody}>Free. Post your clips, find people to hit with, and ask real coaches about your game.</Text>
      <View style={styles.panelSteps}>
        <Pressable accessibilityRole="button" onPress={() => go(true)} style={({ pressed }) => [styles.panelRow, pressed && styles.pressed]}>
          <Ionicons name="logo-google" size={17} color={colors.text} />
          <Text style={styles.panelRowText}>Sign up with Google</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => go(true)} style={({ pressed }) => [styles.panelRow, pressed && styles.pressed]}>
          <Ionicons name="mail-outline" size={17} color={colors.text} />
          <Text style={styles.panelRowText}>Sign up with email</Text>
        </Pressable>
      </View>
      <Pressable accessibilityRole="link" hitSlop={6} onPress={() => go(false)} style={styles.panelSignIn}>
        <Text style={styles.quiet}>Have an account? <Text style={styles.barLink}>Sign in</Text></Text>
      </Pressable>
      <View style={styles.panelFoot}>
        {ask.report ? (
          <Pressable accessibilityRole="link" hitSlop={6} onPress={reportLink(ask.report)}>
            <Text style={styles.quiet}>No account? <Text style={styles.barLink}>Email us about it</Text></Text>
          </Pressable>
        ) : null}
        <Pressable accessibilityRole="link" accessibilityLabel="Get the iPhone app" hitSlop={8} onPress={() => { noteAppTap(); void Linking.openURL(IPHONE_APP_URL); }} style={styles.panelApp}>
          <Ionicons name="logo-apple" size={15} color={colors.textMuted} />
          <Text style={styles.quiet}>Get the iPhone app</Text>
        </Pressable>
      </View>
    </>
  );
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {isPhone ? (
        <Animated.View ref={node} entering={SlideInDown.duration(280).easing(EASE)} exiting={SlideOutDown.duration(180)} accessibilityViewIsModal style={[styles.panelPhone, { paddingBottom: insets.bottom + spacing.lg }]}>
          {body}
        </Animated.View>
      ) : (
        <Animated.View ref={node} entering={SlideInRight.duration(280).easing(EASE)} exiting={SlideOutRight.duration(180)} accessibilityViewIsModal style={[styles.panel, { width: PANEL_W }]}>
          {body}
        </Animated.View>
      )}
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  // A
  inline: {
    position: 'absolute', height: ROW_H, flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingLeft: spacing.lg, paddingRight: 7, backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong, borderRadius: 12,
  },
  inlineText: { ...typography.smallStrong, color: colors.text, flex: 1 },
  inlineLinkHit: { paddingVertical: spacing.xs },
  inlineLink: { ...typography.smallStrong, color: colors.textMuted },
  // B
  bar: {
    position: 'absolute', right: 0, bottom: 0, backgroundColor: colors.bg,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderStrong,
    paddingTop: spacing.md, paddingHorizontal: spacing.xl,
  },
  barInner: { width: '100%', maxWidth: 760, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  barInnerPhone: { gap: spacing.md },
  barWords: { flex: 1, minWidth: 0, gap: 2 },
  barTitle: { ...typography.bodyStrong, color: colors.text },
  barBody: { ...typography.small, color: colors.textMuted },
  barActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  barLink: { ...typography.smallStrong, color: colors.brand },
  barClose: { marginLeft: -spacing.xs },
  quiet: { ...typography.small, color: colors.textMuted },
  // C
  panel: {
    position: 'absolute', top: 0, right: 0, bottom: 0, backgroundColor: colors.bg,
    borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.borderStrong,
    paddingHorizontal: spacing.xl, paddingTop: spacing.xxl, gap: spacing.lg,
  },
  panelPhone: {
    position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.bg,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderStrong,
    borderTopLeftRadius: 8, borderTopRightRadius: 8,
    paddingHorizontal: spacing.lg, paddingTop: spacing.lg, gap: spacing.lg,
  },
  panelHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  panelTitle: { ...typography.heading, color: colors.text, flex: 1 },
  panelBody: { ...typography.body, color: colors.textMuted, lineHeight: 22, marginTop: -spacing.xs },
  panelSteps: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  panelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  panelRowText: { ...typography.bodyStrong, color: colors.text },
  pressed: { opacity: 0.6 },
  panelSignIn: { alignSelf: 'flex-start' },
  panelFoot: { marginTop: 'auto', paddingBottom: spacing.xl, gap: spacing.md },
  panelApp: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
