import { Platform } from 'react-native';

/**
 * How a filled brand button is painted (Oct 22 preview, owner: "Maybe the
 * gradient on the button is making it look ai"). Same colours in all three:
 * - sheen: today's soft glow + sheen inside the fill and a glow in its own colour under it.
 * - flat: one solid fill, no gradient, no coloured glow; a touch darker while pressed.
 * - soft: one solid fill with a barely-there lighter top edge and a small plain shadow.
 * Phones always draw sheen. In a browser `?fill=flat|soft|sheen` picks one for the
 * visit (kept while you move between pages).
 */
export type FillMode = 'sheen' | 'flat' | 'soft';

function read(): FillMode {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return 'sheen';
  const ok = (v: string | null): v is FillMode => v === 'sheen' || v === 'flat' || v === 'soft';
  try {
    const asked = new URLSearchParams(window.location.search).get('fill');
    if (ok(asked)) {
      try { window.sessionStorage.setItem('cs-fill', asked); } catch {}
      return asked;
    }
    const kept = window.sessionStorage.getItem('cs-fill');
    if (ok(kept)) return kept;
  } catch {}
  return 'sheen';
}

export const fillMode: FillMode = read();

type Shadow = {
  shadowColor?: string;
  shadowOpacity?: number;
  shadowRadius?: number;
  shadowOffset?: { width: number; height: number };
  elevation?: number;
};

/** The small plain shadow the soft fill sits on. */
const SOFT: Shadow = { shadowColor: '#000000', shadowOpacity: 0.1, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1 };

/**
 * The shadow under a filled brand button, for the current fill: `glow` (the
 * coloured lift it has today) on sheen, none on flat, a small plain one on soft.
 */
export function brandShadow<T extends Shadow>(glow: T): T | Shadow {
  if (fillMode === 'flat') return { shadowOpacity: 0, elevation: 0 };
  if (fillMode === 'soft') return SOFT;
  return glow;
}

/** brandShadow for a CSS-style `boxShadow` glow. */
export function brandBoxShadow(glow: string): string {
  if (fillMode === 'flat') return 'none';
  if (fillMode === 'soft') return '0px 1px 2px rgba(0, 0, 0, 0.1)';
  return glow;
}
