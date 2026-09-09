/** CourtSide: warm neutrals and muted court-green accents. */
export const colors = {
  bg: '#FAFAF8', bgElevated: '#F3F4F0', surface: '#FFFFFF', surfaceAlt: '#EBEEE8',
  border: '#E1E5DE', borderStrong: '#C5CDC2',
  text: '#242B27', textMuted: '#626D65', textFaint: '#737D75',
  brand: '#456953', brandInk: '#FFFFFF', brandDim: '#E5EDE6',
  court: '#54775F', clay: '#A56D52', hard: '#59788E', grass: '#6E8260',
  info: '#59788E', success: '#54775F', warning: '#966F32', danger: '#B45159',
  overlay: 'rgba(24, 32, 27, 0.5)',
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
  const palette = ['#4E8C6A', '#BE7458', '#5C86BC', '#6FA184', '#7C6BA8', '#B06A8A'];
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 100000;
  }
  return palette[hash % palette.length];
};
