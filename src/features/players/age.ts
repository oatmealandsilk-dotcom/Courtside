import type { User } from '@/data/types';
import { isSupabaseConfigured } from '@/lib/supabase';

/**
 * Not known to be an adult: a teen, or (with the database) an account with
 * no birthday given yet, the way the server's own rules read it
 * (open_conversation, migration 54). The demo has no ages on most of its
 * fixtures, so there only someone marked as a teen counts.
 */
export const notKnownAdult = (u: Pick<User, 'ageGroup'>) => (isSupabaseConfigured ? u.ageGroup !== 'adult' : u.ageGroup === 'teen');
