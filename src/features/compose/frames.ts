import * as VideoThumbnails from 'expo-video-thumbnails';

export interface Frame { time: number; uri: string }

/**
 * Still frames out of a video at the given seconds — for the trim strip and
 * for picking a cover. A frame the phone cannot produce is simply left out.
 */
/** `width` only matters in the browser; the phone always gives its full-size frame. */
export async function framesAt(uri: string, times: number[], _width?: number): Promise<Frame[]> { // eslint-disable-line @typescript-eslint/no-unused-vars
  const out: Frame[] = [];
  for (const time of times) {
    try {
      const shot = await VideoThumbnails.getThumbnailAsync(uri, { time: Math.max(0, Math.round(time * 1000)), quality: 0.6 });
      out.push({ time, uri: shot.uri });
    } catch {
      // Skip it; the strip shows what it can.
    }
  }
  return out;
}
