#!/usr/bin/env node
/**
 * The feed-order check: proves, with made-up posts and a fixed clock, that
 * For you never shows something you have already seen above something you
 * have not (Oct 7, owner: "people don't keep seeing the same videos").
 *
 *   npm run rank-check
 *
 * It runs the app's own ranking (src/features/feed/rankFeed.ts, turned into
 * plain JavaScript in a temporary folder) and checks:
 *   1. a post you have not seen, however plain, comes above a video you have
 *      seen, however popular: seen here this visit, on this phone before, or
 *      on another phone (the server);
 *   2. every post you have seen comes after "You're all caught up", every one
 *      you have not before it;
 *   3. no author twice within five pages;
 *   4. the same posts always deal the same order, whatever order they come in;
 *   5. among the ones you have seen: what you saw longest ago first, what you
 *      saw this visit last; threads you have not seen before ones you have;
 *   6. nothing seen: "You're all caught up" is last; everything seen: it is first;
 *   7. two visits: the second opens on posts the first did not show.
 * Nothing random: the same run gives the same answer every time. Exit code 0
 * is a pass, 1 a failure.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------- the ranking, as plain JavaScript

async function loadRanking() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'courtside-rank-'));
  process.on('exit', () => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } });
  const compile = (from, to) => {
    const source = fs.readFileSync(path.join(ROOT, from), 'utf8');
    const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, verbatimModuleSyntax: false } });
    // The app's "@/..." shorthand, to the file next to it here.
    fs.writeFileSync(path.join(dir, to), outputText.replace(/from '@\/features\/feed\/newHere'/g, "from './newHere.mjs'"));
  };
  compile('src/features/feed/newHere.ts', 'newHere.mjs');
  compile('src/features/feed/rankFeed.ts', 'rankFeed.mjs');
  return import(pathToFileURL(path.join(dir, 'rankFeed.mjs')).href);
}

// ---------------------------------------------------------------- made-up data, the same every run

const NOW = Date.parse('2026-10-07T12:00:00Z');
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const at = (msAgo) => new Date(NOW - msAgo).toISOString();
const ME = 'me';

/** A small fixed sequence of numbers between 0 and 1 (no Math.random). */
function numbers(seed) {
  let x = seed >>> 0;
  return () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 2 ** 32; };
}

const user = (id, extra = {}) => ({ id, handle: id, name: id, bio: '', location: 'Los Angeles, CA', joinedAt: at(200 * DAY), avatarSeed: id, isCoach: false, followers: 0, following: 0, achievementIds: [], stats: {}, profile: {}, ...extra });
const post = (id, authorId, msAgo, extra = {}) => ({ id, authorId, kind: 'note', createdAt: at(msAgo), body: '', likedBy: [], commentIds: [], tags: [], ...extra });
const video = (id, authorId, msAgo, extra = {}) => post(id, authorId, msAgo, { kind: 'clip', videoUrl: `https://example.com/${id}.mp4`, ...extra });
const question = (id, authorId, msAgo, extra = {}) => ({ id, authorId, title: id, body: '', topic: 'technique', createdAt: at(msAgo), tags: [], votes: 0, votedBy: {}, answerIds: [], ...extra });
const hit = (id, authorId, msAgo) => ({ id, authorId, createdAt: at(msAgo), expiresAt: at(msAgo - DAY), viewedBy: [], likedBy: [], commentIds: [] });
const likes = (n) => Array.from({ length: n }, (_, i) => `fan${i}`);

/** A feed of `count` posts by `authors` people, a third of them videos, some popular, spread over two weeks. */
function bigFeed(count, authors, seed) {
  const r = numbers(seed);
  const posts = [];
  for (let i = 0; i < count; i += 1) {
    const author = `a${i % authors}`;
    const ago = Math.floor(r() * 14 * DAY);
    const extra = { likedBy: likes(Math.floor(r() * 40)), tags: r() < 0.3 ? ['serve'] : [] };
    posts.push(i % 3 === 0 ? video(`p${i}`, author, ago, extra) : post(`p${i}`, author, ago, extra));
  }
  const questions = Array.from({ length: 12 }, (_, i) => question(`q${i}`, `t${i % 7}`, Math.floor(r() * 10 * DAY)));
  const hits = Array.from({ length: 3 }, (_, i) => hit(`h${i}`, `s${i}`, Math.floor(r() * 20 * HOUR)));
  const users = [user(ME), ...Array.from({ length: authors }, (_, i) => user(`a${i}`)), ...Array.from({ length: 7 }, (_, i) => user(`t${i}`)), ...Array.from({ length: 3 }, (_, i) => user(`s${i}`))];
  return { posts, questions, hits, users };
}

// ---------------------------------------------------------------- checking

let failures = 0;
let checks = 0;
const ok = (cond, what) => {
  checks += 1;
  if (cond) { console.log(`  ok   ${what}`); return; }
  failures += 1;
  console.log(`  FAIL ${what}`);
};

const keyOf = (i) => (i.type === 'post' ? `p:${i.post.id}` : i.type === 'question' ? `q:${i.question.id}` : i.type === 'hit' ? `h:${i.story.id}` : i.type);
const authorOf = (i) => (i.type === 'post' ? i.post.authorId : i.type === 'question' ? i.question.authorId : i.type === 'hit' ? i.story.authorId : '');

/** The first pair of pages by one author closer than five slots, or null. */
function authorTooClose(items) {
  for (let i = 0; i < items.length; i += 1) {
    const a = authorOf(items[i]);
    if (!a) continue;
    for (let j = i + 1; j < Math.min(items.length, i + 5); j += 1) if (authorOf(items[j]) === a) return `${keyOf(items[i])} and ${keyOf(items[j])} by ${a}, ${j - i} apart`;
  }
  return null;
}

const { rankFeed, CAUGHT_UP } = await loadRanking();
const deal = (data, ctx = {}) => rankFeed(data.posts, data.questions ?? [], [], ME, data.hits ?? [], { users: data.users, now: NOW, ...ctx });
const keys = (items) => items.map(keyOf);

// 1. A plain post not seen yet beats a popular video already seen, whichever way it was seen.
console.log('1. Not seen beats seen');
{
  const data = {
    posts: [
      video('big', 'star', 2 * HOUR, { likedBy: likes(80), commentIds: likes(20), savedBy: likes(15), shares: 10 }),
      post('plain', 'nobody', 6 * DAY),
    ],
    users: [user(ME), user('star'), user('nobody')],
  };
  const ctxBase = { followingIds: ['star'] };
  const before = keys(deal(data, ctxBase));
  ok(before.indexOf('p:big') < before.indexOf('p:plain'), 'with neither seen, the popular video leads (the score still decides)');
  const ways = {
    'seen this visit': { seen: new Set(['p:big']) },
    'seen on this phone yesterday': { seenOnPhone: new Map([['p:big', NOW - DAY]]) },
    'seen on another phone (server, with its time)': { scores: { big: { viewers: 9, looks: 12, watchSeconds: 200, skips: 0, profileTaps: 4, seenByMe: true, mySeenAt: NOW - 2 * DAY } } },
    'seen on another phone (server, before migration 150: no time)': { scores: { big: { viewers: 9, looks: 12, watchSeconds: 200, skips: 0, profileTaps: 4, seenByMe: true } } },
  };
  for (const [how, extra] of Object.entries(ways)) {
    const order = keys(deal(data, { ...ctxBase, ...extra }));
    ok(order.indexOf('p:plain') < order.indexOf('p:big') && order.indexOf(CAUGHT_UP) > order.indexOf('p:plain') && order.indexOf(CAUGHT_UP) < order.indexOf('p:big'),
      `${how}: plain post, then "caught up", then the video (${order.join(' → ')})`);
  }
}

// 2 and 3. A bigger feed: half of it seen, in all three ways.
console.log('2. Seen posts come after "You\'re all caught up"; 3. no author twice within five pages');
{
  const data = bigFeed(48, 16, 7);
  const r = numbers(11);
  const seen = new Set();
  const seenOnPhone = new Map();
  const scores = {};
  for (const p of data.posts) {
    const roll = r();
    if (roll < 0.15) seen.add(`p:${p.id}`);
    else if (roll < 0.35) seenOnPhone.set(`p:${p.id}`, NOW - Math.floor(r() * 5 * DAY));
    else if (roll < 0.5) scores[p.id] = { viewers: 4, looks: 6, watchSeconds: 30, skips: 1, profileTaps: 0, seenByMe: true, mySeenAt: NOW - Math.floor(r() * 9 * DAY) };
    else if (roll < 0.6) scores[p.id] = { viewers: 6, looks: 9, watchSeconds: 90, skips: 0, profileTaps: 2, seenByMe: false };
  }
  const wasSeen = (p) => seen.has(`p:${p.id}`) || seenOnPhone.has(`p:${p.id}`) || !!scores[p.id]?.seenByMe;
  const items = deal(data, { seen, seenOnPhone, scores, followingIds: ['a1', 'a5'] });
  const order = keys(items);
  const line = order.indexOf(CAUGHT_UP);
  const seenCount = data.posts.filter(wasSeen).length;
  ok(line >= 0 && order.filter((k) => k === CAUGHT_UP).length === 1, `one "You're all caught up" page (at ${line} of ${order.length})`);
  const misplaced = data.posts.filter((p) => (order.indexOf(`p:${p.id}`) > line) !== wasSeen(p)).map((p) => p.id);
  ok(misplaced.length === 0, `all ${seenCount} seen posts below it, all ${data.posts.length - seenCount} others above it${misplaced.length ? ` (wrong side: ${misplaced.join(', ')})` : ''}`);
  ok(order.length === data.posts.length + data.questions.length + data.hits.length + 1, 'every post, thread and Instant dealt exactly once');
  const close = authorTooClose(items);
  ok(!close, `no author twice within five pages${close ? ` (${close})` : ''}`);
  const mixed = items.slice(0, line).filter((i, n) => (n + 1) % 4 === 0).every((i) => i.type === 'question' || i.type === 'hit');
  ok(mixed, 'a thread or an Instant in every fourth slot above the line');

  // 4. The same data, any order in, the same order out.
  console.log('4. Stable');
  const again = keys(deal(structuredClone(data), { seen: new Set(seen), seenOnPhone: new Map(seenOnPhone), scores: structuredClone(scores), followingIds: ['a1', 'a5'] }));
  ok(again.join() === order.join(), 'dealt twice from the same data: the same order');
  const shuffled = { ...data, posts: [...data.posts].reverse(), questions: [...data.questions].reverse(), hits: [...data.hits].reverse() };
  ok(keys(deal(shuffled, { seen, seenOnPhone, scores, followingIds: ['a1', 'a5'] })).join() === order.join(), 'the same posts handed over in another order: the same order');
}

// 5. Among what you have seen: longest ago first, this visit's last; threads not seen first.
console.log('5. Order among what you have seen');
{
  const data = {
    posts: [post('new', 'a', DAY), post('yesterday', 'b', 12 * DAY), post('lastweek', 'c', 12 * DAY), post('thisvisit', 'd', 12 * DAY), post('older', 'e', 13 * DAY)],
    questions: [question('qseen', 'f', HOUR), question('qnew', 'g', 9 * DAY)],
    users: ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((u) => user(u)).concat(user(ME)),
  };
  const order = keys(deal(data, {
    seen: new Set(['p:thisvisit']),
    seenOnPhone: new Map([['p:yesterday', NOW - DAY], ['p:lastweek', NOW - 7 * DAY], ['p:thisvisit', NOW - 60_000], ['q:qseen', NOW - HOUR]]),
    scores: { older: { viewers: 1, looks: 1, watchSeconds: 3, skips: 0, profileTaps: 0, seenByMe: true, mySeenAt: NOW - 10 * DAY } },
  }));
  const pos = (k) => order.indexOf(k);
  ok(pos('p:older') < pos('p:lastweek') && pos('p:lastweek') < pos('p:yesterday') && pos('p:yesterday') < pos('p:thisvisit'),
    `seen 10 days ago, a week ago, yesterday, then this visit (${order.join(' → ')})`);
  ok(pos('q:qnew') < pos('q:qseen'), 'a thread not seen comes before one seen, though the seen one is newer');
}

// 6. The line's place at the extremes.
console.log('6. Nothing seen, everything seen');
{
  const data = bigFeed(12, 12, 3);
  const none = keys(deal(data));
  ok(!none.slice(none.indexOf(CAUGHT_UP)).some((k) => k.startsWith('p:')), 'nothing seen: no post below "You\'re all caught up" (only threads that did not fit between the posts)');
  const postsOnly = keys(deal({ ...data, questions: [], hits: [] }));
  ok(postsOnly[postsOnly.length - 1] === CAUGHT_UP, 'nothing seen, posts only: "You\'re all caught up" is the last page');
  const all = new Map([...data.posts.map((p) => [`p:${p.id}`, NOW - DAY]), ...data.questions.map((q) => [`q:${q.id}`, NOW - DAY]), ...data.hits.map((h) => [`h:${h.id}`, NOW - DAY])]);
  const every = keys(deal(data, { seenOnPhone: all }));
  ok(every[0] === CAUGHT_UP, 'everything seen: "You\'re all caught up" is the first page, everything after it');
  ok(keys(rankFeed([], [], [], ME, [], { now: NOW })).length === 0, 'no posts at all: nothing (the "quiet" page shows instead)');
}

// 7. Two visits: look at the first ten pages, come back, and the next visit opens on others.
console.log('7. Two visits');
{
  const data = bigFeed(30, 15, 5);
  const first = deal(data);
  const looked = first.slice(0, 10).filter((i) => i.type === 'post' || i.type === 'question' || i.type === 'hit').map(keyOf);
  const phone = new Map(looked.map((k, n) => [k, NOW - 3 * HOUR + n * 60_000]));
  const second = keys(deal(data, { seenOnPhone: phone, now: NOW + 2 * HOUR }));
  const line = second.indexOf(CAUGHT_UP);
  const repeatsAbove = second.slice(0, line).filter((k) => looked.includes(k));
  ok(repeatsAbove.length === 0, `none of the ${looked.length} pages looked at comes before "caught up" on the next visit`);
  ok(!looked.includes(second[0]), `the next visit opens on something new (${second[0]})`);
}

console.log(failures ? `\nRANK CHECK FAILED: ${failures} of ${checks} checks` : `\nRank check passed: ${checks} checks`);
process.exitCode = failures ? 1 : 0;
