import { useEffect, useRef } from 'react';
import { router } from 'expo-router';

import { goToStart, isStartTab } from '@/features/navigation/startTab';
import { goHome } from '@/lib/goBack';
import { peekShareTarget, takeShareTarget } from '@/features/invite/referral';
import { ageUnknown } from '@/features/players/age';
import { isSupabaseConfigured } from '@/lib/supabase';
import { show as showToast } from '@/lib/toast';
import { useApp } from '@/store/AppContext';

/**
 * Someone who opened a shared link before they had an account lands back on
 * that same thing once they are in: the first time the app reaches its start
 * page after sign-up and setup (or after signing in), the page they were
 * looking at opens over it. "I'm in" tapped on an open hit before signing up
 * (on a shared hit, or on the peek) joins the hit here too, so they arrive
 * already in it.
 *
 * When the join can't go through, it says why, honestly (owner, Oct 17:
 * "Build the peek"): the hit's page is open underneath either way, so they
 * see it and what they can do. A new account with no birthday has the
 * under-18 protections, which only play with people who follow each other
 * (join_hit, migration 124), so it is not asked for and fails: the words say
 * that adding a birthday opens it up, with a button straight to it. A
 * known teen is told plainly that hits with players they don't know are for
 * 18 and over, and pointed at hits with friends, never at asking the host.
 */
export function useShareLanding({ pathname, held }: { pathname: string; held: boolean }) {
  const { currentUserId, currentUser, onboardingComplete, remoteLoaded, actions } = useApp();
  const busy = useRef(false);
  const ready = !!currentUserId && onboardingComplete && (remoteLoaded || !isSupabaseConfigured) && !held && isStartTab(pathname);
  const noBirthday = ageUnknown(currentUser);
  useEffect(() => {
    if (!ready || busy.current || !peekShareTarget()) return;
    busy.current = true;
    void (async () => {
      try {
        const target = await takeShareTarget();
        if (!target) return;
        // A guest who signed up from one of the tabs (guest mode, Oct 17) goes back to that tab;
        // anything else opens over the start page.
        const tab = target.href.split('?')[0];
        if (tab === '/' || tab === '/index') goHome();
        else if (['/discuss', '/coaches', '/profile'].includes(tab)) router.navigate(tab as never);
        else router.push(target.href as never);
        if (!target.joinHit) return;
        const host = target.host || 'the host';
        const needBirthday = () => showToast({
          title: 'Add your birthday to join',
          body: `Hits with players you don’t follow yet are for players 18 and over. Add your birthday, then tap I’m in on ${host}’s hit.`,
          icon: 'gift-outline',
          action: { label: 'Add birthday', onPress: () => router.push('/birthday?from=settings') },
        });
        if (noBirthday) { needBirthday(); return; }
        const result = await actions.joinHit(target.joinHit);
        if (!result.error) { showToast({ title: "You're in", body: 'Say hi in the hit’s chat.', icon: 'hit' }); return; }
        if (result.reason === 'age') {
          if (ageUnknown(currentUser)) needBirthday();
          // A known teen (review, Oct 17): never told to get a stranger to
          // follow them back, the one step the under-18 protection rests on.
          // Friends who already follow each other is the honest way in.
          else showToast({
            title: 'This hit is for players 18 and over',
            body: 'Hits with players you don’t know yet are for players 18 and over. You can join hits with friends who follow you back.',
            icon: 'alert-circle-outline',
            action: { label: 'Find hits', onPress: goToStart },
          });
          return;
        }
        showToast({ title: "Couldn't join the hit", body: `${result.error} Find another one nearby.`, icon: 'alert-circle-outline' });
      } finally {
        busy.current = false;
      }
    })();
  }, [ready, actions, noBirthday, currentUser]);
}
