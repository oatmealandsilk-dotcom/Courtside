import React from 'react';
import { Platform, View } from 'react-native';
import Svg, { G, Rect } from 'react-native-svg';
import { useTheme } from '@/theme/ThemeProvider';
import { colors } from '@/theme';

/** A forward-leaning court and a separate sideline, designed for small icons. */
export function BrandMark({ size = 36, color }: { size?: number; color?: string }) {
  useTheme();
  const ink = color ?? colors.brand;
  // Android cannot lean a plain box (it drops a skew), so there the mark was
  // drawn upright, a different logo from the icon. It is drawn as a picture
  // instead, the same shapes on a 100-point grid, leaning the same 14°.
  if (Platform.OS === 'android') {
    return (
      <View accessible accessibilityRole="image" accessibilityLabel="CourtSide logo" style={{ width: size, height: size }}>
        <Svg width={size} height={size} viewBox="0 0 100 100">
          <G transform="translate(41 50) skewX(-14) translate(-41 -50)">
            <Rect x={19.75} y={17.75} width={42.5} height={64.5} fill="none" stroke={ink} strokeWidth={7.5} />
            <Rect x={23.5} y={47.72} width={35} height={5.5} fill={ink} />
          </G>
          <G transform="translate(80.75 50) skewX(-14) translate(-80.75 -50)">
            <Rect x={77} y={14} width={7.5} height={72} fill={ink} />
          </G>
        </Svg>
      </View>
    );
  }
  return <View accessible accessibilityRole="image" accessibilityLabel="CourtSide logo" style={{ width: size, height: size }}>
    <View style={{position:'absolute',left:size*.16,top:size*.14,width:size*.5,height:size*.72,borderWidth:size*.075,borderColor:ink,transform:[{skewX:'-14deg'}]}}>
      <View style={{position:'absolute',left:0,right:0,top:'46%',height:size*.055,backgroundColor:ink}}/>
    </View>
    <View style={{position:'absolute',left:size*.77,top:size*.14,width:size*.075,height:size*.72,backgroundColor:ink,transform:[{skewX:'-14deg'}]}}/>
  </View>;
}
