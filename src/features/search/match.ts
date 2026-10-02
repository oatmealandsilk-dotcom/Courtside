import { labelOf, score } from '@/components/CourtSearch';
import { atWordStart, plain, startsWord, wordStartIndex } from '@/features/search/words';
import type { Court } from '@/features/players/courts';
import { milesBetween } from '@/features/players/geo';
import type { LatLng } from '@/features/players/positions';
import type { Coach, ID, Post, Question, User } from '@/data/types';

/**
 * What was typed, read the way Instagram and TikTok read a search box:
 * "@" looks for people by handle only, "#" for posts and threads by tag
 * only, anything else looks everywhere. Everything is compared through
 * `plain()`, so case, accents and extra spaces never matter ("tomas" finds
 * Tomás).
 */
export interface Query {
  raw: string;
  mode: 'all' | 'people' | 'tag';
  /** What was typed after any @ or #, plain. */
  text: string;
  words: string[];
}

export function parseQuery(raw: string): Query {
  const t = raw.trim();
  const mode = t.startsWith('@') ? 'people' : t.startsWith('#') ? 'tag' : 'all';
  const text = plain(mode === 'all' ? t : t.slice(1));
  return { raw: t, mode, text, words: text.split(' ').filter(Boolean) };
}

/** The word-start matching lives with `plain()` so every search box shares it; kept importable from here. */
export { startsWord, wordStartIndex };

/** "Raleigh, NC" → "raleigh". */
export const townOf = (location: string | undefined) => plain((location ?? '').split(',')[0]);

/** A post's or thread's tags, plus any #word written in its text, plain and without the #. */
function tagsOf(tags: string[], body: string): string[] {
  const inline = [...body.matchAll(/#([\p{L}\p{N}_-]+)/gu)].map((m) => m[1]);
  return [...tags, ...inline].map((t) => plain(t.replace(/^#/, ''))).filter(Boolean);
}

/* --------------------------------- People -------------------------------- */

export interface PersonHit {
  user: User;
  coach?: Coach;
  reason: string;
  score: number;
  /**
   * How they matched: 3 the name or handle starts with it, 2.5 a word of the
   * name does, 2 the handle holds it, 1 only their town, bio or coaching
   * words do. Under 2 is a weak match: the All tab leaves those out.
   */
  match: number;
  /** For a weak match, the words of theirs that matched, so the row can show why. */
  via?: string;
}

/** A name or handle answers what was typed; a town or bio only hints at it. */
export const strongPerson = (hit: PersonHit) => hit.match >= 2;

/**
 * People, ranked the way Instagram and TikTok do it: the closest name match
 * first, then anyone near you, then people you share follows with, then by
 * how many follow them. A coach also turns up for words in their headline,
 * specialties or credentials, and appears once, as the person they are.
 * Everything matches from the start of a word, so the bold always shows why.
 * One letter finds only names and handles that start with it.
 */
export function matchPeople(q: Query, ctx: {
  users: User[];
  coaches: Coach[];
  me: ID | null;
  myTown: string;
  followingIds: ID[];
  followEdges: { followerId: ID; followingId: ID }[];
  blocked: Set<ID>;
}): PersonHit[] {
  if (q.mode === 'tag' || !q.text) return [];
  const needle = q.mode === 'people' ? q.text.replace(/ /g, '') : q.text;
  const iFollow = new Set(ctx.followingIds);
  const followersOf = new Map<ID, ID[]>();
  for (const e of ctx.followEdges) followersOf.set(e.followingId, [...(followersOf.get(e.followingId) ?? []), e.followerId]);
  const coachOf = new Map(ctx.coaches.map((c) => [c.userId, c]));
  const out: PersonHit[] = [];
  for (const user of ctx.users) {
    if (user.id === ctx.me || ctx.blocked.has(user.id)) continue;
    const name = plain(user.name);
    const handle = plain(user.handle);
    const coach = coachOf.get(user.id);
    // Handles run their words together ("tomascoach"), so from two letters on they match anywhere.
    const inHandle = needle.length >= 2 && handle.includes(needle);
    let match = 0;
    let via: string | undefined;
    if (q.mode === 'people') match = handle.startsWith(needle) ? 3 : inHandle ? 2 : 0;
    else if (name.startsWith(needle) || handle.startsWith(needle)) match = 3;
    else if (startsWord(name, needle)) match = 2.5;
    else if (inHandle) match = 2;
    else if (needle.length >= 2) {
      via = [user.location, user.bio, coach?.headline, ...(coach?.specialties ?? []), ...(coach?.credentials ?? [])]
        .find((field) => !!field && startsWord(plain(field), needle));
      if (via) match = 1;
    }
    if (!match) continue;
    const near = !!ctx.myTown && townOf(user.location) === ctx.myTown;
    const mutual = (followersOf.get(user.id) ?? []).filter((id) => iFollow.has(id)).length;
    const follows = iFollow.has(user.id);
    const rank = match * 10 + (near ? 4 : 0) + Math.min(mutual, 5) * 1.5 + (follows ? 2 : 0) + Math.log10(1 + user.followers);
    const reason = user.isCoach ? 'Coach' : mutual ? `${mutual} mutual` : near ? 'Near you' : user.followers >= 1000 ? 'Popular' : '';
    out.push({ user, coach, reason, score: rank, match, via });
  }
  // A name match always ranks above a town or bio match, however near or popular.
  return out.sort((a, b) => Number(strongPerson(b)) - Number(strongPerson(a)) || b.score - a.score);
}

/* ---------------------------------- Posts --------------------------------- */

/**
 * Posts whose words, tags, place or court hold every word typed. An exact
 * tag comes first, then a post with a word starting with what was typed,
 * then one that only contains it; ties go to the most liked, then the newest.
 */
export function matchPosts(q: Query, posts: Post[], blocked: Set<ID>): Post[] {
  // One letter would find nearly every post.
  if (q.mode === 'people' || q.text.length < 2) return [];
  const ranked: { post: Post; rank: number }[] = [];
  for (const post of posts) {
    if (post.archived || blocked.has(post.authorId)) continue;
    const tags = tagsOf(post.tags, post.body);
    let rank: number;
    if (q.mode === 'tag') {
      const tag = q.text.replace(/ /g, '');
      if (!tags.some((t) => t.startsWith(tag))) continue;
      rank = tags.includes(tag) ? 0 : 1;
    } else {
      const body = plain(post.body);
      const hay = `${body} ${tags.join(' ')} ${plain(post.location ?? '')} ${plain(post.court?.name ?? '')}`;
      if (!q.words.every((w) => startsWord(hay, w))) continue;
      rank = tags.includes(q.text) || tags.includes(q.text.replace(/ /g, '')) ? 0 : startsWord(body, q.text) ? 1 : body.includes(q.text) ? 2 : 3;
    }
    ranked.push({ post, rank });
  }
  return ranked
    .sort((a, b) => a.rank - b.rank || b.post.likedBy.length - a.post.likedBy.length || Date.parse(b.post.createdAt) - Date.parse(a.post.createdAt))
    .map((r) => r.post);
}

/* --------------------------------- Threads -------------------------------- */

export interface ThreadHit {
  question: Question;
  /** Only the body matched, so the row shows the words around the match. */
  bodyOnly: boolean;
  /** Only a tag matched (not the title or the words): the tag, so the row can say so. */
  tag?: string;
}

/**
 * Threads whose title, body, topic or tags hold every word typed. A title
 * starting with it (or with a word starting with it) comes first, then a
 * title containing it, then the rest; ties go to the most voted, then the
 * newest.
 */
export function matchThreads(q: Query, questions: Question[], blocked: Set<ID>, topicLabel: (q: Question) => string): ThreadHit[] {
  if (q.mode === 'people' || q.text.length < 2) return [];
  const ranked: { hit: ThreadHit; rank: number }[] = [];
  for (const question of questions) {
    if (blocked.has(question.authorId)) continue;
    const tags = tagsOf(question.tags, `${question.title} ${question.body}`);
    const title = plain(question.title);
    const body = plain(question.body);
    let rank: number;
    let bodyOnly = false;
    let byTag: string | undefined;
    if (q.mode === 'tag') {
      const tag = q.text.replace(/ /g, '');
      if (!tags.some((t) => t.startsWith(tag))) continue;
      rank = tags.includes(tag) ? 0 : 1;
    } else {
      const hay = `${title} ${body} ${plain(topicLabel(question))} ${tags.join(' ')}`;
      if (!q.words.every((w) => startsWord(hay, w))) continue;
      const inTitle = q.words.some((w) => startsWord(title, w));
      rank = startsWord(title, q.text) ? 0 : inTitle ? 1 : 2;
      bodyOnly = !inTitle && q.words.some((w) => startsWord(body, w));
      // "string" finds a thread tagged #strings whose words never say it: the row names the tag.
      if (!inTitle && !bodyOnly) byTag = tags.find((t) => q.words.some((w) => t.startsWith(w)));
    }
    ranked.push({ hit: { question, bodyOnly, tag: byTag }, rank });
  }
  return ranked
    .sort((a, b) => a.rank - b.rank || b.hit.question.votes - a.hit.question.votes || Date.parse(b.hit.question.createdAt) - Date.parse(a.hit.question.createdAt))
    .map((r) => r.hit);
}

/**
 * The words around the first match in a long text, so a thread found by
 * its body shows why: "…full poly at 4.0 is too stiff for most arms…".
 * Spaces are flattened first so the bold lines up with the letters.
 */
export function snippet(text: string, words: string[], before = 28, length = 150): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  const lower = plain(flat);
  const hits = words.map((w) => wordStartIndex(lower, w)).filter((i) => i >= 0);
  const at = hits.length ? Math.min(...hits) : 0;
  if (at <= before) return flat.slice(0, length);
  // Start on a word, never halfway through one.
  const space = flat.indexOf(' ', at - before);
  const start = space >= 0 && space < at ? space + 1 : at;
  return `…${flat.slice(start, start + length)}`;
}

/* --------------------------------- Courts --------------------------------- */

export interface CourtHit { court: Court; miles: number }

/** Named courts whose names hold every word typed, best match first, then nearest. From two letters on. */
export function matchCourts(q: Query, courts: Court[], home: LatLng | null): CourtHit[] {
  if (q.mode !== 'all' || q.text.length < 2) return [];
  const seen = new Set<string>();
  const out: (CourtHit & { rank: number })[] = [];
  for (const court of courts) {
    if (court.name === 'Tennis courts') continue;
    const key = `${court.lat.toFixed(3)},${court.lng.toFixed(3)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const rank = score(labelOf(court), q.words);
    // From the start of a word, as everywhere in Search: "ark" does not find every Park.
    if (rank === null || !q.words.every((w) => startsWord(plain(labelOf(court)), w))) continue;
    out.push({ court, miles: home ? milesBetween(home, court) : 0, rank });
  }
  return out.sort((a, b) => a.rank - b.rank || a.miles - b.miles).map(({ court, miles }) => ({ court, miles }));
}

/**
 * `text` cut into runs, `on` where it matches a typed word: for bold matches
 * inside a line that has other words in it (Highlighted draws a whole line).
 * Only a match at the start of a word is bold, the way search matches; a
 * handle, whose words run together, also bolds a match inside it from
 * `inside` letters typed. Accents that change the length of the text turn
 * the bold off, as there.
 */
export function highlightParts(text: string, words: string[], { inside = Infinity }: { inside?: number } = {}): { s: string; on: boolean }[] {
  const lower = plain(text);
  if (lower.length !== text.length || !words.length) return [{ s: text, on: false }];
  const marks = new Array<boolean>(text.length).fill(false);
  for (const w of words) {
    for (let i = lower.indexOf(w); i >= 0; i = lower.indexOf(w, i + 1)) {
      if (atWordStart(lower, i) || w.length >= inside) for (let k = i; k < i + w.length; k++) marks[k] = true;
    }
  }
  const parts: { s: string; on: boolean }[] = [];
  for (let i = 0; i < text.length; i++) {
    const last = parts[parts.length - 1];
    if (last && last.on === marks[i]) last.s += text[i];
    else parts.push({ s: text[i], on: marks[i] });
  }
  return parts;
}
