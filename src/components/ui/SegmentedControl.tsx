import { PRESS_DIM } from '@/theme/press';
import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { TextScale, colors, oneLine, radius, spacing, typography } from '@/theme';
import { trackCorner } from '@/theme/look';

export interface Segment<T extends string> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  segments: Segment<T>[];
  value: T;
  onChange: (next: T) => void;
  scrollable?: boolean;
  /** Two pills per row, for four longer labels that would otherwise be cut short. */
  wrap?: boolean;
  /**
   * The chosen one's fill and words, when not the brand's (a sheet's form
   * fills its choice with ink, as its Chips do, keeping green for the one
   * thing to press). Read from the live `colors` as you draw.
   */
  tint?: string;
  ink?: string;
  /** Taller, with body-size words: the one choice on a short sheet (Start a session's kind). */
  large?: boolean;
  /** Picks one of a few (a kind, not a page): read out as radio buttons rather than tabs. */
  radio?: boolean;
  /** What the choice is, for a screen reader ("Type of session"). */
  accessibilityLabel?: string;
  /**
   * The chosen pill slides to the one tapped instead of jumping, for a switch
   * between a page's sections (Followers / Following, Likes / Upvotes / Saved,
   * Ask / This week), as Profile's and Community's do (Oct 20 sweep). Choices
   * inside a form stay as they are.
   */
  slide?: boolean;
}

/** The track's inner padding and the gap between segments (the gliding pill is placed by it). */
const TRACK_PAD = 4;

/** The pill's glide: quick, on the app's own ease-out, no bounce. */
const GLIDE = { duration: 220, easing: Easing.bezier(0.22, 0.61, 0.36, 1) };

export function SegmentedControl<T extends string>({
  segments,
  value,
  onChange,
  scrollable = false,
  wrap = false,
  tint,
  ink,
  large = false,
  radio = false,
  accessibilityLabel,
  slide = false,
}: Props<T>) {
  const styles = useThemedStyles(styleDefinitions);
  // Sliding: one pill drawn behind the words, moved to the chosen one's place (all the segments are the same width).
  const gliding = slide && !scrollable && !wrap;
  const [box, setBox] = useState<{ first: number | null; second: number | null; w: number; h: number; step: number } | null>(null);
  const at = Math.max(0, segments.findIndex((s) => s.value === value));
  const x = useSharedValue(0);
  const placed = useRef(false);
  useEffect(() => {
    if (!box) return;
    const to = at * box.step;
    if (!placed.current) { placed.current = true; x.value = to; return; }
    x.value = withTiming(to, GLIDE);
  }, [at, box, x]);
  const pill = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const items = segments.map((segment, i) => {
    const active = segment.value === value;
    return (
      <Pressable
        key={segment.value}
        onPress={() => onChange(segment.value)}
        accessibilityRole={radio ? 'radio' : 'tab'}
        accessibilityState={radio ? { checked: active } : { selected: active }}
        onLayout={gliding && i < 2 ? (e) => {
          const { x: left, width, height } = e.nativeEvent.layout;
          // The first segment gives the size; the second, the step from one to the next. Only the
          // difference between the two is used, so the track's 1px border (counted in a phone's
          // layout x, not in a browser's) never shifts the pill (D10 review).
          setBox((was) => {
            const first = i === 0 ? left : was?.first ?? null;
            const second = i === 1 ? left : was?.second ?? null;
            const next = {
              first,
              second,
              w: i === 0 ? width : was?.w ?? width,
              h: i === 0 ? height : was?.h ?? height,
              step: first != null && second != null ? second - first : (i === 0 ? width : was?.w ?? width) + TRACK_PAD,
            };
            return was && was.first === next.first && was.second === next.second && was.w === next.w && was.h === next.h && was.step === next.step ? was : next;
          });
        } : undefined}
        style={({ pressed }) => [styles.segment, large && styles.segmentLarge, wrap && styles.segmentWrapped, scrollable && styles.segmentLoose, active && !(gliding && box) && styles.segmentActive, active && tint && !(gliding && box) ? { backgroundColor: tint, borderColor: tint } : null, pressed && !active && styles.segmentPressed]}
      >
        <Text style={[styles.label, large && styles.labelLarge, scrollable && { flexShrink: 0 }, active && styles.labelActive, active && ink ? { color: ink } : null]} {...(scrollable ? { numberOfLines: 1, maxFontSizeMultiplier: TextScale.TITLE } : oneLine(TextScale.TITLE, 0.75))} numberOfLines={1}>
          {segment.label}
        </Text>
      </Pressable>
    );
  });

  if (scrollable) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollTrack}
      >
        {items}
      </ScrollView>
    );
  }

  return (
    <View accessibilityRole={radio ? 'radiogroup' : undefined} accessibilityLabel={accessibilityLabel} style={[styles.track, wrap && styles.trackWrapped]}>
      {gliding && box ? <Animated.View pointerEvents="none" style={[styles.glider, { width: box.w, height: box.h }, tint ? { backgroundColor: tint } : null, pill]} /> : null}
      {items}
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  track: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: trackCorner(TRACK_PAD),
    borderWidth: 1,
    borderColor: colors.border,
    padding: TRACK_PAD,
    gap: TRACK_PAD,
  },
  scrollTrack: { flexDirection: 'row', gap: spacing.sm, paddingRight: spacing.lg },
  trackWrapped: { flexWrap: 'wrap', borderRadius: radius.lg },
  segment: {
    flex: 1,
    paddingVertical: 9,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.chip,
    alignItems: 'center',
  },
  segmentLarge: { paddingVertical: 12 },
  segmentPressed: { opacity: PRESS_DIM },
  // Half the row each, so two fit per line and none of the words get clipped.
  segmentWrapped: { flexBasis: '48%', flexGrow: 1 },
  // Loose in a scrolling row, each chip carries its own edge so it never looks like bare words.
  // Explicitly not allowed to shrink: in a sideways scroller the browser would otherwise squeeze the words to nothing.
  segmentLoose: { flexGrow: 0, flexShrink: 0, flexBasis: 'auto', minWidth: 64, paddingHorizontal: spacing.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  segmentActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  // Sits where the first segment sits, the track's padding in from its inner edge, on a phone and in a browser alike.
  glider: { position: 'absolute', left: TRACK_PAD, top: TRACK_PAD, borderRadius: radius.chip, backgroundColor: colors.brand },
  label: { ...typography.smallStrong, color: colors.textMuted },
  labelActive: { color: colors.brandInk },
  labelLarge: { ...typography.bodyStrong },
});
