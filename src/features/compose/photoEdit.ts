import { Image } from 'react-native';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

export type Aspect = 'original' | '9:16' | '4:5' | '1:1';

export interface EditedPhoto { uri: string; width: number; height: number }

/**
 * The photo's size as the cutter sees it. A phone photo is often stored
 * sideways with a "rotate" flag; asking the cutter itself (a one-off render)
 * gives the upright size, so a window drawn on the stage cuts what it shows.
 */
export async function measureForEdit(uri: string): Promise<{ width: number; height: number }> {
  try {
    const image = await ImageManipulator.manipulate(uri).renderAsync();
    if (image.width > 0 && image.height > 0) return { width: image.width, height: image.height };
  } catch { /* fall back to the plain measurement */ }
  return measure(uri);
}

/** A photo's own size, which a crop needs to know before it can be centred. */
export function measure(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => Image.getSize(uri, (width, height) => resolve({ width, height }), reject));
}

const RATIO: Record<Exclude<Aspect, 'original'>, number> = { '9:16': 9 / 16, '4:5': 4 / 5, '1:1': 1 };

/**
 * The baseline edits a photo gets before posting: turn it, or cut it to a
 * shape, always from the original so edits never pile up on each other.
 */
/**
 * Turns the photo, then cuts the given window out of it (in the turned
 * picture's own pixels) — one pass, done once when the editor is finished.
 */
export async function editPhotoRect(originalUri: string, turns: number, rect: { originX: number; originY: number; width: number; height: number } | null): Promise<EditedPhoto> {
  const context = ImageManipulator.manipulate(originalUri);
  const quarter = ((turns % 4) + 4) % 4;
  if (quarter) context.rotate(quarter * 90);
  if (rect) {
    const originX = Math.max(0, Math.round(rect.originX));
    const originY = Math.max(0, Math.round(rect.originY));
    context.crop({ originX, originY, width: Math.max(1, Math.round(rect.width)), height: Math.max(1, Math.round(rect.height)) });
  }
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.9 });
  return { uri: saved.uri, width: saved.width, height: saved.height };
}

export const ASPECT_RATIO: Record<Exclude<Aspect, 'original'>, number> = { '9:16': 9 / 16, '4:5': 4 / 5, '1:1': 1 };

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
