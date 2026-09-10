import React from 'react';
import { View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { colors } from '@/theme';

/** A forward-leaning court and a separate sideline, designed for small icons. */
export function BrandMark({ size = 36, color }: { size?: number; color?: string }) {
  useTheme();
  const ink = color ?? colors.brand;
  return <View accessible accessibilityRole="image" accessibilityLabel="CourtSide logo" style={{ width: size, height: size }}>
    <View style={{position:'absolute',left:size*.16,top:size*.14,width:size*.5,height:size*.72,borderWidth:size*.075,borderColor:ink,transform:[{skewX:'-14deg'}]}}>
      <View style={{position:'absolute',left:0,right:0,top:'46%',height:size*.055,backgroundColor:ink}}/>
    </View>
    <View style={{position:'absolute',left:size*.77,top:size*.14,width:size*.075,height:size*.72,backgroundColor:ink,transform:[{skewX:'-14deg'}]}}/>
  </View>;
}
