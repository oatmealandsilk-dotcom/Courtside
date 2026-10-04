import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, interpolate, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GLYPH_EDGE } from '@/components/ReelCaption';
import { TOP_BAND_HEIGHT, TOP_BAND_TOP } from '@/features/feed/topBand';
import { colors, font } from '@/theme';
import { useTheme, useThemedStyles } from '@/theme/ThemeProvider';

/*
 * The words across the top of the Feed, the way Reels has them: "Activities", "For you",
 * then each group you are in, then a "+" that opens Find groups (a sheet:
 * join a group, or start one). Plain words, no
 * pills: the one you are on is bold and full strength, the rest are dimmer.
 * Over a clip they are white with the rail's dark edge, so they read on any
 * picture; on a written post they take the theme's own ink. They sit in a
 * band of their own just under the clock (features/feed/topBand): a page's
 * words start below it, an empty feed centres under it, and a clip's sound
 * disc steps down out of it.
 */

interface Props {
  groups: { id: string; name: string }[];
  /** The group on show, or null for For you. */
  selected: string | null;
  onSelect: (groupId: string | null) => void;
  onPlus: () => void;
  /** A clip or a hit fills the top of the page. */
  onPicture: boolean;
  /** Pinched in, or comments open: the row steps aside with the rest of the chrome. */
  hidden: boolean;
  /** A dot on the "+": someone is asking to join a group you run. */
  waiting?: boolean;
}

export function FeedTopRow({ groups, selected, onSelect, onPlus, onPicture, hidden, waiting }: Props) {
  const styles = useThemedStyles(styleDefinitions);
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  // Over a picture: white, as Reels does. The New York ground is navy, so its ink is white too.
  const ink = onPicture || theme === 'us-open' ? '#FFFFFF' : colors.text;
  const edge = onPicture ? GLYPH_EDGE : null;
  // Activities sits left of For you (Oct 4): sessions with stats, as Strava's feed.
  const words = [{ id: 'activities' as string | null, name: 'Activities' }, { id: null as string | null, name: 'For you' }, ...groups];
  // The camera's mode picker (Oct 4, owner): the word on show always sits in
  // the middle of the screen, and a tap slides the row so the new one glides
  // there, the others passing left or right. "+" rides at the row's end.
  const spots = useRef(new Map<string, { x: number; w: number }>());
  const [viewW, setViewW] = useState(0);
  const [measured, setMeasured] = useState(0);
  const shift = useSharedValue(0);
  const placed = useRef(false);
  const target = useRef(0);
  useEffect(() => {
    const at = spots.current.get(selected ?? 'for-you');
    if (!at || !viewW) return;
    const to = viewW / 2 - (at.x + at.w / 2);
    if (!placed.current) { placed.current = true; target.current = to; shift.value = to; return; }
    // Already heading there (the tap began it): leave the glide running untouched.
    if (Math.abs(target.current - to) < 0.5) return;
    target.current = to;
    // One smooth glide, Apple's ease-out, no bounce: a spring re-aimed mid-flight read as a jolt.
    shift.value = withTiming(to, { duration: 380, easing: Easing.bezier(0.22, 1, 0.36, 1) });
  }, [selected, viewW, measured, shift]);
  // The glide starts on the tap itself; the feed underneath switches a frame later,
  // so its heavy first draw never holds the row back.
  const glideTo = (key: string) => {
    const at = spots.current.get(key);
    if (!at || !viewW) return;
    target.current = viewW / 2 - (at.x + at.w / 2);
    shift.value = withTiming(target.current, { duration: 380, easing: Easing.bezier(0.22, 1, 0.36, 1) });
  };
  const slide = useAnimatedStyle(() => ({ transform: [{ translateX: shift.value }] }));
  return (
    <View pointerEvents={hidden ? 'none' : 'box-none'} style={[styles.layer, { top: insets.top + TOP_BAND_TOP, opacity: hidden ? 0 : 1 }]}>
      <View style={styles.clip} onLayout={(e) => setViewW(e.nativeEvent.layout.width)} pointerEvents="box-none">
        <Animated.View style={[styles.row, slide, { opacity: viewW && measured ? 1 : 0 }]}>
          {words.map((w, i) => {
            const on = w.id === selected;
            return (
              <React.Fragment key={w.id ?? 'for-you'}>
                {i > 0 ? <Text style={[styles.dot, { color: ink }, edge]}>·</Text> : null}
                <Pressable
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={w.id === 'activities' ? 'Activities' : w.id ? `${w.name}, group feed` : 'For you'}
                  hitSlop={{ top: 10, bottom: 10, left: 4, right: 4 }}
                  onPress={() => { if (on) return; glideTo(w.id ?? 'for-you'); requestAnimationFrame(() => onSelect(w.id)); }}
                  onLayout={(e) => {
                    spots.current.set(w.id ?? 'for-you', { x: e.nativeEvent.layout.x, w: e.nativeEvent.layout.width });
                    if (spots.current.size >= words.length) setMeasured((n) => n + 1);
                  }}
                >
                  <Word name={w.name} spotKey={w.id ?? 'for-you'} spots={spots} shift={shift} viewW={viewW} style={[styles.word, { color: ink }, edge]} />
                </Pressable>
              </React.Fragment>
            );
          })}
          <Pressable accessibilityRole="button" accessibilityLabel={waiting ? 'Find or start a group, someone is asking to join yours' : 'Find or start a group'} hitSlop={10} onPress={onPlus} style={styles.plus}>
            <Ionicons name="add" size={22} color={ink} style={[{ opacity: 0.85 }, edge]} />
            {waiting ? <View style={styles.waiting} /> : null}
          </Pressable>
        </Animated.View>
      </View>
    </View>
  );
}

/**
 * One word of the row. Its brightness and size follow how near the middle it
 * is, frame by frame on the animation thread, so the highlight travels with
 * the glide instead of jumping when the tap lands. Every word keeps one weight:
 * a word turning bold changed its width and moved the row's target mid-glide.
 */
function Word({ name, spotKey, spots, shift, viewW, style }: { name: string; spotKey: string; spots: React.MutableRefObject<Map<string, { x: number; w: number }>>; shift: SharedValue<number>; viewW: number; style: object }) {
  const centre = useSharedValue(-1000);
  const at = spots.current.get(spotKey);
  useEffect(() => { if (at) centre.value = at.x + at.w / 2; });
  const look = useAnimatedStyle(() => {
    const away = Math.abs(shift.value + centre.value - viewW / 2);
    return { opacity: interpolate(away, [0, 70], [1, 0.55], 'clamp'), transform: [{ scale: interpolate(away, [0, 70], [1, 0.94], 'clamp') }] };
  });
  return <Animated.Text numberOfLines={1} style={[style, look]}>{name}</Animated.Text>;
}

const styleDefinitions = StyleSheet.create({
  layer: { position: 'absolute', left: 0, right: 0, height: TOP_BAND_HEIGHT, zIndex: 8, alignItems: 'center', justifyContent: 'center' },
  clip: { alignSelf: 'stretch', overflow: 'hidden', height: TOP_BAND_HEIGHT },
  row: { position: 'absolute', left: 0, top: 0, flexDirection: 'row', alignItems: 'center', gap: 9, height: TOP_BAND_HEIGHT },
  word: { fontSize: 17, lineHeight: 22, ...font('600'), letterSpacing: -0.3, maxWidth: 150, paddingVertical: 2 },
  wordOn: { ...font('700') },
  dot: { fontSize: 15, lineHeight: 22, opacity: 0.35 },
  plus: { marginLeft: 6, width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  waiting: { position: 'absolute', top: 2, right: 2, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brand, borderWidth: 1.5, borderColor: colors.bg },
});
