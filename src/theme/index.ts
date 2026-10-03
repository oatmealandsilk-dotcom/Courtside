import { Platform } from 'react-native';
/** CourtSide: warm neutrals and muted court-green accents. */
export const lightColors = {
  bg: '#F8F7F2', bgElevated: '#F1EFE6', surface: '#FFFEFA', surfaceAlt: '#E9E6DA',
  border: '#DCD6C8', borderStrong: '#B8AF9D',
  text: '#24251F', textMuted: '#5D584C', textFaint: '#6C665A',
  brand: '#3F7049', brandInk: '#FAF8F0', brandDim: '#E3E7D9',
  court: '#527C56', clay: '#A06F53', hard: '#3E6982', grass: '#748360',
  info: '#3E6982', success: '#527C56', warning: '#957328', danger: '#A34D40',
  // Two colours only for decoration (a group's face), never for a warning or
  // an error, so a gold or rose group never reads as something gone wrong.
  sun: '#A87B1C', rose: '#A9547A',
  // Open to hit: the live green ring (and its pill) a player wears on the map for the day. A
  // fresher green than the brand, so it reads as "up for it now" on every court, New York's included.
  open: '#1A8147',
  overlay: 'rgba(24, 32, 27, 0.5)',
} as const;

export const colors: Record<keyof typeof lightColors, string> = { ...lightColors };

/** A palette colour (`#RRGGBB`) at an opacity, as rgba(), which animations on the phone and in a browser both read. */
export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(h)) return hex;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Whether the current page is dark (Night, New York): shadows there are plain dark, never a coloured glow. */
export function pageIsDark(): boolean {
  const hex = colors.bg.replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(hex)) return false;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return (r * 299 + g * 587 + b * 114) / 1000 < 128;
}

/**
 * The lift under a grouped list or card: a soft, wide shadow, so a box a
 * shade lighter than the page reads as sitting on it, not as a smudge.
 * (On a dark court it all but disappears, which is right.)
 */
export const lift = {
  // The CSS-style shadow, not shadowColor/shadowOpacity: on iPhone the old
  // props are cut off by overflow: 'hidden', which every grouped list needs
  // for its rounded corners, so the lift silently vanished there.
  // Softened Oct 2: on the cream and city themes the cards stood out too much.
  boxShadow: '0px 2px 10px rgba(42, 36, 24, 0.045)',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

/**
 * Inter, shipped inside the app. React Native picks a face by family name, so
 * each weight is its own family; `fontWeight` rides along for the web.
 */
export const fontFamily = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

/** A weight as a style: `{...font('500')}` where a literal fontWeight used to be. */
export const font = (weight: '400' | '500' | '600' | '700') => {
  const family = { '400': fontFamily.regular, '500': fontFamily.medium, '600': fontFamily.semibold, '700': fontFamily.bold }[weight];
  // A browser takes a list and falls back to the system's own sans should Inter
  // ever be slow; a phone takes exactly one name and has Inter in the bundle.
  return { fontFamily: Platform.OS === 'web' ? `${family}, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` : family, fontWeight: weight };
};

/**
 * Lighter than it was: display and title at medium rather than black, with
 * tracking that tightens as size grows. Weight still carries hierarchy; it
 * just does it with less shouting.
 */
export const typography = {
  display: { ...font('500'), fontSize: 30, letterSpacing: -1.05 },
  title: { ...font('500'), fontSize: 22, letterSpacing: -0.66 },
  heading: { ...font('600'), fontSize: 17, letterSpacing: -0.3 },
  body: { ...font('400'), fontSize: 15 },
  bodyStrong: { ...font('600'), fontSize: 15, letterSpacing: -0.15 },
  small: { ...font('400'), fontSize: 13 },
  smallStrong: { ...font('600'), fontSize: 13 },
  caption: { ...font('600'), fontSize: 11, letterSpacing: 0.4 },
} as const;

/** Muted avatar tints — deterministic per seed, none of them loud. */
export const surfaceColorFor = (seed: string): string => {
  const palette = ['#527652', '#8A846A', '#667967', '#778565', '#788475', '#9B9074'];
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 100000;
  }
  return palette[hash % palette.length];
};
