import React, { createContext, useContext, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { colors, lightColors } from './index';

/**
 * Dark palette. The neutrals keep only a trace of green so they read as a dark
 * surface rather than olive, and the accents stay saturated — desaturating them
 * to match the light theme is what made the whole thing look muddy.
 */
export const darkColors: Record<keyof typeof lightColors, string> = {
  bg: '#0F1412', bgElevated: '#161D19', surface: '#1A221E', surfaceAlt: '#232C27',
  border: '#2C3832', borderStrong: '#46554D', text: '#EDF1EE', textMuted: '#A6B1AB', textFaint: '#7C8781',
  brand: '#8FD79B', brandInk: '#0C1710', brandDim: '#26382C', court: '#8FD79B', clay: '#E09A76',
  hard: '#89C0DE', grass: '#A9CF92', info: '#89C0DE', success: '#8FD79B', warning: '#E8C574', danger: '#F2897B',
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
