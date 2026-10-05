import { File, FileMode, Paths, type FileHandle } from 'expo-file-system';
import { reportError } from '@/lib/crashReporting';
import { blankPlaces, findMoov, MOOV_MAX } from '@/lib/videoLocationBytes';

/**
 * Takes where a video was filmed out of it before it is uploaded, on the
 * phone. (The website's version is videoLocation.web.ts; what is found and
 * how it is blanked is shared, in videoLocationBytes.ts, which explains it.)
 *
 * Every video the app uploads comes through here, from uploadMedia in
 * remote.ts, after the compressor has run and right before the bytes are
 * sent: posts, stories, replies, coach questions and coaching requests.
 *
 * Only the file's small index is read and only the few changed bytes are
 * written: the picture and sound are never loaded into memory, so a long
 * clip costs no more than a short one. All of it runs on what every build of
 * the app already has (the file system's File and FileHandle), so it ships
 * as an instant update.
 *
 * It never throws and never holds a post back: a file whose index cannot be
 * read goes up as it is, as before, and the failure is filed in the error
 * log so it can be looked into.
 */

/** A video ready to send. */
export interface BlankedVideo {
  /**
   * The file to send: the same one when it was blanked where it stood (or
   * had nothing to blank, or could not be read), else a blanked copy in the
   * app's cache.
   */
  uri: string;
  /** Removes the copy, if one was made. Called once the upload is over, sent or not. Never throws. */
  release(): void;
}

const asItIs = (uri: string): BlankedVideo => ({ uri, release: () => {} });

/** Removes a copy this module made; never throws. */
function drop(file: File) {
  try {
    if (file.exists) file.delete();
  } catch { /* already gone */ }
}

/**
 * Finds the spot in `file` and, with `write`, blanks it there. Says how many
 * places were (or, only looking, would be) blanked: 0 when there is nothing
 * to blank, or when the file is not an MP4 or QuickTime file at all. Throws
 * when the file's index cannot be read.
 */
async function blankIn(file: File, write: boolean): Promise<number> {
  let handle: FileHandle | null = null;
  try {
    handle = file.open(write ? FileMode.ReadWrite : FileMode.ReadOnly);
    const open = handle;
    const fileSize = open.size ?? 0;
    const moov = await findMoov((at, length) => {
      open.offset = at;
      return open.readBytes(length);
    }, fileSize);
    if (moov === 'not-mp4') return 0;
    if (!moov) throw new Error('no index found in the file');
    if (moov.size > MOOV_MAX) throw new Error(`index too big (${moov.size} bytes)`);
    open.offset = moov.at;
    const bytes = open.readBytes(moov.size);
    if (bytes.length !== moov.size) throw new Error('index cut short');
    const changed = blankPlaces(bytes);
    if (write) {
      for (const span of changed) {
        open.offset = moov.at + span.at;
        open.writeBytes(bytes.subarray(span.at, span.at + span.length));
      }
    }
    return changed.length;
  } finally {
    try { handle?.close(); } catch { /* already closed */ }
  }
}

/** The file's own ending (".mov", ".mp4"…), kept on the copy so it is sent as the same kind of file. */
function endingOf(uri: string): string {
  return uri.split(/[?#]/)[0].match(/\.([A-Za-z0-9]{1,5})$/)?.[1] ?? 'mp4';
}

/**
 * Blanks where the video at `uri` was filmed (see the top).
 *
 * `inPlace`: the file is one the app has just made for this upload (the
 * compressor's output), so it is blanked where it is. Otherwise it is the
 * picked file itself, which is never changed: when it has a spot to blank, a
 * copy is made in the app's cache, blanked, and sent instead (and removed by
 * release()).
 */
export async function blankVideoLocation(uri: string, options: { inPlace?: boolean } = {}): Promise<BlankedVideo> {
  try {
    const source = new File(uri.startsWith('/') ? `file://${uri}` : uri);
    if (!source.exists) return asItIs(uri);
    if (options.inPlace) {
      await blankIn(source, true);
      return asItIs(uri);
    }
    // Looked at first: a clip with no spot recorded is not copied for nothing.
    if ((await blankIn(source, false)) === 0) return asItIs(uri);
    const copy = new File(Paths.cache, `no-place-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${endingOf(uri)}`);
    try {
      await source.copy(copy);
      await blankIn(copy, true);
    } catch (error) {
      drop(copy);
      throw error;
    }
    return { uri: copy.uri, release: () => drop(copy) };
  } catch (error) {
    // Sent as it is, as before: a post is never held back by this.
    console.warn('[video location] not blanked', error);
    void reportError(error, { where: 'video location' });
    return asItIs(uri);
  }
}
