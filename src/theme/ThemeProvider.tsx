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

/**
 * Australian Open — the blue Plexicushion and its paler surround.
 * Ground is the surround, not the court; the court blue is the accent.
 */
const aoColors: Palette = {
  bg: '#EDF6FC', bgElevated: '#DEECF8', surface: '#E7F2FA', surfaceAlt: '#CFE3F3',
  border: '#BAD6EC', borderStrong: '#7BA6CA', text: '#14314A', textMuted: '#4B6B85', textFaint: '#7794AA',
  brand: '#1E8FD5', brandInk: '#FFFFFF', brandDim: '#D3E8F7', court: '#377DB8', clay: '#C2764F',
  hard: '#1E8FD5', grass: '#5E9B6A', info: '#2F7FC0', success: '#2E8B6B', warning: '#B07F1C', danger: '#C0504A',
  overlay: 'rgba(9, 30, 48, 0.58)',
};

/**
 * Roland Garros — crushed brick. The ground is the dust that settles on
 * everything rather than the court itself, which would be relentless at
 * full strength; the court orange carries the buttons.
 */
const rolandGarrosColors: Palette = {
  bg: '#FBF1E9', bgElevated: '#F4E1D2', surface: '#F9EADE', surfaceAlt: '#EED5C1',
  border: '#E1C3A9', borderStrong: '#BC8B66', text: '#3A2018', textMuted: '#7E5743', textFaint: '#A07B63',
  brand: '#CB5223', brandInk: '#FFF6F0', brandDim: '#F3DCCB', court: '#C23B22', clay: '#E3783B',
  hard: '#3E6982', grass: '#1F5F3F', info: '#3E6982', success: '#1F5F3F', warning: '#A8701C', danger: '#B03A22',
  overlay: 'rgba(50, 24, 14, 0.58)',
};

/**
 * Wimbledon — cut grass and white lines. Light green ground with the club
 * green held back for accents, and the purple kept as the secondary.
 */
const wimbledonColors: Palette = {
  bg: '#F7FAF3', bgElevated: '#EAF2E1', surface: '#F2F8EB', surfaceAlt: '#DFEBD3',
  border: '#CFDFC0', borderStrong: '#96AF86', text: '#1B2E1C', textMuted: '#55684F', textFaint: '#7E9076',
  brand: '#2E7D46', brandInk: '#FFFFFF', brandDim: '#DCEBDA', court: '#5A9A55', clay: '#A9694A',
  hard: '#4F2683', grass: '#5A9A55', info: '#4F2683', success: '#2E7D46', warning: '#94721C', danger: '#9E3A38',
  overlay: 'rgba(16, 30, 18, 0.55)',
};

/**
 * US Open — the one pairing everyone recognises: blue court inside a green
 * surround. Deepened so it reads as the night session and stays clearly
 * apart from the Australian Open's paler blue.
 */
const usOpenColors: Palette = {
  bg: '#14283D', bgElevated: '#1B3350', surface: '#1F3A5A', surfaceAlt: '#2A4A6E',
  border: '#32557A', borderStrong: '#5C82AC', text: '#E9F0F8', textMuted: '#A7BCD3', textFaint: '#7F97B0',
  brand: '#7FAE6C', brandInk: '#0E1C0B', brandDim: '#264430', court: '#6C935C', clay: '#D08A5E',
  hard: '#4E87C4', grass: '#7FAE6C', info: '#5C9BD8', success: '#7FAE6C', warning: '#E3B85A', danger: '#E07E72',
  overlay: 'rgba(4, 12, 22, 0.7)',
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
