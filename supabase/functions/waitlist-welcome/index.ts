// CourtSide — the waitlist welcome email, sent the moment someone joins.
//
// The waitlist page calls this right after a successful join with just the
// email address. The function only ever writes to someone who is actually on
// the list and has not been welcomed yet, so it cannot be used to email
// strangers or to send anyone the same note twice.
//
// Deploy:   supabase functions deploy waitlist-welcome --no-verify-jwt
// Secrets:  RESEND_API_KEY            (required — nothing sends without it)
//           WAITLIST_FROM             (optional, default "William at CourtSide <william@courtsidebase.com>";
//                                      must be on a domain verified in Resend)
//           WAITLIST_REPLY_TO         (optional — the inbox replies should reach)
import { createClient } from 'npm:@supabase/supabase-js@2';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const RESEND = Deno.env.get('RESEND_API_KEY') ?? '';
const FROM = Deno.env.get('WAITLIST_FROM') ?? 'William at CourtSide <william@courtsidebase.com>';
const REPLY_TO = Deno.env.get('WAITLIST_REPLY_TO') ?? '';
const HERO = 'https://app.courtsidebase.com/waitlist/email-hero.png';
const SHARE_BASE = 'https://courtsidebase.com/';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

function letter(first: string | null, place: number, link: string) {
  const hey = first ? `Hey ${first}` : 'Hey';
  const text = `${hey} — thanks for joining. You're #${place}.

CourtSide is a tennis app I'm building: post your clips, find players at your level nearby, ask real coaches. Here's where it is today: day 1 on the left, now on the right — ${HERO}

The iPhone beta opens soon, and you'll get the link before anyone else.

Want in sooner? Every friend who joins through your link moves you up:
${link}

One question: what's your level, and where do you play? Just hit reply. I read every one.

— William
CourtSide`;
  // Written like a personal note, not a newsletter: plain type, one picture, one link.
  const html = `<!doctype html><html><body style="margin:0;background:#ffffff">
<div style="max-width:560px;margin:0 auto;padding:28px 22px;font:16px/1.55 -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1f241f">
<p style="margin:0 0 16px">${esc(hey)} — thanks for joining. You're <b>#${place}</b>.</p>
<p style="margin:0 0 16px">CourtSide is a tennis app I'm building: post your clips, find players at your level nearby, ask real coaches. Here's where it is today — day 1 on the left, now on the right:</p>
<p style="margin:0 0 20px"><img src="${HERO}" width="516" alt="CourtSide on day 1 and today" style="display:block;width:100%;max-width:516px;height:auto;border-radius:14px;border:1px solid #e6e2d8"></p>
<p style="margin:0 0 16px">The iPhone beta opens soon, and you'll get the link before anyone else.</p>
<p style="margin:0 0 16px">Want in sooner? Every friend who joins through your link moves you up:<br><a href="${link}" style="color:#3f7049">${link.replace('https://', '')}</a></p>
<p style="margin:0 0 16px">One question: what's your level, and where do you play? Just hit reply. I read every one.</p>
<p style="margin:0">— William<br><span style="color:#6b6f66">CourtSide</span></p>
</div></body></html>`;
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
  const { data: row } = await admin.from('waitlist').update({ welcomed_at: new Date().toISOString() })
    .eq('email', email).is('welcomed_at', null).select('id, name').maybeSingle();
  if (!row) return json({ sent: false });

  // Their place and code, the same way the page shows them.
  const { data: spot } = await admin.rpc('join_waitlist', { p_email: email });
  const s = Array.isArray(spot) ? spot[0] : spot;
  const place = Number(s?.place ?? 0) || 1;
  const link = `${SHARE_BASE}?r=${s?.code ?? String(row.id).replace(/-/g, '').slice(0, 8)}`;
  const first = row.name ? String(row.name).trim().split(/\s+/)[0].slice(0, 30) : null;
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
