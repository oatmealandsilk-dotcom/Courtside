import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, lightColors } from './index';

type Palette = Record<keyof typeof lightColors, string>;

/**
 * Dark palette. The neutrals keep only a trace of green so they read as a dark
 * surface rather than olive, and the accents stay saturated — desaturating them
 * to match the light theme is what made the whole thing look muddy.
 */
export const darkColors: Palette = {
  bg: '#0F1412', bgElevated: '#161D19', surface: '#1A221E', surfaceAlt: '#232C27',
  border: '#2C3832', borderStrong: '#46554D', text: '#EDF1EE', textMuted: '#A6B1AB', textFaint: '#8A948F',
  brand: '#6FB483', brandInk: '#0C1710', brandDim: '#1F2E25', court: '#6FB483', clay: '#C98A6A',
  hard: '#7FA9C4', grass: '#86B393', info: '#7FA9C4', success: '#6FB483', warning: '#D2B36A', danger: '#D97F73',
  overlay: 'rgba(0, 0, 0, 0.65)',
};

/**
 * Clean — a plain white page, the way X, Instagram and Strava are built. No
 * warmth in the neutrals at all: white ground, near-black text, grey hairlines.
 * The green is lifted a little from the default one, which was mixed for paper
 * and goes slightly flat against pure white.
 */
const cleanColors: Palette = {
  bg: '#FFFFFF', bgElevated: '#F7F8F8', surface: '#FAFAFA', surfaceAlt: '#F0F1F1',
  border: '#E6E7E8', borderStrong: '#C7CACC', text: '#0F1419', textMuted: '#536471', textFaint: '#5F6871',
  brand: '#2C7446', brandInk: '#FFFFFF', brandDim: '#E8F3EC', court: '#2C7446', clay: '#B4653A',
  hard: '#2C6885', grass: '#477F50', info: '#2C6885', success: '#2C7446', warning: '#806311', danger: '#B93129',
  overlay: 'rgba(15, 20, 25, 0.5)',
};

/**
 * Australian Open — the blue Plexicushion and its paler surround.
 * Ground is the surround, not the court; the court blue is the accent.
 */
const aoColors: Palette = {
  bg: '#EBF5FC', bgElevated: '#D7E9F4', surface: '#E1EFF8', surfaceAlt: '#C8DEEE',
  border: '#AECFE5', borderStrong: '#6394BC', text: '#0D2B43', textMuted: '#34566E', textFaint: '#496273',
  brand: '#2E85BF', brandInk: '#FFFFFF', brandDim: '#CFE4F2', court: '#4179A8', clay: '#B97753',
  hard: '#2E85BF', grass: '#4E8A57', info: '#3979AF', success: '#2A7F60', warning: '#9C7016', danger: '#B8463F',
  overlay: 'rgba(7, 26, 42, 0.58)',
};

/**
 * Roland Garros — crushed brick. The ground is the dust that settles on
 * everything rather than the court itself, which would be relentless at
 * full strength; the court orange carries the buttons.
 */
const rolandGarrosColors: Palette = {
  bg: '#F8F0E9', bgElevated: '#EFDFD1', surface: '#F4E7DB', surfaceAlt: '#E6D2C0',
  border: '#D6BCA2', borderStrong: '#B08A66', text: '#33201A', textMuted: '#664836', textFaint: '#6D5745',
  brand: '#AD4E2E', brandInk: '#FFF6F0', brandDim: '#ECD9CB', court: '#9E432E', clay: '#C67443',
  hard: '#3E6982', grass: '#1F5F3F', info: '#3E6982', success: '#1F5F3F', warning: '#9A6718', danger: '#9E432E',
  overlay: 'rgba(46, 22, 12, 0.58)',
};

/**
 * Wimbledon — cut grass and white lines. Light green ground with the club
 * green held back for accents, and the purple kept as the secondary.
 */
const wimbledonColors: Palette = {
  bg: '#F2F6EC', bgElevated: '#E4EDD8', surface: '#ECF2E2', surfaceAlt: '#D7E3C9',
  border: '#C4D5B3', borderStrong: '#8CA37B', text: '#18291A', textMuted: '#485943', textFaint: '#586552',
  brand: '#256B3A', brandInk: '#FFFFFF', brandDim: '#D9E6D4', court: '#4E8A4A', clay: '#A9694A',
  hard: '#4F2683', grass: '#4E8A4A', info: '#4F2683', success: '#256B3A', warning: '#8A6A19', danger: '#943634',
  overlay: 'rgba(14, 26, 16, 0.55)',
};

/**
 * US Open — blue and yellow only: the night-session blue court with the
 * ball's yellow as the accent, no green anywhere. Deepened so it stays
 * clearly apart from the Australian Open's paler blue.
 */
const usOpenColors: Palette = {
  bg: '#14283D', bgElevated: '#1B3350', surface: '#1F3A5A', surfaceAlt: '#2A4A6E',
  border: '#32557A', borderStrong: '#5C82AC', text: '#E9F0F8', textMuted: '#BDCDDE', textFaint: '#A9B9CA',
  brand: '#F5D547', brandInk: '#1B1A0A', brandDim: '#4A4A2C', court: '#4E87C4', clay: '#D08A5E',
  hard: '#4E87C4', grass: '#5C9BD8', info: '#5C9BD8', success: '#FFE066', warning: '#E3B85A', danger: '#E07E72',
  overlay: 'rgba(4, 12, 22, 0.7)',
};

export type ThemeName = 'default' | 'clean' | 'night' | 'ao' | 'roland-garros' | 'wimbledon' | 'us-open';

export const themes: Record<ThemeName, Palette> = {
  default: { ...lightColors },
  clean: cleanColors,
  night: darkColors,
  ao: aoColors,
  'roland-garros': rolandGarrosColors,
  wimbledon: wimbledonColors,
  'us-open': usOpenColors,
};

export const themeList: { name: ThemeName; label: string; blurb: string }[] = [
  { name: 'default', label: 'CourtSide', blurb: 'Warm neutrals, club green' },
  { name: 'clean', label: 'Clean', blurb: 'Plain white, black text' },
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

  // A phone has no localStorage, and its own store can only be read back
  // asynchronously — so the app opens on the default and switches to the saved
  // theme on the first frame after. Without this the choice lasted until the
  // app was closed.
  useEffect(() => {
    if (Platform.OS === 'web') return undefined;
    let live = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (!live || !saved || !(saved in themes)) return;
        Object.assign(colors, themes[saved as ThemeName]);
        updateTheme(saved as ThemeName);
      })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  const setTheme = (name: ThemeName) => {
    Object.assign(colors, themes[name]);
    updateTheme(name);
    try {
      if (Platform.OS === 'web') localStorage.setItem(STORAGE_KEY, name);
      else void AsyncStorage.setItem(STORAGE_KEY, name);
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
// Every colour any palette uses, and the slot it fills — built once, so a
// theme change is a lookup per value rather than a scan of every palette.
const slotOf = new Map<string, keyof typeof lightColors>();
for (const key of Object.keys(lightColors) as (keyof typeof lightColors)[]) {
  for (const palette of Object.values(themes)) if (!slotOf.has(palette[key])) slotOf.set(palette[key], key);
}

export function useThemedStyles<T extends object>(definitions: T): T {
  const { theme } = useTheme();
  // The live colour object is brought in line with the theme every time a
  // themed screen draws, so a button reading `colors.brand` can never be a
  // theme behind the page it sits on.
  if (colors.bg !== themes[theme].bg || colors.brand !== themes[theme].brand) Object.assign(colors, themes[theme]);
  return useMemo(() => {
    const target = themes[theme];
    const remap = (value: unknown): unknown => {
      if (typeof value === 'string') {
        const key = slotOf.get(value);
        if (key) return target[key];
        // Preserve an eight-digit hex's alpha pair when swapping the colour.
        if (value.length === 9 && value.startsWith('#')) {
          const base = slotOf.get(value.slice(0, 7));
          if (base) return target[base] + value.slice(7);
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
