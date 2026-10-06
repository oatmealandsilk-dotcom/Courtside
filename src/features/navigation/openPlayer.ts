import { router } from 'expo-router';

import type { ID } from '@/data/types';
import { goToTab } from '@/features/navigation/startTab';

/**
 * A player's page, from their name, picture or an @mention. Your own is the
 * Profile tab: from a page opened over the tabs (Settings, a post, the
 * comments) this closes down to it (see goToTab), because pushing the tab's
 * address from up there built a second copy of the whole tab app on top of
 * the first. Anyone else's page opens on top, as before.
 */
export function openPlayer(userId: ID, currentUserId: ID | null | undefined) {
  if (userId === currentUserId) goToTab('/profile');
  else router.push(`/user/${userId}`);
}
