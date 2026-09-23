#!/usr/bin/env node
/**
 * Pulls the latest threads from Reddit (official API) and writes them to
 * public/community.json, which the web build serves next to the app. A GitHub
 * Action runs this every few hours; the app reads the file at launch.
 *
 * Reddit only answers registered apps. Set REDDIT_CLIENT_ID and
 * REDDIT_CLIENT_SECRET (a "script" app from reddit.com/prefs/apps) and it is
 * included; leave them unset and Reddit is skipped without failing.
 *
 * Talk Tennis is no longer carried in. When nothing new arrives, the file
 * keeps only the sources still carried, so old Talk Tennis threads come off
 * the site instead of lingering in it.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const OUT = new URL('../public/community.json', import.meta.url);
const UA = 'web:courtside-app:0.1 (community board importer)';
const SUBREDDITS = ['10s', 'tennis'];

const clean = (text = '') =>
  text
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ')
    .trim();

async function reddit() {
  const id = process.env.REDDIT_CLIENT_ID;
  const secret = process.env.REDDIT_CLIENT_SECRET;
  if (!id || !secret) {
    console.log('Reddit skipped: REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET not set');
    return [];
  }
  const auth = Buffer.from(`${id}:${secret}`).toString('base64');
  const tokenRes = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: { authorization: `Basic ${auth}`, 'user-agent': UA, 'content-type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  if (!tokenRes.ok) throw new Error(`Reddit token ${tokenRes.status}`);
  const { access_token: token } = await tokenRes.json();
  const lists = await Promise.all(
    SUBREDDITS.map(async (sub) => {
      const res = await fetch(`https://oauth.reddit.com/r/${sub}/hot?limit=25&raw_json=1`, {
        headers: { authorization: `Bearer ${token}`, 'user-agent': UA },
      });
      if (!res.ok) throw new Error(`Reddit r/${sub} ${res.status}`);
      const json = await res.json();
      return json.data.children.map((c) => ({ sub, ...c.data }));
    }),
  );
  return lists.flat()
    .filter((p) => !p.stickied && !p.over_18 && p.title)
    .map((p) => ({
      id: `q-reddit-${p.id}`,
      source: 'reddit',
      label: `r/${p.sub}`,
      title: clean(p.title).slice(0, 180),
      body: clean(p.selftext ?? '').slice(0, 600),
      url: `https://www.reddit.com${p.permalink}`,
      author: `u/${p.author}`,
      createdAt: new Date(p.created_utc * 1000).toISOString(),
      votes: p.score,
      replies: p.num_comments,
    }));
}

const CARRIED = new Set(['reddit']);
const results = await Promise.allSettled([reddit()]);
let threads = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
for (const r of results) if (r.status === 'rejected') console.warn('Skipped a source:', r.reason?.message ?? r.reason);
if (!threads.length) {
  // Nothing new: keep what the file already holds from sources still carried,
  // and drop the rest (the Talk Tennis threads from before).
  const previous = await readFile(OUT, 'utf8').then(JSON.parse).catch(() => ({ threads: [] }));
  const kept = (previous.threads ?? []).filter((t) => CARRIED.has(t.source));
  if (kept.length === (previous.threads ?? []).length) {
    console.log('No new threads and nothing to drop; leaving the file alone.');
    process.exit(0);
  }
  threads = kept;
}
await mkdir(new URL('../public/', import.meta.url), { recursive: true });
await writeFile(OUT, JSON.stringify({ fetchedAt: new Date().toISOString(), threads }, null, 2) + '\n');
console.log(`Wrote ${threads.length} threads to public/community.json`);
