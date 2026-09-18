/**
 * How quickly clips have been loading on this phone lately, measured as
 * the time each one took to fetch its opening seconds. The feed uses it to
 * choose how to wait: on a quick connection a clip's own first frame with
 * the spinner, on a slow one the CourtSide loading page.
 */
const recent: number[] = [];

/** One clip took this long, from asking to having enough to play. */
export function noteClipLoad(ms: number) {
  recent.push(ms);
  if (recent.length > 3) recent.shift();
}

/** A quick connection: the last few clips were in within two seconds. Nothing measured yet counts as quick. */
export function connectionIsQuick() {
  if (!recent.length) return true;
  return recent.reduce((sum, ms) => sum + ms, 0) / recent.length < 2000;
}
