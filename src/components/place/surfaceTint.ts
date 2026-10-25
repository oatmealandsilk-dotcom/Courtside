import type { SurfaceKind } from '@/features/places/courtSurface';
import { colors } from '@/theme';

/**
 * A surface's colour, from the theme's surface slots (the same on every light
 * court): blue hard, terracotta clay, green grass, and a neutral grey for
 * turf, synthetic and carpet, so none is mistaken for clay or grass. Courts
 * near you and a court's page draw the same dot with it.
 */
export function surfaceTint(kind: SurfaceKind | null): string {
  return kind === 'hard' ? colors.surfaceHard : kind === 'clay' ? colors.surfaceClay : kind === 'grass' ? colors.surfaceGrass : colors.surfaceOther;
}
