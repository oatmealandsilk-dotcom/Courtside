// Deletes the signed-in account, for good.
//
// Only the service role may delete an auth user, so this runs server-side.
// It checks the caller's own token first, so nobody can delete anyone else.
// Profile, posts, follows and the rest go with it through ON DELETE CASCADE.
//
// Deploy:  supabase functions deploy delete-account
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'POST only' }), { status: 405, headers: cors });
  const auth = req.headers.get('Authorization') ?? '';
  const asUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
  const { data } = await asUser.auth.getUser();
  if (!data.user) return new Response(JSON.stringify({ error: 'Not signed in' }), { status: 401, headers: cors });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { error } = await admin.auth.admin.deleteUser(data.user.id);
  if (error) {
    console.error('[delete-account]', error);
    return new Response(JSON.stringify({ error: 'Could not delete the account right now.' }), { status: 500, headers: cors });
  }
  return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, 'content-type': 'application/json' } });
});
