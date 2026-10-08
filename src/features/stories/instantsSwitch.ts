import { useEffect, useState } from 'react';

import { knownTennisFlags, tennisFlags } from '@/features/activity/flags';
import type { Notification } from '@/data/types';
import { useApp } from '@/store/AppContext';

/**
 * Whether Instants (the 24-hour photos from the five-second camera) are
 * shown at all.
 *
 * Held back for launch (owner, Oct 8: "Ship calories hide instants"; in 14
 * days 2 people posted 4 Instants, against 50 posts from 10). Nothing is
 * deleted: the Instants already posted, their likes and comments, and the
 * tables behind them all stay. They are only kept out of sight: the Instant
 * card in Create, the feed's Instant pages, the Instants half of Archive,
 * Instant notifications, the "Take an Instant" link after setup, and the
 * camera and viewer pages themselves (InstantsGate).
 *
 * The server decides, through the same switches as King of the Court
 * (my_flags(), migration 58): 'flag:instants' in server_settings, 'on',
 * 'admins' (admin accounts only, to try them) or 'off'. There is no such
 * key until one is added, and a missing key, or a server that can't be
 * asked, reads as hidden. To bring Instants back for everyone, with no app
 * update, in Supabase's SQL editor:
 *
 *   insert into public.server_settings (key, value) values ('flag:instants', 'on')
 *   on conflict (key) do update set value = excluded.value, updated_at = now();
 *
 * Builds that came before this switch (build 17, in App Review on its own
 * channel) never read it, so they keep showing Instants as they always did.
 *
 * The demo (no Supabase, or a demo account) keeps them hidden, the way the
 * app will be at launch.
 */

/** True once the server says Instants are on, false while they are hidden, undefined while asking. */
export function useInstantsOn(): boolean | undefined {
  const { currentUserId } = useApp();
  const [on, setOn] = useState<boolean | undefined>(() => knownTennisFlags(currentUserId)?.instants);
  useEffect(() => {
    let current = true;
    setOn(knownTennisFlags(currentUserId)?.instants);
    void tennisFlags(currentUserId).then((f) => { if (current) setOn(f.instants); });
    return () => { current = false; };
  }, [currentUserId]);
  return on;
}

/** The notifications to show: without the ones about an Instant while Instants are hidden (or not known to be on yet). */
export function withoutInstantRows<T extends Pick<Notification, 'targetKind'>>(rows: T[], instantsOn: boolean | undefined): T[] {
  return instantsOn === true ? rows : rows.filter((n) => n.targetKind !== 'hit');
}
