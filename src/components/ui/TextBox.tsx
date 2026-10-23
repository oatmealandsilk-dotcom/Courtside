import React, { forwardRef, useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, View, useWindowDimensions, type TextInputProps, type TextStyle, type ViewStyle } from 'react-native';

/**
 * React Native's TextInput, with its grey example ("Search", "Message…")
 * drawn by the app on an iPhone so it sits in the middle of a one-line box.
 *
 * Why (Oct 23, owner's Messages screenshot: "Search" half below the box): a
 * one-line box on an iPhone is UIKit's UITextField. React Native pads it by
 * overriding where the typed words go (textRectForBounds / editingRectForBounds
 * in RCTUITextField.mm) but never where UIKit's own placeholder label goes, so
 * the example is laid out by UIKit on its own and lands low, down to half under
 * the bottom edge, depending on the font's metrics and the box's padding: it
 * moved when the app went from Inter to the iPhone's own font (Oct 22), and it
 * was seen on padded and on fixed-height boxes alike (Oct 6 and 7). So on an
 * iPhone the phone's example is kept but made invisible (it still sizes the box
 * and VoiceOver still reads it), and the same words are drawn as a plain Text in
 * the box's padded area, centred by layout, in the box's own font, size and
 * text-size cap: centred at every Dynamic Type size because the box and the
 * words grow together.
 *
 * A `lineHeight` on a one-line iPhone box also pushed its words low (UIKit puts
 * a taller line's extra room above the words, and nothing re-centres them in a
 * text field), so a one-line box drops it there and keeps its height as a
 * minimum instead. Many-line boxes are React Native's own text view, which
 * places its example itself: those, Android and the web are passed straight
 * through.
 */
type Props = TextInputProps;

const OWN_EXAMPLE = Platform.OS === 'ios';
// iOS's own placeholder grey, should a box not name one.
const IOS_PLACEHOLDER = 'rgba(60,60,67,0.3)';

// What places and sizes the box among its neighbours: worn by the holder, so
// the box sits exactly where the bare TextInput did.
const OUTER = new Set([
  'margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight', 'marginHorizontal', 'marginVertical', 'marginStart', 'marginEnd',
  'flex', 'flexGrow', 'flexShrink', 'flexBasis', 'alignSelf',
  'position', 'top', 'bottom', 'left', 'right', 'start', 'end', 'zIndex',
  'width', 'minWidth', 'maxWidth', 'height', 'maxHeight',
  'transform', 'opacity', 'display',
]);

const num = (...values: unknown[]) => {
  for (const v of values) if (typeof v === 'number') return v;
  return 0;
};

export const TextBox = forwardRef<TextInput, Props>(function TextBox(props, ref) {
  const { style, placeholder, placeholderTextColor, multiline, value, defaultValue, onChangeText } = props;
  const { fontScale } = useWindowDimensions();
  const [typed, setTyped] = useState(defaultValue ?? '');
  if (!OWN_EXAMPLE || multiline) return <TextInput ref={ref} {...props} />;

  const flat = (StyleSheet.flatten(style) ?? {}) as TextStyle & Record<string, unknown>;
  const padTop = num(flat.paddingTop, flat.paddingVertical, flat.padding);
  const padBottom = num(flat.paddingBottom, flat.paddingVertical, flat.padding);
  const padLeft = num(flat.paddingLeft, flat.paddingStart, flat.paddingHorizontal, flat.padding);
  const padRight = num(flat.paddingRight, flat.paddingEnd, flat.paddingHorizontal, flat.padding);
  const bTop = num(flat.borderTopWidth, flat.borderWidth);
  const bBottom = num(flat.borderBottomWidth, flat.borderWidth);
  const bLeft = num(flat.borderLeftWidth, flat.borderStartWidth, flat.borderWidth);
  const bRight = num(flat.borderRightWidth, flat.borderEndWidth, flat.borderWidth);

  // The box itself: no lineHeight on one line; the height that line gave it kept as a minimum.
  const { lineHeight, ...inner } = flat;
  const outer: Record<string, unknown> = {};
  for (const key of Object.keys(inner)) {
    if (OUTER.has(key)) { outer[key] = inner[key]; delete inner[key]; }
  }
  if (typeof lineHeight === 'number' && outer.height === undefined) {
    const cap = props.allowFontScaling === false ? 1 : props.maxFontSizeMultiplier ? Math.min(fontScale, Math.max(1, props.maxFontSizeMultiplier)) : fontScale;
    inner.minHeight = Math.max(num(inner.minHeight), lineHeight * cap + padTop + padBottom + bTop + bBottom);
  }
  // Fill the holder when it is stretched or given a height, as the bare box would have.
  inner.flexGrow = 1;
  if (outer.height !== undefined || outer.maxHeight !== undefined) inner.flexShrink = 1;

  const shown = value ?? typed;
  const example: TextStyle = {
    fontSize: flat.fontSize ?? 14,
    fontFamily: flat.fontFamily,
    fontWeight: flat.fontWeight,
    fontStyle: flat.fontStyle,
    fontVariant: flat.fontVariant,
    letterSpacing: flat.letterSpacing,
    textAlign: flat.textAlign === 'center' || flat.textAlign === 'right' ? flat.textAlign : 'left',
    color: (placeholderTextColor as string | undefined) ?? IOS_PLACEHOLDER,
  };
  return (
    <View style={outer as ViewStyle}>
      <TextInput
        ref={ref}
        {...props}
        // Kept, invisible: it still sizes the box and is what VoiceOver reads.
        placeholderTextColor="transparent"
        onChangeText={(text) => { if (value === undefined) setTyped(text); onChangeText?.(text); }}
        style={inner}
      />
      {placeholder && !shown ? (
        <View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[styles.example, { top: bTop + padTop, bottom: bBottom + padBottom, left: bLeft + padLeft, right: bRight + padRight }]}
        >
          <Text
            numberOfLines={1}
            allowFontScaling={props.allowFontScaling}
            maxFontSizeMultiplier={props.maxFontSizeMultiplier}
            style={example}
          >
            {placeholder}
          </Text>
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  // Centred in the box's padded area, where UIKit centres the typed words; overflowing it evenly
  // on a box shorter than its line, so the middle is still the box's middle.
  example: { position: 'absolute', justifyContent: 'center', overflow: 'visible' },
});
