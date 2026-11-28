import React from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View, type TextStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Submit } from '@/components/sheet/SheetForm';
import { InkButton, PlainActions, TextAction, plainSheet, plainText } from '@/components/plain/Plain';
import { noBoxes } from '@/features/noBoxes/noBoxes';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { TextScale, buttonShape, colors, radius, spacing, typography } from '@/theme';

const TITLE_ID = 'courtside-alerts-why-title';

/**
 * What "Why turn on alerts" draws (AlertsWhyHost holds when and why): the dim and the card.
 * Its own file so the demo website can draw it for a picture (AlertsWhyHost.web.tsx, ?alertswhy=1);
 * a browser never asks for alerts.
 *
 * Today: the "Who can see you" card's own look (app/map-visibility, design E1), with a short list of
 * reasons in place of its faces. No boxes (demo only, features/noBoxes): the same words on a sheet from
 * the foot, the button at the right sized to its word. On an iPhone, before Apple's own question, it
 * still says Continue and is the one way on (Apple 5.1.1(iv)).
 */
export function AlertsWhyCard({ words, settings, onlyOn, dimStyle, cardStyle, reduce, shown, titleRef, onTurnOn, onNotNow, onTouch, onEscape }: {
  words: { title: string; reasons: { icon: string; text: string }[] };
  settings: boolean;
  onlyOn: boolean;
  dimStyle: object;
  cardStyle: object;
  reduce: boolean;
  shown: SharedValue<number>;
  titleRef: React.RefObject<Text | null>;
  onTurnOn: () => void;
  onNotNow: () => void;
  onTouch: () => void;
  onEscape?: () => void;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const insets = useSafeAreaInsets();
  // No boxes: the sheet rises from the foot (Reduce Motion: it only fades).
  const sheetStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, shown.value * 2), transform: [{ translateY: reduce ? 0 : (1 - shown.value) * 360 }] }));
  const label = settings ? 'Open Settings' : onlyOn ? 'Continue' : 'Turn on alerts';
  return (
    <View style={[styles.layer, PLAIN && styles.plainLayer]}>
      <Animated.View pointerEvents="none" style={[styles.dim, dimStyle]} />
      <View style={[styles.box, PLAIN && styles.plainBox]} accessibilityViewIsModal onAccessibilityEscape={onEscape}>
        <Animated.View style={PLAIN ? [styles.plainSheet, { paddingBottom: insets.bottom + spacing.lg }, sheetStyle] : [styles.card, cardStyle]}>
          {/* Only scrolls if the phone's largest text would push the buttons off the screen. */}
          <ScrollView style={styles.cardScroll} contentContainerStyle={PLAIN ? null : styles.cardWords} bounces={false} alwaysBounceVertical={false} showsVerticalScrollIndicator={false}>
            <Text ref={titleRef} nativeID={TITLE_ID} accessibilityRole="header" maxFontSizeMultiplier={TextScale.TITLE} {...EVEN} style={[styles.cardTitle, PLAIN && styles.plainTitle, EVEN_WEB]}>{words.title}</Text>
            <View style={[styles.reasons, PLAIN && styles.plainReasons]}>
              {words.reasons.map((r) => (
                <View key={r.text} style={styles.reason}>
                  <Ionicons name={r.icon as React.ComponentProps<typeof Ionicons>['name']} size={17} color={colors.textMuted} style={styles.reasonIcon} />
                  <Text style={styles.reasonText}>{r.text}</Text>
                </View>
              ))}
            </View>
            {/* Apple asks only once: someone who said no reads where to turn them on instead. */}
            {settings ? <Text style={styles.cardLine}>Alerts are off for CourtSide in your phone’s Settings.</Text> : null}
          </ScrollView>
          {PLAIN ? (
            <PlainActions>
              {onlyOn ? null : <TextAction label="Not now" tone="muted" onPressIn={onTouch} onPress={onNotNow} />}
              <InkButton label={label} onPress={onTurnOn} />
            </PlainActions>
          ) : (
            <View style={styles.cardActions}>
              <Submit short radius={BUTTON_CORNER} label={label} onPress={onTurnOn} />
              {/* The decline stays plain to see and one tap: the same shape, in plain grey, never hidden. */}
              {onlyOn ? null : (
                <Pressable accessibilityRole="button" accessibilityLabel="Not now" onPressIn={onTouch} onPress={onNotNow} style={({ pressed }) => [styles.notNow, pressed && styles.pressed]}>
                  <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.notNowText}>Not now</Text>
                </Pressable>
              )}
            </View>
          )}
        </Animated.View>
      </View>
      {/* A tap outside is Not now. Not a button for a screen reader: Not now on the card says it. */}
      {/* With Continue the only way out (onlyOn), a tap outside does nothing. */}
      <Pressable accessible={false} focusable={false} importantForAccessibility="no" style={StyleSheet.absoluteFill} onPressIn={onTouch} onPress={onlyOn ? undefined : onNotNow} />
    </View>
  );
}

const PLAIN = noBoxes();

/** Lines that wrap as a sentence does, never one word alone on the last (as the "Who can see you" card). */
const EVEN = { lineBreakStrategyIOS: 'push-out', textBreakStrategy: 'balanced' } as const;
const EVEN_WEB = Platform.OS === 'web' ? ({ textWrap: 'pretty' } as unknown as TextStyle) : null;

/** The card's inner side margin, as the "Who can see you" card's: the words and both buttons share one left edge. */
const CARD_PAD = spacing.lg + spacing.xs;
/** The buttons' corner: a step under the card's, never rounder than the card that holds them. */
const BUTTON_CORNER = radius.md;

// The "Who can see you" card's own look (app/map-visibility, design E1), with a short list of reasons in place of its faces.
const styleDefinitions = StyleSheet.create({
  layer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl, paddingVertical: spacing.xxxl },
  dim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.overlay },
  box: { zIndex: 1, width: '100%', maxWidth: 332, maxHeight: '100%' },
  card: {
    flexShrink: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    ...buttonShape.curve,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.12)',
  },
  cardScroll: { flexGrow: 0, flexShrink: 1 },
  cardWords: { paddingHorizontal: CARD_PAD, paddingTop: spacing.lg + 2 },
  cardTitle: { ...typography.heading, lineHeight: 22, color: colors.text },
  reasons: { marginTop: spacing.md, gap: spacing.sm + 2 },
  reason: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm + 2 },
  reasonIcon: { marginTop: 1 },
  reasonText: { ...typography.small, fontSize: 15, lineHeight: 20, color: colors.text, flex: 1 },
  cardLine: { ...typography.small, fontSize: 14, lineHeight: 19, color: colors.textMuted, marginTop: spacing.md },
  cardActions: { paddingHorizontal: CARD_PAD, paddingTop: spacing.lg + 2, paddingBottom: CARD_PAD, gap: spacing.sm },
  notNow: { minHeight: buttonShape.height, borderRadius: BUTTON_CORNER, ...buttonShape.curve, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg, backgroundColor: colors.surfaceAlt },
  notNowText: { ...typography.bodyStrong, fontSize: buttonShape.label, color: colors.text, textAlign: 'center' },
  pressed: { transform: [{ scale: 0.99 }] },
  // No boxes: a sheet from the foot, the words in the plain look.
  plainLayer: { justifyContent: 'flex-end', alignItems: 'stretch', paddingHorizontal: 0, paddingBottom: 0 },
  plainBox: { maxWidth: '100%' as unknown as number },
  plainSheet: { ...plainSheet, flexShrink: 1 },
  plainTitle: { ...plainText.titleLg },
  plainReasons: { marginTop: spacing.lg },
});
