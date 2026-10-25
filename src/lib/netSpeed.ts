/**
 * How quickly clips have been loading on this phone lately, measured as
 * the time each one took to fetch its opening seconds. The feed uses it to
 * choose how far ahead to fetch (the lookahead, the covers, the clips'
 * beginnings) and how long a pull-to-refresh waits for the new first clip.
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

/**
 * The same measure, saying when there is none yet: quick, slow, or unknown (no clip has loaded
 * this session). The quick start (features/feed/quickStart) treats unknown as slow.
 */
export function linkState(): 'quick' | 'slow' | 'unknown' {
  if (!recent.length) return 'unknown';
  return connectionIsQuick() ? 'quick' : 'slow';
}
