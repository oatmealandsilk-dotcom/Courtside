// What a court's OpenStreetMap tags say about who may play there, whether it
// costs money, whether it is indoors, and where to book it (migration 60).
// Shared by the courts function and scripts/backfill-court-access.mjs, so
// new courts and the ones already stored are read the same way. No imports:
// Deno and Node both load this file as it is.

export type CourtAccess = 'public' | 'members' | 'pay' | 'private' | 'unknown';

/** The columns this fills on public.courts. The app shows `access`, which the database works out from `osm_access` and players' answers. */
export interface CourtTagFacts { osm_access: CourtAccess; fee: boolean | null; indoor: boolean | null; book_url: string | null }

// OpenStreetMap's own words for each. Anything else (or nothing) is unknown,
// and unknown courts are never hidden.
const OPEN = new Set(['yes', 'public', 'permissive', 'designated', 'destination']);
const MEMBERS = new Set(['members', 'member', 'residents', 'students', 'club']);
const PAY = new Set(['customers', 'permit']);
const CLOSED = new Set(['private', 'no']);

/** Every value of a tag that can hold several ("yes;private"), lower case. */
const values = (v?: string) => (v ?? '').split(';').map((x) => x.trim().toLowerCase()).filter(Boolean);
const first = (v?: string) => values(v)[0] ?? '';

/**
 * A plain web address, as the database's own check takes it: "http://" or
 * "https://" in lower case ("Https://" is made lower case here, since the
 * check would refuse the whole batch it came in), no spaces, at most 300
 * characters. Anything else is null.
 */
export function cleanLink(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim().replace(/^https?:\/\//i, (scheme) => scheme.toLowerCase());
  return v.length <= 300 && /^https?:\/\/[^\s]+$/.test(v) ? v : null;
}

/** A booking or website link, only when it is a plain web address. */
function linkOf(tags: Record<string, string>): string | null {
  for (const key of ['reservation:website', 'booking:website', 'booking', 'website', 'contact:website', 'url']) {
    const v = cleanLink(tags[key]);
    if (v) return v;
  }
  return null;
}

export function courtTagFacts(tags: Record<string, string> | undefined): CourtTagFacts {
  const t = tags ?? {};
  // Several answers at once ("yes;private"): the most closed one, to be safe.
  const access = values(t.access);
  const fee = first(t.fee);
  const paid = fee === 'yes' ? true : fee === 'no' ? false : null;
  let osm: CourtAccess = 'unknown';
  if (access.some((a) => CLOSED.has(a))) osm = 'private';
  else if (access.some((a) => MEMBERS.has(a))) osm = 'members';
  else if (access.some((a) => PAY.has(a))) osm = 'pay';
  else if (access.some((a) => OPEN.has(a))) osm = paid ? 'pay' : 'public';
  // No access tag, but a fee: anyone can play, at a price.
  else if (!access.length && paid) osm = 'pay';
  const indoor = first(t.indoor);
  const covered = first(t.covered);
  const building = first(t.building);
  const inside = ['yes', 'room', 'area'].includes(indoor) || covered === 'yes' || (!!building && building !== 'no') ? true
    : indoor === 'no' || covered === 'no' ? false
    : null;
  return { osm_access: osm, fee: paid, indoor: inside, book_url: linkOf(t) };
}

/** Whether the tags say anything at all (most courts carry none of these). */
export const saysSomething = (f: CourtTagFacts) => f.osm_access !== 'unknown' || f.fee !== null || f.indoor !== null || f.book_url !== null;
