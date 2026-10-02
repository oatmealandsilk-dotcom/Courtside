import type { ID, Post, PracticeSession, SessionDetail, SessionPlayer, SessionTag, SessionTagRefusal, SessionTagRole, SessionWith, User } from '@/data/types';
import { named, type Named } from '@/features/messages/groupRules';
import type { AgeSource, OpennessMap } from '@/features/players/age';

/*
 * Tagging who you played (migration 62). You pick CourtSide players in "Who
 * you played"; each is asked to accept; only once they do does their name
 * show on a post carrying that session ("Won vs @mira"). Before that, and
 * after a no, only the two of you ever see the tag. A name typed that is not
 * on CourtSide stays private text, as it always was.
 *
 * Plain functions, so the store, the screens and the demo say and work it out
 * the same way the server does.
 */

/** A doubles partner and two opponents. The server holds the same limit. */
export const MAX_SESSION_TAGS = 3;

/** Only a match or a practice can have people tagged on it. */
export const canTagKind = (kind: PracticeSession['kind'] | undefined): boolean => kind === 'match' || kind === 'practice';

/** A tag that still counts: waiting for an answer, or accepted. A no, or a tag taken back off, does not take one of the three places. */
export const isActive = (t: Pick<SessionTag, 'status'>): boolean => t.status === 'pending' || t.status === 'accepted';

/** A tag that can no longer become a yes: taken back off by the one tagged, or a no the tagger took off their log. */
export const isClosed = (t: Pick<SessionTag, 'status' | 'dropped'>): boolean => t.status === 'removed' || !!t.dropped;

/** A first name, for the words of a private log or a short line. */
export const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

/** On a practice everyone is "with" you; in a match, the side of the net you said. */
export const roleOn = (kind: PracticeSession['kind'], role: SessionTagRole): SessionTagRole => (kind === 'match' ? role : 'partner');

/** A match result from the tagged person's side: an opponent's win is your loss; a partner's is yours too. */
export function mirrorWon(won: boolean | undefined, role: SessionTagRole): boolean | undefined {
  if (won === undefined) return undefined;
  return role === 'partner' ? won : !won;
}

/**
 * A new pick in a match: an opponent, unless there are two already (a third
 * opponent is never right), then the partner. On a practice: "with".
 */
export function nextRole(kind: PracticeSession['kind'], picked: SessionPlayer[]): SessionTagRole {
  if (kind !== 'match') return 'partner';
  return picked.filter((p) => p.role === 'opponent').length >= 2 ? 'partner' : 'opponent';
}

/**
 * Switching someone between "vs" and "with" in a match keeps the court
 * possible: making someone the partner turns the old partner into an
 * opponent; making a third opponent turns the first opponent into the partner.
 * Someone in `locked` (they accepted: they said yes to that side) is never
 * moved; a switch that would need to move them gives null instead.
 */
export function flipRole(picked: SessionPlayer[], id: ID, locked: ReadonlySet<ID> = new Set()): SessionPlayer[] | null {
  const me = picked.find((p) => p.id === id);
  if (!me || locked.has(id)) return null;
  const to: SessionTagRole = me.role === 'opponent' ? 'partner' : 'opponent';
  let next = picked.map((p) => (p.id === id ? { ...p, role: to } : p));
  if (to === 'partner') {
    if (next.some((p) => p.id !== id && p.role === 'partner' && locked.has(p.id))) return null;
    next = next.map((p) => (p.id !== id && p.role === 'partner' ? { ...p, role: 'opponent' } : p));
  } else if (next.filter((p) => p.role === 'opponent').length > 2) {
    const first = next.find((p) => p.id !== id && p.role === 'opponent' && !locked.has(p.id));
    if (!first) return null;
    next = next.map((p) => (p.id === first.id ? { ...p, role: 'partner' } : p));
  }
  return next;
}

/**
 * The sides worked out again when a session becomes a match (picked on a
 * practice, where everyone is "with"): everyone not switched by hand, in the
 * order picked, is an opponent while there is room for one (two at most),
 * then the partner. Someone switched by hand keeps their side.
 */
export function rolesForMatch(picked: SessionPlayer[], byHand: ReadonlySet<ID>): SessionPlayer[] {
  const kept = picked.filter((p) => byHand.has(p.id));
  let opponents = kept.filter((p) => p.role === 'opponent').length;
  let partner = kept.some((p) => p.role === 'partner');
  return picked.map((p) => {
    if (byHand.has(p.id)) return p;
    if (opponents < 2) { opponents += 1; return { ...p, role: 'opponent' }; }
    if (!partner) { partner = true; return { ...p, role: 'partner' }; }
    return { ...p, role: 'opponent' };
  });
}

/**
 * Your tags on one of your sessions, in the order you made them. A no, or a
 * tag taken back off, is included (they stay, so that person is not asked
 * again), but not once you took it off your log, unless `withDropped`.
 */
export function tagsOnSession(tags: SessionTag[], sessionId: ID, me: ID | null, withDropped = false): SessionTag[] {
  return tags
    .filter((t) => t.sessionId === sessionId && t.taggerId === me && (withDropped || !t.dropped))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

/**
 * Your own copy of a session you were tagged in, as respond_session_tag makes
 * it on Accept: the same day, length and kind, the result from your side
 * (the tag already carries it so), and who it was with, by first name, as
 * private words: the who-you-played box ("Match · Won vs Sam", "Practice
 * with Sam"), or a note for a doubles partner ("With Sam"). A copy already
 * in your log for that session is used again.
 */
export function mirrorCopy({ me, tag, sessions, taggerName, newId }: { me: ID; tag: SessionTag; sessions: PracticeSession[]; taggerName: string; newId: ID }): PracticeSession {
  const have = sessions.find((s) => s.userId === me && (s.id === tag.mirroredSessionId || s.fromSessionId === tag.sessionId));
  if (have) return have;
  const partnerInMatch = tag.kind === 'match' && tag.role === 'partner';
  const who = firstName(taggerName).slice(0, 60);
  return {
    id: newId, userId: me, day: tag.day, minutes: tag.minutes, kind: tag.kind,
    ...(tag.kind === 'match' && tag.won !== undefined ? { won: tag.won } : {}),
    ...(partnerInMatch ? { note: `With ${who}` } : { opponent: who }),
    fromSessionId: tag.sessionId,
    createdAt: new Date().toISOString(),
  };
}

/** One person on a post's stats, as the server writes them. */
export const withEntry = (u: Pick<User, 'id' | 'handle' | 'name'>, role: SessionTagRole): SessionWith => ({ id: u.id, handle: u.handle, name: u.name, role });

/** Opponents first, then partners, each in the order they came: the server's order (session_with). */
const ordered = (list: SessionWith[]) => [...list.filter((w) => w.role === 'opponent'), ...list.filter((w) => w.role !== 'opponent')];

/**
 * The "with" list a post carrying this session shows, worked out as the
 * server does: accepted tags only, opponents first. Undefined for nobody.
 */
export function withListFor(tags: SessionTag[], sessionId: ID, taggerId: ID, users: User[]): SessionWith[] | undefined {
  const list = tagsOnSession(tags, sessionId, taggerId)
    .filter((t) => t.status === 'accepted')
    .map((t) => {
      const u = users.find((x) => x.id === t.taggedId);
      return u ? withEntry(u, t.role) : null;
    })
    .filter((w): w is SessionWith => !!w);
  return list.length ? ordered(list) : undefined;
}

/** Whether a post's stats are from this session of its author's: by its log id, or the tracker session it was logged from. */
const carries = (s: SessionDetail | undefined, session: Pick<PracticeSession, 'id' | 'activityId'>) =>
  !!s && (s.sessionId === session.id || (!!session.activityId && s.activityId === session.activityId));

/**
 * A new post's stats with its "with" list filled in from your own accepted
 * tags, so it shows straight away (the server works it out again and keeps
 * its own). Stats from a tracker also get the session they were logged as.
 */
export function withOnNewPost(stats: SessionDetail | undefined, me: ID, sessions: PracticeSession[], tags: SessionTag[], users: User[]): SessionDetail | undefined {
  if (!stats) return stats;
  const { with: _sent, ...rest } = stats;
  const session = sessions.find((s) => s.userId === me && carries(rest, s));
  const list = session ? withListFor(tags, session.id, me, users) : undefined;
  if (!session || !list) return rest;
  return { ...rest, ...(rest.sessionId ? {} : { sessionId: session.id }), with: list };
}

/**
 * Posts by `authorId` carrying one of their sessions, with one person put on
 * (an accept) or taken off (`entry` null: a decline or a removal). The
 * server does the same to every such post; this keeps the copies on this
 * phone right meanwhile.
 */
export function patchWith(posts: Post[], authorId: ID, sessionId: ID, personId: ID, entry: SessionWith | null): Post[] {
  let changed = false;
  const next = posts.map((p) => {
    if (p.authorId !== authorId || !p.session || p.session.sessionId !== sessionId) return p;
    const had = p.session.with ?? [];
    const without = had.filter((w) => w.id !== personId);
    const list = entry ? ordered([...without, entry]) : without;
    if (!entry && without.length === had.length) return p;
    changed = true;
    const { with: _old, ...rest } = p.session;
    return { ...p, session: list.length ? { ...rest, with: list } : rest };
  });
  return changed ? next : posts;
}

/**
 * Posts brought in line with a fresh list of your tags (from the server): on
 * your own posts, the accepted players on each session you can see in your
 * log; on someone else's, you on or off as your own tag now stands. A post
 * whose session isn't in your log here is left as the server sent it.
 */
export function reconcileWith(posts: Post[], me: ID, sessions: PracticeSession[], tags: SessionTag[], users: User[]): Post[] {
  let changed = false;
  const self = users.find((u) => u.id === me);
  // Compared by what shows, never by how the keys happen to be ordered (the server's JSON sorts them its own way).
  const key = (list: SessionWith[] | undefined) => (list ?? []).map((w) => `${w.id}:${w.role}:${w.handle}:${w.name}`).join('|');
  const same = (a: SessionWith[] | undefined, b: SessionWith[] | undefined) => key(a) === key(b);
  const next = posts.map((p) => {
    if (!p.session) return p;
    if (p.authorId === me) {
      const session = sessions.find((s) => s.userId === me && carries(p.session, s));
      if (!session) return p;
      const list = withListFor(tags, session.id, me, users);
      if (same(list, p.session.with)) return p;
      changed = true;
      const { with: _old, ...rest } = p.session;
      return { ...p, session: list ? { ...rest, ...(rest.sessionId ? {} : { sessionId: session.id }), with: list } : rest };
    }
    const sessionId = p.session.sessionId;
    if (!sessionId) return p;
    const mine = tags.find((t) => t.taggedId === me && t.taggerId === p.authorId && t.sessionId === sessionId);
    const on = !!p.session.with?.some((w) => w.id === me);
    if (mine?.status === 'accepted' && !on && self) { changed = true; return patchWith([p], p.authorId, sessionId, me, withEntry(self, mine.role))[0]; }
    if (on && mine && mine.status !== 'accepted') { changed = true; return patchWith([p], p.authorId, sessionId, me, null)[0]; }
    return p;
  });
  return changed ? next : posts;
}

/** Whether a post belongs on someone's Tagged tab: tagged in it, or an accepted player on its session. */
export const isTaggedIn = (p: Post, userId: ID | null | undefined): boolean =>
  !!userId && (!!p.taggedUserIds?.includes(userId) || !!p.session?.with?.some((w) => w.id === userId));

/**
 * The people a post's stats name, as the viewer may see them: anyone they
 * have blocked is left out (the server already leaves out a pair blocked
 * between the two players).
 */
export function sessionPeople(s: SessionDetail | undefined, hidden: ID[] = []): { opponents: SessionWith[]; partners: SessionWith[] } {
  const list = (s?.with ?? []).filter((w) => !hidden.includes(w.id));
  // On a practice nobody is across the net: everyone is "with".
  if (s?.kind && s.kind !== 'match') return { opponents: [], partners: list };
  return { opponents: list.filter((w) => w.role === 'opponent'), partners: list.filter((w) => w.role !== 'opponent') };
}

/* ------------------------------------------------------------ who can be tagged */

/**
 * This phone's best guess at whether you may tag someone, from what it
 * already knows: the server's rule (session_tag_refusal) is the one that
 * counts. Blocks either way are hidden from the search before this; someone
 * not known to be an adult must follow you first, as for a new chat. In the
 * demo nobody's age is on file, so only a known teen is held back there.
 *
 * Since migration 64 nobody else's age reaches the app (`source`, see
 * AgeSource): `told` is what the server said about people (open_to_you),
 * and `ask` asks it about this person. Someone not answered yet, or that the
 * server would not answer about, is not held back here; the server's own
 * check, which follows every pick, has the last word.
 */
export function localRefusal({ me, who, follows, source, told, ask }: { me: ID | null; who: User | undefined; follows: { followerId: ID; followingId: ID }[]; source: AgeSource; told?: OpennessMap; ask?: (id: ID) => void }): SessionTagRefusal | null {
  if (!me) return 'signed_out';
  if (!who) return 'missing';
  if (who.id === me) return 'self';
  if (follows.some((e) => e.followerId === who.id && e.followingId === me)) return null;
  if (source === 'fixtures') return who.ageGroup !== 'teen' ? null : 'teen_closed';
  if (source === 'ages') return who.ageGroup === 'adult' ? null : 'teen_closed';
  ask?.(who.id);
  return told?.[who.id]?.chat === false ? 'teen_closed' : null;
}

/** How a sentence names someone (with their @handle beside a first name someone else here shares). */
export const nameFor = (who: User | undefined, users: User[]): Named | undefined => (who ? named(who, users) : undefined);

/**
 * Why a tag did not go through, in words. The age rule never says why an
 * account is protected (that would tell everyone it is a teen's), and a
 * no is never spelled out to the tagger as a no.
 */
export function refusalWords(code: string, who?: Named): string {
  const first = who?.first ?? 'They';
  switch (code) {
    case 'self': return 'That’s you.';
    case 'missing': return 'That player isn’t on CourtSide any more.';
    case 'suspended': return 'Your account can’t tag players right now.';
    case 'signed_out': case 'not signed in': return 'Sign in to tag players.';
    case 'blocked': return who ? `You can’t tag ${who.first}.` : 'You can’t tag that player.';
    case 'teen_closed': return who ? `Only people ${who.label} follows can tag ${who.first}.` : 'This player can only be tagged by people they follow.';
    case 'declined': return `${first} can’t be tagged on this session.`;
    case 'copy': return 'This session came from someone else’s tag. It’s theirs to tag.';
    case 'removed': return 'This tag was taken off.';
    case 'too_many': return `Up to ${MAX_SESSION_TAGS} players a session. This one is full.`;
    case 'rate_limited': return 'That’s a lot of tags today. Try again tomorrow.';
    case 'not_a_match_or_practice': return 'Players can be tagged on a match or a practice.';
    case 'not_your_session': return 'Only the player who logged it can tag people on it.';
    case 'not_yours': return 'That tag isn’t yours.';
    default: return 'That didn’t go through. Try again.';
  }
}

/** The codes the server answers with, so a plain sentence can be told from one of them. */
export const REFUSALS = new Set(['self', 'missing', 'suspended', 'signed_out', 'not signed in', 'blocked', 'teen_closed', 'declined', 'copy', 'removed', 'too_many', 'rate_limited', 'not_a_match_or_practice', 'not_your_session', 'not_yours', 'bad_role']);

/* ------------------------------------------------------------- how it reads */

/** "Mira", "Mira and Dev", "Mira, Dev and Sam". */
export function andList(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** One name in your private log's line, and where its tag stands ('typed': a name you wrote, not a tag). */
export type PersonWord = { name: string; state: 'accepted' | 'pending' | 'said-no' | 'typed' };

/**
 * Who you played, as your own private log says it, by first name: "vs
 * Mira", "with Dev", "vs Sam" for a name you typed. Each tagged person says
 * where their tag stands: accepted (shown with a tick), waiting, or a no
 * (just the name, the way you would have typed it: your log is yours, the
 * post is what they said no to). Taken off your log: not shown. On a
 * practice everyone is "with".
 *
 * `allWaiting`: everyone tagged is still to answer, so the line can end
 * " · Waiting" once ("vs June · Waiting") rather than marking each name.
 */
export function peopleWords(s: PracticeSession, tags: SessionTag[], users: User[]): { vs: PersonWord[]; with: PersonWord[]; waiting: number; allWaiting: boolean } | null {
  const across: PersonWord[] = [];
  const beside: PersonWord[] = [];
  let waiting = 0;
  let tagged = 0;
  for (const t of tagsOnSession(tags, s.id, s.userId)) {
    const u = users.find((x) => x.id === t.taggedId);
    if (!u) continue;
    tagged += 1;
    if (t.status === 'pending') waiting += 1;
    const state: PersonWord['state'] = t.status === 'accepted' ? 'accepted' : t.status === 'pending' ? 'pending' : 'said-no';
    (s.kind === 'match' && t.role === 'opponent' ? across : beside).push({ name: firstName(u.name), state });
  }
  // A name you typed sits where it always did: the opponent in a match, who you were with otherwise.
  if (s.opponent) (s.kind === 'match' ? across : beside).push({ name: s.opponent, state: 'typed' });
  if (!across.length && !beside.length) return null;
  return { vs: across, with: beside, waiting, allWaiting: waiting > 0 && waiting === tagged };
}

/** The same line as plain words, for a screen reader or a label: "vs Mira and June (waiting) · with Dev". */
export function peopleText(p: { vs: PersonWord[]; with: PersonWord[]; allWaiting: boolean }, mark = true): string {
  const say = (list: PersonWord[]) => andList(list.map((w) => (mark && !p.allWaiting && w.state === 'pending' ? `${w.name} (waiting)` : w.name)));
  return [p.vs.length ? `vs ${say(p.vs)}` : '', p.with.length ? `with ${say(p.with)}` : ''].filter(Boolean).join(' · ') + (mark && p.allWaiting ? ' · Waiting' : '');
}

/**
 * The note under a session's stats on a new post while tags on it wait:
 * "Mira’s name shows once they accept.", "Their names show once Mira and
 * Dev accept."
 */
export function pendingNote(names: string[]): string | null {
  if (!names.length) return null;
  if (names.length === 1) return `${names[0]}’s name shows once they accept.`;
  return `Their names show once ${andList(names)} accept.`;
}

/** A tag of you, from your side, in a few words: "You won", "You lost", "Match", "Practice". */
export function yourResult(t: Pick<SessionTag, 'kind' | 'won'>): string {
  if (t.kind !== 'match') return t.kind === 'practice' ? 'Practice' : t.kind.charAt(0).toUpperCase() + t.kind.slice(1);
  return t.won === true ? 'You won' : t.won === false ? 'You lost' : 'Match';
}

/** Where a tag of you stands, when it is no longer waiting: "Accepted", "Declined", "Removed". */
export function tagState(t: Pick<SessionTag, 'status' | 'dropped'>): string | null {
  if (t.status === 'removed' || (t.dropped && t.status !== 'accepted')) return 'Removed';
  if (t.status === 'accepted') return 'Accepted';
  if (t.status === 'declined') return 'Declined';
  return null;
}
