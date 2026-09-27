import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

/** The long edge a posted photo is kept at: what Instagram serves, sharp on any phone. */
export const PHOTO_EDGE = 1440;

/**
 * A photo, made the size a feed needs before it is uploaded: at most 1440
 * pixels on its long edge, as a JPEG. A phone camera's 12–48 megapixel
 * original is 3–10 MB; this is a few hundred KB and looks the same on a
 * screen. Anything that goes wrong returns the original untouched.
 */
export async function shrinkPhoto(uri: string, edge = PHOTO_EDGE, quality = 0.82): Promise<string> {
  try {
    const context = ImageManipulator.manipulate(uri);
    const probe = await context.renderAsync();
    const { width, height } = probe;
    if (!width || !height) return uri;
    const long = Math.max(width, height);
    const shrink = ImageManipulator.manipulate(uri);
    if (long > edge) shrink.resize(width >= height ? { width: edge } : { height: edge });
    const image = await shrink.renderAsync();
    const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: quality });
    return saved.uri;
  } catch {
    return uri;
  }
}
