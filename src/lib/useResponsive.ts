import { useWindowDimensions } from 'react-native';

/**
 * Breakpoints. `phone` is the touch layout (bottom tab bar, full-bleed cards);
 * `desktop` is the Instagram-style layout (left sidebar, centred column, right rail).
 */
export const BREAKPOINTS = {
  landscape: 600,
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
  /** Compact portrait layout, not the physical device type. */
  isPhone: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  /** True when the sidebar should collapse to icons only. */
  isCompactSidebar: boolean;
}

export function useResponsive(): Responsive {
  const { width, height } = useWindowDimensions();
  // Medium-width browser panels should use the sidebar before they become
  // wider than their full height. Narrow portrait views retain bottom tabs.
  const isLandscape = width >= BREAKPOINTS.landscape || width > height;
  const isDesktop = isLandscape && width >= BREAKPOINTS.desktop;
  const isTablet = isLandscape && !isDesktop;

  return {
    width,
    height,
    isPhone: !isLandscape,
    isTablet,
    isDesktop,
    isCompactSidebar: isTablet,
  };
}
