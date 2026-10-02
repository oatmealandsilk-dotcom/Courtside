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
// Deploy:  supabase functions deploy delete-account
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PAGE = 100;
/** No account holds this many files; the cap is only so a surprise cannot loop forever. */
const MAX_PAGES = 200;

/** Everything in one person's folder in one bucket. Returns how many files went. */
async function emptyFolder(admin: SupabaseClient, bucket: string, folder: string): Promise<number> {
  let removed = 0;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const { data, error } = await admin.storage.from(bucket).list(folder, { limit: PAGE });
    if (error) {
      console.error('[delete-account] list', bucket, error);
      return removed;
    }
    if (!data || data.length === 0) return removed;
    const { error: gone } = await admin.storage.from(bucket).remove(data.map((file) => `${folder}/${file.name}`));
    if (gone) {
      console.error('[delete-account] remove', bucket, gone);
      return removed;
    }
    removed += data.length;
    if (data.length < PAGE) return removed;
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'POST only' }), { status: 405, headers: cors });
  const auth = req.headers.get('Authorization') ?? '';
  const asUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
  const { data } = await asUser.auth.getUser();
  if (!data.user) return new Response(JSON.stringify({ error: 'Not signed in' }), { status: 401, headers: cors });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const me = data.user.id;

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

  const { error } = await admin.auth.admin.deleteUser(me);
  if (error) {
    console.error('[delete-account]', error);
    return new Response(JSON.stringify({ error: 'Could not delete the account right now.' }), { status: 500, headers: cors });
  }
  console.log(`[delete-account] ${me}: ${media} media, ${resumes} résumé, ${chatPhotos} chat photo files`);
  return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, 'content-type': 'application/json' } });
});
