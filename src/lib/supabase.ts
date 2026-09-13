import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_KEY;

/**
 * The Supabase client, or null when the project is not configured — in which
 * case the app runs entirely on its fixtures, exactly as it did before.
 *
 * Sessions persist in AsyncStorage on the phone and localStorage on the web.
 * Token refresh only runs on the web: on native it needs an AppState hook,
 * which src/store/AppContext.tsx wires up.
 */
export const supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, {
        auth: {
          storage: Platform.OS === 'web' ? undefined : AsyncStorage,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: Platform.OS === 'web',
        },
      })
    : null;

export const isSupabaseConfigured = supabase !== null;
