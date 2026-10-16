import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent, type StyleProp, type ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { isDesktopBrowser } from '@/lib/browserDevice';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, spacing, typography } from '@/theme';

/**
 * A carousel post's photos, side by side (Oct 15, owner: "can you make post
 * so you can do carousel"): swipe left and right through them, Instagram's
 * way, with "1/3" in the top right and a dot for each photo along the
 * bottom. One file for phones and browsers: a plain sideways scroll view
 * that stops on each photo, the same thing the who-to-follow strip already
 * is inside the feed.
 *
 * How it sits with the swipes around it, as every sideways strip in the app
 * does (see SwipeSurface.web): a sideways drag on the photos only ever moves
 * the photos, and at the first or last one it stops there with a little
 * give, never handing over to the tab swipe ("that is how people ended up in
 * Community by accident"). On a phone the frame around it already holds the
 * page swipe off while a finger is down (lockPageSwipe, MediaPostPage); in a
 * browser the tab swipe skips anything marked data-swipe-ignore, which this
 * is. An up or down drag still goes to the feed.
 *
 * A computer's mouse cannot drag a scroll view, so there it also has a back
 * and next arrow either side; the dots work everywhere.
 */
export function PhotoCarousel({ uris, index, onIndex, renderPage, bottomRoom = 0, style }: {
  uris: string[];
  /** The photo in view; kept by the page so full screen opens on the same one. */
  index: number;
  onIndex: (i: number) => void;
  /** Draws one photo to fill its page; `near` is false for one far from view, which can wait. */
  renderPage: (uri: string, i: number, near: boolean) => React.ReactNode;
  /** Room kept under the dots for something along the bottom edge (the heart-rate foot). */
  bottomRoom?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const row = useRef<ScrollView>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const W = size?.w ?? 0;
  const count = uris.length;
  const at = useRef(index);
  at.current = index;
  // While an arrow or dot glides the row to a photo, the photos it passes on
  // the way do not count as being in view.
  const heading = useRef<number | null>(null);
  const headingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Where the row last was, so a glide cut short by a finger still ends on the photo it stopped at.
  const lastX = useRef(index * W);
  const goTo = (i: number) => {
    const next = Math.max(0, Math.min(count - 1, i));
    if (!W || next === at.current) return;
    heading.current = next;
    if (headingTimer.current) clearTimeout(headingTimer.current);
    // In case the row never quite reports arriving.
    headingTimer.current = setTimeout(() => {
      heading.current = null;
      const settled = Math.max(0, Math.min(count - 1, Math.round(lastX.current / Math.max(1, W))));
      if (settled !== at.current) onIndex(settled);
    }, 700);
    onIndex(next);
    row.current?.scrollTo({ x: next * W, y: 0, animated: true });
  };
  useEffect(() => () => { if (headingTimer.current) clearTimeout(headingTimer.current); }, []);
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!W) return;
    const x = e.nativeEvent.contentOffset.x;
    lastX.current = x;
    const i = Math.max(0, Math.min(count - 1, Math.round(x / W)));
    if (heading.current !== null) {
      if (i === heading.current && Math.abs(x - i * W) < 2) heading.current = null;
      return;
    }
    if (i !== at.current) onIndex(i);
  };
  // A new width (the phone turned, a window resized): the same photo stays in view.
  useEffect(() => {
    if (W) row.current?.scrollTo({ x: at.current * W, y: 0, animated: false });
  }, [W]);
  const desktop = Platform.OS === 'web' && isDesktopBrowser();
  return (
    <View
      style={[styles.box, style]}
      // A browser's tab swipe leaves this alone (SwipeSurface.web): the photos have the sideways drag.
      {...(Platform.OS === 'web' ? ({ dataSet: { swipeIgnore: 'true' } } as object) : {})}
      onLayout={(e) => {
        const w = Math.round(e.nativeEvent.layout.width);
        const h = Math.round(e.nativeEvent.layout.height);
        if (w > 0 && h > 0 && (w !== size?.w || h !== size?.h)) setSize({ w, h });
      }}
    >
      {size ? (
        <ScrollView
          ref={row}
          horizontal
          pagingEnabled
          bounces
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={onScroll}
          contentOffset={{ x: index * size.w, y: 0 }}
          accessibilityLabel={`Photos, ${index + 1} of ${count}`}
          style={StyleSheet.absoluteFill}
        >
          {uris.map((uri, i) => (
            // Each photo kept to its own page: a blurred backdrop drawn larger than the page never shows on the next one.
            <View key={`${i}:${uri}`} style={{ width: size.w, height: size.h, overflow: 'hidden' }}>
              {renderPage(uri, i, Math.abs(i - index) <= 1)}
            </View>
          ))}
        </ScrollView>
      ) : (
        // Before it has measured itself: the photo in view, as a single post draws it.
        <View style={StyleSheet.absoluteFill}>{renderPage(uris[index] ?? uris[0], index, true)}</View>
      )}
      {/* "1/3", top right, as Instagram has it. */}
      <View pointerEvents="none" style={styles.counter}>
        <Text style={styles.counterText}>{`${index + 1}/${count}`}</Text>
      </View>
      {/* A dot for each photo; each one is also a way straight to that photo. */}
      <View pointerEvents="box-none" style={[styles.dots, { bottom: 10 + bottomRoom }]}>
        {uris.map((uri, i) => (
          <Pressable
            key={`${i}:${uri}`}
            accessibilityRole="button"
            accessibilityLabel={`Show photo ${i + 1} of ${count}`}
            accessibilityState={{ selected: i === index }}
            hitSlop={{ top: 10, bottom: 10, left: 3, right: 3 }}
            onPress={() => goTo(i)}
            style={[styles.dot, i === index && styles.dotOn]}
          />
        ))}
      </View>
      {desktop && index > 0 ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Previous photo" onPress={() => goTo(index - 1)} style={({ pressed }) => [styles.arrow, styles.arrowLeft, pressed && styles.arrowPressed]}>
          <Ionicons name="chevron-back" size={18} color={colors.text} />
        </Pressable>
      ) : null}
      {desktop && index < count - 1 ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Next photo" onPress={() => goTo(index + 1)} style={({ pressed }) => [styles.arrow, styles.arrowRight, pressed && styles.arrowPressed]}>
          <Ionicons name="chevron-forward" size={18} color={colors.text} />
        </Pressable>
      ) : null}
    </View>
  );
}

// Colours with an opacity are written as eight-digit hex, so each court's theme recolours them (useThemedStyles).
const styleDefinitions = StyleSheet.create({
  box: { overflow: 'hidden' },
  counter: { position: 'absolute', top: spacing.md, right: spacing.md, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, backgroundColor: colors.overlay },
  counterText: { ...typography.small, fontSize: 12, lineHeight: 16, color: colors.onMedia, fontVariant: ['tabular-nums'] },
  dots: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: `${colors.onMedia}80` },
  dotOn: { backgroundColor: colors.onMedia },
  arrow: { position: 'absolute', top: '50%', marginTop: -16, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: `${colors.surface}E6` },
  arrowLeft: { left: spacing.sm },
  arrowRight: { right: spacing.sm },
  arrowPressed: { opacity: 0.7 },
});
