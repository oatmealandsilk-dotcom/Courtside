/**
 * Small covers. Every clip or photo post sends a second, small copy of its
 * cover picture (about 360 pixels on its shorter side) next to the full one.
 * A cover that has one is named with "-cover" at the end, and its small copy
 * the same with "-sm" added:
 *
 *   …/media/<player>/mux1abc2-k3j9qz-cover.jpeg      the full cover (feed, post page)
 *   …/media/<player>/mux1abc2-k3j9qz-cover-sm.jpeg   the small one (grid tiles)
 *
 * The name alone says whether there is a small copy and where, so no
 * database change is needed. A full cover is about 250 KB and its small copy
 * about 30, so a profile grid of 30 tiles downloads about 1 MB instead of
 * about 7.
 */

/** The shorter side of a small cover, in pixels: a third of a phone screen at full sharpness, near enough. */
export const SMALL_COVER_EDGE = 360;

/**
 * What a cover with a small copy has at the end of its name. Its own mark,
 * not the upload time: a phone still on an older build keeps sending covers
 * without one for days after an update, and those must not be asked for a
 * small copy that is not there.
 */
export const COVER_MARK = '-cover';

/** The small cover's name (or address) for a full cover's: "-sm" before the extension. */
export const smallName = (path: string) => path.replace(/(\.[a-z0-9]+)$/i, '-sm$1');

// Uploads are named "<upload time>-<random letters>.<ext>", plus the mark
// for a cover with a small copy (see uploadMedia).
const MARKED = new RegExp(`/storage/v1/object/public/media/[^/]+/[0-9a-z]+-[0-9a-z]+${COVER_MARK}\\.[a-z0-9]+$`, 'i');

/**
 * The small cover's address for a full cover, or undefined when it has none:
 * a picture still on the phone, one hosted somewhere else, or one sent
 * without a small copy (every post from before small covers began).
 */
export function smallCoverOf(url?: string): string | undefined {
  return url && MARKED.test(url) ? smallName(url) : undefined;
}
