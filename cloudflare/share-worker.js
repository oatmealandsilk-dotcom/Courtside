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
 * It asks the same question the app's own shared-link page asks
 * (share_preview, migration 68), with the publishable key below (public by
 * design; it is inside the web app too). So only a public adult's things get
 * a card; private accounts, teens and removed posts get the generic one.
 * (Since migration 109 nothing about people can be read signed out except
 * through share_preview.)
 *
 * Free on Cloudflare's free plan (100,000 requests a day).
 * Setup: cloudflare/README.md.
 */
const APP = 'https://app.courtsidebase.com';
const SUPABASE = 'https://auth.courtsidebase.com';
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
    // The sharer's handle rides along, so whoever joins through the link is counted as theirs.
    const ref = url.searchParams.get('ref') || '';
    const target = `${APP}/${kind}/${encodeURIComponent(id)}${/^[a-z0-9_]{2,24}$/i.test(ref) ? `?ref=${ref.toLowerCase()}` : ''}`;
    const agent = request.headers.get('user-agent') || '';
    if (agent && !ROBOT.test(agent)) return Response.redirect(target, 302);
    let card = FALLBACK;
    try { card = (await describe(kind, id)) || FALLBACK; } catch { /* the generic card */ }
    return new Response(page(card, target), {
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300' },
    });
  },
};

// What a stranger may see of one post, profile or question: null when locked.
async function preview(kind, id) {
  const response = await fetch(`${SUPABASE}/rest/v1/rpc/share_preview`, {
    method: 'POST',
    headers: { apikey: KEY, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ p_kind: kind, p_id: id }),
  });
  if (!response.ok) return null;
  const data = await response.json();
  return data && typeof data === 'object' && data.open === true ? data : null;
}

const clip = (text, n) => {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;
};

async function describe(kind, id) {
  if (!UUID.test(id)) return null;
  if (kind === 'post') {
    const got = await preview('post', id);
    const post = got && got.post;
    if (!post) return null;
    const author = got.author || {};
    const who = author.name || (author.handle ? `@${author.handle}` : 'A player');
    const what = post.kind === 'clip' ? 'a clip' : post.imageUrl ? 'a photo' : 'a post';
    return {
      title: `${who} on CourtSide`,
      description: clip(post.body, 200) || `See ${what} from ${who} on CourtSide.`,
      image: post.thumbnailUrl || post.imageUrl || FALLBACK.image,
      large: true,
    };
  }
  if (kind === 'user') {
    const got = await preview('profile', id);
    const person = got && got.author;
    if (!person) return null;
    return {
      title: `${person.name || 'A player'} (@${person.handle}) on CourtSide`,
      description: clip(got.profile && got.profile.bio, 200) || [person.location, 'Tennis on CourtSide'].filter(Boolean).join(' · '),
      image: person.avatarUrl || FALLBACK.image,
      large: !person.avatarUrl,
    };
  }
  const got = await preview('question', id);
  const thread = got && got.question;
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
