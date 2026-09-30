// CourtSide — the waitlist welcome email, sent the moment someone joins.
//
// The waitlist page calls this right after a successful join with just the
// email address. The function only ever writes to someone who is actually on
// the list and has not been welcomed yet, so it cannot be used to email
// strangers or to send anyone the same note twice.
//
// Deploy:   supabase functions deploy waitlist-welcome --no-verify-jwt
// Secrets:  RESEND_API_KEY            (required — nothing sends without it)
//           WAITLIST_FROM             (optional, default "Robert at CourtSide <robert@courtsidebase.com>";
//                                      must be on a domain verified in Resend)
//           WAITLIST_REPLY_TO         (optional — the inbox replies should reach)
//           WAITLIST_BACKFILL_TOKEN   (optional — set only while catching up on people
//                                      who joined before the email existed; unset it after)
//
// Catch-up: POST {"backfill": true, "token": "<WAITLIST_BACKFILL_TOKEN>", "dry": true}
// counts who is still waiting for a welcome; without "dry" it welcomes up to
// "limit" of them (oldest first, at most 80 a call to stay inside the daily
// sending allowance) and says how many are left.
import { createClient } from 'npm:@supabase/supabase-js@2';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const RESEND = Deno.env.get('RESEND_API_KEY') ?? '';
const FROM = Deno.env.get('WAITLIST_FROM') ?? 'Robert at CourtSide <robert@courtsidebase.com>';
const REPLY_TO = Deno.env.get('WAITLIST_REPLY_TO') ?? '';
const HERO = 'https://app.courtsidebase.com/waitlist/email-hero.png';
const HEADER = 'https://app.courtsidebase.com/email/header.png';
const FONT = "Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const SHARE_BASE = 'https://courtsidebase.com/';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

function letter(first: string | null, place: number, link: string) {
  const hey = first ? `Hey ${first}` : 'Hey';
  const text = `${hey},

You're #${place} on the list. Since you joined, I'll just assume you're interested haha.

Beta testing is well on its way and will launch very soon. You'll get the link based on your spot on the waitlist.

Day 1 vs. today: ${HERO}

If you want in sooner, share your link. Everyone who joins with it pushes you up the list:
${link}

Also, who's your GOAT? Reply and tell me, I'm curious.

Robert`;
  // A personal note in the app's own look: the cream page, the warm glow and
  // the name across the top, the words straight on the page, one picture, one link.
  const p = (inner: string) => `<p style="margin:0 0 18px;font-size:16px;line-height:1.6;color:#3A3A33">${inner}</p>`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light only">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet"></head>
<body style="margin:0;padding:0;background:#F8F7F2">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F8F7F2"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td><img src="${HEADER}" width="560" alt="CourtSide" style="display:block;width:100%;max-width:560px;height:auto;border:0"></td></tr>
<tr><td style="padding:8px 28px 8px;font-family:${FONT}">
${p(`${esc(hey)},`)}
${p(`You&rsquo;re <b style="color:#24251F">#${place}</b> on the list. Since you joined, I&rsquo;ll just assume you&rsquo;re interested haha.`)}
${p('Beta testing is well on its way and will launch very soon. You&rsquo;ll get the link based on your spot on the waitlist.')}
<p style="margin:4px 0 22px"><img src="${HERO}" width="504" alt="CourtSide on day 1 and today" style="display:block;width:100%;max-width:504px;height:auto;border:0"></p>
${p('If you want in sooner, share your link. Everyone who joins with it pushes you up the list:')}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:2px 0 10px"><tr><td style="border-radius:999px;background:#3F7049">
<a href="${link}" style="display:inline-block;padding:14px 26px;font-family:${FONT};font-size:15px;font-weight:600;color:#FAF8F0;text-decoration:none;border-radius:999px">Share your link</a>
</td></tr></table>
<p style="margin:0 0 26px;font-size:13px;color:#6C665A"><a href="${link}" style="color:#3F7049">${link.replace('https://', '')}</a></p>
${p('Also, who&rsquo;s your GOAT? Reply and tell me, I&rsquo;m curious.')}
<p style="margin:26px 0 0;font-size:16px;line-height:1.5;color:#24251F">Robert</p>
</td></tr>
<tr><td style="padding:36px 28px 40px;font-family:${FONT};font-size:12px;line-height:1.6;color:#8A8577">You&rsquo;re getting this because you joined the CourtSide waitlist at courtsidebase.com.</td></tr>
</table></td></tr></table>
</body></html>`;
  return { text, html };
}

/** Welcomes one claimed row; gives the claim back if the send fails. */
async function welcome(row: { id: string; email: string; name: string | null }) {
  // Their place and code, the same way the page shows them.
  const { data: spot } = await admin.rpc('join_waitlist', { p_email: row.email });
  const s = Array.isArray(spot) ? spot[0] : spot;
  const place = Number(s?.place ?? 0) || 1;
  const link = `${SHARE_BASE}?r=${s?.code ?? String(row.id).replace(/-/g, '').slice(0, 8)}`;
  // A first name is letters only: nobody can put a link or markup into the greeting.
  const first = row.name ? (String(row.name).trim().split(/\s+/)[0].replace(/[^\p{L}'-]/gu, '').slice(0, 30) || null) : null;
  const { text, html } = letter(first, place, link);

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${RESEND}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: [row.email], subject: `you're #${place} on CourtSide`, text, html, ...(REPLY_TO ? { reply_to: REPLY_TO } : {}) }),
  });
  if (!res.ok) {
    // Give the send back, so a fixed key or domain can try again for this person.
    await admin.from('waitlist').update({ welcomed_at: null }).eq('id', row.id);
    return `resend ${res.status}`;
  }
  return null;
}

/** Everyone who joined before the email existed, a batch at a time. */
async function backfill(body: { token?: string; dry?: boolean; limit?: number }) {
  const token = Deno.env.get('WAITLIST_BACKFILL_TOKEN') ?? '';
  if (!token || body.token !== token) return json({ error: 'not allowed' }, 403);
  const waiting = async () => (await admin.from('waitlist').select('id', { count: 'exact', head: true }).is('welcomed_at', null)).count ?? 0;
  if (body.dry) return json({ waiting: await waiting() });

  const limit = Math.max(1, Math.min(80, Number(body.limit) || 20));
  const { data: rows } = await admin.from('waitlist').select('id').is('welcomed_at', null).order('created_at').limit(limit);
  let sent = 0;
  const failed: string[] = [];
  for (const { id } of rows ?? []) {
    // The same claim as a live sign-up, so nobody is ever sent two.
    const { data: row } = await admin.from('waitlist').update({ welcomed_at: new Date().toISOString() })
      .eq('id', id).is('welcomed_at', null).select('id, email, name').maybeSingle();
    if (!row) continue;
    const problem = await welcome(row);
    if (problem) { failed.push(problem); if (problem === 'resend 429') break; } else sent++;
    await new Promise((r) => setTimeout(r, 600)); // Resend takes two a second
  }
  return json({ sent, failed, waiting: await waiting() });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'post only' }, 405);
  const body = await req.json().catch(() => ({})) as { email?: string; backfill?: boolean; token?: string; dry?: boolean; limit?: number };
  if (!RESEND) return json({ sent: false, reason: 'not set up' });
  if (body.backfill) return backfill(body);
  const email = String(body.email ?? '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254) return json({ sent: false });

  // Claim the send first, so two calls in the same second cannot both send.
  // Only someone who joined in the last few minutes is welcomed: this is
  // the page's own follow-up to a sign-up, never a way to mail an old or
  // made-up row on demand.
  const recent = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: row } = await admin.from('waitlist').update({ welcomed_at: new Date().toISOString() })
    .eq('email', email).is('welcomed_at', null).gt('created_at', recent).select('id, email, name').maybeSingle();
  if (!row) return json({ sent: false });

  const problem = await welcome(row);
  return problem ? json({ sent: false, reason: problem }, 502) : json({ sent: true });
});
