import React from 'react';
import { View } from 'react-native';

/** The poster exactly as it prints, drawn by the same page: a sheet of paper on the screen. */
export function PosterPreview({ html }: { html: string }) {
  return (
    <View style={{ width: '100%', aspectRatio: 100 / 126.1, borderRadius: 6, overflow: 'hidden', backgroundColor: '#fff', boxShadow: '0px 6px 24px rgba(20, 20, 12, 0.16)' }}>
      <iframe title="Poster preview" srcDoc={html} style={{ width: '100%', height: '100%', border: 0, pointerEvents: 'none', display: 'block' }} />
    </View>
  );
}
