import { Image } from 'react-native';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

export type Aspect = 'original' | '9:16' | '4:5' | '1:1';

export interface EditedPhoto { uri: string; width: number; height: number }

/** A photo's own size, which a crop needs to know before it can be centred. */
export function measure(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => Image.getSize(uri, (width, height) => resolve({ width, height }), reject));
}

const RATIO: Record<Exclude<Aspect, 'original'>, number> = { '9:16': 9 / 16, '4:5': 4 / 5, '1:1': 1 };

/**
 * The baseline edits a photo gets before posting: turn it, or cut it to a
 * shape, always from the original so edits never pile up on each other.
 */
export async function editPhoto(originalUri: string, turns: number, aspect: Aspect): Promise<EditedPhoto> {
  const context = ImageManipulator.manipulate(originalUri);
  const quarter = ((turns % 4) + 4) % 4;
  if (quarter) context.rotate(quarter * 90);
  if (aspect !== 'original') {
    const size = await measure(originalUri);
    // After a turn the sides swap.
    const w = quarter % 2 ? size.height : size.width;
    const h = quarter % 2 ? size.width : size.height;
    const want = RATIO[aspect];
    let cw = w;
    let ch = Math.round(w / want);
    if (ch > h) { ch = h; cw = Math.round(h * want); }
    context.crop({ originX: Math.round((w - cw) / 2), originY: Math.round((h - ch) / 2), width: cw, height: ch });
  }
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.9 });
  return { uri: saved.uri, width: saved.width, height: saved.height };
}
