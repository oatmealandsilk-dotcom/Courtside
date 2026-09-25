/** CourtSide: warm neutrals and muted court-green accents. */
export const lightColors = {
  bg: '#F8F7F2', bgElevated: '#F1EFE6', surface: '#F4F2E9', surfaceAlt: '#E9E6DA',
  border: '#DCD6C8', borderStrong: '#B8AF9D',
  text: '#24251F', textMuted: '#5D584C', textFaint: '#6C665A',
  brand: '#3F7049', brandInk: '#FAF8F0', brandDim: '#E3E7D9',
  court: '#527C56', clay: '#A06F53', hard: '#3E6982', grass: '#748360',
  info: '#3E6982', success: '#527C56', warning: '#957328', danger: '#A34D40',
  overlay: 'rgba(24, 32, 27, 0.5)',
} as const;

export const colors: Record<keyof typeof lightColors, string> = { ...lightColors };

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
export const font = (weight: '400' | '500' | '600' | '700') => ({
  fontFamily: { '400': fontFamily.regular, '500': fontFamily.medium, '600': fontFamily.semibold, '700': fontFamily.bold }[weight],
  fontWeight: weight,
});

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
