import { useWindowDimensions } from 'react-native';

/**
 * Breakpoints. `phone` is the touch layout (bottom tab bar, full-bleed cards);
 * `desktop` is the Instagram-style layout (left sidebar, centred column, right rail).
 */
export const BREAKPOINTS = {
  tablet: 768,
  desktop: 1200,
} as const;

/** Instagram's own container is 935px; the feed column sits around 630px. */
export const LAYOUT = {
  feedColumn: 630,
  soloColumn: 700,
  rail: 280,
  sidebar: 220,
  sidebarCompact: 76,
} as const;

export interface Responsive {
  width: number;
  height: number;
  isPhone: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  /** True when the sidebar should collapse to icons only. */
  isCompactSidebar: boolean;
}

export function useResponsive(): Responsive {
  const { width, height } = useWindowDimensions();
  const isDesktop = width >= BREAKPOINTS.desktop;
  const isTablet = width >= BREAKPOINTS.tablet && !isDesktop;

  return {
    width,
    height,
    isPhone: width < BREAKPOINTS.tablet,
    isTablet,
    isDesktop,
    isCompactSidebar: isTablet,
  };
}
