import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

/**
 * A photo made small enough to be cheap and still sharp on a phone: at most
 * 1080 px on its long side, saved as a JPEG at 60% — about 150–250 KB, where
 * a phone's own photo is 3–5 MB. Used for photos in comments. If shrinking
 * fails for any reason, the original goes up instead.
 */
export async function shrinkPhoto(uri: string, longSide = 1080, quality = 0.6): Promise<string> {
  try {
    const context = ImageManipulator.manipulate(uri);
    const probe = await context.renderAsync();
    if (Math.max(probe.width, probe.height) > longSide) {
      context.resize(probe.width >= probe.height ? { width: longSide } : { height: longSide });
    }
    const image = await context.renderAsync();
    const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: quality });
    return saved.uri;
  } catch {
    return uri;
  }
}
