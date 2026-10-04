import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
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
  useEffect(() => {
    const at = spots.current.get(selected ?? 'for-you');
    if (!at || !viewW) return;
    const to = viewW / 2 - (at.x + at.w / 2);
    if (!placed.current) { placed.current = true; shift.value = to; return; }
    shift.value = withSpring(to, { damping: 22, stiffness: 220, mass: 0.8 });
  }, [selected, viewW, measured, shift]);
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
                  onPress={() => onSelect(w.id)}
                  onLayout={(e) => {
                    spots.current.set(w.id ?? 'for-you', { x: e.nativeEvent.layout.x, w: e.nativeEvent.layout.width });
                    if (spots.current.size >= words.length) setMeasured((n) => n + 1);
                  }}
                >
                  <Text numberOfLines={1} style={[styles.word, on && styles.wordOn, { color: ink, opacity: on ? 1 : 0.6 }, edge]}>{w.name}</Text>
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

const styleDefinitions = StyleSheet.create({
  layer: { position: 'absolute', left: 0, right: 0, height: TOP_BAND_HEIGHT, zIndex: 8, alignItems: 'center', justifyContent: 'center' },
  clip: { alignSelf: 'stretch', overflow: 'hidden', height: TOP_BAND_HEIGHT },
  row: { position: 'absolute', left: 0, top: 0, flexDirection: 'row', alignItems: 'center', gap: 9, height: TOP_BAND_HEIGHT },
  word: { fontSize: 16.5, lineHeight: 22, ...font('500'), letterSpacing: -0.25, maxWidth: 150, paddingVertical: 2 },
  wordOn: { ...font('700') },
  dot: { fontSize: 16, lineHeight: 22, opacity: 0.5 },
  plus: { marginLeft: 6, width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  waiting: { position: 'absolute', top: 2, right: 2, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brand, borderWidth: 1.5, borderColor: colors.bg },
});
