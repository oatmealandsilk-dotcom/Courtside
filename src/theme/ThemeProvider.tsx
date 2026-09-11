import React, { createContext, useContext, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { colors, lightColors } from './index';

type Palette = Record<keyof typeof lightColors, string>;

/**
 * Dark palette. The neutrals keep only a trace of green so they read as a dark
 * surface rather than olive, and the accents stay saturated — desaturating them
 * to match the light theme is what made the whole thing look muddy.
 */
export const darkColors: Palette = {
  bg: '#0F1412', bgElevated: '#161D19', surface: '#1A221E', surfaceAlt: '#232C27',
  border: '#2C3832', borderStrong: '#46554D', text: '#EDF1EE', textMuted: '#A6B1AB', textFaint: '#7C8781',
  brand: '#8FD79B', brandInk: '#0C1710', brandDim: '#26382C', court: '#8FD79B', clay: '#E09A76',
  hard: '#89C0DE', grass: '#A9CF92', info: '#89C0DE', success: '#8FD79B', warning: '#E8C574', danger: '#F2897B',
  overlay: 'rgba(0, 0, 0, 0.65)',
};

/** Australian Open — the blue hard court and its paler surround. */
const aoColors: Palette = {
  bg: '#F2F6FA', bgElevated: '#E6EEF7', surface: '#ECF3F9', surfaceAlt: '#DAE6F3',
  border: '#C8D9EA', borderStrong: '#95B0CC', text: '#12283D', textMuted: '#4E6B87', textFaint: '#7D93AA',
  brand: '#0B6FB8', brandInk: '#FFFFFF', brandDim: '#D6E6F4', court: '#1E7FC2', clay: '#C4744C',
  hard: '#0B6FB8', grass: '#5B9E6B', info: '#0B6FB8', success: '#2E8B6B', warning: '#B8811C', danger: '#C0504A',
  overlay: 'rgba(10, 28, 45, 0.58)',
};

/** Roland Garros — crushed brick underfoot, the club's deep green on top. */
const rolandGarrosColors: Palette = {
  bg: '#FBF3ED', bgElevated: '#F4E6DA', surface: '#F8EDE4', surfaceAlt: '#EDD9C8',
  border: '#DFC5B0', borderStrong: '#BB9074', text: '#34201A', textMuted: '#7A5947', textFaint: '#9C7962',
  brand: '#1F5F3F', brandInk: '#FFF6EF', brandDim: '#DBE7DE', court: '#C1653A', clay: '#C1653A',
  hard: '#3E6982', grass: '#1F5F3F', info: '#3E6982', success: '#1F5F3F', warning: '#A8701C', danger: '#A8402F',
  overlay: 'rgba(48, 26, 18, 0.58)',
};

/** Wimbledon — grass green and the club purple, on tournament cream. */
const wimbledonColors: Palette = {
  bg: '#FBFAF7', bgElevated: '#F1F0EA', surface: '#F7F6F1', surfaceAlt: '#E7E6DE',
  border: '#D7D6CC', borderStrong: '#A5A498', text: '#16261C', textMuted: '#55614F', textFaint: '#7C8676',
  brand: '#00693E', brandInk: '#FFFFFF', brandDim: '#D8E7DF', court: '#00693E', clay: '#A9694A',
  hard: '#4F2683', grass: '#00693E', info: '#4F2683', success: '#00693E', warning: '#96721C', danger: '#9E3A38',
  overlay: 'rgba(12, 26, 18, 0.58)',
};

/** US Open — the night session: navy, floodlight blue, a stripe of yellow. */
const usOpenColors: Palette = {
  bg: '#0B1A2E', bgElevated: '#12243C', surface: '#152941', surfaceAlt: '#1E3550',
  border: '#27405D', borderStrong: '#48688C', text: '#EAF1FA', textMuted: '#9FB4CD', textFaint: '#7A8FA8',
  brand: '#3E8EDE', brandInk: '#06121F', brandDim: '#1B3A5C', court: '#3E8EDE', clay: '#D98A5E',
  hard: '#3E8EDE', grass: '#6FB98A', info: '#6FB1E8', success: '#59C08D', warning: '#F0C24E', danger: '#EE7B72',
  overlay: 'rgba(3, 10, 20, 0.7)',
};

export type ThemeName = 'default' | 'night' | 'ao' | 'roland-garros' | 'wimbledon' | 'us-open';

export const themes: Record<ThemeName, Palette> = {
  default: { ...lightColors },
  night: darkColors,
  ao: aoColors,
  'roland-garros': rolandGarrosColors,
  wimbledon: wimbledonColors,
  'us-open': usOpenColors,
};

export const themeList: { name: ThemeName; label: string; blurb: string }[] = [
  { name: 'default', label: 'CourtSide', blurb: 'Warm neutrals, club green' },
  { name: 'night', label: 'Night', blurb: 'Dark, for late sessions' },
  { name: 'ao', label: 'Australian Open', blurb: 'Blue hard court' },
  { name: 'roland-garros', label: 'Roland Garros', blurb: 'Crushed brick clay' },
  { name: 'wimbledon', label: 'Wimbledon', blurb: 'Grass green and purple' },
  { name: 'us-open', label: 'US Open', blurb: 'Flushing night session' },
];

const STORAGE_KEY = 'courtside-theme';
const LEGACY_NIGHT_KEY = 'courtside-night-mode';

function readStored(): ThemeName {
  try {
    if (Platform.OS !== 'web') return 'default';
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && saved in themes) return saved as ThemeName;
    // Anyone who had night mode on before keeps it.
    return localStorage.getItem(LEGACY_NIGHT_KEY) === 'true' ? 'night' : 'default';
  } catch {
    return 'default';
  }
}

const ThemeContext = createContext({
  theme: 'default' as ThemeName,
  setTheme: (_name: ThemeName) => {},
  night: false,
  setNight: (_value: boolean) => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, updateTheme] = useState<ThemeName>(readStored);
  Object.assign(colors, themes[theme]);

  const setTheme = (name: ThemeName) => {
    Object.assign(colors, themes[name]);
    updateTheme(name);
    try {
      if (Platform.OS === 'web') localStorage.setItem(STORAGE_KEY, name);
    } catch {}
  };

  // Kept so existing callers of the old night-mode switch keep working.
  const setNight = (value: boolean) => setTheme(value ? 'night' : 'default');

  return (
    <ThemeContext.Provider value={{ theme, setTheme, night: theme === 'night', setNight }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);

/**
 * Recolours style definitions written against any one palette.
 *
 * Styles are declared once with literal colours; this walks them and swaps any
 * value that matches the same slot in another theme. That is why every palette
 * must define every key — a missing slot would leave a stray colour from
 * whichever theme the style was authored in.
 */
export function useThemedStyles<T extends object>(definitions: T): T {
  const { theme } = useTheme();
  return useMemo(() => {
    const target = themes[theme];
    const keys = Object.keys(lightColors) as (keyof typeof lightColors)[];
    const palettes = Object.values(themes);

    const remap = (value: unknown): unknown => {
      if (typeof value === 'string') {
        for (const key of keys) {
          for (const palette of palettes) {
            const source = palette[key];
            if (value === source) return target[key];
            // Preserve an eight-digit hex's alpha pair when swapping the colour.
            if (source.startsWith('#') && value.startsWith(source) && value.length === 9) {
              return target[key] + value.slice(7);
            }
          }
        }
        return value;
      }
      if (Array.isArray(value)) return value.map(remap);
      if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, remap(item)]));
      }
      return value;
    };

    return remap(definitions) as T;
  }, [definitions, theme]);
}
