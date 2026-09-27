/**
 * share.courtsidebase.com: link previews for CourtSide.
 *
 * When a CourtSide link is pasted into iMessage, WhatsApp, Instagram DMs,
 * Slack or X, those apps fetch the link to draw a preview. The app itself is
 * one static page for every address, so on its own every preview is the same
 * generic card. This small program runs on Cloudflare in front of the share
 * links: for a preview-fetching robot it answers with that post's picture,
 * caption and author; for a person it goes straight on to the post in the app.
 *
 * It reads only what a signed-out visitor could see (the publishable key
 * below is public by design; it is inside the web app too), so private
 * accounts and removed posts get the generic card.
 *
 * Free on Cloudflare's free plan (100,000 requests a day).
 * Setup: cloudflare/README.md.
 */
const APP = 'https://app.courtsidebase.com';
const SUPABASE = 'https://cgitvbnvchmofqkhtlml.supabase.co';
const KEY = 'sb_publishable_8PesptF4vNXClY9w2cit-A_LiSY4Zjj';
const FALLBACK = {
  title: 'CourtSide',
  description: 'The social app for tennis: post your clips, ask the community, find people to hit with, and get coaching.',
  image: `${APP}/waitlist/og.png`,
  large: true,
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// The robots that draw link previews. A person is sent straight to the app.
const ROBOT = /bot\b|bot\/|crawler|spider|facebookexternalhit|facebot|twitterbot|slackbot|discordbot|whatsapp|telegram|linkedin|embedly|pinterest|skypeuripreview|redditbot|applebot|snapchat|vkshare|iframely|mastodon|bluesky|preview|metainspector|google-inspectiontool/i;

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/(post|user|question)\/([^/]+)\/?$/);
    if (!match) return Response.redirect(`${APP}${url.pathname}${url.search}`, 302);
    const [, kind, id] = match;
    const target = `${APP}/${kind}/${encodeURIComponent(id)}`;
    const agent = request.headers.get('user-agent') || '';
    if (agent && !ROBOT.test(agent)) return Response.redirect(target, 302);
    let card = FALLBACK;
    try { card = (await describe(kind, id)) || FALLBACK; } catch { /* the generic card */ }
    return new Response(page(card, target), {
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300' },
    });
  },
};

async function read(path) {
  const response = await fetch(`${SUPABASE}/rest/v1/${path}`, { headers: { apikey: KEY, accept: 'application/json' } });
  if (!response.ok) return null;
  const rows = await response.json();
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

const clip = (text, n) => {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;
};

async function describe(kind, id) {
  if (!UUID.test(id)) return null;
  if (kind === 'post') {
    const post = await read(`posts?id=eq.${id}&select=kind,body,image_url,thumbnail_url,author:profiles!posts_author_id_fkey(name,handle)`);
    if (!post) return null;
    const who = post.author?.name || (post.author?.handle ? `@${post.author.handle}` : 'A player');
    const what = post.kind === 'clip' ? 'a clip' : post.image_url ? 'a photo' : 'a post';
    return {
      title: `${who} on CourtSide`,
      description: clip(post.body, 200) || `See ${what} from ${who} on CourtSide.`,
      image: post.thumbnail_url || post.image_url || FALLBACK.image,
      large: true,
    };
  }
  if (kind === 'user') {
    const person = await read(`profiles?id=eq.${id}&select=name,handle,bio,location,avatar_url`);
    if (!person) return null;
    return {
      title: `${person.name || 'A player'} (@${person.handle}) on CourtSide`,
      description: clip(person.bio, 200) || [person.location, 'Tennis on CourtSide'].filter(Boolean).join(' · '),
      image: person.avatar_url || FALLBACK.image,
      large: !person.avatar_url,
    };
  }
  const thread = await read(`questions?id=eq.${id}&select=title,body`);
  if (!thread) return null;
  return {
    title: clip(thread.title, 110) || 'A question on CourtSide',
    description: clip(thread.body, 200) || 'Answers from the CourtSide community.',
    image: FALLBACK.image,
    large: true,
  };
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function page(card, target) {
  const t = esc(card.title);
  const d = esc(card.description);
  const u = esc(target);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${t}</title>
<meta name="description" content="${d}">
<meta property="og:site_name" content="CourtSide">
<meta property="og:type" content="website">
<meta property="og:title" content="${t}">
<meta property="og:description" content="${d}">
<meta property="og:image" content="${esc(card.image)}">
<meta property="og:url" content="${u}">
<meta name="twitter:card" content="${card.large ? 'summary_large_image' : 'summary'}">
<meta name="twitter:title" content="${t}">
<meta name="twitter:description" content="${d}">
<meta name="twitter:image" content="${esc(card.image)}">
<link rel="canonical" href="${u}">
<meta http-equiv="refresh" content="0;url=${u}">
</head><body><p><a href="${u}">Open on CourtSide</a></p><script>location.replace(${JSON.stringify(target)})</script></body></html>`;
}
