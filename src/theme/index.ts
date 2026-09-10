/** CourtSide: warm neutrals and muted court-green accents. */
export const lightColors = {
  bg: '#F8F7F2', bgElevated: '#F1EFE6', surface: '#F4F2E9', surfaceAlt: '#E9E6DA',
  border: '#DCD6C8', borderStrong: '#B8AF9D',
  text: '#24251F', textMuted: '#7C7565', textFaint: '#8B8373',
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

export const typography = {
  display: { fontSize: 30, fontWeight: '800' as const, letterSpacing: -0.6 },
  title: { fontSize: 22, fontWeight: '700' as const, letterSpacing: -0.3 },
  heading: { fontSize: 17, fontWeight: '700' as const },
  body: { fontSize: 15, fontWeight: '400' as const },
  bodyStrong: { fontSize: 15, fontWeight: '600' as const },
  small: { fontSize: 13, fontWeight: '400' as const },
  smallStrong: { fontSize: 13, fontWeight: '600' as const },
  caption: { fontSize: 11, fontWeight: '600' as const, letterSpacing: 0.4 },
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
