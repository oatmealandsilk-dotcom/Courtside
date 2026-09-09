/**
 * CourtSide design tokens.
 * Dark-first palette: deep navy court at night, tennis-ball lime as the accent.
 */

export const colors = {
  bg: '#0B1220',
  bgElevated: '#111A2B',
  surface: '#152036',
  surfaceAlt: '#1C2942',
  border: '#25334D',
  borderStrong: '#334566',

  text: '#E9EEF9',
  textMuted: '#93A2BD',
  textFaint: '#647694',

  brand: '#D8F55E',
  brandInk: '#16210A',
  brandDim: '#3B4720',

  court: '#2FA36B',
  clay: '#E0714A',
  hard: '#4C8DF6',
  grass: '#5DBE7C',

  info: '#4C8DF6',
  success: '#37C08A',
  warning: '#F2B441',
  danger: '#F0616D',

  overlay: 'rgba(6, 10, 18, 0.72)',
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

export const surfaceColorFor = (seed: string): string => {
  const palette = [colors.court, colors.clay, colors.hard, colors.grass, '#8A6BE0', '#E05A9B'];
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 100000;
  }
  return palette[hash % palette.length];
};
