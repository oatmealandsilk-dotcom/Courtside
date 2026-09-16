import type { MediaCrop } from '@/data/types';

/**
 * A crop is a zoom and a shift inside the frame. Laid out as a layer the
 * size of the frame, moved by x/y (fractions of the frame) and then scaled
 * about its centre — which is exactly "zoom in, then slide the picture".
 */
export function cropLayer(crop?: MediaCrop) {
  if (!crop || crop.scale <= 1.001) return { position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0 };
  return {
    position: 'absolute' as const,
    width: '100%' as const,
    height: '100%' as const,
    left: `${crop.x * 100}%` as `${number}%`,
    top: `${crop.y * 100}%` as `${number}%`,
    transform: [{ scale: crop.scale }],
  };
}

/** The same layer for a browser element. */
export function cropCss(crop?: MediaCrop): React.CSSProperties {
  if (!crop || crop.scale <= 1.001) return { position: 'absolute', inset: 0 };
  return { position: 'absolute', width: '100%', height: '100%', left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, transform: `scale(${crop.scale})` };
}

/** Keeps a shift inside what the zoom allows, so the frame never shows past the picture's edge. */
export function clampCrop(crop: MediaCrop): MediaCrop {
  const room = Math.max(0, (crop.scale - 1) / 2);
  return { scale: crop.scale, x: Math.max(-room, Math.min(room, crop.x)), y: Math.max(-room, Math.min(room, crop.y)) };
}
