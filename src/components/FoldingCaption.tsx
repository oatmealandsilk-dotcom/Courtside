import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';

import { RichText } from '@/components/RichText';

/**
 * A caption that folds after a couple of lines with “more” under it, the way
 * TikTok and Instagram do, instead of stopping mid-sentence on “…”. A hidden
 * full-length copy measures the real height, so “more” only appears when
 * something is actually folded away. Tap again to fold it back.
 */
export function FoldingCaption({ text, lines = 2, openLines = 14, style, moreStyle }: {
  text: string;
  lines?: number;
  openLines?: number;
  style: StyleProp<TextStyle>;
  moreStyle: StyleProp<TextStyle>;
}) {
  const [open, setOpen] = useState(false);
  const [fullHeight, setFullHeight] = useState(0);
  const lineHeight = StyleSheet.flatten(style)?.lineHeight ?? 19;
  const folds = fullHeight > lineHeight * lines + 2;
  return (
    <Pressable
      disabled={!folds}
      onPress={() => setOpen((value) => !value)}
      accessibilityRole={folds ? 'button' : undefined}
      accessibilityLabel={folds ? (open ? 'Show less of the caption' : 'Show the whole caption') : undefined}
      accessibilityState={folds ? { expanded: open } : undefined}
      style={styles.wrap}
    >
      <View>
        <RichText numberOfLines={open ? openLines : lines} style={style}>{text}</RichText>
        <View pointerEvents="none" aria-hidden importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={styles.measure}>
          <Text style={style} onLayout={(e) => setFullHeight(e.nativeEvent.layout.height)}>{text}</Text>
        </View>
      </View>
      {folds ? <Text style={moreStyle}>{open ? 'less' : 'more'}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 2 },
  measure: { position: 'absolute', left: 0, right: 0, top: 0, opacity: 0 },
});
