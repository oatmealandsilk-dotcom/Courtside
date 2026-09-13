#!/usr/bin/env node
/**
 * Pulls the latest threads from Talk Tennis (RSS) and Reddit (official API)
 * and writes them to public/community.json, which the web build serves next
 * to the app. A GitHub Action runs this every few hours; the app reads the
 * file at launch so the Discussions board is never empty.
 *
 * Reddit only answers registered apps. Set REDDIT_CLIENT_ID and
 * REDDIT_CLIENT_SECRET (a "script" app from reddit.com/prefs/apps) and it is
 * included; leave them unset and Reddit is skipped without failing.
 */
import { writeFile, mkdir } from 'node:fs/promises';

const OUT = new URL('../public/community.json', import.meta.url);
const UA = 'web:courtside-app:0.1 (community board importer)';
const TW_RSS = 'https://tt.tennis-warehouse.com/index.php?forums/-/index.rss';
const SUBREDDITS = ['10s', 'tennis'];

const clean = (text = '') =>
  text
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ')
    .trim();

async function talkTennis() {
  const res = await fetch(TW_RSS, { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(`Talk Tennis ${res.status}`);
  const xml = await res.text();
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  const field = (item, tag) =>
    item.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`))?.[1] ?? '';
  return items.slice(0, 30).map((item) => {
    const url = field(item, 'link').trim();
    const id = url.match(/\.(\d+)\/?$/)?.[1] ?? url.replace(/\W+/g, '').slice(-16);
    return {
      id: `q-tw-${id}`,
      source: 'tennis-warehouse',
      label: 'Talk Tennis',
      title: clean(field(item, 'title')).slice(0, 180),
      body: clean(field(item, 'description') || field(item, 'content:encoded')).slice(0, 600),
      url,
      author: clean(field(item, 'dc:creator') || field(item, 'author')) || 'Talk Tennis member',
      createdAt: new Date(field(item, 'pubDate') || Date.now()).toISOString(),
      votes: 0,
      replies: Number(field(item, 'slash:comments')) || 0,
    };
  }).filter((t) => t.title);
}

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

const results = await Promise.allSettled([talkTennis(), reddit()]);
const threads = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
for (const r of results) if (r.status === 'rejected') console.warn('Skipped a source:', r.reason?.message ?? r.reason);
if (!threads.length) {
  console.error('No threads fetched from any source; leaving the existing file alone.');
  process.exit(0);
}
await mkdir(new URL('../public/', import.meta.url), { recursive: true });
await writeFile(OUT, JSON.stringify({ fetchedAt: new Date().toISOString(), threads }, null, 2) + '\n');
console.log(`Wrote ${threads.length} threads to public/community.json`);
