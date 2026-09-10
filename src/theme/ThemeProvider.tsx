import React, { createContext, useContext, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { colors, lightColors } from './index';

export const darkColors: Record<keyof typeof lightColors, string> = {
  bg: '#121713', bgElevated: '#1C231D', surface: '#202820', surfaceAlt: '#2A342B',
  border: '#354237', borderStrong: '#617063', text: '#F0F2E9', textMuted: '#BDC6B9', textFaint: '#9CA994',
  brand: '#9CC59E', brandInk: '#142317', brandDim: '#304732', court: '#9DC29D', clay: '#D3A888',
  hard: '#93BDD5', grass: '#B2C59C', info: '#93BDD5', success: '#9DC29D', warning: '#D7BE7D', danger: '#F09585',
  overlay: 'rgba(0, 0, 0, 0.65)',
};
const ThemeContext = createContext({ night: false, setNight: (_value: boolean) => {} });
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [night, updateNight] = useState(() => {
    try { return Platform.OS === 'web' && localStorage.getItem('courtside-night-mode') === 'true'; } catch { return false; }
  });
  Object.assign(colors, night ? darkColors : lightColors);
  const setNight = (value: boolean) => {
    Object.assign(colors, value ? darkColors : lightColors);
    updateNight(value);
    try { if (Platform.OS === 'web') localStorage.setItem('courtside-night-mode', String(value)); } catch {}
  };
  return <ThemeContext.Provider value={{ night, setNight }}>{children}</ThemeContext.Provider>;
}
export const useTheme = () => useContext(ThemeContext);

// Recolor existing style definitions while preserving layout and component state.
export function useThemedStyles<T extends object>(definitions: T): T {
  const { night } = useTheme();
  return useMemo(() => {
    const target = night ? darkColors : lightColors;
    const remap = (value: unknown): unknown => {
      if (typeof value === 'string') {
        for (const key of Object.keys(lightColors) as (keyof typeof lightColors)[]) {
          for (const source of [lightColors[key], darkColors[key]]) {
            if (value === source) return target[key];
            if (source.startsWith('#') && value.startsWith(source) && value.length === 9) return target[key] + value.slice(7);
          }
        }
        return value;
      }
      if (Array.isArray(value)) return value.map(remap);
      if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, remap(item)]));
      return value;
    };
    return remap(definitions) as T;
  }, [definitions, night]);
}
