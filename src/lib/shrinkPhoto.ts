import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { SMALL_COVER_EDGE } from '@/lib/smallCover';

/** The long edge a posted photo is kept at: what Instagram serves, sharp on any phone. */
export const PHOTO_EDGE = 1440;

/**
 * A photo, made the size a feed needs before it is uploaded: at most 1440
 * pixels on its long edge, as a JPEG. A phone camera's 12–48 megapixel
 * original is 3–10 MB; this is a few hundred KB and looks the same on a
 * screen. Anything that goes wrong returns the original untouched.
 */
export async function shrinkPhoto(uri: string, edge = PHOTO_EDGE, quality = 0.82): Promise<string> {
  return (await shrinkPhotoSized(uri, edge, quality)).uri;
}

/**
 * The same, and the size it came out at, in pixels (0 × 0 when it could not
 * be read, and the original untouched). A chat photo's bubble takes its
 * shape from these before the picture itself has arrived.
 */
export async function shrinkPhotoSized(uri: string, edge = PHOTO_EDGE, quality = 0.82): Promise<{ uri: string; width: number; height: number }> {
  try {
    const context = ImageManipulator.manipulate(uri);
    const probe = await context.renderAsync();
    const { width, height } = probe;
    if (!width || !height) return { uri, width: 0, height: 0 };
    const long = Math.max(width, height);
    const shrink = ImageManipulator.manipulate(uri);
    if (long > edge) shrink.resize(width >= height ? { width: edge } : { height: edge });
    const image = await shrink.renderAsync();
    const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: quality });
    return { uri: saved.uri, width: saved.width, height: saved.height };
  } catch {
    return { uri, width: 0, height: 0 };
  }
}

/**
 * The small copy of a post's cover that grid tiles show (see smallCover.ts):
 * its shorter side about 360 pixels, enough for a third of a phone screen,
 * and a few dozen KB instead of a few hundred. A picture already that small
 * is still copied, so every new cover has its small twin. Null if it cannot
 * be made; the tiles then use the full cover.
 */
export async function shrinkCover(uri: string, edge = SMALL_COVER_EDGE, quality = 0.8): Promise<string | null> {
  try {
    const probe = await ImageManipulator.manipulate(uri).renderAsync();
    const { width, height } = probe;
    if (!width || !height) return null;
    const shrink = ImageManipulator.manipulate(uri);
    if (Math.min(width, height) > edge) shrink.resize(width <= height ? { width: edge } : { height: edge });
    const saved = await (await shrink.renderAsync()).saveAsync({ format: SaveFormat.JPEG, compress: quality });
    return saved.uri;
  } catch {
    return null;
  }
}
