import type { ID, Question, QuestionTopic, ThreadSourceName, User } from '@/data/types';

/**
 * Live threads from Reddit (r/10s and r/tennis), to give the Discussions board
 * something to read before people post their own.
 *
 * Reddit only answers registered apps, so a scheduled job —
 * scripts/community-feeds.mjs, run by GitHub Actions — fetches them and saves
 * public/community.json next to the site. That file is the first thing tried
 * here; the live fetch below is the fallback, through a relay set in
 * EXPO_PUBLIC_FEED_PROXY.
 *
 * Talk Tennis (Tennis Warehouse's forum) used to be carried in too. It no
 * longer is: its threads are dropped even if an older saved file still has
 * them.
 */

const SUBREDDITS = ['10s', 'tennis'];
const REDDIT_LIMIT = 20;
const CACHE_KEY = 'courtside-imported-threads-v2';
const CACHE_TTL_MS = 60 * 60 * 1000;
const TIMEOUT_MS = 8000;

export interface ImportedBundle {
  users: User[];
  questions: Question[];
  fetchedAt: string;
}

/* ----------------------------- Source accounts ---------------------------- */

const sourceProfile: User['profile'] = {
  skillSystem: 'NTRP', rating: 4.0, playStyle: 'all-court', handedness: 'right', backhand: 'two-handed',
  fitnessLevel: 'recreational', preferredSurface: 'hard', sessionsPerWeek: 0, yearsPlaying: 0,
  goals: [], constraints: [], tournaments: [],
};

const stats: User['stats'] = {
  sessionsLogged: 0, matchesPlayed: 0, matchesWon: 0, hoursOnCourt: 0, currentStreakDays: 0, longestStreakDays: 0,
};

/** One account per source, so imported threads have a face and a handle. */
export const SOURCE_USERS: Record<ThreadSourceName, User> = {
  reddit: {
    id: 'u-src-reddit', handle: 'reddit', name: 'Reddit tennis', bio: 'Threads from r/10s and r/tennis.',
    location: 'reddit.com', joinedAt: '2008-01-25T00:00:00.000Z', avatarSeed: 'reddit-tennis', isCoach: false,
    followers: 0, following: 0, achievementIds: [], stats, profile: sourceProfile,
  },
};

/* -------------------------------- Topics --------------------------------- */

const TOPIC_WORDS: [QuestionTopic, RegExp][] = [
  ['injury', /\b(injur|elbow|shoulder|knee|wrist|ankle|pain|tendon|hurt|strain|sore|rehab|physio)/i],
  ['gear', /\b(racquet|racket|string|tension|poly|grip|shoe|overgrip|dampener|bag|ball|gear|frame|setup|pure aero|blade|clash|ezone|vcore|prestige|radical|gravity|luxilon|babolat|wilson|yonex|head\b|prince|tecnifibre|dunlop|solinco)/i],
  ['rules', /\b(rule|let\b|foot fault|umpire|score|scoring|line call|tiebreak|regulation|legal|allowed)/i],
  ['fitness', /\b(fitness|conditioning|stamina|cardio|gym|strength|footwork|agility|endurance|workout|stretch)/i],
  ['mental', /\b(mental|nerves|choke|choking|confidence|anxiety|focus|tilt|frustrat|mindset|pressure)/i],
  ['strategy', /\b(strategy|tactic|pattern|pusher|doubles|singles|match play|game plan|opponent|beat\b|win\b)/i],
  ['technique', /\b(forehand|backhand|serve|volley|technique|swing|toss|topspin|slice|kick|grip change|footwork|contact point|follow.?through|form\b)/i],
];

export function classifyTopic(text: string): QuestionTopic {
  for (const [topic, pattern] of TOPIC_WORDS) if (pattern.test(text)) return topic;
  return 'strategy';
}

/* --------------------------------- Fetch --------------------------------- */

function withTimeout<T>(promise: Promise<T>, ms = TIMEOUT_MS): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out')), ms);
    promise.then((v) => { clearTimeout(timer); resolve(v); }, (e) => { clearTimeout(timer); reject(e); });
  });
}

/** Turns "&amp;" and friends back into characters; RSS and Reddit both escape. */
function unescapeHtml(text: string): string {
  return text
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ').trim();
}

function tagsFrom(text: string): string[] {
  const found = new Set<string>();
  for (const [topic, pattern] of TOPIC_WORDS) {
    const hit = text.match(pattern)?.[0]?.toLowerCase().replace(/\s+/g, '');
    if (hit && hit.length > 2) found.add(hit);
    if (found.size >= 3) break;
    void topic;
  }
  return [...found];
}

function makeQuestion(input: {
  id: string; source: ThreadSourceName; label: string; title: string; body: string;
  url: string; author: string; createdAt: string; votes: number; replies: number;
}): Question {
  const text = `${input.title} ${input.body}`;
  return {
    id: input.id,
    authorId: SOURCE_USERS[input.source].id,
    title: input.title,
    body: input.body,
    topic: classifyTopic(text),
    createdAt: input.createdAt,
    tags: tagsFrom(text),
    votes: input.votes,
    votedBy: {},
    answerIds: [],
    source: { name: input.source, label: input.label, url: input.url, author: input.author, replies: input.replies },
  };
}

interface RedditChild {
  data: {
    id: string; title: string; selftext?: string; permalink: string; author: string;
    created_utc: number; score: number; num_comments: number; stickied?: boolean; over_18?: boolean;
    is_video?: boolean; url?: string;
  };
}

export async function fetchRedditThreads(): Promise<Question[]> {
  const lists = await Promise.allSettled(
    SUBREDDITS.map(async (sub) => {
      const res = await withTimeout(fetch(`https://www.reddit.com/r/${sub}/hot.json?limit=${REDDIT_LIMIT}&raw_json=1`));
      if (!res.ok) throw new Error(`reddit ${sub} ${res.status}`);
      const json = (await res.json()) as { data: { children: RedditChild[] } };
      return json.data.children.map((child) => ({ sub, ...child.data }));
    }),
  );
  return lists
    .flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
    .filter((post) => !post.stickied && !post.over_18 && post.title)
    .map((post) =>
      makeQuestion({
        id: `q-reddit-${post.id}`,
        source: 'reddit',
        label: `r/${post.sub}`,
        title: unescapeHtml(post.title).slice(0, 180),
        body: unescapeHtml(post.selftext ?? '').slice(0, 600),
        url: `https://www.reddit.com${post.permalink}`,
        author: `u/${post.author}`,
        createdAt: new Date(post.created_utc * 1000).toISOString(),
        votes: post.score,
        replies: post.num_comments,
      }),
    );
}

/* ------------------------------ Saved file ------------------------------- */

interface SavedThread {
  id: string; source: ThreadSourceName; label: string; title: string; body: string;
  url: string; author: string; createdAt: string; votes: number; replies: number;
}

/** Where the scheduled job's file lives: next to the web build, or on the live site. */
function savedFileUrl(): string {
  const base = (process.env.EXPO_BASE_URL ?? '').replace(/\/$/, '');
  if (typeof window !== 'undefined' && window.location?.origin) return `${window.location.origin}${base}/community.json`;
  return 'https://app.courtsidebase.com/community.json';
}

export async function fetchSavedThreads(): Promise<Question[]> {
  const res = await withTimeout(fetch(savedFileUrl(), { cache: 'no-cache' }));
  if (!res.ok) throw new Error(`community.json ${res.status}`);
  const json = (await res.json()) as { threads?: SavedThread[] };
  // Only sources still carried: an older file may hold Talk Tennis threads.
  return (json.threads ?? []).filter((t) => t && t.id && t.title && t.url && t.source === 'reddit').map((t) => makeQuestion(t));
}

/* --------------------------------- Cache --------------------------------- */

function readCache(): ImportedBundle | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const bundle = JSON.parse(raw) as ImportedBundle;
    return Date.now() - Date.parse(bundle.fetchedAt) < CACHE_TTL_MS ? bundle : null;
  } catch {
    return null;
  }
}

function writeCache(bundle: ImportedBundle) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(bundle)); } catch { /* storage full or unavailable */ }
}

/**
 * Everything worth showing, newest and liveliest first. Never throws: a
 * source that is down simply contributes nothing, and the board still works.
 */
export async function fetchImportedThreads(): Promise<ImportedBundle> {
  const cached = readCache();
  if (cached) return cached;

  let questions: Question[] = [];
  try {
    questions = await fetchSavedThreads();
  } catch {
    // No saved file (or it is unreachable): try the sources directly.
  }
  if (!questions.length) {
    try {
      questions = await fetchRedditThreads();
    } catch {
      // Reddit is down or refusing: the board just shows people's own threads.
    }
  }
  const used = new Set(questions.map((q) => q.authorId));
  const bundle: ImportedBundle = {
    users: Object.values(SOURCE_USERS).filter((u) => used.has(u.id)),
    questions,
    fetchedAt: new Date().toISOString(),
  };
  if (questions.length) writeCache(bundle);
  return bundle;
}

export const isImported = (question: Pick<Question, 'source'>): boolean => Boolean(question.source);
export const sourceUserIds: ID[] = Object.values(SOURCE_USERS).map((u) => u.id);
