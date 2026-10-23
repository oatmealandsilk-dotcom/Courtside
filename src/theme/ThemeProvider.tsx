import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ThemeSwitcher } from './ThemeSwitcher';
import type { TapPoint, ThemeSwitcherHandle } from './themeSwitch';
import { Image, Platform, StyleSheet, View } from 'react-native';
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
  brand: '#6FB483', brandInk: '#0C1710', brandDim: '#1F2E25', brandBright: '#7ED492', court: '#6FB483', clay: '#C98A6A',
  hard: '#7FA9C4', grass: '#86B393', info: '#7FA9C4', success: '#6FB483', warning: '#D2B36A', danger: '#D97F73',
  sun: '#E0BE66', rose: '#E592B4',
  open: '#4FD487',
  overlay: 'rgba(0, 0, 0, 0.65)',
  link: '#8EBEDD', onMedia: '#FFFFFF',
  bubble: '#232D28',
  bubbleMine: '#6EB382', onDanger: '#0C1710',
  // The Night shirt: its near-black green, a deeper green glowing top right, a warm clay-gold bottom
  // left, green lettering; the quiet words in the page's muted grey.
  cardFill: '#15251D', cardGlowTop: '#22412D', cardGlowBottom: '#413425',
  cardFigure: '#6FB483', cardInk: '#6FB483', cardMuted: '#A6B1AB',
  launchLine: '#8A948F',
  checker: '#26292A', checkerAlt: '#323637',
  avatarTint1: '#2E3A34', avatarTint2: '#3A3530', avatarTint3: '#3B3034', avatarTint4: '#2D3640', avatarTint5: '#35313D', avatarTint6: '#363A2E',
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
  brand: '#2C7446', brandInk: '#FFFFFF', brandDim: '#E8F3EC', brandBright: '#7ED492', court: '#2C7446', clay: '#B4653A',
  hard: '#2C6885', grass: '#477F50', info: '#2C6885', success: '#2C7446', warning: '#806311', danger: '#B93129',
  sun: '#9A7110', rose: '#B04A7C',
  open: '#17803F',
  overlay: 'rgba(15, 20, 25, 0.5)',
  link: '#1B6699', onMedia: '#FFFFFF',
  bubble: '#EEF0F1',
  bubbleMine: '#2B7345', onDanger: '#FFFFFF',
  // No shirt for Clean: its session box stays the green box with the brand's own wash (cardLook).
  // These only fill the slots, with that box's colours.
  cardFill: '#2C7446', cardGlowTop: '#2C7446', cardGlowBottom: '#2C7446',
  cardFigure: '#FFFFFF', cardInk: '#FFFFFF', cardMuted: '#FFFFFF',
  launchLine: '#5F6871',
  checker: '#26292A', checkerAlt: '#323637',
  avatarTint1: '#E3EAE4', avatarTint2: '#EDE6DA', avatarTint3: '#F0E0DA', avatarTint4: '#DDE5EC', avatarTint5: '#E6E0EA', avatarTint6: '#E8E8E0',
};

/**
 * Australian Open — the blue Plexicushion and its paler surround.
 * Ground is the surround, not the court; the court blue is the accent.
 */
const aoColors: Palette = {
  bg: '#EBF5FC', bgElevated: '#D7E9F4', surface: '#F8FCFF', surfaceAlt: '#C8DEEE',
  border: '#AECFE5', borderStrong: '#6394BC', text: '#0D2B43', textMuted: '#34566E', textFaint: '#496273',
  brand: '#2E85BF', brandInk: '#FFFFFF', brandDim: '#CFE4F2', brandBright: '#7ED492', court: '#4179A8', clay: '#B97753',
  hard: '#2E85BF', grass: '#4E8A57', info: '#3979AF', success: '#2A7F60', warning: '#9C7016', danger: '#B8463F',
  sun: '#A8781A', rose: '#AE4F80',
  open: '#1A8147',
  overlay: 'rgba(7, 26, 42, 0.58)',
  link: '#1F64A0', onMedia: '#FFFFFF',
  bubble: '#D9EAF6',
  bubbleMine: '#2471A6', onDanger: '#FFFFFF',
  // The Melbourne shirt as light as the shirt itself (Oct 6, owner: "AO card could be more light the
  // color of her shirt"): its light court blue, a sky sheen top right, the aqua shirt's aqua bottom left.
  // Cream can't hold on a blue this light, so the lettering is the court's deep navy: small and quiet
  // words 4.7:1 or more on the fill and both corners, the big numbers 5.7:1.
  cardFill: '#6EA8D5', cardGlowTop: '#9CCBEC', cardGlowBottom: '#8FE3DD',
  cardFigure: '#0B2A47', cardInk: '#0E2F4F', cardMuted: '#143858',
  launchLine: '#496273',
  checker: '#26292A', checkerAlt: '#323637',
  avatarTint1: '#D3E3EF', avatarTint2: '#E4DED2', avatarTint3: '#EBD8D4', avatarTint4: '#D5E5DD', avatarTint5: '#DDD9EA', avatarTint6: '#E3E6D3',
};

/**
 * Roland Garros — crushed brick. The ground is the dust that settles on
 * everything rather than the court itself, which would be relentless at
 * full strength; the court orange carries the buttons.
 */
const rolandGarrosColors: Palette = {
  bg: '#F8F0E9', bgElevated: '#EFDFD1', surface: '#FFFAF5', surfaceAlt: '#E6D2C0',
  border: '#D6BCA2', borderStrong: '#B08A66', text: '#33201A', textMuted: '#664836', textFaint: '#6D5745',
  brand: '#AD4E2E', brandInk: '#FFF6F0', brandDim: '#ECD9CB', brandBright: '#7ED492', court: '#9E432E', clay: '#C67443',
  hard: '#3E6982', grass: '#1F5F3F', info: '#3E6982', success: '#1F5F3F', warning: '#9A6718', danger: '#9E432E',
  sun: '#9E7416', rose: '#A2456E',
  open: '#1A8147',
  overlay: 'rgba(46, 22, 12, 0.58)',
  link: '#2F6587', onMedia: '#FFFFFF',
  bubble: '#F0E2D5',
  bubbleMine: '#AB4D2D', onDanger: '#FFFFFF',
  // The Paris shirt, deepened so its cream lettering holds: brick clay, a brighter clay top right, the
  // shirt's gold glow bottom left.
  cardFill: '#A44627', cardGlowTop: '#B24D25', cardGlowBottom: '#A4570A',
  cardFigure: '#FAF8F0', cardInk: '#FAF8F0', cardMuted: '#F6EFE6',
  launchLine: '#6D5745',
  checker: '#26292A', checkerAlt: '#323637',
  avatarTint1: '#EBD9CB', avatarTint2: '#E2DDCC', avatarTint3: '#D9DFD5', avatarTint4: '#DDD8E2', avatarTint5: '#EFD5CF', avatarTint6: '#D7DEE3',
};

/**
 * Wimbledon — cut grass and white lines. Light green ground with the club
 * green held back for accents, and the purple kept as the secondary.
 */
const wimbledonColors: Palette = {
  bg: '#F2F6EC', bgElevated: '#E4EDD8', surface: '#FBFDF7', surfaceAlt: '#D7E3C9',
  border: '#C4D5B3', borderStrong: '#8CA37B', text: '#18291A', textMuted: '#485943', textFaint: '#586552',
  brand: '#256B3A', brandInk: '#FFFFFF', brandDim: '#D9E6D4', brandBright: '#7ED492', court: '#4E8A4A', clay: '#A9694A',
  hard: '#4F2683', grass: '#4E8A4A', info: '#4F2683', success: '#256B3A', warning: '#8A6A19', danger: '#943634',
  sun: '#94701A', rose: '#A4497A',
  open: '#1A8147',
  overlay: 'rgba(14, 26, 16, 0.55)',
  link: '#245E93', onMedia: '#FFFFFF',
  bubble: '#E2EBD6',
  bubbleMine: '#246A39', onDanger: '#FFFFFF',
  // The London shirt, deepened so its cream lettering holds: grass green, a fresher green top right,
  // the club's purple bottom left. (Oct 6: lilac was tried; owner: "for the London one green looks better".)
  cardFill: '#326F37', cardGlowTop: '#377A34', cardGlowBottom: '#615782',
  cardFigure: '#FAF8F0', cardInk: '#FAF8F0', cardMuted: '#F0F1E7',
  launchLine: '#586552',
  checker: '#26292A', checkerAlt: '#323637',
  avatarTint1: '#D9E6CF', avatarTint2: '#E6E0CC', avatarTint3: '#E9D8D7', avatarTint4: '#D3E0E4', avatarTint5: '#DED9E6', avatarTint6: '#E4E5D0',
};

/**
 * US Open — blue and yellow only: the night-session blue court with the
 * ball's yellow as the accent, no green anywhere. Deepened so it stays
 * clearly apart from the Australian Open's paler blue.
 */
const usOpenColors: Palette = {
  bg: '#14283D', bgElevated: '#1B3350', surface: '#1F3A5A', surfaceAlt: '#2A4A6E',
  border: '#32557A', borderStrong: '#5C82AC', text: '#E9F0F8', textMuted: '#BDCDDE', textFaint: '#A9B9CA',
  brand: '#F5D460', brandInk: '#1B1A0A', brandDim: '#4A4A2C', brandBright: '#7ED492', court: '#4E87C4', clay: '#D08A5E',
  hard: '#4E87C4', grass: '#5C9BD8', info: '#5C9BD8', success: '#FFDF79', warning: '#E3B85A', danger: '#E07E72',
  sun: '#F0B04A', rose: '#EE97BA',
  // The one green on this court, kept for Open to hit: the ring a player wears reads as green, as promised.
  open: '#4FD487',
  overlay: 'rgba(4, 12, 22, 0.7)',
  link: '#A4CCF4', onMedia: '#FFFFFF',
  bubble: '#24425F',
  bubbleMine: '#F4D35F', onDanger: '#1B1A0A',
  // The New York shirt: night blue, a lighter blue top right, the ball's yellow glowing bottom left
  // (held low, so the yellow lettering holds on it); the quiet words a shade lighter than the page's.
  cardFill: '#22497B', cardGlowTop: '#325D91', cardGlowBottom: '#675A38',
  cardFigure: '#F5D460', cardInk: '#F5D460', cardMuted: '#CBD8E6',
  launchLine: '#A9B9CA',
  checker: '#26292A', checkerAlt: '#323637',
  avatarTint1: '#2C4560', avatarTint2: '#3A3F55', avatarTint3: '#45394C', avatarTint4: '#2F4A49', avatarTint5: '#4A4433', avatarTint6: '#3D4A5E',
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

// The four court themes are named for the cities whose courts they borrow from, never the
// tournaments: those names are trademarks (Apple's rule 5.2.1). The ids stay as they were,
// so a theme someone already picked survives the rename.
export const themeList: { name: ThemeName; label: string; blurb: string }[] = [
  { name: 'default', label: 'CourtSide', blurb: 'Warm neutrals, club green' },
  { name: 'night', label: 'Night', blurb: 'Dark, for late sessions' },
  { name: 'ao', label: 'Melbourne', blurb: 'Blue hard court' },
  { name: 'roland-garros', label: 'Paris', blurb: 'Crushed brick clay' },
  { name: 'wimbledon', label: 'London', blurb: 'Grass green and purple' },
  { name: 'us-open', label: 'New York', blurb: 'Flushing night session' },
  { name: 'clean', label: 'Clean', blurb: 'Plain white, black text' },
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
  /** `from`: where the tap was, for the new court to spread out from (the middle of the screen if not given). */
  setTheme: (_name: ThemeName, _from?: TapPoint) => {},
  night: false,
  /**
   * The page itself is dark: Night, and New York's navy (Oct 5). What the
   * status bar's icons, the glass's tint and the like follow; `night` is only
   * the Night theme itself.
   */
  dark: false,
  setNight: (_value: boolean) => {},
  /**
   * Inside a ThemeScope (the share screen's colour dots): the court here is
   * not the app's, so a themed style drawn here must never copy it into the
   * live `colors` the rest of the app reads (ThemeScope sets and puts back
   * those itself).
   */
  scoped: false,
});

/** Themes whose page is dark. */
const DARK_THEMES: ReadonlySet<ThemeName> = new Set<ThemeName>(['night', 'us-open']);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, updateTheme] = useState<ThemeName>(readStored);
  Object.assign(colors, themes[theme]);

  // A phone has no localStorage, and its own store can only be read back
  // asynchronously — so the app opens on the default and switches to the saved
  // theme on the first frame after. Without this the choice lasted until the
  // app was closed.
  // Nothing is drawn in the default colours first: on a phone the app waits
  // (a few milliseconds, at most 0.8 s) for the saved theme, showing the launch
  // picture's cream meanwhile, so the loading screen opens in your own theme
  // instead of snapping to it (Oct 2).
  const [loaded, setLoaded] = useState(Platform.OS === 'web');
  useEffect(() => {
    if (Platform.OS === 'web') return undefined;
    let live = true;
    const giveUp = setTimeout(() => { if (live) setLoaded(true); }, 800);
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (!live || !saved || !(saved in themes)) return;
        Object.assign(colors, themes[saved as ThemeName]);
        updateTheme(saved as ThemeName);
      })
      .catch(() => {})
      .finally(() => { if (live) { clearTimeout(giveUp); setLoaded(true); } });
    return () => { live = false; clearTimeout(giveUp); };
  }, []);

  // A theme change redraws the whole app: every tab, the feed, the map. Seen
  // bare, that is a screen repainting in patches, so the switcher hides it
  // and moves from the old look to the new one (ThemeSwitcher.tsx on a phone,
  // ThemeSwitcher.web.tsx in a browser; how it moves is THEME_SWITCH in
  // themeSwitch.ts). Oct 21, owner: "I don't like how it is faded and does
  // not transition smoothly": the tinted veil that used to blink over the
  // screen here is gone.
  const app = useRef<View>(null);
  const switcher = useRef<ThemeSwitcherHandle>(null);
  // The court last asked for, so a second tap on it (before it has landed) does nothing.
  const target = useRef<ThemeName | null>(null);
  // Counts every recolour, so the switcher hears it landed even when a quick tap back
  // lands on the court already showing (React then has nothing new to draw).
  const [stamp, setStamp] = useState(0);
  const apply = (name: ThemeName) => {
    Object.assign(colors, themes[name]);
    updateTheme(name);
    setStamp((n) => n + 1);
  };
  const setTheme = (name: ThemeName, from?: TapPoint) => {
    if (name === (target.current ?? theme)) return;
    try {
      if (Platform.OS === 'web') localStorage.setItem(STORAGE_KEY, name);
      else void AsyncStorage.setItem(STORAGE_KEY, name);
    } catch {}
    target.current = name;
    if (switcher.current) switcher.current.start(name, () => apply(name), from);
    else apply(name);
  };
  // The redraw has landed.
  useEffect(() => {
    if (target.current === theme) target.current = null;
    if (stamp) switcher.current?.landed(theme);
  }, [theme, stamp]);

  // Kept so existing callers of the old night-mode switch keep working.
  const setNight = (value: boolean) => setTheme(value ? 'night' : 'default');

  return (
    <ThemeContext.Provider value={{ theme, setTheme, night: theme === 'night', dark: DARK_THEMES.has(theme), setNight, scoped: false }}>
      <View style={{ flex: 1, backgroundColor: loaded ? undefined : lightColors.bg }}>
        {/* While your last theme is read (a blink), the launch picture itself, not a bare cream
            screen: the logo never drops out between the phone's picture and the app's (Oct 4).
            The app sits in a box of its own, in its page colour, so the switcher can photograph it. */}
        {loaded ? <View ref={app} collapsable={false} style={{ flex: 1, backgroundColor: themes[theme].bg }}>{children}</View> : <Image source={require('../../assets/splash.png')} resizeMode="cover" style={StyleSheet.absoluteFill} />}
        <ThemeSwitcher ref={switcher} app={app} />
      </View>
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);

/**
 * Draws what is inside it in another court's colours, and only that: the
 * share screen's colour dots (Oct 15, owner: "do the color changing for the
 * cards") recolour the share pictures and nothing else. The app's theme and
 * Settings are untouched.
 *
 * Inside, `useTheme()` says the chosen court, so themed styles and the
 * session box's look (cardLook) follow it; the live `colors` object is the
 * chosen court's while the inside is drawn, and is put back to the app's
 * own the moment it is done (the empty sibling after it, which React draws
 * next, and once more when the screen settles), so whatever is drawn after
 * it is in the app's colours as always.
 */
export function ThemeScope({ theme, children }: { theme: ThemeName; children: React.ReactNode }) {
  const outer = useContext(ThemeContext);
  const value = useMemo(() => ({ ...outer, theme, night: theme === 'night', dark: DARK_THEMES.has(theme), scoped: true }), [outer, theme]);
  // Always the same shape, the app's own court too, so a change of court never starts the inside over.
  React.useLayoutEffect(() => { Object.assign(colors, themes[outer.theme]); });
  Object.assign(colors, themes[theme]);
  return (
    <>
      <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
      <PutBack theme={outer.theme} />
    </>
  );
}

/** Puts the live colours back to the app's own court, right after a ThemeScope's inside is drawn. */
function PutBack({ theme }: { theme: ThemeName }) {
  Object.assign(colors, themes[theme]);
  return null;
}

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
const slotKeys = Object.keys(lightColors) as (keyof typeof lightColors)[];
// The default palette's own colours claim their slots first: styles are written against it. Without
// this, white went to 'bg' (the Clean theme's page is white), so white over a picture (onMedia, such
// as "Change photo" on the share screen) drew in the page colour: navy on New York, near-black on Night.
for (const key of slotKeys) if (!slotOf.has(lightColors[key])) slotOf.set(lightColors[key], key);
for (const key of slotKeys) {
  for (const palette of Object.values(themes)) if (!slotOf.has(palette[key])) slotOf.set(palette[key], key);
}

/**
 * Each style sheet remapped once per theme, shared by every component that uses it: a feed of
 * PostCards walks its sheet once, not once per card, and a theme switch once per sheet.
 */
const remapCache = new Map<ThemeName, WeakMap<object, object>>();

export function useThemedStyles<T extends object>(definitions: T): T {
  const { theme, scoped } = useTheme();
  // The live colour object is brought in line with the theme every time a
  // themed screen draws, so a button reading `colors.brand` can never be a
  // theme behind the page it sits on. Not inside a ThemeScope: a share
  // picture redrawing on its own (an avatar hearing new people) would
  // otherwise leave its court in the colours the rest of the app reads.
  if (!scoped && (colors.bg !== themes[theme].bg || colors.brand !== themes[theme].brand)) Object.assign(colors, themes[theme]);
  return useMemo(() => {
    let cache = remapCache.get(theme);
    if (!cache) { cache = new WeakMap(); remapCache.set(theme, cache); }
    const hit = cache.get(definitions);
    if (hit) return hit as T;
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

    const out = remap(definitions) as T;
    cache.set(definitions, out);
    return out;
  }, [definitions, theme]);
}
