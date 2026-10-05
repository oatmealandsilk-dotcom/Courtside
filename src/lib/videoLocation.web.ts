import { reportError } from '@/lib/crashReporting';
import { blankPlaces, findMoov, MOOV_MAX } from '@/lib/videoLocationBytes';

/**
 * Takes where a video was filmed out of it before it is uploaded, on the
 * website. (The phone's version is videoLocation.ts; what is found and how
 * it is blanked is shared, in videoLocationBytes.ts, which explains it.)
 *
 * Every video the website uploads comes through here, from uploadMedia in
 * remote.ts, after the browser has shrunk it (when it could) and right
 * before the bytes are sent. Without this, a clip that could not be shrunk
 * went up exactly as the phone filmed it, spot and all.
 *
 * A browser cannot change the picked file, so a new one is made in memory:
 * the picked file's bytes, with only its small index swapped for a blanked
 * copy. Only the index is read; the picture and sound are referred to, not
 * copied, so even a long clip costs no extra memory.
 *
 * It never throws and never holds a post back: a file whose index cannot be
 * read goes up as it is, as before, and the failure is filed in the error log.
 */

/** A video ready to send. Same shape as on the phone. */
export interface BlankedVideo {
  /** What to send: a new in-memory address for the blanked file, or the same one when there was nothing to blank. */
  uri: string;
  /** Lets the browser free the blanked file, once the upload is over (sent or not). Never throws. */
  release(): void;
}

/**
 * The same video with where it was filmed blanked: a new file of the same
 * type, or `video` itself when there was nothing to blank or its index could
 * not be read. Never throws.
 */
export async function blankLocationInBlob(video: Blob): Promise<Blob> {
  try {
    const read = async (at: number, length: number) => new Uint8Array(await video.slice(at, at + length).arrayBuffer());
    const moov = await findMoov(read, video.size);
    if (moov === 'not-mp4') return video;
    if (!moov) throw new Error('no index found in the file');
    if (moov.size > MOOV_MAX) throw new Error(`index too big (${moov.size} bytes)`);
    const index = await read(moov.at, moov.size);
    if (index.length !== moov.size) throw new Error('index cut short');
    if (blankPlaces(index).length === 0) return video;
    // Everything before the index, the blanked index, everything after it: same bytes, same places.
    return new Blob([video.slice(0, moov.at), index, video.slice(moov.at + moov.size)], { type: video.type });
  } catch (error) {
    console.warn('[video location] not blanked', error);
    void reportError(error, { where: 'video location' });
    return video;
  }
}

/**
 * Blanks where the video at `uri` (an address the browser made for a picked
 * or shrunk file) was filmed. `inPlace` is the phone's; a browser always
 * makes a new file, so it does not matter here.
 */
export async function blankVideoLocation(uri: string, _options: { inPlace?: boolean } = {}): Promise<BlankedVideo> {
  try {
    const video = await (await fetch(uri)).blob();
    const blanked = await blankLocationInBlob(video);
    if (blanked === video) return { uri, release: () => {} };
    const address = URL.createObjectURL(blanked);
    return {
      uri: address,
      release: () => {
        try { URL.revokeObjectURL(address); } catch { /* already freed */ }
      },
    };
  } catch (error) {
    console.warn('[video location] not blanked', error);
    void reportError(error, { where: 'video location' });
    return { uri, release: () => {} };
  }
}
