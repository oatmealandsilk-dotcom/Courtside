import React, { useEffect } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { CourtSpinner } from '@/components/CourtSpinner';
import { rememberReferrer, takeInviteCourt } from '@/features/invite/referral';
import { courtHref } from '@/features/players/courtLink';
import { useApp } from '@/store/AppContext';
import { colors } from '@/theme';

/**
 * Where an invite link lands. The handle on it (and the court, when the
 * link carries one) is remembered, then the person is sent to make an
 * account (or, already signed in, straight into the app: on that court's
 * page, else its start page — the store claims the invite the moment there
 * is an account to claim it, and Find Players opens the court after sign-up).
 */
export default function Join() {
  const { ref, court, name, lat, lng } = useLocalSearchParams<{ ref?: string; court?: string; name?: string; lat?: string; lng?: string }>();
  const { currentUserId, authResolved, actions } = useApp();
  useEffect(() => {
    // A saved login is still being read: wait for it, or a signed-in visitor
    // is sent to "Create your account" for a moment, then bounced home, and
    // the invite (and its court) is never opened for them.
    if (!authResolved) return undefined;
    let live = true;
    // The court a link can carry ("my court"): kept with the handle, opened once the person is in.
    const place = court && name && lat && lng ? { id: String(court), name: String(name), lat: Number(lat), lng: Number(lng) } : null;
    (async () => {
      if (ref) await rememberReferrer(String(ref), place);
      if (!live) return;
      if (currentUserId) {
        await actions.claimPendingReferral();
        const there = await takeInviteCourt();
        if (there) router.replace(courtHref(there)); else router.replace('/');
      }
      else router.replace({ pathname: '/sign-in', params: { mode: 'create' } });
    })();
    return () => { live = false; };
  }, [ref, court, name, lat, lng, currentUserId, authResolved, actions]);
  return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}><CourtSpinner size={32} /></View>;
}
