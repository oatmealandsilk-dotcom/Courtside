/**
 * Where a video was filmed, found and blanked inside the video file's own
 * bytes, before it is uploaded (Oct 5: posted clips were carrying the spot
 * they were filmed, to about 10 metres, often a player's home).
 *
 * Shared by the phone (videoLocation.ts) and the website
 * (videoLocation.web.ts), so both blank exactly the same things. Nothing in
 * this file opens or saves a file: it is handed bytes and changes them.
 *
 * How a video file is laid out, in plain words: an MP4 or Apple QuickTime
 * (.mov) file is a row of "boxes", each starting with its size and a
 * four-letter name. One box, "moov", is the file's index, listing what is in
 * the file and where. It is small (tens of KB) and sits at the start or the
 * end. The picture and sound themselves fill another box, "mdat", which is
 * nearly all of the file and is never read here.
 *
 * Phones write the filming spot into the index in one of two ways:
 *
 *   1. As text, in the standard way of writing a place (ISO 6709), like
 *      "+35.8032-078.8631+106.000/" (latitude, longitude, height). An
 *      iPhone's own .mov has it in Apple's list of details
 *      ("com.apple.quicktime.location.ISO6709") and often again in an older
 *      "©xyz" note; Android phones write "©xyz" too.
 *   2. As numbers, in a "loci" box (the 3GPP location box): longitude,
 *      latitude and height as binary numbers, plus an optional place name.
 *      Apple's video writer stores the spot this way in an .mp4, which is
 *      what the iPhone app's compressor makes, so nearly every upload from
 *      the app carried it in this form.
 *
 * Both are overwritten where they stand. The text keeps its shape with every
 * digit made 0 and every minus sign made + (so not even the hemisphere is
 * left); the loci box keeps its size and name with the place inside it made
 * zero. Same length, same place: nothing else in the file moves, and every
 * player plays it exactly as before. A reader of the file now sees the spot
 * as 0°, 0°, written "+00.0000+000.0000/".
 */

/** An index bigger than this is not a phone's clip (a minute of 1080p has one of about 50 KB): it is left alone. */
export const MOOV_MAX = 8 * 1024 * 1024;
/** How many boxes are stepped over looking for the index. A camera's file has three or four. */
const MAX_TOP_BOXES = 64;

/**
 * Reads `length` bytes starting `at` bytes into the file (fewer at its end).
 * The phone reads from the file on disk, the website from the picked file.
 */
export type ReadAt = (at: number, length: number) => Uint8Array | Promise<Uint8Array>;

/** Where the index is in the file. */
export interface Moov {
  at: number;
  size: number;
}

/** A stretch of the index that was changed: `at` bytes into it, `length` bytes long. */
export interface Span {
  at: number;
  length: number;
}

const u32 = (b: Uint8Array, i: number) => b[i] * 2 ** 24 + b[i + 1] * 2 ** 16 + b[i + 2] * 2 ** 8 + b[i + 3];
const fourCC = (b: Uint8Array, i: number) => String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3]);

/**
 * One box's header, read from `b` at `i`, for a box that must end by `end`:
 * its name, its whole size and how long the header is. A box's size is 4
 * bytes, or 8 more after the name when those 4 say 1; 0 means "to the end".
 * Null when the bytes there are not a box that fits.
 */
function boxAt(b: Uint8Array, i: number, end: number): { name: string; size: number; header: number } | null {
  if (i + 8 > end || i + 8 > b.length) return null;
  let size = u32(b, i);
  let header = 8;
  if (size === 1) {
    if (i + 16 > b.length) return null;
    size = u32(b, i + 8) * 2 ** 32 + u32(b, i + 12);
    header = 16;
  } else if (size === 0) {
    size = end - i;
  }
  if (size < header || i + size > end) return null;
  return { name: fourCC(b, i + 4), size, header };
}

/**
 * Where the file's index ("moov") is. Only each box's first few bytes are
 * read until it turns up. 'not-mp4' when the file does not even start like
 * an MP4 or QuickTime file (a WebM, say: there is no index of this kind to
 * blank); null when it does but no usable index was found.
 */
export async function findMoov(read: ReadAt, fileSize: number): Promise<Moov | 'not-mp4' | null> {
  let at = 0;
  for (let boxes = 0; boxes < MAX_TOP_BOXES && at + 8 <= fileSize; boxes += 1) {
    const head = await read(at, Math.min(16, fileSize - at));
    // Read as if the file started here, so the size checks run against what is left of it.
    const box = boxAt(head, 0, fileSize - at);
    if (!box || !/^[\x20-\x7e]{4}$/.test(box.name)) return boxes === 0 ? 'not-mp4' : null;
    if (box.name === 'moov') return { at, size: box.size };
    at += box.size;
  }
  return null;
}

/** Boxes that hold other boxes, on the way from the index down to a "loci" box (the index itself, a track, a note list). */
const LOCI_PATH = new Set(['moov', 'trak', 'udta']);

/** Zeroes the place inside each "loci" box (see 2. at the top) found under `start`..`end` of the index. */
function blankLoci(moov: Uint8Array, start: number, end: number, changed: Span[], depth = 0) {
  let i = start;
  while (i < end) {
    // A list may end early, with four zero bytes (Apple's note lists do): that, or anything that
    // is not a whole box, ends this list and nothing after it here is looked at.
    const box = boxAt(moov, i, end);
    if (!box) return;
    if (box.name === 'loci') {
      // After the header come the box's version and flags (4 bytes) and the
      // language its place name is in (2), which stay. Everything after
      // them is the place: its name, the longitude, latitude and height,
      // and any notes.
      const from = i + box.header + 6;
      const to = i + box.size;
      let any = false;
      for (let k = from; k < to; k += 1) {
        if (moov[k] !== 0) {
          moov[k] = 0;
          any = true;
        }
      }
      if (any) changed.push({ at: from, length: to - from });
    } else if (LOCI_PATH.has(box.name) && depth < 4) {
      blankLoci(moov, i + box.header, i + box.size, changed, depth + 1);
    }
    i += box.size;
  }
}

/**
 * A place written as text (see 1. at the top): latitude and longitude with
 * their decimals, then the height and Apple's map-system name if given. Long
 * and exact enough never to match anything else in an index.
 */
const PLACE = /[+-]\d{2}\.\d{2,}[+-]\d{3}\.\d{2,}(?:[+-]\d+(?:\.\d+)?)?(?:CRS[A-Za-z0-9:_]*)?\/?/g;
const ZERO = 48; // "0"
const PLUS = 43; // "+"
const MINUS = 45; // "-"
const isDigit = (c: number) => c >= 48 && c <= 57;

/** Makes every place written as text in the index read 0°, 0° (see the top). */
function blankText(moov: Uint8Array, changed: Span[]) {
  // The index as text, one character per byte, so a match's position is its byte's.
  let text = '';
  for (let i = 0; i < moov.length; i += 8192) text += String.fromCharCode(...Array.from(moov.subarray(i, i + 8192)));
  for (const found of text.matchAll(PLACE)) {
    const from = found.index ?? 0;
    let any = false;
    for (let k = from; k < from + found[0].length; k += 1) {
      const c = moov[k];
      const blank = isDigit(c) ? ZERO : c === MINUS ? PLUS : c;
      if (blank !== c) {
        moov[k] = blank;
        any = true;
      }
    }
    if (any) changed.push({ at: from, length: found[0].length });
  }
}

/**
 * Blanks where the clip was filmed in a copy of its index held in memory
 * (`moov`, the whole box, header included), and says which stretches of it
 * changed, so only those are written back. An empty list: there was nothing
 * to blank (no spot recorded, or already blanked).
 */
export function blankPlaces(moov: Uint8Array): Span[] {
  const changed: Span[] = [];
  const index = boxAt(moov, 0, moov.length);
  if (index?.name === 'moov') blankLoci(moov, index.header, index.size, changed);
  blankText(moov, changed);
  return changed;
}
