import React from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';

/** The poster exactly as it prints, drawn by the same page: a sheet of paper on the screen. */
export function PosterPreview({ html }: { html: string }) {
  return (
    <View style={{ width: '100%', aspectRatio: 100 / 126.1, borderRadius: 6, overflow: 'hidden', backgroundColor: '#fff', boxShadow: '0px 6px 24px rgba(20, 20, 12, 0.16)' }}>
      <WebView source={{ html }} originWhitelist={['*']} scrollEnabled={false} bounces={false} overScrollMode="never" style={{ flex: 1, backgroundColor: '#fff' }} pointerEvents="none" />
    </View>
  );
}
