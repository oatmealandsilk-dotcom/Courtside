import { SMALL_COVER_EDGE } from '@/lib/smallCover';

/** The long edge a posted photo is kept at: what Instagram serves, sharp on any screen. */
export const PHOTO_EDGE = 1440;

/**
 * The browser twin: draws the photo onto a canvas no larger than 1440 on
 * its long edge and hands back a JPEG blob address. Anything that goes
 * wrong (an odd format, a tainted canvas) returns the original untouched.
 */
export async function shrinkPhoto(uri: string, edge = PHOTO_EDGE, quality = 0.82): Promise<string> {
  return (await shrinkPhotoSized(uri, edge, quality)).uri;
}

/** The same, and the size it came out at, in pixels (0 × 0 when it could not be read, and the original untouched). */
export async function shrinkPhotoSized(uri: string, edge = PHOTO_EDGE, quality = 0.82): Promise<{ uri: string; width: number; height: number }> {
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.crossOrigin = 'anonymous';
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = uri;
    });
    const long = Math.max(img.naturalWidth, img.naturalHeight);
    if (!long) return { uri, width: 0, height: 0 };
    const scale = Math.min(1, edge / long);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return { uri, width: 0, height: 0 };
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    return blob ? { uri: URL.createObjectURL(blob), width: canvas.width, height: canvas.height } : { uri, width: 0, height: 0 };
  } catch {
    return { uri, width: 0, height: 0 };
  }
}

/**
 * The browser twin of the small cover grid tiles show (see smallCover.ts):
 * its shorter side about 360 pixels, as a JPEG blob address. A picture
 * already that small is still copied, so every new cover has its small
 * twin. Null if it cannot be made; the tiles then use the full cover.
 */
export async function shrinkCover(uri: string, edge = SMALL_COVER_EDGE, quality = 0.8): Promise<string | null> {
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.crossOrigin = 'anonymous';
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = uri;
    });
    const short = Math.min(img.naturalWidth, img.naturalHeight);
    if (!short) return null;
    const scale = Math.min(1, edge / short);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    return blob ? URL.createObjectURL(blob) : null;
  } catch {
    return null;
  }
}
