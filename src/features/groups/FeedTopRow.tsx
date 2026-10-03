import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandMark } from '@/components/BrandMark';
import { GLYPH_EDGE } from '@/components/ReelCaption';
import { TOP_BAND_HEIGHT, TOP_BAND_TOP } from '@/features/feed/topBand';
import { colors, font } from '@/theme';
import { useTheme, useThemedStyles } from '@/theme/ThemeProvider';

/*
 * The words across the top of the Feed, the way Reels has them: "For you",
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
  const words = [{ id: null as string | null, name: 'For you' }, ...groups];
  return (
    <View pointerEvents={hidden ? 'none' : 'box-none'} style={[styles.layer, { top: insets.top + TOP_BAND_TOP, opacity: hidden ? 0 : 1 }]}>
      {/* The CourtSide mark in the corner (Oct 3), as Instagram keeps its name at the top; on a picture it sits on a small tile so it reads. */}
      <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.mark, onPicture && styles.markTile]}>
        <BrandMark size={onPicture ? 22 : 26} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} style={styles.scroller}>
        {words.map((w, i) => {
          const on = w.id === selected;
          return (
            <React.Fragment key={w.id ?? 'for-you'}>
              {i > 0 ? <Text style={[styles.dot, { color: ink }, edge]}>·</Text> : null}
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                accessibilityLabel={w.id ? `${w.name}, group feed` : 'For you'}
                hitSlop={{ top: 10, bottom: 10, left: 4, right: 4 }}
                onPress={() => onSelect(w.id)}
              >
                <Text numberOfLines={1} style={[styles.word, on && styles.wordOn, { color: ink, opacity: on ? 1 : 0.62 }, edge]}>{w.name}</Text>
              </Pressable>
            </React.Fragment>
          );
        })}
        <Pressable accessibilityRole="button" accessibilityLabel={waiting ? 'Find or start a group, someone is asking to join yours' : 'Find or start a group'} hitSlop={10} onPress={onPlus} style={styles.plus}>
          <Ionicons name="add" size={22} color={ink} style={[{ opacity: 0.85 }, edge]} />
          {waiting ? <View style={styles.waiting} /> : null}
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  layer: { position: 'absolute', left: 0, right: 0, height: TOP_BAND_HEIGHT, zIndex: 8, alignItems: 'center', justifyContent: 'center' },
  scroller: { flexGrow: 0, maxWidth: '72%' },
  mark: { position: 'absolute', left: 16, top: 0, bottom: 0, justifyContent: 'center' },
  markTile: { top: (TOP_BAND_HEIGHT - 32) / 2, bottom: undefined, width: 32, height: 32, borderRadius: 10, alignItems: 'center', backgroundColor: colors.bg, opacity: 0.94 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 8, height: TOP_BAND_HEIGHT },
  word: { fontSize: 16, lineHeight: 22, ...font('500'), letterSpacing: -0.2, maxWidth: 150, paddingVertical: 2 },
  wordOn: { ...font('700') },
  dot: { fontSize: 16, lineHeight: 22, opacity: 0.5 },
  plus: { marginLeft: 6, width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  waiting: { position: 'absolute', top: 2, right: 2, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brand, borderWidth: 1.5, borderColor: colors.bg },
});
