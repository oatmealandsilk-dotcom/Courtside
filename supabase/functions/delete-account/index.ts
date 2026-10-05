// Deletes the signed-in account, for good — the rows and the files.
//
// Only the service role may delete an auth user, so this runs server-side.
// It checks the caller's own token first, so nobody can delete anyone else.
// Profile, posts, follows and the rest go with it through ON DELETE CASCADE.
//
// Files do not cascade, so they are cleared first: everything the person
// uploaded lives in a folder named after their account id, in `media` (their
// photos and videos) and in `coach-applications` (a résumé, if they applied).
// Photos sent in chats sit in each chat's own folder on the private
// `chat-photos` shelf ("<chat>/<them>/<name>.jpg", migration 61), so those
// are found by name across every chat, the ones they left included.
// Left behind, those files stay openable by anyone holding an old link and
// keep using the project's storage — which is neither what "delete" means to
// the person nor what privacy law and Apple expect of it.
//
// A connected WHOOP is disconnected first, through the whoop function, so
// WHOOP revokes CourtSide's access and stops sending its webhooks.
//
// An account made with Sign in with Apple: the app sends a fresh one-time
// code from Apple's sheet ({"appleCode": "..."}), which is swapped here for
// Apple's token and revoked, so CourtSide also leaves the person's Apple ID
// settings (Apple's guidance for deleting accounts). Best effort, like WHOOP:
// without the code, or before the secrets below are set, or if Apple does not
// answer within 5 seconds, the account is still deleted. Secrets (Supabase →
// Edge Functions → Secrets): APPLE_TEAM_ID, APPLE_KEY_ID and APPLE_PRIVATE_KEY
// (the whole text of the .p8 key file made under Apple Developer → Keys with
// "Sign in with Apple" ticked); APPLE_CLIENT_ID only if the app's bundle id
// ever stops being co.courtside.app.
//
// Deploy:  supabase functions deploy delete-account
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PAGE = 100;
/** No account holds this many files; the cap is only so a surprise cannot loop forever. */
const MAX_PAGES = 200;

/** How deep sub-folders are followed: the app never makes any, so this only bounds a surprise. */
const MAX_DEPTH = 4;

/**
 * Everything in one person's folder in one bucket, sub-folders included (the
 * app never makes any, but the storage rules allowed them, so a file tucked
 * into one would otherwise outlive the account). Returns how many files went.
 */
async function emptyFolder(admin: SupabaseClient, bucket: string, folder: string, depth = 0): Promise<number> {
  let removed = 0;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const { data, error } = await admin.storage.from(bucket).list(folder, { limit: PAGE });
    if (error) {
      console.error('[delete-account] list', bucket, error);
      return removed;
    }
    if (!data || data.length === 0) return removed;
    // A listing names sub-folders too (they have no id): emptied first, they then drop out of the listing.
    const subfolders = data.filter((entry) => entry.id == null);
    const files = data.filter((entry) => entry.id != null);
    for (const sub of subfolders) {
      if (depth < MAX_DEPTH) removed += await emptyFolder(admin, bucket, `${folder}/${sub.name}`, depth + 1);
    }
    if (files.length) {
      const { error: gone } = await admin.storage.from(bucket).remove(files.map((file) => `${folder}/${file.name}`));
      if (gone) {
        console.error('[delete-account] remove', bucket, gone);
        return removed;
      }
      removed += files.length;
    }
    if (data.length < PAGE) return removed;
    // A full page of sub-folders that could not be emptied would list the same way forever.
    if (!files.length && depth >= MAX_DEPTH) return removed;
  }
  return removed;
}

/**
 * Every photo one person sent in any chat, taken off the private chat shelf.
 * The database lists them (chat_photo_names_of, migration 61: only the
 * service role may ask); before that migration there are none, and the
 * missing function is simply passed over. Returns how many files went.
 */
async function removeChatPhotos(admin: SupabaseClient, me: string): Promise<number> {
  let removed = 0;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    // Always the first names: each round removes what it listed.
    const { data, error } = await admin.rpc('chat_photo_names_of', { who: me, max: PAGE });
    if (error) {
      if (!/chat_photo_names_of/.test(error.message ?? '')) console.error('[delete-account] chat photos list', error);
      return removed;
    }
    const names = ((data ?? []) as unknown[]).filter((n): n is string => typeof n === 'string');
    if (!names.length) return removed;
    const { data: went, error: gone } = await admin.storage.from('chat-photos').remove(names);
    if (gone) {
      console.error('[delete-account] remove chat photos', gone);
      return removed;
    }
    // Nothing went this round: asking again would list the same names forever.
    if (!went?.length) return removed;
    removed += went.length;
    if (names.length < PAGE) return removed;
  }
  return removed;
}

/* ------------------------------------------------------- Sign in with Apple */

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64urlText = (text: string) => b64url(new TextEncoder().encode(text));

/**
 * The short signed pass Apple asks for in place of a password (its "client
 * secret"): a JWT signed with the .p8 key, good for five minutes. Web Crypto's
 * ECDSA signature is already the 64-byte form a JWT wants.
 */
async function appleClientSecret(teamId: string, keyId: string, p8: string, clientId: string): Promise<string> {
  const body = p8.replace(/\\n/g, '\n').replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64urlText(JSON.stringify({ alg: 'ES256', kid: keyId }))}.${b64urlText(JSON.stringify({ iss: teamId, iat: now, exp: now + 300, aud: 'https://appleid.apple.com', sub: clientId }))}`;
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(unsigned)));
  return `${unsigned}.${b64url(signature)}`;
}

/** A form POST to Apple, given up on after 5 seconds. */
async function toApple(path: string, form: Record<string, string>): Promise<Response> {
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), 5000);
  try {
    return await fetch(`https://appleid.apple.com/auth/${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form).toString(),
      signal: stop.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Swaps the app's one-time code for Apple's token and revokes it. Says what
 * happened, for the log; never throws, never stops the deletion.
 */
async function revokeApple(code: string): Promise<'revoked' | 'not set up' | 'failed'> {
  const teamId = Deno.env.get('APPLE_TEAM_ID');
  const keyId = Deno.env.get('APPLE_KEY_ID');
  const p8 = Deno.env.get('APPLE_PRIVATE_KEY');
  const clientId = Deno.env.get('APPLE_CLIENT_ID') || 'co.courtside.app';
  if (!teamId || !keyId || !p8) return 'not set up';
  try {
    const secret = await appleClientSecret(teamId, keyId, p8, clientId);
    const swapped = await toApple('token', { client_id: clientId, client_secret: secret, code, grant_type: 'authorization_code' });
    const got = await swapped.json().catch(() => ({})) as { refresh_token?: string; access_token?: string; error?: string };
    const token = got.refresh_token ?? got.access_token;
    if (!swapped.ok || !token) { console.error('[delete-account] apple token', swapped.status, got.error); return 'failed'; }
    const revoked = await toApple('revoke', { client_id: clientId, client_secret: secret, token, token_type_hint: got.refresh_token ? 'refresh_token' : 'access_token' });
    await revoked.body?.cancel();
    if (!revoked.ok) { console.error('[delete-account] apple revoke', revoked.status); return 'failed'; }
    return 'revoked';
  } catch (err) {
    console.error('[delete-account] apple', err);
    return 'failed';
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'POST only' }), { status: 405, headers: cors });
  const auth = req.headers.get('Authorization') ?? '';
  const asUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
  const { data } = await asUser.auth.getUser();
  if (!data.user) return new Response(JSON.stringify({ error: 'Not signed in' }), { status: 401, headers: cors });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const me = data.user.id;
  // The only thing the app may send: Apple's one-time code, for an account made with Apple.
  const sent = await req.json().catch(() => null) as { appleCode?: unknown } | null;
  const appleCode = typeof sent?.appleCode === 'string' && sent.appleCode.length < 2000 ? sent.appleCode : '';
  const isApple = (data.user.identities ?? []).some((i) => i.provider === 'apple');

  // Files first: once the account row is gone there is nothing left to say
  // whose files these were, and they would sit there for good.
  const media = await emptyFolder(admin, 'media', me);
  const resumes = await emptyFolder(admin, 'coach-applications', me);
  // Even if one were left behind, nobody could open it: its message goes
  // with the account, and a chat photo only opens while its message is there.
  const chatPhotos = await removeChatPhotos(admin, me);

  // WHOOP is told first (CourtSide's access revoked, so its webhooks stop). The whoop function does it, refreshing the key if it must. Best effort.
  const { data: whoop } = await admin.from('whoop_tokens').select('user_id').eq('user_id', me).maybeSingle();
  if (whoop) {
    try {
      const stop = new AbortController();
      const timer = setTimeout(() => stop.abort(), 5000);
      await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/whoop/disconnect`, { method: 'POST', headers: { Authorization: auth, apikey: Deno.env.get('SUPABASE_ANON_KEY')!, 'content-type': 'application/json' }, body: '{}', signal: stop.signal }).then((r) => r.body?.cancel());
      clearTimeout(timer);
    } catch { /* the account still goes */ }
  }

  // Sign in with Apple: CourtSide's link is revoked at Apple too, before the account goes. Best effort.
  const apple = isApple && appleCode ? await revokeApple(appleCode) : isApple ? 'no code' : 'not apple';

  const { error } = await admin.auth.admin.deleteUser(me);
  if (error) {
    console.error('[delete-account]', error);
    return new Response(JSON.stringify({ error: 'Could not delete the account right now.' }), { status: 500, headers: cors });
  }
  console.log(`[delete-account] ${me}: ${media} media, ${resumes} résumé, ${chatPhotos} chat photo files, Apple: ${apple}`);
  return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, 'content-type': 'application/json' } });
});
