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
  const text = `${hey}, thanks for joining. You're #${place} on the list.

CourtSide is the tennis app I'm building: post your clips, find players at your level nearby, and ask real coaches. Here's how far it has come, day 1 on the left and today on the right: ${HERO}

The iPhone beta opens soon, and you'll get the link before anyone else.

Want in sooner? Every friend who joins through your link moves you up the list:
${link}

One question while you're here: who's really the GOAT of the Big 3? Mine's Federer, but I don't judge. Just hit reply. I read every one.

Robert
Founder, CourtSide`;
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
${p(`${esc(hey)}, thanks for joining. You&rsquo;re <b style="color:#24251F">#${place}</b> on the list.`)}
${p('CourtSide is the tennis app I&rsquo;m building: post your clips, find players at your level nearby, and ask real coaches. Here&rsquo;s how far it has come, day 1 on the left and today on the right:')}
<p style="margin:4px 0 22px"><img src="${HERO}" width="504" alt="CourtSide on day 1 and today" style="display:block;width:100%;max-width:504px;height:auto;border:0"></p>
${p('The iPhone beta opens soon, and you&rsquo;ll get the link before anyone else.')}
${p('Want in sooner? Every friend who joins through your link moves you up the list:')}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:2px 0 10px"><tr><td style="border-radius:999px;background:#3F7049">
<a href="${link}" style="display:inline-block;padding:14px 26px;font-family:${FONT};font-size:15px;font-weight:600;color:#FAF8F0;text-decoration:none;border-radius:999px">Share your link</a>
</td></tr></table>
<p style="margin:0 0 26px;font-size:13px;color:#6C665A"><a href="${link}" style="color:#3F7049">${link.replace('https://', '')}</a></p>
${p('One question while you&rsquo;re here: who&rsquo;s really the GOAT of the Big 3? Mine&rsquo;s Federer, but I don&rsquo;t judge. Just hit reply. I read every one.')}
<p style="margin:26px 0 0;font-size:16px;line-height:1.5;color:#24251F">Robert<br><span style="font-size:14px;color:#6C665A">Founder, CourtSide</span></p>
</td></tr>
<tr><td style="padding:36px 28px 40px;font-family:${FONT};font-size:12px;line-height:1.6;color:#8A8577">You&rsquo;re getting this because you joined the CourtSide waitlist at courtsidebase.com.</td></tr>
</table></td></tr></table>
</body></html>`;
  return { text, html };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'post only' }, 405);
  const body = await req.json().catch(() => ({})) as { email?: string };
  const email = String(body.email ?? '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254) return json({ sent: false });
  if (!RESEND) return json({ sent: false, reason: 'not set up' });

  // Claim the send first, so two calls in the same second cannot both send.
  // Only someone who joined in the last few minutes is welcomed: this is
  // the page's own follow-up to a sign-up, never a way to mail an old or
  // made-up row on demand.
  const recent = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: row } = await admin.from('waitlist').update({ welcomed_at: new Date().toISOString() })
    .eq('email', email).is('welcomed_at', null).gt('created_at', recent).select('id, name').maybeSingle();
  if (!row) return json({ sent: false });

  // Their place and code, the same way the page shows them.
  const { data: spot } = await admin.rpc('join_waitlist', { p_email: email });
  const s = Array.isArray(spot) ? spot[0] : spot;
  const place = Number(s?.place ?? 0) || 1;
  const link = `${SHARE_BASE}?r=${s?.code ?? String(row.id).replace(/-/g, '').slice(0, 8)}`;
  // A first name is letters only: nobody can put a link or markup into the greeting.
  const first = row.name ? (String(row.name).trim().split(/\s+/)[0].replace(/[^\p{L}'-]/gu, '').slice(0, 30) || null) : null;
  const { text, html } = letter(first, place, link);

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${RESEND}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: [email], subject: `you're #${place} on CourtSide`, text, html, ...(REPLY_TO ? { reply_to: REPLY_TO } : {}) }),
  });
  if (!res.ok) {
    // Give the send back, so a fixed key or domain can try again for this person.
    await admin.from('waitlist').update({ welcomed_at: null }).eq('id', row.id);
    return json({ sent: false, reason: `resend ${res.status}` }, 502);
  }
  return json({ sent: true });
});
