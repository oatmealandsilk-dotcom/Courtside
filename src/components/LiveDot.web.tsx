import React from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { colors } from '@/theme';

/*
 * The browser's twin of LiveDot (see there): the same dot and the same ring
 * leaving it, done with a CSS keyframe the way OpenRing.web.tsx does, so
 * nothing ticks on the page's main thread while the dot is on screen (or on a
 * tab that stays mounted behind another one).
 */
const CSS = `.cs-ld-ring{animation:cs-ld-pulse 1.8s cubic-bezier(.33,1,.68,1) infinite} @keyframes cs-ld-pulse{0%{transform:scale(1);opacity:.55}100%{transform:scale(2.8);opacity:0}}`;

if (typeof document !== 'undefined' && !document.getElementById('cs-live-dot-css')) {
  const style = document.createElement('style');
  style.id = 'cs-live-dot-css';
  style.textContent = CSS;
  document.head.appendChild(style);
}

export function LiveDot({ size = 8, color }: { size?: number; color?: string }) {
  useTheme();
  const ink = color ?? colors.brand;
  return (
    <View style={{ width: size, height: size }}>
      {/* A plain div: react-native-web drops className from its own View. */}
      <div className="cs-ld-ring" style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, borderRadius: size / 2, backgroundColor: ink }} />
      <View style={[StyleSheet.absoluteFill, { borderRadius: size / 2, backgroundColor: ink }]} />
    </View>
  );
}
