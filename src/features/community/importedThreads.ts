import type { ID, Question, QuestionTopic, ThreadSourceName, User } from '@/data/types';

/**
 * Live threads from the two places tennis players already talk: Reddit
 * (r/10s and r/tennis) and the Tennis Warehouse "Talk Tennis" forum. They
 * fill the Discussions board on day one, when nobody has posted here yet.
 *
 * Neither site lets a browser read it directly (Reddit only answers
 * registered apps, Talk Tennis blocks cross-site requests), so a scheduled
 * job — scripts/community-feeds.mjs, run by GitHub Actions — fetches both
 * and saves public/community.json next to the site. That file is the first
 * thing tried here. The live fetches below are the fallback for the native
 * app, which can reach Talk Tennis on its own, and for a relay set in
 * EXPO_PUBLIC_FEED_PROXY.
 */

const SUBREDDITS = ['10s', 'tennis'];
const REDDIT_LIMIT = 20;
const TW_RSS = 'https://tt.tennis-warehouse.com/index.php?forums/-/index.rss';
const CACHE_KEY = 'courtside-imported-threads';
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
  'tennis-warehouse': {
    id: 'u-src-tw', handle: 'talktennis', name: 'Talk Tennis', bio: 'Threads from the Tennis Warehouse forum.',
    location: 'tt.tennis-warehouse.com', joinedAt: '1999-01-01T00:00:00.000Z', avatarSeed: 'talk-tennis', isCoach: false,
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

export async function fetchTennisWarehouseThreads(): Promise<Question[]> {
  const proxy = process.env.EXPO_PUBLIC_FEED_PROXY ?? '';
  const url = proxy ? `${proxy}${encodeURIComponent(TW_RSS)}` : TW_RSS;
  const res = await withTimeout(fetch(url));
  if (!res.ok) throw new Error(`talk tennis ${res.status}`);
  const xml = await res.text();
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  const field = (item: string, tag: string) =>
    item.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`))?.[1] ?? '';
  return items.slice(0, 25).map((item) => {
    const link = field(item, 'link').trim();
    const id = link.match(/\.(\d+)\/?$/)?.[1] ?? link.replace(/\W+/g, '').slice(-16);
    return makeQuestion({
      id: `q-tw-${id}`,
      source: 'tennis-warehouse',
      label: 'Talk Tennis',
      title: unescapeHtml(field(item, 'title')).slice(0, 180),
      body: unescapeHtml(field(item, 'description') || field(item, 'content:encoded')).slice(0, 600),
      url: link,
      author: unescapeHtml(field(item, 'dc:creator') || field(item, 'author')) || 'Talk Tennis member',
      createdAt: new Date(field(item, 'pubDate') || Date.now()).toISOString(),
      votes: 0,
      replies: 0,
    });
  }).filter((q) => q.title);
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
  return 'https://oatmealandsilk-dotcom.github.io/Courtside/community.json';
}

export async function fetchSavedThreads(): Promise<Question[]> {
  const res = await withTimeout(fetch(savedFileUrl(), { cache: 'no-cache' }));
  if (!res.ok) throw new Error(`community.json ${res.status}`);
  const json = (await res.json()) as { threads?: SavedThread[] };
  return (json.threads ?? []).filter((t) => t && t.id && t.title && t.url).map((t) => makeQuestion(t));
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
    const [reddit, tw] = await Promise.allSettled([fetchRedditThreads(), fetchTennisWarehouseThreads()]);
    questions = [
      ...(reddit.status === 'fulfilled' ? reddit.value : []),
      ...(tw.status === 'fulfilled' ? tw.value : []),
    ];
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
