import { isSupabaseConfigured } from '@/lib/supabase';
import { useApp } from '@/store/AppContext';

/**
 * True while the account's data is still on its way (a link opened cold, a
 * reload in the browser). A page that finds nothing should wait for this to
 * turn false before saying "not found", or it says so about things that are
 * simply not loaded yet.
 */
export function useStillLoading(): boolean {
  const { ready, remoteLoaded, currentUserId } = useApp();
  if (!ready) return true;
  return isSupabaseConfigured && !!currentUserId && !remoteLoaded;
}
